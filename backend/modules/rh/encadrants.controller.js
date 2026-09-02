/**
 * Encadrants controller
 * Gère la liste des directeurs et responsables de service :
 *  - récupération depuis oracle.rh_v_extract_dsi (Postgres)
 *  - email enrichi depuis l'AD (via ad_username)
 *  - téléphone stocké dans hub.encadrants
 *  - comparaison avec la liste de diffusion AD "Directeurs et Chefs de service"
 */
const ldap = require('ldapjs');
const { pgDb, getSqlite } = require('../../shared/database');
const { flattenLDAPEntry, decodeLDAPString } = require('../../shared/utils');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ACTIVE_FILTER = `("POSITION_L" LIKE 'Activité%' OR "POSITION_L" LIKE 'Temps partiel%')`;

/** Détecte si un service = le service "d'accueil" de sa direction, c'est-à-dire
 *  le service générique qui porte le même libellé que la direction elle-même
 *  (ex. SERVICE_L "DIRECTION DES SPORTS" pour DIRECTION_L "DIRECTION DES SPORTS").
 *  NB : l'ancienne règle se basait sur le code service (préfixe du code direction
 *  + 1-2 caractères), mais cette convention de codage est utilisée pour TOUS les
 *  services d'une direction (BT2, BT3, BU5…), pas seulement le service d'accueil,
 *  ce qui faisait matcher à tort quasiment tous les responsables de service.
 */
function isDirectionService(dirLabel, svcLabel) {
    if (!dirLabel || !svcLabel) return false;
    return dirLabel.trim().toUpperCase() === svcLabel.trim().toUpperCase();
}

/** Certains comptes AD récents n'ont pas (encore) l'attribut `mail` renseigné
 *  (write-back Azure AD Connect / provisionnement Exchange en retard, voire
 *  jamais synchronisé côté on-prem) alors que `userPrincipalName` est déjà au
 *  format email et correct (vérifié : ex. compte avec mail vide mais
 *  userPrincipalName = "FDesneulin@ivry94.fr"). On utilise l'UPN comme repli.
 */
function bestEmail(mail, upn) {
    if (mail) return mail;
    if (upn && upn.includes('@')) return upn;
    return '';
}

/** Crée un client LDAP connecté + bindé, prêt à l'emploi. */
function ldapClient(adSettings) {
    return ldap.createClient({
        url: `ldap://${adSettings.host}:${adSettings.port || 389}`,
        connectTimeout: 6000, timeout: 20000
    });
}

/** Recherche LDAP avec Promise (une seule requête, toutes les entrées). */
function ldapSearch(client, base, opts) {
    return new Promise((resolve, reject) => {
        const results = [];
        client.search(base, opts, (err, res) => {
            if (err) return reject(err);
            res.on('searchEntry', e => results.push(e));
            res.on('error', reject);
            res.on('end', () => resolve(results));
        });
    });
}

/**
 * Décode les séquences d'échappement hexadécimales (\XX) d'une chaîne DN LDAP
 * vers leur forme UTF-8 littérale (ex. "Secr\c3\a9taires" -> "Secrétaires").
 * ldapjs sérialise systématiquement les octets non-ASCII d'un DN sous cette
 * forme (RFC 4514, syntaxe valide), mais réutiliser tel quel ce DN comme base
 * d'une recherche scope=base échoue côté AD avec "No Such Object" dès qu'il
 * contient un caractère accentué (le round-trip hex-échappé -> requête LDAP
 * ne préserve pas les octets d'origine). Les octets \XX consécutifs sont
 * regroupés avant décodage UTF-8 car un caractère accentué occupe souvent
 * 2 octets (donc 2 séquences \XX). Les échappements structurels non-hex du
 * DN (ex. "\," pour une virgule dans un nom) sont laissés intacts.
 */
function unescapeDnHexBytes(dn) {
    const bytes = [];
    let out = '';
    const flush = () => { if (bytes.length) { out += Buffer.from(bytes).toString('utf8'); bytes.length = 0; } };
    const re = /\\([0-9a-fA-F]{2})/g;
    let lastIndex = 0, m;
    while ((m = re.exec(dn))) {
        if (m.index !== lastIndex) { flush(); out += dn.slice(lastIndex, m.index); }
        bytes.push(parseInt(m[1], 16));
        lastIndex = re.lastIndex;
    }
    flush();
    out += dn.slice(lastIndex);
    return out;
}

/** Échappe une valeur pour l'insérer dans un filtre LDAP (RFC 4515). */
function escapeLdapFilterValue(v) {
    return String(v).replace(/[\\*()\x00]/g, (c) => '\\' + c.charCodeAt(0).toString(16).padStart(2, '0'));
}

/**
 * Cherche les membres d'un groupe AD par son DN exact.
 * Stratégie :
 *  1. Récupère l'attribut `member` du groupe via un filtre `distinguishedName=`
 *     (et non un scope=base sur le DN lui-même, cf. unescapeDnHexBytes ci-dessus)
 *     — pas de limite de page.
 *  2. Extrait les CNs des DNs membres.
 *  3. Batch-search les utilisateurs par CN (chunks de 50) pour récupérer mail etc.
 */
