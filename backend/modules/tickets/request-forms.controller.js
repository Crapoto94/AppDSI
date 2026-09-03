/**
 * Formulaires de demande paramétrables (Admin Tickets -> "Formulaires de
 * demande"), remplis côté public par le portail magapp, qui génèrent
 * automatiquement un ticket. Mécanisme de champs inspiré du form-builder
 * d'onboarding de Studio-RH : un blob JSON de champs par formulaire
 * (fields_config), types text/textarea/select/boolean/agent/direction_service/date,
 * avec affichage conditionnel simple (conditional_on).
 */
const { pgDb, getSqlite } = require('../../shared/database');
const ticketService = require('./services/ticket.service');
const { resolveTicketRole } = require('./middleware/ticket-permissions');
const encadrantsController = require('../rh/encadrants.controller');
const studioOnboarding = require('../infra/studio-onboarding');
const { randomUUID } = require('crypto');

const TICKET_ADMIN_ROLES = ['supervisor', 'admin', 'superadmin'];

const ALLOWED_FIELD_TYPES = ['text', 'textarea', 'select', 'boolean', 'agent', 'agent_multi', 'direction_service', 'date', 'description', 'studio_agent', 'studio_futurs_agent_picker'];
const ENCADRANT_ROLES = ['dg', 'directeur', 'responsable_service'];

// Actions spéciales exécutées en plus de la création normale du ticket, à la
// soumission d'un formulaire. 'onboarding_rhstudio' (formulaire "Arrivée
// d'agent") attend des CLÉS DE CHAMP FIXES dans fields_config (peu importe
// leur libellé/ordre/type exact du moment que la clé est respectée) :
//   - deja_arrive         (boolean)                    "L'agent est-il déjà arrivé ?"
//   - agent_arrive        (studio_agent)                utilisé si deja_arrive = true
//   - futurs_agent        (studio_futurs_agent_picker)  utilisé si deja_arrive = false
//   - manager             (studio_agent)                N+1 / manager, toujours requis
const ALLOWED_SPECIAL_ACTIONS = ['onboarding_rhstudio'];

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

// Cache en mémoire (15 min) : id de groupe particulier -> Set des emails
// (minuscules) de ses membres AD, pour ne pas relancer une recherche LDAP à
// chaque affichage du portail magapp. Comme getEncadrantsRoleMap ci-dessus,
// tous les groupes sont résolus en une passe puis mis en cache ensemble.
let customGroupsMemberCache = { map: null, expiresAt: 0 };

async function getCustomGroupsMemberMap() {
    if (customGroupsMemberCache.map && Date.now() < customGroupsMemberCache.expiresAt) {
        return customGroupsMemberCache.map;
    }
    const map = new Map();
    try {
        const groups = await pgDb.all('SELECT id, ad_group_dn FROM hub.custom_groups');
        if (groups.length > 0) {
            const db = getSqlite();
            const adSettings = await db.get('SELECT * FROM ad_settings WHERE id=1');
            if (adSettings && adSettings.is_enabled && adSettings.host) {
                for (const g of groups) {
                    try {
                        const members = await encadrantsController.searchADGroupMembersByDN(g.ad_group_dn, adSettings);
                        map.set(g.id, new Set(members.filter((m) => m.email).map((m) => m.email.toLowerCase())));
                    } catch (e) {
                        map.set(g.id, new Set());
                    }
                }
            }
        }
    } catch (e) { /* pas de groupe particulier défini, ou AD indisponible : map vide */ }
    customGroupsMemberCache = { map, expiresAt: Date.now() + 15 * 60 * 1000 };
    return map;
}

/**
 * Un formulaire sans restriction (ni allowed_roles ni allowed_group_ids) est
 * visible de tous. Sinon il faut correspondre à AU MOINS une des deux
 * restrictions (rôle d'encadrant OU membre d'un des groupes particuliers).
 */
