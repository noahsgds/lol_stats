export const D_VER = '16.4.1';
export const API_BASE = 'https://lol-stats-svlz.onrender.com';

export const fmt     = n => (n || 0).toLocaleString('fr-FR');
export const fmtK    = n => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n || 0));
export const toFixed = (n, d = 1) => Number(n || 0).toFixed(d);
export const toWR    = v => { const n = parseFloat(v) || 0; return (n > 1 ? n : n * 100).toFixed(1); };

export function timeAgo(val) {
    if (!val) return '-';
    const d = new Date(typeof val === 'number' ? val : val);
    if (isNaN(d)) return '-';
    const s = Math.floor((Date.now() - d) / 1000);
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    return Math.floor(s / 86400) + 'j';
}

export function getChampKey(name) {
    if (!name) return 'Lux';
    let c = name.replace(/'/g, '').replace(/\./g, '').replace(/\s+/g, '').replace(/&/g, '');
    const sp = {
        Wukong: 'MonkeyKing', NunuWillump: 'Nunu', RenataGlasc: 'Renata',
        BelVeth: 'Belveth', ChoGath: 'Chogath', KaiSa: 'Kaisa',
        KhaZix: 'Khazix', LeBlanc: 'Leblanc', VelKoz: 'Velkoz'
    };
    return sp[c] || c;
}

export function getQ(qid) {
    const m = {
        420: 'Solo/Duo', 440: 'Flex', 450: 'ARAM',
        400: 'Normal', 430: 'Normal', 490: 'Quickplay',
        700: 'Clash', 900: 'URF', 1900: 'URF',
        1700: 'Arena', 830: 'Co-op IA', 840: 'Co-op IA', 850: 'Co-op IA', 0: 'Custom'
    };
    return m[qid] || `Q${qid || '?'}`;
}

export function computeChampStats(history) {
    const map = {};
    (history || []).forEach(m => {
        const key = m.champion_name || 'Unknown';
        const s = map[key] = map[key] || { games: 0, wins: 0, k: 0, d: 0, a: 0, dmg: 0, cs: 0, dur: 0 };
        s.games++; if (m.win) s.wins++;
        s.k += (m.kills || 0); s.d += (m.deaths || 0); s.a += (m.assists || 0);
        s.dmg += (m.total_damage || 0); s.cs += (m.cs || 0); s.dur += (m.game_duration || 0);
    });
    return Object.entries(map)
        .map(([name, s]) => {
            const avgDurMin = (s.dur / s.games / 60) || 1;
            return {
                name, games: s.games,
                wr: Math.round(s.wins / s.games * 100),
                kda: ((s.k + s.a) / Math.max(s.d, 1)).toFixed(2),
                avgDmg: Math.round(s.dmg / s.games),
                avgCs: Math.round(s.cs / s.games),
                avgCsMin: (s.cs / s.games / avgDurMin).toFixed(1),
                avgK: (s.k / s.games).toFixed(1),
                avgD: (s.d / s.games).toFixed(1),
                avgA: (s.a / s.games).toFixed(1),
            };
        })
        .sort((a, b) => b.games - a.games)
        .slice(0, 10);
}