async function searchADGroupMembersByDN(groupDN, adSettings) {
    const client = ldapClient(adSettings);
    return new Promise((resolve) => {
        const members = [];
        let settled = false;
        const done = (val) => { if (!settled) { settled = true; try { client.destroy(); } catch(e){} resolve(val); } };
        const guard = setTimeout(() => { console.warn('[ENCADRANTS] timeout AD group'); done(members); }, 30000);

        client.on('error', e => { console.warn('[ENCADRANTS] LDAP error:', e.message); clearTimeout(guard); done(members); });
        client.bind(adSettings.bind_dn, adSettings.bind_password, async (err) => {
            if (err) { clearTimeout(guard); return done(members); }
            try {
                // 1. Attribut `member` du groupe
                const literalDn = unescapeDnHexBytes(groupDN);
                const groupFilter = `(distinguishedName=${escapeLdapFilterValue(literalDn)})`;
                const groupEntries = await ldapSearch(client, adSettings.base_dn, {
                    scope: 'sub', filter: groupFilter, attributes: ['member']
                });
                if (!groupEntries.length) { clearTimeout(guard); return done(members); }

                const grp = flattenLDAPEntry(groupEntries[0]);
                const rawMembers = grp.member
                    ? (Array.isArray(grp.member) ? grp.member : [grp.member])
                    : [];
                if (!rawMembers.length) { clearTimeout(guard); return done(members); }

                // 2. Extraire le CN de chaque DN (ex. "CN=DUPONT Jean,OU=..." → "DUPONT Jean")
                const cns = rawMembers.map(dn => {
                    const m = String(dn).match(/^CN=([^,]+)/i);
                    return m ? m[1] : null;
                }).filter(Boolean);

                // 3. Batch search par CN (chunks de 50)
                const CHUNK = 50;
                for (let i = 0; i < cns.length; i += CHUNK) {
                    const chunk = cns.slice(i, i + CHUNK);
                    // NB : le filtre OR multi-CN avait une parenthèse superflue
                    // ( "(|(" + clauses + "))" au lieu de "(|" + clauses + ")" )
                    // qui produisait un filtre LDAP invalide dès que le groupe
                    // avait plus d'un membre ("invalid attribute name" côté AD).
                    const filter = chunk.length === 1
                        ? `(&(objectClass=user)(cn=${escapeLdapFilterValue(chunk[0])}))`
                        : `(&(objectClass=user)(|${chunk.map(c => `(cn=${escapeLdapFilterValue(c)})`).join('')}))`;
                    try {
                        const entries = await ldapSearch(client, adSettings.base_dn, {
                            filter, scope: 'sub',
                            attributes: ['sAMAccountName', 'displayName', 'cn', 'mail', 'title', 'department']
                        });
                        for (const entry of entries) {
                            const u = flattenLDAPEntry(entry);
                            members.push({
                                username: u.sAMAccountName || '',
                                displayName: decodeLDAPString(u.displayName || u.cn || ''),
                                email: Array.isArray(u.mail) ? u.mail[0] : (u.mail || ''),
                                title: decodeLDAPString(Array.isArray(u.title) ? u.title[0] : (u.title || '')),
                                department: decodeLDAPString(Array.isArray(u.department) ? u.department[0] : (u.department || ''))
                            });
                        }
                    } catch (e) { console.warn('[ENCADRANTS] batch CN search error:', e.message); }
                }
                clearTimeout(guard);
                done(members);
            } catch (e) {
                console.warn('[ENCADRANTS] searchADGroupMembersByDN error:', e.message);
                clearTimeout(guard);
                done(members);
            }
        });
    });
}

/** Liste les groupes/listes de diffusion AD (pour le dropdown). */
async function listADGroupsFromAD(adSettings) {
    const client = ldapClient(adSettings);
    return new Promise((resolve) => {
        const groups = [];
        let settled = false;
        const done = (val) => { if (!settled) { settled = true; try { client.destroy(); } catch(e){} resolve(val); } };
        const guard = setTimeout(() => done(groups), 15000);

        client.on('error', () => { clearTimeout(guard); done(groups); });
        client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
            if (err) { clearTimeout(guard); return done(groups); }
            client.search(adSettings.base_dn, {
                filter: '(|(objectClass=group)(objectClass=distributionList))',
                scope: 'sub',
                attributes: ['dn', 'cn', 'displayName', 'mail', 'description'],
                sizeLimit: 1000
            }, (err2, res) => {
                if (err2) { clearTimeout(guard); return done(groups); }
                res.on('searchEntry', entry => {
                    const u = flattenLDAPEntry(entry);
                    const rawDN = entry.objectName;
                    const dn = rawDN ? String(typeof rawDN.toString === 'function' ? rawDN.toString() : rawDN) : '';
                    const cn = decodeLDAPString(u.cn || '');
                    if (cn) groups.push({
                        dn,
                        cn,
                        displayName: decodeLDAPString(u.displayName || cn),
                        mail: Array.isArray(u.mail) ? u.mail[0] : (u.mail || ''),
                        description: decodeLDAPString(Array.isArray(u.description) ? u.description[0] : (u.description || ''))
                    });
                });
                res.on('error', () => { clearTimeout(guard); done(groups); });
                res.on('end', () => {
                    clearTimeout(guard);
                    groups.sort((a, b) => a.cn.localeCompare(b.cn, 'fr'));
                    done(groups);
                });
            });
        });
    });
}

// ─── Controller ──────────────────────────────────────────────────────────────

