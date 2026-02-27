import { useState, useEffect } from 'react';
import { API_BASE } from '../lib/utils.js';

const TIER_ORDER = { CHALLENGER: 9, GRANDMASTER: 8, MASTER: 7, DIAMOND: 6, EMERALD: 5, PLATINUM: 4, GOLD: 3, SILVER: 2, BRONZE: 1, IRON: 0 };
const TIER_COLORS = { CHALLENGER: '#f0e68c', GRANDMASTER: '#e84d00', MASTER: '#b24aee', DIAMOND: '#7ad1f5', EMERALD: '#4ade80', PLATINUM: '#5ec4b5', GOLD: '#f0a500', SILVER: '#9db5c0', BRONZE: '#b87240', IRON: '#7a6555' };
const EMBLEM_URL = (tier) => tier ? `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-shared-components/global/default/${tier.toLowerCase()}.png` : null;
const ICON_URL = (id) => `https://ddragon.leagueoflegends.com/cdn/15.1.1/img/profileicon/${id}.png`;

function rankLabel(p) {
    if (!p.solo_tier) return 'Non classé';
    return `${p.solo_tier} ${p.solo_rank || ''} — ${p.solo_lp ?? '?'}LP`;
}

function wRate(p) {
    const t = (p.solo_wins || 0) + (p.solo_losses || 0);
    return t > 0 ? Math.round((p.solo_wins / t) * 100) : null;
}

export default function LandingHero({ soloInput, setSoloInput, queue, setQueue, loading, onAnalyze }) {
    const [players, setPlayers] = useState([]);
    const [loadingPlayers, setLoadingPlayers] = useState(true);
    const [updating, setUpdating] = useState(null); // riotId being updated

    useEffect(() => {
        fetch(`${API_BASE}/stored-players`)
            .then(r => r.json())
            .then(d => {
                const sorted = (d.players || []).sort((a, b) => (TIER_ORDER[b.solo_tier] ?? -1) - (TIER_ORDER[a.solo_tier] ?? -1));
                setPlayers(sorted);
            })
            .catch(() => {})
            .finally(() => setLoadingPlayers(false));
    }, []);

    const handleAnalyze = (player) => {
        const tag = typeof player === 'string' ? player : player.riot_id;
        const rankHint = typeof player === 'object' ? player : null;
        setSoloInput(tag);
        onAnalyze(tag, rankHint);
    };

    const handleUpdate = async (tag) => {
        setUpdating(tag);
        try {
            const r = await fetch(`${API_BASE}/sync?riotId=${encodeURIComponent(tag)}&_t=${Date.now()}`);
            if (r.ok) {
                const d = await r.json();
                if (!d.error && d.rank) {
                    setPlayers(prev => prev.map(p =>
                        p.riot_id === tag
                            ? { ...p, solo_tier: d.rank.solo_tier, solo_rank: d.rank.solo_rank, solo_lp: d.rank.solo_lp, solo_wins: d.rank.solo_wins, solo_losses: d.rank.solo_losses, profile_icon_id: d.rank.profile_icon_id }
                            : p
                    ));
                }
            }
        } catch { /* silently fail */ }
        setUpdating(null);
    };

    const handleKey = e => { if (e.key === 'Enter') onAnalyze(); };

    return (
        <div className="landing-hero">
            <div className="landing-hero-bg" />

            <div className="landing-logo-wrap">
                <div className="landing-hex">⚔</div>
                <div className="landing-title">LoL <span>Mate</span></div>
                <div className="landing-subtitle">
                    Analyse ton gameplay. Identifie tes axes de progression.
                </div>
            </div>

            <div className="landing-search-box">
                <input
                    type="text"
                    value={soloInput}
                    onChange={e => setSoloInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Pseudo#TAG  (ex : Faker#KR1)"
                    autoFocus
                />
                <select
                    className="landing-queue-sel"
                    value={queue}
                    onChange={e => setQueue(e.target.value)}
                >
                    <option value="">Toutes files</option>
                    <option value="420">Solo/Duo</option>
                    <option value="440">Flex</option>
                    <option value="450">ARAM</option>
                    <option value="490">Quickplay</option>
                    <option value="400">Normal</option>
                    <option value="700">Clash</option>
                    <option value="900">URF</option>
                    <option value="1700">Arena</option>
                </select>
                <button className="landing-btn" onClick={() => onAnalyze()} disabled={loading}>
                    {loading ? '⏳' : 'Analyser →'}
                </button>
            </div>

            {/* Stored players grid */}
            <div className="landing-players-section">
                <div className="landing-players-title">Joueurs enregistrés</div>
                {loadingPlayers ? (
                    <div className="landing-players-loading">Chargement…</div>
                ) : players.length === 0 ? (
                    <div className="landing-players-empty">Aucun joueur en base. Lancez une analyse pour en ajouter.</div>
                ) : (
                    <div className="landing-players-grid">
                        {players.map(p => {
                            const wr = wRate(p);
                            const tierColor = TIER_COLORS[p.solo_tier] || 'var(--text-mid)';
                            const emblem = EMBLEM_URL(p.solo_tier);
                            const isUpd = updating === p.riot_id;
                            return (
                                <div key={p.riot_id} className="landing-player-card">
                                    <div className="lpc-top">
                                        <div className="lpc-icon-wrap">
                                            {p.profile_icon_id
                                                ? <img src={ICON_URL(p.profile_icon_id)} alt="" className="lpc-icon" onError={e => { e.target.onerror = null; e.target.style.display = 'none'; }} />
                                                : <div className="lpc-icon-fallback">?</div>
                                            }
                                            {p.summoner_level && <div className="lpc-level">{p.summoner_level}</div>}
                                        </div>
                                        <div className="lpc-info">
                                            <div className="lpc-name">{p.riot_id?.split('#')[0] || p.riot_id}</div>
                                            <div className="lpc-tag">#{p.riot_id?.split('#')[1]}</div>
                                        </div>
                                    </div>
                                    <div className="lpc-rank">
                                        {emblem && <img src={emblem} alt="" className="lpc-emblem" onError={e => { e.target.onerror = null; e.target.style.display = 'none'; }} />}
                                        <div>
                                            <div className="lpc-tier" style={{ color: tierColor }}>{rankLabel(p)}</div>
                                            {wr !== null && (
                                                <div className="lpc-wr">{wr}% WR · {(p.solo_wins || 0) + (p.solo_losses || 0)} games</div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="lpc-actions">
                                        <button className="lpc-btn-analyze" onClick={() => handleAnalyze(p)} disabled={loading}>
                                            Analyser
                                        </button>
                                        <button className="lpc-btn-update" onClick={() => handleUpdate(p.riot_id)} disabled={isUpd || loading}>
                                            {isUpd ? '⏳' : '↻ Update'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
