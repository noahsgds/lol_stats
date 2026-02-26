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
    const ck  = getChampKey(m.champion_name);
    const min = Math.floor((m.game_duration || 0) / 60);
    const sec = String((m.game_duration || 0) % 60).padStart(2, '0');
    const kda = parseFloat(m.kda || 0);

    const items = [m.item0, m.item1, m.item2, m.item3, m.item4, m.item5];

    return (
        <div
            className={`match-row ${m.win ? 'win' : 'lose'} fade-in ${hasDetail ? 'match-row-clickable' : ''}`}
            style={{ animationDelay: `${i * 25}ms` }}
            onClick={onOpen}
            title={hasDetail ? 'Cliquer pour voir le détail du match' : ''}
        >
            <div className="m-stripe" />
            <div className="m-meta">
                <span className="m-queue">{getQ(m.queue_id)}</span>
                <span className="m-time">{timeAgo(m.game_end_timestamp)}</span>
                <span className="m-res">{m.win ? 'Victoire' : 'Défaite'}</span>
                <span className="m-dur">{min}:{sec}</span>
            </div>
            <div className="m-champ">
                <div className="champ-av">
                    <img
                        src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/champion/${ck}.png`}
                        onError={e => { e.target.style.opacity = '.2'; }}
                        title={m.champion_name} alt={m.champion_name}
                    />
                    <div className="champ-lv">{m.champ_level || '?'}</div>
                </div>
            </div>
            <div className="m-kda">
                <div className="m-kda-score">
                    {m.kills}<span className="d">/{m.deaths}</span>/{m.assists}
                </div>
                <div className="m-kda-ratio">{kda.toFixed(1)} KDA</div>
            </div>
            <div className="m-right">
                <div className="items-row">
                    {items.map((item, idx) => (
                        <div key={idx} className="item-sq">
                            {item ? (
                                <img
                                    src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/item/${item}.png`}
                                    onError={e => { e.target.parentElement.style.opacity = '.2'; }}
                                    alt=""
                                />
                            ) : null}
                        </div>
                    ))}
                    <div className="item-sq ward">
                        {m.item6 ? (
                            <img
                                src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/item/${m.item6}.png`}
                                alt=""
                            />
                        ) : null}
                    </div>
                </div>
                <div className="m-badges">
                    {lpChange !== undefined && (
                        <span className={`badge b-lp ${lpChange >= 0 ? 'b-lp-win' : 'b-lp-loss'}`}>
                            {lpChange >= 0 ? '+' : ''}{lpChange} LP
                        </span>
                    )}
                    {kda >= 4 && <span className="badge b-mvp">MVP</span>}
                    {m.kills >= 5 && m.deaths <= 1 && <span className="badge b-dominant">Dominant</span>}
                    {m.deaths >= 8 && <span className="badge b-int">INT</span>}
                    {hasDetail && <span className="badge b-detail">Détail →</span>}
                </div>
            </div>
        </div>
    );
}
