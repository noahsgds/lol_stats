import { useState, useEffect, useMemo } from 'react';
import { D_VER, API_BASE, getChampKey, timeAgo } from '../lib/utils.js';

const DDRAGON = `https://ddragon.leagueoflegends.com/cdn/${D_VER}`;

/* ── Fetch champion list from Data Dragon ── */
async function fetchChampionList() {
    const res = await fetch(`${DDRAGON}/data/fr_FR/champion.json`);
    const json = await res.json();
    return Object.values(json.data).sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchChampionDetail(key) {
    const res = await fetch(`${DDRAGON}/data/fr_FR/champion/${key}.json`);
    const json = await res.json();
    return Object.values(json.data)[0];
}

/* ── Fetch our own DB stats ── */
async function fetchChampStats(champ) {
    try {
        const res = await fetch(`${API_BASE}/champion-stats?champ=${encodeURIComponent(champ)}`);
        if (!res.ok) return null;
        return await res.json();
    } catch { return null; }
}

async function fetchChampProbuilds(champ) {
    try {
        const res = await fetch(`${API_BASE}/champion-probuilds?champ=${encodeURIComponent(champ)}`);
        if (!res.ok) return [];
        const json = await res.json();
        return json.games || [];
    } catch { return []; }
}

async function fetchChallengerBuilds(champ) {
    try {
        const res = await fetch(`${API_BASE}/challenger-builds?champ=${encodeURIComponent(champ)}`);
        if (!res.ok) return [];
        const json = await res.json();
        return json.games || [];
    } catch { return []; }
}

async function fetchChampMatchups(champ) {
    try {
        const res = await fetch(`${API_BASE}/champion-matchups?champ=${encodeURIComponent(champ)}`);
        if (!res.ok) return [];
        const json = await res.json();
        return json.matchups || [];
    } catch { return []; }
}

/* ── BuildTab ── */
function BuildTab({ champKey, champName, detail }) {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetchChampStats(champName).then(d => { setStats(d); setLoading(false); });
    }, [champName]);

    // Data Dragon recommended build as fallback
    const ddRec = detail?.recommended?.[0];
    const ddItems = ddRec?.blocks?.[0]?.items?.slice(0, 6) || [];

    if (loading) return <div className="chp-pb-loading">Calcul des builds en cours…</div>;

    const items = stats?.topItems?.length > 0 ? stats.topItems : null;
    const totalGames = stats?.games || 0;

    return (
        <div>
            <div className="chp-source-note">
                {totalGames > 0
                    ? `Basé sur ${totalGames} parties analysées dans notre base de données`
                    : 'Build recommandé Data Dragon (données DB insuffisantes)'}
            </div>
            <div className="chp-build-grid">
                {/* Items les plus joués */}
                <div className="chp-build-section">
                    <div className="chp-build-section-title">Items les plus joués</div>
                    {items ? items.slice(0, 6).map((item, i) => (
                        <div key={item.id} className="chp-item-row">
                            <div className="chp-item-rank">#{i + 1}</div>
                            <div className="chp-item-icon-lg">
                                <img
                                    src={`${DDRAGON}/img/item/${item.id}.png`}
                                    alt={item.name}
                                    onError={e => { e.target.onerror = null; e.target.style.opacity = '.2'; }}
                                />
                            </div>
                            <div className="chp-item-info">
                                <div className="chp-item-name-txt">{item.name}</div>
                                <div className="chp-item-bar-wrap">
                                    <div className="chp-item-bar-bg">
                                        <div className="chp-item-bar-fill" style={{ width: `${Math.min(item.pickPct, 100)}%` }} />
                                    </div>
                                    <div className="chp-item-pct">{item.pickPct}% · {item.wr}% WR</div>
                                </div>
                            </div>
                        </div>
                    )) : ddItems.length > 0 ? ddItems.map((item, i) => (
                        <div key={item.id + i} className="chp-item-row">
                            <div className="chp-item-rank">#{i + 1}</div>
                            <div className="chp-item-icon-lg">
                                <img
                                    src={`${DDRAGON}/img/item/${item.id}.png`}
                                    alt=""
                                    onError={e => { e.target.onerror = null; e.target.style.opacity = '.2'; }}
                                />
                            </div>
                            <div className="chp-item-info">
                                <div className="chp-item-name-txt">Item #{item.id}</div>
                                <div className="chp-item-pct" style={{ marginTop: 4 }}>Recommandé Riot</div>
                            </div>
                        </div>
                    )) : <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '12px 0' }}>Aucune donnée d'item disponible.</div>}
                </div>

                {/* Sorts & Stats globales */}
                <div className="chp-build-section">
                    <div className="chp-build-section-title">Sorts d'invocateur les plus joués</div>
                    {stats?.topSpells?.length > 0 ? stats.topSpells.map((sp, i) => (
                        <div key={sp.d + i} className="chp-item-row">
                            <div className="chp-item-rank">#{i + 1}</div>
                            <div className="chp-item-icon-lg" style={{ borderRadius: 6 }}>
                                <img src={`${DDRAGON}/img/spell/${sp.d}.png`} alt={sp.d}
                                    onError={e => { e.target.onerror = null; e.target.style.opacity = '.2'; }} />
                            </div>
                            <div className="chp-item-info">
                                <div className="chp-item-name-txt">{sp.d}</div>
                                <div className="chp-item-pct" style={{ marginTop: 4 }}>
                                    avec {sp.f} · {sp.pct}% des parties
                                </div>
                            </div>
                        </div>
                    )) : (
                        <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '12px 0' }}>
                            Données insuffisantes.
                        </div>
                    )}

                    {stats && (
                        <>
                            <div className="chp-build-section-title" style={{ marginTop: 24 }}>Résumé</div>
                            {[
                                { lbl: 'Winrate', val: `${stats.wr}%`, col: stats.wr >= 52 ? 'var(--win)' : stats.wr <= 48 ? 'var(--loss)' : 'var(--text)' },
                                { lbl: 'KDA moyen', val: stats.kda?.toFixed(2) || '—' },
                                { lbl: 'CS/min moyen', val: stats.csMin?.toFixed(1) || '—' },
                                { lbl: 'Parties analysées', val: stats.games || 0 },
                            ].map(s => (
                                <div key={s.lbl} className="chp-item-row" style={{ paddingLeft: 28 }}>
                                    <div style={{ flex: 1, fontSize: 14, color: 'var(--text-mid)' }}>{s.lbl}</div>
                                    <div style={{ fontSize: 15, fontWeight: 800, color: s.col || 'var(--text)', fontFamily: "'JetBrains Mono', monospace" }}>{s.val}</div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

const TIER_BADGE = { CHALLENGER: '#f0e68c', GRANDMASTER: '#e84d00', MASTER: '#b24aee', DIAMOND: '#7ad1f5', EMERALD: '#4ade80', PLATINUM: '#5ec4b5' };

function ProBuildRow({ g }) {
    const tierColor = TIER_BADGE[g.tier] || 'var(--text-mid)';
    return (
        <div className={`chp-pb-row ${g.win ? 'win' : 'loss'}`}>
            <div className={`chp-pb-result ${g.win ? 'win' : 'loss'}`}>{g.win ? 'V' : 'D'}</div>
            <div className="chp-pb-player">
                <div className="chp-pb-name">{g.playerName}</div>
                <div className="chp-pb-rank" style={{ color: tierColor }}>
                    {g.tier ? `${g.tier}${g.rank ? ' ' + g.rank : ''}${g.lp != null ? ' · ' + g.lp + 'LP' : ''}` : 'Rang inconnu'}
                </div>
            </div>
            <div className="chp-pb-kda">{g.kills}/{g.deaths}/{g.assists}</div>
            <div className="chp-pb-items">
                {[g.item0, g.item1, g.item2, g.item3, g.item4, g.item5].filter(Boolean).map((id, j) => (
                    <div key={j} className="chp-pb-item">
                        <img src={`${DDRAGON}/img/item/${id}.png`} alt=""
                            onError={e => { e.target.onerror = null; e.target.style.display = 'none'; }} />
                    </div>
                ))}
            </div>
            <div className="chp-pb-time">{g.gameDate}</div>
        </div>
    );
}

/* ── ProBuildTab ── */
function ProBuildTab({ champName }) {
    const [dbGames, setDbGames] = useState(null);
    const [challGames, setChallGames] = useState(null);
    const [loadingDb, setLoadingDb] = useState(true);
    const [loadingChall, setLoadingChall] = useState(true);

    useEffect(() => {
        setLoadingDb(true);
        setLoadingChall(true);
        setDbGames(null);
        setChallGames(null);
        fetchChampProbuilds(champName).then(g => { setDbGames(g); setLoadingDb(false); });
        fetchChallengerBuilds(champName).then(g => { setChallGames(g); setLoadingChall(false); });
    }, [champName]);

    const hasChall = challGames?.length > 0;
    const hasDb    = dbGames?.length > 0;
    const allDone  = !loadingDb && !loadingChall;

    return (
        <div className="chp-probuild-list">
            {/* Challenger section */}
            <div className="chp-matchup-section">
                <div className="chp-matchup-section-title" style={{ color: '#f0e68c' }}>
                    👑 Parties Challenger en direct
                </div>
                {loadingChall ? (
                    <div className="chp-pb-loading" style={{ padding: '14px 0' }}>
                        Récupération des builds Challenger… (peut prendre 20–40s)
                    </div>
                ) : hasChall ? (
                    challGames.map((g, i) => <ProBuildRow key={i} g={g} />)
                ) : (
                    <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '8px 0' }}>
                        Aucun Challenger trouvé pour ce champion (essaie un champion très joué).
                    </div>
                )}
            </div>

            {/* DB section */}
            <div className="chp-matchup-section" style={{ marginTop: 24 }}>
                <div className="chp-matchup-section-title">
                    🗄 Parties dans notre base de données
                </div>
                {loadingDb ? (
                    <div className="chp-pb-loading" style={{ padding: '14px 0' }}>Chargement…</div>
                ) : hasDb ? (
                    dbGames.map((g, i) => <ProBuildRow key={i} g={g} />)
                ) : (
                    <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '8px 0' }}>
                        Aucune partie dans notre base. Lance une analyse pour enrichir les données.
                    </div>
                )}
            </div>

            {allDone && !hasChall && !hasDb && (
                <div className="chp-pb-loading">
                    <div style={{ fontSize: 24, marginBottom: 8 }}>📭</div>
                    Aucune donnée disponible pour {champName}.
                </div>
            )}
        </div>
    );
}

/* ── MatchupTab ── */
function MatchupTab({ champName }) {
    const [matchups, setMatchups] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetchChampMatchups(champName).then(m => { setMatchups(m); setLoading(false); });
    }, [champName]);

    if (loading) return <div className="chp-pb-loading">Calcul des matchups…</div>;
    if (!matchups?.length) return (
        <div className="chp-pb-loading">
            <div style={{ fontSize: 24, marginBottom: 8 }}>📊</div>
            Données de matchup insuffisantes.<br />
            <span style={{ fontSize: 12, marginTop: 6, display: 'block' }}>
                Analysez plus de joueurs ayant joué ce champion pour enrichir les données.
            </span>
        </div>
    );

    const sorted = [...matchups].sort((a, b) => b.wr - a.wr);
    const good = sorted.filter(m => m.wr >= 50 && m.games >= 2).slice(0, 6);
    const bad  = sorted.filter(m => m.wr < 50 && m.games >= 2).reverse().slice(0, 6);

    const MatchupRow = ({ m }) => {
        const col = m.wr >= 55 ? 'high' : m.wr <= 45 ? 'low' : '';
        return (
            <div className="chp-matchup-row">
                <div className="chp-matchup-icon">
                    <img src={`${DDRAGON}/img/champion/${getChampKey(m.vs)}.png`} alt={m.vs}
                        onError={e => { e.target.onerror = null; e.target.style.opacity = '.2'; }} />
                </div>
                <div className="chp-matchup-name">{m.vs}</div>
                <div className="chp-matchup-games">{m.games}P</div>
                <div className="chp-matchup-bar-wrap">
                    <div className="chp-matchup-bar">
                        <div className="chp-matchup-bar-fill" style={{
                            width: `${m.wr}%`,
                            background: m.wr >= 50 ? 'var(--win)' : 'var(--loss)'
                        }} />
                    </div>
                </div>
                <div className={`chp-matchup-wr ${col}`}>{m.wr}%</div>
            </div>
        );
    };

    return (
        <div>
            <div className="chp-source-note">Calculé depuis notre base de données de parties</div>
            {good.length > 0 && (
                <div className="chp-matchup-section">
                    <div className="chp-matchup-section-title">✅ Matchups favorables</div>
                    <div className="chp-matchup-list">{good.map((m, i) => <MatchupRow key={i} m={m} />)}</div>
                </div>
            )}
            {bad.length > 0 && (
                <div className="chp-matchup-section">
                    <div className="chp-matchup-section-title">❌ Matchups difficiles</div>
                    <div className="chp-matchup-list">{bad.map((m, i) => <MatchupRow key={i} m={m} />)}</div>
                </div>
            )}
        </div>
    );
}

