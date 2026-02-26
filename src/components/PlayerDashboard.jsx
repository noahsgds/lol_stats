import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { D_VER, toFixed, toWR, fmtK, getChampKey, computeChampStats, getQ, API_BASE, timeAgo } from '../lib/utils.js';
import MatchDetailModal from './MatchDetail.jsx';

// ─── CONSTANTS ────────────────────────────────────────────

const TREND_METRICS = [
    { key: 'kda',       label: 'KDA',       fmt: v => v.toFixed(2),         color: '#f0a500' },
    { key: 'csMin',     label: 'CS/min',    fmt: v => v.toFixed(1),         color: '#4ade80' },
    { key: 'dmgMin',    label: 'Dmg/min',   fmt: v => fmtK(Math.round(v)),  color: '#f97316' },
    { key: 'goldMin',   label: 'Gold/min',  fmt: v => Math.round(v),        color: '#fbbf24' },
    { key: 'vision',    label: 'Vision',    fmt: v => Math.round(v),        color: '#a78bfa' },
    { key: 'visionMin', label: 'Vision/min',fmt: v => v.toFixed(2),         color: '#818cf8' },
];

const DUR_BUCKETS = [
    { label: '< 20 min', lo: 0,    hi: 20 * 60 },
    { label: '20–30',    lo: 20*60, hi: 30 * 60 },
    { label: '30–40',    lo: 30*60, hi: 40 * 60 },
    { label: '> 40 min', lo: 40*60, hi: Infinity },
];

// ─── DATA HELPERS ─────────────────────────────────────────

function buildGameMetrics(history) {
    return (history || []).slice(0, 20).reverse().map((m, i) => {
        const durMin = Math.max((m.game_duration || 1) / 60, 1);
        return {
            idx: i + 1,
            kda:       parseFloat(m.kda || 0),
            csMin:     (m.cs || 0) / durMin,
            dmgMin:    (m.total_damage || 0) / durMin,
            goldMin:   (m.gold_earned || 0) / durMin,
            vision:    m.vision_score || 0,
            visionMin: (m.vision_score || 0) / durMin,
            win: m.win,
            champion: m.champion_name,
        };
    });
}

function buildConsistency(history) {
    if (!history?.length) return null;
    const kdas = history.map(m => parseFloat(m.kda || 0));
    const mean = kdas.reduce((a, b) => a + b, 0) / kdas.length;
    const variance = kdas.reduce((a, b) => a + (b - mean) ** 2, 0) / kdas.length;
    const stdDev = Math.sqrt(variance);
    const score = Math.max(0, Math.min(100, Math.round(100 - (stdDev / Math.max(mean, 0.1)) * 30)));

    const last5Avg  = kdas.slice(0, 5).reduce((a, b) => a + b, 0) / Math.min(5, kdas.length);
    const prev10    = kdas.slice(5, 15);
    const prev10Avg = prev10.length ? prev10.reduce((a, b) => a + b, 0) / prev10.length : mean;
    const tiltDelta = ((last5Avg - prev10Avg) / Math.max(prev10Avg, 0.1)) * 100;

    let streak = 0, streakWin = null;
    for (const m of history) {
        if (streakWin === null) { streakWin = m.win; streak = 1; }
        else if (m.win === streakWin) streak++;
        else break;
    }

    const last20 = history.slice(0, 20);
    const last20WR = last20.length ? Math.round(last20.filter(m => m.win).length / last20.length * 100) : 0;
    const avgKdaLast5  = parseFloat(last5Avg.toFixed(2));
    const avgKdaPrev10 = parseFloat(prev10Avg.toFixed(2));

    return { score, stdDev, mean, tiltDelta, streak, streakWin, last20WR, avgKdaLast5, avgKdaPrev10 };
}

function buildQueueBreakdown(history) {
    const map = {};
    (history || []).forEach(m => {
        const label = getQ(m.queue_id) || `Q${m.queue_id}`;
        const g = map[label] = map[label] || { games: 0, wins: 0, kda: 0, cs: 0, dur: 0 };
        g.games++; if (m.win) g.wins++;
        g.kda += parseFloat(m.kda || 0);
        g.cs  += (m.cs || 0);
        g.dur += (m.game_duration || 0);
    });
    return Object.entries(map)
        .map(([label, g]) => ({
            label, games: g.games,
            wr:    Math.round(g.wins / g.games * 100),
            kda:   (g.kda / g.games).toFixed(2),
            csMin: (g.cs / g.games / Math.max(g.dur / g.games / 60, 1)).toFixed(1),
        }))
        .sort((a, b) => b.games - a.games);
}

