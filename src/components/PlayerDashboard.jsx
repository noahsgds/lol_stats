import { useEffect, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import { D_VER, toFixed, toWR, fmtK, getChampKey, computeChampStats } from '../lib/utils.js';

export default function PlayerDashboard({ data, pid, onClose }) {
    const panelRef = useRef(null);
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

    // ESC to close
    useEffect(() => {
        const handler = e => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handler);
            document.body.style.overflow = '';
        };
    }, [onClose]);

    const handleOverlayClick = e => {
        if (e.target === e.currentTarget) onClose();
    };

    const overviewStats = [
        { lbl: 'Parties',    val: total,                         big: false },
        { lbl: 'Win Rate',   val: wr + '%',                      big: true, col: cssColor },
        { lbl: 'KDA',        val: toFixed(g.kda, 2) + ':1',      big: true, col: cssColor },
        { lbl: 'Dmg moyen',  val: fmtK(Math.round(g.avg_damage || 0)) },
        { lbl: 'CS moyen',   val: Math.round(g.avg_cs || 0) },
        { lbl: 'Vision moy.',val: toFixed(g.avg_vision, 1) },
    ];

    return (
        <div className="db-overlay" onClick={handleOverlayClick}>
            <div className="db-panel" ref={panelRef}>
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

                {/* Champion pool */}
                <div className="db-section">
                    <div className="db-section-title">Champion Pool</div>
                    <table className="db-champ-table">
                        <thead>
                            <tr>
                                <th></th><th>Champion</th><th>Parties</th>
                                <th>WR%</th><th>KDA</th><th>Dmg moy.</th><th>CS moy.</th>
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
                                        <td>{fmtK(c.avgDmg)}</td>
                                        <td>{c.avgCs}</td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-dim)' }}>
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
    );
}
