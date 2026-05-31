/**
 * Lookup gratuit de caractéristiques produit par code EAN/UPC.
 *
 * Source : UPCitemdb endpoint "trial" (gratuit, sans clé API, ~100 req/jour).
 *   https://api.upcitemdb.com/prod/trial/lookup?upc=<code>
 *
 * Stratégie :
 *   1) Si un article du catalogue possède déjà cet EAN → on renvoie ses données.
 *   2) Cache mémoire (évite de brûler le quota).
 *   3) Appel UPCitemdb avec timeout court ; en cas d'échec/quota → fallback vide.
 *      L'UI bascule alors en saisie manuelle.
 */
const repo = require('../repositories/stock.repository');

const CACHE = new Map();           // ean -> { result, ts }
const CACHE_TTL_MS = 24 * 3600 * 1000;
const TIMEOUT_MS = 4000;
const TRIAL_URL = 'https://api.upcitemdb.com/prod/trial/lookup';

// Extraction best-effort de specs IT depuis un titre produit
function parseSpecsFromTitle(title = '') {
    const specs = {};
    const t = String(title);
    const ram = t.match(/(\d{1,3})\s?(?:GB|Go)\s?(?:RAM|DDR\d?)/i) || t.match(/(\d{1,3})\s?(?:GB|Go)\b/i);
    if (ram) specs.ram = `${ram[1]} Go`;
    const cpu = t.match(/(i[3579]-?\d{3,5}[A-Z]*|Ryzen\s?\d\s?\d{3,4}[A-Z]*|M[123]\s?(?:Pro|Max|Ultra)?|Celeron|Pentium|Xeon)/i);
    if (cpu) specs.cpu = cpu[0];
    const ssd = t.match(/(\d+)\s?(?:GB|Go|TB|To)\s?(?:SSD|NVMe|HDD|eMMC)/i);
    if (ssd) specs.storage = ssd[0];
    const screen = t.match(/(\d{2}(?:[.,]\d)?)["”]\s?/);
    if (screen) specs.screen = `${screen[1]}"`;
    return specs;
}

async function fetchUpcItemDb(ean) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(`${TRIAL_URL}?upc=${encodeURIComponent(ean)}`, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
        });
        if (!res.ok) return null;
        const data = await res.json();
        const item = data?.items?.[0];
        if (!item) return null;
        return {
            label: item.title || '',
            brand: item.brand || '',
            model: item.model || '',
            category: item.category || '',
            ean,
            specs: parseSpecsFromTitle(item.title),
            source: 'upcitemdb',
        };
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * @param {string} ean
 * @returns {Promise<{found:boolean, source:string, label?, brand?, model?, category?, ean?, specs?, item_id?}>}
 */
async function lookupByEan(ean) {
    const code = String(ean || '').trim();
    if (!code) return { found: false, source: 'none' };

    // 1) Article déjà au catalogue
    try {
        const existing = await repo.getItemByEan(code);
        if (existing) {
            return {
                found: true, source: 'catalog', item_id: existing.id,
                label: existing.label, brand: existing.brand, model: existing.model,
                category: existing.category, ean: code,
                specs: existing.specs || {},
            };
        }
    } catch { /* ignore */ }

    // 2) Cache mémoire
    const cached = CACHE.get(code);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return cached.result;
    }

    // 3) UPCitemdb (gratuit)
    const remote = await fetchUpcItemDb(code);
    const result = remote
        ? { found: true, ...remote }
        : { found: false, source: 'manual', ean: code };
    CACHE.set(code, { result, ts: Date.now() });
    return result;
}

module.exports = { lookupByEan, parseSpecsFromTitle };
