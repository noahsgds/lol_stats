import { useState, useEffect, useCallback } from 'react';
import { API_BASE, D_VER } from '../lib/utils.js';
import { getChampIdMap, champIconUrl, getQueueLabel } from '../lib/ddragon.js';

const TIER_SHORT = {
    IRON: 'FER', BRONZE: 'BRO', SILVER: 'ARG', GOLD: 'OR',
    PLATINUM: 'PLAT', EMERALD: 'EME', DIAMOND: 'DIA',
    MASTER: 'MAÎTRE', GRANDMASTER: 'GM', CHALLENGER: 'CHALL',
};
const TIER_COLOR = {
    IRON: '#9e9e9e', BRONZE: '#cd7f32', SILVER: '#a8b0b8', GOLD: '#f0a500',
    PLATINUM: '#00e0d0', EMERALD: '#4ade80', DIAMOND: '#4fc3f7',
    MASTER: '#9b59b6', GRANDMASTER: '#e74c3c', CHALLENGER: '#f1c40f',
};
const SPELL_KEYS = {
    1: 'SummonerBoost', 3: 'SummonerExhaust', 4: 'SummonerFlash',
    6: 'SummonerHaste', 7: 'SummonerHeal', 11: 'SummonerSmite',
    12: 'SummonerTeleport', 13: 'SummonerMana', 14: 'SummonerDot',
    21: 'SummonerBarrier', 32: 'SummonerSnowball',
};

function spellUrl(id) {
    const k = SPELL_KEYS[id];
    return k ? `https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/spell/${k}.png` : null;
}

function rankLabel(tier, rank) {
    if (!tier) return 'Non classé';
    const t = TIER_SHORT[tier] || tier;
    if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier)) return t;
    return `${t} ${rank}`;
}

function wrPct(wins, losses) {
    const total = (wins || 0) + (losses || 0);
    if (!total) return null;
    return { pct: Math.round((wins / total) * 100), total };
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
    const [data, setData] = useState(null);
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
    const bans1 = (data.bannedChampions || []).filter(b => b.teamId === 100 && b.championId !== -1);
    const bans2 = (data.bannedChampions || []).filter(b => b.teamId === 200 && b.championId !== -1);

    const [trackedName] = (riotId || '').split('#');

    const TeamColumn = ({ players, bans, label, color }) => (
        <div className="live-team-col">
            <div className="live-team-label" style={{ color }}>{label}</div>
            {players.map((p, i) => {
                const isTracked = trackedName && p.gameName?.toLowerCase() === trackedName.toLowerCase();
                const img = champImg(p.championId);
                const sp1 = spellUrl(p.spell1Id);
                const sp2 = spellUrl(p.spell2Id);
                const wr = wrPct(p.soloWins, p.soloLosses);
                const tierColor = TIER_COLOR[p.soloTier] || 'var(--text-mid)';
                return (
                    <div key={i} className={`live-player-row${isTracked ? ' live-player-tracked' : ''}`}>
                        <div className="live-champ-wrap">
                            {img
                                ? <img className="live-champ-icon" src={img} alt="" onError={e => { e.target.style.opacity = '.3'; }} />
                                : <div className="live-champ-icon live-champ-icon-empty" />
                            }
                        </div>
                        <div className="live-spells">
                            {sp1 && <img className="live-spell-icon" src={sp1} alt="" />}
                            {sp2 && <img className="live-spell-icon" src={sp2} alt="" />}
                        </div>
                        <span className="live-player-name">{p.gameName || '—'}</span>
                        <div className="live-player-stats">
                            {p.soloTier ? (
                                <>
                                    <span className="live-player-rank" style={{ color: tierColor }}>
                                        {rankLabel(p.soloTier, p.soloRank)}
                                        {p.soloLp !== null && <span className="live-player-lp"> · {p.soloLp} LP</span>}
                                    </span>
                                    {wr && (
                                        <span className={`live-wr ${wr.pct >= 50 ? 'live-wr-win' : 'live-wr-loss'}`}>
                                            {wr.pct}% <span className="live-wr-games">({wr.total}G)</span>
                                        </span>
                                    )}
                                </>
                            ) : (
                                <span className="live-player-rank" style={{ color: 'var(--text-dim)' }}>Non classé</span>
                            )}
                        </div>
                    </div>
                );
            })}
            {bans.length > 0 && (
                <div className="live-bans">
                    <span className="live-bans-label">Bans :</span>
                    {bans.map((b, i) => {
                        const img = champImg(b.championId);
                        return img
                            ? <img key={i} className="live-ban-icon" src={img} alt="" onError={e => { e.target.style.opacity = '.2'; }} />
                            : null;
                    })}
                </div>
            )}
        </div>
    );

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
                <TeamColumn players={team1} bans={bans1} label="Équipe Bleue" color="#60a5fa" />
                <TeamColumn players={team2} bans={bans2} label="Équipe Rouge" color="#f87171" />
            </div>
        </div>
    );
}
