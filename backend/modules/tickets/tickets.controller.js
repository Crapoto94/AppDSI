const { pgDb, pool, getSqlite } = require('../../shared/database');
const storage = require('../../shared/storage');
const ticketRepo = require('./repositories/ticket.repository');

const MODULE = 'tickets';
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
const { validateCreate } = require('./validators/ticket.validator');
const ticketDto = require('./dtos/ticket.dto');
const groupRepo = require('./repositories/ticket-group.repository');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { SECRET_KEY } = require('../../shared/config');
const axios = require('axios');
const { searchADUsersByQuery } = require('../../shared/ad_helper');

// Émet un événement temps réel vers les clients abonnés à la salle "tickets:watch".
function emitTicketEvent(event, payload) {
    try {
        const { getIO } = require('../live/live.socket');
        const io = getIO && getIO();
        if (io) io.to('tickets:watch').emit(event, payload || {});
    } catch (_) { /* socket optionnel */ }
}

// ─── Résolution d'un document (base de connaissance / doc logiciel magapp)
//     en fichier joignable { originalname, mimetype, size, buffer }. ───────────
const MAX_ATTACH_BYTES = 15 * 1024 * 1024; // 15 Mo / pièce

async function readKbDocFile(id) {
    const doc = await pgDb.get('SELECT * FROM hub_tickets.knowledge_documents WHERE id=$1', [id]);
    if (!doc) return null;
    let buffer = null;
    if (storage.isStoragePath(doc.file_path)) {
        const f = await storage.getFileForServe(doc.file_path);
        if (f) buffer = f.buffer || (f.absolutePath ? fs.readFileSync(f.absolutePath) : null);
    } else if (doc.file_path && fs.existsSync(doc.file_path)) {
        buffer = fs.readFileSync(doc.file_path);
    }
    if (!buffer) return null;
    return {
        originalname: doc.original_name || doc.name || `document-${id}`,
        mimetype: doc.mimetype || 'application/octet-stream',
        size: buffer.length, buffer,
    };
}

async function readMagappDocFile(id) {
    const doc = await pgDb.get('SELECT id, title, url FROM magapp.app_docs WHERE id=$1', [id]);
    if (!doc) return null;
    let url = (doc.url || '').trim();
    if (!url) return null;
    if (!/^https?:\/\//i.test(url)) {
        const base = (await getAppBaseUrl()).replace(/\/$/, '');
        url = base + (url.startsWith('/') ? url : '/' + url);
    }
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000, maxContentLength: MAX_ATTACH_BYTES, maxBodyLength: MAX_ATTACH_BYTES });
    const buffer = Buffer.from(resp.data);
    const cleanUrl = url.split('?')[0];
    let name = doc.title || path.basename(cleanUrl) || `document-${id}`;
    const ext = path.extname(cleanUrl);
    if (ext && !name.toLowerCase().endsWith(ext.toLowerCase())) name += ext;
    return {
        originalname: name,
        mimetype: resp.headers['content-type'] || 'application/octet-stream',
        size: buffer.length, buffer,
    };
}

// Rattache des pièces jointes (déjà créées) au commentaire/suivi qui les porte.
async function linkAttachmentsToComment(attachmentIds, followupId, ticketId) {
    const ids = (Array.isArray(attachmentIds) ? attachmentIds : [])
        .map(n => parseInt(n)).filter(n => Number.isInteger(n));
    if (!ids.length || !followupId) return;
    try {
        await pool.query(
            `UPDATE hub_tickets.ticket_attachments SET followup_id = $1
             WHERE ticket_id = $2 AND id = ANY($3::int[])`,
            [followupId, ticketId, ids]
        );
    } catch (e) { console.error('[ATTACH] liaison PJ↔commentaire échouée:', e.message); }
}

// Lit une pièce jointe de ticket déjà enregistrée (pour la rejoindre à l'email).
async function readTicketAttachmentFile(aid) {
    const att = await attachmentRepo.findById(parseInt(aid));
    if (!att) return null;
    let buffer = null;
    if (storage.isStoragePath(att.file_path)) {
        const f = await storage.getFileForServe(att.file_path);
        if (f) buffer = f.buffer || (f.absolutePath ? fs.readFileSync(f.absolutePath) : null);
    } else if (att.file_path && fs.existsSync(att.file_path)) {
        buffer = fs.readFileSync(att.file_path);
    }
    if (!buffer || buffer.length > MAX_ATTACH_BYTES) return null;
    return { originalname: att.original_name || att.filename, mimetype: att.mimetype || 'application/octet-stream', size: buffer.length, buffer };
}

