const { pool, getSqlite } = require('../../../shared/database');
const storage = require('../../../shared/storage');
const crypto = require('crypto');
const { SECRET_KEY } = require('../../../shared/config');

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

function isTelecomIntegrated(invoiceRef) {
    if (!invoiceRef) return false;
    return pool.query(
        `SELECT 1 FROM hub_telecom.invoices WHERE LOWER(TRIM(invoice_number)) = LOWER(TRIM($1)) LIMIT 1`,
        [invoiceRef]
    ).then(r => r.rowCount > 0).catch(() => false);
}

const controller = {

    setSendMail,

    createWorkflow: async (req, res) => {
        try {
            const {
                invoice_ref, invoice_number, invoice_label, invoice_supplier,
                invoice_amount, invoice_section, verifier_username
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

            const insResult = await pool.query(
                `INSERT INTO finance.service_fait_workflows
                 (invoice_ref, invoice_number, invoice_label, invoice_supplier, invoice_amount, invoice_section,
                  status, requested_by, verifier_username, verifier_name, verifier_email)
                 VALUES ($1,$2,$3,$4,$5,$6,'en_attente',$7,$8,$9,$10)
                 RETURNING id`,
                [invoice_ref, invoice_number || '', invoice_label || '', invoice_supplier || '',
                 invoice_amount || null, invoice_section || '', req.user.username,
                 verifier_username, agent.nom || agent.username, agent.email || '']
            );
            const workflowId = insResult.rows[0].id;

            const token = makeToken(workflowId, agent.email || '');
            const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            await pool.query(
                `UPDATE finance.service_fait_workflows SET token = $1, token_expires_at = $2 WHERE id = $3`,
                [token, expiresAt, workflowId]
            );

            if (req.file) {
                const saved = await storage.saveFile('service-fait', String(workflowId), {
                    buffer: req.file.buffer,
                    originalname: req.file.originalname
                });
                await pool.query(
                    `UPDATE finance.service_fait_workflows SET file_path = $1 WHERE id = $2`,
                    [saved.dbPath, workflowId]
                );
            }

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
                    <p style="font-size:12px;color:#94a3b8;margin-top:8px;">Ou copiez ce lien : ${verifierUrl}</p>
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
            res.json(map);
        } catch (error) {
            console.error('[ServiceFait] getStatuses error:', error);
            res.status(500).json({ message: 'Erreur récupération statuts', error: error.message });
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

            res.json({
                ...wfRes.rows[0],
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

            if (!['en_attente', 'en_cours', 'transfere'].includes(wf.status)) {
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
            if (!['en_attente', 'en_cours', 'transfere'].includes(wf.status)) {
                return res.status(400).json({ message: 'Ce workflow est déjà clôturé' });
            }

            const validDecisions = ['valide', 'valide_avec_reserves', 'non_valide', 'ne_me_concerne_pas', 'transfere'];
            if (!validDecisions.includes(decision)) {
                return res.status(400).json({ message: 'Décision invalide' });
            }

            if (['valide_avec_reserves', 'non_valide'].includes(decision) && (!comment || !comment.trim())) {
                return res.status(400).json({ message: 'Un commentaire est requis pour cette décision' });
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
                'transfere': 'transfert'
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

            const appUrl = await getAppBaseUrl();
            const subjectMap = {
                'valide': 'Service fait validé',
                'valide_avec_reserves': 'Service fait validé avec réserves',
                'non_valide': 'Service fait non validé',
                'ne_me_concerne_pas': 'Validation retournée - ne vous concerne pas',
                'transfere': 'Nouvelle demande de validation du service fait'
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
                    <p style="font-size:12px;color:#94a3b8;margin-top:8px;">Ou copiez ce lien : ${verifierUrl}</p>
                `;
                try {
                    await sendMailFn(newVerifierEmail, subjectMap[decision], html);
                } catch (e) {
                    console.error('[ServiceFait] Transfer email error:', e.message);
                }
            }

            if (decision !== 'transfere' && sendMailFn) {
                const reqUserRes = await pool.query(
                    `SELECT email FROM hub.users WHERE LOWER(TRIM(username)) = LOWER(TRIM($1)) LIMIT 1`,
                    [wf.requested_by]
                );
                const requesterEmail = reqUserRes.rows[0]?.email;
                if (requesterEmail) {
                    const statusLabels = {
                        'valide': '✅ Validé',
                        'valide_avec_reserves': '⚠️ Validé avec réserves',
                        'non_valide': '❌ Non validé',
                        'ne_me_concerne_pas': '🔄 Retourné (ne concerne pas le vérificateur)'
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

            res.json({ success: true, status: newStatus });
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

            if (!['en_attente', 'en_cours', 'transfere'].includes(wf.status)) {
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

            res.json({ success: true, status: 'annule' });
        } catch (error) {
            console.error('[ServiceFait] cancelWorkflow error:', error);
            res.status(500).json({ message: 'Erreur annulation workflow', error: error.message });
        }
    }
};

module.exports = controller;
