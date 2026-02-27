import { D_VER, getChampKey, toFixed, toWR, fmtK, computeChampStats } from '../lib/utils.js';

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

function analyzeConsistency(history) {
    if (!history?.length) return null;
    const kdas = history.map(m => (m.kills + m.assists) / Math.max(m.deaths, 1));
    const mean = kdas.reduce((a, b) => a + b, 0) / kdas.length;
    const variance = kdas.reduce((a, b) => a + (b - mean) ** 2, 0) / kdas.length;
    const stdDev = Math.sqrt(variance);
    const last5 = kdas.slice(0, 5);
    const prev10 = kdas.slice(5, 15);
    const last5Avg = last5.reduce((a, b) => a + b, 0) / Math.max(last5.length, 1);
    const prev10Avg = prev10.length ? prev10.reduce((a, b) => a + b, 0) / prev10.length : mean;
    const tiltDelta = ((last5Avg - prev10Avg) / Math.max(prev10Avg, 0.1)) * 100;
    let streak = 0, streakType = null;
    for (const m of history) {
        if (streakType === null) { streakType = m.win; streak = 1; }
        else if (m.win === streakType) streak++;
        else break;
    }
    const consistencyScore = Math.max(0, Math.min(100, Math.round(100 - (stdDev / Math.max(mean, 0.1)) * 30)));
    return { mean, stdDev, tiltDelta, streak, streakType,
        isTilting: tiltDelta < -20 && prev10.length >= 3,
        isHot: tiltDelta > 20 && last5.length >= 3,
        consistencyScore };
}

