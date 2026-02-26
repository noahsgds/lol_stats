import { useEffect, useRef, useState, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import { D_VER, toFixed, toWR, fmtK, getChampKey, computeChampStats, API_BASE } from '../lib/utils.js';
import { getChampIdMap, champIconUrl, getQueueLabel } from '../lib/ddragon.js';

// ─── LIVE GAME SECTION ────────────────────────────────────

function useLiveGame(summonerId, riotId) {
    const [liveData, setLiveData] = useState(null); // null = loading, false = not in game
    const [liveError, setLiveError] = useState(null);
    const [champMap, setChampMap] = useState(null);

    const fetchLive = useCallback(async () => {
        try {
            const param = summonerId
                ? `summonerId=${encodeURIComponent(summonerId)}`
                : `riotId=${encodeURIComponent(riotId)}`;
            const res = await fetch(`${API_BASE}/live?${param}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setLiveData(data.inGame ? data : false);
        } catch (e) {
            setLiveError(e.message);
            setLiveData(false);
        }
    }, [summonerId, riotId]);

    useEffect(() => {
        getChampIdMap().then(setChampMap).catch(() => {});
        fetchLive();
        const interval = setInterval(fetchLive, 30_000);
        return () => clearInterval(interval);
    }, [fetchLive]);

    return { liveData, liveError, champMap };
}

function LiveTicker({ startedAt, initialLength }) {
    const [elapsed, setElapsed] = useState(initialLength);
    useEffect(() => {
        const base = Date.now() - (initialLength * 1000);
        const t = setInterval(() => {
            setElapsed(Math.floor((Date.now() - base) / 1000));
        }, 1000);
        return () => clearInterval(t);
    }, [initialLength]);

    const m = Math.floor(elapsed / 60);
    const s = String(elapsed % 60).padStart(2, '0');
    return <span>{m}:{s}</span>;
}

function LiveGameSection({ summonerId, riotId, cssColor }) {
    const { liveData, liveError, champMap } = useLiveGame(summonerId, riotId);

    if (liveData === null) {
        return (
            <div className="db-section" style={{ borderTop: '2px solid var(--gold)' }}>
                <div className="db-section-title">Partie en cours</div>
                <div style={{ color: 'var(--text-dim)', fontSize: '12px' }}>Vérification…</div>
            </div>
        );
    }

    if (!liveData) {
        return (
            <div className="db-section" style={{ borderTop: '2px solid var(--border-hi)' }}>
                <div className="db-section-title" style={{ color: 'var(--text-dim)' }}>Partie en cours</div>
                <div style={{ color: 'var(--text-dim)', fontSize: '12px', fontFamily: "'JetBrains Mono',monospace" }}>
                    {liveError ? `Erreur : ${liveError}` : 'Pas en partie actuellement'}
                </div>
            </div>
        );
    }

    const team1 = liveData.participants?.filter(p => p.teamId === 100) || [];
    const team2 = liveData.participants?.filter(p => p.teamId === 200) || [];
    const bans1 = liveData.bannedChampions?.filter(b => b.teamId === 100) || [];
    const bans2 = liveData.bannedChampions?.filter(b => b.teamId === 200) || [];

    const champImg = (id) => {
        const key = champMap?.[id];
        return key ? champIconUrl(key) : `https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/profileicon/29.png`;
    };

    return (
        <div className="db-section" style={{ borderTop: `2px solid ${cssColor}` }}>
            <div className="db-section-title" style={{ color: cssColor }}>
                <span style={{
                    display: 'inline-block', width: '8px', height: '8px',
                    borderRadius: '50%', background: 'var(--loss)',
                    marginRight: '8px',
                    animation: 'livePulse 1.2s ease-in-out infinite',
                }} />
                En partie — {getQueueLabel(liveData.gameQueueConfigId)}
                <span style={{ marginLeft: '12px', fontFamily: "'JetBrains Mono',monospace", fontWeight: 400, color: 'var(--text-mid)' }}>
                    ⏱ <LiveTicker initialLength={liveData.gameLength || 0} />
                </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {[{ players: team1, bans: bans1, label: 'Équipe Bleue', color: '#4ade80' },
                  { players: team2, bans: bans2, label: 'Équipe Rouge', color: '#f87171' }].map(team => (
                    <div key={team.label}>
                        <div style={{ fontSize: '9px', fontWeight: 800, color: team.color, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                            {team.label}
                        </div>
                        {team.players.map((p, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                <img
                                    src={champImg(p.championId)}
                                    alt=""
                                    style={{ width: '28px', height: '28px', borderRadius: '4px', border: '1px solid var(--border-hi)', flexShrink: 0 }}
                                    onError={e => { e.target.style.opacity = '.3'; }}
                                />
                                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {p.summonerName || p.puuid?.slice(0, 8) + '…'}
                                </span>
                            </div>
                        ))}
                        {team.bans.length > 0 && (
                            <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '9px', color: 'var(--text-dim)', alignSelf: 'center' }}>Bans :</span>
                                {team.bans.map((b, i) => b.championId !== -1 && (
                                    <img key={i} src={champImg(b.championId)} alt="" style={{ width: '18px', height: '18px', borderRadius: '3px', opacity: 0.6, filter: 'grayscale(1)' }} />
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────

export default function PlayerDashboard({ data, pid, onClose }) {
    const isP2     = pid === 'p2';
    const color    = isP2 ? '#e84d00' : '#f0a500';
    const cssColor = isP2 ? 'var(--p2)' : 'var(--p1)';

    const { rank: r, global: g, history: h, rawTag } = data;
    const name    = (r.riot_id || rawTag || '').split('#')[0];
    const tier    = r.solo_tier || 'UNRANKED';
    const rankTxt = tier === 'UNRANKED'
        ? 'Non classé'
        : `${tier} ${r.solo_rank || ''} · ${r.solo_lp ?? '?'} LP`;

    const wr    = toWR(g.win_rate);
    const total = parseInt(g.total_games) || 0;

    const champs  = computeChampStats(h);
    const last20  = (h || []).slice(0, 20).reverse();
    let wins20 = 0;
    const trendData = last20.map((m, i) => {
        if (m.win) wins20++;
        return parseFloat(((wins20 / (i + 1)) * 100).toFixed(1));
    });

    const lineData = {
        labels: last20.map((_, i) => `G${i + 1}`),
        datasets: [{
            label: 'Win Rate', data: trendData,
            borderColor: color,
            backgroundColor: isP2 ? 'rgba(232,77,0,0.08)' : 'rgba(240,165,0,0.08)',
            borderWidth: 2, pointRadius: 3, pointBackgroundColor: color,
            tension: 0.4, fill: true,
        }],
    };
    const lineOpts = {
        maintainAspectRatio: false,
        scales: {
            x: { ticks: { color: '#4a4232', font: { size: 9 } }, grid: { color: 'rgba(42,36,22,0.5)' } },
            y: { min: 0, max: 100, ticks: { color: '#4a4232', font: { size: 9 }, callback: v => v + '%' }, grid: { color: 'rgba(42,36,22,0.5)' } },
        },
        plugins: { legend: { display: false }, datalabels: { display: false } },
    };

    // Métriques avancées calculées depuis l'historique
    const advancedStats = (() => {
        if (!h?.length) return null;
        const winGames = h.filter(m => m.win);
        const lossGames = h.filter(m => !m.win);
        const avgCsMin = h.reduce((acc, m) => acc + (m.cs || 0) / Math.max((m.game_duration || 1) / 60, 1), 0) / h.length;
        const avgDmgMin = h.reduce((acc, m) => acc + (m.total_damage || 0) / Math.max((m.game_duration || 1) / 60, 1), 0) / h.length;
        const pentaCount = h.filter(m => (m.kills || 0) >= 5 && (m.deaths || 0) === 0).length;
        const avgVisionWin  = winGames.length  ? winGames.reduce((a, m)  => a + (m.vision_score || 0), 0) / winGames.length  : 0;
        const avgVisionLoss = lossGames.length ? lossGames.reduce((a, m) => a + (m.vision_score || 0), 0) / lossGames.length : 0;
        return { avgCsMin, avgDmgMin, pentaCount, avgVisionWin, avgVisionLoss };
    })();

    useEffect(() => {
        const handler = e => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handler);
            document.body.style.overflow = '';
        };
    }, [onClose]);

    const overviewStats = [
        { lbl: 'Parties',    val: total },
        { lbl: 'Win Rate',   val: wr + '%',             big: true, col: cssColor },
        { lbl: 'KDA',        val: toFixed(g.kda, 2) + ':1', big: true, col: cssColor },
        { lbl: 'Dmg moyen',  val: fmtK(Math.round(g.avg_damage || 0)) },
        { lbl: 'CS moyen',   val: Math.round(g.avg_cs || 0) },
        { lbl: 'Vision moy.',val: toFixed(g.avg_vision, 1) },
    ];

    return (
        <>
            <style>{`
                @keyframes livePulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.4; transform: scale(0.8); }
                }
            `}</style>

            <div className="db-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
                <div className="db-panel">
                    {/* Header */}
                    <div className="db-header">
                        <button className="db-back" onClick={onClose}>← Retour</button>
                        <img
                            className="db-avatar"
                            src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/profileicon/${r.profile_icon_id || 29}.png`}
                            onError={e => { e.target.style.opacity = '.3'; }}
                            alt=""
                        />
                        <div>
                            <div className="db-name" style={{ color: cssColor }}>{name}</div>
                            <div className="db-rank-sub">{rankTxt}</div>
                        </div>
                    </div>

                    {/* Overview */}
                    <div className="db-overview">
                        {overviewStats.map(s => (
                            <div key={s.lbl} className="db-stat-card">
                                <div className={`db-stat-val${s.big ? ' big' : ''}`} style={{ color: s.col || 'var(--text)' }}>
                                    {s.val}
                                </div>
                                <div className="db-stat-lbl">{s.lbl}</div>
                            </div>
                        ))}
                    </div>

                    {/* Métriques avancées */}
                    {advancedStats && (
                        <div className="db-section">
                            <div className="db-section-title">Métriques avancées</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                                {[
                                    { lbl: 'CS / min',    val: advancedStats.avgCsMin.toFixed(1) },
                                    { lbl: 'Dmg / min',   val: fmtK(Math.round(advancedStats.avgDmgMin)) },
                                    { lbl: 'Vision (V)',  val: advancedStats.avgVisionWin.toFixed(1), sub: 'moy. victoires' },
                                    { lbl: 'Vision (D)',  val: advancedStats.avgVisionLoss.toFixed(1), sub: 'moy. défaites' },
                                ].map(s => (
                                    <div key={s.lbl} className="db-stat-card">
                                        <div className="db-stat-val" style={{ color: cssColor }}>{s.val}</div>
                                        <div className="db-stat-lbl">{s.lbl}</div>
                                        {s.sub && <div style={{ fontSize: '8px', color: 'var(--text-dim)', marginTop: '2px' }}>{s.sub}</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Partie en cours */}
                    <LiveGameSection
                        summonerId={r.summoner_id}
                        riotId={rawTag}
                        cssColor={cssColor}
                    />

                    {/* Champion pool */}
                    <div className="db-section">
                        <div className="db-section-title">Champion Pool</div>
                        <table className="db-champ-table">
                            <thead>
                                <tr>
                                    <th></th>
                                    <th>Champion</th>
                                    <th>P</th>
                                    <th>WR%</th>
                                    <th>KDA</th>
                                    <th>K/D/A</th>
                                    <th>CS/min</th>
                                    <th>Dmg moy.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {champs.length > 0 ? champs.map(c => {
                                    const wrColor = c.wr >= 55 ? 'var(--win)' : c.wr <= 45 ? 'var(--loss)' : 'var(--text)';
                                    return (
                                        <tr key={c.name}>
                                            <td>
                                                <img
                                                    className="db-champ-icon"
                                                    src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/champion/${getChampKey(c.name)}.png`}
                                                    onError={e => { e.target.style.opacity = '.2'; }}
                                                    alt={c.name}
                                                    title={c.name}
                                                />
                                            </td>
                                            <td className="db-champ-name">{c.name}</td>
                                            <td>{c.games}</td>
                                            <td style={{ color: wrColor, fontWeight: 800 }}>{c.wr}%</td>
                                            <td style={{ color: cssColor }}>{c.kda}</td>
                                            <td style={{ color: 'var(--text-mid)', fontSize: '11px' }}>
                                                <span style={{ color: 'var(--win)' }}>{c.avgK}</span>
                                                <span style={{ color: 'var(--text-dim)' }}>/</span>
                                                <span style={{ color: 'var(--loss)' }}>{c.avgD}</span>
                                                <span style={{ color: 'var(--text-dim)' }}>/</span>
                                                <span>{c.avgA}</span>
                                            </td>
                                            <td>{c.avgCsMin}</td>
                                            <td>{fmtK(c.avgDmg)}</td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={8} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-dim)' }}>
                                            Aucune donnée
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Trend chart */}
                    <div className="db-section">
                        <div className="db-section-title">Forme récente — {last20.length} derniers matchs</div>
                        <div className="db-chart-wrap">
                            <Line data={lineData} options={lineOpts} />
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
