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
const notificationService = require('./services/notification.service');
const { resolveTicketRole } = require('./middleware/ticket-permissions');
const encadrantsController = require('../rh/encadrants.controller');
const studioOnboarding = require('../infra/studio-onboarding');
const mailboxesService = require('../mailboxes/mailboxes.service');
const { randomUUID } = require('crypto');

const TICKET_ADMIN_ROLES = ['supervisor', 'admin', 'superadmin'];

const ALLOWED_FIELD_TYPES = ['text', 'textarea', 'select', 'boolean', 'agent', 'agent_multi', 'direction_service', 'date', 'description', 'studio_agent', 'studio_futurs_agent_picker', 'attachment'];
const ENCADRANT_ROLES = ['dg', 'directeur', 'responsable_service'];

// Actions spéciales exécutées en plus de la création normale du ticket, à la
// soumission d'un formulaire. 'onboarding_rhstudio' (formulaire "Arrivée
// d'agent") attend des CLÉS DE CHAMP FIXES dans fields_config (peu importe
// leur libellé/ordre/type exact du moment que la clé est respectée) :
//   - deja_arrive         (boolean)                    "L'agent est-il déjà arrivé ?"
//   - agent_arrive        (studio_agent)                utilisé si deja_arrive = true
//   - futurs_agent        (studio_futurs_agent_picker)  utilisé si deja_arrive = false
//   - manager             (studio_agent)                N+1 / manager, toujours requis
// 'boite_partagee' (formulaire "Demande de boite mail partagée") attend :
//   - nom, type, usage, admi (agent, responsable), provisoire, datefin,
//     membres (agent_multi), justification
// alimente hub.shared_mailboxes (module /boites-partagees) — un enregistrement
// par soumission, mis à jour à la décision d'arbitrage (cf.
// tasks.controller.js#submitArbitrageDecision).
const ALLOWED_SPECIAL_ACTIONS = ['onboarding_rhstudio', 'boite_partagee'];

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
        // Uniquement pertinent pour type === 'agent' : ajoute automatiquement,
        // sans le demander, la Direction/Service de l'agent choisi (résolu
        // depuis le référentiel RH — cf. resolveAgentDirectionService).
        agent_include_direction_service: !!f.agent_include_direction_service,
    }));
}

/** Normalise/valide la liste des tâches créées à la soumission (section
 * "Tâches à réaliser" du form-builder — toujours affectées à un GROUPE,
 * jamais une personne, cf. createFormTasks). Les tâches incomplètes
 * (nom ou groupe manquant) sont silencieusement écartées. `conditional_on`
 * suit le même principe que pour les champs (cf. sanitizeFieldsConfig) : la
 * tâche n'est créée QUE SI le champ désigné vaut `equals` dans les réponses
 * (cf. isFieldVisible côté frontend requestFormTypes.ts, et le filtre dans
 * createFormTasks côté submit()). */
function sanitizeTasksConfig(tasks) {
    if (!Array.isArray(tasks)) return [];
    return tasks
        .map((t, i) => ({
            name: String(t.name || `Tâche ${i + 1}`).trim(),
            group_id: Number.isInteger(t.group_id) ? t.group_id : (Number.isFinite(Number(t.group_id)) && t.group_id !== null ? Number(t.group_id) : null),
            group_name: t.group_name ? String(t.group_name) : null,
            conditional_on: (t.conditional_on && t.conditional_on.field && t.conditional_on.equals !== undefined)
                ? { field: String(t.conditional_on.field), equals: t.conditional_on.equals }
                : null,
        }))
        .filter((t) => t.name && Number.isInteger(t.group_id) && t.group_id > 0);
}

/**
 * Résout la Direction/Service d'un agent depuis le référentiel RH
 * (rh.referentiel_agents, SQLite — le même référentiel utilisé par le module
 * RH/organigramme), par son identifiant AD (ad_username). Best-effort : ne
 * bloque jamais la création du ticket si le référentiel est indisponible ou
 * l'agent introuvable.
 */
