import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../lib/utils.js';
import { getChampIdMap, champIconUrl, getQueueLabel } from '../lib/ddragon.js';

const TIER_SHORT = {
    IRON: 'FER', BRONZE: 'BRO', SILVER: 'ARG', GOLD: 'OR',
    PLATINUM: 'PLAT', EMERALD: 'EME', DIAMOND: 'DIA',
    MASTER: 'MAÎTRE', GRANDMASTER: 'GM', CHALLENGER: 'CHALL',
};

function rankLabel(tier, rank) {
    if (!tier) return 'Non classé';
    const t = TIER_SHORT[tier] || tier;
    if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier)) return t;
    return `${t} ${rank}`;
}

function LiveTimer({ initialLength }) {
    const [elapsed, setElapsed] = useState(initialLength || 0);
    useEffect(() => {
        const base = Date.now() - (initialLength || 0) * 1000;
        const id = setInterval(() => setElapsed(Math.floor((Date.now() - base) / 1000)), 1000);
        return () => clearInterval(id);
    }, [initialLength]);
    return <span>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>;
}

export default function LiveBanner({ riotId }) {
    const [data, setData] = useState(null);   // null=checking, false=offline, obj=live
    const [champMap, setChampMap] = useState(null);

    const fetchLive = useCallback(async () => {
        if (!riotId) return;
        try {
            const res = await fetch(`${API_BASE}/live?riotId=${encodeURIComponent(riotId)}&_t=${Date.now()}`);
            if (!res.ok) { setData(false); return; }
            const json = await res.json();
            setData(json.inGame ? json : false);
        } catch { setData(false); }
    }, [riotId]);

    useEffect(() => {
        getChampIdMap().then(setChampMap).catch(() => {});
        fetchLive();
        const id = setInterval(fetchLive, 30_000);
        return () => clearInterval(id);
    }, [fetchLive]);

    if (!data) return null;

    const champImg = id => {
        const key = champMap?.[id];
        return key ? champIconUrl(key) : null;
    };

    const team1 = data.participants?.filter(p => p.teamId === 100) || [];
    const team2 = data.participants?.filter(p => p.teamId === 200) || [];

    const [trackedName] = (riotId || '').split('#');

    return (
        <div className="live-banner">
            <div className="live-banner-head">
                <span className="live-dot" />
                <span className="live-label">EN LIVE</span>
                <span className="live-queue-name">{getQueueLabel(data.gameQueueConfigId)}</span>
                <span className="live-timer-wrap">
                    ⏱ <LiveTimer initialLength={data.gameLength || 0} />
                </span>
            </div>
            <div className="live-teams-grid">
                {[
                    { players: team1, label: 'Équipe Bleue', color: '#60a5fa' },
                    { players: team2, label: 'Équipe Rouge', color: '#f87171' },
                ].map(team => (
                    <div key={team.label} className="live-team-col">
                        <div className="live-team-label" style={{ color: team.color }}>{team.label}</div>
                        {team.players.map((p, i) => {
                            const isTracked = trackedName && p.gameName?.toLowerCase() === trackedName.toLowerCase();
                            const img = champImg(p.championId);
                            return (
                                <div key={i} className={`live-player-row${isTracked ? ' live-player-tracked' : ''}`}>
                                    {img ? (
                                        <img className="live-champ-icon" src={img} alt="" onError={e => { e.target.style.opacity = '.3'; }} />
                                    ) : (
                                        <div className="live-champ-icon live-champ-icon-empty" />
                                    )}
                                    <span className="live-player-name">{p.gameName || '—'}</span>
                                    <span className="live-player-rank">{rankLabel(p.soloTier, p.soloRank)}</span>
                                    {p.soloLp !== null && p.soloTier && (
                                        <span className="live-player-lp">{p.soloLp} LP</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
