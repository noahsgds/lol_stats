import { useState } from 'react';
import { API_BASE } from '../lib/utils.js';

/* ─── Bracket builder ─────────────────────────────────────── */
function buildRounds(teams) {
    let size = 2;
    while (size < teams.length) size *= 2;
    const seeded = [...teams];
    while (seeded.length < size) seeded.push(null);

    const rounds = [];
    let prev = seeded;
    while (prev.length > 1) {
        const matches = [];
        for (let i = 0; i < prev.length; i += 2) {
            const t1 = prev[i], t2 = prev[i + 1];
            const winner = (t1 && !t2) ? t1 : (!t1 && t2) ? t2 : null;
            matches.push({ id: `${rounds.length}-${i / 2}`, team1: t1, team2: t2, winner, codes: [] });
        }
        rounds.push(matches);
        prev = matches.map(m => m.winner);
    }
    return rounds;
}

function getRoundName(ri, total) {
    const from = total - ri;
    if (from === 1) return 'Finale';
    if (from === 2) return 'Demi-finales';
    if (from === 3) return 'Quarts de finale';
    return `Tour ${ri + 1}`;
}

function propagateWinner(rounds, roundIdx, matchIdx, team) {
    const next = rounds.map(r => r.map(m => ({ ...m })));
    next[roundIdx][matchIdx].winner = team;
    if (roundIdx + 1 < next.length) {
        const nm = Math.floor(matchIdx / 2);
        const isFirst = matchIdx % 2 === 0;
        const nx = next[roundIdx + 1][nm];
        if (isFirst) nx.team1 = team; else nx.team2 = team;
        nx.winner = (nx.team1 && !nx.team2) ? nx.team1 : (!nx.team1 && nx.team2) ? nx.team2 : null;
    }
    return next;
}

/* ─── Team slot ────────────────────────────────────────────── */
function TeamSlot({ team, isWinner, isBye, canClick, onClick }) {
    return (
        <div
            onClick={canClick ? onClick : undefined}
            className={`t-slot${isWinner ? ' t-slot-win' : ''}${canClick ? ' t-slot-click' : ''}${!team ? ' t-slot-empty' : ''}`}
        >
            {isWinner && <span className="t-win-check">✓</span>}
            <span className="t-slot-name">
                {team ? team.name : isBye ? '—' : 'TBD'}
            </span>
        </div>
    );
}

/* ─── Match card ───────────────────────────────────────────── */
function MatchCard({ match, format, roundIdx, matchIdx, codeKey, codesByMatch, onGenCodes, onSetWinner, codeLoading }) {
    const { team1, team2, winner } = match;
    const codes = codesByMatch[codeKey] || [];
    const isBye = (team1 && !team2) || (!team1 && team2);
    const canVote = !winner && team1 && team2;
    const gpp = format === 'BO5' ? 5 : format === 'BO3' ? 3 : 1;

    return (
        <div className="t-match-card">
            <TeamSlot team={team1} isWinner={winner?.name === team1?.name} isBye={!team1} canClick={canVote} onClick={() => onSetWinner(team1)} />
            <div className="t-vs-row">
                <span className="t-vs-text">vs</span>
                {canVote && codes.length === 0 && (
                    <button
                        className="t-code-btn"
                        disabled={codeLoading}
                        onClick={() => onGenCodes(roundIdx, matchIdx, codeKey)}
                    >
                        {codeLoading ? '…' : `⚡ Code${gpp > 1 ? ` ×${gpp}` : ''}`}
                    </button>
                )}
            </div>
            <TeamSlot team={team2} isWinner={winner?.name === team2?.name} isBye={!team2} canClick={canVote} onClick={() => onSetWinner(team2)} />

            {codes.length > 0 && (
                <div className="t-codes-list">
                    {codes.map((c, i) => (
                        <div key={i} className="t-code-row">
                            <span className="t-code-text">
                                {gpp > 1 && <span className="t-code-game">G{i + 1} </span>}
                                {c}
                            </span>
                            <button className="t-copy-btn" onClick={() => navigator.clipboard?.writeText(c)} title="Copier">📋</button>
                        </div>
                    ))}
                </div>
            )}

            {winner && !isBye && (
                <div className="t-winner-tag">✓ {winner.name}</div>
            )}
        </div>
    );
}

