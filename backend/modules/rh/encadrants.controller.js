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

/** Détecte si un service code = service "d'accueil" de sa direction
 *  (le responsable = directeur de la direction)
 *  Ex. BF1 pour BF, BB1 pour BB, AA1 pour AA.
 *  Règle : le code service commence par le code direction et le reste est court (1-2 chars).
 */
function isDirectionService(dirCode, svcCode) {
    if (!dirCode || !svcCode) return false;
    const tail = svcCode.slice(dirCode.length);
    return svcCode.startsWith(dirCode) && tail.length >= 1 && tail.length <= 2;
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
 * Cherche les membres d'un groupe AD par son DN exact.
 * Stratégie :
 *  1. Récupère l'attribut `member` du groupe (liste de DNs) — pas de limite de page.
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
                const groupEntries = await ldapSearch(client, groupDN, {
                    scope: 'base', filter: '(objectClass=*)', attributes: ['member']
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
                    const filter = chunk.length === 1
                        ? `(&(objectClass=user)(cn=${chunk[0].replace(/[*()\\\x00]/g, '\\$&')}))`
                        : `(&(objectClass=user)(|(${chunk.map(c => `(cn=${c.replace(/[*()\\\x00]/g, '\\$&')})`).join('')})))`;
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
                                        attributes: ['employeeID', 'mail', 'telephoneNumber', 'mobile']
                                    }, (err2, r) => {
                                        if (err2) { console.warn('[ENCADRANTS] search err:', err2.message); clearTimeout(guard); return finish(); }
                                        r.on('searchEntry', (entry) => {
                                            const u = flattenLDAPEntry(entry);
                                            const empId = String(Array.isArray(u.employeeID) ? u.employeeID[0] : (u.employeeID || '')).trim();
                                            const mail  = Array.isArray(u.mail) ? u.mail[0] : (u.mail || '');
                                            const phone = Array.isArray(u.telephoneNumber) ? u.telephoneNumber[0] : (u.telephoneNumber || '');
                                            const mobile = Array.isArray(u.mobile) ? u.mobile[0] : (u.mobile || '');
                                            if (empId && mail) emailMap.set(empId, { email: mail, ad_phone: phone || mobile });
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
                                // Une seule requête : tous les users AD avec mail
                                const adByDisplay = new Map();
                                try {
                                    client.search(adSettings2.base_dn, {
                                        filter: '(&(objectClass=user)(mail=*))',
                                        scope: 'sub',
                                        attributes: ['displayName', 'cn', 'mail', 'telephoneNumber', 'mobile'],
                                        paged: { pageSize: 500, pagePause: false }
                                    }, (err2, r) => {
                                        if (err2) { clearTimeout(guard); return finish(); }
                                        r.on('searchEntry', (entry) => {
                                            const u = flattenLDAPEntry(entry);
                                            const dn = decodeLDAPString(u.displayName || u.cn || '');
                                            const mail = Array.isArray(u.mail) ? u.mail[0] : (u.mail || '');
                                            const phone = Array.isArray(u.telephoneNumber) ? u.telephoneNumber[0] : (u.telephoneNumber || '');
                                            const mobile = Array.isArray(u.mobile) ? u.mobile[0] : (u.mobile || '');
                                            if (dn && mail) adByDisplay.set(norm(dn), { email: mail, ad_phone: phone || mobile });
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

            // 4. Assembler la réponse
            const result = agents.map(a => {
                const adData = emailMap.get(a.MATRICULE) || {};
                const stored = phoneMap.get(a.MATRICULE) || {};
                const poste = (a.POSTE_L || '').toUpperCase();
                const isDirecteur = poste.startsWith('DIRECTEUR');
                const isDG = isDirecteur && poste.includes('GENERAL');
                const role = isDG ? 'dg' : (isDirecteur ? 'directeur' : 'responsable_service');
                const isDirSvc = role === 'responsable_service' && isDirectionService(a.DIRECTION, a.SERVICE);
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
                    const filter = `(&(objectClass=user)(mail=*)(|(displayName=*${e}*)(cn=*${e}*)(sAMAccountName=*${e}*)))`;
                    try {
                        client.search(adSettings.base_dn, {
                            filter, scope: 'sub', sizeLimit: 20,
                            attributes: ['sAMAccountName', 'displayName', 'cn', 'mail', 'title', 'department', 'employeeID']
                        }, (err2, r) => {
                            if (err2) { clearTimeout(guard); return finish(found); }
                            r.on('searchEntry', (entry) => {
                                const u = flattenLDAPEntry(entry);
                                const mail = Array.isArray(u.mail) ? u.mail[0] : (u.mail || '');
                                if (!mail) return;
                                found.push({
                                    username: u.sAMAccountName || '',
                                    displayName: decodeLDAPString(u.displayName || u.cn || ''),
                                    email: mail,
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
    }
};
