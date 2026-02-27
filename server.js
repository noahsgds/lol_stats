// server.js
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors({
    origin: [/https:\/\/.*\.github\.io$/, /http:\/\/localhost(:\d+)?$/]
}));
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const RIOT_API_KEY = process.env.RIOT_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const REGION_HOST = 'https://europe.api.riotgames.com';
const PLATFORM_HOST = 'https://euw1.api.riotgames.com';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const getRiot = async (url, retries = 3) => {
    const finalUrl = `${url}${url.includes('?') ? '&' : '?'}api_key=${RIOT_API_KEY}`;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            return await axios.get(finalUrl);
        } catch (err) {
            if (err.response?.status === 429) {
                const wait = (parseInt(err.response.headers['retry-after']) || 5) * 1000;
                console.warn(`⚠️ RATE LIMIT — pause ${wait / 1000}s...`);
                await sleep(wait);
            } else if (err.response?.status === 403) {
                console.error('🔑 CLÉ RIOT EXPIRÉE → https://developer.riotgames.com');
                throw err;
            } else if (attempt === retries - 1) {
                throw err;
            } else {
                await sleep(500);
            }
        }
    }
    throw new Error(`Rate limit non résolu après ${retries} tentatives`);
};

// ─── SYNC (rapide, 20 matchs, tout en parallèle) ──────────
app.get('/sync', async (req, res) => {
    try {
        const riotIdRaw = req.query.riotId;
        if (!riotIdRaw?.includes('#'))
            return res.status(400).json({ error: 'Format: Pseudo#TAG' });

        const [gameName, tagLine] = riotIdRaw.split('#').map(s => s.trim());
        const fullRiotId = `${gameName}#${tagLine}`;
        console.log(`\n🔄 SYNC : ${fullRiotId}`);

        // 1. PUUID
        const { data: acc } = await getRiot(
            `${REGION_HOST}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
        );
        const { puuid } = acc;

        // 2. Summoner + Match IDs + Leagues en parallèle (league directement par PUUID)
        const [sumRes, matchIdsRes, leaguesRes] = await Promise.all([
            getRiot(`${PLATFORM_HOST}/lol/summoner/v4/summoners/by-puuid/${puuid}`),
            getRiot(`${REGION_HOST}/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=20`),
            getRiot(`${PLATFORM_HOST}/lol/league/v4/entries/by-puuid/${puuid}`),
        ]);
        const sum = sumRes.data;
        const matchIds = matchIdsRes.data;

        // 3. Batch check DB
        const existingRes = await supabase.from('bronze_matches').select('match_id').in('match_id', matchIds);

        // 4. Calcul des nouveaux matchs
        const existingSet = new Set((existingRes.data || []).map(r => r.match_id));
        const newMatchIds = matchIds.filter(id => !existingSet.has(id));
        console.log(`   📋 ${newMatchIds.length} nouveau(x) sur ${matchIds.length}`);

        // 5. Rank upsert (synchrone, garanti avant la réponse)
        try {
            let rankData = {
                puuid, riot_id: fullRiotId, summoner_id: sum.id,
                profile_icon_id: sum.profileIconId, summoner_level: sum.summonerLevel,
                updated_at: new Date().toISOString()
            };
            (leaguesRes.data || []).forEach(e => {
                if (e.queueType === 'RANKED_SOLO_5x5')
                    rankData = { ...rankData, solo_tier: e.tier, solo_rank: e.rank, solo_lp: e.leaguePoints, solo_wins: e.wins, solo_losses: e.losses };
                if (e.queueType === 'RANKED_FLEX_SR')
                    rankData = { ...rankData, flex_tier: e.tier, flex_rank: e.rank, flex_lp: e.leaguePoints, flex_wins: e.wins, flex_losses: e.losses };
            });
            console.log(`   🏆 Rang solo: ${rankData.solo_tier || 'NON CLASSÉ'} ${rankData.solo_rank || ''} ${rankData.solo_lp ?? '?'}LP`);
            // Snapshot rang avec match_ids pour LP tracking
            const { data: prevRank } = await supabase.from('player_ranks')
                .select('rank_history').eq('puuid', puuid).maybeSingle();
            const rankHist = prevRank?.rank_history || [];
            rankHist.push({
                date: new Date().toISOString().split('T')[0],
                timestamp: new Date().toISOString(),
                solo_tier: rankData.solo_tier || null, solo_rank: rankData.solo_rank || null, solo_lp: rankData.solo_lp ?? null,
                flex_tier: rankData.flex_tier || null, flex_rank: rankData.flex_rank || null, flex_lp: rankData.flex_lp ?? null,
                match_ids: newMatchIds,
            });
            rankData.rank_history = rankHist.slice(-50);
            const { error: rankErr } = await supabase.from('player_ranks').upsert(rankData, { onConflict: 'puuid' });
            if (rankErr) {
                console.warn('Rank upsert échoué, retry sans rank_history:', rankErr.message);
                const { rank_history: _ign, ...safeRankData } = rankData;
                const { error: rankErr2 } = await supabase.from('player_ranks').upsert(safeRankData, { onConflict: 'puuid' });
                if (rankErr2) console.warn('Rank retry échoué:', rankErr2.message);
                else console.log('   ✅ Rang sauvegardé (sans rank_history)');
            } else {
                console.log('   ✅ Rang sauvegardé');
            }
        } catch (e) { console.warn('Rangs ignorés:', e.message); }

        let added = 0;
        if (newMatchIds.length > 0) {
            for (let i = 0; i < newMatchIds.length; i += 5) {
                const batch = newMatchIds.slice(i, i + 5);
                const results = await Promise.all(
                    batch.map(async matchId => {
                        try {
                            const { data: detail } = await getRiot(`${REGION_HOST}/lol/match/v5/matches/${matchId}`);
                            const { error: insErr } = await supabase.from('bronze_matches')
                                .insert({ match_id: matchId, match_data: detail });
                            if (insErr && insErr.code !== '23505') console.error(`❌ Insert [${insErr.code}] ${insErr.message}`);
                            return !insErr || insErr?.code === '23505';
                        } catch (e) {
                            console.error(`❌ ${matchId}:`, e.message);
                            return false;
                        }
                    })
                );
                added += results.filter(Boolean).length;
                if (i + 5 < newMatchIds.length) await sleep(300);
            }
        }

        console.log(`   ✅ +${added} nouveaux | ${existingSet.size} déjà en base`);
        res.set('Cache-Control', 'no-store');
        res.json({ ok: true, added, skipped: existingSet.size, rank: rankData });

    } catch (err) {
        console.error('Sync error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── IMPORT (historique complet 50 matchs, arrière-plan) ──
app.get('/import', async (req, res) => {
    res.json({ success: true, message: 'Import lancé en arrière-plan' });
    try {
        const riotIdRaw = req.query.riotId;
        if (!riotIdRaw?.includes('#')) return;

        const [gameName, tagLine] = riotIdRaw.split('#').map(s => s.trim());
        const fullRiotId = `${gameName}#${tagLine}`;
        console.log(`\n📥 IMPORT : ${fullRiotId}`);

        const { data: acc } = await getRiot(
            `${REGION_HOST}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
        );
        const { puuid } = acc;

        const [sumRes, matchIdsRes, leaguesRes] = await Promise.all([
            getRiot(`${PLATFORM_HOST}/lol/summoner/v4/summoners/by-puuid/${puuid}`),
            getRiot(`${REGION_HOST}/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=50`),
            getRiot(`${PLATFORM_HOST}/lol/league/v4/entries/by-puuid/${puuid}`),
        ]);
        const sum = sumRes.data;
        const matchIds = matchIdsRes.data;

        // Batch check existants (avant rank upsert pour avoir newMatchIds pour LP tracking)
        const { data: existingRows } = await supabase.from('bronze_matches').select('match_id').in('match_id', matchIds);
        const existingSet = new Set((existingRows || []).map(r => r.match_id));
        const newMatchIds = matchIds.filter(id => !existingSet.has(id));
        console.log(`   📋 ${newMatchIds.length} nouveaux sur ${matchIds.length}`);

        let rankData = {
            puuid, riot_id: fullRiotId, summoner_id: sum.id,
            profile_icon_id: sum.profileIconId, summoner_level: sum.summonerLevel,
            updated_at: new Date().toISOString()
        };
        (leaguesRes.data || []).forEach(e => {
            if (e.queueType === 'RANKED_SOLO_5x5')
                rankData = { ...rankData, solo_tier: e.tier, solo_rank: e.rank, solo_lp: e.leaguePoints, solo_wins: e.wins, solo_losses: e.losses };
            if (e.queueType === 'RANKED_FLEX_SR')
                rankData = { ...rankData, flex_tier: e.tier, flex_rank: e.rank, flex_lp: e.leaguePoints, flex_wins: e.wins, flex_losses: e.losses };
        });
        // Snapshot rang avec match_ids pour LP tracking
        const { data: prevRank } = await supabase.from('player_ranks')
            .select('rank_history').eq('puuid', puuid).maybeSingle();
        const rankHist = prevRank?.rank_history || [];
        rankHist.push({
            date: new Date().toISOString().split('T')[0],
            timestamp: new Date().toISOString(),
            solo_tier: rankData.solo_tier || null, solo_rank: rankData.solo_rank || null, solo_lp: rankData.solo_lp ?? null,
            flex_tier: rankData.flex_tier || null, flex_rank: rankData.flex_rank || null, flex_lp: rankData.flex_lp ?? null,
            match_ids: newMatchIds,
        });
        rankData.rank_history = rankHist.slice(-50);
        const { error: rankErr } = await supabase.from('player_ranks').upsert(rankData, { onConflict: 'puuid' });
        if (rankErr) {
            console.warn('Rank upsert échoué, retry sans rank_history:', rankErr.message);
            const { rank_history: _ign, ...safeRankData } = rankData;
            await supabase.from('player_ranks').upsert(safeRankData, { onConflict: 'puuid' });
        }

        // Fetch par batch de 10 en parallèle
        let added = 0, errors = 0;
        for (let i = 0; i < newMatchIds.length; i += 10) {
            const batch = newMatchIds.slice(i, i + 10);
            const results = await Promise.all(
                batch.map(async matchId => {
                    try {
                        const { data: detail } = await getRiot(`${REGION_HOST}/lol/match/v5/matches/${matchId}`);
                        const { error: insErr } = await supabase.from('bronze_matches').insert({ match_id: matchId, match_data: detail });
                        return !insErr || insErr?.code === '23505';
                    } catch (e) { errors++; return false; }
                })
            );
            added += results.filter(Boolean).length;
            if (i + 10 < newMatchIds.length) await sleep(200);
        }
        console.log(`✅ Import terminé : +${added} | ${existingSet.size} déjà présents | ${errors} erreurs`);
    } catch (err) {
        console.error('Import error:', err.message);
    }
});

// ─── LIVE GAME (résout les PUUIDs → vrais noms + rangs) ───
app.get('/live', async (req, res) => {
    try {
        const { riotId, puuid: directPuuid } = req.query;
        let puuid = directPuuid;

        if (!puuid) {
            if (!riotId?.includes('#')) return res.status(400).json({ error: 'Paramètre riotId requis (Pseudo#TAG)' });
            const [gameName, tagLine] = riotId.split('#').map(s => s.trim());
            const { data: acc } = await getRiot(
                `${REGION_HOST}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
            );
            puuid = acc.puuid;
        }

        try {
            const { data: live } = await getRiot(`${PLATFORM_HOST}/lol/spectator/v5/active-games/by-summoner/${puuid}`);

            // Résoudre chaque participant PUUID → gameName#tagLine + rang solo
            const participants = live.participants || [];
            const enriched = [];
            for (let i = 0; i < participants.length; i += 5) {
                const batch = participants.slice(i, i + 5);
                const results = await Promise.all(batch.map(async p => {
                    try {
                        const [accRes, leagueRes] = await Promise.all([
                            getRiot(`${REGION_HOST}/riot/account/v1/accounts/by-puuid/${p.puuid}`),
                            getRiot(`${PLATFORM_HOST}/lol/league/v4/entries/by-puuid/${p.puuid}`),
                        ]);
                        const acc = accRes.data;
                        const solo = (leagueRes.data || []).find(e => e.queueType === 'RANKED_SOLO_5x5');
                        return {
                            ...p,
                            gameName: acc.gameName,
                            tagLine: acc.tagLine,
                            soloTier: solo?.tier || null,
                            soloRank: solo?.rank || null,
                            soloLp: solo?.leaguePoints ?? null,
                            soloWins: solo?.wins ?? 0,
                            soloLosses: solo?.losses ?? 0,
                        };
                    } catch {
                        return { ...p, gameName: p.summonerName || null, tagLine: null, soloTier: null, soloRank: null, soloLp: null };
                    }
                }));
                enriched.push(...results);
                if (i + 5 < participants.length) await sleep(200);
            }

            res.json({ inGame: true, ...live, participants: enriched });
        } catch (e) {
            if (e.response?.status === 404) res.json({ inGame: false });
            else throw e;
        }
    } catch (err) {
        console.error('Live error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── LADDER ───────────────────────────────────────────────
app.get('/ladder', async (req, res) => {
    try {
        const type = req.query.type || 'challenger';
        const ep = { challenger: 'challengerleagues', grandmaster: 'grandmasterleagues', master: 'masterleagues' }[type] || 'challengerleagues';
        const { data } = await getRiot(`${PLATFORM_HOST}/lol/league/v4/${ep}/by-queue/RANKED_SOLO_5x5`);
        const sorted = (data.entries || []).sort((a, b) => b.leaguePoints - a.leaguePoints).slice(0, 50).map((e, i) => ({ rank: i + 1, ...e }));
        res.json({ tier: data.tier, entries: sorted });
    } catch (err) {
        console.error('Ladder error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/ping', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ─── DEBUG RANK ────────────────────────────────────────────
// Vérifie ce qui est réellement sauvegardé dans player_ranks
app.get('/debug-rank', async (req, res) => {
    try {
        const riotId = req.query.riotId;

        // 1. Lire toutes les lignes de player_ranks
        const { data: allRows, error: allErr } = await supabase.from('player_ranks').select('*').limit(10);

        // 2. Si riotId fourni, chercher la ligne correspondante
        let found = null, foundErr = null;
        if (riotId) {
            const [n, t] = riotId.split('#').map(s => s.trim());
            const { data, error } = await supabase.from('player_ranks').select('*').ilike('riot_id', `${n}#${t}`).maybeSingle();
            found = data;
            foundErr = error;
        }

        // 3. Si riotId fourni, tenter un fetch Riot live pour comparer
        let riotLive = null;
        if (riotId) {
            try {
                const [n, t] = riotId.split('#').map(s => s.trim());
                const { data: acc } = await getRiot(`${REGION_HOST}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(n)}/${encodeURIComponent(t)}`);
                const { data: leagues } = await getRiot(`${PLATFORM_HOST}/lol/league/v4/entries/by-puuid/${acc.puuid}`);
                riotLive = {
                    puuid: acc.puuid,
                    leagues: leagues,
                };
            } catch (e) {
                riotLive = { error: e.message };
            }
        }

        res.json({
            allRows: allRows || [],
            allErr: allErr?.message || null,
            found: found || null,
            foundErr: foundErr?.message || null,
            riotLive,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── TOURNAMENT ───────────────────────────────────────────
const postRiot = async (url, body) => {
    return await axios.post(url, body, {
        headers: { 'X-Riot-Token': RIOT_API_KEY, 'Content-Type': 'application/json' },
    });
};

// POST /tournament/codes  — crée provider + tournoi + codes pour un match
app.post('/tournament/codes', async (req, res) => {
    try {
        const { label = 'Match', format = 'BO1' } = req.body || {};
        const gpp = format === 'BO5' ? 5 : format === 'BO3' ? 3 : 1;

        // 1. Enregistrer le provider
        const { data: providerId } = await postRiot(
            `${PLATFORM_HOST}/lol/tournament-stub/v5/providers`,
            { region: 'EUW', url: 'https://lol-stats-svlz.onrender.com/tournament/callback' }
        );

        // 2. Créer le tournoi
        const { data: tournamentId } = await postRiot(
            `${PLATFORM_HOST}/lol/tournament-stub/v5/tournaments`,
            { name: label, providerId }
        );

        // 3. Générer les codes
        const { data: codes } = await postRiot(
            `${PLATFORM_HOST}/lol/tournament-stub/v5/codes?count=${gpp}&tournamentId=${tournamentId}`,
            { mapType: 'SUMMONERS_RIFT', pickType: 'TOURNAMENT_DRAFT', spectatorType: 'ALL', teamSize: 5 }
        );

        console.log(`🏆 Codes tournoi générés pour "${label}" (${format}) — ${codes.length} code(s)`);
        res.json({ ok: true, codes });
    } catch (err) {
        console.error('Tournament codes error:', err.response?.data || err.message);
        res.status(500).json({ error: err.response?.data?.message || err.message });
    }
});

// Callback Riot (réception des résultats de match)
app.post('/tournament/callback', (req, res) => {
    console.log('🏆 Tournament callback reçu:', JSON.stringify(req.body));
    res.json({ ok: true });
});

// ─── MATCH DETAIL ─────────────────────────────────────────
// Retourne le JSON complet Riot pour un match (10 joueurs, objectifs, etc.)
app.get('/match/:matchId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('bronze_matches')
            .select('match_data')
            .eq('match_id', req.params.matchId)
            .single();
        if (error || !data) return res.status(404).json({ error: 'Match non trouvé en base' });
        res.set('Cache-Control', 'public, max-age=86400'); // immuable — les matchs ne changent pas
        res.json(data.match_data);
    } catch (err) {
        console.error('Match detail error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
// ─── CHAMPION STATS (agrégation depuis bronze_matches) ────
app.get('/champion-stats', async (req, res) => {
    try {
        const champ = req.query.champ;
        if (!champ) return res.status(400).json({ error: 'champ requis' });

        // Chercher les matchs contenant ce champion (text scan sur JSONB)
        const { data: rows, error } = await supabase
            .from('bronze_matches')
            .select('match_data')
            .filter('match_data::text', 'ilike', `%"championName":"${champ}"%`)
            .limit(100);

        if (error) return res.status(500).json({ error: error.message });
        if (!rows?.length) return res.json({ games: 0, wr: 0, kda: 0, csMin: 0, topItems: [], topSpells: [] });

        // Extraire les participants qui jouaient ce champion
        const participants = [];
        for (const row of rows) {
            const ps = row.match_data?.info?.participants || [];
            for (const p of ps) {
                if (p.championName === champ) participants.push(p);
            }
        }

        if (!participants.length) return res.json({ games: 0, wr: 0, kda: 0, csMin: 0, topItems: [], topSpells: [] });

        // Stats globales
        const games = participants.length;
        const wins  = participants.filter(p => p.win).length;
        const wr    = Math.round(wins / games * 100);
        const kda   = participants.reduce((a, p) => a + (p.kills + p.assists) / Math.max(p.deaths, 1), 0) / games;
        const csMin = participants.reduce((a, p) => {
            const dur = Math.max((p.timePlayed || row?.match_data?.info?.gameDuration || 1800) / 60, 1);
            return a + (p.totalMinionsKilled + (p.neutralMinionsKilled || 0)) / dur;
        }, 0) / games;

        // Agrégation des items
        const itemMap = {};
        const itemWinMap = {};
        for (const p of participants) {
            for (const slot of ['item0','item1','item2','item3','item4','item5','item6']) {
                const id = p[slot];
                if (!id || id === 0) continue;
                itemMap[id] = (itemMap[id] || 0) + 1;
                if (p.win) itemWinMap[id] = (itemWinMap[id] || 0) + 1;
            }
        }
        const topItems = Object.entries(itemMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([id, count]) => ({
                id,
                pickPct: Math.round(count / games * 100),
                wr: Math.round((itemWinMap[id] || 0) / count * 100),
            }));

        // Agrégation des sorts
        const spellMap = {};
        for (const p of participants) {
            const combo = [p.summoner1Id, p.summoner2Id].sort().join('+');
            spellMap[combo] = (spellMap[combo] || 0) + 1;
        }
        const topSpellCombos = Object.entries(spellMap).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const SPELL_NAMES = { 4:'Flash', 11:'Smite', 14:'Ignite', 21:'Barrier', 3:'Exhaust', 1:'Cleanse', 6:'Ghost', 7:'Heal', 13:'Clarity', 32:'Mark' };
        const topSpells = topSpellCombos.map(([combo, count]) => {
            const [d, f] = combo.split('+');
            return { d: SPELL_NAMES[d] || `Sort ${d}`, f: SPELL_NAMES[f] || `Sort ${f}`, pct: Math.round(count / games * 100) };
        });

        res.json({ games, wr, kda: parseFloat(kda.toFixed(2)), csMin: parseFloat(csMin.toFixed(1)), topItems, topSpells });
    } catch (err) {
        console.error('Champion stats error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── CHAMPION PROBUILDS (parties récentes de joueurs hauts ELO) ─
app.get('/champion-probuilds', async (req, res) => {
    try {
        const champ = req.query.champ;
        if (!champ) return res.status(400).json({ error: 'champ requis' });

        // Chercher les matchs de ce champion depuis notre base
        const { data: rows, error } = await supabase
            .from('bronze_matches')
            .select('match_data')
            .filter('match_data::text', 'ilike', `%"championName":"${champ}"%`)
            .order('match_id', { ascending: false })
            .limit(50);

        if (error || !rows?.length) return res.json({ games: [] });

        const games = [];
        for (const row of rows) {
            const info = row.match_data?.info;
            if (!info) continue;
            const ps = info.participants || [];
            const p = ps.find(x => x.championName === champ);
            if (!p) continue;

            // Chercher le rang du joueur dans notre table
            const { data: rankRow } = await supabase
                .from('player_ranks')
                .select('riot_id, solo_tier, solo_rank')
                .eq('puuid', p.puuid)
                .maybeSingle();

            games.push({
                playerName: rankRow?.riot_id?.split('#')[0] || p.riotIdGameName || p.summonerName || 'Inconnu',
                tier: rankRow?.solo_tier || null,
                rank: rankRow?.solo_rank || null,
                win: p.win,
                kills: p.kills, deaths: p.deaths, assists: p.assists,
                item0: p.item0, item1: p.item1, item2: p.item2,
                item3: p.item3, item4: p.item4, item5: p.item5,
                gameDate: info.gameEndTimestamp
                    ? new Date(info.gameEndTimestamp).toLocaleDateString('fr-FR')
                    : '—',
            });
            if (games.length >= 15) break;
        }

        res.json({ games });
    } catch (err) {
        console.error('Probuilds error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── CHAMPION MATCHUPS (win/loss vs chaque adversaire) ────
app.get('/champion-matchups', async (req, res) => {
    try {
        const champ = req.query.champ;
        if (!champ) return res.status(400).json({ error: 'champ requis' });

        const { data: rows, error } = await supabase
            .from('bronze_matches')
            .select('match_data')
            .filter('match_data::text', 'ilike', `%"championName":"${champ}"%`)
            .limit(100);

        if (error || !rows?.length) return res.json({ matchups: [] });

        const vsMap = {}; // { champName: { games, wins } }

        for (const row of rows) {
            const ps = row.match_data?.info?.participants || [];
            const player = ps.find(x => x.championName === champ);
            if (!player) continue;

            // Adversaires = équipe opposée
            const opponents = ps.filter(x => x.teamId !== player.teamId);
            for (const opp of opponents) {
                const name = opp.championName;
                if (!name) continue;
                vsMap[name] = vsMap[name] || { games: 0, wins: 0 };
                vsMap[name].games++;
                if (player.win) vsMap[name].wins++;
            }
        }

        const matchups = Object.entries(vsMap)
            .filter(([, v]) => v.games >= 1)
            .map(([vs, v]) => ({
                vs,
                games: v.games,
                wr: Math.round(v.wins / v.games * 100),
            }))
            .sort((a, b) => b.games - a.games)
            .slice(0, 20);

        res.json({ matchups });
    } catch (err) {
        console.error('Matchups error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Serveur prêt → http://localhost:${PORT}`));
