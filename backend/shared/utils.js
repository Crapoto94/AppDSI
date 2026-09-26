const fs = require('fs');
const path = require('path');

/**
 * Log a message to the mouchard.log file and console.
 * Path is relative to the backend root.
 */
const logMouchard = (msg) => {
    const time = new Date().toISOString();
    const line = `[${time}] ${msg}\n`;
    try {
        const logDir = path.join(__dirname, '..', 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        const logPath = path.join(logDir, 'mouchard.log');
        fs.appendFileSync(logPath, line);
        console.log(line);
    } catch (err) {
        console.error('[UTILS] Error writing to mouchard:', err.message);
    }
};

/**
 * LDAP String decoder for special characters
 */
function decodeLDAPString(str) {
    if (!str) return str;
    if (Buffer.isBuffer(str)) return str.toString('utf8');
    if (typeof str !== 'string') return str;

    try {
        if (str.includes('\\')) {
            const bytes = [];
            for (let i = 0; i < str.length; i++) {
                if (str[i] === '\\' && i + 2 < str.length && /[0-9a-fA-F]{2}/.test(str.substring(i + 1, i + 3))) {
                    bytes.push(parseInt(str.substring(i + 1, i + 3), 16));
                    i += 2;
                } else {
                    bytes.push(str.charCodeAt(i));
                }
            }
            return Buffer.from(bytes).toString('utf8').normalize('NFC');
        }
        return str.normalize('NFC');
    } catch (e) {
        return str;
    }
}

/**
 * LDAP Entry flattener for ldapjs 3.x compatibility
 */
function flattenLDAPEntry(entry) {
    if (!entry) return null;
    const pojo = entry.pojo;
    if (!pojo) return entry.object || entry;

    let rawDn = pojo.objectName || '';
    try {
        if (rawDn && typeof rawDn === 'string' && rawDn.includes('\\')) {
            rawDn = decodeLDAPString(rawDn);
        }
    } catch(e) {}

    const obj = { dn: rawDn };
    if (pojo.attributes && Array.isArray(pojo.attributes)) {
        pojo.attributes.forEach(attr => {
            let val = attr.values.length === 1 ? attr.values[0] : attr.values;
            if (['cn', 'displayName', 'memberOf', 'mail', 'title', 'department', 'sAMAccountName'].includes(attr.type)) {
                if (Array.isArray(val)) {
                    val = val.map(v => decodeLDAPString(v));
                } else {
                    val = decodeLDAPString(val);
                }
            }
            obj[attr.type] = val;
        });
    }
    return obj;
}

/**
 * Convert Excel numeric date to ISO string (YYYY-MM-DD)
 */
function excelDateToISO(excelDate) {
    if (!excelDate) return null;
    // Excel base date is 1899-12-30
    const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
    return date.toISOString().split('T')[0];
}

/**
 * Basic email normalization
 */
function normalizeEmail(email) {
    if (!email) return '';
    return email.trim().toLowerCase();
}

/**
 * Helper to extract a clean date from an Oracle string
 */
function parseOracleDate(val) {
    if (val === null || val === undefined) return null;
    const s = String(val).trim();
    if (!s) return null;

    // ISO format YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);

    // French format DD/MM/YYYY
    const frMatch = s.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
    if (frMatch) {
        const d = frMatch[1].padStart(2, '0');
        const m = frMatch[2].padStart(2, '0');
        const y = frMatch[3];
        return `${y}-${m}-${d}`;
    }

    // Native JS Date
    try {
        const cleanS = s.replace(/\s*\(.*\)$/, '');
        const d = new Date(cleanS);
        if (!isNaN(d.getTime())) {
            return d.toISOString().split('T')[0];
        }
    } catch (e) {}

    return s;
}

/**
 * Levenshtein distance calculation
 */
function getLevenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
            else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
        }
    }
    return matrix[b.length][a.length];
}

/**
 * Calculate match score for AD/RH association
 */
function calculateMatchScore(rhNom, rhPrenom, adDisplay) {
    if (!rhNom || !adDisplay) return 0;
    
    // Normalise LDAP display for UTF-8 encodings
    const normalizedAD = adDisplay.replace(/\\([0-9a-fA-F]{2})/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
    const s1 = (rhNom + ' ' + (rhPrenom || '')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "");
    const s2 = normalizedAD.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "");
    
    const dist = getLevenshteinDistance(s1, s2);
    const maxLen = Math.max(s1.length, s2.length);
    return maxLen === 0 ? 100 : Math.round((1 - dist / maxLen) * 100);
}