// S/A/B/C/D grade per match based on KDA, CS/min, Dmg/min, Vision
function perfGrade(m) {
    const durMin = Math.max((m.game_duration || 1) / 60, 1);
    const kda    = parseFloat(m.kda || 0);
    const csMin  = (m.cs || 0) / durMin;
    const dmgMin = (m.total_damage || 0) / durMin;
    const vision = m.vision_score || 0;
    let score = 0;
    score += Math.min(kda / 5, 1) * 35;
    score += Math.min(csMin / 8, 1) * 20;
    score += Math.min(dmgMin / 2000, 1) * 30;
    score += Math.min(vision / 50, 1) * 15;
    if (m.win) score = Math.min(score * 1.1, 100);
    score = Math.round(score);
    if (score >= 78) return { label: 'S', color: '#f0a500' };
    if (score >= 62) return { label: 'A', color: '#4ade80' };
    if (score >= 46) return { label: 'B', color: '#94a3b8' };
    if (score >= 30) return { label: 'C', color: '#9a8d72' };
    return { label: 'D', color: '#f87171' };
}


// ─── SECTION WRAPPER ──────────────────────────────────────

function Section({ title, children, accent = 'var(--gold)' }) {
    return (
        <div className="db-section">
            <div className="db-section-title" style={{ color: typeof title === 'string' ? 'var(--text-dim)' : undefined }}>
                {title}
            </div>
            {children}
        </div>
    );
}

// ─── STAT CARD GRID ───────────────────────────────────────

function StatGrid({ stats, cols = 3 }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '8px' }}>
            {stats.map(s => (
                <div key={s.lbl} className="db-stat-card">
                    <div className={`db-stat-val${s.big ? ' big' : ''}`} style={{ color: s.col || 'var(--text)' }}>{s.val}</div>
                    <div className="db-stat-lbl">{s.lbl}</div>
                    {s.sub && <div style={{ fontSize: '8px', color: 'var(--text-dim)', marginTop: 2 }}>{s.sub}</div>}
                </div>
            ))}
        </div>
    );
}

// ─── WIN / LOSS SPLIT ─────────────────────────────────────

