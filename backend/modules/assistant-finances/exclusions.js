/**
 * « hors DSI », « sauf la communication et la voirie », « autres que UGAP » : ce qui est nommé APRÈS ces mots est à
 * exclure, pas à filtrer. Seul ce qui suit immédiatement (articles et « et / ni » compris) est concerné :
 * « factures sans service fait de la DSI » n'exclut pas la DSI.
 */
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();

const MARQUE = /\b(?:hors|sauf|excepte[es]?|a l exception d(?:e|u|es)?|en dehors d(?:e|u|es)?|autres? que|exclu(?:ant|s|e|es)?|sans|pas)\b/g;
const LIAISON = /^(?:(?:de|d|du|des|la|le|les|l|pour|chez|celle|celles|ceux|direction|service|fournisseur|tiers)\b\s*)*/;

/** @returns {Set<string>} parmi « mots », ceux que la question demande d'exclure */
function exclus(question, mots) {
    const text = norm(question);
    // les plus longs d'abord, pour ne pas couper un nom composé
    const candidates = mots.map(m => ({ mot: m, cle: norm(m) })).filter(c => c.cle).sort((a, b) => b.cle.length - a.cle.length);
    const out = new Set();
    for (const marque of text.matchAll(MARQUE)) {
        let rest = text.slice(marque.index + marque[0].length).trim();
        for (;;) {
            rest = rest.replace(LIAISON, '');
            const found = candidates.find(c => rest === c.cle || rest.startsWith(`${c.cle} `));
            if (!found) break;
            out.add(found.mot);
            rest = rest.slice(found.cle.length).trim();
            if (!/^(?:et|ni|ou)\b/.test(rest)) break;
            rest = rest.replace(/^(?:et|ni|ou)\b\s*/, '');
        }
    }
    return out;
}

module.exports = { exclus };
