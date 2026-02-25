// server.js - V10 FIXED
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors({
    origin: [/https:\/\/.*\.github\.io$/, /http:\/\/localhost(:\d+)?$/]
}));

// Variables d'environnement (à configurer dans le dashboard Render)
// ⚠️ RIOT_API_KEY : https://developer.riotgames.com (valide 24h seulement)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const RIOT_API_KEY = process.env.RIOT_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const REGION_HOST = 'https://europe.api.riotgames.com';
const PLATFORM_HOST = 'https://euw1.api.riotgames.com';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// FIX 1 : Retry auto sur 429 + message clair sur 403
const getRiot = async (url, retries = 3) => {
    const finalUrl = `${url}${url.includes('?') ? '&' : '?'}api_key=${RIOT_API_KEY}`;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            return await axios.get(finalUrl);
        } catch (err) {
            if (err.response?.status === 429) {
                const wait = (parseInt(err.response.headers['retry-after']) || 12) * 1000;
                console.warn(`\n   ⚠️ RATE LIMIT — pause ${wait / 1000}s...`);
                await sleep(wait);
            } else if (err.response?.status === 403) {
                console.error('\n   🔑 CLÉ RIOT EXPIRÉE → https://developer.riotgames.com');
                throw err;
            } else if (attempt === retries - 1) {
                throw err;
            } else {
                await sleep(2000);
            }
        }
    }
};

app.get('/import', async (req, res) => {
    // FIX 2 : Réponse immédiate, import en arrière-plan
    res.json({ success: true, message: 'Import lancé en arrière-plan' });

    try {
        const riotIdRaw = req.query.riotId;
        if (!riotIdRaw?.includes('#')) return console.error('Format: Pseudo#TAG');

        const [gameName, tagLine] = riotIdRaw.split('#').map(s => s.trim());
        const fullRiotId = `${gameName}#${tagLine}`;
        console.log(`\n📥 IMPORT : ${fullRiotId}`);

        // 1. PUUID
        const { data: acc } = await getRiot(
            `${REGION_HOST}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
        );
        const { puuid } = acc;

        // 2. RANGS
        try {
            const { data: sum } = await getRiot(`${PLATFORM_HOST}/lol/summoner/v4/summoners/by-puuid/${puuid}`);
            const { data: leagues } = await getRiot(`${PLATFORM_HOST}/lol/league/v4/entries/by-summoner/${sum.id}`);

            let rankData = {
                puuid, riot_id: fullRiotId, summoner_id: sum.id,
                profile_icon_id: sum.profileIconId, summoner_level: sum.summonerLevel,
                updated_at: new Date().toISOString()
            };
            leagues.forEach(e => {
                if (e.queueType === 'RANKED_SOLO_5x5') {
                    rankData = { ...rankData, solo_tier: e.tier, solo_rank: e.rank, solo_lp: e.leaguePoints, solo_wins: e.wins, solo_losses: e.losses };
                }
                if (e.queueType === 'RANKED_FLEX_SR') {
                    rankData = { ...rankData, flex_tier: e.tier, flex_rank: e.rank, flex_lp: e.leaguePoints };
                }
            });
            const { error: rErr } = await supabase.from('player_ranks').upsert(rankData, { onConflict: 'puuid' });
            if (rErr) console.warn('   ⚠️ Rank upsert:', rErr.message);
            else console.log('   ✅ Rangs mis à jour');
        } catch (e) { console.warn('   ⚠️ Rangs ignorés:', e.message); }

        // 3. MATCHS
        const { data: matchIds } = await getRiot(
            `${REGION_HOST}/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=50`
        );

        let added = 0, skipped = 0, errors = 0;
        console.log(`   📋 ${matchIds.length} matchs à vérifier...`);

        for (const [i, matchId] of matchIds.entries()) {
            const { data: exist } = await supabase
                .from('bronze_matches').select('match_id').eq('match_id', matchId).maybeSingle();

            if (exist) { skipped++; continue; }

            try {
                process.stdout.write(`   ⏳ [${i + 1}/${matchIds.length}] ${matchId}\r`);
                const { data: detail } = await getRiot(`${REGION_HOST}/lol/match/v5/matches/${matchId}`);

                const { error: insErr } = await supabase
                    .from('bronze_matches')
                    .insert({ match_id: matchId, match_data: detail });

                if (insErr?.code === '23505') skipped++;
                else if (insErr) throw insErr;
                else added++;

                // FIX 3 : 1500ms au lieu de 1200ms
                await sleep(1500);
            } catch (e) {
                errors++;
                console.error(`\n   ❌ ${matchId}: ${e.message}`);
            }
        }
        console.log(`\n✅ Terminé ! +${added} ajoutés | ${skipped} déjà présents | ${errors} erreurs`);

    } catch (err) {
        console.error('\n🔥 ERREUR FATALE:', err.message);
    }
});

app.get('/ping', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Serveur prêt → http://localhost:${PORT}`));
