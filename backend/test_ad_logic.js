const assert = require('assert');

// Mocking the functions from server.js for testing
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

// --- Test Cases ---

console.log('Running AD Logic Tests...');

// 1. Test decodeLDAPString with accented characters (UTF-8 escape)
const encodedName = 'Equipe Entrep\\c3\\a8t'; // 'Equipe Entrepôt' (using è for variation)
const decodedName = decodeLDAPString(encodedName);
console.log(`- Decoding: ${encodedName} -> ${decodedName}`);
assert.strictEqual(decodedName, 'Equipe Entrepèt'.normalize('NFC'));

// 2. Test flattenLDAPEntry with nested attributes
const mockEntry = {
    pojo: {
        objectName: 'CN=Jean d\\\'Arc,OU=Users,DC=local',
        attributes: [
            { type: 'displayName', values: ['Marc L\\c3\\a9on'] },
            { type: 'memberOf', values: ['CN=Acc\\c3\\a8s Magasin,OU=Groups,DC=local', 'Simple Group'] }
        ]
    }
};
const flattened = flattenLDAPEntry(mockEntry);
console.log('- Flattened Entry:', JSON.stringify(flattened, null, 2));
assert.strictEqual(flattened.displayName, 'Marc Léon'.normalize('NFC'));
assert.ok(flattened.memberOf.includes('CN=Accès Magasin,OU=Groups,DC=local'.normalize('NFC')));

// 3. Test Normalization Matching (NFC vs NFD)
const groupInAD = 'Equipe Entrepôt'.normalize('NFD'); // Decomposed
const requiredGroup = 'Entrepôt'; // Precomposed (default)

const normalizedG = groupInAD.toLowerCase().normalize('NFC');
const normalizedReq = requiredGroup.toLowerCase().normalize('NFC');
console.log(`- Matching Normalization: "${normalizedG}" includes "${normalizedReq}" ? ${normalizedG.includes(normalizedReq)}`);
assert.ok(normalizedG.includes(normalizedReq));

console.log('\nAll AD logic tests PASSED!');