function WinLossSplit({ history, cssColor }) {
    if (!history?.length) return null;
    const wGames = history.filter(m => m.win);
    const lGames = history.filter(m => !m.win);
    if (!wGames.length || !lGames.length) return null;

    const dm = m => Math.max((m.game_duration || 1) / 60, 1);
    const avg = (arr, fn) => arr.reduce((a, m) => a + fn(m), 0) / arr.length;

    const metrics = [
        { lbl: 'KDA',          fmt: v => v.toFixed(2), wVal: avg(wGames, m => parseFloat(m.kda || 0)),                      lVal: avg(lGames, m => parseFloat(m.kda || 0)),                      higher: true  },
        { lbl: 'CS / min',     fmt: v => v.toFixed(1), wVal: avg(wGames, m => (m.cs || 0) / dm(m)),                         lVal: avg(lGames, m => (m.cs || 0) / dm(m)),                         higher: true  },
        { lbl: 'Dmg / min',    fmt: v => fmtK(Math.round(v)), wVal: avg(wGames, m => (m.total_damage || 0) / dm(m)),        lVal: avg(lGames, m => (m.total_damage || 0) / dm(m)),               higher: true  },
        { lbl: 'Dmg reçu/min', fmt: v => fmtK(Math.round(v)), wVal: avg(wGames, m => (m.total_damage_taken || 0) / dm(m)), lVal: avg(lGames, m => (m.total_damage_taken || 0) / dm(m)),         higher: false },
        { lbl: 'Vision',       fmt: v => v.toFixed(1), wVal: avg(wGames, m => m.vision_score || 0),                         lVal: avg(lGames, m => m.vision_score || 0),                         higher: true  },
        { lbl: 'Or / min',     fmt: v => Math.round(v), wVal: avg(wGames, m => (m.gold_earned || 0) / dm(m)),               lVal: avg(lGames, m => (m.gold_earned || 0) / dm(m)),                higher: true  },
    ];

    return (
        <Section title={`Victoires (${wGames.length}) vs Défaites (${lGames.length})`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {metrics.map(({ lbl, fmt, wVal, lVal, higher }) => {
                    const delta  = wVal - lVal;
                    const pct    = lVal > 0.01 ? delta / lVal * 100 : 0;
                    const good   = higher ? delta > 0 : delta < 0;
                    const neut   = Math.abs(pct) < 5;
                    const tagCol = neut ? 'var(--text-dim)' : good ? 'var(--win)' : 'var(--loss)';
                    const tag    = neut ? '≈' : `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`;
                    const barW   = Math.min(wVal / Math.max(wVal, lVal, 0.001) * 100, 100);
                    return (
                        <div key={lbl} className="db-stat-card">
                            <div className="db-stat-lbl" style={{ marginBottom: 8 }}>{lbl}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                                <span style={{ color: 'var(--win)', fontWeight: 800, fontSize: '15px', fontFamily: "'JetBrains Mono',monospace" }}>{fmt(wVal)}</span>
                                <span style={{ color: tagCol, fontSize: '10px', fontWeight: 700, padding: '1px 5px', background: neut ? 'transparent' : good ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', borderRadius: 3 }}>{tag}</span>
                                <span style={{ color: 'var(--loss)', fontWeight: 800, fontSize: '15px', fontFamily: "'JetBrains Mono',monospace" }}>{fmt(lVal)}</span>
                            </div>
                            <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${barW}%`, background: good ? 'var(--win)' : 'var(--loss)', borderRadius: 2, transition: 'width 0.5s ease' }} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </Section>
    );
}

// ─── FULL MATCH LOG ───────────────────────────────────────

function MatchLog({ history, trackedTag }) {
    if (!history?.length) return null;
    const [expanded, setExpanded] = useState(false);
    const [selectedMatchId, setSelectedMatchId] = useState(null);
    const shown = expanded ? history : history.slice(0, 15);

    return (
        <>
            <Section title={`Historique complet — ${history.length} parties`}>
                <div style={{ overflowX: 'auto' }}>
                    <table className="db-champ-table" style={{ minWidth: 760 }}>
                        <thead>
                            <tr>
                                <th style={{ minWidth: 130 }}>Champion</th>
                                <th>File</th>
                                <th>Rés.</th>
                                <th title="Grade de performance (KDA 35% + CS/min 20% + Dmg/min 30% + Vision 15%)">Perf</th>
                                <th>K / D / A</th>
                                <th>CS/min</th>
                                <th>Dmg/min</th>
                                <th>Pris/min</th>
                                <th>Vision</th>
                                <th>Or/min</th>
                                <th>Durée</th>
                                <th>Il y a</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((m, i) => {
                                const dur    = m.game_duration || 0;
                                const durMin = Math.max(dur / 60, 1);
                                const durStr = `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`;
                                const grade  = perfGrade(m);
                                const cspm   = ((m.cs || 0) / durMin).toFixed(1);
                                const dmgpm  = fmtK(Math.round((m.total_damage || 0) / durMin));
                                const takpm  = fmtK(Math.round((m.total_damage_taken || 0) / durMin));
                                const goldpm = Math.round((m.gold_earned || 0) / durMin);
                                return (
                                    <tr key={i}
                                        onClick={() => m.match_id && setSelectedMatchId(m.match_id)}
                                        style={{
                                            background: m.win ? 'rgba(74,222,128,0.03)' : 'rgba(248,113,113,0.03)',
                                            borderLeft: `2px solid ${m.win ? 'rgba(74,222,128,0.22)' : 'rgba(248,113,113,0.22)'}`,
                                            cursor: m.match_id ? 'pointer' : 'default',
                                            transition: 'background 0.12s',
                                        }}
                                        onMouseEnter={e => { if (m.match_id) e.currentTarget.style.background = m.win ? 'rgba(74,222,128,0.07)' : 'rgba(248,113,113,0.07)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = m.win ? 'rgba(74,222,128,0.03)' : 'rgba(248,113,113,0.03)'; }}
                                    >
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <img
                                                    src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/champion/${getChampKey(m.champion_name)}.png`}
                                                    alt="" style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid var(--border-hi)', flexShrink: 0 }}
                                                    onError={e => { e.target.style.opacity = '.2'; }}
                                                />
                                                <span className="db-champ-name" style={{ fontSize: '12px' }}>{m.champion_name}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{ fontSize: '9px', background: 'var(--border)', padding: '2px 5px', borderRadius: 3, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{getQ(m.queue_id)}</span>
                                        </td>
                                        <td>
                                            <span style={{
                                                fontSize: '10px', fontWeight: 800, padding: '2px 7px', borderRadius: 3,
                                                background: m.win ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
                                                color: m.win ? 'var(--win)' : 'var(--loss)',
                                            }}>
                                                {m.win ? 'V' : 'D'}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{ fontSize: '13px', fontWeight: 900, fontFamily: "'JetBrains Mono',monospace", color: grade.color }}>{grade.label}</span>
                                        </td>
                                        <td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', whiteSpace: 'nowrap' }}>
                                            <span style={{ color: 'var(--win)' }}>{m.kills}</span>
                                            <span style={{ color: 'var(--text-dim)' }}>/</span>
                                            <span style={{ color: 'var(--loss)' }}>{m.deaths}</span>
                                            <span style={{ color: 'var(--text-dim)' }}>/</span>
                                            <span style={{ color: 'var(--text-mid)' }}>{m.assists}</span>
                                        </td>
                                        <td style={{ color: 'var(--gold)', fontFamily: "'JetBrains Mono',monospace", fontSize: '11px' }}>{cspm}</td>
                                        <td style={{ color: '#f97316', fontFamily: "'JetBrains Mono',monospace", fontSize: '11px' }}>{dmgpm}</td>
                                        <td style={{ color: 'var(--text-mid)', fontFamily: "'JetBrains Mono',monospace", fontSize: '11px' }}>{takpm}</td>
                                        <td style={{ color: '#a78bfa', fontFamily: "'JetBrains Mono',monospace", fontSize: '11px' }}>{m.vision_score || 0}</td>
                                        <td style={{ color: '#fbbf24', fontFamily: "'JetBrains Mono',monospace", fontSize: '11px' }}>{goldpm}</td>
                                        <td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10px', color: 'var(--text-dim)' }}>{durStr}</td>
                                        <td style={{ fontSize: '10px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{timeAgo(m.game_end_timestamp)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {history.length > 15 && (
                    <button onClick={() => setExpanded(e => !e)} style={{
                        marginTop: 10, width: '100%', padding: '8px',
                        background: 'transparent', border: '1px solid var(--border-hi)',
                        color: 'var(--text-mid)', cursor: 'pointer',
                        fontFamily: "'Barlow Condensed',sans-serif", fontSize: '12px', fontWeight: 700,
                        borderRadius: 5, letterSpacing: '0.5px',
                    }}>
                        {expanded ? '▲ Réduire' : `▼ Voir tout — ${history.length} parties`}
                    </button>
                )}
            </Section>

            {selectedMatchId && (
                <MatchDetailModal
                    matchId={selectedMatchId}
                    trackedTag={trackedTag}
                    onClose={() => setSelectedMatchId(null)}
                />
            )}
        </>
    );
}

// ─── PERFORMANCE TRENDS ───────────────────────────────────

function PerformanceTrends({ gameMetrics }) {
    const [active, setActive] = useState('kda');
    const m = TREND_METRICS.find(t => t.key === active);
    const values = gameMetrics.map(g => g[active]);
    const max = Math.max(...values) * 1.2 || 10;

    const lineData = {
        labels: gameMetrics.map(g => `G${g.idx}`),
        datasets: [{
            data: values,
            borderColor: m.color,
            backgroundColor: m.color + '18',
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: gameMetrics.map(g => g.win ? m.color : '#f87171'),
            pointBorderColor:     gameMetrics.map(g => g.win ? m.color : '#f87171'),
            tension: 0.35, fill: true,
        }],
    };
    const opts = {
        maintainAspectRatio: false,
        scales: {
            x: { ticks: { color: '#4a4232', font: { size: 9 } }, grid: { color: 'rgba(42,36,22,0.5)' } },
            y: { min: 0, max, ticks: { color: '#4a4232', font: { size: 9 }, callback: v => m.fmt(v) }, grid: { color: 'rgba(42,36,22,0.5)' } },
        },
        plugins: {
            legend: { display: false }, datalabels: { display: false },
            tooltip: { callbacks: {
                label: ctx => `${m.label} : ${m.fmt(ctx.raw)}`,
                afterLabel: ctx => gameMetrics[ctx.dataIndex]?.win ? '✓ Victoire' : '✗ Défaite',
            }},
        },
    };

    return (
        <Section title="Tendances — 20 derniers matchs">
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                {TREND_METRICS.map(tm => (
                    <button key={tm.key} onClick={() => setActive(tm.key)} style={{
                        padding: '3px 10px', borderRadius: 4,
                        border: `1px solid ${active === tm.key ? tm.color : 'var(--border-hi)'}`,
                        background: active === tm.key ? tm.color + '22' : 'transparent',
                        color: active === tm.key ? tm.color : 'var(--text-dim)',
                        fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                        fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: '0.5px',
                        transition: 'all 0.15s',
                    }}>{tm.label}</button>
                ))}
            </div>
            <div style={{ height: 160, marginBottom: 6 }}>
                <Line data={lineData} options={opts} />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, display: 'inline-block' }} />
                    <span style={{ fontSize: '9px', color: 'var(--text-dim)' }}>Victoire</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171', display: 'inline-block' }} />
                    <span style={{ fontSize: '9px', color: 'var(--text-dim)' }}>Défaite</span>
                </span>
            </div>
        </Section>
    );
}

// ─── CONSISTENCY & FORM ───────────────────────────────────

function ConsistencyForm({ cons, cssColor }) {
    if (!cons) return null;
    const { score, stdDev, mean, tiltDelta, streak, streakWin, last20WR, avgKdaLast5, avgKdaPrev10 } = cons;
    const scoreColor = score >= 70 ? 'var(--win)' : score >= 40 ? cssColor : 'var(--loss)';
    const tiltColor  = tiltDelta >= 10 ? 'var(--win)' : tiltDelta <= -15 ? 'var(--loss)' : 'var(--text-mid)';
    const tiltLabel  = tiltDelta >= 10 ? '↑ En forme' : tiltDelta <= -15 ? '↓ En tilt ?' : '→ Stable';

    return (
        <Section title="Consistance & Forme">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div className="db-stat-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                        <div className="db-stat-lbl">Consistance KDA</div>
                        <div className="db-stat-val" style={{ color: scoreColor, fontSize: '22px' }}>{score}<span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>/100</span></div>
                    </div>
                    <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
                        <div style={{ height: '100%', width: `${score}%`, background: scoreColor, borderRadius: 3, transition: 'width 0.6s ease' }} />
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--text-dim)' }}>σ = {stdDev.toFixed(2)} · μ = {mean.toFixed(2)}</div>
                </div>
                <div className="db-stat-card">
                    <div className="db-stat-lbl" style={{ marginBottom: 6 }}>Forme (5 vs 10 derniers)</div>
                    <div className="db-stat-val" style={{ color: tiltColor, fontSize: '16px', marginBottom: 4 }}>{tiltLabel}</div>
                    <div style={{ fontSize: '9px', color: 'var(--text-dim)' }}>
                        L5 : <span style={{ color: cssColor }}>{avgKdaLast5} KDA</span>
                        &nbsp;·&nbsp;
                        L10 : <span style={{ color: 'var(--text-mid)' }}>{avgKdaPrev10} KDA</span>
                        &nbsp;({tiltDelta >= 0 ? '+' : ''}{tiltDelta.toFixed(0)}%)
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div className="db-stat-card">
                    <div className="db-stat-lbl">Série actuelle</div>
                    <div className="db-stat-val big" style={{ color: streakWin ? 'var(--win)' : 'var(--loss)' }}>
                        {streak}{streakWin ? 'W' : 'L'}
                    </div>
                </div>
                <div className="db-stat-card">
                    <div className="db-stat-lbl">WR — 20 matchs</div>
                    <div className="db-stat-val big" style={{ color: last20WR >= 55 ? 'var(--win)' : last20WR <= 45 ? 'var(--loss)' : cssColor }}>
                        {last20WR}%
                    </div>
                </div>
                <div className="db-stat-card">
                    <div className="db-stat-lbl">KDA moy. L5</div>
                    <div className="db-stat-val big" style={{ color: cssColor }}>{avgKdaLast5}</div>
                </div>
            </div>
        </Section>
    );
}

// ─── GAME DURATION ANALYSIS ───────────────────────────────

function GameDurationAnalysis({ history, cssColor }) {
    if (!history?.length) return null;
    const buckets = DUR_BUCKETS.map(b => {
        const games = history.filter(m => m.game_duration >= b.lo && m.game_duration < b.hi);
        const wins  = games.filter(m => m.win).length;
        return { ...b, games: games.length, wins, wr: games.length ? Math.round(wins / games.length * 100) : null };
    }).filter(b => b.games > 0);

    return (
        <Section title="Analyse par durée de partie">
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${buckets.length}, 1fr)`, gap: '8px' }}>
                {buckets.map(b => {
                    const wrColor = b.wr >= 55 ? 'var(--win)' : b.wr <= 45 ? 'var(--loss)' : cssColor;
                    return (
                        <div key={b.label} className="db-stat-card" style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{b.label}</div>
                            <div style={{ fontSize: '22px', fontWeight: 900, fontFamily: "'JetBrains Mono',monospace", color: wrColor, lineHeight: 1, marginBottom: 6 }}>
                                {b.wr ?? '—'}%
                            </div>
                            <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', marginBottom: 4 }}>
                                <div style={{ height: '100%', width: `${b.wr ?? 0}%`, background: wrColor, transition: 'width 0.5s ease' }} />
                            </div>
                            <div style={{ fontSize: '9px', color: 'var(--text-dim)' }}>{b.wins}V / {b.games - b.wins}D ({b.games})</div>
                        </div>
                    );
                })}
            </div>
        </Section>
    );
}

// ─── QUEUE BREAKDOWN ─────────────────────────────────────

function QueueBreakdown({ history, cssColor }) {
    const rows = buildQueueBreakdown(history);
    if (!rows.length) return null;

    return (
        <Section title="Répartition par file">
            <table className="db-champ-table">
                <thead>
                    <tr>
                        <th>File</th><th>Parties</th><th>WR%</th><th>KDA moy.</th><th>CS/min</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(r => {
                        const wrColor = r.wr >= 55 ? 'var(--win)' : r.wr <= 45 ? 'var(--loss)' : 'var(--text)';
                        return (
                            <tr key={r.label}>
                                <td className="db-champ-name" style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '14px' }}>{r.label}</td>
                                <td>{r.games}</td>
                                <td style={{ color: wrColor, fontWeight: 800 }}>{r.wr}%</td>
                                <td style={{ color: cssColor }}>{r.kda}</td>
                                <td>{r.csMin}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </Section>
    );
}

// ─── TOP ITEMS ────────────────────────────────────────────

function TopItems({ history }) {
    const itemCount = {};
    (history || []).forEach(m => {
        [m.item0, m.item1, m.item2, m.item3, m.item4, m.item5].forEach(id => {
            if (id && id > 0) itemCount[id] = (itemCount[id] || 0) + 1;
        });
    });
    const top = Object.entries(itemCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    if (!top.length) return null;

    return (
        <Section title="Items les plus construits">
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {top.map(([id, count]) => (
                    <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                        <div style={{ width: 36, height: 36, borderRadius: 5, border: '1px solid var(--border-hi)', overflow: 'hidden', background: 'rgba(0,0,0,0.3)' }}>
                            <img
                                src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/item/${id}.png`}
                                alt="" style={{ width: '100%', height: '100%' }}
                                onError={e => { e.target.style.opacity = '.2'; }}
                            />
                        </div>
                        <span style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: "'JetBrains Mono',monospace" }}>{count}x</span>
                    </div>
                ))}
            </div>
        </Section>
    );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────

