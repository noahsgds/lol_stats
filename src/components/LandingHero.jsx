export default function LandingHero({ soloInput, setSoloInput, queue, setQueue, loading, onAnalyze }) {
    const HINTS = ['PH Ha0n#0617', 'Faker#KR1', 'SannSawako#9403'];

    const handleKey = e => {
        if (e.key === 'Enter') onAnalyze();
    };

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
                <button className="landing-btn" onClick={onAnalyze} disabled={loading}>
                    {loading ? '⏳' : 'Analyser →'}
                </button>
            </div>

            <div className="landing-hints">
                {HINTS.map(h => (
                    <button
                        key={h}
                        className="landing-hint"
                        onClick={() => { setSoloInput(h); }}
                    >
                        {h}
                    </button>
                ))}
            </div>
        </div>
    );
}
