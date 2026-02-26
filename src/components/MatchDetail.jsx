import { useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';
import '../lib/chartSetup.js';
import { D_VER, getChampKey, getQ, fmtK, timeAgo } from '../lib/utils.js';
import { API_BASE } from '../lib/utils.js';

/* ─── Constants ──────────────────────────────────────────── */
const SPELL_KEYS = {
    1: 'SummonerBoost', 3: 'SummonerExhaust', 4: 'SummonerFlash',
    6: 'SummonerHaste', 7: 'SummonerHeal', 11: 'SummonerSmite',
    12: 'SummonerTeleport', 13: 'SummonerMana', 14: 'SummonerDot',
    21: 'SummonerBarrier', 32: 'SummonerSnowball',
};

const POS_ORDER = { TOP: 0, JUNGLE: 1, MIDDLE: 2, BOTTOM: 3, UTILITY: 4 };
const POS_LABEL = { TOP: 'TOP', JUNGLE: 'JGL', MIDDLE: 'MID', BOTTOM: 'BOT', UTILITY: 'SUP' };

const CHART_METRICS = [
    { key: 'totalDamageDealtToChampions', label: 'Dégâts infligés', fmt: v => fmtK(v), color100: 'rgba(240,165,0,0.72)', color200: 'rgba(232,77,0,0.72)' },
    { key: 'totalDamageTaken',             label: 'Dégâts reçus',   fmt: v => fmtK(v), color100: 'rgba(240,165,0,0.72)', color200: 'rgba(232,77,0,0.72)' },
    { key: 'goldEarned',                   label: 'Gold gagné',     fmt: v => fmtK(v), color100: 'rgba(251,191,36,0.72)', color200: 'rgba(251,191,36,0.72)' },
    { key: 'visionScore',                  label: 'Vision Score',   fmt: v => v,       color100: 'rgba(167,139,250,0.72)', color200: 'rgba(167,139,250,0.72)' },
];

/* ─── Helpers ────────────────────────────────────────────── */
function sortParticipants(list) {
    return [...list].sort((a, b) =>
        (POS_ORDER[a.individualPosition] ?? POS_ORDER[a.teamPosition] ?? 5) -
        (POS_ORDER[b.individualPosition] ?? POS_ORDER[b.teamPosition] ?? 5)
    );
}

function kp(p, teamKills) {
    return teamKills > 0 ? Math.round(((p.kills + p.assists) / teamKills) * 100) : 0;
}

function spellUrl(id) {
    const k = SPELL_KEYS[id];
    return k ? `https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/spell/${k}.png` : null;
}

/* ─── Main modal ─────────────────────────────────────────── */
export default function MatchDetailModal({ matchId, trackedTag, onClose }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!matchId) return;
        setLoading(true); setError(null); setData(null);
        fetch(`${API_BASE}/match/${encodeURIComponent(matchId)}`)
            .then(r => r.json())
            .then(d => { if (d.error) throw new Error(d.error); setData(d); setLoading(false); })
            .catch(e => { setError(e.message); setLoading(false); });
    }, [matchId]);

    useEffect(() => {
        const h = e => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onClose]);

    return (
        <div className="md-overlay no-print" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="md-panel">
                <button className="md-close-btn" onClick={onClose}>✕</button>
                {loading && (
                    <div className="md-loading">
                        <div className="sync-spinner" />
                        <span>Chargement du match…</span>
                    </div>
                )}
                {error && <div className="md-error">⚠️ {error}<br /><span style={{ fontSize: '11px', opacity: 0.7 }}>match_id: {matchId}</span></div>}
                {data && <MatchContent info={data.info} trackedTag={trackedTag} matchId={matchId} />}
            </div>
        </div>
    );
}

