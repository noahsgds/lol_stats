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
        showToast('🔄 Synchronisation Riot en cours…');
        try {
            // Attendre la fin du sync des deux joueurs avant de lire Supabase
            await Promise.all([
                fetch(`${API_BASE}/sync?riotId=${encodeURIComponent(p1)}`).then(r => r.json()).catch(() => ({})),
                fetch(`${API_BASE}/sync?riotId=${encodeURIComponent(p2)}`).then(r => r.json()).catch(() => ({})),
            ]);
            showToast('✅ Données à jour — chargement…');
            const [d1, d2] = await Promise.all([fetchAll(p1, q), fetchAll(p2, q)]);
            console.log('J1', d1); console.log('J2', d2);
            setPlayersData({ p1: { ...d1, rawTag: p1 }, p2: { ...d2, rawTag: p2 } });
        } catch (e) {
            console.error(e);
            showToast('❌ Erreur lors de la synchronisation');
        } finally {
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