async function isFormAllowedForUser(form, role, email) {
    const roleRestrictions = Array.isArray(form.allowed_roles) ? form.allowed_roles : [];
    const groupRestrictions = Array.isArray(form.allowed_group_ids) ? form.allowed_group_ids : [];
    if (roleRestrictions.length === 0 && groupRestrictions.length === 0) return true;
    if (role && roleRestrictions.includes(role)) return true;
    if (groupRestrictions.length > 0 && email) {
        const map = await getCustomGroupsMemberMap();
        const lower = String(email).toLowerCase();
        if (groupRestrictions.some((gid) => map.get(gid)?.has(lower))) return true;
    }
    return false;
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
        case 'studio_agent':
            return typeof value === 'object' ? `${value.displayName || ''} (${value.email || ''})` : String(value);
        case 'studio_futurs_agent_picker':
            if (typeof value === 'object') {
                const label = `${value.prenom || ''} ${value.nom || ''}`.trim() || '—';
                return value.mode === 'manual' ? `${label} (nouvel agent, pas encore dans RH Studio)` : label;
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

/**
 * Extrait un court extrait d'une réponse texte pour différencier le titre du
 * ticket entre deux soumissions distinctes du même formulaire par la même
 * personne. Nécessaire car ticket.repository.js#create considère comme
 * doublon (et renvoie l'id existant SANS rien créer) tout ticket de même
 * titre + même email dans les 2 dernières minutes — protection anti double-
 * clic légitime pour un ticket "normal" (titre déjà spécifique à la
 * demande), mais qui collapsait à tort deux VRAIES demandes différentes ici,
 * puisque le titre était jusque-là toujours "<nom du formulaire> — <nom de
 * l'agent>", identique pour toute soumission du même formulaire par la même
 * personne, quel que soit le contenu réel de la demande.
 */
function buildTicketTitleHint(fields, answers) {
    for (const f of fields) {
        const v = answers[f.key];
        if (v === undefined || v === null || v === '') continue;
        if (['text', 'textarea', 'select'].includes(f.type)) {
            const s = String(v).replace(/\s+/g, ' ').trim();
            if (s) return s.length > 40 ? `${s.slice(0, 40)}…` : s;
        } else if ((f.type === 'agent' || f.type === 'studio_agent') && v.displayName) {
            return v.displayName;
        } else if (f.type === 'agent_multi' && Array.isArray(v) && v.length > 0) {
            const names = v.map((a) => a.displayName).filter(Boolean).join(', ');
            if (names) return names.length > 40 ? `${names.slice(0, 40)}…` : names;
        } else if (f.type === 'studio_futurs_agent_picker' && (v.nom || v.prenom)) {
            const s = `${v.prenom || ''} ${v.nom || ''}`.trim();
            if (s) return s;
        }
    }
    // Repli ultime (formulaire sans champ identifiant, ex. uniquement des
    // booléens/dates) : un fragment temporel garantit tout de même
    // l'unicité entre deux soumissions distinctes, même à quelques
    // secondes d'écart.
    return null;
}

/**
 * Résout les réponses du formulaire "Arrivée d'agent" (clés fixes, cf.
 * ALLOWED_SPECIAL_ACTIONS ci-dessus) en un appel à l'API onboarding RH
 * Studio, et journalise le résultat (succès ou échec) dans l'historique du
 * ticket créé. Best-effort : une erreur ici n'annule jamais la création du
 * ticket, déjà actée à ce stade — l'utilisateur/l'admin doit pouvoir la voir
 * dans l'historique du ticket plutôt qu'elle ne se perde silencieusement.
 */
async function triggerOnboardingRhStudio(answers, ticketId, user) {
    const logHistory = async (action, comment) => {
        try {
            await pgDb.run(
                `INSERT INTO hub_tickets.ticket_history (ticket_id, user_id, action, field_name, old_value, new_value, comment) VALUES (?, ?, ?, NULL, NULL, NULL, ?)`,
                [ticketId, user?.id || null, action, comment]
            );
        } catch (e) { console.error('[request-forms] onboarding history log failed:', e.message); }
    };

    try {
        const dejaArrive = answers.deja_arrive === true || answers.deja_arrive === 'true';
        const manager = answers.manager;
        if (!manager || !manager.id) throw new Error('N+1 / manager non renseigné');

        const payload = { manager_id: manager.id, dsihub_ticket_id: ticketId };
        if (dejaArrive) {
            const agent = answers.agent_arrive;
            if (!agent || !agent.id) throw new Error('Agent arrivé non renseigné');
            payload.agent_id = agent.id;
        } else {
            const futurs = answers.futurs_agent;
            if (!futurs) throw new Error('Futur agent non renseigné');
            if (futurs.mode === 'existing') {
                payload.agent_id = futurs.agent_id;
                if (futurs.date_arrivee_prevue) payload.date_arrivee_prevue = futurs.date_arrivee_prevue;
            } else {
                if (!futurs.nom || !futurs.prenom) throw new Error('Nom/prénom du futur agent manquant');
                payload.nom_temp = futurs.nom;
                payload.prenom_temp = futurs.prenom;
            }
        }

        const onboarding = await studioOnboarding.createOnboarding(payload);
        await logHistory('onboarding_rhstudio', `Onboarding RH Studio déclenché (id #${onboarding.id})`);
        return { ok: true, id: onboarding.id };
    } catch (e) {
        console.error('[request-forms] triggerOnboardingRhStudio failed:', e.message);
        await logHistory('onboarding_rhstudio_failed', `Échec du déclenchement de l'onboarding RH Studio : ${e.message}`);
        return { ok: false, error: e.message };
    }
}

/**
 * Arbitrage : crée automatiquement une tâche DSI Hub liée au ticket créé par
 * ce formulaire, affectée à la personne ou au groupe choisi lors du
 * paramétrage (jamais les deux — cf. arbitrage_type). Best-effort, comme
 * triggerOnboardingRhStudio ci-dessus : un échec ne remet jamais en cause le
 * ticket déjà créé, juste journalisé dans son historique.
 */
async function createArbitrageTask(form, ticketId, ticketTitle) {
    if (!form.arbitrage_enabled) return null;
    const logHistory = async (action, comment) => {
        try {
            await pgDb.run(
                `INSERT INTO hub_tickets.ticket_history (ticket_id, user_id, action, field_name, old_value, new_value, comment) VALUES (?, NULL, ?, NULL, NULL, NULL, ?)`,
                [ticketId, action, comment]
            );
        } catch (e) { console.error('[request-forms] arbitrage history log failed:', e.message); }
    };

    try {
        let targets = [];
        let teamGroupName = null;
        if (form.arbitrage_type === 'group' && form.arbitrage_group_id) {
            const members = await pgDb.all(
                `SELECT u.username FROM hub_tickets.technician_group_members tgm
                 JOIN hub.users u ON u.id = tgm.user_id
                 WHERE tgm.group_id = ? AND u.username IS NOT NULL`,
                [form.arbitrage_group_id]
            );
            targets = members.map((m) => m.username);
            teamGroupName = form.arbitrage_group_name || null;
            if (targets.length === 0) throw new Error(`Le groupe d'arbitrage "${teamGroupName || form.arbitrage_group_id}" ne contient aucun membre`);
        } else if (form.arbitrage_type === 'user' && form.arbitrage_username) {
            targets = [form.arbitrage_username];
        } else {
            throw new Error('Arbitrage activé mais aucune personne/groupe configuré');
        }

        const description = `Arbitrage : ${form.name}`;
        const isTeamTask = targets.length > 1;
        const teamGroupId = isTeamTask ? randomUUID() : null;
        const createdIds = [];
        for (const uname of targets) {
            const result = await pgDb.run(
                `INSERT INTO hub.user_tasks
                   (username, description, statut, is_team_task, team_group_id, team_group_name, created_by,
                    context_source, context_id, context_title, priority, is_public, is_arbitrage)
                 VALUES (?, ?, 'a_faire', ?, ?, ?, 'request_form', 'ticket', ?, ?, 'normale', false, true)`,
                [uname, description, isTeamTask, teamGroupId, teamGroupName, ticketId, ticketTitle || null]
            );
            createdIds.push(result.lastID);
        }
        await logHistory('arbitrage_task_created', `Tâche d'arbitrage créée pour ${form.arbitrage_type === 'group' ? `le groupe "${teamGroupName}"` : form.arbitrage_username}`);
        return { ok: true, ids: createdIds };
    } catch (e) {
        console.error('[request-forms] createArbitrageTask failed:', e.message);
        await logHistory('arbitrage_task_failed', `Échec de création de la tâche d'arbitrage : ${e.message}`);
        return { ok: false, error: e.message };
    }
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
            if (req.body.allowed_group_ids !== undefined) {
                const groupIds = Array.isArray(req.body.allowed_group_ids)
                    ? req.body.allowed_group_ids.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)
                    : [];
                updates.push('allowed_group_ids = ?');
                values.push(groupIds);
            }
            if (req.body.special_action !== undefined) {
                const action = ALLOWED_SPECIAL_ACTIONS.includes(req.body.special_action) ? req.body.special_action : null;
                updates.push('special_action = ?');
                values.push(action);
            }
            if (req.body.arbitrage_enabled !== undefined) {
                updates.push('arbitrage_enabled = ?');
                values.push(!!req.body.arbitrage_enabled);
            }
            if (req.body.arbitrage_type !== undefined) {
                const type = ['user', 'group'].includes(req.body.arbitrage_type) ? req.body.arbitrage_type : null;
                updates.push('arbitrage_type = ?');
                values.push(type);
            }
            if (req.body.arbitrage_username !== undefined) {
                updates.push('arbitrage_username = ?');
                values.push(req.body.arbitrage_username || null);
            }
            if (req.body.arbitrage_group_id !== undefined) {
                const groupId = Number.isInteger(req.body.arbitrage_group_id) ? req.body.arbitrage_group_id : null;
                updates.push('arbitrage_group_id = ?');
                values.push(groupId);
            }
            if (req.body.arbitrage_group_name !== undefined) {
                updates.push('arbitrage_group_name = ?');
                values.push(req.body.arbitrage_group_name || null);
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
                "SELECT id, name, description, fields_config, allowed_roles, allowed_group_ids, icon, columns FROM hub.request_forms WHERE is_published = true ORDER BY sort_order, name"
            );
            const withRestriction = forms.some((f) =>
                (Array.isArray(f.allowed_roles) && f.allowed_roles.length > 0) ||
                (Array.isArray(f.allowed_group_ids) && f.allowed_group_ids.length > 0)
            );
            const userRole = withRestriction ? await getUserEncadrantRole(req.user) : null;
            const userEmail = req.user?.email;
            const visible = [];
            for (const f of forms) {
                if (await isFormAllowedForUser(f, userRole, userEmail)) {
                    const { allowed_roles, allowed_group_ids, ...rest } = f;
                    visible.push(rest);
                }
            }
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
                if (!await isFormAllowedForUser(form, userRole, req.user?.email)) {
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
            if (!await isFormAllowedForUser(form, userRole, req.user?.email)) {
                return res.status(403).json({ message: 'Ce formulaire n\'est pas disponible pour votre profil' });
            }

            const fields = Array.isArray(form.fields_config) ? form.fields_config : JSON.parse(form.fields_config || '[]');
            const answers = req.body.answers || {};

            const isEmptyAnswer = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
            // Un champ requis mais masqué (conditional_on non satisfait, cf.
            // isFieldVisible côté frontend requestFormTypes.ts) ne doit jamais
            // bloquer la soumission — il n'a jamais été présenté à l'utilisateur.
            const isVisible = (f) => !f.conditional_on || answers[f.conditional_on.field] === f.conditional_on.equals;
            const missing = fields.filter((f) => f.type !== 'description' && f.required && isVisible(f) && isEmptyAnswer(answers[f.key]));
            if (missing.length > 0) {
                return res.status(400).json({ message: `Champ(s) requis manquant(s) : ${missing.map((f) => f.label).join(', ')}` });
            }

            const content = buildTicketContentHtml(form.name, fields, answers);

            const user = req.user;
            // Repli ultime (formulaire sans champ identifiant, ex. uniquement
            // des booléens/dates) : un fragment temporel garantit tout de
            // même l'unicité entre deux soumissions distinctes, même
            // proches dans le temps — cf. buildTicketTitleHint ci-dessus.
            const titleHint = buildTicketTitleHint(fields, answers) || new Date().toLocaleTimeString('fr-FR');
            const ticketTitle = `${form.name} — ${user.displayName || user.username} (${titleHint})`;
            const ticketId = await ticketService.create({
                title: ticketTitle,
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

            let onboarding = null;
            if (form.special_action === 'onboarding_rhstudio') {
                onboarding = await triggerOnboardingRhStudio(answers, ticketId, user);
            }
            const arbitrage = await createArbitrageTask(form, ticketId, ticketTitle);

            res.status(201).json({
                message: 'Demande envoyée',
                ticket_id: ticketId,
                ...(onboarding ? { onboarding } : {}),
                ...(arbitrage ? { arbitrage } : {}),
            });
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de l\'envoi de la demande', error: error.message });
        }
    },
};
