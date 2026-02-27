import { useState } from 'react';
import { D_VER, getChampKey, getQ, timeAgo, fmtK } from '../lib/utils.js';
import MatchDetailModal from './MatchDetail.jsx';

export default function MatchHistory({ history, loading, trackedTag, lpMap = {} }) {
    const [selectedMatchId, setSelectedMatchId] = useState(null);

    if (loading) return null;
    if (!history?.length) {
        return (
            <div className="history">
                <div className="empty">
                    <div className="empty-icon">📭</div>
                    Aucun match trouvé<br />
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>Vérifie que le serveur Node tourne</span>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="history">
                {history.map((m, i) => (
                    <MatchRow
                        key={i} m={m} i={i}
                        onOpen={() => m.match_id && setSelectedMatchId(m.match_id)}
                        hasDetail={!!m.match_id}
                        lpChange={m.match_id && (m.queue_id === 420 || m.queue_id === 440) ? lpMap[m.match_id] : undefined}
                    />
                ))}
            </div>

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

function MatchRow({ m, i, onOpen, hasDetail, lpChange }) {
    const [open, setOpen] = useState(false);

    const ck     = getChampKey(m.champion_name);
    const min    = Math.floor((m.game_duration || 0) / 60);
    const sec    = String((m.game_duration || 0) % 60).padStart(2, '0');
    const kda    = parseFloat(m.kda || 0);
    const durMin = Math.max((m.game_duration || 0) / 60, 1);
    const csMin  = ((m.cs || 0) / durMin).toFixed(1);
    const dmgMin = fmtK(Math.round((m.total_damage || 0) / durMin));
    const items  = [m.item0, m.item1, m.item2, m.item3, m.item4, m.item5];

    return (
        <div className={`mr2-wrap${open ? ' mr2-wrap-open' : ''}`} style={{ animationDelay: `${i * 20}ms` }}>
            {/* ── Main row ── */}
            <div
                className={`mr2 ${m.win ? 'mr2-win' : 'mr2-lose'} fade-in`}
                onClick={() => setOpen(o => !o)}
                style={{ cursor: 'pointer' }}
            >
                {/* Barre colorée */}
                <div className="mr2-stripe" />

                {/* Champion */}
                <div className="mr2-champ">
                    <div className="mr2-av">
                        <img
                            src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/champion/${ck}.png`}
                            onError={e => { e.target.style.opacity = '.2'; }}
                            alt={m.champion_name}
                        />
                        <span className="mr2-lv">{m.champ_level || '?'}</span>
                    </div>
                </div>

                {/* Résultat + file + durée + temps */}
                <div className="mr2-info">
                    <span className="mr2-result">{m.win ? 'Victoire' : 'Défaite'}</span>
                    <span className="mr2-queue">{getQ(m.queue_id)}</span>
                    <div className="mr2-time-dur">{min}:{sec} · {timeAgo(m.game_end_timestamp)}</div>
                </div>

                {/* KDA */}
                <div className="mr2-kda">
                    <div className="mr2-score">
                        <span className="mr2-k">{m.kills}</span>
                        <span className="mr2-slash">/</span>
                        <span className="mr2-d">{m.deaths}</span>
                        <span className="mr2-slash">/</span>
                        <span className="mr2-a">{m.assists}</span>
                    </div>
                    <div className="mr2-ratio">{kda.toFixed(1)} KDA</div>
                </div>

                {/* CS + DMG + LP */}
                <div className="mr2-metrics">
                    <div className="mr2-metric">
                        <span className="mr2-mv">{m.cs || 0}</span>
                        <span className="mr2-ml">CS ({csMin}/m)</span>
                    </div>
                    <div className="mr2-metric">
                        <span className="mr2-mv" style={{ color: '#f97316' }}>{fmtK(m.total_damage || 0)}</span>
                        <span className="mr2-ml">DMG</span>
                    </div>
                    {lpChange !== undefined && (
                        <span className={`mr2-lp ${lpChange >= 0 ? 'mr2-lp-win' : 'mr2-lp-loss'}`}>
                            {lpChange >= 0 ? '+' : ''}{lpChange} LP
                        </span>
                    )}
                </div>

                {/* Items */}
                <div className="mr2-items">
                    {items.map((item, idx) => (
                        <div key={idx} className="mr2-item">
                            {item ? (
                                <img
                                    src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/item/${item}.png`}
                                    onError={e => { e.target.parentElement.style.opacity = '.2'; }}
                                    alt=""
                                />
                            ) : null}
                        </div>
                    ))}
                    <div className="mr2-item mr2-item-ward">
                        {m.item6 ? (
                            <img src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/item/${m.item6}.png`} alt="" />
                        ) : null}
                    </div>
                </div>

                {/* Badges + chevron */}
                <div className="mr2-badges">
                    {kda >= 4 && <span className="badge b-mvp">MVP</span>}
                    {m.kills >= 5 && m.deaths <= 1 && <span className="badge b-dominant">DOM</span>}
                    {m.deaths >= 8 && <span className="badge b-int">INT</span>}
                    <span className="mr2-chevron">{open ? '▲' : '▼'}</span>
                </div>
            </div>

            {/* ── Expanded row ── */}
            {open && (
                <div className={`mr2-expand ${m.win ? 'mr2-expand-win' : 'mr2-expand-lose'}`}>
                    <div className="mr2-expand-stats">
                        <div className="mr2-expand-stat">
                            <span className="mr2-expand-val" style={{ color: '#f97316' }}>{dmgMin}</span>
                            <span className="mr2-expand-lbl">DMG/min</span>
                        </div>
                        <div className="mr2-expand-stat">
                            <span className="mr2-expand-val" style={{ color: 'var(--text-mid)' }}>{fmtK(m.total_damage_taken || 0)}</span>
                            <span className="mr2-expand-lbl">Dmg reçu</span>
                        </div>
                        <div className="mr2-expand-stat">
                            <span className="mr2-expand-val" style={{ color: '#fbbf24' }}>{fmtK(m.gold_earned || 0)}</span>
                            <span className="mr2-expand-lbl">Or gagné</span>
                        </div>
                        <div className="mr2-expand-stat">
                            <span className="mr2-expand-val" style={{ color: '#a78bfa' }}>{m.vision_score || 0}</span>
                            <span className="mr2-expand-lbl">Vision</span>
                        </div>
                        <div className="mr2-expand-stat">
                            <span className="mr2-expand-val">{csMin}</span>
                            <span className="mr2-expand-lbl">CS/min</span>
                        </div>
                    </div>
                    {hasDetail && (
                        <button
                            className="mr2-detail-btn"
                            onClick={e => { e.stopPropagation(); onOpen(); }}
                        >
                            Détail complet →
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
