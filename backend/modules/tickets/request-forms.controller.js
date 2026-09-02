/**
 * Formulaires de demande paramétrables (Admin Tickets -> "Formulaires de
 * demande"), remplis côté public par le portail magapp, qui génèrent
 * automatiquement un ticket. Mécanisme de champs inspiré du form-builder
 * d'onboarding de Studio-RH : un blob JSON de champs par formulaire
 * (fields_config), types text/textarea/select/boolean/agent/direction_service/date,
 * avec affichage conditionnel simple (conditional_on).
 */
const { pgDb } = require('../../shared/database');
const ticketService = require('./services/ticket.service');
const { resolveTicketRole } = require('./middleware/ticket-permissions');
const encadrantsController = require('../rh/encadrants.controller');

const TICKET_ADMIN_ROLES = ['supervisor', 'admin', 'superadmin'];

const ALLOWED_FIELD_TYPES = ['text', 'textarea', 'select', 'boolean', 'agent', 'agent_multi', 'direction_service', 'date', 'description'];
const ENCADRANT_ROLES = ['dg', 'directeur', 'responsable_service'];

// Cache en mémoire (15 min) de l'email -> rôle d'encadrant (dg/directeur/
// responsable_service), pour ne pas relancer la recherche AD/LDAP de
// GET /api/admin/rh/encadrants à chaque affichage du portail magapp.
let encadrantsRoleCache = { map: null, expiresAt: 0 };

async function getEncadrantsRoleMap() {
    if (encadrantsRoleCache.map && Date.now() < encadrantsRoleCache.expiresAt) {
        return encadrantsRoleCache.map;
    }
    const map = new Map();
    await new Promise((resolve) => {
        const fakeRes = {
            status: () => fakeRes,
            json: (data) => {
                (Array.isArray(data) ? data : []).forEach((e) => {
                    if (e.email) map.set(String(e.email).toLowerCase(), e.role);
                });
                resolve();
            },
        };
        Promise.resolve(encadrantsController.getEncadrants({}, fakeRes)).catch(() => resolve());
    });
    encadrantsRoleCache = { map, expiresAt: Date.now() + 15 * 60 * 1000 };
    return map;
}

/** Rôle d'encadrant (dg/directeur/responsable_service) de l'utilisateur connecté, ou null. */
async function getUserEncadrantRole(user) {
    if (!user || !user.email) return null;
    const map = await getEncadrantsRoleMap();
    return map.get(String(user.email).toLowerCase()) || null;
}

/** Un formulaire sans restriction (allowed_roles vide) est visible de tous. */
function isFormAllowedForRole(form, role) {
    const restrictions = Array.isArray(form.allowed_roles) ? form.allowed_roles : [];
    if (restrictions.length === 0) return true;
    return !!role && restrictions.includes(role);
}

/** Normalise/valide un tableau de définitions de champs avant sauvegarde. */
function sanitizeFieldsConfig(fields) {
    if (!Array.isArray(fields)) return [];
    return fields.map((f, i) => ({
        key: String(f.key || `champ_${i + 1}`).trim(),
        label: String(f.label || '').trim(),
        description: String(f.description || ''),
        type: ALLOWED_FIELD_TYPES.includes(f.type) ? f.type : 'text',
        required: !!f.required,
        // Placement dans la grille du formulaire (cf hub.request_forms.columns) :
        // column_start = colonne de depart (1-indexee, null = enchainement auto),
        // column_span = largeur en nombre de colonnes.
        column_start: Number.isInteger(f.column_start) && f.column_start > 0 ? f.column_start : null,
        column_span: Number.isInteger(f.column_span) && f.column_span > 0 ? f.column_span : 1,
        options: Array.isArray(f.options) ? f.options.filter((o) => typeof o === 'string' && o.trim()) : [],
        conditional_on: (f.conditional_on && f.conditional_on.field && f.conditional_on.equals !== undefined)
            ? { field: String(f.conditional_on.field), equals: f.conditional_on.equals }
            : null,
    }));
}

