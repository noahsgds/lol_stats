import { fmtK } from '../lib/utils.js';

export default function CombatSection({ g1, g2 }) {
    if (!g1 || !g2) return <div className="combat-section"><div className="empty">—</div></div>;

    const rows = [
        { lbl: 'Dégâts moyens',  v1: parseFloat(g1.avg_damage) || 0,       v2: parseFloat(g2.avg_damage) || 0,       fmt: fmtK },
        { lbl: 'Dégâts reçus',   v1: parseFloat(g1.avg_damage_taken) || 0, v2: parseFloat(g2.avg_damage_taken) || 0, fmt: fmtK },
        { lbl: 'Gold moyen',     v1: parseFloat(g1.avg_gold) || 0,          v2: parseFloat(g2.avg_gold) || 0,          fmt: fmtK },
        { lbl: 'CS / partie',    v1: parseFloat(g1.avg_cs) || 0,            v2: parseFloat(g2.avg_cs) || 0,            fmt: n => Math.round(n) },
        { lbl: 'Vision / partie',v1: parseFloat(g1.avg_vision) || 0,        v2: parseFloat(g2.avg_vision) || 0,        fmt: n => Number(n).toFixed(1) },
    ];

    return (
        <div className="combat-section">
            {rows.map(row => {
                const tot  = row.v1 + row.v2 || 1;
                const pct1 = Math.round((row.v1 / tot) * 100);
                const pct2 = 100 - pct1;
                return (
                    <div key={row.lbl} className="combat-row">
                        <div className="combat-row-head">
                            <span className="cr-label">{row.lbl}</span>
                            <span className="cr-vals">
                                <span className="cr-v1">{row.fmt(row.v1)}</span>
                                <span className="cr-v2">{row.fmt(row.v2)}</span>
                            </span>
                        </div>
                        <div className="duel-track">
                            <div className="duel-p1" style={{ width: `${pct1}%` }}>{pct1}%</div>
                            <div className="duel-p2" style={{ width: `${pct2}%` }}>{pct2}%</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
