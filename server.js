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

        // 3. Batch check DB + rank upsert en parallèle
        const [existingRes] = await Promise.all([
            supabase.from('bronze_matches').select('match_id').in('match_id', matchIds),
            // Rank upsert fire-and-forget
            (async () => {
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
                            rankData = { ...rankData, flex_tier: e.tier, flex_rank: e.rank, flex_lp: e.leaguePoints };
                    });
                    await supabase.from('player_ranks').upsert(rankData, { onConflict: 'puuid' });
                } catch (e) { console.warn('Rangs ignorés:', e.message); }
            })(),
        ]);

        // 4. Fetch tous les nouveaux matchs en parallèle (2000 req/10s → pas de sleep nécessaire)
        const existingSet = new Set((existingRes.data || []).map(r => r.match_id));
        const newMatchIds = matchIds.filter(id => !existingSet.has(id));
        console.log(`   📋 ${newMatchIds.length} nouveau(x) sur ${matchIds.length}`);

        let added = 0;
        if (newMatchIds.length > 0) {
            const results = await Promise.all(
                newMatchIds.map(async matchId => {
                    try {
                        const { data: detail } = await getRiot(`${REGION_HOST}/lol/match/v5/matches/${matchId}`);
                        const { error: insErr } = await supabase.from('bronze_matches')
                            .insert({ match_id: matchId, match_data: detail });
                        return !insErr || insErr?.code === '23505';
                    } catch (e) {
                        console.error(`❌ ${matchId}:`, e.message);
                        return false;
                    }
                })
            );
            added = results.filter(Boolean).length;
        }

        console.log(`   ✅ +${added} nouveaux | ${existingSet.size} déjà en base`);
        res.set('Cache-Control', 'no-store');
        res.json({ ok: true, added, skipped: existingSet.size });

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

        let rankData = {
            puuid, riot_id: fullRiotId, summoner_id: sum.id,
            profile_icon_id: sum.profileIconId, summoner_level: sum.summonerLevel,
            updated_at: new Date().toISOString()
        };
        (leaguesRes.data || []).forEach(e => {
            if (e.queueType === 'RANKED_SOLO_5x5')
                rankData = { ...rankData, solo_tier: e.tier, solo_rank: e.rank, solo_lp: e.leaguePoints, solo_wins: e.wins, solo_losses: e.losses };
            if (e.queueType === 'RANKED_FLEX_SR')
                rankData = { ...rankData, flex_tier: e.tier, flex_rank: e.rank, flex_lp: e.leaguePoints };
        });
        await supabase.from('player_ranks').upsert(rankData, { onConflict: 'puuid' });

        // Batch check existants
        const { data: existingRows } = await supabase.from('bronze_matches').select('match_id').in('match_id', matchIds);
        const existingSet = new Set((existingRows || []).map(r => r.match_id));
        const newMatchIds = matchIds.filter(id => !existingSet.has(id));
        console.log(`   📋 ${newMatchIds.length} nouveaux sur ${matchIds.length}`);

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

// ─── LIVE GAME (PUUID direct, pas de summoner lookup) ─────
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
            // spectator-v5 accepte le PUUID directement
            const { data: live } = await getRiot(`${PLATFORM_HOST}/lol/spectator/v5/active-games/by-summoner/${puuid}`);
            res.json({ inGame: true, ...live });
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
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Serveur prêt → http://localhost:${PORT}`));
