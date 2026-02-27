import { useState, useEffect, useRef, useCallback } from 'react';

const RECENT_KEY = 'lolmate_recent';
const MAX = 5;

function getRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, MAX); }
    catch { return []; }
}
function pushRecent(tags) {
    const prev = getRecent();
    const next = [...tags, ...prev.filter(t => !tags.includes(t))].slice(0, MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    return next;
}

export default function TopBar({ p1Input, setP1Input, p2Input, setP2Input, queue, setQueue, loading, onAnalyze, mode, setMode, onHome }) {
    const [recent, setRecent] = useState(getRecent);
    const [drop, setDrop] = useState(null); // 'p1' | 'p2' | null
    const wrapRef = useRef(null);

    useEffect(() => {
        const close = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setDrop(null); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const handleAnalyze = useCallback(() => {
        const tags = mode === 'compare'
            ? [p1Input, p2Input].filter(Boolean)
            : [p1Input].filter(Boolean);
        if (tags.length) setRecent(pushRecent(tags));
        setDrop(null);
        onAnalyze();
    }, [mode, p1Input, p2Input, onAnalyze]);

    const pickRecent = useCallback((tag, field) => {
        setDrop(null);
        if (field === 'p1') {
            setP1Input(tag);
            setRecent(pushRecent([tag]));
            if (mode !== 'compare') onAnalyze(tag);
        } else {
            setP2Input(tag);
        }
    }, [mode, setP1Input, setP2Input, onAnalyze]);

    const onKey = (e) => { if (e.key === 'Enter') handleAnalyze(); if (e.key === 'Escape') setDrop(null); };

    return (
        <div className="topbar">

            {/* ── LEFT: Logo ── */}
            <div className="logo" onClick={onHome} style={{ cursor: 'pointer' }} title="Accueil">
                <div className="logo-mark">⚔</div>
                <div className="logo-name">LoL <span>Mate</span></div>
            </div>

            {/* ── CENTER: Search ── */}
            <div className="tb-center" ref={wrapRef}>
                <div className="search-row">

                    {/* Queue filter */}
                    <div className="queue-wrap">
                        <select value={queue} onChange={e => setQueue(e.target.value)}>
                            <option value="">Tout</option>
                            <option value="420">Solo/Duo</option>
                            <option value="440">Flex</option>
                            <option value="450">ARAM</option>
                            <option value="490">Quickplay</option>
                            <option value="400">Normal</option>
                            <option value="700">Clash</option>
                            <option value="900">URF</option>
                            <option value="1700">Arena</option>
                        </select>
                    </div>

                    {/* Player 1 input */}
                    <div className="input-group tb-input-rel">
                        <div className="dot dot-p1" />
                        <input
                            type="text" value={p1Input}
                            onChange={e => setP1Input(e.target.value)}
                            onFocus={() => recent.length && setDrop('p1')}
                            onKeyDown={onKey}
                            placeholder={mode === 'compare' ? 'Joueur 1#TAG' : 'Pseudo#TAG'}
                        />
                        {drop === 'p1' && (
                            <div className="tb-recent">
                                {recent.map(r => (
                                    <button key={r} className="tb-recent-item" onMouseDown={() => pickRecent(r, 'p1')}>
                                        <span className="tb-recent-icon">↺</span>
                                        <span>{r}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Compare: VS + player 2 */}
                    {mode === 'compare' && <>
                        <div className="vs-block">VS</div>
                        <div className="input-group tb-input-rel">
                            <div className="dot dot-p2" />
                            <input
                                type="text" value={p2Input}
                                onChange={e => setP2Input(e.target.value)}
                                onFocus={() => recent.length && setDrop('p2')}
                                onKeyDown={onKey}
                                placeholder="Joueur 2#TAG"
                            />
                            {drop === 'p2' && (
                                <div className="tb-recent">
                                    {recent.map(r => (
                                        <button key={r} className="tb-recent-item" onMouseDown={() => pickRecent(r, 'p2')}>
                                            <span className="tb-recent-icon">↺</span>
                                            <span>{r}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>}

                    <button className="btn-go" disabled={loading} onClick={handleAnalyze}>
                        {loading ? '⏳' : 'Analyser →'}
                    </button>
                </div>
            </div>

            {/* ── RIGHT: Mode tabs ── */}
            <div className="topbar-right">
                <div className="mode-tabs">
                    <button className={`mode-tab ${mode === 'solo' ? 'active' : ''}`} onClick={() => setMode('solo')}>📊 Solo</button>
                    <button className={`mode-tab ${mode === 'compare' ? 'active' : ''}`} onClick={() => setMode('compare')}>⚔ Comparatif</button>
                    <button className={`mode-tab ${mode === 'champions' ? 'active' : ''}`} onClick={() => setMode('champions')}>🗡 Champions</button>
                    <button className={`mode-tab ${mode === 'report' ? 'active' : ''}`} onClick={() => setMode('report')}>📋 Rapport</button>
                </div>
            </div>

        </div>
    );
}