module.exports = {

    /**
     * GET /api/admin/rh/encadrants
     * Retourne les directeurs + responsables de service actifs, enrichis
     * avec l'email AD (via ad_username) et le téléphone stocké en base.
     */
    getEncadrants: async (req, res) => {
        try {
            // 1. Récupérer directeurs et resp. de service actifs.
            // On exclut les « directeurs » d'équipements (crèche, multi-accueil, maison de quartier,
            // résidences autonomie) et les postes de direction de cabinet ou artistique qui
            // ne correspondent pas à des chefs de direction administrative.
            const agents = await pgDb.all(`
                SELECT
                    "MATRICULE", "NOM", "PRENOM",
                    "DIRECTION", "DIRECTION_L",
                    "SERVICE", "SERVICE_L",
                    "POSTE_L", "FONCTION_L",
                    "POSITION_L"
                FROM oracle.rh_v_extract_dsi
                WHERE ${ACTIVE_FILTER}
                  AND (
                    "POSTE_L" LIKE 'DIRECTEUR%GENERAL%'
                    OR "POSTE_L" LIKE 'DIRECTEUR·TRICE D%'
                    OR "POSTE_L" LIKE 'RESPONSABLE DU SERVICE%'
                  )
                  AND "POSTE_L" NOT LIKE '%CABINET%'
                  AND "POSTE_L" NOT LIKE '%ARTISTIQUE%'
                  AND "POSTE_L" NOT LIKE '%MAISON DE QUARTIER%'
                  AND "POSTE_L" NOT LIKE '%CRECHE%'
                  AND "POSTE_L" NOT LIKE '%MULTI ACCUEIL%'
                  AND "POSTE_L" NOT LIKE '%MULTI-ACCUEIL%'
                  AND "POSTE_L" NOT LIKE '%RESIDENCES AUTONOMIE%'
                ORDER BY "DIRECTION", "SERVICE", "NOM", "PRENOM"
            `);

            if (!agents.length) return res.json([]);

            // 2. Données stockées (téléphones + liens AD manuels)
            const phones = await pgDb.all('SELECT matricule, telephone, telephone_perso, ad_username, email_override FROM hub.encadrants');
            const phoneMap = new Map(phones.map(p => [p.matricule, { telephone: p.telephone, telephone_perso: p.telephone_perso, ad_username: p.ad_username, email_override: p.email_override }]));

            // 3. Emails depuis l'AD par employeeID = MATRICULE (fiable, pas de matching par nom)
            // Batch LDAP en chunks de 50 : filtre (&(objectClass=user)(|(employeeID=m1)(employeeID=m2)...))
            const emailMap = new Map(); // matricule → { email, ad_phone }
            try {
                const db = getSqlite();
                const adSettings = await db.get('SELECT * FROM ad_settings WHERE id=1');
                if (adSettings && adSettings.is_enabled && adSettings.host) {
                    // Nettoie et valide les matricules : trim + seulement alphanum/tiret
                    const esc = (v) => String(v).trim().replace(/[*()\\\x00]/g, '\\$&');
                    const matricules = agents
                        .map(a => String(a.MATRICULE || '').trim())
                        .filter(m => m && /^[A-Za-z0-9\-]+$/.test(m)); // AD employeeID = chiffres/lettres uniquement

                    const CHUNK = 50;
                    for (let i = 0; i < matricules.length; i += CHUNK) {
                        const chunk = matricules.slice(i, i + CHUNK);
                        if (!chunk.length) continue;
                        const filter = chunk.length === 1
                            ? `(&(objectClass=user)(employeeID=${esc(chunk[0])}))`
                            : `(&(objectClass=user)(|${chunk.map(m => `(employeeID=${esc(m)})`).join('')}))`;

                        await new Promise((resolve) => {
                            let settled = false;
                            const finish = () => { if (!settled) { settled = true; resolve(); } };
                            const client = ldap.createClient({
                                url: `ldap://${adSettings.host}:${adSettings.port || 389}`,
                                connectTimeout: 6000, timeout: 12000
                            });
                            const guard = setTimeout(() => { client.destroy(); finish(); }, 15000);
                            client.on('error', (e) => { console.warn('[ENCADRANTS] LDAP err:', e.message); clearTimeout(guard); finish(); });
                            client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
                                if (err) { clearTimeout(guard); return finish(); }
                                // client.search peut lever une erreur SYNCHRONE si le filtre est rejeté
                                // par la version de @ldapjs/filter → on l'attrape explicitement.
                                try {
                                    client.search(adSettings.base_dn, {
                                        filter, scope: 'sub',
                                        attributes: ['employeeID', 'mail', 'userPrincipalName', 'telephoneNumber', 'mobile']
                                    }, (err2, r) => {
                                        if (err2) { console.warn('[ENCADRANTS] search err:', err2.message); clearTimeout(guard); return finish(); }
                                        r.on('searchEntry', (entry) => {
                                            const u = flattenLDAPEntry(entry);
                                            const empId = String(Array.isArray(u.employeeID) ? u.employeeID[0] : (u.employeeID || '')).trim();
                                            const mail  = Array.isArray(u.mail) ? u.mail[0] : (u.mail || '');
                                            const upn   = Array.isArray(u.userPrincipalName) ? u.userPrincipalName[0] : (u.userPrincipalName || '');
                                            const email = bestEmail(mail, upn);
                                            const phone = Array.isArray(u.telephoneNumber) ? u.telephoneNumber[0] : (u.telephoneNumber || '');
                                            const mobile = Array.isArray(u.mobile) ? u.mobile[0] : (u.mobile || '');
                                            if (empId && email) emailMap.set(empId, { email, ad_phone: phone || mobile });
                                        });
                                        r.on('error', (e) => { console.warn('[ENCADRANTS] entry err:', e.message); clearTimeout(guard); finish(); });
                                        r.on('end', () => { clearTimeout(guard); client.destroy(); finish(); });
                                    });
                                } catch (syncErr) {
                                    // Filtre rejeté synchronement par ldapjs — log + on continue sans crash
                                    console.warn('[ENCADRANTS] filtre LDAP rejeté (employeeID non supporté ?):', syncErr.message, '| filtre:', filter.slice(0, 120));
                                    clearTimeout(guard);
                                    client.destroy();
                                    finish();
                                }
                            });
                        });
                    }
                }
            } catch (e) {
                console.warn('[ENCADRANTS] AD enrichissement échoué:', e.message);
            }

            // 3b. Fallback par displayName pour les agents sans email après la recherche par matricule
            const missingAgents = agents.filter(a => !emailMap.has(a.MATRICULE));
            if (missingAgents.length > 0) {
                try {
                    const db2 = getSqlite();
                    const adSettings2 = await db2.get('SELECT * FROM ad_settings WHERE id=1');
                    if (adSettings2 && adSettings2.is_enabled && adSettings2.host) {
                        const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
                        await new Promise((resolve) => {
                            let settled = false;
                            const finish = () => { if (!settled) { settled = true; resolve(); } };
                            const client = ldap.createClient({
                                url: `ldap://${adSettings2.host}:${adSettings2.port || 389}`,
                                connectTimeout: 6000, timeout: 20000
                            });
                            const guard = setTimeout(() => { client.destroy(); finish(); }, 25000);
                            client.on('error', () => { clearTimeout(guard); finish(); });
                            client.bind(adSettings2.bind_dn, adSettings2.bind_password, (err) => {
                                if (err) { clearTimeout(guard); return finish(); }
                                // Une seule requête : tous les users AD avec mail (ou UPN au format email
                                // en repli, pour les comptes récents pas encore synchronisés côté mail)
                                const adByDisplay = new Map();
                                try {
                                    client.search(adSettings2.base_dn, {
                                        filter: '(&(objectClass=user)(|(mail=*)(userPrincipalName=*@*)))',
                                        scope: 'sub',
                                        attributes: ['displayName', 'cn', 'mail', 'userPrincipalName', 'telephoneNumber', 'mobile'],
                                        paged: { pageSize: 500, pagePause: false }
                                    }, (err2, r) => {
                                        if (err2) { clearTimeout(guard); return finish(); }
                                        r.on('searchEntry', (entry) => {
                                            const u = flattenLDAPEntry(entry);
                                            const dn = decodeLDAPString(u.displayName || u.cn || '');
                                            const mail = Array.isArray(u.mail) ? u.mail[0] : (u.mail || '');
                                            const upn  = Array.isArray(u.userPrincipalName) ? u.userPrincipalName[0] : (u.userPrincipalName || '');
                                            const email = bestEmail(mail, upn);
                                            const phone = Array.isArray(u.telephoneNumber) ? u.telephoneNumber[0] : (u.telephoneNumber || '');
                                            const mobile = Array.isArray(u.mobile) ? u.mobile[0] : (u.mobile || '');
                                            if (dn && email) adByDisplay.set(norm(dn), { email, ad_phone: phone || mobile });
                                        });
                                        r.on('error', () => { clearTimeout(guard); finish(); });
                                        r.on('end', () => {
                                            clearTimeout(guard); client.destroy();
                                            // Matcher par PRENOM NOM ou NOM PRENOM
                                            for (const a of missingAgents) {
                                                const np = norm(`${a.PRENOM} ${a.NOM}`);
                                                const pn = norm(`${a.NOM} ${a.PRENOM}`);
                                                const match = adByDisplay.get(np) || adByDisplay.get(pn);
                                                if (match) emailMap.set(a.MATRICULE, match);
                                            }
                                            finish();
                                        });
                                    });
                                } catch (syncErr) {
                                    console.warn('[ENCADRANTS] fallback displayName rejeté:', syncErr.message);
                                    clearTimeout(guard); client.destroy(); finish();
                                }
                            });
                        });
                    }
                } catch (e) {
                    console.warn('[ENCADRANTS] fallback displayName échoué:', e.message);
                }
            }

            // 3c. Pour les agents liés manuellement par ad_username (cas d'un compte AD tout
            // juste créé, sans mail au moment de la liaison) mais toujours sans email : on
            // retente une recherche directe par sAMAccountName, le mail ayant pu être
            // renseigné depuis (provisionnement O365 différé).
            const usernamesToRetry = [...new Set(
                agents
                    .filter(a => !emailMap.has(a.MATRICULE))
                    .map(a => phoneMap.get(a.MATRICULE))
                    .filter(st => st && st.ad_username && !st.email_override)
                    .map(st => st.ad_username)
            )];
            if (usernamesToRetry.length > 0) {
                try {
                    const db3 = getSqlite();
                    const adSettings3 = await db3.get('SELECT * FROM ad_settings WHERE id=1');
                    if (adSettings3 && adSettings3.is_enabled && adSettings3.host) {
                        const esc = (v) => String(v).trim().replace(/[*()\\\x00]/g, '\\$&');
                        const usernameMailMap = new Map(); // username (lower) → { email, ad_phone }
                        const CHUNK = 50;
                        for (let i = 0; i < usernamesToRetry.length; i += CHUNK) {
                            const chunk = usernamesToRetry.slice(i, i + CHUNK);
                            const filter = chunk.length === 1
                                ? `(&(objectClass=user)(sAMAccountName=${esc(chunk[0])}))`
                                : `(&(objectClass=user)(|${chunk.map(u => `(sAMAccountName=${esc(u)})`).join('')}))`;
                            await new Promise((resolve) => {
                                let settled = false;
                                const finish = () => { if (!settled) { settled = true; resolve(); } };
                                const client = ldap.createClient({
                                    url: `ldap://${adSettings3.host}:${adSettings3.port || 389}`,
                                    connectTimeout: 6000, timeout: 12000
                                });
                                const guard = setTimeout(() => { client.destroy(); finish(); }, 15000);
                                client.on('error', () => { clearTimeout(guard); finish(); });
                                client.bind(adSettings3.bind_dn, adSettings3.bind_password, (err) => {
                                    if (err) { clearTimeout(guard); return finish(); }
                                    try {
                                        client.search(adSettings3.base_dn, {
                                            filter, scope: 'sub',
                                            attributes: ['sAMAccountName', 'mail', 'userPrincipalName', 'telephoneNumber', 'mobile']
                                        }, (err2, r) => {
                                            if (err2) { clearTimeout(guard); return finish(); }
                                            r.on('searchEntry', (entry) => {
                                                const u = flattenLDAPEntry(entry);
                                                const username = String(u.sAMAccountName || '').trim();
                                                const mail = Array.isArray(u.mail) ? u.mail[0] : (u.mail || '');
                                                const upn  = Array.isArray(u.userPrincipalName) ? u.userPrincipalName[0] : (u.userPrincipalName || '');
                                                const email = bestEmail(mail, upn);
                                                const phone = Array.isArray(u.telephoneNumber) ? u.telephoneNumber[0] : (u.telephoneNumber || '');
                                                const mobile = Array.isArray(u.mobile) ? u.mobile[0] : (u.mobile || '');
                                                if (username && email) usernameMailMap.set(username.toLowerCase(), { email, ad_phone: phone || mobile });
                                            });
                                            r.on('error', () => { clearTimeout(guard); finish(); });
                                            r.on('end', () => { clearTimeout(guard); client.destroy(); finish(); });
                                        });
                                    } catch (se) { clearTimeout(guard); client.destroy(); finish(); }
                                });
                            });
                        }
                        for (const a of agents) {
                            if (emailMap.has(a.MATRICULE)) continue;
                            const st = phoneMap.get(a.MATRICULE);
                            if (!st || !st.ad_username) continue;
                            const match = usernameMailMap.get(st.ad_username.toLowerCase());
                            if (match) emailMap.set(a.MATRICULE, match);
                        }
                    }
                } catch (e) {
                    console.warn('[ENCADRANTS] retry par ad_username échoué:', e.message);
                }
            }

            // 4. Assembler la réponse
            const result = agents.map(a => {
                const adData = emailMap.get(a.MATRICULE) || {};
                const stored = phoneMap.get(a.MATRICULE) || {};
                const poste = (a.POSTE_L || '').toUpperCase();
                const isDirecteur = poste.startsWith('DIRECTEUR');
                const isDG = isDirecteur && poste.includes('GENERAL');
                const role = isDG ? 'dg' : (isDirecteur ? 'directeur' : 'responsable_service');
                const isDirSvc = role === 'responsable_service' && isDirectionService(a.DIRECTION_L, a.SERVICE_L);
                // Email : priorité à l'override manuel, puis à l'AD
                const email = stored.email_override || adData.email || '';
                return {
                    matricule: a.MATRICULE,
                    nom: a.NOM,
                    prenom: a.PRENOM,
                    direction_code: a.DIRECTION,
                    direction_label: a.DIRECTION_L,
                    service_code: a.SERVICE,
                    service_label: a.SERVICE_L,
                    poste: a.POSTE_L,
                    role,
                    is_direction_service: isDirSvc,
                    email,
                    email_source: stored.email_override ? 'manuel' : (adData.email ? 'ad' : ''),
                    ad_phone: adData.ad_phone || '',
                    ad_username: stored.ad_username || '',
                    telephone: stored.telephone || '',
                    telephone_perso: stored.telephone_perso || '',
                    position: a.POSITION_L
                };
            });

            res.json(result);
        } catch (error) {
            console.error('[ENCADRANTS] getEncadrants:', error.message);
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * PUT /api/admin/rh/encadrants/:matricule/telephone
     * Enregistre ou met à jour le téléphone d'un encadrant.
     */
    updateTelephone: async (req, res) => {
        try {
            const { matricule } = req.params;
            const { telephone, telephone_perso } = req.body;
            const tel = (telephone || '').trim() || null;
            const telPerso = (telephone_perso || '').trim() || null;
            // pgDb.run ajoute RETURNING id, incompatible avec notre PK matricule → pool direct
            const { pool } = require('../../shared/database');
            await pool.query(
                `INSERT INTO hub.encadrants (matricule, telephone, telephone_perso, updated_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (matricule) DO UPDATE
                   SET telephone = EXCLUDED.telephone,
                       telephone_perso = EXCLUDED.telephone_perso,
                       updated_at = NOW()`,
                [matricule, tel, telPerso]
            );
            res.json({ ok: true, matricule, telephone: tel, telephone_perso: telPerso });
        } catch (error) {
            console.error('[ENCADRANTS] updateTelephone:', error.message);
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * GET /api/admin/rh/encadrants/parc-phones
     * Propose les téléphones pro à remplir depuis hub_parc.mobilite_devices,
     * en matchant last_agent (NOM Prenom) avec les encadrants.
     */
    parcPhones: async (req, res) => {
        try {
            const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

            // 1. Encadrants actifs
            const agents = await pgDb.all(`
                SELECT "MATRICULE","NOM","PRENOM","DIRECTION_L","SERVICE_L","POSTE_L"
                FROM oracle.rh_v_extract_dsi
                WHERE ${ACTIVE_FILTER}
                  AND (
                    "POSTE_L" LIKE 'DIRECTEUR%GENERAL%'
                    OR "POSTE_L" LIKE 'DIRECTEUR·TRICE D%'
                    OR "POSTE_L" LIKE 'RESPONSABLE DU SERVICE%'
                  )
                  AND "POSTE_L" NOT LIKE '%CABINET%'
                  AND "POSTE_L" NOT LIKE '%ARTISTIQUE%'
                  AND "POSTE_L" NOT LIKE '%MAISON DE QUARTIER%'
                  AND "POSTE_L" NOT LIKE '%CRECHE%'
                  AND "POSTE_L" NOT LIKE '%MULTI ACCUEIL%'
                  AND "POSTE_L" NOT LIKE '%MULTI-ACCUEIL%'
                  AND "POSTE_L" NOT LIKE '%RESIDENCES AUTONOMIE%'
            `);

            // 2. Appareils actifs attribués (téléphones) depuis le parc
            const devices = await pgDb.all(`
                SELECT last_agent, numero_ligne, type_appareil, famille
                FROM hub_parc.mobilite_devices
                WHERE is_actif = true AND statut = 'attribue'
                  AND famille = 'telephone'
                  AND numero_ligne IS NOT NULL AND numero_ligne != ''
                  AND last_agent IS NOT NULL AND last_agent != '' AND last_agent NOT LIKE 'Ex %'
            `);

            // 3. Index encadrants : NOM+PRENOM (appareils) et NOM seul (lignes mobiles)
            const encMap = new Map();
            const byNom = new Map();
            const firstAlpha = (s) => { const m = norm(s).match(/[A-Z]/); return m ? m[0] : ''; };
            for (const a of agents) {
                encMap.set(norm(`${a.NOM} ${a.PRENOM}`), a);
                encMap.set(norm(`${a.PRENOM} ${a.NOM}`), a);
                const k = norm(a.NOM);
                if (!byNom.has(k)) byNom.set(k, []);
                byNom.get(k).push(a);
            }

            // 4. Téléphones déjà enregistrés
            const existing = await pgDb.all('SELECT matricule, telephone FROM hub.encadrants WHERE telephone IS NOT NULL AND telephone != \'\'');
            const existingMap = new Map(existing.map(e => [e.matricule, e.telephone]));

            const matchByMat = new Map(); // matricule → match (1 par encadrant, appareil prioritaire)

            // 5a. PASSE 1 — Appareils mobiles (mobilite_devices)
            for (const d of devices) {
                const nameRaw = d.last_agent.split(' - ')[0].trim();
                const agent = encMap.get(norm(nameRaw));
                if (!agent || matchByMat.has(agent.MATRICULE)) continue;
                matchByMat.set(agent.MATRICULE, {
                    matricule: agent.MATRICULE, nom: agent.NOM, prenom: agent.PRENOM,
                    direction: agent.DIRECTION_L, service: agent.SERVICE_L, poste: agent.POSTE_L,
                    source: 'appareil', parc_agent: d.last_agent, parc_numero: d.numero_ligne, parc_type: d.type_appareil,
                    telephone_actuel: existingMap.get(agent.MATRICULE) || null,
                    already_set: !!existingMap.get(agent.MATRICULE)
                });
            }

            // 5b. PASSE 2 — Lignes mobiles (lignes_mobiles) pour les encadrants non encore matchés.
            // Exclut les MultiSIM ; en cas de plusieurs lignes, priorité au forfait VOIX sur la DATA.
            const lignes = await pgDb.all(`
                SELECT numero_ligne, nom, prenom, forfait
                FROM hub_parc.lignes_mobiles
                WHERE (statut_ligne IS NULL OR statut_ligne NOT IN ('Suspendue', 'Résiliée', 'Resiliee'))
                  AND ligne_secondaire != 'MULTI-SIM'
                  AND forfait NOT LIKE 'MultiSIM%'
                  AND numero_ligne IS NOT NULL AND numero_ligne != ''
            `);
            // Score : forfait voix > data
            const ligneScore = (f) => {
                const x = (f || '').toUpperCase();
                if (x.startsWith('FORFAIT MOBILE') || x.includes('VOIX')) return 3;
                if (x.startsWith('INTERNET MOBILE')) return 1; // clé data
                return 2;
            };
            // Regroupe les meilleures lignes par encadrant (NOM + initiale prénom)
            const bestLigne = new Map(); // matricule → { numero, forfait, score }
            for (const l of lignes) {
                const cands = byNom.get(norm(l.nom));
                if (!cands) continue;
                const ini = firstAlpha(l.prenom);
                const hits = cands.filter(a => firstAlpha(a.PRENOM) === ini);
                if (hits.length !== 1) continue; // ambigu → on ignore
                const agent = hits[0];
                if (matchByMat.has(agent.MATRICULE)) continue; // déjà via appareil
                const sc = ligneScore(l.forfait);
                const cur = bestLigne.get(agent.MATRICULE);
                if (!cur || sc > cur.score) bestLigne.set(agent.MATRICULE, { agent, numero: l.numero_ligne, forfait: l.forfait, score: sc });
            }
            for (const { agent, numero, forfait } of bestLigne.values()) {
                matchByMat.set(agent.MATRICULE, {
                    matricule: agent.MATRICULE, nom: agent.NOM, prenom: agent.PRENOM,
                    direction: agent.DIRECTION_L, service: agent.SERVICE_L, poste: agent.POSTE_L,
                    source: 'ligne_mobile', parc_agent: `${agent.NOM} ${agent.PRENOM}`, parc_numero: numero, parc_type: forfait,
                    telephone_actuel: existingMap.get(agent.MATRICULE) || null,
                    already_set: !!existingMap.get(agent.MATRICULE)
                });
            }

            const matches = Array.from(matchByMat.values()).sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'));
            res.json({ matches, total: matches.length, no_phone: agents.length - matches.length });
        } catch (error) {
            console.error('[ENCADRANTS] parcPhones:', error.message);
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * POST /api/admin/rh/encadrants/parc-phones/apply
     * Applique les téléphones matchés (body: [{ matricule, telephone }])
     * Seulement pour ceux sans téléphone ou avec override=true.
     */
    parcPhonesApply: async (req, res) => {
        try {
            const { items, override = false } = req.body; // items: [{ matricule, telephone }]
            if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items requis' });
            const { pool } = require('../../shared/database');
            let applied = 0;
            for (const { matricule, telephone } of items) {
                if (!matricule || !telephone) continue;
                await pool.query(
                    `INSERT INTO hub.encadrants (matricule, telephone, updated_at)
                     VALUES ($1, $2, NOW())
                     ON CONFLICT (matricule) DO UPDATE
                       SET telephone = CASE WHEN $3 OR hub.encadrants.telephone IS NULL OR hub.encadrants.telephone = '' THEN EXCLUDED.telephone ELSE hub.encadrants.telephone END,
                           updated_at = NOW()`,
                    [matricule, telephone, override]
                );
                applied++;
            }
            res.json({ ok: true, applied });
        } catch (error) {
            console.error('[ENCADRANTS] parcPhonesApply:', error.message);
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * GET /api/admin/rh/encadrants/ad-search?q=...
     * Recherche d'un utilisateur AD par nom/prénom (pour liaison manuelle).
     */
    searchAD: async (req, res) => {
        try {
            const q = (req.query.q || '').trim();
            if (!q || q.length < 2) return res.json([]);
            const db = getSqlite();
            const adSettings = await db.get('SELECT * FROM ad_settings WHERE id=1');
            if (!adSettings || !adSettings.is_enabled || !adSettings.host) return res.json([]);

            const results = await new Promise((resolve) => {
                const found = [];
                let settled = false;
                const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
                const client = ldap.createClient({ url: `ldap://${adSettings.host}:${adSettings.port || 389}`, connectTimeout: 5000, timeout: 8000 });
                const guard = setTimeout(() => { client.destroy(); finish(found); }, 12000);
                client.on('error', () => { clearTimeout(guard); finish(found); });
                client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
                    if (err) { clearTimeout(guard); return finish(found); }
                    const esc = (s) => s.replace(/[*()\\\x00]/g, '\\$&');
                    const e = esc(q);
                    // Pas de filtre (mail=*) : un compte AD tout juste créé (nouvel agent)
                    // n'a souvent pas l'attribut mail renseigné (write-back Azure AD Connect /
                    // provisionnement Exchange en retard) alors que userPrincipalName est déjà
                    // au format email — voir bestEmail(). On veut aussi pouvoir retrouver un
                    // compte qui n'aurait vraiment ni l'un ni l'autre, pour le lier manuellement.
                    const filter = `(&(objectClass=user)(|(displayName=*${e}*)(cn=*${e}*)(sAMAccountName=*${e}*)))`;
                    try {
                        client.search(adSettings.base_dn, {
                            filter, scope: 'sub', sizeLimit: 20,
                            attributes: ['sAMAccountName', 'displayName', 'cn', 'mail', 'userPrincipalName', 'title', 'department', 'employeeID']
                        }, (err2, r) => {
                            if (err2) { clearTimeout(guard); return finish(found); }
                            r.on('searchEntry', (entry) => {
                                const u = flattenLDAPEntry(entry);
                                const mail = Array.isArray(u.mail) ? u.mail[0] : (u.mail || '');
                                const upn  = Array.isArray(u.userPrincipalName) ? u.userPrincipalName[0] : (u.userPrincipalName || '');
                                found.push({
                                    username: u.sAMAccountName || '',
                                    displayName: decodeLDAPString(u.displayName || u.cn || ''),
                                    email: bestEmail(mail, upn),
                                    title: decodeLDAPString(Array.isArray(u.title) ? u.title[0] : (u.title || '')),
                                    department: decodeLDAPString(Array.isArray(u.department) ? u.department[0] : (u.department || '')),
                                    employeeID: Array.isArray(u.employeeID) ? u.employeeID[0] : (u.employeeID || '')
                                });
                            });
                            r.on('error', () => { clearTimeout(guard); finish(found); });
                            r.on('end', () => { clearTimeout(guard); client.destroy(); finish(found); });
                        });
                    } catch (se) { clearTimeout(guard); client.destroy(); finish(found); }
                });
            });
            res.json(results);
        } catch (error) {
            console.error('[ENCADRANTS] searchAD:', error.message);
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * PUT /api/admin/rh/encadrants/:matricule/ad-link
     * Lie manuellement un encadrant à un compte AD (sauvegarde username + email).
     */
    linkAD: async (req, res) => {
        try {
            const { matricule } = req.params;
            const { ad_username, email } = req.body;
            const { pool } = require('../../shared/database');
            await pool.query(
                `INSERT INTO hub.encadrants (matricule, ad_username, email_override, updated_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (matricule) DO UPDATE
                   SET ad_username = EXCLUDED.ad_username,
                       email_override = EXCLUDED.email_override,
                       updated_at = NOW()`,
                [matricule, ad_username || null, email || null]
            );
            res.json({ ok: true, matricule, ad_username, email });
        } catch (error) {
            console.error('[ENCADRANTS] linkAD:', error.message);
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * GET /api/admin/rh/encadrants/ad-groups-list
     * Liste tous les groupes/listes de diffusion AD (pour le dropdown front).
     */
    listADGroups: async (req, res) => {
        try {
            const db = getSqlite();
            const adSettings = await db.get('SELECT * FROM ad_settings WHERE id=1');
            if (!adSettings || !adSettings.is_enabled || !adSettings.host) {
                return res.json({ groups: [], error: 'AD non configuré' });
            }
            const groups = await listADGroupsFromAD(adSettings);
            res.json({ groups, count: groups.length });
        } catch (error) {
            console.error('[ENCADRANTS] listADGroups:', error.message);
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * GET /api/admin/rh/encadrants/ad-group?dn=<encodedDN>
     * Retourne les membres d'un groupe AD identifié par son DN.
     */
    getADGroup: async (req, res) => {
        try {
            const db = getSqlite();
            const adSettings = await db.get('SELECT * FROM ad_settings WHERE id=1');
            if (!adSettings || !adSettings.is_enabled || !adSettings.host) {
                return res.json({ members: [], error: 'AD non configuré' });
            }
            const groupDN = req.query.dn;
            if (!groupDN) return res.status(400).json({ error: 'Paramètre dn requis' });
            const members = await searchADGroupMembersByDN(groupDN, adSettings);
            res.json({ members, dn: groupDN, count: members.length });
        } catch (error) {
            console.error('[ENCADRANTS] getADGroup:', error.message);
            res.status(500).json({ error: error.message });
        }
    },

    // ─── Groupes particuliers (basés sur une liste de diffusion AD) ───────────
    // Permet de « nommer » un groupe AD choisi (ex. "Secrétaires et Collaborateurs
    // des Elus") pour le rendre réutilisable ailleurs dans le Hub (ex. restriction
    // d'accès à un formulaire de demande) sans avoir à re-taper le DN à chaque fois.
    // La liste des membres n'est jamais recopiée en base : elle est toujours
    // relue en direct depuis l'AD via `ad_group_dn`, donc toujours à jour.

    /**
     * GET /api/admin/rh/encadrants/custom-groups
     * Liste les groupes particuliers déjà enregistrés (tout utilisateur connecté,
     * nécessaire pour peupler les cases à cocher "public autorisé" ailleurs).
     */
    listCustomGroups: async (req, res) => {
        try {
            const groups = await pgDb.all(`SELECT id, name, ad_group_dn, ad_group_cn, description, created_at, updated_at FROM hub.custom_groups ORDER BY name`);
            res.json({ groups });
        } catch (error) {
            console.error('[ENCADRANTS] listCustomGroups:', error.message);
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * POST /api/admin/rh/encadrants/custom-groups
     * Crée un groupe particulier à partir d'un groupe AD choisi dans le dropdown.
     */
    createCustomGroup: async (req, res) => {
        try {
            const { name, ad_group_dn, ad_group_cn, description } = req.body || {};
            if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nom requis' });
            if (!ad_group_dn || !String(ad_group_dn).trim()) return res.status(400).json({ error: 'Groupe AD requis' });
            const result = await pgDb.run(
                `INSERT INTO hub.custom_groups (name, ad_group_dn, ad_group_cn, description) VALUES (?, ?, ?, ?)`,
                [String(name).trim(), ad_group_dn, ad_group_cn || '', description || '']
            );
            res.json({ ok: true, id: result.lastID });
        } catch (error) {
            console.error('[ENCADRANTS] createCustomGroup:', error.message);
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * PUT /api/admin/rh/encadrants/custom-groups/:id
     * Modifie le nom / la description, ou repointe vers un autre groupe AD.
     */
    updateCustomGroup: async (req, res) => {
        try {
            const { id } = req.params;
            const { name, ad_group_dn, ad_group_cn, description } = req.body || {};
            const fields = [];
            const values = [];
            if (name !== undefined) { fields.push('name = ?'); values.push(String(name).trim()); }
            if (ad_group_dn !== undefined) { fields.push('ad_group_dn = ?'); values.push(ad_group_dn); }
            if (ad_group_cn !== undefined) { fields.push('ad_group_cn = ?'); values.push(ad_group_cn); }
            if (description !== undefined) { fields.push('description = ?'); values.push(description); }
            if (fields.length === 0) return res.status(400).json({ error: 'Aucun champ à modifier' });
            fields.push('updated_at = NOW()');
            values.push(id);
            await pgDb.run(`UPDATE hub.custom_groups SET ${fields.join(', ')} WHERE id = ?`, values);
            res.json({ ok: true });
        } catch (error) {
            console.error('[ENCADRANTS] updateCustomGroup:', error.message);
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * DELETE /api/admin/rh/encadrants/custom-groups/:id
     */
    deleteCustomGroup: async (req, res) => {
        try {
            const { id } = req.params;
            await pgDb.run(`DELETE FROM hub.custom_groups WHERE id = ?`, [id]);
            res.json({ ok: true });
        } catch (error) {
            console.error('[ENCADRANTS] deleteCustomGroup:', error.message);
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * GET /api/admin/rh/encadrants/custom-groups/:id/members
     * Relit en direct les membres du groupe AD associé.
     */
    getCustomGroupMembers: async (req, res) => {
        try {
            const { id } = req.params;
            const group = await pgDb.get(`SELECT * FROM hub.custom_groups WHERE id = ?`, [id]);
            if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
            const db = getSqlite();
            const adSettings = await db.get('SELECT * FROM ad_settings WHERE id=1');
            if (!adSettings || !adSettings.is_enabled || !adSettings.host) {
                return res.json({ members: [], error: 'AD non configuré' });
            }
            const members = await searchADGroupMembersByDN(group.ad_group_dn, adSettings);
            res.json({ members, group, count: members.length });
        } catch (error) {
            console.error('[ENCADRANTS] getCustomGroupMembers:', error.message);
            res.status(500).json({ error: error.message });
        }
    },

    // Exposé pour réutilisation par d'autres modules (ex. request-forms.controller.js
    // pour vérifier l'appartenance d'un utilisateur à un groupe particulier).
    searchADGroupMembersByDN
};