// Résout une liste de descripteurs { source:'kb'|'magapp', id } en fichiers.
async function resolveDocFiles(list) {
    const out = [];
    for (const d of Array.isArray(list) ? list : []) {
        if (!d || d.id == null) continue;
        try {
            const f = d.source === 'magapp'
                ? await readMagappDocFile(parseInt(d.id))
                : await readKbDocFile(parseInt(d.id));
            if (f && f.buffer && f.size > 0 && f.size <= MAX_ATTACH_BYTES) out.push(f);
            else if (f && f.size > MAX_ATTACH_BYTES) console.warn(`[ATTACH] doc ${d.source}#${d.id} ignoré (>${MAX_ATTACH_BYTES} o)`);
        } catch (e) {
            console.error(`[ATTACH] résolution doc ${d?.source}#${d?.id} échouée:`, e.message);
        }
    }
    return out;
}

let _sendMail = null;

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

function makeReplyToken(ticketId, requesterEmail) {
    const ts = Date.now();
    const payload = `${ticketId}|${requesterEmail}|${ts}`;
    const sig = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('hex');
    return Buffer.from(`${payload}|${sig}`).toString('base64url');
}

function verifyReplyToken(token) {
    try {
        const decoded = Buffer.from(token, 'base64url').toString('utf8');
        const parts = decoded.split('|');
        if (parts.length !== 4) return null;
        const [ticketId, email, ts, sig] = parts;
        const payload = `${ticketId}|${email}|${ts}`;
        const expected = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('hex');
        if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
        return { ticketId: parseInt(ticketId), email };
    } catch { return null; }
}