function generateInsights(g, h) {
    const strengths = [], weaknesses = [], recs = [];
    const wr = parseFloat(toWR(g.win_rate));
    const kda = parseFloat(toFixed(g.kda, 2));
    const dm = m => Math.max((m.game_duration || 1) / 60, 1);
    const avgCsMin  = h?.length ? h.reduce((a, m) => a + (m.cs || 0) / dm(m), 0) / h.length : 0;
    const avgDmgMin = h?.length ? h.reduce((a, m) => a + (m.total_damage || 0) / dm(m), 0) / h.length : 0;
    const avgVisMin = h?.length ? h.reduce((a, m) => a + (m.vision_score || 0) / dm(m), 0) / h.length : 0;

    if (wr >= 55) strengths.push({ icon: '🏆', text: `Excellent winrate : ${wr}%` });
    else if (wr <= 45) weaknesses.push({ icon: '📉', text: `Winrate faible : ${wr}% — revois tes décisions en fin de partie` });
    if (kda >= 3.5) strengths.push({ icon: '⚔️', text: `KDA très solide : ${kda} — bonne gestion de la survie` });
    else if (kda <= 1.8) weaknesses.push({ icon: '💀', text: `KDA bas : ${kda} — trop de morts, joue plus prudemment` });
    if (avgCsMin >= 7) strengths.push({ icon: '🌾', text: `Excellent farming : ${avgCsMin.toFixed(1)} CS/min` });
    else if (avgCsMin < 5 && avgCsMin > 0) {
        weaknesses.push({ icon: '🌾', text: `CS/min faible : ${avgCsMin.toFixed(1)} — travaille les patterns de farm` });
        recs.push('Objectif : atteindre 7 CS/min. Pratique les custom games de farm seul pendant 15 min par session.');
    }
    if (avgVisMin >= 0.8) strengths.push({ icon: '👁️', text: `Bonne vision : ${avgVisMin.toFixed(2)} Vision/min` });
    else if (avgVisMin < 0.5 && avgVisMin > 0) {
        weaknesses.push({ icon: '👁️', text: `Vision insuffisante : ${avgVisMin.toFixed(2)} Vision/min — achète plus de wards` });
        recs.push('Place des wards avant chaque objectif majeur (Dragon, Baron). Vise 3+ wards placées par partie.');
    }
    if (avgDmgMin >= 800) strengths.push({ icon: '💥', text: `Fort impact offensif : ${fmtK(Math.round(avgDmgMin))} Dmg/min` });
    else if (avgDmgMin < 400 && avgDmgMin > 0) {
        weaknesses.push({ icon: '💥', text: `Dégâts insuffisants : ${fmtK(Math.round(avgDmgMin))} Dmg/min` });
        recs.push('Engage plus les combats d\'équipe. Reste actif sur les objectifs plutôt que de farm en parallèle.');
    }
    const last10 = (h || []).slice(0, 10);
    const l10wr = last10.length ? Math.round(last10.filter(m => m.win).length / last10.length * 100) : null;
    if (l10wr !== null) {
        if (l10wr >= 70) strengths.push({ icon: '🔥', text: `En forme : ${l10wr}% WR sur les 10 dernières parties` });
        else if (l10wr <= 30) weaknesses.push({ icon: '❄️', text: `Période difficile : ${l10wr}% WR sur les 10 dernières — fais une pause ou change de champion` });
    }
    const champs = computeChampStats(h);
    if (champs.length >= 6) {
        weaknesses.push({ icon: '📚', text: `Pool trop large : ${champs.length} champions joués — concentre-toi sur 2-3 champions` });
        recs.push('Limite ton pool à 2-3 champions dans les mêmes rôles pour progresser plus rapidement.');
    } else if (champs.length <= 2 && champs.length > 0) {
        strengths.push({ icon: '🎯', text: `Pool ciblé : maîtrise de ${champs.length} champion(s) principaux` });
    }
    return { strengths, weaknesses, recs, avgCsMin, avgDmgMin, avgVisMin };
}

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
    const champs = computeChampStats(h).slice(0, 5);
    const last10 = (h || []).slice(0, 10);
    const l10wr  = last10.length ? Math.round(last10.filter(m => m.win).length / last10.length * 100) : 0;
    const grades = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    (h || []).forEach(m => grades[perfGrade(m)]++);
    const cons = analyzeConsistency(h);
    const insights = generateInsights(g, h);
    const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const earlyGames = (h || []).filter(m => (m.game_duration || 0) < 25 * 60);
    const lateGames  = (h || []).filter(m => (m.game_duration || 0) > 35 * 60);
    const earlyWR = earlyGames.length > 0 ? Math.round(earlyGames.filter(m => m.win).length / earlyGames.length * 100) : null;
    const lateWR  = lateGames.length  > 0 ? Math.round(lateGames.filter(m => m.win).length  / lateGames.length  * 100) : null;
    const mvpCount = (h || []).filter(m => (m.kills + m.assists) / Math.max(m.deaths, 1) >= 4).length;
    const catCount = (h || []).filter(m => m.deaths >= 8).length;

    return (
        <div className="report-wrapper">
            <div className="report-toolbar no-print">
                <div className="report-toolbar-info">
                    Rapport coach — <strong>{name}</strong>
                    <span className="report-toolbar-sub"> ({total} parties analysées)</span>
                </div>
                <button className="btn-go" style={{ padding: '9px 24px' }} onClick={() => window.print()}>
                    🖨 Imprimer / PDF
                </button>
            </div>

            <div className="report-area">
                <div className="rpt-header">
                    <img src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/profileicon/${r.profile_icon_id || 29}.png`}
                        alt="" className="rpt-avatar" onError={e => { e.target.onerror = null; e.target.style.opacity = '.3'; }} />
                    <div className="rpt-header-info">
                        <div className="rpt-player-name">{name}</div>
                        <div className="rpt-tag">#{tag.split('#')[1] || ''}</div>
                        <div className="rpt-rank">{rankTxt}</div>
                        {r.flex_tier && <div className="rpt-rank-flex">Flex : {r.flex_tier} {r.flex_rank || ''} — {r.flex_lp ?? '?'} LP</div>}
                    </div>
                    <div className="rpt-header-right">
                        <div className="rpt-report-label">RAPPORT D'ANALYSE COACH</div>
                        <div className="rpt-date">{today}</div>
                        <div className="rpt-app-name">LoL Mate Comparator</div>
                        {r.summoner_level && <div className="rpt-level">Niv. {r.summoner_level}</div>}
                    </div>
                </div>

                <div className="rpt-divider" />
                <div className="rpt-section-title">VUE D'ENSEMBLE</div>
                <div className="rpt-stats-grid">
                    {[
                        { lbl: 'Parties', val: total },
                        { lbl: 'Win Rate', val: `${wr}%`, cls: wr >= 55 ? 'rpt-win' : wr <= 45 ? 'rpt-loss' : '' },
                        { lbl: 'KDA global', val: `${toFixed(g.kda, 2)} : 1` },
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
                <div className="rpt-section-title">MÉTRIQUES PAR MINUTE</div>
                <div className="rpt-metrics-row">
                    {[
                        { lbl: 'CS / min', val: avgCsMin, bench: '≥ 7.0 recommandé' },
                        { lbl: 'Dégâts / min', val: avgDmgMin, bench: '≥ 600 recommandé' },
                        { lbl: 'Vision / min', val: avgVisMin, bench: '≥ 0.80 recommandé' },
                    ].map(s => (
                        <div key={s.lbl} className="rpt-metric-pill">
                            <span className="rpt-metric-val">{s.val}</span>
                            <span className="rpt-metric-lbl">{s.lbl}</span>
                            <span style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>{s.bench}</span>
                        </div>
                    ))}
                </div>

                {(earlyWR !== null || lateWR !== null) && (<>
                    <div className="rpt-divider" />
                    <div className="rpt-section-title">PROFIL DE JEU</div>
                    <div className="rpt-stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                        {earlyWR !== null && <div className="rpt-stat-box">
                            <div className={`rpt-stat-val ${earlyWR >= 55 ? 'rpt-win' : earlyWR <= 45 ? 'rpt-loss' : ''}`}>{earlyWR}%</div>
                            <div className="rpt-stat-lbl">WR &lt;25 min ({earlyGames.length}P)</div>
                        </div>}
                        {lateWR !== null && <div className="rpt-stat-box">
                            <div className={`rpt-stat-val ${lateWR >= 55 ? 'rpt-win' : lateWR <= 45 ? 'rpt-loss' : ''}`}>{lateWR}%</div>
                            <div className="rpt-stat-lbl">WR &gt;35 min ({lateGames.length}P)</div>
                        </div>}
                        <div className="rpt-stat-box">
                            <div className="rpt-stat-val" style={{ color: 'var(--gold)' }}>{mvpCount}</div>
                            <div className="rpt-stat-lbl">Parties MVP (KDA ≥ 4)</div>
                        </div>
                        <div className="rpt-stat-box">
                            <div className="rpt-stat-val" style={{ color: 'var(--loss)' }}>{catCount}</div>
                            <div className="rpt-stat-lbl">Catastrophiques (≥8 morts)</div>
                        </div>
                    </div>
                </>)}

                {cons && (<>
                    <div className="rpt-divider" />
                    <div className="rpt-section-title">RÉGULARITÉ & ÉTAT MENTAL</div>
                    <div className="rpt-stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                        <div className="rpt-stat-box">
                            <div className="rpt-stat-val" style={{ color: cons.consistencyScore >= 70 ? 'var(--win)' : cons.consistencyScore >= 50 ? 'var(--gold)' : 'var(--loss)' }}>
                                {cons.consistencyScore}/100
                            </div>
                            <div className="rpt-stat-lbl">Score de régularité</div>
                        </div>
                        <div className="rpt-stat-box">
                            <div className="rpt-stat-val" style={{ color: cons.tiltDelta < -20 ? 'var(--loss)' : cons.tiltDelta > 20 ? 'var(--win)' : 'var(--text)' }}>
                                {cons.tiltDelta > 0 ? '+' : ''}{Math.round(cons.tiltDelta)}%
                            </div>
                            <div className="rpt-stat-lbl">Évolution récente KDA</div>
                        </div>
                        <div className="rpt-stat-box">
                            <div className="rpt-stat-val" style={{ color: cons.streakType ? 'var(--win)' : 'var(--loss)' }}>
                                {cons.streak > 1 ? `${cons.streakType ? '🔥' : '🥶'} ${cons.streak}` : '—'}
                            </div>
                            <div className="rpt-stat-lbl">Streak actuelle</div>
                        </div>
                        <div className="rpt-stat-box">
                            <div className="rpt-stat-val">
                                {cons.isTilting ? <span style={{ color: 'var(--loss)' }}>En tilt</span>
                                    : cons.isHot ? <span style={{ color: 'var(--win)' }}>En forme 🔥</span>
                                    : <span style={{ color: 'var(--text-mid)' }}>Stable</span>}
                            </div>
                            <div className="rpt-stat-lbl">État mental estimé</div>
                        </div>
                    </div>
                </>)}

                {champs.length > 0 && (<>
                    <div className="rpt-divider" />
                    <div className="rpt-section-title">CHAMPION POOL ({champs.length} champions joués)</div>
                    <div className="rpt-champs-list">
                        {champs.map((c, i) => (
                            <div key={c.name} className="rpt-champ-row">
                                <span className="rpt-champ-rank">#{i + 1}</span>
                                <img src={`https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/champion/${getChampKey(c.name)}.png`}
                                    alt={c.name} className="rpt-champ-icon" onError={e => { e.target.onerror = null; e.target.style.opacity = '.15'; }} />
                                <span className="rpt-champ-name">{c.name}</span>
                                <span className="rpt-champ-games">{c.games}P</span>
                                <div className="rpt-wr-wrap">
                                    <span className={`rpt-champ-wr ${c.wr >= 55 ? 'rpt-win' : c.wr <= 45 ? 'rpt-loss' : ''}`}>{c.wr}%</span>
                                    <div className="rpt-wr-bar"><div className="rpt-wr-fill" style={{ width: `${c.wr}%`, background: c.wr >= 55 ? 'var(--win)' : c.wr <= 45 ? 'var(--loss)' : 'var(--gold)' }} /></div>
                                </div>
                                <span className="rpt-champ-kda">{c.kda} KDA</span>
                            </div>
                        ))}
                    </div>
                </>)}

                <div className="rpt-divider" />
                <div className="rpt-section-title">FORME RÉCENTE — {last10.length} DERNIERS MATCHS</div>
                <div className="rpt-form-row">
                    {last10.map((m, i) => <div key={i} className={`rpt-form-dot ${m.win ? 'rpt-dot-w' : 'rpt-dot-l'}`} title={m.champion_name} />)}
                    <span className="rpt-form-pct">{l10wr}% ({last10.filter(m => m.win).length}V {last10.length - last10.filter(m => m.win).length}D)</span>
                </div>

                <div className="rpt-divider" />
                <div className="rpt-section-title">DISTRIBUTION DES PERFORMANCES</div>
                <div className="rpt-grades-row">
                    {Object.entries(grades).map(([grade, count]) => (
                        <div key={grade} className="rpt-grade-box">
                            <div className="rpt-grade-letter" style={{ color: GRADE_COLORS[grade] }}>{grade}</div>
                            <div className="rpt-grade-count">{count}</div>
                            <div className="rpt-grade-bar-bg"><div className="rpt-grade-bar-fill" style={{ height: `${h?.length ? count / h.length * 100 : 0}%`, background: GRADE_COLORS[grade] }} /></div>
                        </div>
                    ))}
                </div>

                <div className="rpt-divider" />
                <div className="rpt-section-title">ANALYSE COACH</div>
                <div className="rpt-coach-grid">
                    <div className="rpt-coach-card">
                        <div className="rpt-coach-card-title rpt-strength">✅ Points forts</div>
                        {insights.strengths.length === 0
                            ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Données insuffisantes.</div>
                            : insights.strengths.map((s, i) => (
                                <div key={i} className="rpt-item-row-coach"><span className="icon">{s.icon}</span><span>{s.text}</span></div>
                            ))}
                    </div>
                    <div className="rpt-coach-card">
                        <div className="rpt-coach-card-title rpt-weakness">⚠️ Axes d'amélioration</div>
                        {insights.weaknesses.length === 0
                            ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Aucune faiblesse majeure détectée.</div>
                            : insights.weaknesses.map((w, i) => (
                                <div key={i} className="rpt-item-row-coach"><span className="icon">{w.icon}</span><span>{w.text}</span></div>
                            ))}
                    </div>
                    <div className="rpt-coach-card">
                        <div className="rpt-coach-card-title">🎮 Style de jeu</div>
                        {earlyWR !== null && lateWR !== null && (
                            <div className="rpt-item-row-coach"><span className="icon">⏱</span>
                                <span>{earlyWR > lateWR
                                    ? `Profil early game — WR: ${earlyWR}% (court) vs ${lateWR}% (long). Joue sur les snowball.`
                                    : lateWR > earlyWR
                                    ? `Profil late game — WR: ${lateWR}% (long) vs ${earlyWR}% (court). Favorise les teamfights.`
                                    : `Style équilibré — WR similaire early/late.`}</span>
                            </div>
                        )}
                        {mvpCount > 0 && <div className="rpt-item-row-coach"><span className="icon">🏅</span><span>{mvpCount} performance(s) MVP ({Math.round(mvpCount / Math.max(total, 1) * 100)}% des parties) — potentiel de carry</span></div>}
                        {catCount > 0 && <div className="rpt-item-row-coach"><span className="icon">⚡</span><span>{catCount} partie(s) catastrophique(s) — identifie les patterns qui mènent à ces défaites</span></div>}
                        {cons && <div className="rpt-item-row-coach"><span className="icon">📈</span><span>Régularité {cons.consistencyScore >= 70 ? 'excellente' : cons.consistencyScore >= 50 ? 'correcte' : 'à améliorer'} (score: {cons.consistencyScore}/100)</span></div>}
                    </div>
                    <div className="rpt-coach-card">
                        <div className="rpt-coach-card-title">📝 Plan d'entraînement</div>
                        {insights.recs.length === 0
                            ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Profil solide — maintiens la régularité.</div>
                            : insights.recs.map((rec, i) => <div key={i} className="rpt-item-row-coach"><span className="icon">▶</span><span>{rec}</span></div>)}
                        {cons?.isTilting && (
                            <div className="rpt-rec-box" style={{ marginTop: 10 }}>
                                <div className="rpt-rec-title">⚠️ Tilt détecté</div>
                                <div className="rpt-rec-item">• Fais une pause de 30 min minimum</div>
                                <div className="rpt-rec-item">• Joue des modes normaux / ARAM</div>
                                <div className="rpt-rec-item">• Réduis le nombre de parties par session</div>
                            </div>
                        )}
                        {cons?.isHot && (
                            <div className="rpt-rec-box" style={{ marginTop: 10, borderColor: 'rgba(74,222,128,0.2)', background: 'rgba(74,222,128,0.04)' }}>
                                <div className="rpt-rec-title" style={{ color: 'var(--win)' }}>🔥 En pleine forme !</div>
                                <div className="rpt-rec-item">• Joue ta ranked maintenant</div>
                                <div className="rpt-rec-item">• Reste sur tes champions forts</div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="rpt-divider" />
                <div className="rpt-footer">
                    Rapport généré sur {total} partie{total > 1 ? 's' : ''} · LoL Mate Comparator · {today}<br />
                    <span style={{ fontSize: 10 }}>Ce rapport est un outil d'aide. Les données proviennent de l'API Riot Games.</span>
                </div>
            </div>
        </div>
    );
}
