/**
 * Dates et périodes dites en français (« hier », « la semaine dernière », « en novembre », « depuis le 12/10 »).
 * Calculées ici, à partir de la date du serveur : le modèle n'a pas à les deviner.
 */
const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const jour = (base, delta = 0) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + delta);
const fr = (s) => s.split('-').reverse().join('/');
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[’']/g, ' ').replace(/-/g, ' ');

/** « 12/10 », « 12/10/2025 », « 3 novembre » → date (année en cours à défaut, la précédente si la date serait future). */
function uneDate(d, m, y, today) {
    const month = /^\d+$/.test(m) ? Number(m) - 1 : MOIS.indexOf(m);
    if (month < 0 || month > 11 || Number(d) < 1 || Number(d) > 31) return null;
    let year = y ? Number(y.length === 2 ? `20${y}` : y) : today.getFullYear();
    let date = new Date(year, month, Number(d));
    if (date.getMonth() !== month) return null;
    if (!y && date > today) date = new Date(year - 1, month, Number(d));
    return date;
}

const DATE = `(\\d{1,2})(?:er)?(?:\\/| (?=(?:${MOIS.join('|')})))(\\d{1,2}|${MOIS.join('|')})(?:(?:\\/| )(\\d{4}|\\d{2}(?=\\D|$)))?`;

/** @returns {{ de: string, a: string, texte: string, mot: string } | null} bornes incluses ; « mot » = ce qui a été reconnu */
function periode(question, today = new Date()) {
    const q = ` ${norm(question)} `;
    const t = jour(today);
    const lundi = jour(t, -((t.getDay() + 6) % 7));
    const result = (de, a, mot) => ({ de: iso(de), a: iso(a), mot: mot.trim(), texte: iso(de) === iso(a) ? `le ${fr(iso(de))}` : `du ${fr(iso(de))} au ${fr(iso(a))}` });
    let m;

    if ((m = q.match(new RegExp(`\\b(?:du|entre le) ${DATE} (?:au|et le) ${DATE}`)))) {
        const a = uneDate(m[4], m[5], m[6], t);
        const de = uneDate(m[1], m[2], m[3] || m[6], t);
        if (de && a) return result(de, a, m[0]);
    }
    if ((m = q.match(new RegExp(`\\bdepuis (?:le )?${DATE}`)))) {
        const de = uneDate(m[1], m[2], m[3], t);
        if (de) return result(de, t, m[0]);
    }
    if ((m = q.match(new RegExp(`\\b(?:le|du|au) ${DATE}`))) || (m = q.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/))) {
        const d = uneDate(m[1], m[2], m[3], t);
        if (d) return result(d, d, m[0]);
    }
    if ((m = q.match(/\bavant hier\b/))) return result(jour(t, -2), jour(t, -2), m[0]);
    if ((m = q.match(/\bhier\b/))) return result(jour(t, -1), jour(t, -1), m[0]);
    if ((m = q.match(/\baujourd ?hui\b|\bce jour\b/))) return result(t, t, m[0]);
    if ((m = q.match(/\b(?:la )?semaine (?:derniere|passee|precedente)\b/))) return result(jour(lundi, -7), jour(lundi, -1), m[0]);
    if ((m = q.match(/\bcette semaine\b|\bsemaine en cours\b/))) return result(lundi, t, m[0]);
    if ((m = q.match(/\b(?:le )?mois (?:dernier|passe|precedent)\b/))) return result(new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0), m[0]);
    if ((m = q.match(/\bce mois(?: ci)?\b|\bmois en cours\b/))) return result(new Date(t.getFullYear(), t.getMonth(), 1), t, m[0]);
    if ((m = q.match(/\b(\d{1,3}) derniers jours\b/))) return result(jour(t, -(Number(m[1]) - 1)), t, m[0]);
    // Un nom de mois suffit, quels que soient les petits mots autour (« en août », « au mois d'août », « août 2025 »)
    if ((m = q.match(new RegExp(`\\b(depuis )?(?:(?:en|au|aux|du|de|d|le|pour|sur|mois|courant) )*(${MOIS.join('|')})(?: (20\\d\\d))?\\b`)))) {
        const month = MOIS.indexOf(m[2]);
        let year = m[3] ? Number(m[3]) : t.getFullYear();
        if (!m[3] && month > t.getMonth()) year -= 1;
        const de = new Date(year, month, 1);
        return result(de, m[1] ? t : new Date(year, month + 1, 0), m[0]);
    }
    return null;
}

module.exports = { periode };
