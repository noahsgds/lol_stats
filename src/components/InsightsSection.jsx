import { fmtK } from '../lib/utils.js';

function calcInsights(history) {
    if (!history?.length) return {};
    const mvpCount   = history.filter(m => parseFloat(m.kda) >= 4).length;
    const intCount   = history.filter(m => (m.deaths || 0) >= 8).length;
    const winStreak  = (() => { let s = 0; for (const m of history) { if (m.win) s++; else break; } return s; })();
    const lossStreak = (() => { let s = 0; for (const m of history) { if (!m.win) s++; else break; } return s; })();
    const earlyWins  = history.filter(m => m.win && (m.game_duration || 0) < 25 * 60).length;
    const lateWins   = history.filter(m => m.win && (m.game_duration || 0) > 35 * 60).length;
    const avgDmgPerMin = history.reduce((acc, m) => acc + (m.total_damage || 0) / Math.max((m.game_duration || 1) / 60, 1), 0) / history.length;
    return { mvpCount, intCount, winStreak, lossStreak, earlyWins, lateWins, avgDmgPerMin: Math.round(avgDmgPerMin) };
}

function winner(v1, v2, higherIsBetter = true) {
    if (v1 === v2) return 'tie';
    return higherIsBetter ? (v1 > v2 ? 'p1' : 'p2') : (v1 < v2 ? 'p1' : 'p2');
}

export default function InsightsSection({ h1, h2, tag1, tag2 }) {
    if (!h1 || !h2) return <div className="insights"><div className="empty">—</div></div>;

    const n1 = (tag1 || 'J1').split('#')[0];
    const n2 = (tag2 || 'J2').split('#')[0];
    const s1 = calcInsights(h1);
    const s2 = calcInsights(h2);

    const rows = [
        {
            icon: '⚡', title: 'Dégâts / minute',
            v1: s1.avgDmgPerMin || 0, v2: s2.avgDmgPerMin || 0,
            fmt: v => fmtK(v), w: winner(s1.avgDmgPerMin, s2.avgDmgPerMin),
        },
        {
            icon: '🏆', title: 'Performances MVP (KDA ≥ 4)',
            v1: s1.mvpCount || 0, v2: s2.mvpCount || 0,
            fmt: v => v + ' matchs', w: winner(s1.mvpCount, s2.mvpCount),
        },
        {
            icon: '⚰️', title: 'Matchs catastrophiques (Deaths ≥ 8)',
            v1: s1.intCount || 0, v2: s2.intCount || 0,
            fmt: v => v + ' matchs', w: winner(s1.intCount, s2.intCount, false),
        },
        {
            icon: '🌅', title: 'Victoires early game (< 25 min)',
            v1: s1.earlyWins || 0, v2: s2.earlyWins || 0,
            fmt: v => v + ' victoires', w: winner(s1.earlyWins, s2.earlyWins),
        },
        {
            icon: '🌙', title: 'Victoires late game (> 35 min)',
            v1: s1.lateWins || 0, v2: s2.lateWins || 0,
            fmt: v => v + ' victoires', w: winner(s1.lateWins, s2.lateWins),
        },
        {
            icon: '🔥', title: 'Série en cours',
            v1: s1.winStreak ? `${s1.winStreak}W` : (s1.lossStreak ? `${s1.lossStreak}L` : '—'),
            v2: s2.winStreak ? `${s2.winStreak}W` : (s2.lossStreak ? `${s2.lossStreak}L` : '—'),
            fmt: v => v, w: winner(s1.winStreak || 0, s2.winStreak || 0),
        },
    ];

    return (
        <div className="insights">
            {rows.map(row => (
                <div key={row.title} className="insight-row fade-in">
                    <div className="insight-icon">{row.icon}</div>
                    <div className="insight-body">
                        <div className="insight-title">{row.title}</div>
                        <div className="insight-vals">
                            <span className="iv1">{row.fmt(row.v1)}</span>
                            <span className="iv-sep">vs</span>
                            <span className="iv2">{row.fmt(row.v2)}</span>
                            {row.w === 'tie'
                                ? <span className="iv-winner tie">Égalité</span>
                                : <span className={`iv-winner ${row.w}`}>↑ {row.w === 'p1' ? n1 : n2}</span>
                            }
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