const TIER_SHORT_DB = {
    IRON: 'Fer', BRONZE: 'Bronze', SILVER: 'Argent', GOLD: 'Or',
    PLATINUM: 'Platine', EMERALD: 'Émeraude', DIAMOND: 'Diamant',
    MASTER: 'Maître', GRANDMASTER: 'Grand Maître', CHALLENGER: 'Challenger',
};
const TIER_COLOR_DB = {
    IRON: '#9e9e9e', BRONZE: '#cd7f32', SILVER: '#a8b0b8', GOLD: '#f0a500',
    PLATINUM: '#00e0d0', EMERALD: '#4ade80', DIAMOND: '#4fc3f7',
    MASTER: '#9b59b6', GRANDMASTER: '#e74c3c', CHALLENGER: '#f1c40f',
};
function dbEmblemUrl(tier) { return tier ? `/ranks/${tier.toLowerCase()}.png` : null; }
function dbEmblemFallbackChain(tier, tried) {
    if (tried === 'png') return tier ? `/ranks/${tier.toLowerCase()}.svg` : null;
    if (tried === 'svg') return tier ? `https://opgg-static.akamaized.net/images/medals_new/${tier.toLowerCase()}.png` : null;
    return null;
}
function dbRankLabel(tier, rank) {
    if (!tier) return 'Non classé';
    const t = TIER_SHORT_DB[tier] || tier;
    if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier)) return t;
    return `${t} ${rank || ''}`;
}