/** Rend une réponse de champ lisible pour l'insertion dans le contenu du ticket. */
function formatAnswer(field, value) {
    if (value === null || value === undefined || value === '') return '—';
    switch (field.type) {
        case 'boolean':
            return value === true || value === 'true' ? 'Oui' : 'Non';
        case 'agent':
            return typeof value === 'object' ? `${value.displayName || value.name || ''} (${value.email || ''})` : String(value);
        case 'agent_multi':
            if (Array.isArray(value)) {
                return value.length > 0
                    ? value.map((v) => `${v.displayName || v.name || ''} (${v.email || ''})`).join('\n')
                    : '—';
            }
            return String(value);
        case 'direction_service':
            if (typeof value === 'object') {
                return [value.direction_label, value.service_label].filter(Boolean).join(' / ') || '—';
            }
            return String(value);
        default:
            return String(value);
    }
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Construit le contenu HTML du ticket (le champ content est affiché en HTML côté ticket). */
function buildTicketContentHtml(formName, fields, answers) {
    const rows = fields
        .filter((f) => f.type !== 'description')
        .map((f) => `<tr><td style="padding:4px 14px 4px 0;font-weight:600;white-space:nowrap;vertical-align:top;">${escapeHtml(f.label)}</td><td style="padding:4px 0;">${escapeHtml(formatAnswer(f, answers[f.key])).replace(/\n/g, '<br>')}</td></tr>`)
        .join('');
    return `<p>Demande générée depuis le formulaire « ${escapeHtml(formName)} »</p><table style="border-collapse:collapse;">${rows}</table>`;
}

module.exports = {
    // GET /api/request-forms/admin
    listAdmin: async (req, res) => {
        try {
            const forms = await pgDb.all(`
                SELECT f.*, c.name AS category_name, sc.name AS subcategory_name
                FROM hub.request_forms f
                LEFT JOIN hub_tickets.ticket_categories c ON c.id = f.category_id
                LEFT JOIN hub_tickets.ticket_categories sc ON sc.id = f.subcategory_id
                ORDER BY f.sort_order, f.name
            `);
            res.json(forms);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la récupération des formulaires', error: error.message });
        }
    },

    // POST /api/request-forms/admin
    createForm: async (req, res) => {
        try {
            const { name = '', description = '' } = req.body;
            if (!name.trim()) return res.status(400).json({ message: 'Le nom du formulaire est requis' });
            const result = await pgDb.run(
                'INSERT INTO hub.request_forms (name, description, fields_config) VALUES (?, ?, ?)',
                [name.trim(), description, JSON.stringify([])]
            );
            const form = await pgDb.get('SELECT * FROM hub.request_forms WHERE id = ?', [result.lastID]);
            res.status(201).json(form);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la création du formulaire', error: error.message });
        }
    },

    // PUT /api/request-forms/admin/:id
    updateForm: async (req, res) => {
        try {
            const allowedFields = ['name', 'description', 'category_id', 'subcategory_id', 'is_published', 'sort_order', 'icon', 'columns'];
            const updates = [];
            const values = [];
            allowedFields.forEach((field) => {
                if (req.body[field] !== undefined) {
                    updates.push(`${field} = ?`);
                    const isIdField = field === 'category_id' || field === 'subcategory_id';
                    values.push(req.body[field] === '' && isIdField ? null : req.body[field]);
                }
            });
            if (req.body.fields_config !== undefined) {
                updates.push('fields_config = ?');
                values.push(JSON.stringify(sanitizeFieldsConfig(req.body.fields_config)));
            }
            if (req.body.allowed_roles !== undefined) {
                const roles = Array.isArray(req.body.allowed_roles)
                    ? req.body.allowed_roles.filter((r) => ENCADRANT_ROLES.includes(r))
                    : [];
                updates.push('allowed_roles = ?');
                values.push(roles);
            }
            if (updates.length === 0) return res.status(400).json({ message: 'Aucun champ modifiable fourni' });
            updates.push('updated_at = CURRENT_TIMESTAMP');
            values.push(req.params.id);
            await pgDb.run(`UPDATE hub.request_forms SET ${updates.join(', ')} WHERE id = ?`, values);
            const form = await pgDb.get('SELECT * FROM hub.request_forms WHERE id = ?', [req.params.id]);
            if (!form) return res.status(404).json({ message: 'Formulaire non trouvé' });
            res.json(form);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la mise à jour du formulaire', error: error.message });
        }
    },

    // DELETE /api/request-forms/admin/:id
    deleteForm: async (req, res) => {
        try {
            await pgDb.run('DELETE FROM hub.request_forms WHERE id = ?', [req.params.id]);
            res.json({ message: 'Formulaire supprimé' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la suppression du formulaire', error: error.message });
        }
    },

    // GET /api/request-forms/published — portail magapp, tout utilisateur connecté
    listPublished: async (req, res) => {
        try {
            const forms = await pgDb.all(
                "SELECT id, name, description, fields_config, allowed_roles, icon, columns FROM hub.request_forms WHERE is_published = true ORDER BY sort_order, name"
            );
            const withRestriction = forms.some((f) => Array.isArray(f.allowed_roles) && f.allowed_roles.length > 0);
            const userRole = withRestriction ? await getUserEncadrantRole(req.user) : null;
            const visible = forms
                .filter((f) => isFormAllowedForRole(f, userRole))
                .map(({ allowed_roles, ...f }) => f);
            res.json(visible);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la récupération des formulaires', error: error.message });
        }
    },

    // GET /api/request-forms/:id — un formulaire (prévisualisation admin ou remplissage public)
    getOne: async (req, res) => {
        try {
            const form = await pgDb.get('SELECT * FROM hub.request_forms WHERE id = ?', [req.params.id]);
            if (!form) return res.status(404).json({ message: 'Formulaire non trouvé' });
            const role = await resolveTicketRole(req.user);
            const isAdmin = TICKET_ADMIN_ROLES.includes(role);
            if (!form.is_published && !isAdmin) {
                return res.status(403).json({ message: 'Formulaire non publié' });
            }
            if (!isAdmin) {
                const userRole = await getUserEncadrantRole(req.user);
                if (!isFormAllowedForRole(form, userRole)) {
                    return res.status(403).json({ message: 'Ce formulaire n\'est pas disponible pour votre profil' });
                }
            }
            res.json(form);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la récupération du formulaire', error: error.message });
        }
    },

    // POST /api/request-forms/:id/submit — soumission publique -> crée un ticket
    submit: async (req, res) => {
        try {
            const form = await pgDb.get('SELECT * FROM hub.request_forms WHERE id = ?', [req.params.id]);
            if (!form) return res.status(404).json({ message: 'Formulaire non trouvé' });
            if (!form.is_published) return res.status(403).json({ message: 'Ce formulaire n\'est plus disponible' });
            const userRole = await getUserEncadrantRole(req.user);
            if (!isFormAllowedForRole(form, userRole)) {
                return res.status(403).json({ message: 'Ce formulaire n\'est pas disponible pour votre profil' });
            }

            const fields = Array.isArray(form.fields_config) ? form.fields_config : JSON.parse(form.fields_config || '[]');
            const answers = req.body.answers || {};

            const isEmptyAnswer = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
            const missing = fields.filter((f) => f.type !== 'description' && f.required && isEmptyAnswer(answers[f.key]));
            if (missing.length > 0) {
                return res.status(400).json({ message: `Champ(s) requis manquant(s) : ${missing.map((f) => f.label).join(', ')}` });
            }

            const content = buildTicketContentHtml(form.name, fields, answers);

            const user = req.user;
            const ticketId = await ticketService.create({
                title: `${form.name} — ${user.displayName || user.username}`,
                content,
                type: 2,
                category_id: form.category_id || undefined,
                subcategory_id: form.subcategory_id || undefined,
                source: 'magapp',
            }, user);

            await pgDb.run(
                'INSERT INTO hub.request_form_submissions (form_id, submitted_by_username, submitted_by_name, submitted_by_email, answers, ticket_id) VALUES (?, ?, ?, ?, ?, ?)',
                [form.id, user.username, user.displayName || user.username, user.email, JSON.stringify(answers), ticketId]
            );

            res.status(201).json({ message: 'Demande envoyée', ticket_id: ticketId });
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de l\'envoi de la demande', error: error.message });
        }
    },
};
