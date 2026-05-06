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
    formatDateToFrench
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
