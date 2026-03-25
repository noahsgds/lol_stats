import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hdxhjybmstpjhnahoots.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkeGhqeWJtc3RwamhuYWhvb3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MDg4NTYsImV4cCI6MjA4NTA4NDg1Nn0.XKMTeQHWltyk27K2hH7FiE5DKtKZbNI8Lo5sHT8S7Ls';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// Compute global stats + history from raw match rows + puuid (client-side aggregation)
function computeFromMatches(rows, puuid, queueFilter) {
    // Sort newest first
    rows.sort((a, b) => {
        const nA = parseInt(a.match_id?.split('_')[1] || '0');
        const nB = parseInt(b.match_id?.split('_')[1] || '0');
        return nB - nA;
    });

    const entries = [];
    for (const row of rows) {
        const info = row.match_data?.info;
        if (!info) continue;
        if (queueFilter && String(info.queueId) !== String(queueFilter)) continue;
        const p = (info.participants || []).find(x => x.puuid === puuid);
        if (!p) continue;
        entries.push({ matchId: row.match_id, info, p });
    }
    if (!entries.length) return { global: {}, history: [] };

    const g = entries.length;
    const wins = entries.filter(e => e.p.win).length;
    const totalK = entries.reduce((a, e) => a + (e.p.kills || 0), 0);
    const totalD = entries.reduce((a, e) => a + (e.p.deaths || 0), 0);
    const totalA = entries.reduce((a, e) => a + (e.p.assists || 0), 0);

    const global = {
        total_games:      g,
        win_rate:         parseFloat((wins / g * 100).toFixed(1)),
        kda:              parseFloat(((totalK + totalA) / Math.max(totalD, 1)).toFixed(2)),
        avg_kills:        parseFloat((totalK / g).toFixed(1)),
        avg_deaths:       parseFloat((totalD / g).toFixed(1)),
        avg_assists:      parseFloat((totalA / g).toFixed(1)),
        avg_damage:       Math.round(entries.reduce((a, e) => a + (e.p.totalDamageDealtToChampions || 0), 0) / g),
        avg_damage_taken: Math.round(entries.reduce((a, e) => a + (e.p.totalDamageTaken || 0), 0) / g),
        avg_gold:         Math.round(entries.reduce((a, e) => a + (e.p.goldEarned || 0), 0) / g),
        avg_cs:           parseFloat((entries.reduce((a, e) => a + (e.p.totalMinionsKilled || 0) + (e.p.neutralMinionsKilled || 0), 0) / g).toFixed(1)),
        avg_vision:       parseFloat((entries.reduce((a, e) => a + (e.p.visionScore || 0), 0) / g).toFixed(1)),
    };

    const history = entries.map(({ matchId, info, p }) => ({
        match_id:           matchId,
        champion_name:      p.championName,
        champ_level:        p.champLevel || 0,
        queue_id:           info.queueId || 0,
        game_mode:          info.gameMode || '',
        win:                p.win,
        kills:              p.kills || 0,
        deaths:             p.deaths || 0,
        assists:            p.assists || 0,
        kda:                parseFloat(((p.kills + p.assists) / Math.max(p.deaths, 1)).toFixed(2)),
        cs:                 (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0),
        gold_earned:        p.goldEarned || 0,
        total_damage:       p.totalDamageDealtToChampions || 0,
        total_damage_taken: p.totalDamageTaken || 0,
        vision_score:       p.visionScore || 0,
        game_duration:      info.gameDuration || 0,
        game_end_timestamp: info.gameEndTimestamp || null,
        item0: p.item0 || 0, item1: p.item1 || 0, item2: p.item2 || 0,
        item3: p.item3 || 0, item4: p.item4 || 0, item5: p.item5 || 0,
        item6: p.item6 || 0,
    }));

    return { global, history };
}

export async function fetchAll(tag, q) {
    const [n, t] = tag.split('#').map(s => s.trim());

    // Always fetch rank (works with anon key)
    const { data: rank } = await sb.from('player_ranks').select('*').ilike('riot_id', `${n}#${t}`).maybeSingle();

    // Try RPCs first (fast path — works if SECURITY DEFINER)
    const [gReq, hReq] = await Promise.all([
        sb.rpc('get_filtered_global_stats', { target_name: n, target_tag: t, filter_queue: q }),
        sb.rpc('get_filtered_match_history', { target_name: n, target_tag: t, filter_queue: q }),
    ]);

    const rpcGlobal  = gReq.data?.[0] || null;
    const rpcHistory = hReq.data?.length ? hReq.data : null;

    if (rpcGlobal && rpcHistory) {
        return { rank: rank || {}, global: rpcGlobal, history: rpcHistory };
    }

    if (gReq.error) console.warn('Stats RPC blocked, falling back to direct query:', gReq.error.message);
    if (hReq.error) console.warn('History RPC blocked, falling back to direct query:', hReq.error.message);

    // Fallback: read match IDs from rank_history, then query bronze_matches directly
    const puuid = rank?.puuid;
    if (!puuid) return { rank: rank || {}, global: {}, history: [] };

    const allMatchIds = [...new Set(
        (rank?.rank_history || []).slice().reverse().flatMap(h => h.match_ids || [])
    )].slice(0, 50);

    if (!allMatchIds.length) return { rank: rank || {}, global: {}, history: [] };

    const { data: rows, error: matchErr } = await sb
        .from('bronze_matches')
        .select('match_id, match_data')
        .in('match_id', allMatchIds);

    if (matchErr) {
        console.warn('bronze_matches direct query blocked by RLS:', matchErr.message);
        return { rank: rank || {}, global: {}, history: [] };
    }

    const { global, history } = computeFromMatches(rows || [], puuid, q);
    return { rank: rank || {}, global, history };
}
