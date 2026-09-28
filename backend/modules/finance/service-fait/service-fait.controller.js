const { pool, getSqlite } = require('../../../shared/database');
const storage = require('../../../shared/storage');
const crypto = require('crypto');
const { SECRET_KEY } = require('../../../shared/config');
const financeShareController = require('../finance-share.controller');
const { getFacsuiviStatus: getSeditFacsuiviStatus } = financeShareController;
const seditPj = require('./sedit-pj.service');
const encadrantsController = require('../../rh/encadrants.controller');

const DECISION_LABELS = {
    valide: 'Validé',
    valide_avec_reserves: 'Validé avec réserves',
};

/** Le PV n'est poussé dans Sedit que si l'admin a activé l'écriture (défaut : désactivé). */
async function isSeditWriteEnabled() {
    try {
        const db = getSqlite();
        if (!db) return false;
        const row = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'finance.sedit_write_enabled'");
        return !!(row && String(row.setting_value).toLowerCase() === 'true');
    } catch {
        return false;
    }
}

/**
 * Synchronise un service fait validé vers Sedit :
 *  1. étape FACSUIVI → VALIDE (toujours, journalisé pour pouvoir revenir en arrière) ;
 *  2. PV scellé (AC interne) poussé comme PJ de la facture (derrière le flag admin).
 * Les erreurs Sedit ne font jamais échouer la décision AppDSI : elles sont journalisées.
 */
async function syncServiceFaitToSedit({ wf, decision, comment }) {
    const out = { facsuivi: null, pv: null, errors: [] };

    try {
        // Le service fait est porté dans Sedit par le DEMANDEUR (celui qui a lancé le
        // workflow), et non par le valideur : le valideur est mentionné en commentaire
        // (« Pour XXXXX ») — demande explicite.
        const requesterAgent = await getAgentInfo(wf.requested_by);
        const requesterEmail = (requesterAgent && requesterAgent.email)
            || (await getRequesterEmail(wf.requested_by)) || '';
        const requesterName = (requesterAgent && requesterAgent.nom) || wf.requested_by;
        const verifierLabel = wf.verifier_name || wf.verifier_username || '';
        out.facsuivi = await seditPj.updateServiceFaitDoneLogged({
            invoiceRef: wf.invoice_ref,
            actorUsername: wf.requested_by,
            actorEmail: requesterEmail,
            actorName: requesterName,
            // Repli si le demandeur n'a pas de compte Sedit (ex. « admin »).
            fallback: {
                username: wf.verifier_username,
                email: wf.verifier_email,
                name: wf.verifier_name,
            },
            comment: verifierLabel ? `Pour ${verifierLabel}` : '',
            workflowId: wf.id,
        });
        if (out.facsuivi.reason) {
            console.warn(`[ServiceFait] Sedit FACSUIVI non modifié pour ${wf.invoice_ref} (${out.facsuivi.reason}).`);
        } else if (out.facsuivi.updated > 0) {
            console.log(`[ServiceFait] Sedit FACSUIVI: service fait validé pour la facture ${wf.invoice_ref}.`);
        }
    } catch (e) {
        out.errors.push('facsuivi: ' + e.message);
        console.error('[ServiceFait] Sedit FACSUIVI error:', e.message);
        return out;
    }

    if (!(await isSeditWriteEnabled())) {
        out.pv = { skipped: true, reason: 'flag_disabled' };
        return out;
    }

    try {
        const pjRes = await pool.query(
            `SELECT file_path, original_name FROM finance.service_fait_pieces_jointes WHERE workflow_id = $1 ORDER BY uploaded_at`,
            [wf.id]
        );
        const sourceFiles = [];
        for (const p of pjRes.rows) {
            const buffer = await seditPj.readStorageBuffer(p.file_path);
            sourceFiles.push({ buffer, originalname: p.original_name });
        }

        const pv = await seditPj.buildSealedServiceFaitPv({
            workflow: wf,
            decisionLabel: DECISION_LABELS[decision] || decision,
            comment,
            verifierName: wf.verifier_name || wf.verifier_username,
            verifierEmail: wf.verifier_email,
            decisionAt: new Date(),
            sourceFiles,
            directorName: wf.director_name,
            directorEmail: wf.director_email,
            directorMode: wf.director_mode,
            directorDecisionAt: wf.director_decision_at,
            entityLabel: wf.entity_label,
        });

        const originalName = `PV_ServiceFait_${wf.invoice_ref || wf.id}_SF-${wf.id}.pdf`;
        const attached = await seditPj.attachServiceFaitPv({
            invoiceRef: wf.invoice_ref,
            workflowId: wf.id,
            buffer: pv.buffer,
            originalName,
            actor: wf.verifier_username,
        });
        out.pv = { attached: true, ...attached, seal: pv.seal, sourceHashes: pv.sourceHashes };
        console.log(`[ServiceFait] PV scellé attaché dans Sedit pour ${wf.invoice_ref} (PJ ${attached.pjRoo}).`);
    } catch (e) {
        out.errors.push('pv: ' + e.message);
        console.error('[ServiceFait] Sedit PV error:', e.message);
    }

    return out;
}

// Statuts pour lesquels le processus est encore ouvert : la décision peut être prise,
// reprise (après pause) ou annulée. Doit rester synchro entre les trois usages ci-dessous
// (submitDecision, cancelWorkflow, getPublicByToken) et avec ONGOING_STATUSES côté frontend.
const ONGOING_STATUSES = ['en_attente', 'en_cours', 'transfere', 'en_pause'];

let sendMailFn = null;
const setSendMail = (fn) => { sendMailFn = fn; };

async function getAppBaseUrl() {
    try {
        const db = getSqlite();
        const row = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'app_base_url'");
        const val = row?.setting_value?.trim();
        return val || process.env.APP_BASE_URL || process.env.APP_URL || 'http://localhost:5173';
    } catch {
        return process.env.APP_BASE_URL || process.env.APP_URL || 'http://localhost:5173';
    }
}

function makeToken(workflowId, verifierEmail) {
    const ts = Date.now();
    const payload = `${workflowId}|${verifierEmail}|${ts}`;
    const sig = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('hex');
    return Buffer.from(`${payload}|${sig}`).toString('base64url');
}

function verifyToken(token) {
    try {
        const decoded = Buffer.from(token, 'base64url').toString('utf8');
        const parts = decoded.split('|');
        if (parts.length !== 4) return null;
        const [workflowId, email, ts, sig] = parts;
        const expected = crypto.createHmac('sha256', SECRET_KEY).update(`${workflowId}|${email}|${ts}`).digest('hex');
        if (sig !== expected) return null;
        return { workflowId: parseInt(workflowId), email, timestamp: parseInt(ts) };
    } catch {
        return null;
    }
}