/* ─── Match content ──────────────────────────────────────── */
function MatchContent({ info, trackedTag, matchId }) {
    const [chartMetricIdx, setChartMetricIdx] = useState(0);

    const participants = info?.participants || [];
    const teams = info?.teams || [];
    const team100 = teams.find(t => t.teamId === 100) || {};
    const team200 = teams.find(t => t.teamId === 200) || {};

    const blue = sortParticipants(participants.filter(p => p.teamId === 100));
    const red  = sortParticipants(participants.filter(p => p.teamId === 200));

    const blueKills = blue.reduce((a, p) => a + (p.kills || 0), 0);
    const redKills  = red.reduce((a, p)  => a + (p.kills || 0), 0);

    const maxDmg = Math.max(...participants.map(p => p.totalDamageDealtToChampions || 0), 1);

    const durSec = info?.gameDuration || 0;
    const min = Math.floor(durSec / 60);
    const sec = String(durSec % 60).padStart(2, '0');

    const trackedName = trackedTag?.split('#')[0]?.toLowerCase();
    const isTracked = p => trackedName && (p.riotIdGameName?.toLowerCase() === trackedName);

    /* Chart data */
    const cm = CHART_METRICS[chartMetricIdx];
    const chartData = {
        labels: [...blue.map(p => p.riotIdGameName || p.championName), ...red.map(p => p.riotIdGameName || p.championName)],
        datasets: [{
            data: [...blue.map(p => p[cm.key] || 0), ...red.map(p => p[cm.key] || 0)],
            backgroundColor: [...blue.map(() => cm.color100), ...red.map(() => cm.color200)],
            borderColor: [...blue.map(() => cm.color100.replace('0.72', '1')), ...red.map(() => cm.color200.replace('0.72', '1'))],
            borderWidth: 1,
            borderRadius: 3,
        }],
    };
    const chartOpts = {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ` ${cm.fmt(ctx.raw)}` } },
            datalabels: {
                anchor: 'end', align: 'end',
                color: '#9a8d72',
                font: { family: 'JetBrains Mono', size: 10 },
                formatter: cm.fmt,
            },
        },
        scales: {
            x: {
                grid: { color: 'rgba(58,52,32,0.4)' },
                ticks: { color: '#4a4232', font: { family: 'JetBrains Mono', size: 9 }, callback: v => cm.fmt(v) },
            },
            y: {
                grid: { display: false },
                ticks: { color: '#9a8d72', font: { size: 11 }, padding: 8 },
            },
        },
    };

    return (
        <div className="md-content">

            {/* ── Header ── */}
            <div className="md-header">
                <div className="md-header-left">
                    <span className="md-queue-tag">{getQ(info?.queueId)}</span>
                    <span className="md-dur-tag">{min}m{sec}</span>
                    {info?.gameEndTimestamp && (
                        <span className="md-date-tag">{timeAgo(info.gameEndTimestamp)}</span>
                    )}
                    <span className="md-matchid">{matchId}</span>
                </div>
                <div className="md-score-block">
                    <span className={team100.win ? 'md-score-win' : 'md-score-loss'}>{blueKills}</span>
                    <span className="md-score-sep">:</span>
                    <span className={team200.win ? 'md-score-win' : 'md-score-loss'}>{redKills}</span>
                </div>
            </div>

            {/* ── Team cards ── */}
            <div className="md-teams-grid">
                <TeamCard team={team100} isBlue={true} kills={blueKills} />
                <TeamCard team={team200} isBlue={false} kills={redKills} />
            </div>

            {/* ── Blue team table ── */}
            <div className="md-team-label md-label-blue">◆ ÉQUIPE BLEUE</div>
            <PlayerTable players={blue} isBlue={true} maxDmg={maxDmg} teamKills={blueKills} isTracked={isTracked} />

            {/* ── Red team table ── */}
            <div className="md-team-label md-label-red">◆ ÉQUIPE ROUGE</div>
            <PlayerTable players={red} isBlue={false} maxDmg={maxDmg} teamKills={redKills} isTracked={isTracked} />

            {/* ── Charts ── */}
            <div className="md-chart-section">
                <div className="md-chart-header">
                    <div className="md-chart-title">STATISTIQUES</div>
                    <div className="md-chart-tabs">
                        {CHART_METRICS.map((m, i) => (
                            <button
                                key={m.key}
                                className={`md-chart-tab ${chartMetricIdx === i ? 'active' : ''}`}
                                onClick={() => setChartMetricIdx(i)}
                            >{m.label}</button>
                        ))}
                    </div>
                </div>
                <div className="md-chart-body">
                    <Bar data={chartData} options={chartOpts} />
                </div>
            </div>

        </div>
    );
}

