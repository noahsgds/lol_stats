import { D_VER, getChampKey, toFixed, toWR, fmtK, computeChampStats } from '../lib/utils.js';

/* Calcule une note de performance pour un match */
function perfGrade(m) {
    const durMin = Math.max((m.game_duration || 1) / 60, 1);
    const kda    = (m.kills + m.assists) / Math.max(m.deaths, 1);
    const csMin  = (m.cs || 0) / durMin;
    const dmgMin = (m.total_damage || 0) / durMin;
    const vis    = m.vision_score || 0;
    let score = 0;
    score += Math.min(kda / 5, 1) * 35;
    score += Math.min(csMin / 8, 1) * 20;
    score += Math.min(dmgMin / 2000, 1) * 30;
    score += Math.min(vis / 50, 1) * 15;
    if (m.win) score = Math.min(score * 1.08, 100);
    const s = Math.round(score);
    return s >= 78 ? 'S' : s >= 62 ? 'A' : s >= 46 ? 'B' : s >= 30 ? 'C' : 'D';
}

const GRADE_COLORS = { S: '#f0a500', A: '#4ade80', B: '#94a3b8', C: '#9a8d72', D: '#f87171' };

/* ─── ReportTab ─────────────────────────────────────────────── */
export default function ReportTab({ soloData }) {

    if (!soloData) return (
        <div className="report-empty">
            <div style={{ fontSize: 40 }}>📋</div>
            <div className="report-empty-text">
                Analysez d'abord un joueur dans l'onglet{' '}
                <strong style={{ color: 'var(--gold)' }}>Analyse individuelle</strong>
            </div>
        </div>
    );

    const { rank: r, global: g, history: h } = soloData;
    const name    = (r.riot_id || soloData.rawTag || '').split('#')[0];
    const tag     = r.riot_id || soloData.rawTag || '';
    const tier    = r.solo_tier || '';
    const rankTxt = tier ? `${tier} ${r.solo_rank || ''} — ${r.solo_lp ?? '?'} LP` : 'Non classé';

    const wr      = parseFloat(toWR(g.win_rate));
    const total   = parseInt(g.total_games) || 0;
    const wins    = Math.round(wr / 100 * total);
    const losses  = total - wins;

    const dm = m => Math.max((m.game_duration || 1) / 60, 1);
    const avgCsMin  = h?.length ? (h.reduce((a, m) => a + (m.cs || 0) / dm(m), 0) / h.length).toFixed(1) : '—';
    const avgDmgMin = h?.length ? fmtK(Math.round(h.reduce((a, m) => a + (m.total_damage || 0) / dm(m), 0) / h.length)) : '—';
    const avgVisMin = h?.length ? (h.reduce((a, m) => a + (m.vision_score || 0) / dm(m), 0) / h.length).toFixed(2) : '—';

    const champs = computeChampStats(h).slice(0, 3);
    const last10 = (h || []).slice(0, 10);
    const l10wr  = last10.length ? Math.round(last10.filter(m => m.win).length / last10.length * 100) : 0;

    const grades = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    (h || []).forEach(m => grades[perfGrade(m)]++);

    const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

    return (
        <div className="report-wrapper">
            {/* Toolbar (non-printed) */}
            <div className="report-toolbar no-print">
                <div className="report-toolbar-info">
                    Rapport de performance — <strong>{name}</strong>
                    <span className="report-toolbar-sub"> ({total} parties analysées)</span>
                </div>
                <button className="btn-go" style={{ padding: '9px 24px' }} onClick={() => window.print()}>
                    🖨 Imprimer / Exporter PDF
                </button>
            </div>

            {/* ── Report area (screen + print) ── */}
            <div className="report-area">

                {/* Header */}
                <div className="rpt-header">
                    <img
                        src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/profileicon/${r.profile_icon_id || 29}.png`}
                        alt=""
                        className="rpt-avatar"
                        onError={e => { e.target.src = `https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/profileicon/29.png`; }}
                    />
                    <div className="rpt-header-info">
                        <div className="rpt-player-name">{name}</div>
                        <div className="rpt-tag">#{tag.split('#')[1] || ''}</div>
                        <div className="rpt-rank">{rankTxt}</div>
                        {r.flex_tier && (
                            <div className="rpt-rank-flex">Flex : {r.flex_tier} {r.flex_rank || ''} — {r.flex_lp ?? '?'} LP</div>
                        )}
                    </div>
                    <div className="rpt-header-right">
                        <div className="rpt-report-label">RAPPORT D'ANALYSE</div>
                        <div className="rpt-date">{today}</div>
                        <div className="rpt-app-name">LoL Mate Comparator</div>
                        {r.summoner_level && <div className="rpt-level">Niveau {r.summoner_level}</div>}
                    </div>
                </div>

                <div className="rpt-divider" />

                {/* Stats grid */}
                <div className="rpt-section-title">VUE D'ENSEMBLE</div>
                <div className="rpt-stats-grid">
                    {[
                        { lbl: 'Parties', val: total },
                        { lbl: 'Win Rate', val: `${wr}%`, cls: wr >= 55 ? 'rpt-win' : wr <= 45 ? 'rpt-loss' : '' },
                        { lbl: 'KDA', val: `${toFixed(g.kda, 2)} : 1` },
                        { lbl: 'Victoires', val: wins, cls: 'rpt-win' },
                        { lbl: 'Défaites', val: losses, cls: 'rpt-loss' },
                        { lbl: 'CS moy.', val: Math.round(g.avg_cs || 0) },
                        { lbl: 'Dégâts moy.', val: fmtK(Math.round(g.avg_damage || 0)) },
                        { lbl: 'Vision moy.', val: toFixed(g.avg_vision, 1) },
                    ].map(s => (
                        <div key={s.lbl} className="rpt-stat-box">
                            <div className={`rpt-stat-val ${s.cls || ''}`}>{s.val}</div>
                            <div className="rpt-stat-lbl">{s.lbl}</div>
                        </div>
                    ))}
                </div>

                <div className="rpt-divider" />

                {/* Métriques / min */}
                <div className="rpt-section-title">MÉTRIQUES PAR MINUTE</div>
                <div className="rpt-metrics-row">
                    {[
                        { lbl: 'CS / min', val: avgCsMin },
                        { lbl: 'Dégâts / min', val: avgDmgMin },
                        { lbl: 'Vision / min', val: avgVisMin },
                    ].map(s => (
                        <div key={s.lbl} className="rpt-metric-pill">
                            <span className="rpt-metric-val">{s.val}</span>
                            <span className="rpt-metric-lbl">{s.lbl}</span>
                        </div>
                    ))}
                </div>

                <div className="rpt-divider" />

                {/* Champions */}
                {champs.length > 0 && (
                    <>
                        <div className="rpt-section-title">CHAMPION POOL PRINCIPAL</div>
                        <div className="rpt-champs-list">
                            {champs.map((c, i) => (
                                <div key={c.name} className="rpt-champ-row">
                                    <span className="rpt-champ-rank">#{i + 1}</span>
                                    <img
                                        src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/champion/${getChampKey(c.name)}.png`}
                                        alt={c.name}
                                        className="rpt-champ-icon"
                                        onError={e => { e.target.style.opacity = '.15'; }}
                                    />
                                    <span className="rpt-champ-name">{c.name}</span>
                                    <span className="rpt-champ-games">{c.games}P</span>
                                    <div className="rpt-wr-wrap">
                                        <span className={`rpt-champ-wr ${c.wr >= 55 ? 'rpt-win' : c.wr <= 45 ? 'rpt-loss' : ''}`}>{c.wr}%</span>
                                        <div className="rpt-wr-bar">
                                            <div
                                                className="rpt-wr-fill"
                                                style={{
                                                    width: `${c.wr}%`,
                                                    background: c.wr >= 55 ? 'var(--win)' : c.wr <= 45 ? 'var(--loss)' : 'var(--gold)',
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <span className="rpt-champ-kda">{c.kda} KDA</span>
                                </div>
                            ))}
                        </div>
                        <div className="rpt-divider" />
                    </>
                )}

                {/* Forme récente */}
                <div className="rpt-section-title">FORME RÉCENTE — {last10.length} DERNIERS MATCHS</div>
                <div className="rpt-form-row">
                    {last10.map((m, i) => (
                        <div key={i} className={`rpt-form-dot ${m.win ? 'rpt-dot-w' : 'rpt-dot-l'}`} title={m.champion_name} />
                    ))}
                    <span className="rpt-form-pct">{l10wr}% ({last10.filter(m => m.win).length}V {last10.length - last10.filter(m => m.win).length}D)</span>
                </div>

                <div className="rpt-divider" />

                {/* Distribution des grades */}
                <div className="rpt-section-title">DISTRIBUTION DES PERFORMANCES</div>
                <div className="rpt-grades-row">
                    {Object.entries(grades).map(([grade, count]) => (
                        <div key={grade} className="rpt-grade-box">
                            <div className="rpt-grade-letter" style={{ color: GRADE_COLORS[grade] }}>{grade}</div>
                            <div className="rpt-grade-count">{count}</div>
                            <div className="rpt-grade-bar-bg">
                                <div
                                    className="rpt-grade-bar-fill"
                                    style={{
                                        height: `${h?.length ? count / h.length * 100 : 0}%`,
                                        background: GRADE_COLORS[grade],
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="rpt-divider" />

                {/* Footer */}
                <div className="rpt-footer">
                    Basé sur {total} partie{total > 1 ? 's' : ''} analysée{total > 1 ? 's' : ''} · LoL Mate Comparator · {today}
                </div>
            </div>
        </div>
    );
}