function getClientIp(req) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
    return req.ip || req.connection?.remoteAddress || '';
}

async function getRequesterEmail(username) {
    try {
        const r = await pool.query(
            `SELECT email FROM hub.users WHERE LOWER(TRIM(username)) = LOWER(TRIM($1)) LIMIT 1`,
            [username]
        );
        return r.rows[0]?.email || null;
    } catch {
        return null;
    }
}

async function getAgentInfo(username) {
    try {
        const r = await pool.query(
            `SELECT nom, email FROM hub_calendrier.agents_dsi WHERE LOWER(TRIM(username)) = LOWER(TRIM($1)) LIMIT 1`,
            [username]
        );
        return r.rows[0] || null;
    } catch {
        return null;
    }
}

// Référentiel des directeurs : un directeur par direction, issu des encadrants
// (/admin/param-ville → Encadrants, GET /api/admin/rh/encadrants). Mis en cache 15 min
// (l'appel déclenche des recherches AD/LDAP). Aucune table dédiée.
let directorsCache = { list: null, expiresAt: 0 };
async function getEncadrantsDirectors() {
    if (directorsCache.list && Date.now() < directorsCache.expiresAt) return directorsCache.list;
    let raw = [];
    await new Promise((resolve) => {
        const fakeRes = { status: () => fakeRes, json: (d) => { raw = Array.isArray(d) ? d : []; resolve(); } };
        Promise.resolve(encadrantsController.getEncadrants({}, fakeRes)).catch(() => resolve());
    });
    const list = raw
        .filter(e => e.role === 'directeur' && (e.direction_code || e.direction_label))
        .map(e => ({
            entity_code: e.direction_code || e.direction_label,
            entity_label: e.direction_label || '',
            director_username: e.ad_username || e.matricule || '',
            director_name: [e.prenom, e.nom].filter(Boolean).join(' ').trim() || e.nom || '',
            director_email: e.email || '',
        }));
    directorsCache = { list, expiresAt: Date.now() + 15 * 60 * 1000 };
    return list;
}

// Directeur d'une direction (par code ou libellé) ; repli sur le 1er si non précisé.
async function getDirectorForEntity(entityCode) {
    const list = await getEncadrantsDirectors();
    if (!entityCode) return list[0] || null;
    const key = String(entityCode).trim().toLowerCase();
    return list.find(d => String(d.entity_code).toLowerCase() === key
        || String(d.entity_label).toLowerCase() === key) || null;
}

// Résout un token public en workflow encore valide, ou renvoie l'erreur HTTP adaptée
// (utilisé par les routes publiques de PJ Sedit pour scoper l'accès au strict périmètre
// de ce workflow, sans exposer l'endpoint JWT /pj-share à un visiteur public).
async function resolvePublicWorkflow(token, res) {
    const decoded = verifyToken(token);
    if (!decoded) { res.status(400).json({ message: 'Lien invalide ou expiré' }); return null; }
    const wfRes = await pool.query(
        `SELECT invoice_ref, token_expires_at FROM finance.service_fait_workflows WHERE id = $1 AND token = $2`,
        [decoded.workflowId, token]
    );
    if (wfRes.rowCount === 0) { res.status(404).json({ message: 'Workflow non trouvé' }); return null; }
    const wf = wfRes.rows[0];
    if (wf.token_expires_at && new Date(wf.token_expires_at) < new Date()) {
        res.status(410).json({ message: 'Ce lien a expiré' });
        return null;
    }
    return wf;
}

// hub_telecom.invoices.invoice_number est alimenté avec le N° Fournisseur de la facture
// (colonne FACTURE_FACTIERS dans oracle.gf_oracle_facture), PAS avec son N° Interne
// (FACTURE_FACTURE) qui sert d'invoice_ref au workflow de service fait. Il faut donc
// repasser par la table Oracle pour retrouver le FACTURE_FACTIERS correspondant à
// l'invoice_ref avant de chercher une correspondance côté Telecom.
function isTelecomIntegrated(invoiceRef) {
    if (!invoiceRef) return false;
    return pool.query(
        `SELECT 1 FROM oracle.gf_oracle_facture f
         JOIN hub_telecom.invoices t ON LOWER(TRIM(t.invoice_number)) = LOWER(TRIM(f."FACTURE_FACTIERS"))
         WHERE TRIM(f."FACTURE_FACTURE") = $1 LIMIT 1`,
        [invoiceRef]
    ).then(r => r.rowCount > 0).catch(() => false);
}

