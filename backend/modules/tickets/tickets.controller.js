const { pgDb, pool } = require('../../shared/database');
const ticketRepo = require('./repositories/ticket.repository');
const commentRepo = require('./repositories/comment.repository');
const attachmentRepo = require('./repositories/attachment.repository');
const historyRepo = require('./repositories/history.repository');
const slaRepo = require('./repositories/sla.repository');
const observerRepo = require('./repositories/observer.repository');
const ticketService = require('./services/ticket.service');
const workflowService = require('./services/workflow.service');
const assignmentService = require('./services/assignment.service');
const notificationService = require('./services/notification.service');
const slaService = require('./services/sla.service');
const ticketDto = require('./dtos/ticket.dto');
const groupRepo = require('./repositories/ticket-group.repository');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

let _sendMail = null;

const UPLOAD_DIR = path.join(__dirname, '../../file_tickets');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + '-' + file.originalname);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/zip', 'text/plain'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Type de fichier non autorisé'));
    }
});

module.exports = {
    setSendMail(fn) { _sendMail = fn; },

    uploadMiddleware: upload.single('file'),

    // ─── CRUD ───────────────────────────────────────────────────
    async getAll(req, res) {
        try {
            const { page = 1, limit = 25, sort = 'date_creation', order = 'desc', ...filters } = req.query;
            const result = await ticketService.findAll(filters, { page: parseInt(page), limit: parseInt(limit), sort, order }, req.user);
            res.json(result);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async getByRequester(req, res) {
        try {
            const { email } = req.params;
            const excludeId = req.query.exclude_id ? parseInt(req.query.exclude_id) : null;
            if (!email) return res.status(400).json({ message: 'Email requis' });
            const filters = { requester_email: email, status_in: '1,2,3,4,5' };
            if (excludeId) filters.exclude_id = excludeId;
            const result = await ticketService.findAll(filters, { page: 1, limit: 100, sort: 'date_creation', order: 'desc' }, req.user);
            res.json({ count: result.pagination?.total || 0, tickets: (result.data || []).map(t => ({ id: t.id, title: t.title, status: t.status, status_label: t.status?.label, date_creation: t.date_creation })) });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async getById(req, res) {
        try {
            const ticket = await ticketService.findById(parseInt(req.params.id), req.user);
            if (!ticket) return res.status(404).json({ message: 'Ticket non trouvé' });
            res.json(ticket);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async create(req, res) {
        try {
            const ticketId = await ticketService.create(req.body, req.user);
            res.status(201).json({ id: ticketId, message: 'Ticket créé' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    async update(req, res) {
        try {
            await ticketService.update(parseInt(req.params.id), req.body, req.user);
            res.json({ message: 'Ticket mis à jour' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    async delete(req, res) {
        try {
            await ticketService.softDelete(parseInt(req.params.id), req.user);
            res.json({ message: 'Ticket supprimé' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    async bulkDelete(req, res) {
        try {
            const { resolveTicketRole } = require('./middleware/ticket-permissions');
            const userRole = await resolveTicketRole(req.user);
            if (!['supervisor', 'admin', 'superadmin'].includes(userRole)) {
                return res.status(403).json({ message: 'Permission refusée : rôle superviseur requis' });
            }
            const { ticket_ids } = req.body;
            if (!Array.isArray(ticket_ids) || ticket_ids.length === 0) {
                return res.status(400).json({ message: 'ticket_ids requis' });
            }
            let deleted = 0;
            const errors = [];
            for (const tid of ticket_ids) {
                try {
                    await ticketService.softDelete(parseInt(tid), req.user);
                    deleted++;
                } catch (e) {
                    errors.push({ id: tid, error: e.message });
                }
            }
            res.json({ message: `${deleted} ticket(s) supprimé(s)`, deleted, errors });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    // ─── Actions ────────────────────────────────────────────────
    async assign(req, res) {
        try {
            const { technician_id, group_id } = req.body;
            const ticketId = parseInt(req.params.id);
            await assignmentService.assign(ticketId, { technician_id, group_id }, req.user);

            // Propagation de l'assignation à tous les membres du groupe
            const siblingIds = await groupRepo.getSiblingIds(ticketId);
            for (const sibId of siblingIds) {
                try {
                    await assignmentService.assign(sibId, { technician_id, group_id }, req.user);
                } catch (e) { console.error(`[GROUP] assign propagation to #${sibId} failed:`, e.message); }
            }

            res.json({ message: 'Ticket assigné' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    async changeStatus(req, res) {
        try {
            const { status, comment } = req.body;
            const ticketId = parseInt(req.params.id);
            await workflowService.changeStatus(ticketId, parseInt(status), req.user.id, comment, req.user);

            // Propagation du changement de statut à tous les membres du groupe
            const siblingIds = await groupRepo.getSiblingIds(ticketId);
            for (const sibId of siblingIds) {
                try {
                    await workflowService.changeStatus(sibId, parseInt(status), req.user.id,
                        `Propagé depuis #${ticketId} (groupe)`, req.user);
                } catch (e) { console.error(`[GROUP] status propagation to #${sibId} failed:`, e.message); }
            }

            res.json({ message: 'Statut mis à jour' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    async setSolution(req, res) {
        try {
            const { solution } = req.body;
            await ticketService.setSolution(parseInt(req.params.id), solution, req.user);
            res.json({ message: 'Solution enregistrée' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    async reopen(req, res) {
        try {
            await workflowService.reopen(parseInt(req.params.id), req.user);
            res.json({ message: 'Ticket réouvert' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    async toggleVip(req, res) {
        try {
            const ticketId = parseInt(req.params.id);
            const ticket = await ticketRepo.findById(ticketId);
            if (!ticket) return res.status(404).json({ message: 'Ticket non trouvé' });
            const newVip = !ticket.is_vip;
            await ticketRepo.update(ticketId, { is_vip: newVip });
            try {
                await historyRepo.log(ticketId, req.user.id, newVip ? 'vip_set' : 'vip_unset', null, null, null,
                    `Ticket ${newVip ? 'marqué VIP' : 'retiré VIP'} par ${req.user.displayName || req.user.username}`);
            } catch (e) { console.error('[HISTORY] toggleVip log failed:', e.message); }
            res.json({ is_vip: newVip });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    // ─── Watchers / Observers ──────────────────────────────────
    async getObservers(req, res) {
        try {
            const observers = await observerRepo.findByTicket(parseInt(req.params.id));
            res.json(observers);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async addWatcher(req, res) {
        try {
            await observerRepo.add(parseInt(req.params.id), req.user.id, req.user);
            res.json({ message: 'Vous suivez ce ticket' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    async removeWatcher(req, res) {
        try {
            await observerRepo.remove(parseInt(req.params.id), req.user.id);
            res.json({ message: 'Vous ne suivez plus ce ticket' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    // ─── Favorites ─────────────────────────────────────────────
    async addFavorite(req, res) {
        try {
            await pgDb.run(
                'INSERT INTO hub_tickets.ticket_favorites (user_id, ticket_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [req.user.id, parseInt(req.params.id)]
            );
            res.json({ message: 'Favori ajouté' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    async removeFavorite(req, res) {
        try {
            await pgDb.run(
                'DELETE FROM hub_tickets.ticket_favorites WHERE user_id = $1 AND ticket_id = $2',
                [req.user.id, parseInt(req.params.id)]
            );
            res.json({ message: 'Favori retiré' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    // ─── Comments ──────────────────────────────────────────────
    async getComments(req, res) {
        try {
            const comments = await commentRepo.findByTicket(parseInt(req.params.id), req.user);
            res.json(comments);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async addComment(req, res) {
        try {
            const { content, is_private = 0 } = req.body;
            const ticketId = parseInt(req.params.id);
            const comment = await commentRepo.create(ticketId, { content, is_private }, req.user);
            try {
                await historyRepo.log(ticketId, req.user.id, 'comment_added', null, null, null,
                    `Commentaire ${is_private ? 'interne ' : ''}ajouté par ${req.user.displayName || req.user.username}`);
            } catch (e) { console.error('[HISTORY] addComment log failed:', e.message); }
            await notificationService.trigger('ticket.comment_added', { ticket_id: ticketId, comment, user: req.user });

            // Propagation du commentaire à tous les membres du groupe
            const siblingIds = await groupRepo.getSiblingIds(ticketId);
            for (const sibId of siblingIds) {
                try {
                    await commentRepo.create(sibId, { content, is_private }, req.user);
                    await historyRepo.log(sibId, req.user.id, 'comment_added', null, null, null,
                        `Commentaire propagé depuis #${ticketId} (groupe)`);
                } catch (e) { console.error(`[GROUP] comment propagation to #${sibId} failed:`, e.message); }
            }

            res.status(201).json(comment);
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    async sendCommentToRequester(req, res) {
        try {
            const { content, is_private = 0 } = req.body;
            const ticketId = parseInt(req.params.id);
            const ticket = await ticketService.findById(ticketId, req.user);
            if (!ticket) return res.status(404).json({ message: 'Ticket non trouvé' });

            const requesterEmail = ticket.requester?.email;
            if (!requesterEmail) return res.status(400).json({ message: 'Aucun email demandeur trouvé' });

            const comment = await commentRepo.create(ticketId, { content, is_private: is_private ? 1 : 0 }, req.user);
            try {
                await historyRepo.log(ticketId, req.user.id, 'comment_sent_to_requester', null, null, null,
                    `Commentaire envoyé par email au demandeur par ${req.user.displayName || req.user.username}`);
            } catch (e) { console.error('[HISTORY] sendComment log failed:', e.message); }

            if (_sendMail) {
                const authorName = req.user.displayName || req.user.username;
                const subject = `[Ticket #${ticketId}] Réponse à votre demande`;
                const body = `
                    <p>Bonjour ${ticket.requester.name || ''},</p>
                    <p>Vous avez reçu une réponse concernant votre ticket <strong>#${ticketId} – ${ticket.title}</strong> :</p>
                    <blockquote style="border-left:4px solid #6366f1;padding-left:12px;margin:12px 0;color:#374151;">
                        ${content}
                    </blockquote>
                    <p>Cordialement,<br>${authorName}</p>
                `;
                await _sendMail(requesterEmail, subject, body);
            }

            res.status(201).json(comment);
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    async logActivity(req, res) {
        try {
            const { action, comment } = req.body;
            const ticketId = parseInt(req.params.id);
            try {
                await historyRepo.log(ticketId, req.user.id, action || 'activity', null, null, null, comment || null);
            } catch (e) { console.error('[HISTORY] logActivity failed:', e.message); }
            res.json({ message: 'Activité enregistrée' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    async updateComment(req, res) {
        try {
            await commentRepo.update(parseInt(req.params.cid), req.body, req.user);
            res.json({ message: 'Commentaire mis à jour' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    async deleteComment(req, res) {
        try {
            await commentRepo.delete(parseInt(req.params.cid), req.user);
            res.json({ message: 'Commentaire supprimé' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    // ─── Attachments ───────────────────────────────────────────
    async getAttachments(req, res) {
        try {
            const files = await attachmentRepo.findByTicket(parseInt(req.params.id));
            res.json(files);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async addAttachment(req, res) {
        try {
            if (!req.file) return res.status(400).json({ message: 'Fichier requis' });
            const attachment = await attachmentRepo.create(parseInt(req.params.id), req.file, req.user);
            res.status(201).json(attachment);
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    async downloadAttachment(req, res) {
        try {
            const file = await attachmentRepo.findById(parseInt(req.params.aid));
            if (!file) return res.status(404).json({ message: 'Fichier non trouvé' });
            res.download(file.file_path, file.original_name);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async deleteAttachment(req, res) {
        try {
            await attachmentRepo.delete(parseInt(req.params.aid), req.user);
            res.json({ message: 'Fichier supprimé' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    // ─── History & SLA ───────────────────────────────────────
    async getHistory(req, res) {
        try {
            const history = await historyRepo.findByTicket(parseInt(req.params.id));
            res.json(history);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async getSLA(req, res) {
        try {
            const sla = await slaRepo.findByTicket(parseInt(req.params.id));
            res.json(sla);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    // ─── Dashboard ─────────────────────────────────────────────
    async getDashboardStats(req, res) {
        try {
            const stats = await ticketService.getDashboardStats(req.user);
            res.json(stats);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async getMyStats(req, res) {
        try {
            const stats = await ticketService.getMyStats(req.user);
            res.json(stats);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async getDailyMetrics(req, res) {
        try {
            const metrics = await ticketService.getDailyMetrics();
            res.json(metrics);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async getKpiHistory(req, res) {
        try {
            const days = Math.min(parseInt(req.query.days) || 30, 365);
            const history = await ticketService.getKpiHistory(days);
            res.json(history);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async runKpiSnapshot(req, res) {
        try {
            await ticketService.saveDailyKpiSnapshot();
            res.json({ success: true, message: 'Snapshot enregistré pour aujourd\'hui' });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async backfillKpiHistory(req, res) {
        try {
            const days = Math.min(parseInt(req.query.days) || 30, 365);
            const count = await ticketService.backfillKpiHistory(days);
            res.json({ success: true, count, days });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async getSLABreaches(req, res) {
        try {
            const breaches = await slaService.getActiveBreaches();
            res.json(breaches);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async saveWidgets(req, res) {
        try {
            await pgDb.run(
                'DELETE FROM hub_tickets.dashboard_widgets WHERE user_id = $1', [req.user.id]);
            for (const w of req.body.widgets || []) {
                await pgDb.run(
                    'INSERT INTO hub_tickets.dashboard_widgets (user_id, widget_type, config, position) VALUES ($1, $2, $3, $4)',
                    [req.user.id, w.widget_type, JSON.stringify(w.config || {}), w.position || 0]);
            }
            res.json({ message: 'Widgets sauvegardés' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    async getWidgets(req, res) {
        try {
            const widgets = await pgDb.all(
                'SELECT * FROM hub_tickets.dashboard_widgets WHERE user_id = $1 ORDER BY position',
                [req.user.id]);
            res.json(widgets);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    // ─── Users (for observer selection) ──────────────────────────
    async searchUsers(req, res) {
        try {
            const q = req.query.q || '';
            if (q.length < 2) return res.json([]);
            const rows = await pgDb.all(`
                SELECT id, "displayName", email, username
                FROM hub.users
                WHERE LOWER(email) LIKE LOWER($1) OR LOWER("displayName") LIKE LOWER($1)
                LIMIT 20
            `, [`%${q}%`]);
            res.json(rows.map(r => ({ id: r.id, name: r.displayName, email: r.email, username: r.username })));
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    // ─── Observer management ──────────────────────────────────────
    async addObserver(req, res) {
        try {
            const { user_id, name, email, username } = req.body;
            if (!user_id) return res.status(400).json({ message: 'user_id requis' });
            const ticketId = parseInt(req.params.id);
            await observerRepo.add(ticketId, user_id, { displayName: name, username, email });
            await historyRepo.log(ticketId, req.user.id, 'observer_added', 'observer', null, String(user_id), 'Observateur ajouté');
            res.json({ message: 'Observateur ajouté' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    async removeObserver(req, res) {
        try {
            const ticketId = parseInt(req.params.id);
            const userId = parseInt(req.params.userId);
            await observerRepo.remove(ticketId, userId);
            await historyRepo.log(ticketId, req.user.id, 'observer_removed', 'observer', null, String(userId), 'Observateur retiré');
            res.json({ message: 'Observateur retiré' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },
};
