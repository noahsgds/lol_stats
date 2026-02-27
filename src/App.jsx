import { useState, useCallback } from 'react';
import { fetchAll } from './lib/supabase.js';
import { API_BASE, computeLpMap } from './lib/utils.js';
import TopBar from './components/TopBar.jsx';
import ProfileCard from './components/ProfileCard.jsx';
import MatchHistory from './components/MatchHistory.jsx';
import RadarChartPanel from './components/RadarChartPanel.jsx';
import TrendChartPanel from './components/TrendChartPanel.jsx';
import CombatSection from './components/CombatSection.jsx';
import InsightsSection from './components/InsightsSection.jsx';
import H2HSection from './components/H2HSection.jsx';
import PlayerDashboard from './components/PlayerDashboard.jsx';
import TournamentTab from './components/TournamentTab.jsx';
import ReportTab from './components/ReportTab.jsx';
import LiveBanner from './components/LiveBanner.jsx';

export default function App() {
    const [p1Input, setP1Input] = useState('PH Ha0n#0617');
    const [p2Input, setP2Input] = useState('SannSawako#9403');
    const [queue, setQueue] = useState('');
    const [mode, setMode] = useState('compare');
    const [loading, setLoading] = useState(false);
    const [syncMsg, setSyncMsg] = useState(null);
    const [playersData, setPlayersData] = useState({ p1: null, p2: null });
    const [toast, setToast] = useState(null);
    const [dashPid, setDashPid] = useState(null);
    const [soloInput, setSoloInput] = useState('');
    const [soloData, setSoloData] = useState(null);
    const [soloLoading, setSoloLoading] = useState(false);
    const [soloSyncMsg, setSoloSyncMsg] = useState(null);

    const showToast = useCallback((msg, duration = 3500) => {
        setToast(msg);
        setTimeout(() => setToast(null), duration);
    }, []);

    const analyze = useCallback(async () => {
        const p1 = p1Input.trim();
        const p2 = p2Input.trim();
        const q = queue || null;
        if (!p1.includes('#') || !p2.includes('#')) {
            alert('Format : Pseudo#TAG');
            return;
        }
        setLoading(true);
        setPlayersData({ p1: null, p2: null });
        try {
            // 1. Réveil du serveur Render (cold start peut prendre 30-60s)
            setSyncMsg('Connexion au serveur…');
            const wakeCtrl = new AbortController();
            const wakeTimer = setTimeout(() => wakeCtrl.abort(), 90000);
            try {
                await fetch(`${API_BASE}/ping?_t=${Date.now()}`, { signal: wakeCtrl.signal });
            } catch { /* serveur pas dispo, on essaie quand même */ } finally {
                clearTimeout(wakeTimer);
            }

            // 2. Sync Riot (serveur chaud, timeout court)
            setSyncMsg('Synchronisation Riot en cours…');
            const syncOne = async (tag) => {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 30000);
                try {
                    const r = await fetch(`${API_BASE}/sync?riotId=${encodeURIComponent(tag)}&_t=${Date.now()}`, { signal: ctrl.signal });
                    if (!r.ok) return { added: 0, failed: true };
                    const data = await r.json();
                    return data.error ? { added: 0, failed: true } : data;
                } catch {
                    return { added: 0, failed: true };
                } finally {
                    clearTimeout(t);
                }
            };
            const [s1, s2] = await Promise.all([syncOne(p1), syncOne(p2)]);

            // 3. Fetch données fraîches depuis Supabase
            setSyncMsg('Chargement des données…');
            const [d1, d2] = await Promise.all([fetchAll(p1, q), fetchAll(p2, q)]);
            setPlayersData({ p1: { ...d1, rawTag: p1 }, p2: { ...d2, rawTag: p2 } });

            const failed = s1.failed || s2.failed;
            const newCount = (s1.added || 0) + (s2.added || 0);
            if (failed) {
                showToast('⚠️ Sync incomplet — vérifie la clé Riot ou réessaie', 5000);
            } else {
                showToast(newCount > 0 ? `✅ ${newCount} nouveau(x) match(s) ajouté(s)` : '✅ Données à jour');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setSyncMsg(null);
            setLoading(false);
        }
    }, [p1Input, p2Input, queue, showToast]);

    const analyzeSolo = useCallback(async () => {
        const tag = soloInput.trim();
        const q = queue || null;
        if (!tag.includes('#')) { alert('Format : Pseudo#TAG'); return; }
        setSoloLoading(true);
        setSoloData(null);
        try {
            setSoloSyncMsg('Connexion au serveur…');
            const wakeCtrl = new AbortController();
            const wakeTimer = setTimeout(() => wakeCtrl.abort(), 90000);
            try { await fetch(`${API_BASE}/ping?_t=${Date.now()}`, { signal: wakeCtrl.signal }); }
            catch { } finally { clearTimeout(wakeTimer); }

            setSoloSyncMsg('Synchronisation Riot en cours…');
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 30000);
            let syncResult = { added: 0 };
            try {
                const r = await fetch(`${API_BASE}/sync?riotId=${encodeURIComponent(tag)}&_t=${Date.now()}`, { signal: ctrl.signal });
                if (r.ok) { const d = await r.json(); if (!d.error) syncResult = d; }
            } catch { } finally { clearTimeout(t); }

            setSoloSyncMsg('Chargement des données…');
            const d = await fetchAll(tag, q);
            setSoloData({ ...d, rawTag: tag });
            showToast(syncResult.added > 0 ? `✅ ${syncResult.added} nouveau(x) match(s) ajouté(s)` : '✅ Données à jour');
        } catch (e) {
            console.error(e);
        } finally {
            setSoloSyncMsg(null);
            setSoloLoading(false);
        }
    }, [soloInput, queue, showToast]);

    const { p1, p2 } = playersData;
    const lpMap1 = p1?.rank?.rank_history ? computeLpMap(p1.rank.rank_history) : {};
    const lpMap2 = p2?.rank?.rank_history ? computeLpMap(p2.rank.rank_history) : {};
    const soloLpMap = soloData?.rank?.rank_history ? computeLpMap(soloData.rank.rank_history) : {};

    return (
        <>
            <div className="glow-left" />
            <div className="glow-right" />
            <div className="wrap">
                <TopBar
                    p1Input={p1Input} setP1Input={setP1Input}
                    p2Input={p2Input} setP2Input={setP2Input}
                    soloInput={soloInput} setSoloInput={setSoloInput}
                    queue={queue} setQueue={setQueue}
                    loading={mode === 'compare' ? loading : soloLoading}
                    onAnalyze={mode === 'compare' ? analyze : analyzeSolo}
                    mode={mode} setMode={setMode}
                />

                {/* ── Live banner (affiché si le joueur est en game) ── */}
                {soloData?.rawTag && <LiveBanner riotId={soloData.rawTag} />}
                {p1?.rawTag && mode === 'compare' && <LiveBanner riotId={p1.rawTag} />}
                {p2?.rawTag && mode === 'compare' && <LiveBanner riotId={p2.rawTag} />}

                {/* ── Analyse individuelle ── */}
                {mode === 'solo' && (
                    soloLoading ? (
                        <div className="sync-banner">
                            <div className="sync-spinner" />
                            {soloSyncMsg || 'Chargement…'}
                        </div>
                    ) : soloData ? (
                        <PlayerDashboard data={soloData} pid="p1" onClose={() => setSoloData(null)} inline lpMap={soloLpMap} />
                    ) : <Empty />
                )}

                {/* ── Comparatif ── */}
                {mode === 'compare' && (
                    loading ? (
                        <div className="sync-banner">
                            <div className="sync-spinner" />
                            {syncMsg || 'Chargement…'}
                        </div>
                    ) : (p1 && p2) ? (
                        <div className="bento">
                            {/* J1 */}
                            <div className="col">
                                <div className="card" style={{ overflow: 'hidden' }}>
                                    <ProfileCard data={p1} isP2={false} onDashboard={() => setDashPid('p1')} />
                                </div>
                                <div className="card">
                                    <div className="card-head"><div className="ch-bar ch-p1" />Historique récent</div>
                                    <MatchHistory history={p1?.history} loading={false} trackedTag={p1?.rawTag} lpMap={lpMap1} />
                                </div>
                            </div>
                            {/* CENTER */}
                            <div className="col">
                                <div className="card">
                                    <div className="card-head"><div className="ch-bar ch-gold" />Radars comparatifs</div>
                                    <RadarChartPanel g1={p1?.global} g2={p2?.global} />
                                </div>
                                <div className="card">
                                    <div className="card-head"><div className="ch-bar ch-gold" />Forme — 10 derniers matchs</div>
                                    <TrendChartPanel h1={p1?.history} h2={p2?.history} />
                                </div>
                                <div className="card">
                                    <div className="card-head"><div className="ch-bar ch-gold" />Combat &amp; Impact</div>
                                    <CombatSection g1={p1?.global} g2={p2?.global} />
                                </div>
                                <div className="card">
                                    <div className="card-head"><div className="ch-bar ch-gold" />Insights</div>
                                    <InsightsSection g1={p1?.global} g2={p2?.global} h1={p1?.history} h2={p2?.history} tag1={p1?.rawTag} tag2={p2?.rawTag} />
                                </div>
                                <div className="card">
                                    <div className="card-head"><div className="ch-bar ch-gold" />Face-à-Face</div>
                                    <H2HSection g1={p1?.global} g2={p2?.global} tag1={p1?.rawTag} tag2={p2?.rawTag} />
                                </div>
                            </div>
                            {/* J2 */}
                            <div className="col">
                                <div className="card" style={{ overflow: 'hidden' }}>
                                    <ProfileCard data={p2} isP2={true} onDashboard={() => setDashPid('p2')} />
                                </div>
                                <div className="card">
                                    <div className="card-head"><div className="ch-bar ch-p2" />Historique récent</div>
                                    <MatchHistory history={p2?.history} loading={false} trackedTag={p2?.rawTag} lpMap={lpMap2} />
                                </div>
                            </div>
                        </div>
                    ) : <Empty />
                )}

                {/* ── Tournois ── */}
                {mode === 'tournament' && <TournamentTab />}

                {/* ── Rapport ── */}
                {mode === 'report' && <ReportTab soloData={soloData} />}
            </div>

            {dashPid && (
                <PlayerDashboard
                    data={playersData[dashPid]}
                    pid={dashPid}
                    onClose={() => setDashPid(null)}
                    lpMap={dashPid === 'p1' ? lpMap1 : lpMap2}
                />
            )}

            {toast && <div className="toast">{toast}</div>}
        </>
    );
}

function Empty() {
    return (
        <div className="empty">
            <div className="empty-icon">🎮</div>
            Lance une analyse
        </div>
    );
}

function Skeleton() {
    return (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[1, 0.7, 0.9, 0.5].map((w, i) => (
                <div key={i} className="skel" style={{ height: '12px', width: `${w * 100}%` }} />
            ))}
        </div>
    );
}
