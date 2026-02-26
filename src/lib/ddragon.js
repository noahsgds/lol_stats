import { D_VER } from './utils.js';

let _champMap = null;

/**
 * Returns a map of championId (number) → DDragon key (string, e.g. "Zed")
 * Cached after first load.
 */
export async function getChampIdMap() {
    if (_champMap) return _champMap;
    const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${D_VER}/data/en_US/champion.json`);
    const json = await res.json();
    const map = {};
    Object.values(json.data).forEach(c => {
        map[parseInt(c.key)] = c.id; // e.g. { 157: "Zed" }
    });
    _champMap = map;
    return _champMap;
}

export function champIconUrl(champKey) {
    return `https://ddragon.leagueoflegends.com/cdn/${D_VER}/img/champion/${champKey}.png`;
}

export function getQueueLabel(queueId) {
    const m = {
        420: 'Classé Solo/Duo', 440: 'Classé Flex', 450: 'ARAM',
        400: 'Normal (Draft)', 430: 'Normal (Blind)', 490: 'Quickplay',
        700: 'Clash', 900: 'URF', 1700: 'Arena', 0: 'Personnalisée',
    };
    return m[queueId] || `File ${queueId}`;
}
