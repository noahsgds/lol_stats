export default function TopBar({ p1Input, setP1Input, p2Input, setP2Input, queue, setQueue, loading, onAnalyze, mode, setMode }) {
    return (
        <div className="topbar">
            <div className="logo">
                <div className="logo-mark">⚔</div>
                <div className="logo-name">LoL <span>Mate</span></div>
                <div className="logo-ver">COMPARATOR V22</div>
            </div>

            <div className="topbar-right">
                <div className="mode-tabs">
                    <button className={`mode-tab ${mode === 'solo' ? 'active' : ''}`} onClick={() => setMode('solo')}>
                        📊 Analyse individuelle
                    </button>
                    <button className={`mode-tab ${mode === 'compare' ? 'active' : ''}`} onClick={() => setMode('compare')}>
                        ⚔ Comparatif
                    </button>
                    <button className={`mode-tab ${mode === 'champions' ? 'active' : ''}`} onClick={() => setMode('champions')}>
                        🗡 Champions
                    </button>
                    <button className={`mode-tab ${mode === 'report' ? 'active' : ''}`} onClick={() => setMode('report')}>
                        📋 Rapport coach
                    </button>
                </div>

                {mode === 'compare' && (
                    <div className="search-row">
                        <div className="input-group">
                            <div className="dot dot-p1" />
                            <input type="text" value={p1Input} onChange={e => setP1Input(e.target.value)} onKeyDown={e => e.key === 'Enter' && onAnalyze()} placeholder="Joueur 1#TAG" />
                        </div>
                        <div className="vs-block">VS</div>
                        <div className="input-group">
                            <div className="dot dot-p2" />
                            <input type="text" value={p2Input} onChange={e => setP2Input(e.target.value)} onKeyDown={e => e.key === 'Enter' && onAnalyze()} placeholder="Joueur 2#TAG" />
                        </div>
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
                        <button className="btn-go" disabled={loading} onClick={onAnalyze}>
                            {loading ? '⏳' : 'Analyser →'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
