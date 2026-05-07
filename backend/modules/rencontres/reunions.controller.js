const fs = require('fs');
const path = require('path');
const { pgDb } = require('../../shared/database');

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
            const reunions = await pgDb.all(`
                SELECT r.*, COUNT(DISTINCT p.id) as participant_count, COUNT(DISTINCT a.id) as attachment_count
                FROM rencontres_reunions r
                LEFT JOIN reunion_participants p ON r.id = p.reunion_id
                LEFT JOIN reunion_attachments a ON r.id = a.reunion_id
                GROUP BY r.id ORDER BY r.date_reunion DESC
            `);
            res.json(reunions || []);
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // POST: Créer une nouvelle réunion
    create: async (req, res) => {
        try {
            const { titre, date_reunion, annee, lieu, description, statut, participants } = req.body;
            const username = req.user?.username || 'unknown';

            const result = await pgDb.run(
                `INSERT INTO rencontres_reunions (titre, date_reunion, annee, lieu, description, statut, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [titre, date_reunion, annee || new Date().getFullYear(), lieu, description, statut || 'planifiée', username]
            );

            const reunionId = result.lastID;
            if (Array.isArray(participants) && participants.length > 0) {
                for (const p of participants) {
                    await pgDb.run(
                        `INSERT INTO reunion_participants (reunion_id, nom, prenom, email, service, direction, type_presence, statut_presence, ad_username) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [reunionId, p.nom, p.prenom || '', p.email || '', p.service || '', p.direction || '', p.type_presence || 'metier', p.statut_presence || 'present', p.ad_username || null]
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
            const reunion = await pgDb.get('SELECT * FROM rencontres_reunions WHERE id=?', [id]);
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
                const color = a === 'OK DSI' ? '#1d4ed8' : a === 'Refusé' ? '#dc2626' : '#92400e';
                const bg = a === 'OK DSI' ? '#dbeafe' : a === 'Refusé' ? '#fee2e2' : '#fef3c7';
                return `<span style="padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700;background:${bg};color:${color}">${a}</span>`;
            };

            let demandesHtml = '';
            if (demandes.length === 0) {
                demandesHtml = '<p style="color:#94a3b8;font-style:italic">Aucune demande associée à cette réunion.</p>';
            } else {
                for (const [dir, services] of Object.entries(byDir)) {
                    demandesHtml += `<tr><td colspan="4" style="padding:8px 10px 6px;background:#334155;color:#e2e8f0;font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:0.06em">${dir}</td></tr>`;
                    for (const [svc, items] of Object.entries(services)) {
                        if (svc) demandesHtml += `<tr><td colspan="4" style="padding:4px 18px 3px;background:#f1f5f9;font-weight:700;color:#0284c7;font-size:11px;text-transform:uppercase;letter-spacing:0.04em">${svc}</td></tr>`;
                        for (const d of items) {
                            const check = d.statut === 'effectuée' ? '✅ ' : '';
                            demandesHtml += `<tr style="border-bottom:1px solid #f1f5f9;background:${d.statut === 'effectuée' ? '#f0fdf4' : 'white'}">
                                <td style="padding:8px 12px;color:#1e293b;font-weight:600">${check}${d.titre || '—'}</td>
                                <td style="padding:8px 12px;color:#475569;font-size:12px">${d.type || '—'}</td>
                                <td style="padding:8px 12px">${arbitrageBadge(d.arbitrage)}</td>
                                <td style="padding:8px 12px;color:#475569;font-size:12px">${d.suivi || '—'}</td>
                            </tr>`;
                        }
                    }
                }
            }

            const dateStr = reunion.date_reunion ? new Date(reunion.date_reunion).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
            const participantsStr = participants.map(p => `${p.prenom ? p.prenom + ' ' : ''}${p.nom}${p.service ? ' (' + p.service + ')' : ''}`).join(', ') || 'Aucun participant renseigné';

            const content = `
<h2 style="color:#0f172a;margin:0 0 4px;font-size:20px">${reunion.titre}</h2>
<p style="color:#64748b;margin:0 0 20px;font-size:14px">${dateStr}${reunion.lieu ? ' — ' + reunion.lieu : ''}</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
  <tr><td style="padding:10px 14px;background:#f8fafc;font-weight:700;color:#475569;width:30%">Participants</td>
      <td style="padding:10px 14px;color:#1e293b">${participantsStr}</td></tr>
  ${reunion.description ? `<tr><td style="padding:10px 14px;background:#f8fafc;font-weight:700;color:#475569">Description</td><td style="padding:10px 14px;color:#1e293b">${reunion.description}</td></tr>` : ''}
</table>
<h3 style="color:#1e293b;font-size:15px;margin:24px 0 12px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">Demandes (${demandes.length})</h3>
<table style="width:100%;border-collapse:collapse;font-size:13px">
  <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
    <th style="padding:8px 12px;text-align:left;color:#475569;font-weight:700">Demande</th>
    <th style="padding:8px 12px;text-align:left;color:#475569;font-weight:700">Type</th>
    <th style="padding:8px 12px;text-align:left;color:#475569;font-weight:700">Arbitrage</th>
    <th style="padding:8px 12px;text-align:left;color:#475569;font-weight:700">Suivi</th>
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

            const subject = `Compte rendu — ${reunion.titre}${dateStr ? ' du ' + dateStr : ''}`;
            let sent = 0, failed = 0;
            for (const email of emails) {
                try { await sendMailFn(email, subject, content); sent++; }
                catch (e) { console.error(`[COMPTE-RENDU] Erreur envoi à ${email}:`, e.message); failed++; }
            }

            res.json({ message: `Compte rendu envoyé à ${sent} destinataire(s)${failed > 0 ? `, ${failed} échec(s)` : ''}`, sent, failed, total: emails.length });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // PUT: Mettre à jour une réunion
    update: async (req, res) => {
        try {
            const { id } = req.params;
            const { titre, date_reunion, annee, lieu, description, statut } = req.body;
            await pgDb.run(`UPDATE rencontres_reunions SET titre=?, date_reunion=?, annee=?, lieu=?, description=?, statut=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [titre, date_reunion, annee, lieu, description, statut, id]);
            const reunion = await pgDb.get('SELECT * FROM rencontres_reunions WHERE id=?', [id]);
            res.json(reunion);
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // DELETE: one
    deleteOne: async (req, res) => {
        try {
            await pgDb.run('DELETE FROM rencontres_reunions WHERE id=?', [req.params.id]);
            res.json({ message: 'Réunion supprimée' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    },

    // DELETE: all
    deleteAll: async (req, res) => {
        try {
            await pgDb.run('UPDATE rencontres_budgetaires SET reunion_id = NULL WHERE reunion_id IS NOT NULL');
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
            const { nom, prenom, email, service, direction, type_presence, statut_presence, ad_username } = req.body;
            const result = await pgDb.run(
                `INSERT INTO reunion_participants (reunion_id, nom, prenom, email, service, direction, type_presence, statut_presence, ad_username) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, nom, prenom, email, service, direction, type_presence || 'metier', statut_presence || 'present', ad_username]
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
                const result = await pgDb.run(
                    `INSERT INTO reunion_attachments (reunion_id, filename, original_name, mimetype, size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)`,
                    [id, file.filename, file.originalname, file.mimetype, file.size, username]
                );
                inserted.push({ id: result.lastID, filename: file.filename, original_name: file.originalname, mimetype: file.mimetype, size: file.size });
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

    deleteAttachment: async (req, res) => {
        try {
            const att = await pgDb.get(`SELECT * FROM reunion_attachments WHERE id = ?`, [req.params.id]);
            if (!att) return res.status(404).json({ error: 'PJ introuvable' });
            const filePath = path.join(__dirname, '..', '..', 'file_reunions', att.filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            await pgDb.run(`DELETE FROM reunion_attachments WHERE id = ?`, [req.params.id]);
            res.json({ success: true });
        } catch (error) { res.status(500).json({ error: error.message }); }
    }
};