/* ─── Team card ─────────────────────────────────────────── */
function TeamCard({ team, isBlue, kills }) {
    const obj = team.objectives || {};
    return (
        <div className={`md-team-card ${isBlue ? 'md-tc-blue' : 'md-tc-red'} ${team.win ? 'md-tc-win' : 'md-tc-loss'}`}>
            <div className="md-tc-result">{team.win ? 'VICTOIRE' : 'DÉFAITE'}</div>
            <div className="md-tc-side">{isBlue ? 'Équipe Bleue' : 'Équipe Rouge'}</div>
            <div className="md-tc-kills">{kills} kills</div>
            <div className="md-tc-objectives">
                {[
                    { icon: '🏰', val: obj.tower?.kills ?? 0,       label: 'Tours' },
                    { icon: '🐉', val: obj.dragon?.kills ?? 0,       label: 'Dragons' },
                    { icon: '🟣', val: obj.baron?.kills ?? 0,        label: 'Baron' },
                    { icon: '🔱', val: obj.riftHerald?.kills ?? 0,   label: 'Herald' },
                    { icon: '💀', val: obj.inhibitor?.kills ?? 0,    label: 'Inhibs' },
                ].map(o => (
                    <div key={o.label} className="md-obj" title={o.label}>
                        <span className="md-obj-icon">{o.icon}</span>
                        <span className="md-obj-val">{o.val}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ─── Player table ───────────────────────────────────────── */
function PlayerTable({ players, isBlue, maxDmg, teamKills, isTracked }) {
    return (
        <div className="md-player-table">
            {/* Column headers */}
            <div className="md-th-row">
                <div className="md-th md-col-champ">Champion</div>
                <div className="md-th md-col-player">Joueur</div>
                <div className="md-th md-col-kda">KDA</div>
                <div className="md-th md-col-cs">CS</div>
                <div className="md-th md-col-dmg">Dégâts</div>
                <div className="md-th md-col-gold">Gold</div>
                <div className="md-th md-col-vision">Vision</div>
                <div className="md-th md-col-items">Objets</div>
            </div>
            {players.map((p, i) => (
                <PlayerRow key={i} p={p} isBlue={isBlue} maxDmg={maxDmg} teamKills={teamKills} tracked={isTracked(p)} />
            ))}
        </div>
    );
}

/* ─── Player row ─────────────────────────────────────────── */
function PlayerRow({ p, isBlue, maxDmg, teamKills, tracked }) {
    const ck    = getChampKey(p.championName);
    const cs    = (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0);
    const kda   = ((p.kills + p.assists) / Math.max(p.deaths, 1)).toFixed(2);
    const dmgPct = maxDmg > 0 ? (p.totalDamageDealtToChampions / maxDmg * 100) : 0;
    const kpVal = kp(p, teamKills);
    const pos   = POS_LABEL[p.individualPosition] || POS_LABEL[p.teamPosition] || '';
    const items = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6];
    const s1url = spellUrl(p.summoner1Id);
    const s2url = spellUrl(p.summoner2Id);

    return (
        <div className={`md-player-row ${tracked ? 'md-pr-tracked' : ''} ${p.win ? 'md-pr-win' : 'md-pr-loss'}`}>

            {/* Champion + spells */}
            <div className="md-td md-col-champ">
                <div style={{ position: 'relative', flexShrink: 0 }}>
                    <img
                        src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/champion/${ck}.png`}
                        alt={p.championName} className="md-champ-icon"
                        onError={e => { e.target.style.opacity = '.15'; }}
                    />
                    <span className="md-champ-lv">{p.champLevel}</span>
                </div>
                <div className="md-spells">
                    {s1url && <img src={s1url} alt="" className="md-spell-icon" onError={e => { e.target.style.opacity = '.2'; }} />}
                    {s2url && <img src={s2url} alt="" className="md-spell-icon" onError={e => { e.target.style.opacity = '.2'; }} />}
                </div>
            </div>

            {/* Player name + position */}
            <div className="md-td md-col-player">
                {pos && <span className={`md-pos-chip md-pos-${pos.toLowerCase()}`}>{pos}</span>}
                <div className="md-player-name-wrap">
                    <span className={`md-player-name ${tracked ? 'md-name-tracked' : ''}`}>
                        {p.riotIdGameName || 'Joueur'}
                    </span>
                    <span className="md-player-tag">#{p.riotIdTagline}</span>
                </div>
            </div>

            {/* KDA */}
            <div className="md-td md-col-kda">
                <div className="md-kda-nums">
                    <span className="md-k">{p.kills}</span>
                    <span className="md-slash">/</span>
                    <span className="md-d">{p.deaths}</span>
                    <span className="md-slash">/</span>
                    <span className="md-a">{p.assists}</span>
                </div>
                <div className="md-kda-ratio">{kda} KDA</div>
                <div className="md-kp">{kpVal}% KP</div>
            </div>

            {/* CS */}
            <div className="md-td md-col-cs">
                <div className="md-cs-val">{cs}</div>
                <div className="md-cs-sub">{(cs / Math.max((p.challenges?.gameLength || 1800) / 60, 1)).toFixed(1)}/m</div>
            </div>

            {/* Damage */}
            <div className="md-td md-col-dmg">
                <div className="md-dmg-val">{fmtK(p.totalDamageDealtToChampions)}</div>
                <div className="md-dmg-bar-track">
                    <div
                        className="md-dmg-bar-fill"
                        style={{ width: `${dmgPct}%`, background: isBlue ? 'var(--gold)' : 'var(--orange)' }}
                    />
                </div>
                <div className="md-dmg-sub">{fmtK(p.totalDamageTaken)} reçus</div>
            </div>

            {/* Gold */}
            <div className="md-td md-col-gold">
                <div className="md-gold-val">{fmtK(p.goldEarned)}</div>
            </div>

            {/* Vision */}
            <div className="md-td md-col-vision">
                <div className="md-vis-val">{p.visionScore}</div>
                <div className="md-vis-sub">{p.wardsPlaced || 0}🔮 {p.wardsKilled || 0}💀</div>
            </div>

            {/* Items */}
            <div className="md-td md-col-items">
                <div className="md-items-row">
                    {items.map((item, idx) => (
                        <div key={idx} className={`md-item-sq ${idx === 6 ? 'md-item-ward' : ''}`}>
                            {item ? (
                                <img
                                    src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/item/${item}.png`}
                                    alt="" title={`Item ${item}`}
                                    onError={e => { e.target.style.opacity = '.1'; }}
                                />
                            ) : null}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
