const { pgDb, getSqlite } = require('../../shared/database');
const service = require('./mailboxes.service');
const { searchADRecipientMembers } = require('../../shared/ad_helper');
const { checkO365Existence, getMailboxMessageCounts } = require('../../shared/graph_helper');

module.exports = {
    // GET /api/mailboxes — toutes les boîtes mail partagées, quel que soit
    // l'arbitrage (en attente/favorable/défavorable). Lecture ouverte à tout
    // utilisateur connecté (module public).
    async list(req, res) {
        try {
            const rows = await pgDb.all(`
                SELECT sm.*, t.title AS ticket_title, t.status AS ticket_status
                FROM hub.shared_mailboxes sm
                LEFT JOIN hub_tickets.tickets t ON t.glpi_id = sm.ticket_id
                ORDER BY sm.created_at DESC
            `);
            res.json(rows);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la récupération des boîtes mail partagées', error: error.message });
        }
    },

    // POST /api/mailboxes — ajout manuel (sans ticket), depuis le module.
    async create(req, res) {
        try {
            if (!req.body?.nom?.trim()) return res.status(400).json({ message: 'Le nom de la boîte est requis' });
            const id = await service.createManual(req.body, req.user);
            const row = await pgDb.get('SELECT * FROM hub.shared_mailboxes WHERE id = ?', [id]);
            res.status(201).json(row);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la création de la boîte', error: error.message });
        }
    },

    // PUT /api/mailboxes/:id
    async update(req, res) {
        try {
            const existing = await pgDb.get('SELECT id FROM hub.shared_mailboxes WHERE id = ?', [req.params.id]);
            if (!existing) return res.status(404).json({ message: 'Boîte introuvable' });
            await service.updateRecord(req.params.id, req.body || {});
            const row = await pgDb.get('SELECT * FROM hub.shared_mailboxes WHERE id = ?', [req.params.id]);
            res.json(row);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la modification de la boîte', error: error.message });
        }
    },

    // GET /api/mailboxes/ad-members?email=… — relit en direct dans l'annuaire
    // AD les membres réels d'une boîte partagée (délégués Accès total) ou
    // d'une liste de diffusion (membres du groupe), identifiée par son
    // adresse mail. Si absente de l'AD on-prem, repli sur Microsoft Graph
    // (O365/Entra ID) — cf. graph_helper.js : confirme l'existence d'une
    // boîte cloud-only (ses membres restent alors inconnus, Graph ne les
    // expose pas) ou liste les vrais membres d'un groupe cloud (si l'app a
    // la permission Group.Read.All). Best-effort : ne modifie rien, le
    // résultat est appliqué par le front (bouton "Récupérer depuis
    // l'AD/O365" dans la fiche).
    async getAdMembers(req, res) {
        try {
            const email = (req.query.email || '').trim();
            if (!email) return res.status(400).json({ message: 'Adresse mail requise' });
            const db = getSqlite();
            const adSettings = db ? await db.get('SELECT * FROM ad_settings WHERE id = 1') : null;
            if (adSettings?.is_enabled && adSettings.host) {
                const result = await searchADRecipientMembers(email, adSettings);
                if (result.found) return res.json({ ...result, source: 'ad', o365_status: null });
            }

            // Repli O365 (best-effort — l'échec de cette étape ne doit jamais
            // masquer le "introuvable dans l'AD" déjà établi ci-dessus).
            const azureSettings = db ? await db.get('SELECT * FROM azure_ad_settings WHERE id = 1') : null;
            const o365 = await checkO365Existence(email, azureSettings);

            if (o365.status === 'user_found') {
                return res.json({
                    found: true, source: 'o365', type: 'boite_partagee', recipientName: o365.displayName,
                    members: [], o365_status: 'user_found',
                    message: "Boîte confirmée dans O365 (cloud), absente de l'AD on-prem — Microsoft Graph n'expose pas ses délégués, ses membres restent inconnus.",
                });
            }
            if (o365.status === 'group_found' && !o365.permissionDenied) {
                return res.json({
                    found: true, source: 'o365', type: 'liste', recipientName: o365.displayName,
                    members: o365.members || [], o365_status: 'group_found',
                });
            }
            if (o365.status === 'group_found' && o365.permissionDenied) {
                return res.status(404).json({
                    message: "Introuvable dans l'AD. Impossible de vérifier s'il s'agit d'une liste O365 : permission Microsoft Graph « Group.Read.All » manquante sur l'application (à accorder par un administrateur Entra ID).",
                    found: false, o365_status: 'permission_denied',
                });
            }
            if (o365.status === 'not_found') {
                return res.status(404).json({
                    message: `Introuvable dans l'AD ni dans O365 — l'objet a probablement été supprimé.`,
                    found: false, o365_status: 'not_found',
                });
            }
            return res.status(404).json({
                message: `Aucun objet AD ne correspond à ${email}` + (o365.error ? ` (vérification O365 également en échec : ${o365.error})` : ''),
                found: false, o365_status: null,
            });
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la lecture AD/O365', error: error.message });
        }
    },

    // POST /api/mailboxes/:id/sync-mail-counts — relit en direct dans O365
    // (Microsoft Graph, app "Messagerie O365" — cf. graph_helper.js
    // #getMailboxMessageCounts) le nombre de messages / non lus du dossier
    // Inbox, et persiste directement (pas de fiche à ré-enregistrer,
    // contrairement à ad-members : aucune décision à valider ici).
    async syncMailCounts(req, res) {
        try {
            const existing = await pgDb.get('SELECT id, email FROM hub.shared_mailboxes WHERE id = ?', [req.params.id]);
            if (!existing) return res.status(404).json({ message: 'Boîte introuvable' });
            if (!existing.email) return res.status(400).json({ message: 'Adresse mail non renseignée' });

            const db = getSqlite();
            const o365Settings = db ? await db.get('SELECT * FROM o365_settings WHERE id = 1') : null;
            const result = await getMailboxMessageCounts(existing.email, o365Settings);

            if (result.ok) {
                await service.updateRecord(existing.id, {
                    mail_total_count: result.total, mail_unread_count: result.unread,
                    mail_counts_synced_at: new Date().toISOString(), mail_counts_error: null,
                });
            } else {
                await service.updateRecord(existing.id, { mail_counts_error: result.error });
            }
            const row = await pgDb.get('SELECT * FROM hub.shared_mailboxes WHERE id = ?', [existing.id]);
            res.json(row);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la lecture des compteurs O365', error: error.message });
        }
    },

    // DELETE /api/mailboxes/:id
    async remove(req, res) {
        try {
            await service.deleteRecord(req.params.id);
            res.json({ message: 'Boîte supprimée' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la suppression de la boîte', error: error.message });
        }
    },
};