/**
 * Renvoie un timestamp "YYYY-MM-DD HH:mm:ss" en HEURE DE PARIS (sans fuseau).
 *
 * Contexte : les tickets historiques importés de GLPI (~40 000) sont stockés en heure
 * locale de Paris dans des colonnes `timestamp` SANS fuseau, et le serveur (Europe/Paris)
 * relit ces colonnes en heure locale → ils s'affichent correctement. Les écritures
 * « hub » (app + collecteur mail) doivent donc utiliser la MÊME convention (heure de Paris)
 * et non `toISOString()` (UTC), sinon elles apparaissent 2h trop tôt.
 *
 * @param {Date|string|number} [d] - date source (défaut : maintenant)
 * @returns {string|null} ex. "2026-05-31 21:53:09"
 */
function toParisSql(d = new Date()) {
    const dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return null;
    // 'sv-SE' produit déjà le format "YYYY-MM-DD HH:mm:ss"
    return new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Paris',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(dt);
}

/**
 * Convertit une chaîne "naïve" (ex. valeur brute d'un <input type="datetime-local">,
 * "YYYY-MM-DDTHH:mm") représentant une heure de PARIS, en horodatage UTC exact
 * (ISO 8601 avec "Z"), SANS dépendre du fuseau horaire du process Node ni du tzdata
 * de l'OS (contrairement à `new Date(naive).toISOString()`).
 *
 * Contexte (bug corrigé) : le module Maintenances (magapp) convertissait les dates
 * saisies avec `new Date(start_date).toISOString()`, en supposant que le process
 * backend interprète bien les chaînes naïves comme de l'heure de Paris (variable
 * d'env TZ=Europe/Paris). En production, ça ne s'est pas vérifié — une maintenance
 * saisie 18h-20h (Paris) a été stockée comme 08h-10h UTC (soit ~10h d'écart, pas les
 * 2h attendus), preuve que le fuseau du conteneur n'était pas fiable pour cet usage.
 * Cette fonction utilise Intl.DateTimeFormat (ICU embarqué à Node, indépendant de
 * l'OS) pour calculer le bon décalage Paris↔UTC à cette date précise (2h l'été/CEST,
 * 1h l'hiver/CET), exactement comme toParisSql() ci-dessus le fait déjà pour l'écriture
 * des tickets — donc un mécanisme déjà éprouvé dans ce code, appliqué ici en sens inverse.
 *
 * @param {string} naiveLocal - ex. "2026-09-15T18:00" (heure de Paris, sans fuseau)
 * @returns {string|null} ex. "2026-09-15T16:00:00.000Z"
 */
function parisLocalToUtcISO(naiveLocal) {
    if (!naiveLocal) return null;
    // 1) Interprète (à tort, volontairement) la chaîne naïve comme si elle était déjà
    //    en UTC : ça donne un instant de référence quelconque, pas encore le bon.
    const asIfUtc = new Date(naiveLocal.length <= 16 ? naiveLocal + ':00Z' : naiveLocal + 'Z');
    if (isNaN(asIfUtc.getTime())) return null;
    // 2) Demande à Intl (ICU, fiable indépendamment de l'OS) quelle heure ça ferait à
    //    Paris pour CET instant de référence.
    const parisWallClock = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Paris',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(asIfUtc).replace(' ', 'T') + 'Z';
    // 3) L'écart entre l'instant de référence et cette même heure d'horloge réinterprétée
    //    comme UTC est exactement le décalage Paris/UTC (2h l'été, 1h l'hiver) — stable
    //    sur une journée (hors instant précis du changement d'heure).
    const offsetMs = asIfUtc.getTime() - new Date(parisWallClock).getTime();
    return new Date(asIfUtc.getTime() + offsetMs).toISOString();
}

module.exports = {
    logMouchard,
    decodeLDAPString,
    flattenLDAPEntry,
    excelDateToISO,
    normalizeEmail,
    parseOracleDate,
    getLevenshteinDistance,
    calculateMatchScore,
    parseLDAPDate,
    formatDateToFrench,
    toParisSql,
    parisLocalToUtcISO
};

/**
 * LDAP filetime parser
 */
function parseLDAPDate(val) {
    if (!val) return null;
    try {
        const timestamp = parseInt(val);
        if (timestamp <= 0 || isNaN(timestamp)) return null;
        // LDAP filetime is 100-nanoseconds intervals since Jan 1, 1601
        return new Date((timestamp / 10000) - 11644473600000);
    } catch (e) {
        return null;
    }
}

/**
 * Format ISO date string to French display format
 */
function formatDateToFrench(dateString) {
    if (!dateString) return null;
    try {
        let isoString = typeof dateString === 'string' ? dateString.replace('Z', '') : dateString.toString();
        const date = new Date(isoString + 'Z');

        const formatter = new Intl.DateTimeFormat('fr-FR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Paris'
        });

        return formatter.format(date);
    } catch (e) {
        console.error('Error formatting date:', e.message);
        return dateString;
    }
}
