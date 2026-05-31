const fs = require('fs');
const path = require('path');
const { pgDb } = require('../../shared/database');
const storage = require('../../shared/storage');
const { isSuperAdmin, isAdminLike } = require('../../shared/middleware');

const MODULE = 'rencontres';

// Forward declaration - sendMail will be injected from server.js
let sendMailFn = null;
module.exports.setSendMail = (fn) => { sendMailFn = fn; };

module.exports = {
    setSendMail: (fn) => { sendMailFn = fn; },

    // POST: Générer les réunions pour les demandes non associées
    generate: async (req, res) => {
        try {
            const demandesNonAssociees = await pgDb.all(`
                SELECT DISTINCT direction, DATE(date_reunion) as date_reunion
                FROM rencontres_budgetaires
                WHERE reunion_id IS NULL AND direction IS NOT NULL
                ORDER BY direction, date_reunion
            `);

            if (demandesNonAssociees.length === 0) {
                return res.json({ message: 'Aucune demande non associée trouvée', reunions_created: 0 });
            }

            const username = req.user?.username || 'unknown';
            const reunionsCreated = [];

            for (const demande of demandesNonAssociees) {
                const { direction, date_reunion } = demande;
                const annee = date_reunion ? new Date(date_reunion).getFullYear() : new Date().getFullYear();
                const dateFormatted = date_reunion ? new Date(date_reunion).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

                const reunionResult = await pgDb.run(
                    `INSERT INTO rencontres_reunions (titre, date_reunion, annee, lieu, statut, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
                    [`Réunion ${direction} du ${dateFormatted}`, date_reunion, annee, '', 'planifiée', username]
                );

                const reunionId = reunionResult.lastID;
                const updateResult = await pgDb.run(
                    `UPDATE rencontres_budgetaires SET reunion_id = ? WHERE direction = ? AND DATE(date_reunion) = ? AND reunion_id IS NULL`,
                    [reunionId, direction, date_reunion]
                );

                reunionsCreated.push({ reunion_id: reunionId, direction, date_reunion, demandes_associees: updateResult.changes });
            }

            res.json({ message: 'Réunions générées avec succès', reunions_created: reunionsCreated.length, details: reunionsCreated });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // GET: Lister toutes les réunions
    getAll: async (req, res) => {
        try {
            const { source } = req.query;
            let sql = `
                SELECT r.*, COUNT(DISTINCT p.id) as participant_count, COUNT(DISTINCT a.id) as attachment_count
                FROM rencontres_reunions r
                LEFT JOIN reunion_participants p ON r.id = p.reunion_id
                LEFT JOIN reunion_attachments a ON r.id = a.reunion_id
            `;
            const params = [];
            if (source) {
                sql += ' WHERE r.source = ?';
                params.push(source);
            }
            sql += ' GROUP BY r.id ORDER BY r.date_reunion DESC';
            const reunions = await pgDb.all(sql, params);
            res.json(reunions || []);
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // POST: Créer une nouvelle réunion
    create: async (req, res) => {
        try {
            const { titre, date_reunion, annee, lieu, description, releve_decision, liste_taches, statut, participants, source } = req.body;
            const username = req.user?.username || 'unknown';

            const result = await pgDb.run(
                `INSERT INTO rencontres_reunions (titre, date_reunion, annee, lieu, description, releve_decision, liste_taches, statut, created_by, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [titre, date_reunion, annee || new Date().getFullYear(), lieu, description, releve_decision || null, liste_taches || null, statut || 'planifiée', username, source || 'rencontres_budgetaires']
            );

            const reunionId = result.lastID;
            const addedUsernames = new Set();
            if (Array.isArray(participants) && participants.length > 0) {
                for (const p of participants) {
                    await pgDb.run(
                        `INSERT INTO reunion_participants (reunion_id, nom, prenom, email, service, direction, type_presence, statut_presence, ad_username, commentaire) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [reunionId, p.nom, p.prenom || '', p.email || '', p.service || '', p.direction || '', p.type_presence || 'metier', p.statut_presence || 'present', p.ad_username || null, p.commentaire || null]
                    );
                    if (p.ad_username) addedUsernames.add(p.ad_username);
                }
            }

            // Auto-ajouter le créateur comme participant s'il n'est pas déjà présent
            if (!addedUsernames.has(username)) {
                const userInfo = await pgDb.get('SELECT displayName, email FROM hub.users WHERE username=?', [username]);
                if (userInfo) {
                    const nameParts = (userInfo.displayName || username).split(' ');
                    const prenom = nameParts[0] || '';
                    const nom = nameParts.slice(1).join(' ') || username;
                    await pgDb.run(
                        `INSERT INTO reunion_participants (reunion_id, nom, prenom, email, type_presence, statut_presence, ad_username) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [reunionId, nom, prenom, userInfo.email || null, 'dsi', 'present', username]
                    );
                }
            }

            const reunion = await pgDb.get('SELECT * FROM rencontres_reunions WHERE id=?', [reunionId]);
            res.status(201).json(reunion);
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // GET: Récupérer une réunion spécifique
    getById: async (req, res) => {
        try {
            const { id } = req.params;
            const reunion = await pgDb.get(`
                SELECT r.*, tm.id as transcript_id 
                FROM rencontres_reunions r 
                LEFT JOIN transcript_meetings tm ON tm.reunion_id = r.id 
                WHERE r.id=?
            `, [id]);
            if (!reunion) return res.status(404).json({ error: 'Réunion non trouvée' });

            reunion.participants = await pgDb.all('SELECT * FROM reunion_participants WHERE reunion_id=? ORDER BY nom', [id]);
            reunion.attachments = await pgDb.all('SELECT * FROM reunion_attachments WHERE reunion_id=? ORDER BY created_at DESC', [id]);
            reunion.demandes = await pgDb.all('SELECT * FROM rencontres_budgetaires WHERE reunion_id=? ORDER BY date_reunion DESC', [id]);
            res.json(reunion);
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // POST: Envoyer le compte rendu
    sendCompteRendu: async (req, res) => {
        try {
            const { id } = req.params;
            const reunion = await pgDb.get('SELECT * FROM rencontres_reunions WHERE id=?', [id]);
            if (!reunion) return res.status(404).json({ error: 'Réunion non trouvée' });

            // Récupérer les infos projet / comité liés
            const lienProjet = await pgDb.get(`
                SELECT pj.titre as projet_titre, pj.code as projet_code, pc.nom as comite_nom
                FROM projet_reunions pr
                LEFT JOIN projets pj ON pj.id = pr.projet_id
                LEFT JOIN projet_comites pc ON pc.id = pr.comite_id
                WHERE pr.reunion_id = ?
            `, [id]);

            const participants = await pgDb.all('SELECT * FROM reunion_participants WHERE reunion_id=? ORDER BY nom', [id]);
            const demandes = await pgDb.all('SELECT * FROM rencontres_budgetaires WHERE reunion_id=? ORDER BY direction, service, titre', [id]);

            // Grouper les demandes par direction puis service
            const byDir = {};
            for (const d of demandes) {
                const dir = d.direction || 'Non spécifié';
                const svc = d.service || '';
                if (!byDir[dir]) byDir[dir] = {};
                if (!byDir[dir][svc]) byDir[dir][svc] = [];
                byDir[dir][svc].push(d);
            }

            const arbitrageBadge = (a) => {
                if (!a) return '<span style="color:#94a3b8">—</span>';
                const isOk = a === 'OK DSI' || a === 'OK';
                const color = isOk ? '#1d4ed8' : a === 'Refusé' ? '#dc2626' : '#92400e';
                const bg = isOk ? '#dbeafe' : a === 'Refusé' ? '#fee2e2' : '#fef3c7';
                return `<span style="padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700;background:${bg};color:${color}">${a}</span>`;
            };

            let demandesHtml = '';
            if (demandes.length === 0) {
                demandesHtml = '<p style="color:#94a3b8;font-style:italic">Aucune demande associée à cette réunion.</p>';
            } else {
                for (const [dir, services] of Object.entries(byDir)) {
                    demandesHtml += `<tr><td colspan="2" style="padding:8px 10px 6px;background:#334155;color:#e2e8f0;font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:0.06em">${dir}</td></tr>`;
                    for (const [svc, items] of Object.entries(services)) {
                        if (svc) demandesHtml += `<tr><td colspan="2" style="padding:4px 18px 3px;background:#f1f5f9;font-weight:700;color:#0284c7;font-size:11px;text-transform:uppercase;letter-spacing:0.04em">${svc}</td></tr>`;
                        for (const d of items) {
                            const check = d.statut === 'effectuée' ? '✅ ' : '';
                            demandesHtml += `<tr style="border-bottom:1px solid #f1f5f9;background:${d.statut === 'effectuée' ? '#f0fdf4' : 'white'}">
                                <td style="padding:8px 12px;color:#1e293b;font-weight:600">${check}${d.titre || '—'}</td>
                                <td style="padding:8px 12px;color:#475569;font-size:12px">${d.type || '—'}</td>
                            </tr>`;
                        }
                    }
                }
            }

            const dateStr = reunion.date_reunion ? new Date(reunion.date_reunion).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';

            // Participants groupés par statut
            const presents = participants.filter(p => p.statut_presence === 'present');
            const excuses = participants.filter(p => p.statut_presence === 'excuse');
            const participantsHtml = `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
  <tr><td style="padding:10px 14px;background:#f8fafc;font-weight:700;color:#475569;width:30%;border-bottom:1px solid #e2e8f0">🗓️ Date</td>
      <td style="padding:10px 14px;color:#1e293b;border-bottom:1px solid #e2e8f0">${dateStr}${reunion.lieu ? ' — ' + reunion.lieu : ''}</td></tr>
  <tr><td style="padding:10px 14px;background:#f8fafc;font-weight:700;color:#475569;border-bottom:1px solid #e2e8f0">👥 Présents (${presents.length})</td>
      <td style="padding:10px 14px;color:#1e293b;border-bottom:1px solid #e2e8f0">${presents.length > 0 ? presents.map(p => `<span style="display:inline-block;padding:2px 8px;background:#dcfce7;color:#16a34a;border-radius:4px;font-weight:600;margin:1px 2px">${p.prenom ? p.prenom + ' ' : ''}${p.nom}${p.service ? ' (' + p.service + ')' : ''}</span>`).join(' ') : '<em style="color:#94a3b8">Aucun</em>'}</td></tr>
  <tr><td style="padding:10px 14px;background:#f8fafc;font-weight:700;color:#475569;border-bottom:1px solid #e2e8f0">❌ Excusés (${excuses.length})</td>
      <td style="padding:10px 14px;color:#1e293b;border-bottom:1px solid #e2e8f0">${excuses.length > 0 ? excuses.map(p => `<span style="display:inline-block;padding:2px 8px;background:#fee2e2;color:#dc2626;border-radius:4px;font-weight:600;margin:1px 2px">${p.prenom ? p.prenom + ' ' : ''}${p.nom}${p.service ? ' (' + p.service + ')' : ''}</span>`).join(' ') : '<em style="color:#94a3b8">Aucun</em>'}</td></tr>
</table>`;

            // Déroulé
            const derouleHtml = reunion.description ? `
<h3 style="color:#1e293b;font-size:15px;margin:24px 0 12px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">📋 Déroulé</h3>
<div style="padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;line-height:1.7;color:#1e293b">${reunion.description}</div>` : '';

            // Relevé de décision
            let decisions = [];
            try { decisions = JSON.parse(reunion.releve_decision || '[]'); } catch (e) {}
            const decisionsHtml = decisions.length > 0 ? `
<h3 style="color:#1e293b;font-size:15px;margin:24px 0 12px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">📝 Relevé de décision</h3>
<table style="width:100%;border-collapse:collapse;font-size:13px">
  <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
    <th style="padding:8px 12px;text-align:left;color:#475569;font-weight:700;width:40px">#</th>
    <th style="padding:8px 12px;text-align:left;color:#475569;font-weight:700">Décision</th>
  </tr></thead>
  <tbody>${decisions.map((d, i) => `<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:8px 12px;color:#64748b;font-weight:600">${i + 1}</td><td style="padding:8px 12px;color:#1e293b">${d.texte || ''}</td></tr>`).join('')}</tbody>
</table>` : '';

            // Liste de tâches
            let tasks = [];
            try { tasks = JSON.parse(reunion.liste_taches || '[]'); } catch (e) {}
            const tasksHtml = tasks.length > 0 ? `
<h3 style="color:#1e293b;font-size:15px;margin:24px 0 12px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">✅ Liste de tâches</h3>
<table style="width:100%;border-collapse:collapse;font-size:13px">
  <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
    <th style="padding:8px 12px;text-align:left;color:#475569;font-weight:700;width:40px">#</th>
    <th style="padding:8px 12px;text-align:left;color:#475569;font-weight:700">Tâche</th>
    <th style="padding:8px 12px;text-align:left;color:#475569;font-weight:700">Responsable</th>
    <th style="padding:8px 12px;text-align:left;color:#475569;font-weight:700">Échéance</th>
  </tr></thead>
  <tbody>${tasks.map((t, i) => `<tr style="border-bottom:1px solid #f1f5f9">
    <td style="padding:8px 12px;color:#64748b;font-weight:600">${i + 1}</td>
    <td style="padding:8px 12px;color:#1e293b;font-weight:600">${t.tache || ''}</td>
    <td style="padding:8px 12px;color:#475569">${t.responsable || '—'}</td>
    <td style="padding:8px 12px;color:#475569">${t.echeance ? new Date(t.echeance).toLocaleDateString('fr-FR') : '—'}</td>
  </tr>`).join('')}</tbody>
</table>` : '';

            const projetHtml = lienProjet ? `
<div style="margin-bottom:16px;padding:12px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:13px">
  <strong style="color:#16a34a">Projet :</strong> <span style="color:#1e293b">${lienProjet.projet_titre}${lienProjet.projet_code ? ' (' + lienProjet.projet_code + ')' : ''}</span>
  ${lienProjet.comite_nom ? `<br><strong style="color:#16a34a">Comité :</strong> <span style="color:#1e293b">${lienProjet.comite_nom}</span>` : ''}
</div>` : '';

            const content = `
<h1 style="color:#1e293b;margin:0 0 24px;font-size:26px;font-weight:900;text-align:center;letter-spacing:-0.02em">📄 Compte rendu de réunion</h1>
<h2 style="color:#0f172a;margin:0 0 4px;font-size:20px">📅 ${reunion.titre}</h2>
${projetHtml}
${participantsHtml}
${derouleHtml}
${decisionsHtml}
${tasksHtml}
<h3 style="color:#1e293b;font-size:15px;margin:24px 0 12px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">Demandes (${demandes.length})</h3>
<table style="width:100%;border-collapse:collapse;font-size:13px">
  <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
    <th style="padding:8px 12px;text-align:left;color:#475569;font-weight:700">Demande</th>
    <th style="padding:8px 12px;text-align:left;color:#475569;font-weight:700">Type</th>
  </tr></thead>
  <tbody>${demandesHtml}</tbody>
</table>
<div style="margin-top:28px;padding:16px 20px;background:#eff6ff;border-radius:10px;border-left:4px solid #2563eb">
  <p style="margin:0;color:#1e40af;font-size:13px;font-weight:600">💡 Retrouvez vos demandes et leur évolution en temps réel</p>
  <p style="margin:6px 0 0;color:#3b82f6;font-size:12px">Connectez-vous au <strong>Magasin d'Application DSI</strong> pour consulter l'état de vos demandes : <a href="https://magapp.ivry.local" style="color:#2563eb;font-weight:700">magapp.ivry.local</a></p>
</div>`;

            const emails = participants.map(p => p.email).filter(e => e && e.includes('@'));
            if (emails.length === 0) return res.status(400).json({ error: 'Aucun participant avec une adresse email renseignée' });

            if (!sendMailFn) return res.status(500).json({ error: 'Service email non configuré' });

            // Récupérer les fichiers joints à la réunion
            const attachments = await pgDb.all('SELECT * FROM reunion_attachments WHERE reunion_id=? ORDER BY created_at DESC', [id]);
            const fileAttachments = [];
            for (const att of attachments) {
                const storagePath = att.file_path
                    || (storage.isStoragePath(att.filename) ? att.filename : null);
                if (storagePath) {
                    try {
                        const f = await storage.getFileForServe(storagePath);
                        if (f) {
                            const buf = f.buffer || fs.readFileSync(f.absolutePath);
                            fileAttachments.push({ filename: att.original_name, content: buf.toString('base64') });
                        }
                    } catch (e) {}
                } else {
                    const filePath = path.join(__dirname, '..', '..', 'file_reunions', att.filename);
                    if (fs.existsSync(filePath)) {
                        fileAttachments.push({
                            filename: att.original_name,
                            content: fs.readFileSync(filePath).toString('base64')
                        });
                    }
                }
            }

            const subject = `Compte rendu — ${reunion.titre}${dateStr ? ' du ' + dateStr : ''}${lienProjet?.projet_titre ? ' [' + lienProjet.projet_titre + ']' : ''}`;
            let sent = 0, failed = 0;
            for (const email of emails) {
                try { await sendMailFn(email, subject, content, fileAttachments); sent++; }
                catch (e) { console.error(`[COMPTE-RENDU] Erreur envoi à ${email}:`, e.message); failed++; }
            }

            res.json({ message: `Compte rendu envoyé à ${sent} destinataire(s)${failed > 0 ? `, ${failed} échec(s)` : ''}${fileAttachments.length > 0 ? ` avec ${fileAttachments.length} pièce(s) jointe(s)` : ''}`, sent, failed, total: emails.length });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // PUT: Mettre à jour une réunion
    update: async (req, res) => {
        try {
            const { id } = req.params;
            const { titre, date_reunion, annee, lieu, description, releve_decision, liste_taches, statut } = req.body;
            await pgDb.run(`UPDATE rencontres_reunions SET titre=?, date_reunion=?, annee=?, lieu=?, description=?, releve_decision=?, liste_taches=?, statut=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [titre, date_reunion, annee, lieu, description, releve_decision || null, liste_taches || null, statut, id]);
            const reunion = await pgDb.get('SELECT * FROM rencontres_reunions WHERE id=?', [id]);
            res.json(reunion);
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // DELETE: one
    deleteOne: async (req, res) => {
        try {
            const reunion = await pgDb.get('SELECT * FROM rencontres_reunions WHERE id=?', [req.params.id]);
            if (!reunion) return res.status(404).json({ error: 'Réunion non trouvée' });
            const isAdmin = isAdminLike(req.user);
            const isCreator = req.user?.username && reunion.created_by === req.user.username;
            if (!isAdmin && !isCreator) return res.status(403).json({ error: 'Seuls l\'administrateur ou le créateur peuvent supprimer cette réunion' });

            // Supprimer les liaisons avec les projets avant de supprimer la réunion
            await pgDb.run('DELETE FROM projets.projet_reunions WHERE reunion_id = $1', [req.params.id]);

            // Supprimer les tâches personnelles liées à cette réunion
            await pgDb.run('DELETE FROM hub.user_tasks WHERE context_source = $1 AND context_id = $2', ['reunion', req.params.id]);

            // Supprimer les tâches dans la liste_taches de la réunion
            await pgDb.run('UPDATE rencontres_reunions SET liste_taches = NULL WHERE id = $1', [req.params.id]);

            // Supprimer la réunion
            await pgDb.run('DELETE FROM rencontres_reunions WHERE id=?', [req.params.id]);
            res.json({ message: 'Réunion supprimée' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // DELETE: all
    deleteAll: async (req, res) => {
        try {
            await pgDb.run('UPDATE rencontres_budgetaires SET reunion_id = NULL WHERE reunion_id IS NOT NULL');
            // Supprimer les dépendances avant les réunions (sinon violation FK)
            await pgDb.run('DELETE FROM projets.projet_reunions');
            await pgDb.run('DELETE FROM hub.user_tasks WHERE context_source = $1', ['reunion']);
            await pgDb.run('DELETE FROM reunion_participants');
            await pgDb.run('DELETE FROM reunion_attachments');
            const result = await pgDb.run('DELETE FROM rencontres_reunions');
            res.json({ message: 'Toutes les réunions supprimées', deleted: result.changes });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // Participants
    addParticipant: async (req, res) => {
        try {
            const { id } = req.params;
            const { nom, prenom, email, service, direction, type_presence, statut_presence, ad_username, commentaire } = req.body;
            const result = await pgDb.run(
                `INSERT INTO reunion_participants (reunion_id, nom, prenom, email, service, direction, type_presence, statut_presence, ad_username, commentaire) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, nom, prenom, email, service, direction, type_presence || 'metier', statut_presence || 'present', ad_username, commentaire || null]
            );
            const participant = await pgDb.get('SELECT * FROM reunion_participants WHERE id=?', [result.lastID]);
            res.status(201).json(participant);
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    deleteParticipant: async (req, res) => {
        try {
            await pgDb.run('DELETE FROM reunion_participants WHERE id=?', [req.params.id]);
            res.json({ message: 'Participant supprimé' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // Attachments
    uploadAttachments: async (req, res) => {
        try {
            const { id } = req.params;
            const username = req.user?.username || 'unknown';
            if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Aucun fichier reçu' });

            const inserted = [];
            for (const file of req.files) {
                // Corrige l'encodage et sauvegarde via storage
                if (file && file.originalname) file.originalname = storage.fixUploadName(file.originalname);
                const saved = await storage.saveFile(MODULE, id, file);

                const result = await pgDb.run(
                    `INSERT INTO reunion_attachments (reunion_id, filename, original_name, mimetype, size, uploaded_by, file_path) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [id, saved.filename, file.originalname, file.mimetype, file.size, username, saved.dbPath]
                );

                // Dual-write hub_docs (viewer central)
                try {
                    const docsService = require('../../shared/documents.service');
                    await docsService.registerExternalUpload({
                        module: 'rencontres',
                        entityType: 'attachment',
                        entityId: id,
                        title: file.originalname,
                        filename: saved.filename,
                        originalName: file.originalname,
                        mimetype: file.mimetype,
                        size: file.size,
                        storageRef: saved.dbPath,
                        uploadedBy: username,
                    });
                } catch (e) { console.warn('[DOCS] register failed:', e.message); }

                inserted.push({ id: result.lastID, filename: saved.filename, original_name: file.originalname, mimetype: file.mimetype, size: file.size });
            }
            res.json({ uploaded: inserted.length, files: inserted });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    getAttachments: async (req, res) => {
        try {
            const attachments = await pgDb.all(`SELECT * FROM reunion_attachments WHERE reunion_id = ? ORDER BY created_at DESC`, [req.params.id]);
            res.json(attachments);
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // GET /api/rencontres-reunions/attachments/:id/file?token=...
    downloadAttachment: async (req, res) => {
        try {
            const att = await pgDb.get(`SELECT * FROM reunion_attachments WHERE id = ?`, [req.params.id]);
            if (!att) return res.status(404).json({ error: 'PJ introuvable' });

            const storagePath = att.file_path
                || (storage.isStoragePath(att.filename) ? att.filename : null);

            if (storagePath) {
                const f = await storage.getFileForServe(storagePath);
                if (!f) return res.status(404).json({ error: 'Fichier introuvable sur le stockage' });
                const displayName = att.original_name || att.filename || 'fichier';
                const disposition = req.query.mode === 'inline' ? 'inline' : 'attachment';
                res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(displayName)}"`);
                if (att.mimetype) res.type(att.mimetype);
                else res.type(path.extname(displayName) || 'application/octet-stream');
                if (f.absolutePath) return res.sendFile(f.absolutePath);
                return res.send(f.buffer);
            }

            // Fallback legacy local
            const filePath = path.join(__dirname, '..', '..', 'file_reunions', att.filename);
            if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable' });
            res.download(filePath, att.original_name || att.filename);
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    deleteAttachment: async (req, res) => {
        try {
            const att = await pgDb.get(`SELECT * FROM reunion_attachments WHERE id = ?`, [req.params.id]);
            if (!att) return res.status(404).json({ error: 'PJ introuvable' });

            // Supprime via le service de stockage (nouveau ou legacy)
            if (storage.isStoragePath(att.filename)) {
                await storage.deleteFile(att.filename);
            } else {
                const filePath = path.join(__dirname, '..', '..', 'file_reunions', att.filename);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }

            await pgDb.run(`DELETE FROM reunion_attachments WHERE id = ?`, [req.params.id]);
            res.json({ success: true });
        } catch (error) { res.status(500).json({ error: error.message }); }
    }
};
