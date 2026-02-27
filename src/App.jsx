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
import ChampionPage from './components/ChampionPage.jsx';
import ReportTab from './components/ReportTab.jsx';
import LiveBanner from './components/LiveBanner.jsx';
import LandingHero from './components/LandingHero.jsx';

export default function App() {
    const [p1Input, setP1Input] = useState('PH Ha0n#0617');
    const [p2Input, setP2Input] = useState('SannSawako#9403');
    const [queue, setQueue] = useState('');
    const [mode, setMode] = useState('solo');
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
            const rankSolo = syncResult.rank || d.rank || {};
            setSoloData({ ...d, rank: rankSolo, rawTag: tag });
            showToast(syncResult.added > 0 ? `✅ ${syncResult.added} nouveau(x) match(s) ajouté(s)` : '✅ Données à jour');
        } catch (e) {
            console.error(e);
        } finally {
            setSoloSyncMsg(null);
            setSoloLoading(false);
        }
    }, [soloInput, queue, showToast]);

    const analyze = useCallback(async () => {
        const p1 = p1Input.trim();
        const p2 = p2Input.trim();
        const q = queue || null;
        if (!p1.includes('#') || !p2.includes('#')) { alert('Format : Pseudo#TAG'); return; }
        setLoading(true);
        setPlayersData({ p1: null, p2: null });
        try {
            setSyncMsg('Connexion au serveur…');
            const wakeCtrl = new AbortController();
            const wakeTimer = setTimeout(() => wakeCtrl.abort(), 90000);
            try { await fetch(`${API_BASE}/ping?_t=${Date.now()}`, { signal: wakeCtrl.signal }); }
            catch { } finally { clearTimeout(wakeTimer); }

            setSyncMsg('Synchronisation Riot en cours…');
            const syncOne = async (tag) => {
                const ctrl = new AbortController();
                const tt = setTimeout(() => ctrl.abort(), 30000);
                try {
                    const r = await fetch(`${API_BASE}/sync?riotId=${encodeURIComponent(tag)}&_t=${Date.now()}`, { signal: ctrl.signal });
                    if (!r.ok) return { added: 0, failed: true };
                    const data = await r.json();
                    return data.error ? { added: 0, failed: true } : data;
                } catch { return { added: 0, failed: true }; }
                finally { clearTimeout(tt); }
            };
            const [s1, s2] = await Promise.all([syncOne(p1), syncOne(p2)]);

            setSyncMsg('Chargement des données…');
            const [d1, d2] = await Promise.all([fetchAll(p1, q), fetchAll(p2, q)]);
            const rank1 = s1.rank || d1.rank || {};
            const rank2 = s2.rank || d2.rank || {};
            setPlayersData({ p1: { ...d1, rank: rank1, rawTag: p1 }, p2: { ...d2, rank: rank2, rawTag: p2 } });

            const failed = s1.failed || s2.failed;
            const newCount = (s1.added || 0) + (s2.added || 0);
            if (failed) showToast('⚠️ Sync incomplet — vérifie la clé Riot ou réessaie', 5000);
            else showToast(newCount > 0 ? `✅ ${newCount} nouveau(x) match(s) ajouté(s)` : '✅ Données à jour');
        } catch (e) {
            console.error(e);
        } finally {
            setSyncMsg(null);
            setLoading(false);
        }
    }, [p1Input, p2Input, queue, showToast]);

    const { p1, p2 } = playersData;
    const lpMap1    = p1?.rank?.rank_history ? computeLpMap(p1.rank.rank_history) : {};
    const lpMap2    = p2?.rank?.rank_history ? computeLpMap(p2.rank.rank_history) : {};
    const soloLpMap = soloData?.rank?.rank_history ? computeLpMap(soloData.rank.rank_history) : {};

    return (
        <>
            <div className="glow-left" />
            <div className="glow-right" />
            <div className="wrap">
                <TopBar
                    p1Input={p1Input} setP1Input={setP1Input}
                    p2Input={p2Input} setP2Input={setP2Input}
                    queue={queue} setQueue={setQueue}
                    loading={mode === 'compare' ? loading : soloLoading}
                    onAnalyze={mode === 'compare' ? analyze : analyzeSolo}
                    mode={mode} setMode={setMode}
                />

                {soloData?.rawTag && mode === 'solo' && <LiveBanner riotId={soloData.rawTag} />}
                {p1?.rawTag && mode === 'compare' && <LiveBanner riotId={p1.rawTag} />}
                {p2?.rawTag && mode === 'compare' && <LiveBanner riotId={p2.rawTag} />}

                {/* ══ SOLO ══ */}
                {mode === 'solo' && (
                    soloLoading ? (
                        <div className="sync-banner">
                            <div className="sync-spinner" />
                            {soloSyncMsg || 'Chargement…'}
                        </div>
                    ) : soloData ? (
                        <div className="solo-results">
                            <div className="solo-top-section">
                                <div className="card solo-hero-card" style={{ overflow: 'hidden' }}>
                                    <ProfileCard data={soloData} isP2={false} onDashboard={null} variant="hero" />
                                </div>
                                <div className="card">
                                    <div className="card-head"><div className="ch-bar ch-p1" />Historique récent</div>
                                    <MatchHistory history={soloData?.history} loading={false} trackedTag={soloData?.rawTag} lpMap={soloLpMap} />
                                </div>
                            </div>
                            <PlayerDashboard data={soloData} pid="p1" onClose={() => setSoloData(null)} inline lpMap={soloLpMap} showHeader={false} />
                        </div>
                    ) : (
                        <LandingHero soloInput={soloInput} setSoloInput={setSoloInput} queue={queue} setQueue={setQueue} loading={soloLoading} onAnalyze={analyzeSolo} />
                    )
                )}

                {/* ══ COMPARE ══ */}
                {mode === 'compare' && (
                    loading ? (
                        <div className="sync-banner"><div className="sync-spinner" />{syncMsg || 'Chargement…'}</div>
                    ) : (p1 && p2) ? (
                        <div className="bento">
                            <div className="col">
                                <div className="card" style={{ overflow: 'hidden' }}>
                                    <ProfileCard data={p1} isP2={false} onDashboard={() => setDashPid('p1')} />
                                </div>
                                <div className="card">
                                    <div className="card-head"><div className="ch-bar ch-p1" />Historique récent</div>
                                    <MatchHistory history={p1?.history} loading={false} trackedTag={p1?.rawTag} lpMap={lpMap1} />
                                </div>
                            </div>
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
                    ) : (
                        <div className="empty">
                            <div className="empty-icon">⚔</div>
                            Entrez deux invocateurs et lancez l'analyse
                        </div>
                    )
                )}

                {/* ══ CHAMPIONS ══ */}
                {mode === 'champions' && <ChampionPage />}

                {/* ══ RAPPORT ══ */}
                {mode === 'report' && <ReportTab soloData={soloData} />}
            </div>

            {dashPid && (
                <PlayerDashboard data={playersData[dashPid]} pid={dashPid} onClose={() => setDashPid(null)} lpMap={dashPid === 'p1' ? lpMap1 : lpMap2} />
            )}

            {toast && <div className="toast">{toast}</div>}
        </>
    );
}