/* ─── Main component ───────────────────────────────────────── */
export default function TournamentTab() {
    const [phase, setPhase] = useState('setup');
    const [tName, setTName] = useState('Mon Tournoi');
    const [format, setFormat] = useState('BO1');
    const [teams, setTeams] = useState([
        { name: 'Équipe 1', players: [] },
        { name: 'Équipe 2', players: [] },
    ]);
    const [rounds, setRounds] = useState([]);
    const [codesByMatch, setCodesByMatch] = useState({});
    const [codeLoading, setCodeLoading] = useState(false);
    const [error, setError] = useState(null);

    /* Setup helpers */
    const addTeam = () => setTeams(t => [...t, { name: `Équipe ${t.length + 1}`, players: [] }]);
    const removeTeam = i => setTeams(t => t.filter((_, j) => j !== i));
    const updateName = (i, v) => setTeams(t => t.map((x, j) => j === i ? { ...x, name: v } : x));

    const addPlayer = i => {
        const tag = window.prompt('Riot ID du joueur (Pseudo#TAG)');
        if (!tag?.includes('#')) return;
        setTeams(t => t.map((x, j) => j === i ? { ...x, players: [...x.players, tag.trim()] } : x));
    };
    const removePlayer = (ti, pi) => {
        setTeams(t => t.map((x, j) => j === ti ? { ...x, players: x.players.filter((_, k) => k !== pi) } : x));
    };

    const generateBracket = () => {
        const valid = teams.filter(t => t.name.trim());
        if (valid.length < 2) return;
        setRounds(buildRounds(valid));
        setCodesByMatch({});
        setPhase('bracket');
    };

    /* Code generation */
    const handleGenCodes = async (roundIdx, matchIdx, key) => {
        setCodeLoading(true);
        setError(null);
        try {
            const match = rounds[roundIdx][matchIdx];
            const label = `${tName} — ${getRoundName(roundIdx, rounds.length)} M${matchIdx + 1}`;
            const res = await fetch(`${API_BASE}/tournament/codes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label, format }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setCodesByMatch(prev => ({ ...prev, [key]: data.codes || [] }));
        } catch (e) {
            setError(e.message);
        } finally {
            setCodeLoading(false);
        }
    };

    /* Winner selection */
    const handleSetWinner = (roundIdx, matchIdx, team) => {
        setRounds(prev => propagateWinner(prev, roundIdx, matchIdx, team));
    };

    const champion = rounds.length > 0 ? rounds[rounds.length - 1]?.[0]?.winner : null;

    /* ── Setup phase ── */
    if (phase === 'setup') return (
        <div className="t-setup-wrap">
            <div className="card t-setup-card">
                <div className="card-head"><div className="ch-bar ch-gold" />Créer un tournoi</div>
                <div className="t-setup-body">

                    {/* Name + Format */}
                    <div className="t-row">
                        <div style={{ flex: 1 }}>
                            <div className="t-label">Nom du tournoi</div>
                            <input
                                className="t-input"
                                value={tName}
                                onChange={e => setTName(e.target.value)}
                                placeholder="Mon Tournoi"
                            />
                        </div>
                        <div>
                            <div className="t-label">Format</div>
                            <div style={{ display: 'flex', gap: 4 }}>
                                {['BO1', 'BO3', 'BO5'].map(f => (
                                    <button
                                        key={f}
                                        className={`t-format-btn${format === f ? ' active' : ''}`}
                                        onClick={() => setFormat(f)}
                                    >{f}</button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Teams */}
                    <div className="t-label" style={{ marginTop: 8 }}>Équipes ({teams.length})</div>
                    <div className="t-teams-list">
                        {teams.map((team, i) => (
                            <div key={i} className="t-team-row">
                                <span className="t-team-num">#{i + 1}</span>
                                <input
                                    className="t-input t-team-name-input"
                                    value={team.name}
                                    onChange={e => updateName(i, e.target.value)}
                                />
                                <div className="t-players">
                                    {team.players.map((p, pi) => (
                                        <span key={pi} className="t-player-chip">
                                            {p}
                                            <span className="t-chip-del" onClick={() => removePlayer(i, pi)}>×</span>
                                        </span>
                                    ))}
                                    <button className="t-add-player-btn" onClick={() => addPlayer(i)}>+ Joueur</button>
                                </div>
                                {teams.length > 2 && (
                                    <button className="t-del-team-btn" onClick={() => removeTeam(i)}>✕</button>
                                )}
                            </div>
                        ))}
                        {teams.length < 8 && (
                            <button className="t-add-team-btn" onClick={addTeam}>+ Ajouter une équipe</button>
                        )}
                    </div>

                    <button
                        className="btn-go"
                        style={{ width: '100%', marginTop: 8 }}
                        disabled={teams.filter(t => t.name.trim()).length < 2}
                        onClick={generateBracket}
                    >
                        Générer le bracket →
                    </button>
                </div>
            </div>
        </div>
    );

    /* ── Bracket phase ── */
    return (
        <div className="t-bracket-wrap">
            {/* Header */}
            <div className="t-bracket-header">
                <div>
                    <div className="t-bracket-title">{tName}</div>
                    <div className="t-bracket-sub">{format} · {teams.filter(t => t.name).length} équipes · Élimination directe</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {champion && (
                        <div className="t-champion-badge">🏆 {champion.name}</div>
                    )}
                    <button
                        className="t-back-btn"
                        onClick={() => { setPhase('setup'); setRounds([]); setCodesByMatch({}); setError(null); }}
                    >
                        ← Modifier
                    </button>
                </div>
            </div>

            {error && (
                <div className="t-error">
                    ⚠️ {error}
                    {error.includes('tournament') || error.includes('403') ? ' — Vérifiez que votre clé Riot autorise le Tournament Stub API.' : ''}
                </div>
            )}

            {/* Bracket */}
            <div className="t-bracket-scroll">
                {rounds.map((matches, ri) => (
                    <div key={ri} className="t-round-col">
                        <div className="t-round-label">{getRoundName(ri, rounds.length)}</div>
                        <div className="t-round-matches" style={{ '--match-count': matches.length }}>
                            {matches.map((match, mi) => {
                                const key = `${ri}-${mi}`;
                                return (
                                    <MatchCard
                                        key={key}
                                        match={match}
                                        format={format}
                                        roundIdx={ri}
                                        matchIdx={mi}
                                        codeKey={key}
                                        codesByMatch={codesByMatch}
                                        codeLoading={codeLoading}
                                        onGenCodes={handleGenCodes}
                                        onSetWinner={team => handleSetWinner(ri, mi, team)}
                                    />
                                );
                            })}
                        </div>
                    </div>
                ))}

                {/* Champion slot */}
                <div className="t-round-col">
                    <div className="t-round-label">Champion</div>
                    <div className="t-round-matches" style={{ '--match-count': 1 }}>
                        <div className={`t-champion-slot${champion ? ' t-champion-slot-win' : ''}`}>
                            {champion ? (
                                <><div style={{ fontSize: 28, marginBottom: 6 }}>🏆</div>
                                    <div className="t-champ-name">{champion.name}</div></>
                            ) : (
                                <span className="t-champ-tbd">—</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
