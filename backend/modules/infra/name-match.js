/**
 * Petits utilitaires de comparaison de noms — tolérance aux fautes de frappe
 * quand on rapproche un nom saisi (import Excel externe) d'un nom renvoyé
 * par RH Studio (ex. "Mark CHEVALIER" saisi -> "Marc CHEVALIER" chez RH Studio).
 */

function normalizeName(s) {
    return (s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // accents
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
}

/** Distance de Levenshtein classique (programmation dynamique, 2 lignes). */
function levenshtein(a, b) {
    if (a === b) return 0;
    const la = a.length, lb = b.length;
    if (la === 0) return lb;
    if (lb === 0) return la;
    let prev = new Array(lb + 1);
    let curr = new Array(lb + 1);
    for (let j = 0; j <= lb; j++) prev[j] = j;
    for (let i = 1; i <= la; i++) {
        curr[0] = i;
        for (let j = 1; j <= lb; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[lb];
}

/** Similarité normalisée entre 0 (rien en commun) et 1 (identique), après normalisation des noms. */
function nameSimilarity(a, b) {
    const na = normalizeName(a);
    const nb = normalizeName(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    const dist = levenshtein(na, nb);
    const maxLen = Math.max(na.length, nb.length);
    return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

module.exports = { normalizeName, levenshtein, nameSimilarity };