const controller = {

    setSendMail,

    createWorkflow: async (req, res) => {
        try {
            const {
                invoice_ref, invoice_number, invoice_label, invoice_supplier,
                invoice_amount, invoice_section, verifier_username,
                director_mode, entity_code
            } = req.body;

            if (!invoice_ref || !verifier_username) {
                return res.status(400).json({ message: 'invoice_ref et verifier_username requis' });
            }

            if (await isTelecomIntegrated(invoice_ref)) {
                return res.status(400).json({ message: 'Cette facture est intégrée au module Telecom et ne peut pas faire l\'objet d\'une validation de service fait.' });
            }

            const agentRes = await pool.query(
                'SELECT username, nom, email FROM hub_calendrier.agents_dsi WHERE username = $1',
                [verifier_username]
            );
            if (agentRes.rowCount === 0) {
                return res.status(400).json({ message: 'Agent vérificateur non trouvé dans la liste DSI' });
            }
            const agent = agentRes.rows[0];

            const existing = await pool.query(
                `SELECT id, status FROM finance.service_fait_workflows
                 WHERE invoice_ref = $1 AND status NOT IN ('non_valide', 'ne_me_concerne_pas', 'annule')`,
                [invoice_ref]
            );
            if (existing.rowCount > 0) {
                return res.status(400).json({ message: 'Un workflow de validation est déjà en cours pour cette facture', existing_id: existing.rows[0].id });
            }

            const directorMode = ['informe', 'visa'].includes(director_mode) ? director_mode : null;
            const director = directorMode ? await getDirectorForEntity(entity_code || 'DSI') : null;

            const insResult = await pool.query(
                `INSERT INTO finance.service_fait_workflows
                 (invoice_ref, invoice_number, invoice_label, invoice_supplier, invoice_amount, invoice_section,
                  status, requested_by, verifier_username, verifier_name, verifier_email,
                  entity_code, entity_label, director_mode, director_username, director_name, director_email)
                 VALUES ($1,$2,$3,$4,$5,$6,'en_attente',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
                 RETURNING id`,
                [invoice_ref, invoice_number || '', invoice_label || '', invoice_supplier || '',
                 invoice_amount || null, invoice_section || '', req.user.username,
                 verifier_username, agent.nom || agent.username, agent.email || '',
                 entity_code || 'DSI', director ? director.entity_label || '' : '',
                 directorMode, director ? director.director_username : null,
                 director ? director.director_name : '', director ? director.director_email : '']
            );
            const workflowId = insResult.rows[0].id;

            const token = makeToken(workflowId, agent.email || '');
            const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            await pool.query(
                `UPDATE finance.service_fait_workflows SET token = $1, token_expires_at = $2 WHERE id = $3`,
                [token, expiresAt, workflowId]
            );

            await pool.query(
                `INSERT INTO finance.service_fait_historique (workflow_id, action, actor_username, actor_name, comment, actor_ip, actor_user_agent)
                 VALUES ($1, 'demande_validation', $2, $3, $4, $5, $6)`,
                [workflowId, req.user.username, req.user.username, `Vérificateur: ${agent.nom || agent.username}`, getClientIp(req), req.headers['user-agent'] || '']
            );

            const appUrl = await getAppBaseUrl();
            const verifierUrl = `${appUrl}/service-fait-verifier/${token}`;

            if (sendMailFn && agent.email) {
                const html = `
                    <p>Bonjour ${agent.nom || agent.username},</p>
                    <p>Une demande de validation du service fait a été initiée par <strong>${req.user.username}</strong> pour la facture :</p>
                    <ul>
                        <li><strong>N° facture :</strong> ${invoice_number || invoice_ref}</li>
                        <li><strong>Fournisseur :</strong> ${invoice_supplier || '-'}</li>
                        <li><strong>Libellé :</strong> ${invoice_label || '-'}</li>
                        <li><strong>Montant TTC :</strong> ${invoice_amount ? parseFloat(invoice_amount).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €' : '-'}</li>
                    </ul>
                    <p style="margin-top:16px">
                        <a href="${verifierUrl}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Valider le service fait</a>
                    </p>
                    <p style="font-size:12px;color:#94a3b8;margin-top:8px;word-break:break-all;overflow-wrap:break-word;">Ou copiez ce lien : <a href="${verifierUrl}" style="color:#6366f1;word-break:break-all;overflow-wrap:break-word;">${verifierUrl}</a></p>
                `;
                try {
                    await sendMailFn(agent.email, 'Demande de validation du service fait', html);
                } catch (e) {
                    console.error('[ServiceFait] Email send error:', e.message);
                }
            }

            res.status(201).json({ id: workflowId, token, status: 'en_attente' });
        } catch (error) {
            console.error('[ServiceFait] createWorkflow error:', error);
            res.status(500).json({ message: 'Erreur création workflow', error: error.message });
        }
    },

    // Déclaration directe du service fait par l'utilisateur : pas de circuit de
    // validation ni d'email au vérificateur. Le workflow est créé directement au
    // statut 'valide', le déclarant étant à la fois demandeur et vérificateur.
    // Un commentaire ET au moins une pièce jointe sont requis ; on applique ensuite
    // les MÊMES opérations Sedit que le circuit (FACSUIVI service fait + PV scellé).
    createSelfWorkflow: async (req, res) => {
        try {
            const {
                invoice_ref, invoice_number, invoice_label, invoice_supplier,
                invoice_amount, invoice_section, comment
            } = req.body;

            if (!invoice_ref) {
                return res.status(400).json({ message: 'invoice_ref requis' });
            }
            if (!comment || !comment.trim()) {
                return res.status(400).json({ message: 'Un commentaire est requis' });
            }
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ message: 'Au moins une pièce jointe est requise (justificatif du service fait)' });
            }

            if (await isTelecomIntegrated(invoice_ref)) {
                return res.status(400).json({ message: 'Cette facture est intégrée au module Telecom et ne peut pas faire l\'objet d\'une validation de service fait.' });
            }

            const existing = await pool.query(
                `SELECT id, status FROM finance.service_fait_workflows
                 WHERE invoice_ref = $1 AND status NOT IN ('non_valide', 'ne_me_concerne_pas', 'annule')`,
                [invoice_ref]
            );
            if (existing.rowCount > 0) {
                return res.status(400).json({ message: 'Un workflow est déjà en cours ou validé pour cette facture', existing_id: existing.rows[0].id });
            }

            const agent = await getAgentInfo(req.user.username);
            const requesterEmail = (agent && agent.email) || req.user.email || (await getRequesterEmail(req.user.username)) || '';
            const requesterName = (agent && agent.nom) || req.user.displayName || req.user.username;

            const insResult = await pool.query(
                `INSERT INTO finance.service_fait_workflows
                 (invoice_ref, invoice_number, invoice_label, invoice_supplier, invoice_amount, invoice_section,
                  status, requested_by, verifier_username, verifier_name, verifier_email,
                  decision_at, decision_comment)
                 VALUES ($1,$2,$3,$4,$5,$6,'valide',$7,$8,$9,$10,CURRENT_TIMESTAMP,$11)
                 RETURNING id`,
                [invoice_ref, invoice_number || '', invoice_label || '', invoice_supplier || '',
                 invoice_amount || null, invoice_section || '', req.user.username,
                 req.user.username, requesterName, requesterEmail, comment || '']
            );
            const workflowId = insResult.rows[0].id;

            // Pièces jointes obligatoires, enregistrées AVANT la synchro Sedit pour être
            // reprises dans le PV scellé.
            for (const file of req.files) {
                const fileResult = await storage.saveFile('service-fait-pj', String(workflowId), {
                    buffer: file.buffer,
                    originalname: file.originalname
                });
                await pool.query(
                    `INSERT INTO finance.service_fait_pieces_jointes (workflow_id, file_path, original_name, uploaded_by)
                     VALUES ($1, $2, $3, $4)`,
                    [workflowId, fileResult.dbPath, file.originalname, req.user.username]
                );
            }

            await pool.query(
                `INSERT INTO finance.service_fait_historique (workflow_id, action, actor_username, actor_name, comment, actor_ip, actor_user_agent)
                 VALUES ($1, 'declaration_directe', $2, $3, $4, $5, $6)`,
                [workflowId, req.user.username, requesterName, comment || '', getClientIp(req), req.headers['user-agent'] || '']
            );

            // Mêmes opérations Sedit que le circuit de validation.
            const wfRow = (await pool.query(`SELECT * FROM finance.service_fait_workflows WHERE id = $1`, [workflowId])).rows[0];
            const seditSync = await syncServiceFaitToSedit({ wf: wfRow, decision: 'valide', comment: comment || '' });

            res.status(201).json({ id: workflowId, status: 'valide', sedit_sync: seditSync });
        } catch (error) {
            console.error('[ServiceFait] createSelfWorkflow error:', error);
            res.status(500).json({ message: 'Erreur création service fait', error: error.message });
        }
    },

    getStatuses: async (req, res) => {
        try {
            const { invoice_refs } = req.body;
            if (!Array.isArray(invoice_refs) || invoice_refs.length === 0) {
                return res.json({});
            }
            const result = await pool.query(
                `SELECT DISTINCT ON (invoice_ref)
                        id, invoice_ref, status, verifier_name, updated_at, decision_at
                 FROM finance.service_fait_workflows
                 WHERE invoice_ref = ANY($1)
                 ORDER BY invoice_ref, updated_at DESC`,
                [invoice_refs]
            );
            const map = {};
            for (const row of result.rows) {
                map[row.invoice_ref] = {
                    workflowId: row.id,
                    status: row.status,
                    verifier_name: row.verifier_name,
                    updated_at: row.updated_at,
                    decision_at: row.decision_at
                };
            }

            // Factures déjà intégrées au module Telecom : pas de workflow possible,
            // on renvoie un pseudo-statut 'telecom' pour que le front affiche une
            // pastille au lieu du bouton "À lancer" (voir isTelecomIntegrated pour
            // l'explication du passage par FACTURE_FACTIERS plutôt que invoice_ref).
            const normalizedRefs = Array.from(new Set(invoice_refs.map(r => String(r || '').trim()).filter(Boolean)));
            if (normalizedRefs.length > 0) {
                try {
                    const telecomRes = await pool.query(
                        `SELECT DISTINCT TRIM(f."FACTURE_FACTURE") AS ref
                         FROM oracle.gf_oracle_facture f
                         JOIN hub_telecom.invoices t ON LOWER(TRIM(t.invoice_number)) = LOWER(TRIM(f."FACTURE_FACTIERS"))
                         WHERE TRIM(f."FACTURE_FACTURE") = ANY($1)`,
                        [normalizedRefs]
                    );
                    const telecomSet = new Set(telecomRes.rows.map(r => r.ref));
                    for (const ref of invoice_refs) {
                        const norm = String(ref || '').trim();
                        if (telecomSet.has(norm) && !map[ref]) {
                            map[ref] = { workflowId: null, status: 'telecom', verifier_name: null, updated_at: null, decision_at: null };
                        }
                    }
                } catch (e) {
                    console.error('[ServiceFait] getStatuses telecom check error:', e.message);
                }

                // Statuts « rapprochement » et « service fait » directement issus du circuit
                // Sedit (Oracle direct, indépendant du workflow de validation AppDSI) — voir
                // finance-share.controller.js.
                try {
                    const facsuiviMap = await getSeditFacsuiviStatus(normalizedRefs);
                    for (const ref of invoice_refs) {
                        const norm = String(ref || '').trim();
                        const info = facsuiviMap[norm];
                        if (!info) continue;
                        if (!map[ref]) {
                            map[ref] = { workflowId: null, status: null, verifier_name: null, updated_at: null, decision_at: null };
                        }
                        if (info.service_fait) {
                            map[ref].sedit_service_fait = info.service_fait.done;
                            map[ref].sedit_service_fait_date = info.service_fait.date || null;
                        }
                        if (info.rapprochement) {
                            map[ref].sedit_rapproche = info.rapprochement.done;
                        }
                        if (info.rejete) {
                            map[ref].sedit_rejete = info.rejete.done;
                            map[ref].sedit_rejete_date = info.rejete.date || null;
                        }
                        if (info.mandate) {
                            map[ref].sedit_mandate = info.mandate.done;
                        }
                    }
                } catch (e) {
                    console.error('[ServiceFait] getStatuses Sedit Facsuivi check error:', e.message);
                }
            }

            res.json(map);
        } catch (error) {
            console.error('[ServiceFait] getStatuses error:', error);
            res.status(500).json({ message: 'Erreur récupération statuts', error: error.message });
        }
    },

    // État de la/des facture(s) d'une liste de commandes (ROO Sedit) — pastille FAC
    // sur la liste des commandes : reçue / service fait / mandatée / refusée.
    getCommandeFactureStatuses: async (req, res) => {
        try {
            const { commande_ids } = req.body || {};
            if (!Array.isArray(commande_ids) || commande_ids.length === 0) return res.json({});
            const map = await financeShareController.getCommandeFactureStatus(commande_ids);
            res.json(map);
        } catch (error) {
            console.error('[ServiceFait] getCommandeFactureStatuses error:', error);
            res.status(500).json({ message: 'Erreur récupération statuts commandes', error: error.message });
        }
    },

    getWorkflow: async (req, res) => {
        try {
            const { id } = req.params;
            const wfRes = await pool.query(
                `SELECT * FROM finance.service_fait_workflows WHERE id = $1`, [id]
            );
            if (wfRes.rowCount === 0) return res.status(404).json({ message: 'Workflow non trouvé' });

            const pjRes = await pool.query(
                `SELECT * FROM finance.service_fait_pieces_jointes WHERE workflow_id = $1 ORDER BY uploaded_at`, [id]
            );
            const histRes = await pool.query(
                `SELECT * FROM finance.service_fait_historique WHERE workflow_id = $1 ORDER BY created_at`, [id]
            );

            const wf = wfRes.rows[0];
            // Lien public de validation à transmettre au vérificateur (identifie au lien
            // envoyé par e-mail, pour pouvoir le rediffuser depuis la modale de suivi).
            const appUrl = await getAppBaseUrl();
            const verifierUrl = wf.token ? `${appUrl}/service-fait-verifier/${wf.token}` : null;

            res.json({
                ...wf,
                verifier_url: verifierUrl,
                pieces_jointes: pjRes.rows,
                historique: histRes.rows
            });
        } catch (error) {
            console.error('[ServiceFait] getWorkflow error:', error);
            res.status(500).json({ message: 'Erreur récupération workflow', error: error.message });
        }
    },

    addPiecesJointes: async (req, res) => {
        try {
            const { id } = req.params;
            const wfRes = await pool.query(`SELECT id FROM finance.service_fait_workflows WHERE id = $1`, [id]);
            if (wfRes.rowCount === 0) return res.status(404).json({ message: 'Workflow non trouvé' });

            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ message: 'Aucun fichier fourni' });
            }

            const saved = [];
            for (const file of req.files) {
                const fileResult = await storage.saveFile('service-fait-pj', String(id), {
                    buffer: file.buffer,
                    originalname: file.originalname
                });
                const insRes = await pool.query(
                    `INSERT INTO finance.service_fait_pieces_jointes (workflow_id, file_path, original_name, uploaded_by)
                     VALUES ($1, $2, $3, $4) RETURNING id`,
                    [id, fileResult.dbPath, file.originalname, req.user.username]
                );
                saved.push({ id: insRes.rows[0].id, file_path: fileResult.dbPath, original_name: file.originalname });
            }

            res.json({ pieces_jointes: saved });
        } catch (error) {
            console.error('[ServiceFait] addPiecesJointes error:', error);
            res.status(500).json({ message: 'Erreur ajout PJ', error: error.message });
        }
    },

    // Ajout de pièces jointes par le vérificateur via son lien public (sans JWT) :
    // scope au seul workflow identifié par le token, et seulement tant qu'il est ouvert.
    addPublicPiecesJointes: async (req, res) => {
        try {
            const { token } = req.params;
            const decoded = verifyToken(token);
            if (!decoded) return res.status(400).json({ message: 'Lien invalide ou expiré' });

            const wfRes = await pool.query(
                `SELECT * FROM finance.service_fait_workflows WHERE id = $1 AND token = $2`,
                [decoded.workflowId, token]
            );
            if (wfRes.rowCount === 0) return res.status(404).json({ message: 'Workflow non trouvé' });
            const wf = wfRes.rows[0];
            if (wf.token_expires_at && new Date(wf.token_expires_at) < new Date()) {
                return res.status(410).json({ message: 'Ce lien a expiré' });
            }
            if (!ONGOING_STATUSES.includes(wf.status)) {
                return res.status(400).json({ message: 'Ce workflow est déjà clôturé' });
            }
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ message: 'Aucun fichier fourni' });
            }

            const saved = [];
            for (const file of req.files) {
                const fileResult = await storage.saveFile('service-fait-pj', String(wf.id), {
                    buffer: file.buffer,
                    originalname: file.originalname
                });
                const insRes = await pool.query(
                    `INSERT INTO finance.service_fait_pieces_jointes (workflow_id, file_path, original_name, uploaded_by)
                     VALUES ($1, $2, $3, $4) RETURNING id`,
                    [wf.id, fileResult.dbPath, file.originalname, wf.verifier_username || 'verificateur']
                );
                saved.push({ id: insRes.rows[0].id, file_path: fileResult.dbPath, original_name: file.originalname });
            }

            res.json({ pieces_jointes: saved });
        } catch (error) {
            console.error('[ServiceFait] addPublicPiecesJointes error:', error);
            res.status(500).json({ message: 'Erreur ajout PJ', error: error.message });
        }
    },

    deletePieceJointe: async (req, res) => {
        try {
            const { pjId } = req.params;
            const pjRes = await pool.query(
                `DELETE FROM finance.service_fait_pieces_jointes WHERE id = $1 RETURNING file_path`, [pjId]
            );
            if (pjRes.rowCount === 0) return res.status(404).json({ message: 'PJ non trouvée' });
            try { await storage.deleteFile(pjRes.rows[0].file_path); } catch (e) {}
            res.json({ success: true });
        } catch (error) {
            console.error('[ServiceFait] deletePieceJointe error:', error);
            res.status(500).json({ message: 'Erreur suppression PJ', error: error.message });
        }
    },

    getPublicByToken: async (req, res) => {
        try {
            const { token } = req.params;
            const decoded = verifyToken(token);
            if (!decoded) return res.status(400).json({ message: 'Lien invalide ou expiré' });

            const wfRes = await pool.query(
                `SELECT * FROM finance.service_fait_workflows WHERE id = $1 AND token = $2`,
                [decoded.workflowId, token]
            );
            if (wfRes.rowCount === 0) return res.status(404).json({ message: 'Workflow non trouvé' });

            const wf = wfRes.rows[0];
            if (wf.token_expires_at && new Date(wf.token_expires_at) < new Date()) {
                return res.status(410).json({ message: 'Ce lien a expiré' });
            }

            if (!ONGOING_STATUSES.includes(wf.status)) {
                return res.status(200).json({ workflow: wf, pieces_jointes: [], historique: [], closed: true });
            }

            const pjRes = await pool.query(
                `SELECT * FROM finance.service_fait_pieces_jointes WHERE workflow_id = $1 ORDER BY uploaded_at`, [wf.id]
            );
            const histRes = await pool.query(
                `SELECT * FROM finance.service_fait_historique WHERE workflow_id = $1 ORDER BY created_at`, [wf.id]
            );

            const agentsRes = await pool.query(
                `SELECT username, nom, email FROM hub_calendrier.agents_dsi WHERE username != $1 ORDER BY nom`,
                [wf.verifier_username]
            );

            res.json({
                workflow: wf,
                pieces_jointes: pjRes.rows,
                historique: histRes.rows,
                agents: agentsRes.rows
            });
        } catch (error) {
            console.error('[ServiceFait] getPublicByToken error:', error);
            res.status(500).json({ message: 'Erreur récupération', error: error.message });
        }
    },

    submitDecision: async (req, res) => {
        try {
            const { token } = req.params;
            const { decision, comment, transfer_to_username, pj_files } = req.body;

            const decoded = verifyToken(token);
            if (!decoded) return res.status(400).json({ message: 'Lien invalide ou expiré' });

            const wfRes = await pool.query(
                `SELECT * FROM finance.service_fait_workflows WHERE id = $1 AND token = $2`,
                [decoded.workflowId, token]
            );
            if (wfRes.rowCount === 0) return res.status(404).json({ message: 'Workflow non trouvé' });

            const wf = wfRes.rows[0];
            if (wf.token_expires_at && new Date(wf.token_expires_at) < new Date()) {
                return res.status(410).json({ message: 'Ce lien a expiré' });
            }
            if (!ONGOING_STATUSES.includes(wf.status)) {
                return res.status(400).json({ message: 'Ce workflow est déjà clôturé' });
            }

            const validDecisions = ['valide', 'valide_avec_reserves', 'non_valide', 'ne_me_concerne_pas', 'transfere', 'en_pause'];
            if (!validDecisions.includes(decision)) {
                return res.status(400).json({ message: 'Décision invalide' });
            }

            if (['valide_avec_reserves', 'non_valide', 'en_pause'].includes(decision) && (!comment || !comment.trim())) {
                return res.status(400).json({ message: 'Un commentaire (motif) est requis pour cette décision' });
            }

            // Quelle que soit la décision, il faut au moins une pièce jointe (déjà
            // présente sur le workflow, ou ajoutée juste avant via /pieces-jointes)
            // ou un motif — même pour une simple validation du service fait.
            if (!comment || !comment.trim()) {
                const pjCountRes = await pool.query(
                    `SELECT COUNT(*)::int AS n FROM finance.service_fait_pieces_jointes WHERE workflow_id = $1`,
                    [wf.id]
                );
                if (pjCountRes.rows[0].n === 0) {
                    return res.status(400).json({ message: 'Une pièce jointe ou un motif est requis pour valider cette décision' });
                }
            }

            let newStatus = decision;
            let newVerifierUsername = wf.verifier_username;
            let newVerifierName = wf.verifier_name;
            let newVerifierEmail = wf.verifier_email;
            let newToken = null;

            if (decision === 'transfere') {
                if (!transfer_to_username) {
                    return res.status(400).json({ message: 'transfer_to_username requis pour un transfert' });
                }
                const agentRes = await pool.query(
                    `SELECT username, nom, email FROM hub_calendrier.agents_dsi WHERE username = $1`,
                    [transfer_to_username]
                );
                if (agentRes.rowCount === 0) {
                    return res.status(400).json({ message: 'Agent destinataire non trouvé' });
                }
                const newAgent = agentRes.rows[0];
                newVerifierUsername = newAgent.username;
                newVerifierName = newAgent.nom || newAgent.username;
                newVerifierEmail = newAgent.email || '';
                newStatus = 'transfere';
                newToken = makeToken(wf.id, newVerifierEmail);
            }

            const actionLabels = {
                'valide': 'validation',
                'valide_avec_reserves': 'validation_reserves',
                'non_valide': 'non_validation',
                'ne_me_concerne_pas': 'ne_me_concerne_pas',
                'transfere': 'transfert',
                'en_pause': 'mise_en_pause'
            };

            await pool.query(
                `UPDATE finance.service_fait_workflows SET
                    status = $1,
                    decision_at = CASE WHEN $1 IN ('valide','valide_avec_reserves','non_valide','ne_me_concerne_pas') THEN CURRENT_TIMESTAMP ELSE decision_at END,
                    decision_comment = $2,
                    verifier_username = $3,
                    verifier_name = $4,
                    verifier_email = $5,
                    transfer_to_username = CASE WHEN $1 = 'transfere' THEN $3 ELSE transfer_to_username END,
                    transfer_to_name = CASE WHEN $1 = 'transfere' THEN $4 ELSE transfer_to_name END,
                    transfer_to_email = CASE WHEN $1 = 'transfere' THEN $5 ELSE transfer_to_email END,
                    token = COALESCE($6, token),
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = $7`,
                [newStatus, comment || '', newVerifierUsername, newVerifierName, newVerifierEmail, newToken, wf.id]
            );

            await pool.query(
                `INSERT INTO finance.service_fait_historique (workflow_id, action, actor_username, actor_name, comment, actor_ip, actor_user_agent)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [wf.id, actionLabels[decision], wf.verifier_username, wf.verifier_name, comment || '', getClientIp(req), req.headers['user-agent'] || '']
            );

            // Retour positif du vérificateur : on certifie le service fait DIRECTEMENT
            // dans Sedit (écriture Oracle) et on y pousse le PV scellé (AC interne) comme
            // pièce jointe de la facture — le tout journalisé pour être réversible.
            // EXCEPTION : si un visa du directeur est requis, l'écriture Sedit est
            // différée jusqu'à ce visa (le PV doit embarquer les DEUX valideurs).
            const isPositive = ['valide', 'valide_avec_reserves'].includes(decision);
            const needsDirectorVisa = isPositive && wf.director_mode === 'visa' && wf.director_email;

            let seditSync = null;
            let directorVisaUrl = null;
            if (needsDirectorVisa) {
                const directorToken = makeToken(wf.id, wf.director_email);
                const dirExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                await pool.query(
                    `UPDATE finance.service_fait_workflows
                     SET status = 'en_attente_visa', director_status = 'en_attente',
                         director_token = $1, director_token_expires_at = $2, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $3`,
                    [directorToken, dirExpires, wf.id]
                );
                newStatus = 'en_attente_visa';
                directorVisaUrl = `${await getAppBaseUrl()}/service-fait-visa/${directorToken}`;
            } else if (isPositive) {
                seditSync = await syncServiceFaitToSedit({ wf, decision, comment });
            }

            const appUrl = await getAppBaseUrl();
            const subjectMap = {
                'valide': 'Service fait validé',
                'valide_avec_reserves': 'Service fait validé avec réserves',
                'non_valide': 'Service fait non validé',
                'ne_me_concerne_pas': 'Validation retournée - ne vous concerne pas',
                'transfere': 'Nouvelle demande de validation du service fait',
                'en_pause': 'Service fait mis en pause'
            };

            if (decision === 'transfere' && newToken && sendMailFn && newVerifierEmail) {
                const verifierUrl = `${appUrl}/service-fait-verifier/${newToken}`;
                const html = `
                    <p>Bonjour ${newVerifierName},</p>
                    <p>La demande de validation du service fait pour la facture <strong>${wf.invoice_number || wf.invoice_ref}</strong> vous a été transférée par ${wf.verifier_name}.</p>
                    <ul>
                        <li><strong>Fournisseur :</strong> ${wf.invoice_supplier || '-'}</li>
                        <li><strong>Montant TTC :</strong> ${wf.invoice_amount ? parseFloat(wf.invoice_amount).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €' : '-'}</li>
                    </ul>
                    ${comment ? `<p><em>Commentaire du transfert : ${comment}</em></p>` : ''}
                    <p style="margin-top:16px">
                        <a href="${verifierUrl}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Valider le service fait</a>
                    </p>
                    <p style="font-size:12px;color:#94a3b8;margin-top:8px;word-break:break-all;overflow-wrap:break-word;">Ou copiez ce lien : <a href="${verifierUrl}" style="color:#6366f1;word-break:break-all;overflow-wrap:break-word;">${verifierUrl}</a></p>
                `;
                try {
                    await sendMailFn(newVerifierEmail, subjectMap[decision], html);
                } catch (e) {
                    console.error('[ServiceFait] Transfer email error:', e.message);
                }
            }

            if (decision !== 'transfere' && sendMailFn) {
                const requesterEmail = await getRequesterEmail(wf.requested_by);
                if (requesterEmail) {
                    const statusLabels = {
                        'valide': '✅ Validé',
                        'valide_avec_reserves': '⚠️ Validé avec réserves',
                        'non_valide': '❌ Non validé',
                        'ne_me_concerne_pas': '🔄 Retourné (ne concerne pas le vérificateur)',
                        'en_pause': '⏸️ Mis en pause'
                    };
                    const html = `
                        <p>Bonjour ${wf.requested_by},</p>
                        <p>La validation du service fait pour la facture <strong>${wf.invoice_number || wf.invoice_ref}</strong> a reçu une réponse :</p>
                        <p style="font-size:16px;font-weight:600;margin:12px 0">${statusLabels[decision] || decision}</p>
                        ${comment ? `<p><strong>Commentaire :</strong> ${comment}</p>` : ''}
                        <p style="font-size:12px;color:#94a3b8">Répondu par ${wf.verifier_name}</p>
                    `;
                    try {
                        await sendMailFn(requesterEmail, subjectMap[decision], html);
                    } catch (e) {
                        console.error('[ServiceFait] Notification email error:', e.message);
                    }
                }
            }

            // Directeur : soit on l'invite à viser (mode visa, après le valideur
            // principal), soit on l'informe simplement de l'issue (mode informé).
            if (sendMailFn && wf.director_email) {
                try {
                    if (needsDirectorVisa && directorVisaUrl) {
                        const html = `
                            <p>Bonjour ${wf.director_name || wf.director_username || ''},</p>
                            <p>Le service fait de la facture <strong>${wf.invoice_number || wf.invoice_ref}</strong> a été validé par ${wf.verifier_name || wf.verifier_username}. Votre <strong>visa</strong> est requis pour finaliser la certification dans Sedit.</p>
                            <ul>
                                <li><strong>Fournisseur :</strong> ${wf.invoice_supplier || '-'}</li>
                                <li><strong>Montant TTC :</strong> ${wf.invoice_amount ? parseFloat(wf.invoice_amount).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €' : '-'}</li>
                            </ul>
                            <p style="margin-top:16px">
                                <a href="${directorVisaUrl}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Viser le service fait</a>
                            </p>
                            <p style="font-size:12px;color:#94a3b8;margin-top:8px;word-break:break-all;overflow-wrap:break-word;">Ou copiez ce lien : <a href="${directorVisaUrl}" style="color:#6366f1;word-break:break-all;overflow-wrap:break-word;">${directorVisaUrl}</a></p>
                        `;
                        await sendMailFn(wf.director_email, 'Visa du service fait requis', html);
                    } else if (wf.director_mode === 'informe') {
                        const statusLabels = {
                            'valide': '✅ Validé', 'valide_avec_reserves': '⚠️ Validé avec réserves',
                            'non_valide': '❌ Non validé', 'ne_me_concerne_pas': '🔄 Retourné',
                            'en_pause': '⏸️ Mis en pause',
                        };
                        const html = `
                            <p>Bonjour ${wf.director_name || wf.director_username || ''},</p>
                            <p>Pour information, le service fait de la facture <strong>${wf.invoice_number || wf.invoice_ref}</strong> a reçu la décision suivante :</p>
                            <p style="font-size:16px;font-weight:600;margin:12px 0">${statusLabels[decision] || decision}</p>
                            ${comment ? `<p><strong>Commentaire :</strong> ${comment}</p>` : ''}
                            <p style="font-size:12px;color:#94a3b8">Décision de ${wf.verifier_name || wf.verifier_username}</p>
                        `;
                        await sendMailFn(wf.director_email, `${subjectMap[decision]} — information`, html);
                    }
                } catch (e) {
                    console.error('[ServiceFait] Director email error:', e.message);
                }
            }

            res.json({ success: true, status: newStatus, sedit_sync: seditSync, director_visa_url: directorVisaUrl });
        } catch (error) {
            console.error('[ServiceFait] submitDecision error:', error);
            res.status(500).json({ message: 'Erreur soumission décision', error: error.message });
        }
    },

    cancelWorkflow: async (req, res) => {
        try {
            const { id } = req.params;
            const { comment } = req.body || {};

            const wfRes = await pool.query(`SELECT * FROM finance.service_fait_workflows WHERE id = $1`, [id]);
            if (wfRes.rowCount === 0) return res.status(404).json({ message: 'Workflow non trouvé' });
            const wf = wfRes.rows[0];

            if (!ONGOING_STATUSES.includes(wf.status)) {
                return res.status(400).json({ message: 'Ce processus est déjà terminé, il ne peut plus être annulé' });
            }

            await pool.query(
                `UPDATE finance.service_fait_workflows SET status = 'annule', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                [id]
            );

            await pool.query(
                `INSERT INTO finance.service_fait_historique (workflow_id, action, actor_username, actor_name, comment, actor_ip, actor_user_agent)
                 VALUES ($1, 'annulation', $2, $3, $4, $5, $6)`,
                [id, req.user.username, req.user.username, comment || '', getClientIp(req), req.headers['user-agent'] || '']
            );

            if (sendMailFn && wf.requested_by !== req.user.username) {
                const requesterEmail = await getRequesterEmail(wf.requested_by);
                if (requesterEmail) {
                    const html = `
                        <p>Bonjour ${wf.requested_by},</p>
                        <p>Le processus de validation du service fait pour la facture <strong>${wf.invoice_number || wf.invoice_ref}</strong> a été annulé par <strong>${req.user.username}</strong>.</p>
                        ${comment ? `<p><strong>Motif :</strong> ${comment}</p>` : ''}
                    `;
                    try {
                        await sendMailFn(requesterEmail, 'Processus de validation du service fait annulé', html);
                    } catch (e) {
                        console.error('[ServiceFait] Cancel notification email error:', e.message);
                    }
                }
            }

            res.json({ success: true, status: 'annule' });
        } catch (error) {
            console.error('[ServiceFait] cancelWorkflow error:', error);
            res.status(500).json({ message: 'Erreur annulation workflow', error: error.message });
        }
    },

    // Pièces jointes Sedit de la facture concernée, consultables par le vérificateur avant
    // sa décision — remplace l'ancien upload manuel de la facture (voir invoice_ref).
    getPublicDocuments: async (req, res) => {
        try {
            const { token } = req.params;
            const wf = await resolvePublicWorkflow(token, res);
            if (!wf) return;
            if (!wf.invoice_ref) return res.json({ numero: '', documents: [] });
            const documents = await financeShareController.buildFactureDocumentsList(
                wf.invoice_ref, `/api/finance/service-fait/public/${token}`
            );
            res.json({ numero: wf.invoice_ref, documents });
        } catch (error) {
            console.error('[ServiceFait] getPublicDocuments error:', error);
            res.status(500).json({ message: 'Erreur récupération documents', error: error.message });
        }
    },

    getPublicDocumentFile: async (req, res) => {
        try {
            const { token, docId } = req.params;
            const wf = await resolvePublicWorkflow(token, res);
            if (!wf) return;
            await financeShareController.streamFactureDocumentFile(wf.invoice_ref, docId, res);
        } catch (error) {
            console.error('[ServiceFait] getPublicDocumentFile error:', error);
            res.status(500).json({ message: 'Erreur récupération document', error: error.message });
        }
    },

    // Liste des directeurs par direction (référentiel encadrants). Alimente le choix
    // « aucun / informé / avec visa » du formulaire de lancement.
    getDirectors: async (req, res) => {
        try {
            res.json(await getEncadrantsDirectors());
        } catch (error) {
            console.error('[ServiceFait] getDirectors error:', error);
            res.status(500).json({ message: 'Erreur récupération directeurs', error: error.message });
        }
    },

    // Vue publique du workflow pour le directeur (lien de visa, sans JWT).
    getPublicDirectorByToken: async (req, res) => {
        try {
            const { token } = req.params;
            const decoded = verifyToken(token);
            if (!decoded) return res.status(400).json({ message: 'Lien invalide ou expiré' });
            const wfRes = await pool.query(
                `SELECT * FROM finance.service_fait_workflows WHERE id = $1 AND director_token = $2`,
                [decoded.workflowId, token]
            );
            if (wfRes.rowCount === 0) return res.status(404).json({ message: 'Workflow non trouvé' });
            const wf = wfRes.rows[0];
            if (wf.director_token_expires_at && new Date(wf.director_token_expires_at) < new Date()) {
                return res.status(410).json({ message: 'Ce lien a expiré' });
            }
            const pjRes = await pool.query(
                `SELECT * FROM finance.service_fait_pieces_jointes WHERE workflow_id = $1 ORDER BY uploaded_at`, [wf.id]
            );
            const closed = !!(wf.director_status && wf.director_status !== 'en_attente');
            res.json({ workflow: wf, pieces_jointes: pjRes.rows, closed });
        } catch (error) {
            console.error('[ServiceFait] getPublicDirectorByToken error:', error);
            res.status(500).json({ message: 'Erreur récupération', error: error.message });
        }
    },

    // Décision du directeur sur son lien de visa : 'valide' → le PV scellé (embarquant
    // les deux valideurs) est poussé dans Sedit ; 'non_valide' → workflow refusé.
    submitDirectorDecision: async (req, res) => {
        try {
            const { token } = req.params;
            const { decision, comment } = req.body;
            const decoded = verifyToken(token);
            if (!decoded) return res.status(400).json({ message: 'Lien invalide ou expiré' });
            const wfRes = await pool.query(
                `SELECT * FROM finance.service_fait_workflows WHERE id = $1 AND director_token = $2`,
                [decoded.workflowId, token]
            );
            if (wfRes.rowCount === 0) return res.status(404).json({ message: 'Workflow non trouvé' });
            const wf = wfRes.rows[0];
            if (wf.director_token_expires_at && new Date(wf.director_token_expires_at) < new Date()) {
                return res.status(410).json({ message: 'Ce lien a expiré' });
            }
            if (wf.status !== 'en_attente_visa' || wf.director_status !== 'en_attente') {
                return res.status(400).json({ message: 'Ce visa a déjà été traité' });
            }
            if (!['valide', 'non_valide'].includes(decision)) {
                return res.status(400).json({ message: 'Décision invalide' });
            }
            if (decision === 'non_valide' && (!comment || !comment.trim())) {
                return res.status(400).json({ message: 'Un motif est requis pour refuser' });
            }

            const actorUsername = wf.director_username || 'directeur';
            const actorName = wf.director_name || '';
            const action = decision === 'valide' ? 'visa_directeur' : 'refus_directeur';
            await pool.query(
                `UPDATE finance.service_fait_workflows
                 SET status = $1, director_status = $2, director_decision_at = CURRENT_TIMESTAMP,
                     director_comment = $3, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $4`,
                [decision === 'valide' ? 'valide' : 'non_valide', decision, comment || '', wf.id]
            );
            await pool.query(
                `INSERT INTO finance.service_fait_historique (workflow_id, action, actor_username, actor_name, comment, actor_ip, actor_user_agent)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [wf.id, action, actorUsername, actorName, comment || '', getClientIp(req), req.headers['user-agent'] || '']
            );

            let seditSync = null;
            if (decision === 'valide') {
                const wfFresh = (await pool.query(`SELECT * FROM finance.service_fait_workflows WHERE id = $1`, [wf.id])).rows[0];
                seditSync = await syncServiceFaitToSedit({ wf: wfFresh, decision: 'valide', comment: comment || '' });
            }

            if (sendMailFn) {
                const requesterEmail = await getRequesterEmail(wf.requested_by);
                if (requesterEmail) {
                    const html = decision === 'valide'
                        ? `<p>Bonjour ${wf.requested_by},</p><p>Le service fait de la facture <strong>${wf.invoice_number || wf.invoice_ref}</strong> a été visé par le directeur ${actorName} et certifié dans Sedit.</p>${comment ? `<p><strong>Commentaire :</strong> ${comment}</p>` : ''}`
                        : `<p>Bonjour ${wf.requested_by},</p><p>Le directeur ${actorName} n'a pas visé le service fait de la facture <strong>${wf.invoice_number || wf.invoice_ref}</strong>.</p>${comment ? `<p><strong>Motif :</strong> ${comment}</p>` : ''}`;
                    try {
                        await sendMailFn(requesterEmail, decision === 'valide' ? 'Service fait visé par le directeur' : 'Service fait non visé par le directeur', html);
                    } catch (e) { console.error('[ServiceFait] director decision requester email:', e.message); }
                }
            }

            res.json({ success: true, status: decision === 'valide' ? 'valide' : 'non_valide', sedit_sync: seditSync });
        } catch (error) {
            console.error('[ServiceFait] submitDirectorDecision error:', error);
            res.status(500).json({ message: 'Erreur soumission visa', error: error.message });
        }
    },

    // Journal des écritures Sedit faites par AppDSI (admin) — permet de vérifier et défaire.
    listSeditWrites: async (req, res) => {
        try {
            const writes = await seditPj.listSeditWrites({
                invoiceRef: req.query.invoice_ref,
                workflowId: req.query.workflow_id,
                limit: req.query.limit,
            });
            res.json({ writes });
        } catch (error) {
            console.error('[ServiceFait] listSeditWrites error:', error);
            res.status(500).json({ message: 'Erreur récupération écritures Sedit', error: error.message });
        }
    },

    // Undo d'une écriture Sedit journalisée (admin).
    undoSeditWrite: async (req, res) => {
        try {
            const result = await seditPj.undoSeditWrite(req.params.logId, req.user.username);
            res.json(result);
        } catch (error) {
            console.error('[ServiceFait] undoSeditWrite error:', error);
            res.status(error.status || 500).json({ message: error.message });
        }
    }
};

// Exposé pour permettre le rattrapage manuel d'une synchro Sedit (ex. décision déjà
// enregistrée mais écriture Sedit échouée) — cf. scripts/sedit_sf_apply.js.
controller.syncServiceFaitToSedit = syncServiceFaitToSedit;

module.exports = controller;
