import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hdxhjybmstpjhnahoots.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkeGhqeWJtc3RwamhuYWhvb3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MDg4NTYsImV4cCI6MjA4NTA4NDg1Nn0.XKMTeQHWltyk27K2hH7FiE5DKtKZbNI8Lo5sHT8S7Ls';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function fetchAll(tag, q) {
    const [n, t] = tag.split('#').map(s => s.trim());
    const { data: rank } = await sb.from('player_ranks').select('*').ilike('riot_id', `${n}#${t}`).maybeSingle();
    const gReq = await sb.rpc('get_filtered_global_stats', { target_name: n, target_tag: t, filter_queue: q });
    const hReq = await sb.rpc('get_filtered_match_history', { target_name: n, target_tag: t, filter_queue: q });
    if (gReq.error) console.error('Stats:', gReq.error);
    if (hReq.error) console.error('History:', hReq.error);
    return { rank: rank || {}, global: gReq.data?.[0] || {}, history: hReq.data || [] };
}
