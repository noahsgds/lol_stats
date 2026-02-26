import { toFixed, toWR, fmtK } from '../lib/utils.js';

function cellClass(v1, v2) {
    const a = parseFloat(v1), b = parseFloat(v2);
    if (a > b) return 'win1';
    if (b > a) return 'win2';
    return 'tied';
}

export default function H2HSection({ g1, g2, tag1, tag2 }) {
    if (!g1 || !g2) return <div className="h2h-section"><div className="empty">—</div></div>;

    const n1  = (tag1 || 'J1').split('#')[0];
    const n2  = (tag2 || 'J2').split('#')[0];
    const wr1 = toWR(g1.win_rate);
    const wr2 = toWR(g2.win_rate);

    const cells = [
        { lbl: 'KDA',           v1: toFixed(g1.kda, 2),           v2: toFixed(g2.kda, 2) },
        { lbl: 'Vision / game', v1: toFixed(g1.avg_vision, 1),    v2: toFixed(g2.avg_vision, 1) },
        { lbl: 'CS / game',     v1: Math.round(g1.avg_cs || 0),   v2: Math.round(g2.avg_cs || 0) },
        { lbl: 'Dégâts',        v1: fmtK(g1.avg_damage || 0),     v2: fmtK(g2.avg_damage || 0) },
        { lbl: 'Gold',          v1: fmtK(g1.avg_gold || 0),        v2: fmtK(g2.avg_gold || 0) },
        { lbl: 'Matchs joués',  v1: parseInt(g1.total_games) || 0, v2: parseInt(g2.total_games) || 0 },
    ];

    return (
        <div className="h2h-section">
            <div className="h2h-banner">
                <div className="h2h-side p1">
                    <div className="h2h-name" style={{ color: 'var(--p1)' }}>{n1}</div>
                    <div className="h2h-big">{wr1}%</div>
                    <div className="h2h-sub">Win Rate</div>
                </div>
                <div className="h2h-mid">VS</div>
                <div className="h2h-side p2">
                    <div className="h2h-name" style={{ color: 'var(--p2)' }}>{n2}</div>
                    <div className="h2h-big">{wr2}%</div>
                    <div className="h2h-sub">Win Rate</div>
                </div>
            </div>
            <div className="h2h-grid">
                {cells.map(s => (
                    <div key={s.lbl} className={`h2h-cell ${cellClass(s.v1, s.v2)}`}>
                        <div className="h2h-cell-lbl">{s.lbl}</div>
                        <div className="h2h-cell-vals">
                            <span className="hcv1">{s.v1 || '-'}</span>
                            <span className="hcsep">·</span>
                            <span className="hcv2">{s.v2 || '-'}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