/* ── Main ChampionPage ── */
export default function ChampionPage() {
    const [champions, setChampions] = useState([]);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(null);
    const [detail, setDetail] = useState(null);
    const [tab, setTab] = useState('build');

    useEffect(() => {
        fetchChampionList().then(setChampions).catch(console.error);
    }, []);

    useEffect(() => {
        if (!selected) return;
        setDetail(null);
        setTab('build');
        fetchChampionDetail(selected.id).then(setDetail).catch(console.error);
    }, [selected]);

    const filtered = useMemo(() => {
        if (!search.trim()) return champions;
        const q = search.toLowerCase();
        return champions.filter(c => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    }, [champions, search]);

    return (
        <div className="chp-wrap">
            {/* Sidebar */}
            <div className="chp-sidebar">
                <div className="chp-search-bar">
                    <input
                        type="text"
                        placeholder="Rechercher un champion…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <div className="chp-list">
                    {filtered.map(c => (
                        <div
                            key={c.id}
                            className={`chp-item ${selected?.id === c.id ? 'active' : ''}`}
                            onClick={() => setSelected(c)}
                        >
                            <div className="chp-item-icon">
                                <img
                                    src={`${DDRAGON}/img/champion/${c.id}.png`}
                                    alt={c.name}
                                    onError={e => { e.target.onerror = null; e.target.style.opacity = '.2'; }}
                                />
                            </div>
                            <div>
                                <div className="chp-item-name">{c.name}</div>
                                <div className="chp-item-title">{c.title}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Detail panel */}
            <div className="chp-detail">
                {!selected ? (
                    <div className="chp-detail-empty">
                        <div style={{ fontSize: 40 }}>🗡</div>
                        Sélectionne un champion pour voir ses stats
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="chp-header">
                            <div className="chp-header-img">
                                <img src={`${DDRAGON}/img/champion/${selected.id}.png`} alt={selected.name} />
                            </div>
                            <div className="chp-header-info">
                                <div className="chp-header-name">{detail?.name || selected.name}</div>
                                <div className="chp-header-title">{detail?.title || selected.title}</div>
                                <div className="chp-header-tags">
                                    {(detail?.tags || selected.tags || []).map(t => (
                                        <span key={t} className="chp-tag">{t}</span>
                                    ))}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <a
                                    href={`https://u.gg/lol/champions/${selected.id.toLowerCase()}/build`}
                                    target="_blank" rel="noopener noreferrer"
                                    style={{ fontSize: 12, color: 'var(--text-dim)', textDecoration: 'none' }}
                                >
                                    Voir sur u.gg ↗
                                </a>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="chp-tabs">
                            {[
                                { id: 'build', label: '🔨 Build' },
                                { id: 'probuilds', label: '👑 ProBuilds' },
                                { id: 'matchups', label: '⚔ Matchups' },
                            ].map(t => (
                                <button
                                    key={t.id}
                                    className={`chp-tab ${tab === t.id ? 'active' : ''}`}
                                    onClick={() => setTab(t.id)}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        {/* Tab content */}
                        <div className="chp-panel">
                            {tab === 'build'     && <BuildTab    champKey={selected.id} champName={selected.name} detail={detail} />}
                            {tab === 'probuilds' && <ProBuildTab champName={selected.name} />}
                            {tab === 'matchups'  && <MatchupTab  champName={selected.name} />}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