async function resolveAgentDirectionService(username) {
    if (!username) return null;
    try {
        const db = getSqlite();
        if (!db) return null;
        const row = await db.get(
            'SELECT DIRECTION_L, SERVICE_L FROM rh.referentiel_agents WHERE LOWER(ad_username) = LOWER(?)',
            [username]
        );
        if (!row) return null;
        const direction = (row.DIRECTION_L || '').trim();
        const service = (row.SERVICE_L || '').trim();
        if (!direction && !service) return null;
        return { direction, service };
    } catch (e) {
        console.error('[request-forms] resolveAgentDirectionService failed:', e.message);
        return null;
    }
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
        case 'attachment':
            // Le fichier réel est joint au ticket via POST /api/tickets/:id/attachments
            // (cf. submitRequestForm côté magapp) — ici on ne reçoit qu'un résumé
            // sérialisable ({name, size}), jamais le contenu du fichier.
            if (Array.isArray(value)) {
                return value.length > 0 ? value.map((v) => v?.name || String(v)).join(', ') : '—';
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

/**
 * Construit le contenu HTML du ticket (le champ content est affiché en HTML
 * côté ticket). `extraRows` ({ afterKey, label, value }[]) insère des lignes
 * supplémentaires juste après le champ `afterKey` — utilisé pour la
 * Direction/Service auto-résolue d'un champ "agent" (cf.
 * resolveAgentDirectionService), qui n'est pas une vraie réponse de champ.
 */
function buildTicketContentHtml(formName, fields, answers, extraRows = []) {
    const rows = [];
    for (const f of fields) {
        if (f.type === 'description') continue;
        rows.push(`<tr><td style="padding:4px 14px 4px 0;font-weight:600;white-space:nowrap;vertical-align:top;">${escapeHtml(f.label)}</td><td style="padding:4px 0;">${escapeHtml(formatAnswer(f, answers[f.key])).replace(/\n/g, '<br>')}</td></tr>`);
        for (const extra of extraRows.filter((e) => e.afterKey === f.key)) {
            rows.push(`<tr><td style="padding:4px 14px 4px 0;font-weight:600;white-space:nowrap;vertical-align:top;">${escapeHtml(extra.label)}</td><td style="padding:4px 0;">${escapeHtml(extra.value)}</td></tr>`);
        }
    }
    return `<p>Demande générée depuis le formulaire « ${escapeHtml(formName)} »</p><table style="border-collapse:collapse;">${rows.join('')}</table>`;
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

        // ticketId vient de nextval('hub_tickets.ticket_id_seq') (BIGINT) :
        // node-postgres renvoie les BIGINT en string pour éviter les pertes de
        // précision, mais Prisma (côté RH Studio) attend un vrai number JSON
        // pour la colonne Int dsihub_ticket_id — sinon PrismaClientValidationError
        // ("Expected Int... provided String"), constaté en prod sur le ticket #44965.
        const payload = { manager_id: manager.id, dsihub_ticket_id: Number(ticketId) };
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
        const managerName = manager.displayName || manager.email || 'le manager';

        // Lien public vers le formulaire manager (base_url de la config moins
        // le suffixe /api : ex. https://studiorh.ivry.local/api ->
        // https://studiorh.ivry.local/onboarding/form?token=...) + notice
        // "action requise" injectée dans le contenu du ticket — visible à la
        // fois sur le ticket ET dans l'email de confirmation au demandeur
        // (le template utilise {{ticket_content}}), cf. submit() qui diffère
        // exprès la notification tant que ce contenu n'est pas finalisé.
        let formLink = null;
        if (onboarding.token_formulaire) {
            try {
                const cfg = await pgDb.get(`SELECT base_url FROM hub.infra_apis WHERE key = ?`, ['rh_studio_onboarding']);
                const publicBase = (cfg?.base_url || '').replace(/\/api\/?$/, '');
                if (publicBase) formLink = `${publicBase}/onboarding/form?token=${onboarding.token_formulaire}`;
            } catch (e) { console.error('[request-forms] build formLink failed:', e.message); }
        }

        const notice = `<div style="margin-top:16px;padding:12px 16px;border:1px solid #f0ad4e;background:#fff8e6;border-radius:6px;">`
            + `<strong>⚠️ Action requise :</strong> un email a été envoyé à <strong>${escapeHtml(managerName)}</strong> pour compléter le formulaire d'arrivée de l'agent. `
            + `La demande sera traitée une fois ce formulaire rempli.`
            + (formLink ? `<br/><a href="${escapeHtml(formLink)}" target="_blank" rel="noopener noreferrer">Accéder au formulaire</a>` : '')
            + `</div>`;

        // Statut 4 = "En attente" (cf. STATUS_LABELS, teams.service.js) : le
        // ticket attend une action du manager, pas de la hot-line.
        try {
            await pgDb.run(`UPDATE hub_tickets.tickets SET content = content || ?, status = 4 WHERE glpi_id = ?`, [notice, ticketId]);
        } catch (e) { console.error('[request-forms] ticket content/status update failed:', e.message); }

        await logHistory('onboarding_rhstudio', `Email envoyé à ${managerName} pour remplir le formulaire nouvel arrivant (onboarding RH Studio #${onboarding.id})`);
        return { ok: true, id: onboarding.id, formLink };
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

/**
 * "Tâches à réaliser" : contrairement à l'arbitrage (une tâche unique liée à
 * un workflow de décision favorable/défavorable, cf. Mes Tâches), le
 * form-builder peut définir ici une liste libre de tâches à créer à la
 * soumission (chacune avec son propre nom), TOUJOURS affectées à un GROUPE —
 * jamais une personne (cf. sanitizeTasksConfig). Best-effort par tâche : une
 * tâche en échec n'empêche ni le ticket ni les autres tâches d'être créés.
 * `answers` permet d'évaluer `conditional_on` (même principe que les champs,
 * cf. isFieldVisible) : une tâche conditionnée à un champ dont la réponse ne
 * correspond pas n'est simplement pas créée (pas une erreur, pas de ligne
 * dans les résultats — elle n'a jamais été "due").
 */
async function createFormTasks(form, ticketId, ticketTitle, answers) {
    const allTasks = Array.isArray(form.tasks_config) ? form.tasks_config : [];
    const tasks = allTasks.filter((t) => !t.conditional_on || answers[t.conditional_on.field] === t.conditional_on.equals);
    if (tasks.length === 0) return null;

    const results = [];
    for (const task of tasks) {
        const logHistory = async (action, comment) => {
            try {
                await pgDb.run(
                    `INSERT INTO hub_tickets.ticket_history (ticket_id, user_id, action, field_name, old_value, new_value, comment) VALUES (?, NULL, ?, NULL, NULL, NULL, ?)`,
                    [ticketId, action, comment]
                );
            } catch (e) { console.error('[request-forms] form task history log failed:', e.message); }
        };

        try {
            const members = await pgDb.all(
                `SELECT u.username FROM hub_tickets.technician_group_members tgm
                 JOIN hub.users u ON u.id = tgm.user_id
                 WHERE tgm.group_id = ? AND u.username IS NOT NULL`,
                [task.group_id]
            );
            if (members.length === 0) throw new Error(`Le groupe "${task.group_name || task.group_id}" ne contient aucun membre`);

            const isTeamTask = members.length > 1;
            const teamGroupId = isTeamTask ? randomUUID() : null;
            const createdIds = [];
            for (const m of members) {
                const result = await pgDb.run(
                    `INSERT INTO hub.user_tasks
                       (username, description, statut, is_team_task, team_group_id, team_group_name, created_by,
                        context_source, context_id, context_title, priority, is_public, is_arbitrage)
                     VALUES (?, ?, 'a_faire', ?, ?, ?, 'request_form', 'ticket', ?, ?, 'normale', false, false)`,
                    [m.username, task.name, isTeamTask, teamGroupId, task.group_name || null, ticketId, ticketTitle || null]
                );
                createdIds.push(result.lastID);
            }
            await logHistory('form_task_created', `Tâche "${task.name}" créée pour le groupe "${task.group_name || task.group_id}"`);
            results.push({ ok: true, name: task.name, ids: createdIds });
        } catch (e) {
            console.error('[request-forms] createFormTasks failed:', e.message);
            await logHistory('form_task_failed', `Échec de création de la tâche "${task.name}" : ${e.message}`);
            results.push({ ok: false, name: task.name, error: e.message });
        }
    }
    return results;
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
            if (req.body.tasks_config !== undefined) {
                updates.push('tasks_config = ?');
                values.push(JSON.stringify(sanitizeTasksConfig(req.body.tasks_config)));
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

            // Champs "agent" configurés pour ajouter automatiquement (sans le
            // demander) la Direction/Service de l'agent choisi, résolue depuis
            // le référentiel RH — cf. resolveAgentDirectionService.
            const extraRows = [];
            for (const f of fields) {
                if (f.type !== 'agent' || !f.agent_include_direction_service) continue;
                const agent = answers[f.key];
                const username = agent && typeof agent === 'object' ? agent.username : null;
                const resolved = await resolveAgentDirectionService(username);
                if (resolved) {
                    extraRows.push({
                        afterKey: f.key,
                        label: 'Direction / Service',
                        value: [resolved.direction, resolved.service].filter(Boolean).join(' / ') || '—',
                    });
                }
            }

            const content = buildTicketContentHtml(form.name, fields, answers, extraRows);

            const user = req.user;
            // Repli ultime (formulaire sans champ identifiant, ex. uniquement
            // des booléens/dates) : un fragment temporel garantit tout de
            // même l'unicité entre deux soumissions distinctes, même
            // proches dans le temps — cf. buildTicketTitleHint ci-dessus.
            const titleHint = buildTicketTitleHint(fields, answers) || new Date().toLocaleTimeString('fr-FR');
            const ticketTitle = `${form.name} — ${user.displayName || user.username} (${titleHint})`;
            // Formulaire "Arrivée d'agent" : on diffère l'email de confirmation
            // au demandeur (déclenché normalement ici même par
            // ticketService.create) tant que triggerOnboardingRhStudio n'a pas
            // enrichi le contenu/statut du ticket ci-dessous, pour que ce mail
            // reflète bien la notice manager + lien formulaire, pas le contenu
            // brut d'avant onboarding.
            const isOnboardingForm = form.special_action === 'onboarding_rhstudio';
            const ticketId = await ticketService.create({
                title: ticketTitle,
                content,
                type: 2,
                category_id: form.category_id || undefined,
                subcategory_id: form.subcategory_id || undefined,
                source: 'magapp',
            }, user, { skipNotification: isOnboardingForm });

            await pgDb.run(
                'INSERT INTO hub.request_form_submissions (form_id, submitted_by_username, submitted_by_name, submitted_by_email, answers, ticket_id) VALUES (?, ?, ?, ?, ?, ?)',
                [form.id, user.username, user.displayName || user.username, user.email, JSON.stringify(answers), ticketId]
            );

            let onboarding = null;
            if (isOnboardingForm) {
                onboarding = await triggerOnboardingRhStudio(answers, ticketId, user);
                try { await notificationService.trigger('ticket.created', { ticket_id: ticketId, user }); }
                catch (e) { console.error('[request-forms] deferred ticket.created notification failed:', e.message); }
            }
            if (form.special_action === 'boite_partagee') {
                try { await mailboxesService.createRecord(answers, ticketId, form.id, user); }
                catch (e) { console.error('[request-forms] createRecord (boite_partagee) failed:', e.message); }
            }
            const arbitrage = await createArbitrageTask(form, ticketId, ticketTitle);
            const formTasks = await createFormTasks(form, ticketId, ticketTitle, answers);

            res.status(201).json({
                message: 'Demande envoyée',
                ticket_id: ticketId,
                ...(onboarding ? { onboarding } : {}),
                ...(arbitrage ? { arbitrage } : {}),
                ...(formTasks ? { form_tasks: formTasks } : {}),
            });
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de l\'envoi de la demande', error: error.message });
        }
    },
};
