import { Doughnut } from 'react-chartjs-2';
import { D_VER, toFixed, toWR, fmtK } from '../lib/utils.js';

export default function ProfileCard({ data, isP2, onDashboard }) {
    const { rank: r, global: g, history: h } = data;
    const color  = isP2 ? 'var(--p2)' : 'var(--p1)';
    const cls    = isP2 ? 'p2-color' : 'p1-color';
    const name   = (r.riot_id || data.rawTag || '').split('#')[0];
    const wr     = parseFloat(toWR(g.win_rate));
    const total  = parseInt(g.total_games) || 0;
    const wins   = Math.round((wr / 100) * total);
    const losses = total - wins;
    const tier   = r.solo_tier || 'UNRANKED';
    const lp     = r.solo_lp !== undefined ? ` · ${r.solo_lp} LP` : '';

    const avgDmg = Math.round(parseFloat(g.avg_damage) || 0);
    const avgCS  = Math.round(parseFloat(g.avg_cs) || 0);
    const avgVis = Number(parseFloat(g.avg_vision) || 0).toFixed(1);

    const last10   = (h || []).slice(0, 10);
    const donutData = {
        datasets: [{
            data: [wins || 1, losses || 1],
            backgroundColor: [isP2 ? '#e84d00' : '#f0a500', '#2a2416'],
            borderWidth: 0,
        }],
    };
    const donutOpts = {
        cutout: '70%',
        plugins: { legend: { display: false }, datalabels: { display: false } },
    };

    return (
        <>
            <div className="profile-box fade-in db-clickable" onClick={onDashboard} title="Voir le dashboard">
                <div className="profile-header">
                    <div className="avatar-frame">
                        <img
                            src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/profileicon/${r.profile_icon_id || 29}.png`}
                            onError={e => { e.target.src = `https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/profileicon/29.png`; }}
                            alt=""
                        />
                        <div className={`rank-chip ${tier === 'UNRANKED' ? 'unranked' : ''}`}>
                            {tier === 'UNRANKED' ? 'UNRANKED' : `${tier.slice(0, 1)} ${r.solo_rank || ''}`}
                        </div>
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <div className={`profile-name ${cls}`}>{name}</div>
                            {r.summoner_level ? (
                                <span style={{
                                    fontSize: '10px', fontWeight: 700,
                                    fontFamily: "'JetBrains Mono', monospace",
                                    background: 'var(--border)', color: 'var(--text-mid)',
                                    padding: '2px 7px', borderRadius: '4px', flexShrink: 0,
                                }}>Niv.{r.summoner_level}</span>
                            ) : null}
                        </div>
                        <div className="profile-rank-text">
                            {tier === 'UNRANKED' ? 'Non classé' : `Solo: ${tier} ${r.solo_rank || ''}${lp}`}
                        </div>
                        {r.flex_tier ? (
                            <div className="profile-rank-text" style={{ fontSize: '10px', opacity: 0.75 }}>
                                Flex: {r.flex_tier} {r.flex_rank || ''} · {r.flex_lp ?? '?'} LP
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className="profile-bigstats">
                    <div className="donut-wrap">
                        <Doughnut data={donutData} options={donutOpts} />
                        <div className="donut-inner">
                            <span className="donut-pct" style={{ color }}>{wr}%</span>
                            <span className="donut-lbl">W/R</span>
                        </div>
                    </div>
                    <div>
                        <div className="kda-main">{toFixed(g.kda, 2)}<span className="kda-unit">:1</span></div>
                        <div className="kda-record">{wins}V — {losses}D — {total} matchs</div>
                        <div className="kda-breakdown">
                            <span className="kdb-item"><span style={{ color: 'var(--win)' }}>{toFixed(g.avg_kills, 1)}</span> <span className="lbl">K</span></span>
                            <span className="kdb-item"><span style={{ color: 'var(--loss)' }}>{toFixed(g.avg_deaths, 1)}</span> <span className="lbl">D</span></span>
                            <span className="kdb-item"><span style={{ color: 'var(--text-mid)' }}>{toFixed(g.avg_assists, 1)}</span> <span className="lbl">A</span></span>
                        </div>
                    </div>
                </div>

                <div className="profile-mini-grid">
                    <div className="mini-stat">
                        <div className="mini-stat-val" style={{ color: 'var(--gold)' }}>{fmtK(avgDmg)}</div>
                        <div className="mini-stat-lbl">Dégâts moy.</div>
                    </div>
                    <div className="mini-stat">
                        <div className="mini-stat-val">{avgCS}</div>
                        <div className="mini-stat-lbl">CS / partie</div>
                    </div>
                    <div className="mini-stat">
                        <div className="mini-stat-val">{avgVis}</div>
                        <div className="mini-stat-lbl">Vision moy.</div>
                    </div>
                </div>
            </div>

            <div className="form-strip">
                <div className="form-label">Forme — {last10.length} derniers matchs</div>
                <div className="form-dots">
                    {last10.length > 0
                        ? last10.map((m, i) => (
                            <div key={i} className={`form-dot ${m.win ? 'W' : 'L'}`} title={m.win ? 'Victoire' : 'Défaite'} />
                        ))
                        : <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>—</span>
                    }
                </div>
            </div>
        </>
    );
}
