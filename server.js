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
const TIER_ORDER = { CHALLENGER: 0, GRANDMASTER: 1, MASTER: 2, DIAMOND: 3, EMERALD: 4, PLATINUM: 5, GOLD: 6, SILVER: 7, BRONZE: 8, IRON: 9 };

app.get('/champion-probuilds', async (req, res) => {
    try {
        const champ = req.query.champ;
        if (!champ) return res.status(400).json({ error: 'champ requis' });

        // Scan the last 500 matches for this champion
        const { data: rows, error } = await supabase
            .from('bronze_matches')
            .select('match_data')
            .filter('match_data::text', 'ilike', `%"championName":"${champ}"%`)
            .order('match_id', { ascending: false })
            .limit(500);

        if (error || !rows?.length) return res.json({ games: [] });

        // Collect all (puuid, participant) pairs for this champion
        const entries = [];
        for (const row of rows) {
            const info = row.match_data?.info;
            if (!info) continue;
            const p = (info.participants || []).find(x => x.championName === champ);
            if (p) entries.push({ p, info });
            if (entries.length >= 50) break;
        }

        // Batch-fetch all ranks at once
        const puuids = [...new Set(entries.map(e => e.p.puuid))];
        const { data: rankRows } = await supabase
            .from('player_ranks')
            .select('puuid, riot_id, solo_tier, solo_rank, solo_lp')
            .in('puuid', puuids);
        const rankMap = {};
        for (const r of (rankRows || [])) rankMap[r.puuid] = r;

        const games = entries.map(({ p, info }) => {
            const r = rankMap[p.puuid];
            return {
                playerName: r?.riot_id?.split('#')[0] || p.riotIdGameName || p.summonerName || 'Inconnu',
                riotId: r?.riot_id || null,
                tier: r?.solo_tier || null,
                rank: r?.solo_rank || null,
                lp: r?.solo_lp ?? null,
                win: p.win,
                kills: p.kills, deaths: p.deaths, assists: p.assists,
                item0: p.item0, item1: p.item1, item2: p.item2,
                item3: p.item3, item4: p.item4, item5: p.item5,
                summoner1Id: p.summoner1Id, summoner2Id: p.summoner2Id,
                gameDate: info.gameEndTimestamp
                    ? new Date(info.gameEndTimestamp).toLocaleDateString('fr-FR')
                    : '—',
                _tierOrder: TIER_ORDER[r?.solo_tier] ?? 99,
            };
        });

        // Sort: high elo first, then unranked
        games.sort((a, b) => a._tierOrder - b._tierOrder);
        games.forEach(g => delete g._tierOrder);

        res.json({ games: games.slice(0, 30) });
    } catch (err) {
        console.error('Probuilds error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── SYNC CHALLENGERS (job de fond) ───────────────────────
let challSyncState = { running: false, total: 0, progress: 0, matchesAdded: 0, playersUpserted: 0, errors: 0, lastRun: null };

app.get('/sync-challengers/status', (req, res) => res.json(challSyncState));

app.post('/sync-challengers', async (req, res) => {
    if (challSyncState.running)
        return res.json({ ok: false, message: 'Sync déjà en cours', ...challSyncState });

    res.json({ ok: true, message: 'Sync challengers démarré en arrière-plan' });

    (async () => {
        challSyncState = { running: true, total: 0, progress: 0, matchesAdded: 0, playersUpserted: 0, errors: 0, lastRun: new Date().toISOString() };
        try {
            console.log('🏆 Sync challengers démarré...');

            // 1. Fetch Challenger + Grandmaster lists
            const tiers = [
                { ep: 'challengerleagues',  tier: 'CHALLENGER' },
                { ep: 'grandmasterleagues', tier: 'GRANDMASTER' },
            ];
            const allEntries = [];
            for (const { ep, tier } of tiers) {
                try {
                    const { data } = await getRiot(`${PLATFORM_HOST}/lol/league/v4/${ep}/by-queue/RANKED_SOLO_5x5`);
                    for (const e of (data.entries || []))
                        allEntries.push({ ...e, tier, lp: e.leaguePoints });
                } catch (e) { console.warn(`Fetch ${ep} failed: ${e.message}`); }
                await sleep(300);
            }
            challSyncState.total = allEntries.length;
            console.log(`   ${allEntries.length} joueurs à synchroniser`);

            // 2. Process in batches of 3 (rate-limit safe)
            for (let i = 0; i < allEntries.length; i += 3) {
                challSyncState.progress = i;
                const batch = allEntries.slice(i, i + 3);

                await Promise.all(batch.map(async entry => {
                    try {
                        // a. summonerId → PUUID + icon
                        const sumRes = await getRiot(`${PLATFORM_HOST}/lol/summoner/v4/summoners/${entry.summonerId}`);
                        const sum = sumRes.data;
                        await sleep(80);

                        // b. PUUID → Riot ID (gameName#tagLine)
                        const accRes = await getRiot(`${REGION_HOST}/riot/account/v1/accounts/by-puuid/${sum.puuid}`);
                        const riotId = `${accRes.data.gameName}#${accRes.data.tagLine}`;
                        await sleep(80);

                        // c. Upsert rank (preserve existing rank_history)
                        const { data: existing } = await supabase.from('player_ranks').select('rank_history').eq('puuid', sum.puuid).maybeSingle();
                        await supabase.from('player_ranks').upsert({
                            puuid: sum.puuid,
                            riot_id: riotId,
                            summoner_id: entry.summonerId,
                            profile_icon_id: sum.profileIconId,
                            summoner_level: sum.summonerLevel,
                            solo_tier: entry.tier,
                            solo_rank: null,
                            solo_lp: entry.lp,
                            solo_wins: entry.wins,
                            solo_losses: entry.losses,
                            rank_history: existing?.rank_history || [],
                            updated_at: new Date().toISOString(),
                        }, { onConflict: 'puuid' });
                        challSyncState.playersUpserted++;

                        // d. Fetch match IDs
                        const matchIdsRes = await getRiot(`${REGION_HOST}/lol/match/v5/matches/by-puuid/${sum.puuid}/ids?start=0&count=20`);
                        const matchIds = matchIdsRes.data || [];
                        await sleep(80);

                        // e. Check which matches we already have
                        const { data: existingMatches } = await supabase
                            .from('bronze_matches').select('match_id').in('match_id', matchIds);
                        const existingSet = new Set((existingMatches || []).map(r => r.match_id));
                        const newIds = matchIds.filter(id => !existingSet.has(id)).slice(0, 5);

                        // f. Store new matches
                        for (const matchId of newIds) {
                            try {
                                const { data: detail } = await getRiot(`${REGION_HOST}/lol/match/v5/matches/${matchId}`);
                                const { error } = await supabase.from('bronze_matches').insert({ match_id: matchId, match_data: detail });
                                if (!error || error.code === '23505') challSyncState.matchesAdded++;
                                await sleep(150);
                            } catch { challSyncState.errors++; }
                        }
                    } catch (e) {
                        challSyncState.errors++;
                        console.warn(`  Skip ${entry.summonerId}: ${e.message?.slice(0, 60)}`);
                    }
                }));

                await sleep(400);
                if (i % 30 === 0)
                    console.log(`  → ${i}/${challSyncState.total} joueurs | +${challSyncState.matchesAdded} matchs | ${challSyncState.errors} erreurs`);
            }

            challSyncState.progress = challSyncState.total;
            challSyncState.lastRun  = new Date().toISOString();
            console.log(`✅ Sync challengers terminé : ${challSyncState.playersUpserted} joueurs, +${challSyncState.matchesAdded} matchs`);
        } catch (e) {
            console.error('Sync challengers error:', e.message);
        } finally {
            challSyncState.running = false;
        }
    })();
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

// ─── RANK (rang d'un joueur spécifique, bypass RLS) ───────
app.get('/rank', async (req, res) => {
    try {
        const riotId = req.query.riotId;
        if (!riotId?.includes('#')) return res.status(400).json({ error: 'Format: Pseudo#TAG' });
        const [n, t] = riotId.split('#').map(s => s.trim());
        const { data, error } = await supabase
            .from('player_ranks')
            .select('*')
            .ilike('riot_id', `${n}#${t}`)
            .maybeSingle();
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || {});
    } catch (err) {
        console.error('Rank error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── STORED PLAYERS (liste des joueurs en base) ───────────
app.get('/stored-players', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('player_ranks')
            .select('riot_id, solo_tier, solo_rank, solo_lp, solo_wins, solo_losses, flex_tier, flex_rank, flex_lp, profile_icon_id, summoner_level, updated_at')
            .order('updated_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        res.json({ players: data || [] });
    } catch (err) {
        console.error('Stored players error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── CHALLENGER BUILDS (builds des challos pour un champ) ─
const challBuildsCache = {};  // { champ: { data, ts } }
const CHALL_CACHE_TTL = 3 * 60 * 60 * 1000; // 3h

app.get('/challenger-builds', async (req, res) => {
    try {
        const champ = req.query.champ;
        if (!champ) return res.status(400).json({ error: 'champ requis' });

        // Cache hit
        const cached = challBuildsCache[champ];
        if (cached && (Date.now() - cached.ts) < CHALL_CACHE_TTL) {
            console.log(`🗄️  Challenger builds cache hit: ${champ}`);
            return res.json(cached.data);
        }

        console.log(`🔍 Challenger builds fetch: ${champ}`);

        // 1. Récupérer la liste Challenger
        const { data: leagueData } = await getRiot(`${PLATFORM_HOST}/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5`);
        const topPlayers = (leagueData.entries || [])
            .sort((a, b) => b.leaguePoints - a.leaguePoints)
            .slice(0, 30);

        // 2. Résoudre les PUUIDs (par summonerId, par batch de 5)
        const puuids = [];
        for (let i = 0; i < topPlayers.length; i += 5) {
            const batch = topPlayers.slice(i, i + 5);
            const results = await Promise.all(batch.map(async p => {
                try {
                    const { data: sum } = await getRiot(`${PLATFORM_HOST}/lol/summoner/v4/summoners/${p.summonerId}`);
                    return { puuid: sum.puuid, summonerName: p.summonerName, lp: p.leaguePoints };
                } catch { return null; }
            }));
            puuids.push(...results.filter(Boolean));
            if (i + 5 < topPlayers.length) await sleep(200);
        }

        // 3. Pour chaque joueur, récupérer les derniers match IDs et chercher ce champion
        const builds = [];
        for (const player of puuids) {
            if (builds.length >= 20) break;
            try {
                const { data: matchIds } = await getRiot(
                    `${REGION_HOST}/lol/match/v5/matches/by-puuid/${player.puuid}/ids?start=0&count=20`
                );
                await sleep(100);
                for (const matchId of matchIds) {
                    if (builds.length >= 20) break;
                    try {
                        const { data: detail } = await getRiot(`${REGION_HOST}/lol/match/v5/matches/${matchId}`);
                        const ps = detail.info?.participants || [];
                        const p = ps.find(x => x.puuid === player.puuid && x.championName === champ);
                        if (!p) continue;

                        // Résoudre le Riot ID
                        let riotId = player.summonerName;
                        try {
                            const { data: acc } = await getRiot(`${REGION_HOST}/riot/account/v1/accounts/by-puuid/${player.puuid}`);
                            riotId = `${acc.gameName}#${acc.tagLine}`;
                        } catch { /* keep summonerName */ }

                        builds.push({
                            playerName: riotId.split('#')[0],
                            riotId,
                            lp: player.lp,
                            tier: 'CHALLENGER',
                            win: p.win,
                            kills: p.kills, deaths: p.deaths, assists: p.assists,
                            item0: p.item0, item1: p.item1, item2: p.item2,
                            item3: p.item3, item4: p.item4, item5: p.item5,
                            summoner1Id: p.summoner1Id, summoner2Id: p.summoner2Id,
                            gameDate: detail.info.gameEndTimestamp
                                ? new Date(detail.info.gameEndTimestamp).toLocaleDateString('fr-FR')
                                : '—',
                        });
                        await sleep(100);
                        break; // 1 game par joueur suffit
                    } catch { /* match skip */ }
                }
            } catch { /* player skip */ }
        }

        const result = { games: builds, fetchedAt: new Date().toISOString() };
        challBuildsCache[champ] = { data: result, ts: Date.now() };
        console.log(`   ✅ ${builds.length} builds challenger pour ${champ}`);
        res.json(result);
    } catch (err) {
        console.error('Challenger builds error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Serveur prêt → http://localhost:${PORT}`));
