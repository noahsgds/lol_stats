import { useState } from 'react';
import { D_VER, toFixed, toWR, fmtK, getChampKey } from '../lib/utils.js';

/* ── Tier helpers ── */
const TIER_FR = {
    IRON: 'Fer', BRONZE: 'Bronze', SILVER: 'Argent', GOLD: 'Or',
    PLATINUM: 'Platine', EMERALD: 'Émeraude', DIAMOND: 'Diamant',
    MASTER: 'Maître', GRANDMASTER: 'Grand Maître', CHALLENGER: 'Challenger',
};
const TIER_COLOR = {
    IRON: '#8b8b8b', BRONZE: '#c87941', SILVER: '#9fb2c0', GOLD: '#f0a500',
    PLATINUM: '#00c8b0', EMERALD: '#4ade80', DIAMOND: '#4cb8d8',
    MASTER: '#a855f7', GRANDMASTER: '#e74c3c', CHALLENGER: '#f1c40f',
};
const emblemCDN = t => t ? `https://opgg-static.akamaized.net/images/medals_new/${t.toLowerCase()}.png` : null;
function emblemFallback(_t, _tried) { return null; }
function tierLabel(tier, rank) {
    if (!tier) return 'Non classé';
    const fr = TIER_FR[tier] || tier;
    return ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier) ? fr : `${fr} ${rank || ''}`;
}

/* ── Top champions computed from history ── */
function topChamps(history, n = 3) {
    const map = {};
    (history || []).forEach(m => {
        const k = m.champion_name || 'Unknown';
        const s = map[k] = map[k] || { g: 0, w: 0, k: 0, d: 0, a: 0 };
        s.g++; if (m.win) s.w++;
        s.k += m.kills || 0; s.d += m.deaths || 0; s.a += m.assists || 0;
    });
    return Object.entries(map)
        .map(([name, s]) => ({
            name,
            games: s.g,
            wr: Math.round(s.w / s.g * 100),
            kda: ((s.k + s.a) / Math.max(s.d, 1)).toFixed(1),
        }))
        .sort((a, b) => b.games - a.games)
        .slice(0, n);
}