export default function PlayerDashboard({ data, pid, onClose, inline = false }) {
    const isP2     = pid === 'p2';
    const color    = isP2 ? '#e84d00' : '#f0a500';
    const cssColor = isP2 ? 'var(--p2)' : 'var(--p1)';

    const [dbQueue, setDbQueue] = useState('solo');

    const { rank: r, global: g, history: h, rawTag } = data;
    const name    = (r.riot_id || rawTag || '').split('#')[0];
    const tier    = r.solo_tier || 'UNRANKED';
    const rankTxt = tier === 'UNRANKED' ? 'Non classé'
        : `${tier} ${r.solo_rank || ''} · ${r.solo_lp ?? '?'} LP`;

    const wr    = toWR(g.win_rate);
    const total = parseInt(g.total_games) || 0;
    const wins  = Math.round((parseFloat(wr) / 100) * total);

    // Pre-compute all analytics
    const gameMetrics = buildGameMetrics(h);
    const cons        = buildConsistency(h);
    const champs      = computeChampStats(h);

    // Extended champion data (add dmg taken)
    const champDmgTaken = {};
    (h || []).forEach(m => {
        const key = m.champion_name || 'Unknown';
        champDmgTaken[key] = champDmgTaken[key] || { dt: 0, n: 0 };
        champDmgTaken[key].dt += (m.total_damage_taken || 0);
        champDmgTaken[key].n++;
    });
    const champsExt = champs.map(c => ({
        ...c,
        avgDmgTaken: Math.round((champDmgTaken[c.name]?.dt || 0) / (champDmgTaken[c.name]?.n || 1)),
    }));

    // Advanced metrics from history
    const adv = (() => {
        if (!h?.length) return null;
        const dm = m => Math.max((m.game_duration || 1) / 60, 1);
        const avgCsMin      = h.reduce((acc, m) => acc + (m.cs || 0) / dm(m), 0) / h.length;
        const avgDmgMin     = h.reduce((acc, m) => acc + (m.total_damage || 0) / dm(m), 0) / h.length;
        const avgDmgTknMin  = h.reduce((acc, m) => acc + (m.total_damage_taken || 0) / dm(m), 0) / h.length;
        const avgGldMin     = h.reduce((acc, m) => acc + (m.gold_earned || 0) / dm(m), 0) / h.length;
        const avgVisMin     = h.reduce((acc, m) => acc + (m.vision_score || 0) / dm(m), 0) / h.length;
        const wGames        = h.filter(m => m.win);
        const lGames        = h.filter(m => !m.win);
        const avgVisW       = wGames.length ? wGames.reduce((a, m) => a + (m.vision_score || 0), 0) / wGames.length : 0;
        const avgVisL       = lGames.length ? lGames.reduce((a, m) => a + (m.vision_score || 0), 0) / lGames.length : 0;
        const dmgRatio      = avgDmgMin / Math.max(avgDmgTknMin, 1);
        return { avgCsMin, avgDmgMin, avgDmgTknMin, avgGldMin, avgVisMin, avgVisW, avgVisL, dmgRatio };
    })();

    // Trend line (last 20, rolling WR)
    const last20 = (h || []).slice(0, 20).reverse();
    let w20 = 0;
    const trendData = last20.map((m, i) => { if (m.win) w20++; return parseFloat(((w20 / (i + 1)) * 100).toFixed(1)); });
    const trendLineData = {
        labels: last20.map((_, i) => `G${i + 1}`),
        datasets: [{ label: 'WR', data: trendData, borderColor: color,
            backgroundColor: isP2 ? 'rgba(232,77,0,0.08)' : 'rgba(240,165,0,0.08)',
            borderWidth: 2, pointRadius: 3, pointBackgroundColor: color, tension: 0.4, fill: true }],
    };
    const trendOpts = {
        maintainAspectRatio: false,
        scales: {
            x: { ticks: { color: '#4a4232', font: { size: 9 } }, grid: { color: 'rgba(42,36,22,0.5)' } },
            y: { min: 0, max: 100, ticks: { color: '#4a4232', font: { size: 9 }, callback: v => v + '%' }, grid: { color: 'rgba(42,36,22,0.5)' } },
        },
        plugins: { legend: { display: false }, datalabels: { display: false } },
    };

    useEffect(() => {
        if (inline) return;
        const handler = e => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', handler); document.body.style.overflow = ''; };
    }, [onClose, inline]);

    return (
        <>
            <style>{`
                @keyframes livePulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.4; transform: scale(0.8); }
                }
            `}</style>

            <div className={inline ? 'db-inline' : 'db-overlay'} onClick={!inline ? (e => { if (e.target === e.currentTarget) onClose(); }) : undefined}>
                <div className="db-panel">

                    {/* ── HEADER ── */}
                    <div className="db-header">
                        <button className="db-back" onClick={onClose}>← Retour</button>
                        <img className="db-avatar"
                            src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/profileicon/${r.profile_icon_id || 29}.png`}
                            onError={e => { e.target.style.opacity = '.3'; }} alt="" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="db-name" style={{ color: cssColor }}>{name}</div>
                            {/* Solo/Flex toggle */}
                            <div className="db-rank-row">
                                <div className="db-queue-tabs">
                                    <button className={`db-qtab ${dbQueue === 'solo' ? 'active' : ''}`} onClick={() => setDbQueue('solo')}>Solo</button>
                                    <button className={`db-qtab ${dbQueue === 'flex' ? 'active' : ''}`} onClick={() => setDbQueue('flex')}>Flex</button>
                                </div>
                                {(() => {
                                    const dTier = dbQueue === 'solo' ? r.solo_tier : r.flex_tier;
                                    const dRank = dbQueue === 'solo' ? r.solo_rank : r.flex_rank;
                                    const dLp   = dbQueue === 'solo' ? r.solo_lp   : r.flex_lp;
                                    const dUrl  = dbEmblemUrl(dTier);
                                    const dCol  = TIER_COLOR_DB[dTier] || 'var(--text-dim)';
                                    return (
                                        <div className="db-rank-display">
                                            {dUrl && <img className="db-rank-emblem" src={dUrl} alt={dTier || ''}
    onError={e => {
        const tried = e.target.dataset.tried || 'png';
        const next = dbEmblemFallbackChain(dTier, tried);
        if (next) { e.target.dataset.tried = tried === 'png' ? 'svg' : 'cdn'; e.target.src = next; }
        else { e.target.style.display = 'none'; }
    }} />}
                                            <div>
                                                <div className="db-rank-label" style={{ color: dCol }}>{dbRankLabel(dTier, dRank)}</div>
                                                {dTier && dLp !== null && dLp !== undefined && (
                                                    <div className="db-rank-lp">{dLp} LP</div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                        {cons && (
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontSize: '9px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 2 }}>Consistance</div>
                                <div style={{ fontSize: '22px', fontWeight: 900, fontFamily: "'JetBrains Mono',monospace", color: cons.score >= 70 ? 'var(--win)' : cons.score >= 40 ? cssColor : 'var(--loss)' }}>
                                    {cons.score}<span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>/100</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── OVERVIEW ── */}
                    <div className="db-overview">
                        {[
                            { lbl: 'Parties',     val: total },
                            { lbl: 'Win Rate',    val: wr + '%',                              big: true, col: cssColor },
                            { lbl: 'KDA',         val: toFixed(g.kda, 2) + ':1',              big: true, col: cssColor },
                            { lbl: 'Victoires',   val: wins,                                  col: 'var(--win)' },
                            { lbl: 'Défaites',    val: total - wins,                          col: 'var(--loss)' },
                            { lbl: 'Dmg moy.',    val: fmtK(Math.round(g.avg_damage || 0)),   col: '#f97316' },
                            { lbl: 'Dmg reçu',    val: fmtK(Math.round(g.avg_damage_taken || 0)), col: 'var(--text-mid)' },
                            { lbl: 'Or moy.',     val: fmtK(Math.round(g.avg_gold || 0)),     col: 'var(--gold)' },
                            { lbl: 'CS moy.',     val: Math.round(g.avg_cs || 0) },
                            { lbl: 'Vision moy.', val: toFixed(g.avg_vision, 1) },
                        ].map(s => (
                            <div key={s.lbl} className="db-stat-card">
                                <div className={`db-stat-val${s.big ? ' big' : ''}`} style={{ color: s.col || 'var(--text)' }}>{s.val}</div>
                                <div className="db-stat-lbl">{s.lbl}</div>
                            </div>
                        ))}
                    </div>

                    {/* ── ADVANCED METRICS ── */}
                    {adv && (
                        <Section title="Métriques avancées (per-minute)">
                            <StatGrid cols={3} stats={[
                                { lbl: 'CS / min',       val: adv.avgCsMin.toFixed(1),             col: 'var(--gold)' },
                                { lbl: 'Dmg / min',      val: fmtK(Math.round(adv.avgDmgMin)),     col: '#f97316' },
                                { lbl: 'Dmg reçu / min', val: fmtK(Math.round(adv.avgDmgTknMin)), col: 'var(--text-mid)' },
                                { lbl: 'Or / min',       val: Math.round(adv.avgGldMin),           col: '#fbbf24' },
                                { lbl: 'Vision / min',   val: adv.avgVisMin.toFixed(2),            col: '#a78bfa' },
                                { lbl: 'Ratio dmg/pris', val: adv.dmgRatio.toFixed(2),             col: cssColor, sub: 'dealt ÷ taken' },
                                { lbl: 'Vision (Vic.)',  val: adv.avgVisW.toFixed(1),              col: 'var(--win)', sub: 'moy. victoires' },
                                { lbl: 'Vision (Déf.)',  val: adv.avgVisL.toFixed(1),              col: 'var(--loss)', sub: 'moy. défaites' },
                            ]} />
                        </Section>
                    )}

                    {/* ── WIN / LOSS SPLIT ── */}
                    <WinLossSplit history={h} cssColor={cssColor} />

                    {/* ── CONSISTENCY & FORM ── */}
                    <ConsistencyForm cons={cons} cssColor={cssColor} />

                    {/* ── PERFORMANCE TRENDS ── */}
                    {gameMetrics.length > 0 && <PerformanceTrends gameMetrics={gameMetrics} cssColor={cssColor} />}

                    {/* ── WR TREND ── */}
                    <Section title={`Win Rate cumulatif — ${last20.length} derniers matchs`}>
                        <div className="db-chart-wrap">
                            <Line data={trendLineData} options={trendOpts} />
                        </div>
                    </Section>

                    {/* ── CHAMPION POOL ── */}
                    <Section title="Champion Pool">
                        <table className="db-champ-table">
                            <thead>
                                <tr>
                                    <th></th><th>Champion</th><th>P</th>
                                    <th>WR%</th><th>KDA</th><th>K / D / A</th>
                                    <th>CS/min</th><th>Dmg moy.</th><th>Pris moy.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {champsExt.length > 0 ? champsExt.map(c => {
                                    const wrColor = c.wr >= 55 ? 'var(--win)' : c.wr <= 45 ? 'var(--loss)' : 'var(--text)';
                                    return (
                                        <tr key={c.name}>
                                            <td>
                                                <img className="db-champ-icon"
                                                    src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/champion/${getChampKey(c.name)}.png`}
                                                    onError={e => { e.target.style.opacity = '.2'; }} alt={c.name} title={c.name} />
                                            </td>
                                            <td className="db-champ-name">{c.name}</td>
                                            <td>{c.games}</td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 70 }}>
                                                    <span style={{ color: wrColor, fontWeight: 800, minWidth: 36 }}>{c.wr}%</span>
                                                    <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                                                        <div style={{ height: '100%', width: `${c.wr}%`, background: wrColor, borderRadius: 2 }} />
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ color: cssColor }}>{c.kda}</td>
                                            <td style={{ fontSize: '11px', fontFamily: "'JetBrains Mono',monospace" }}>
                                                <span style={{ color: 'var(--win)' }}>{c.avgK}</span>
                                                <span style={{ color: 'var(--text-dim)' }}>/</span>
                                                <span style={{ color: 'var(--loss)' }}>{c.avgD}</span>
                                                <span style={{ color: 'var(--text-dim)' }}>/</span>
                                                <span style={{ color: 'var(--text-mid)' }}>{c.avgA}</span>
                                            </td>
                                            <td style={{ color: 'var(--gold)' }}>{c.avgCsMin}</td>
                                            <td style={{ color: '#f97316' }}>{fmtK(c.avgDmg)}</td>
                                            <td style={{ color: 'var(--text-mid)', fontSize: '11px' }}>{fmtK(c.avgDmgTaken)}</td>
                                        </tr>
                                    );
                                }) : (
                                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)' }}>Aucune donnée</td></tr>
                                )}
                            </tbody>
                        </table>
                    </Section>

                    {/* ── FULL MATCH LOG ── */}
                    <MatchLog history={h} trackedTag={data?.rawTag} />

                    {/* ── QUEUE BREAKDOWN ── */}
                    <QueueBreakdown history={h} cssColor={cssColor} />

                    {/* ── GAME DURATION ANALYSIS ── */}
                    <GameDurationAnalysis history={h} cssColor={cssColor} />

                    {/* ── TOP ITEMS ── */}
                    <TopItems history={h} />


                </div>
            </div>
        </>
    );
}
