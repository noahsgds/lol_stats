import { useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { D_VER, toFixed, toWR, fmtK } from '../lib/utils.js';

const TIER_SHORT = {
    IRON: 'Fer', BRONZE: 'Bronze', SILVER: 'Argent', GOLD: 'Or',
    PLATINUM: 'Platine', EMERALD: 'Émeraude', DIAMOND: 'Diamant',
    MASTER: 'Maître', GRANDMASTER: 'Grand Maître', CHALLENGER: 'Challenger',
};
const TIER_COLOR = {
    IRON: '#9e9e9e', BRONZE: '#cd7f32', SILVER: '#a8b0b8', GOLD: '#f0a500',
    PLATINUM: '#00e0d0', EMERALD: '#4ade80', DIAMOND: '#4fc3f7',
    MASTER: '#9b59b6', GRANDMASTER: '#e74c3c', CHALLENGER: '#f1c40f',
};
const EMBLEM_CDN = 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/ranked-emblem/';
const emblemUrl = tier => tier ? `${EMBLEM_CDN}emblem-${tier.toLowerCase()}.png` : null;

function rankLabel(tier, rank) {
    if (!tier) return 'Non classé';
    const t = TIER_SHORT[tier] || tier;
    if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier)) return t;
    return `${t} ${rank || ''}`;
}

function fmtDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y.slice(2)}`;
}

export default function ProfileCard({ data, isP2, onDashboard }) {
    const { rank: r, global: g, history: h } = data;
    const [activeQueue, setActiveQueue] = useState('solo');

    const color = isP2 ? 'var(--p2)' : 'var(--p1)';
    const cls   = isP2 ? 'p2-color' : 'p1-color';
    const name  = (r.riot_id || data.rawTag || '').split('#')[0];
    const tag   = (r.riot_id || data.rawTag || '').split('#')[1];

    const wr     = parseFloat(toWR(g.win_rate));
    const total  = parseInt(g.total_games) || 0;
    const wins   = Math.round((wr / 100) * total);
    const losses = total - wins;

    // Queue-specific rank data
    const q         = activeQueue;
    const curTier   = q === 'solo' ? r.solo_tier   : r.flex_tier;
    const curRank   = q === 'solo' ? r.solo_rank   : r.flex_rank;
    const curLp     = q === 'solo' ? r.solo_lp     : r.flex_lp;
    const curWins   = q === 'solo' ? (r.solo_wins  ?? null) : (r.flex_wins  ?? null);
    const curLosses = q === 'solo' ? (r.solo_losses ?? null) : (r.flex_losses ?? null);
    const qGames    = (curWins ?? 0) + (curLosses ?? 0);
    const qWrPct    = qGames > 0 ? Math.round((curWins ?? 0) / qGames * 100) : null;
    const tierColor = TIER_COLOR[curTier] || 'var(--text-dim)';
    const eUrl      = emblemUrl(curTier);

    // Rank history snapshots (most recent first)
    const snapshots = (r.rank_history || []).slice(-6).reverse();

    // Donut chart
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

    const avgDmg = Math.round(parseFloat(g.avg_damage) || 0);
    const avgCS  = Math.round(parseFloat(g.avg_cs) || 0);
    const avgVis = Number(parseFloat(g.avg_vision) || 0).toFixed(1);
    const last10 = (h || []).slice(0, 10);

    return (
        <>
            <div className="profile-box fade-in db-clickable" onClick={onDashboard} title="Voir le dashboard">

                {/* ── Header : avatar + nom ── */}
                <div className="profile-header">
                    <div className="avatar-frame">
                        <img
                            src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/profileicon/${r.profile_icon_id || 29}.png`}
                            onError={e => { e.target.src = `https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/profileicon/29.png`; }}
                            alt=""
                        />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <div className={`profile-name ${cls}`}>{name}</div>
                            {r.summoner_level ? (
                                <span className="pc-level-badge">Niv.{r.summoner_level}</span>
                            ) : null}
                        </div>
                        {tag && <div className="pc-tag">#{tag}</div>}
                    </div>
                </div>

                {/* ── Section rang ── */}
                <div className="pc-rank-section" onClick={e => e.stopPropagation()}>
                    {/* Toggle Solo / Flex */}
                    <div className="pc-queue-tabs">
                        <button
                            className={`pc-tab ${q === 'solo' ? 'active' : ''}`}
                            onClick={() => setActiveQueue('solo')}
                        >Solo / Duo</button>
                        <button
                            className={`pc-tab ${q === 'flex' ? 'active' : ''}`}
                            onClick={() => setActiveQueue('flex')}
                        >Flex</button>
                    </div>

                    {/* Emblème + infos rang */}
                    <div className="pc-rank-display">
                        <div className="pc-emblem-wrap">
                            {eUrl ? (
                                <img
                                    className="pc-rank-emblem"
                                    src={eUrl}
                                    alt={curTier || ''}
                                    onError={e => { e.target.style.opacity = '.15'; }}
                                />
                            ) : (
                                <div className="pc-rank-emblem pc-rank-emblem-empty">?</div>
                            )}
                        </div>
                        <div className="pc-rank-info">
                            <div className="pc-rank-name" style={{ color: tierColor }}>
                                {rankLabel(curTier, curRank)}
                            </div>
                            {curLp !== null && curLp !== undefined && curTier && (
                                <div className="pc-rank-lp">{curLp} LP</div>
                            )}
                            {qWrPct !== null && (
                                <div className={`pc-rank-wr ${qWrPct >= 50 ? 'pc-wr-win' : 'pc-wr-loss'}`}>
                                    {qWrPct}% <span className="pc-wr-games">({qGames}G)</span>
                                </div>
                            )}
                            {!curTier && (
                                <div className="pc-rank-lp" style={{ color: 'var(--text-dim)' }}>Aucune partie classée</div>
                            )}
                        </div>
                    </div>

                    {/* Historique des rangs */}
                    {snapshots.length > 0 && (
                        <div className="pc-history">
                            <div className="pc-history-title">Historique des rangs</div>
                            {snapshots.map((snap, i) => {
                                const sTier = snap[`${q}_tier`];
                                const sRank = snap[`${q}_rank`];
                                const sLp   = snap[`${q}_lp`];
                                const sUrl  = emblemUrl(sTier);
                                return (
                                    <div key={i} className="pc-history-row">
                                        <div className="pc-history-emblem-wrap">
                                            {sUrl ? (
                                                <img className="pc-history-emblem" src={sUrl} alt="" onError={e => { e.target.style.opacity = '.2'; }} />
                                            ) : (
                                                <div className="pc-history-emblem pc-history-emblem-empty" />
                                            )}
                                        </div>
                                        <span className="pc-history-rank" style={{ color: TIER_COLOR[sTier] || 'var(--text-dim)' }}>
                                            {rankLabel(sTier, sRank)}
                                        </span>
                                        {sLp !== null && sLp !== undefined && sTier && (
                                            <span className="pc-history-lp">{sLp} LP</span>
                                        )}
                                        <span className="pc-history-date">{fmtDate(snap.date)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── Stats globales ── */}
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

                <button className="db-open-btn" onClick={e => { e.stopPropagation(); onDashboard(); }}>
                    📊 Dashboard complet →
                </button>
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