// Multer memory storage - sauvegarde via storage service
const upload = multer({
    storage: multer.memoryStorage(),
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
            const { page = 1, limit = 25, sort = 'date_creation', order = 'desc', lite, ...filters } = req.query;
            const result = await ticketService.findAll(filters, { page: parseInt(page), limit: parseInt(limit), sort, order, lite: lite === '1' || lite === 'true' }, req.user);
            res.json(result);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async getBatchDetails(req, res) {
        try {
            const ids = String(req.query.ids || '').split(',').map(Number).filter(n => n > 0);
            if (ids.length === 0) return res.json([]);
            const data = await ticketService.getBatchDetails(ids);
            res.json(data);
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
            const errors = validateCreate(req.body);
            if (errors.length > 0) {
                return res.status(400).json({ message: errors.join('; ') });
            }
            const ticketId = await ticketService.create(req.body, req.user);
            res.status(201).json({ id: ticketId, message: 'Ticket créé' });
            try {
                const t = await ticketRepo.findById(ticketId);
                emitTicketEvent('ticket_created', { id: ticketId, glpi_id: t?.glpi_id, title: t?.title || t?.name });
            } catch (_) { /* emit best-effort */ }
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    async getMyPhone(req, res) {
        try {
            const email = req.query.email || req.user.email;
            const username = req.user.username;
            let phone = null;
            if (req.query.email) {
                // Phone for a specific requester → look up last ticket by that email
                const { rows: ticketRows } = await pool.query(
                    `SELECT requester_phone FROM hub_tickets.tickets
                     WHERE LOWER(requester_email_22) = LOWER($1)
                       AND requester_phone IS NOT NULL
                     ORDER BY date_creation DESC LIMIT 1`,
                    [email]
                );
                phone = ticketRows[0]?.requester_phone || null;
            } else {
                // Phone for the current user → try profile first, then fallback to tickets
                const { rows } = await pool.query('SELECT requester_phone FROM hub.users WHERE LOWER(username) = LOWER($1)', [username]);
                phone = rows[0]?.requester_phone || null;
                if (!phone) {
                    const { rows: ticketRows } = await pool.query(
                        `SELECT requester_phone FROM hub_tickets.tickets
                         WHERE LOWER(requester_email_22) = LOWER($1)
                           AND requester_phone IS NOT NULL
                         ORDER BY date_creation DESC LIMIT 1`,
                        [req.user.email || username]
                    );
                    phone = ticketRows[0]?.requester_phone || null;
                }
            }
            res.json({ phone });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async update(req, res) {
        try {
            await ticketService.update(parseInt(req.params.id), req.body, req.user);
            res.json({ message: 'Ticket mis à jour' });
            emitTicketEvent('ticket_updated', { id: parseInt(req.params.id) });
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
            const { technician_id, technician_username, group_id, keepGroup } = req.body;
            const ticketId = parseInt(req.params.id);
            console.log('[ASSIGN] ticketId=%d technician_id=%s technician_username=%s keepGroup=%s user=%s(%s)', ticketId, technician_id, technician_username, keepGroup, req.user?.username, req.user?.id);
            await assignmentService.assign(ticketId, { technician_id, technician_username, group_id, keepGroup }, req.user);

            // Propagation de l'assignation à tous les membres du groupe
            const siblingIds = await groupRepo.getSiblingIds(ticketId);
            for (const sibId of siblingIds) {
                try {
                    await assignmentService.assign(sibId, { technician_id, technician_username, group_id, keepGroup }, req.user);
                } catch (e) { console.error(`[GROUP] assign propagation to #${sibId} failed:`, e.message); }
            }

            res.json({ message: 'Ticket assigné' });
        } catch (error) {
            console.error('[ASSIGN] Error:', error.message, error.stack?.split('\n')[1]);
            res.status(400).json({ message: error.message || 'Erreur lors de l\'assignation' });
        }
    },

    async assignToGroup(req, res) {
        try {
            const { group_id } = req.body;
            const ticketId = parseInt(req.params.id);
            if (!group_id) return res.status(400).json({ message: 'group_id requis' });

            const group = await pgDb.get('SELECT * FROM hub_tickets.technician_groups WHERE id = $1 AND is_active = true', [group_id]);
            if (!group) return res.status(404).json({ message: 'Groupe non trouvé' });

            const members = await pgDb.all('SELECT * FROM hub_tickets.technician_group_members WHERE group_id = $1', [group_id]);
            if (members.length === 0) return res.status(404).json({ message: `Aucun membre dans le groupe ${group.name}` });

            // Find least busy member as primary
            const leastBusy = await assignmentService.findLeastBusyInGroup(group_id);

            // Resolve acting user
            let resolvedUserId = req.user?.id;
            if (resolvedUserId && req.user?.username) {
                const exists = await pgDb.get('SELECT id FROM hub.users WHERE id = $1', [resolvedUserId]);
                if (!exists) {
                    const hubUser = await pgDb.get('SELECT id FROM hub.users WHERE LOWER(username) = LOWER($1)', [req.user.username]);
                    if (hubUser) resolvedUserId = hubUser.id;
                }
            }

            // Remove old assignments for this ticket first
            await pgDb.run('DELETE FROM hub_tickets.ticket_assignments WHERE ticket_id = $1', [ticketId]);

            // Log group escalade event
            try {
                await historyRepo.log(ticketId, resolvedUserId, 'assigned_group', 'group_id', '', String(group_id), `Escaladé au groupe ${group.name}`, req.user.username);
            } catch (e) { console.error('[HISTORY] group escalade log failed:', e.message); }

            // Assign to all members of the group (skip individual history)
            for (const member of members) {
                const isPrimary = leastBusy && leastBusy.user_id === member.user_id;
                await assignmentService.assignToMultiple(ticketId, {
                    user_id: member.user_id,
                    group_id,
                    is_primary: isPrimary,
                    skipHistory: true
                }, req.user);
            }

            // Auto-change status if ticket is new
            const ticket = await ticketRepo.findById(ticketId);
            if (ticket && ticket.status === 1) {
                await ticketRepo.update(ticketId, { status: 2 });
                try {
                    await historyRepo.log(ticketId, resolvedUserId, 'status_changed', 'status', '1', '2', 'Escalade automatique', req.user.username);
                } catch (e) { console.error('[HISTORY] auto-status log failed:', e.message); }
            }

            // Propagate to sibling tickets
            const siblingIds = await groupRepo.getSiblingIds(ticketId);
            for (const sibId of siblingIds) {
                try {
                    await pgDb.run('DELETE FROM hub_tickets.ticket_assignments WHERE ticket_id = $1', [sibId]);
                    for (const member of members) {
                        await assignmentService.assignToMultiple(sibId, {
                            user_id: member.user_id,
                            group_id,
                            is_primary: leastBusy && leastBusy.user_id === member.user_id,
                            skipHistory: true
                        }, req.user);
                    }
                } catch (e) { console.error(`[GROUP] assign propagation to #${sibId} failed:`, e.message); }
            }

            res.json({ message: `Ticket escaladé vers le groupe ${group.name} (${members.length} membres assignés)` });
        } catch (error) {
            console.error('[ASSIGN-GROUP] error:', error);
            res.status(400).json({ message: error.message });
        }
    },

    async changeStatus(req, res) {
        try {
            const { status, comment } = req.body;
            const ticketId = parseInt(req.params.id);
            await workflowService.changeStatus(ticketId, parseInt(status), req.user.id, comment, req.user);

            // Propagation aux membres du même groupe (ticket_group_members)
            const siblingIds = await groupRepo.getSiblingIds(ticketId);
            for (const sibId of siblingIds) {
                try {
                    await workflowService.changeStatus(sibId, parseInt(status), req.user.id,
                        `Propagé depuis #${ticketId} (groupe)`, req.user);
                } catch (e) { console.error(`[GROUP] status propagation to #${sibId} failed:`, e.message); }
            }

            // Propagation aux tickets liés si ce ticket est chef de groupe (problem_ticket_id)
            const linkedIds = await groupRepo.getLinkedMemberIds(ticketId);
            for (const linkedId of linkedIds) {
                if (siblingIds.includes(linkedId)) continue;
                try {
                    await workflowService.changeStatus(linkedId, parseInt(status), req.user.id,
                        `Propagé depuis #${ticketId} (chef de groupe)`, req.user);
                } catch (e) { console.error(`[GROUP] linked status propagation to #${linkedId} failed:`, e.message); }
            }

            res.json({ message: 'Statut mis à jour' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    async changeType(req, res) {
        try {
            const ticketId = parseInt(req.params.id);
            const typeNum = parseInt(req.body.type);
            if (![1, 2].includes(typeNum)) {
                return res.status(400).json({ message: 'Type invalide : 1=Incident, 2=Demande' });
            }
            const ticket = await ticketRepo.findById(ticketId);
            if (!ticket) return res.status(404).json({ message: 'Ticket non trouvé' });
            if (String(ticket.type) === '3') {
                return res.status(400).json({ message: 'Impossible de changer le type d\'un ticket Problème' });
            }

            let resolvedUserId = req.user?.id;
            if (resolvedUserId && req.user?.username) {
                const exists = await pgDb.get('SELECT id FROM hub.users WHERE id = $1', [resolvedUserId]);
                if (!exists) {
                    const hubUser = await pgDb.get('SELECT id FROM hub.users WHERE LOWER(username) = LOWER($1)', [req.user.username]);
                    if (hubUser) resolvedUserId = hubUser.id;
                }
            }

            await ticketRepo.update(ticketId, { type: typeNum });
            try {
                await historyRepo.log(ticketId, resolvedUserId, 'type_changed', 'type',
                    String(ticket.type), String(typeNum), null, req.user.username || null);
            } catch (e) { console.error('[HISTORY] type_changed log failed:', e.message); }

            res.json({ message: 'Type modifié' });
        } catch (error) {
            res.status(500).json({ message: error.message });
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
                    `Ticket ${newVip ? 'marqué VIP' : 'retiré VIP'} par ${req.user.displayName || req.user.username}`, req.user.username);
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
            console.error('[OBSERVERS] findByTicket error:', error.message);
            res.status(500).json({ message: error.message, details: error.stack });
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

            // Rattache au message les pièces jointes (fichier manuel + docs KB/logiciel)
            await linkAttachmentsToComment(req.body.attachment_ids, comment.id, ticketId);

            try {
                await historyRepo.log(ticketId, req.user.id, 'comment_added', null, null, null,
                    `Commentaire ${is_private ? 'interne ' : ''}ajouté par ${req.user.displayName || req.user.username}`, req.user.username);
            } catch (e) { console.error('[HISTORY] addComment log failed:', e.message); }
            // Première réponse SLA si commentaire public
            if (!is_private) {
                await slaRepo.setFirstResponse(ticketId);
            }

            await notificationService.trigger('ticket.comment_added', { ticket_id: ticketId, comment, user: req.user });

            // Propagation du commentaire à tous les membres du groupe
            const siblingIds = await groupRepo.getSiblingIds(ticketId);
            for (const sibId of siblingIds) {
                try {
                    await commentRepo.create(sibId, { content, is_private }, req.user);
                    await historyRepo.log(sibId, req.user.id, 'comment_added', null, null, null,
                        `Commentaire propagé depuis #${ticketId} (groupe)`, req.user.username);
                } catch (e) { console.error(`[GROUP] comment propagation to #${sibId} failed:`, e.message); }
            }

            res.status(201).json(comment);
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    async sendCommentToRequester(req, res) {
        try {
            const { content, is_private = 0, cc_observers = false } = req.body;
            const ticketId = parseInt(req.params.id);
            const ticket = await ticketService.findById(ticketId, req.user);
            if (!ticket) return res.status(404).json({ message: 'Ticket non trouvé' });

            const requesterEmail = ticket.requester?.email;
            if (!requesterEmail) return res.status(400).json({ message: 'Aucun email demandeur trouvé' });

            const comment = await commentRepo.create(ticketId, { content, is_private: is_private ? 1 : 0, sent_to_user: 1 }, req.user);

            // Documents joints (base de connaissance / doc logiciel) : rattachés au
            // ticket et envoyés en pièce jointe de l'email (pas de lien inline).
            // Rattache au message les pièces jointes pour l'affichage sous le commentaire
            await linkAttachmentsToComment(req.body.attachment_ids, comment.id, ticketId);

            // Pièces jointes du ticket (fichier manuel + docs KB/logiciel déjà attachés
            // au ticket côté client) → renvoyées en pièces jointes de l'email.
            const idFiles = [];
            for (const aid of (Array.isArray(req.body.attachment_ids) ? req.body.attachment_ids : [])) {
                try { const f = await readTicketAttachmentFile(aid); if (f) idFiles.push(f); }
                catch (e) { console.error('[ATTACH] lecture PJ ticket échouée:', e.message); }
            }
            const mailAttachments = idFiles.map(f => ({
                filename: f.originalname,
                content: f.buffer.toString('base64'),
            }));

            // Première réponse SLA (un envoi au demandeur compte comme réponse)
            await slaRepo.setFirstResponse(ticketId);

            try {
                await historyRepo.log(ticketId, req.user.id, 'comment_sent_to_requester', null, null, null,
                    `Commentaire envoyé par email au demandeur par ${req.user.displayName || req.user.username}`, req.user.username);
            } catch (e) { console.error('[HISTORY] sendComment log failed:', e.message); }

            if (_sendMail) {
                const authorName = req.user.displayName || req.user.username;
                const replyToken = makeReplyToken(ticketId, requesterEmail);
                const replyUrl = `${await getAppBaseUrl()}/repondre/${replyToken}`;

                let subject, body;
                try {
                    const tplRows = await pgDb.all(
                        "SELECT * FROM hub_tickets.notification_templates WHERE slug = 'ticket_comment_reply' AND is_active = true"
                    );
                    if (tplRows.length > 0) {
                        const tpl = tplRows[0];
                        const tplContext = {
                            ticket: {
                                glpi_id: ticketId,
                                title: ticket.title || '',
                                content: ticket.content || '',
                                requester_name: ticket.requester?.name || '',
                                priority: ticket.priority,
                                type: ticket.type,
                                status: ticket.status,
                            },
                            recipient: {
                                name: ticket.requester?.name || '',
                                email: requesterEmail,
                            },
                            user: req.user,
                            comment: { content },
                            reply_url: replyUrl,
                        };
                        subject = notificationService.fillTemplate(tpl.subject, tplContext);
                        body = notificationService.fillTemplate(tpl.body_html, tplContext);
                    } else {
                        subject = `[Ticket #${ticketId}] Réponse à votre demande`;
                        body = `<p>Bonjour ${ticket.requester?.name || ''},</p>
                            <p>Vous avez reçu une réponse concernant votre ticket <strong>#${ticketId} – ${ticket.title}</strong> :</p>
                            <blockquote style="border-left:4px solid #6366f1;padding-left:12px;margin:12px 0;color:#374151;">${content}</blockquote>
                            <p style="margin-top:16px;"><a href="${replyUrl}" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">↩ Répondre à ce message</a></p>
                            <p style="font-size:12px;color:#94a3b8;">Ou copiez ce lien : ${replyUrl}</p>
                            <p>Cordialement,<br>${authorName}</p>`;
                    }
                } catch (tplErr) {
                    console.error('[NOTIFICATION] Template lookup failed, using fallback:', tplErr.message);
                    subject = `[Ticket #${ticketId}] Réponse à votre demande`;
                    body = `<p>Bonjour ${ticket.requester?.name || ''},</p>
                        <p>Vous avez reçu une réponse concernant votre ticket <strong>#${ticketId} – ${ticket.title}</strong> :</p>
                        <blockquote style="border-left:4px solid #6366f1;padding-left:12px;margin:12px 0;color:#374151;">${content}</blockquote>
                        <p style="margin-top:16px;"><a href="${replyUrl}" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">↩ Répondre à ce message</a></p>
                        <p style="font-size:12px;color:#94a3b8;">Ou copiez ce lien : ${replyUrl}</p>
                        <p>Cordialement,<br>${authorName}</p>`;
                }

                if (mailAttachments.length > 0) {
                    // La file d'attente ne transporte pas les pièces jointes : envoi direct.
                    try {
                        await _sendMail(requesterEmail, subject, body, mailAttachments);
                    } catch (mErr) {
                        console.error('[NOTIFICATION] Envoi direct avec PJ échoué:', mErr.message);
                    }
                } else {
                    try {
                        const dup = await pgDb.get(`
                            SELECT id FROM hub_tickets.notification_queue
                            WHERE ticket_id = $1 AND recipient_email = $2 AND subject = $3 AND status = 'pending'
                        `, [ticketId, requesterEmail, subject]);
                        if (!dup) {
                            await pgDb.run(`
                                INSERT INTO hub_tickets.notification_queue
                                    (ticket_id, recipient_email, recipient_name, subject, body_html, status)
                                VALUES ($1, $2, $3, $4, $5, 'pending')
                            `, [ticketId, requesterEmail, ticket.requester?.name || '', subject, body]);
                        }
                    } catch (qErr) {
                        console.error('[NOTIFICATION] Queue insert failed, sending directly:', qErr.message);
                        await _sendMail(requesterEmail, subject, body);
                    }
                }

                if (cc_observers) {
                    const obs = await observerRepo.findByTicket(ticketId);
                    for (const o of obs) {
                        if (o.email && o.email !== requesterEmail) {
                            try { await _sendMail(o.email, `[CC] ${subject}`, body, mailAttachments); } catch { /**/ }
                        }
                    }
                }
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
                await historyRepo.log(ticketId, req.user.id, action || 'activity', null, null, null, comment || null, req.user.username);
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

    // Attache au ticket un document de la base de connaissance ou un document
    // logiciel magapp (résolu en fichier côté serveur). Renvoie la pièce jointe créée.
    async attachDoc(req, res) {
        try {
            const { source, id } = req.body;
            const files = await resolveDocFiles([{ source, id }]);
            if (!files.length) return res.status(404).json({ message: 'Document introuvable ou non joignable' });
            const att = await attachmentRepo.create(parseInt(req.params.id), files[0], req.user);
            res.status(201).json(att);
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    async downloadAttachment(req, res) {
        try {
            const file = await attachmentRepo.findById(parseInt(req.params.aid));
            if (!file) return res.status(404).json({ message: 'Fichier non trouvé' });
            const path = require('path');
            // Défaut : inline (prévisualisation navigateur). Forcer DL via ?mode=attachment.
            const disposition = req.query.mode === 'attachment' ? 'attachment' : 'inline';

            if (storage.isStoragePath(file.file_path)) {
                const f = await storage.getFileForServe(file.file_path);
                if (!f) return res.status(404).json({ message: 'Fichier introuvable sur le stockage' });
                res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(file.original_name)}"`);
                res.type(file.mimetype || path.extname(file.original_name) || 'application/octet-stream');
                if (f.absolutePath) return res.sendFile(f.absolutePath);
                return res.send(f.buffer);
            }

            // Fallback legacy
            res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(file.original_name)}"`);
            res.type(file.mimetype || path.extname(file.original_name) || 'application/octet-stream');
            res.sendFile(file.file_path);
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
            const ids = new Set();
            for (const h of history) {
                if (h.action === 'assigned' && h.new_value) ids.add(String(h.new_value));
                if (h.action === 'assigned' && h.old_value) ids.add(String(h.old_value));
                if (h.action === 'assigned_group' && h.new_value) ids.add(String(h.new_value));
            }
            const names = {};
            if (ids.size > 0) {
                const userRows = await pgDb.all(`SELECT id, displayName FROM hub.users WHERE id IN (${Array.from(ids).join(',')})`);
                for (const r of userRows) names[String(r.id)] = r.displayname || r.displayName;
                const groupRows = await pgDb.all(`SELECT id, name FROM hub_tickets.technician_groups WHERE id IN (${Array.from(ids).join(',')})`);
                for (const r of groupRows) names[`g${r.id}`] = r.name;
            }
            const enriched = history.map(h => {
                const row = { ...h };
                if (h.action === 'assigned') {
                    if (h.new_value && names[String(h.new_value)]) row.new_value_label = names[String(h.new_value)];
                    if (h.old_value && names[String(h.old_value)]) row.old_value_label = names[String(h.old_value)];
                }
                if (h.action === 'assigned_group') {
                    if (h.new_value && names[`g${h.new_value}`]) row.new_value_label = names[`g${h.new_value}`];
                    if (h.old_value && names[`g${h.old_value}`]) row.old_value_label = names[`g${h.old_value}`];
                }
                return row;
            });
            res.json(enriched);
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
    async getTicketsStats(req, res) {
        try {
            const stats = await ticketService.getTicketsStats({ from: req.query.from, to: req.query.to, group_id: req.query.group_id });
            res.json(stats);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async getDashboardStats(req, res) {
        try {
            const filters = {
                category_id: req.query.category_id,
                subcategory_id: req.query.subcategory_id,
                software_id: req.query.software_id,
                group_id: req.query.group_id,
                technician_id: req.query.technician_id,
                requester_email: req.query.requester_email,
                search: req.query.search,
            };
            const stats = await ticketService.getDashboardStats(req.user, filters);
            res.json(stats);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    async getTicketCountsBySoftware(req, res) {
        try {
            const data = await pgDb.all(`
                SELECT
                    t.software_id,
                    a.name as software_name,
                    COUNT(t.glpi_id) as ticket_count,
                    COUNT(t.glpi_id) FILTER (WHERE t.type::text = '1') as incident_count,
                    COUNT(t.glpi_id) FILTER (WHERE t.type::text = '2') as request_count
                FROM hub_tickets.tickets t
                LEFT JOIN magapp.apps a ON t.software_id = a.id
                WHERE t.status::integer <= 4
                GROUP BY t.software_id, a.name
                ORDER BY ticket_count DESC
            `, []);
            res.json(data);
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
            const [rows, adResults] = await Promise.all([
                pgDb.all(`
                    SELECT id, "displayName", email, username
                    FROM hub.users
                    WHERE LOWER(email) LIKE LOWER($1) OR LOWER("displayName") LIKE LOWER($1)
                    LIMIT 20
                `, [`%${q}%`]),
                (async () => {
                    try {
                        const sqlite = getSqlite();
                        const adSettings = await sqlite?.get('SELECT * FROM ad_settings WHERE id = 1');
                        if (!adSettings?.is_enabled) return [];
                        return await searchADUsersByQuery(q, adSettings);
                    } catch { return []; }
                })(),
            ]);
            const hubMap = new Map(rows.map(r => [r.username.toLowerCase(), r]));
            const seen = new Set(rows.map(r => r.username.toLowerCase()));
            const merged = [
                ...rows.map(r => ({ id: r.id, name: r.displayName, email: r.email, username: r.username })),
                ...adResults
                    .filter(u => !seen.has(u.username.toLowerCase()))
                    .map(u => {
                        seen.add(u.username.toLowerCase());
                        const match = hubMap.get(u.username.toLowerCase());
                        return { id: match?.id || null, name: u.displayName, email: u.email, username: u.username };
                    }),
            ];
            res.json(merged);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    // ─── Observer management ──────────────────────────────────────
    async addObserver(req, res) {
        try {
            const { user_id, name, email, username } = req.body;
            const ticketId = parseInt(req.params.id);
            let finalUserId = user_id;
            console.log('[ADD_OBSERVER] ticket=%s body=%j', ticketId, { user_id, name, email, username });
            if (!finalUserId) {
                const existing = await pgDb.get('SELECT id FROM hub.users WHERE LOWER(username) = LOWER($1)', [username || '']);
                if (existing) {
                    finalUserId = existing.id;
                    console.log('[ADD_OBSERVER] found existing hub.user id=%s for username=%s', finalUserId, username);
                } else {
                    const result = await pgDb.run(
                        'INSERT INTO hub.users (username, "displayName", email, role) VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO UPDATE SET "displayName" = EXCLUDED."displayName" RETURNING id',
                        [username || name, name || username, email || '', 'user']
                    );
                    finalUserId = result.lastID || result.id;
                    console.log('[ADD_OBSERVER] created hub.user id=%s for username=%s', finalUserId, username);
                }
            }
            if (!finalUserId) return res.status(400).json({ message: 'Impossible de déterminer l\'utilisateur' });
            await observerRepo.add(ticketId, finalUserId, { displayName: name, username, email });
            console.log('[ADD_OBSERVER] success: added user %s to ticket %s', finalUserId, ticketId);
            await historyRepo.log(ticketId, req.user.id, 'observer_added', 'observer', null, String(finalUserId), 'Observateur ajouté', req.user.username);
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
            await historyRepo.log(ticketId, req.user.id, 'observer_removed', 'observer', null, String(userId), 'Observateur retiré', req.user.username);
            res.json({ message: 'Observateur retiré' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    // ─── AI Reformulate ──────────────────────────────────────────
    async reformulateText(req, res) {
        try {
            const { text } = req.body;
            if (!text || !text.trim()) return res.status(400).json({ message: 'Texte requis' });

            const sqlite = getSqlite();
            const keys = ['ai_provider', 'groq_api_key', 'openrouter_api_key', 'anthropic_api_key', 'ollama_host', 'anthropic_model', 'default_model', 'ai_reformulate_prompt'];
            const cfg = {};
            for (const k of keys) {
                const row = await sqlite.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', [k]);
                const raw = row?.setting_value ? String(row.setting_value) : '';
                // Prompt stays as-is (body, not header); all other values go in HTTP headers or URLs — whitelist printable ASCII only
                cfg[k] = k === 'ai_reformulate_prompt'
                    ? raw.replace(/[\r\n\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim()
                    : raw.replace(/[^\x20-\x7E]/g, '').trim();
            }

            const provider = cfg.ai_provider || 'groq';
            const defaultPrompt = 'Reformule ce commentaire de manière professionnelle et claire, en conservant le sens exact. Réponds uniquement avec le texte reformulé, sans introduction ni commentaire.\n\nTexte original:\n{{text}}';
            const prompt = (cfg.ai_reformulate_prompt || defaultPrompt).replace('{{text}}', text);

            let result = '';

            if (provider === 'anthropic' && cfg.anthropic_api_key) {
                const model = cfg.anthropic_model || 'claude-3-5-sonnet-20240620';
                const resp = await axios.post('https://api.anthropic.com/v1/messages',
                    { model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] },
                    { headers: { 'x-api-key': cfg.anthropic_api_key, 'anthropic-version': '2023-06-01' } }
                );
                result = resp.data?.content?.[0]?.text || '';
            } else if (provider === 'ollama' && cfg.ollama_host) {
                const host = cfg.ollama_host.replace(/\/+$/, '');
                const resp = await axios.post(`${host}/api/generate`,
                    { model: cfg.default_model || 'llama3', prompt, stream: false }
                );
                result = resp.data?.response || '';
            } else {
                const apiKey = provider === 'openrouter' ? cfg.openrouter_api_key : cfg.groq_api_key;
                const baseURL = provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://api.groq.com/openai/v1';
                const model = cfg.default_model || (provider === 'openrouter' ? 'google/gemini-2.0-flash-001' : 'llama-3.3-70b-versatile');
                const resp = await axios.post(`${baseURL}/chat/completions`,
                    { model, messages: [{ role: 'user', content: prompt }], max_tokens: 1024 },
                    { headers: { Authorization: `Bearer ${apiKey}` } }
                );
                result = resp.data?.choices?.[0]?.message?.content || '';
            }

            res.json({ result: result.trim() });
        } catch (error) {
            const msg = error.response?.data?.error?.message || error.response?.data?.message || error.message || 'Erreur lors de la reformulation';
            res.status(500).json({ message: msg });
        }
    },

    // ─── Public reply (no auth) ───────────────────────────────────
    getReplyFormInfo: async function(req, res) {
        const info = verifyReplyToken(req.params.token);
        if (!info) return res.status(400).json({ message: 'Lien invalide ou expiré' });
        const ticket = await ticketRepo.findById(info.ticketId);
        if (!ticket) return res.status(404).json({ message: 'Ticket non trouvé' });
        const lastQuestion = await pgDb.get(`
            SELECT content, author_name, date_creation
            FROM hub_tickets.ticket_followups
            WHERE ticket_id = $1 AND sent_to_user = 1
            ORDER BY date_creation DESC
            LIMIT 1
        `, [info.ticketId]);
        res.json({
            ticketId: info.ticketId, title: ticket.title, email: info.email,
            description: ticket.content || null,
            lastQuestion: lastQuestion || null
        });
    },

    submitPublicReply: async function(req, res) {
        const info = verifyReplyToken(req.params.token);
        if (!info) return res.status(400).json({ message: 'Lien invalide ou expiré' });
        const { content } = req.body;
        if (!content || !content.trim()) return res.status(400).json({ message: 'Contenu requis' });

        const ticket = await ticketRepo.findById(info.ticketId);
        if (!ticket) return res.status(404).json({ message: 'Ticket non trouvé' });

        const fakeUser = { displayName: ticket.requester_name || info.email, username: info.email, email: info.email, id: null };
        await commentRepo.create(info.ticketId, { content, is_private: 0 }, fakeUser);
        res.json({ message: 'Réponse envoyée avec succès' });
    },

    // ── GET /api/tickets/dashboard/live-stats ──────────────────────
    async getLiveStats(req, res) {
        try {
            const [totals, active, durations, byTech, daily] = await Promise.all([
                pgDb.get(`
                    SELECT
                        COUNT(*) FILTER (WHERE true) AS total,
                        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS today,
                        COUNT(*) FILTER (WHERE created_at >= date_trunc('week', NOW())) AS this_week,
                        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW())) AS this_month
                    FROM hub_tickets.live_sessions
                `),
                pgDb.get(`SELECT COUNT(*) as count FROM hub_tickets.live_sessions WHERE status NOT IN ('closed', 'pre_closed')`),
                pgDb.get(`
                    SELECT
                        ROUND(AVG(EXTRACT(EPOCH FROM (closed_at - claimed_at)) / 60)::numeric, 1) AS avg_duration_min,
                        ROUND(AVG(EXTRACT(EPOCH FROM (claimed_at - created_at)) / 60)::numeric, 1) AS avg_response_min
                    FROM hub_tickets.live_sessions
                    WHERE closed_at IS NOT NULL AND claimed_at IS NOT NULL
                `),
                pgDb.all(`
                    SELECT tech_display_name AS tech, COUNT(*) AS count
                    FROM hub_tickets.live_sessions
                    WHERE tech_username IS NOT NULL
                    GROUP BY tech_display_name ORDER BY count DESC LIMIT 10
                `),
                pgDb.all(`
                    SELECT TO_CHAR(created_at AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS day,
                           COUNT(*) AS count
                    FROM hub_tickets.live_sessions
                    WHERE created_at >= NOW() - INTERVAL '30 days'
                    GROUP BY day ORDER BY day
                `),
            ]);

            res.json({
                total:            parseInt(totals?.total  || 0),
                today:            parseInt(totals?.today  || 0),
                this_week:        parseInt(totals?.this_week || 0),
                this_month:       parseInt(totals?.this_month || 0),
                active:           parseInt(active?.count  || 0),
                avg_duration_min: parseFloat(durations?.avg_duration_min || 0),
                avg_response_min: parseFloat(durations?.avg_response_min || 0),
                by_tech: (byTech || []).map(r => ({ tech: r.tech, count: parseInt(r.count) })),
                daily:   (daily  || []).map(r => ({ day: r.day, count: parseInt(r.count) })),
            });
        } catch (e) {
            console.error('[LIVE] getStats error:', e);
            res.status(500).json({ message: e.message });
        }
    },
};