export default function ProfileCard({ data, isP2, onDashboard, variant }) {
    const { rank: r, global: g, history: h } = data;
    const [activeQ, setActiveQ] = useState('solo');

    const color   = isP2 ? 'var(--p2)' : 'var(--p1)';
    const colorCls = isP2 ? 'p2-color' : 'p1-color';
    const name    = (r.riot_id || data.rawTag || '').split('#')[0];
    const tag     = (r.riot_id || data.rawTag || '').split('#')[1];

    /* global stats */
    const wr     = parseFloat(toWR(g.win_rate));
    const total  = parseInt(g.total_games) || 0;
    const wins   = Math.round((wr / 100) * total);
    const losses = total - wins;

    /* queue-specific rank */
    const tier   = activeQ === 'solo' ? r.solo_tier   : r.flex_tier;
    const rank   = activeQ === 'solo' ? r.solo_rank   : r.flex_rank;
    const lp     = activeQ === 'solo' ? r.solo_lp     : r.flex_lp;
    const qWins  = activeQ === 'solo' ? (r.solo_wins  ?? null) : (r.flex_wins  ?? null);
    const qLoss  = activeQ === 'solo' ? (r.solo_losses ?? null) : (r.flex_losses ?? null);
    const qG     = (qWins ?? 0) + (qLoss ?? 0);
    const qWr    = qG > 0 ? Math.round((qWins ?? 0) / qG * 100) : null;
    const tColor = TIER_COLOR[tier] || 'var(--text-dim)';
    const eUrl   = emblemCDN(tier);
    const lpPct  = lp !== null && lp !== undefined ? Math.min(100, lp) : 0;

    /* summary stats */
    const avgDmg = Math.round(parseFloat(g.avg_damage) || 0);
    const avgCs  = Math.round(parseFloat(g.avg_cs) || 0);
    const avgVis = Number(parseFloat(g.avg_vision) || 0).toFixed(1);
    const kdaVal = toFixed(g.kda, 2);

    /* top champs + form */
    const champs = topChamps(h);
    const last10 = (h || []).slice(0, 10);

    const isHero = variant === 'hero';

    return (
        <div className={`pc2-wrap fade-in${isHero ? ' pc2-hero' : ''}`}>

            {/* ── Header : avatar · nom · stats rapides ── */}
            <div className={`pc2-header${onDashboard ? ' db-clickable' : ''}`} onClick={onDashboard || undefined} title={onDashboard ? 'Ouvrir le dashboard' : undefined}>
                <div className="pc2-avatar-wrap">
                    <img
                        className="pc2-avatar"
                        src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/profileicon/${r.profile_icon_id || 29}.png`}
                        onError={e => { e.target.onerror = null; e.target.style.opacity = '.3'; }}
                        alt=""
                    />
                    {r.summoner_level ? <span className="pc2-level">Niv.{r.summoner_level}</span> : null}
                </div>
                <div className="pc2-name-block">
                    <div className={`pc2-name ${colorCls}`}>{name}</div>
                    {tag && <div className="pc2-tag">#{tag}</div>}
                    <div className="pc2-quick-stats">
                        <span style={{ color: wr >= 50 ? 'var(--win)' : 'var(--loss)', fontWeight: 800 }}>{wr}%</span>
                        <span className="pc2-sep">·</span>
                        <span>{wins}V {losses}D</span>
                        <span className="pc2-sep">·</span>
                        <span>{kdaVal} KDA</span>
                    </div>
                </div>
            </div>

            {/* ── Rang ── */}
            <div className="pc2-rank-block" onClick={e => e.stopPropagation()}>
                <div className="pc2-tabs">
                    <button className={`pc2-tab ${activeQ === 'solo' ? 'active' : ''}`} onClick={() => setActiveQ('solo')}>Solo/Duo</button>
                    <button className={`pc2-tab ${activeQ === 'flex' ? 'active' : ''}`} onClick={() => setActiveQ('flex')}>Flex</button>
                </div>
                <div className="pc2-rank-body">
                    <div style={{ flexShrink: 0 }}>
                        {eUrl ? (
                            <img className="pc2-emblem" src={eUrl} alt={tier || ''} onError={e => { e.target.style.opacity = '.15'; }} />
                        ) : <div className="pc2-emblem-empty">?</div>}
                    </div>
                    <div className="pc2-rank-info">
                        <div className="pc2-tier-name" style={{ color: tColor }}>{tierLabel(tier, rank)}</div>
                        {tier ? (
                            <>
                                <div className="pc2-lp-row">
                                    <div className="pc2-lp-track">
                                        <div className="pc2-lp-fill" style={{ width: `${lpPct}%`, background: tColor }} />
                                    </div>
                                    <span className="pc2-lp-num">{lp ?? '?'} LP</span>
                                </div>
                                {qWr !== null && (
                                    <div className="pc2-rank-wr">
                                        <span className={qWr >= 50 ? 'pc2-wr-pct-good' : 'pc2-wr-pct-bad'}>{qWr}%</span>
                                        <span className="pc2-wr-games"> · {qG} parties</span>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="pc2-unranked">Aucune partie classée</div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Barre de stats ── */}
            <div className="pc2-stats-bar">
                <div className="pc2-stat-cell">
                    <div className="pc2-sv" style={{ color }}>{kdaVal}</div>
                    <div className="pc2-sl">KDA</div>
                </div>
                <div className="pc2-stat-cell">
                    <div className="pc2-sv" style={{ color: 'var(--gold)' }}>{fmtK(avgDmg)}</div>
                    <div className="pc2-sl">DMG/partie</div>
                </div>
                <div className="pc2-stat-cell">
                    <div className="pc2-sv">{avgCs}</div>
                    <div className="pc2-sl">CS moy.</div>
                </div>
                <div className="pc2-stat-cell">
                    <div className="pc2-sv" style={{ color: '#a78bfa' }}>{avgVis}</div>
                    <div className="pc2-sl">Vision</div>
                </div>
            </div>

            {/* ── Champions joués ── */}
            {champs.length > 0 && (
                <div className="pc2-champs">
                    <div className="pc2-champs-title">Champions joués</div>
                    {champs.map((c, i) => (
                        <div key={i} className="pc2-champ-row">
                            <img
                                className="pc2-champ-icon"
                                src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/champion/${getChampKey(c.name)}.png`}
                                onError={e => { e.target.style.opacity = '.2'; }}
                                alt={c.name}
                            />
                            <span className="pc2-champ-name">{c.name}</span>
                            <span className="pc2-champ-g">{c.games}G</span>
                            <span className={`pc2-champ-wr ${c.wr >= 50 ? 'good' : 'bad'}`}>{c.wr}%</span>
                            <span className="pc2-champ-kda">{c.kda} KDA</span>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Forme récente ── */}
            {last10.length > 0 && (
                <div className="pc2-form">
                    {last10.map((m, i) => (
                        <div key={i} className={`pc2-form-dot ${m.win ? 'W' : 'L'}`} title={m.win ? 'Victoire' : 'Défaite'} />
                    ))}
                </div>
            )}

            {/* ── Dashboard ── */}
            {onDashboard && (
                <button className="pc2-dash-btn" onClick={e => { e.stopPropagation(); onDashboard(); }}>
                    📊 Dashboard complet →
                </button>
            )}
        </div>
    );
}
