import { useState, useCallback } from 'react';
import { fetchAll } from './lib/supabase.js';
import { API_BASE } from './lib/utils.js';
import TopBar from './components/TopBar.jsx';
import ProfileCard from './components/ProfileCard.jsx';
import MatchHistory from './components/MatchHistory.jsx';
import RadarChartPanel from './components/RadarChartPanel.jsx';
import TrendChartPanel from './components/TrendChartPanel.jsx';
import CombatSection from './components/CombatSection.jsx';
import InsightsSection from './components/InsightsSection.jsx';
import H2HSection from './components/H2HSection.jsx';
import PlayerDashboard from './components/PlayerDashboard.jsx';

export default function App() {
    const [p1Input, setP1Input] = useState('PH Ha0n#0617');
    const [p2Input, setP2Input] = useState('SannSawako#9403');
    const [queue, setQueue] = useState('');
    const [loading, setLoading] = useState(false);
    const [playersData, setPlayersData] = useState({ p1: null, p2: null });
    const [toast, setToast] = useState(null);
    const [dashPid, setDashPid] = useState(null);

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
            // 1. Affiche immédiatement les données Supabase (cache)
            const [d1, d2] = await Promise.all([fetchAll(p1, q), fetchAll(p2, q)]);
            setPlayersData({ p1: { ...d1, rawTag: p1 }, p2: { ...d2, rawTag: p2 } });
            setLoading(false);
            showToast('⚡ Données chargées — sync Riot en cours…');

            // 2. Sync en arrière-plan avec timeout 25s
            const syncOne = (tag) => {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 60000);
                return fetch(`${API_BASE}/sync?riotId=${encodeURIComponent(tag)}&_t=${Date.now()}`, { signal: ctrl.signal })
                    .then(r => r.json())
                    .catch(() => ({ added: 0 }))
                    .finally(() => clearTimeout(t));
            };
            const [s1, s2] = await Promise.all([syncOne(p1), syncOne(p2)]);

            // 3. Rafraîchit seulement si de nouveaux matchs ont été ajoutés
            const newCount = (s1.added || 0) + (s2.added || 0);
            if (newCount > 0) {
                showToast(`✅ ${newCount} nouveau(x) match(s) — mise à jour…`);
                const [nd1, nd2] = await Promise.all([fetchAll(p1, q), fetchAll(p2, q)]);
                setPlayersData({ p1: { ...nd1, rawTag: p1 }, p2: { ...nd2, rawTag: p2 } });
            } else {
                showToast('✅ Données à jour');
            }
        } catch (e) {
            console.error(e);
            setLoading(false);
        }
    }, [p1Input, p2Input, queue, showToast]);

    const { p1, p2 } = playersData;

    return (
        <>
            <div className="glow-left" />
            <div className="glow-right" />
            <div className="wrap">
                <TopBar
                    p1Input={p1Input} setP1Input={setP1Input}
                    p2Input={p2Input} setP2Input={setP2Input}
                    queue={queue} setQueue={setQueue}
                    loading={loading} onAnalyze={analyze}
                />
                <div className="bento">
                    {/* J1 */}
                    <div className="col">
                        <div className="card">
                            {loading && !p1
                                ? <Skeleton />
                                : p1
                                    ? <ProfileCard data={p1} isP2={false} onDashboard={() => setDashPid('p1')} />
                                    : <Empty />
                            }
                            <div className="card-head"><div className="ch-bar ch-p1" />Historique récent</div>
                            <MatchHistory history={p1?.history} loading={loading && !p1} />
                        </div>
                    </div>

                    {/* CENTER */}
                    <div className="col">
                        <div className="card">
                            <div className="card-head"><div className="ch-bar ch-gold" />Profil Radar</div>
                            <RadarChartPanel g1={p1?.global} g2={p2?.global} />
                        </div>
                        <div className="card">
                            <div className="card-head"><div className="ch-bar ch-gold" />Forme récente — 10 derniers matchs</div>
                            <TrendChartPanel h1={p1?.history} h2={p2?.history} />
                        </div>
                        <div className="card">
                            <div className="card-head"><div className="ch-bar ch-gold" />Combat &amp; Impact</div>
                            <CombatSection g1={p1?.global} g2={p2?.global} />
                        </div>
                        <div className="card">
                            <div className="card-head"><div className="ch-bar ch-gold" />Insights Qualitatifs</div>
                            <InsightsSection g1={p1?.global} g2={p2?.global} h1={p1?.history} h2={p2?.history} tag1={p1?.rawTag} tag2={p2?.rawTag} />
                        </div>
                        <div className="card">
                            <div className="card-head"><div className="ch-bar ch-gold" />Face-à-Face</div>
                            <H2HSection g1={p1?.global} g2={p2?.global} tag1={p1?.rawTag} tag2={p2?.rawTag} />
                        </div>
                    </div>

                    {/* J2 */}
                    <div className="col">
                        <div className="card">
                            {loading && !p2
                                ? <Skeleton />
                                : p2
                                    ? <ProfileCard data={p2} isP2={true} onDashboard={() => setDashPid('p2')} />
                                    : <Empty />
                            }
                            <div className="card-head"><div className="ch-bar ch-p2" />Historique récent</div>
                            <MatchHistory history={p2?.history} loading={loading && !p2} />
                        </div>
                    </div>
                </div>
            </div>

            {dashPid && (
                <PlayerDashboard
                    data={playersData[dashPid]}
                    pid={dashPid}
                    onClose={() => setDashPid(null)}
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
