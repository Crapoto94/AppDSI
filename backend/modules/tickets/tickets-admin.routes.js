const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../../shared/middleware');
const { authenticateTicketAdmin } = require('./middleware/ticket-permissions');
const { pgDb, getSqlite } = require('../../shared/database');
const { searchADUsersByQuery } = require('../../shared/ad_helper');
const technicianRepo = require('./repositories/technician.repository');
const storage = require('../../shared/storage');
const multer = require('multer');
const path = require('path');

const kbUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
});

// ─── État de progression de la réinitialisation GLPI (en mémoire) ──
// Un seul reset à la fois ; alimente la barre de progression côté front.
let glpiResetProgress = {
    active: false,
    phase: null,        // 'backup' | 'wipe' | 'import' | 'sequences' | 'done'
    percent: 0,
    message: '',
    startedAt: null,
    finishedAt: null,
    error: null,
    result: null,
};

// ─── Categories ─────────────────────────────────────────────────
router.get('/categories', authenticateJWT, async (req, res) => {
    try {
        const cats = await pgDb.all(`
            SELECT * FROM hub_tickets.ticket_categories WHERE is_active = true ORDER BY sort_order, name
        `);
        res.json(cats);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/categories', authenticateTicketAdmin, async (req, res) => {
    try {
        const { name, parent_id, sort_order, icon } = req.body;
        const result = await pgDb.run(`
            INSERT INTO hub_tickets.ticket_categories (name, parent_id, full_path, sort_order, icon, is_active)
            VALUES ($1, $2, $3, $4, $5, true)
        `, [name, parent_id || null, name, sort_order || 0, icon || null]);
        const id = result.lastID;
        if (parent_id) {
            const parent = await pgDb.get('SELECT full_path FROM hub_tickets.ticket_categories WHERE id = $1', [parent_id]);
            if (parent) {
                await pgDb.run('UPDATE hub_tickets.ticket_categories SET full_path = $1 WHERE id = $2',
                    [parent.full_path + ' / ' + name, id]);
            }
        }
        res.status(201).json({ id, message: 'Catégorie créée' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/categories/:id', authenticateTicketAdmin, async (req, res) => {
    try {
        await pgDb.run('UPDATE hub_tickets.ticket_categories SET name = $1, sort_order = $2, icon = $3 WHERE id = $4',
            [req.body.name, req.body.sort_order || 0, req.body.icon || null, req.params.id]);
        res.json({ message: 'Catégorie mise à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/categories/:id', authenticateTicketAdmin, async (req, res) => {
    try {
        await pgDb.run('UPDATE hub_tickets.ticket_categories SET is_active = false WHERE id = $1', [req.params.id]);
        res.json({ message: 'Catégorie désactivée' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Transposition des anciennes catégories (texte GLPI) → nouvelles ─────────
// Normalise un libellé pour comparer (sans accents, minuscules, dernier segment).
function normalizeCat(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Anciennes catégories texte UTILISÉES + nb de tickets + mapping actuel + suggestion auto.
router.get('/category-mapping/used', authenticateTicketAdmin, async (req, res) => {
    try {
        const used = await pgDb.all(`
            SELECT category AS old_category, COUNT(*)::int AS ticket_count
            FROM hub_tickets.tickets
            WHERE category IS NOT NULL AND category <> ''
            GROUP BY category ORDER BY ticket_count DESC
        `);
        const cats = await pgDb.all('SELECT id, name, full_path, parent_id, sort_order FROM hub_tickets.ticket_categories WHERE is_active = true ORDER BY sort_order, name');
        const mappings = await pgDb.all('SELECT old_category, category_id, software_id FROM hub_tickets.category_mapping');
        const mapByOld = {};
        mappings.forEach(m => { mapByOld[m.old_category] = m; });

        // Logiciels métier = applications magapp
        const apps = await pgDb.all('SELECT id, name FROM magapp.apps ORDER BY name');
        const appById = {};
        apps.forEach(a => { appById[a.id] = a.name; });
        const appNorm = apps.map(a => ({ id: a.id, name: a.name, norm: normalizeCat(a.name) }));

        // Catégorie "Logiciels / Métier" existante (lecture seule)
        const metier = await pgDb.get(
            `SELECT c.id FROM hub_tickets.ticket_categories c
             JOIN hub_tickets.ticket_categories p ON p.id = c.parent_id
             WHERE public.unaccent(LOWER(c.name)) = 'metier' AND public.unaccent(LOWER(p.name)) LIKE '%logiciels%'
               AND c.is_active = true ORDER BY c.id LIMIT 1`
        );
        const metierCategoryId = metier?.id || null;

        // Index de suggestion catégorie : dernier segment normalisé → id
        const catNorm = cats.map(c => ({ id: c.id, norm: normalizeCat((c.name || '').split('>').pop()) }));

        // Suggestion logiciel : 1er mot de la catégorie source → app unique
        function suggestApp(oldCat) {
            const firstSeg = (oldCat || '').split(/[>/]/)[0];
            const fw = normalizeCat(firstSeg).split(' ').filter(Boolean)[0];
            if (!fw || fw.length < 2) return null;
            const matches = appNorm.filter(a =>
                a.norm === fw || a.norm.split(' ').includes(fw) || a.norm.startsWith(fw + ' ') || a.norm === fw
            );
            return matches.length === 1 ? matches[0] : null;
        }

        const rows = used.map(u => {
            const m = mapByOld[u.old_category];
            let suggestion = null, suggestedSoftwareId = null, suggestedSoftwareName = null;
            if (!m) {
                const lastSeg = normalizeCat((u.old_category || '').split('>').pop());
                const hit = catNorm.find(c => c.norm && (c.norm === lastSeg || lastSeg.includes(c.norm) || c.norm.includes(lastSeg)));
                if (hit) suggestion = hit.id;
                const app = suggestApp(u.old_category);
                if (app) {
                    suggestedSoftwareId = app.id;
                    suggestedSoftwareName = app.name;
                    if (metierCategoryId) suggestion = metierCategoryId; // logiciel → catégorie Logiciels/Métier
                }
            }
            return {
                old_category: u.old_category,
                ticket_count: u.ticket_count,
                category_id: m?.category_id ?? null,
                software_id: m?.software_id ?? null,
                software_name: m?.software_id ? (appById[m.software_id] || null) : null,
                suggested_category_id: suggestion,
                suggested_software_id: suggestedSoftwareId,
                suggested_software_name: suggestedSoftwareName,
            };
        });
        res.json({ rows, categories: cats, metier_category_id: metierCategoryId });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// Enregistre/Met à jour une correspondance.
router.put('/category-mapping', authenticateTicketAdmin, async (req, res) => {
    try {
        const { old_category, category_id } = req.body;
        if (!old_category) return res.status(400).json({ message: 'old_category requis' });
        await pgDb.run(`
            INSERT INTO hub_tickets.category_mapping (old_category, category_id, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (old_category) DO UPDATE SET category_id = EXCLUDED.category_id, updated_at = CURRENT_TIMESTAMP
        `, [old_category, category_id || null]);
        res.json({ message: 'Correspondance enregistrée' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// Garantit l'existence de la catégorie "Logiciels / Métier" et renvoie son id.
async function ensureMetierCategory() {
    // unaccent + lower + LIKE pour réutiliser une catégorie existante même préfixée
    // (ex. "📱 Logiciels") plutôt que d'en créer une nouvelle.
    let parent = await pgDb.get(
        `SELECT id, full_path FROM hub_tickets.ticket_categories
         WHERE public.unaccent(LOWER(name)) LIKE '%logiciels%' AND parent_id IS NULL AND is_active = true ORDER BY id LIMIT 1`
    );
    if (!parent) {
        const r = await pgDb.run(
            `INSERT INTO hub_tickets.ticket_categories (name, parent_id, full_path, sort_order, is_active) VALUES ('Logiciels', NULL, 'Logiciels', 0, true)`
        );
        parent = { id: r.lastID, full_path: 'Logiciels' };
    }
    let child = await pgDb.get(
        `SELECT id FROM hub_tickets.ticket_categories
         WHERE public.unaccent(LOWER(name)) = 'metier' AND parent_id = $1 AND is_active = true ORDER BY id LIMIT 1`,
        [parent.id]
    );
    if (!child) {
        const r = await pgDb.run(
            `INSERT INTO hub_tickets.ticket_categories (name, parent_id, full_path, sort_order, is_active) VALUES ('Métier', $1, $2, 0, true)`,
            [parent.id, (parent.full_path || 'Logiciels') + ' / Métier']
        );
        child = { id: r.lastID };
    }
    return child.id;
}

// Bouton "logiciel métier" : affecte un logiciel (app magapp) + catégorie Logiciels / Métier.
router.post('/category-mapping/assign-metier', authenticateTicketAdmin, async (req, res) => {
    try {
        const { old_category, software_id } = req.body;
        if (!old_category) return res.status(400).json({ message: 'old_category requis' });
        const categoryId = await ensureMetierCategory();
        await pgDb.run(`
            INSERT INTO hub_tickets.category_mapping (old_category, category_id, software_id, updated_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (old_category) DO UPDATE SET category_id = EXCLUDED.category_id, software_id = EXCLUDED.software_id, updated_at = CURRENT_TIMESTAMP
        `, [old_category, categoryId, software_id || null]);
        res.json({ category_id: categoryId, software_id: software_id || null, message: 'Associé à Logiciels / Métier' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// Applique toutes les correspondances : renseigne tickets.category_id (+ software_id) pour les stats.
router.post('/category-mapping/apply', authenticateTicketAdmin, async (req, res) => {
    try {
        const result = await pgDb.run(`
            UPDATE hub_tickets.tickets t
            SET category_id = m.category_id,
                software_id = COALESCE(m.software_id, t.software_id)
            FROM hub_tickets.category_mapping m
            WHERE t.category = m.old_category AND m.category_id IS NOT NULL
        `);
        res.json({ message: 'Transposition appliquée', updated: result.changes ?? result.rowCount ?? 0 });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── Transposition des groupes GLPI → groupes APP ──────────────────────────
router.get('/group-mapping/used', authenticateTicketAdmin, async (req, res) => {
    try {
        const used = await pgDb.all(`
            SELECT gg.id AS group_id, COALESCE(gg.name, ('Groupe #' || gg.id)) as group_name, COUNT(ga.ticket_id)::int AS ticket_count
            FROM glpi.glpi_groups gg
            LEFT JOIN glpi.group_assignees ga ON ga.group_id = gg.id
            GROUP BY gg.id, gg.name
            ORDER BY ticket_count DESC
        `);
        const appGroups = await pgDb.all(
            'SELECT id, name, description, is_default FROM hub_tickets.technician_groups WHERE is_active = true ORDER BY name'
        );
        const mappings = await pgDb.all('SELECT glpi_group_id, app_group_id FROM hub_tickets.glpi_group_mapping');
        const mapByGroupId = {};
        mappings.forEach(m => { mapByGroupId[m.glpi_group_id] = m; });

        const rows = used.map(u => ({
            glpi_group_id: u.group_id,
            group_name: u.group_name,
            ticket_count: u.ticket_count,
            app_group_id: mapByGroupId[u.group_id]?.app_group_id ?? null,
        }));
        res.json({ rows, appGroups });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/group-mapping', authenticateTicketAdmin, async (req, res) => {
    try {
        const { glpi_group_id, app_group_id } = req.body;
        if (!glpi_group_id) return res.status(400).json({ message: 'glpi_group_id requis' });
        await pgDb.run(`
            INSERT INTO hub_tickets.glpi_group_mapping (glpi_group_id, app_group_id, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (glpi_group_id) DO UPDATE SET app_group_id = EXCLUDED.app_group_id, updated_at = CURRENT_TIMESTAMP
        `, [glpi_group_id, app_group_id || null]);
        res.json({ message: 'Correspondance enregistrée' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.post('/group-mapping/apply', authenticateTicketAdmin, async (req, res) => {
    try {
        const result = await pgDb.run(`
            INSERT INTO hub_tickets.ticket_assignments (ticket_id, group_id, is_primary)
            SELECT ga.ticket_id, gm.app_group_id, false
            FROM glpi.group_assignees ga
            JOIN hub_tickets.glpi_group_mapping gm ON ga.group_id = gm.glpi_group_id
            JOIN hub_tickets.tickets t ON t.glpi_id = ga.ticket_id
            WHERE gm.app_group_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM hub_tickets.ticket_assignments ta
                  WHERE ta.ticket_id = ga.ticket_id AND ta.group_id = gm.app_group_id
              )
            ON CONFLICT DO NOTHING
        `);
        res.json({ message: 'Mappage appliqué aux tickets', updated: result.changes ?? result.rowCount ?? 0 });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── Tags ────────────────────────────────────────────────────────
router.get('/tags', authenticateJWT, async (req, res) => {
    try {
        const tags = await pgDb.all('SELECT * FROM hub_tickets.ticket_tags WHERE is_active = true ORDER BY name');
        res.json(tags);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/tags', authenticateTicketAdmin, async (req, res) => {
    try {
        const result = await pgDb.run(
            'INSERT INTO hub_tickets.ticket_tags (name, color) VALUES ($1, $2)',
            [req.body.name, req.body.color || '#6366f1']);
        res.status(201).json({ id: result.lastID, message: 'Tag créé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/tags/:id', authenticateTicketAdmin, async (req, res) => {
    try {
        await pgDb.run('UPDATE hub_tickets.ticket_tags SET name = $1, color = $2 WHERE id = $3',
            [req.body.name, req.body.color, req.params.id]);
        res.json({ message: 'Tag mis à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/tags/:id', authenticateTicketAdmin, async (req, res) => {
    try {
        await pgDb.run('UPDATE hub_tickets.ticket_tags SET is_active = false WHERE id = $1', [req.params.id]);
        res.json({ message: 'Tag désactivé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Technician Groups ──────────────────────────────────────────
router.get('/groups', authenticateJWT, async (req, res) => {
    try {
        const groups = await pgDb.all(`
            SELECT g.*,
                   COALESCE(json_agg(json_build_object('id', m.id, 'user_id', m.user_id, 'displayName', u.displayName, 'username', u.username))
                       FILTER (WHERE m.id IS NOT NULL), '[]') as members
            FROM hub_tickets.technician_groups g
            LEFT JOIN hub_tickets.technician_group_members m ON g.id = m.group_id
            LEFT JOIN hub.users u ON m.user_id = u.id
            WHERE g.is_active = true
            GROUP BY g.id, g.name, g.description, g.is_active, g.created_at, g.is_default
            ORDER BY g.is_default DESC, g.name
        `);
        res.json(groups);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/groups', authenticateTicketAdmin, async (req, res) => {
    try {
        const { name, description, is_default } = req.body;
        if (is_default) {
            await pgDb.run('UPDATE hub_tickets.technician_groups SET is_default = false WHERE is_default = true');
        }
        const result = await pgDb.run(
            'INSERT INTO hub_tickets.technician_groups (name, description, is_default) VALUES ($1, $2, $3)',
            [name, description || '', is_default ? true : false]);
        res.status(201).json({ id: result.lastID, message: 'Groupe créé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/groups/:id', authenticateTicketAdmin, async (req, res) => {
    try {
        const { name, description, is_default } = req.body;
        if (is_default) {
            await pgDb.run('UPDATE hub_tickets.technician_groups SET is_default = false WHERE is_default = true');
        }
        await pgDb.run('UPDATE hub_tickets.technician_groups SET name = $1, description = $2, is_default = $3 WHERE id = $4',
            [name, description, is_default ? true : false, req.params.id]);
        res.json({ message: 'Groupe mis à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/groups/:id', authenticateTicketAdmin, async (req, res) => {
    try {
        await pgDb.run('UPDATE hub_tickets.technician_groups SET is_active = false WHERE id = $1', [req.params.id]);
        res.json({ message: 'Groupe désactivé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.post('/groups/:id/set-default', authenticateTicketAdmin, async (req, res) => {
    try {
        await pgDb.run('UPDATE hub_tickets.technician_groups SET is_default = false WHERE is_default = true');
        await pgDb.run('UPDATE hub_tickets.technician_groups SET is_default = true WHERE id = $1', [req.params.id]);
        res.json({ message: 'Groupe par défaut mis à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.post('/groups/:id/members', authenticateTicketAdmin, async (req, res) => {
    try {
        const result = await pgDb.run(
            'INSERT INTO hub_tickets.technician_group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [req.params.id, req.body.user_id]);
        console.log('[DEBUG] addMember group_id=%s user_id=%s changes=%s lastID=%s', req.params.id, req.body.user_id, result.changes, result.lastID);
        res.status(201).json({ message: 'Membre ajouté' });
    } catch (e) { console.log('[DEBUG] addMember ERROR:', e.message); res.status(400).json({ message: e.message }); }
});

router.delete('/groups/:id/members/:mid', authenticateTicketAdmin, async (req, res) => {
    try {
        await pgDb.run('DELETE FROM hub_tickets.technician_group_members WHERE id = $1', [req.params.mid]);
        res.json({ message: 'Membre retiré' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── SLA Definitions ────────────────────────────────────────────
router.get('/sla', authenticateJWT, async (req, res) => {
    try {
        const defs = await pgDb.all(
            'SELECT * FROM hub_tickets.sla_definitions ORDER BY priority NULLS LAST'
        );
        res.json(defs);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/sla', authenticateTicketAdmin, async (req, res) => {
    try {
        const result = await pgDb.run(`
            INSERT INTO hub_tickets.sla_definitions
                (name, description, calendar_id, first_response_min, resolution_min, escalation_min, priority, impact, type, category_id, match_operator)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [req.body.name, req.body.description, req.body.calendar_id || 1,
            req.body.first_response_min, req.body.resolution_min, req.body.escalation_min,
            req.body.priority, req.body.impact, req.body.type, req.body.category_id || null,
            req.body.match_operator || 'AND']);
        res.status(201).json({ id: result.lastID, message: 'Définition SLA créée' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/sla/:id', authenticateTicketAdmin, async (req, res) => {
    try {
        // Mise à jour DYNAMIQUE : on ne touche QUE les champs réellement présents dans le body.
        // (Auparavant, un simple toggle is_active mettait à NULL priority/minutes/etc. → SLA vidés.)
        const allowed = ['name', 'description', 'calendar_id', 'first_response_min', 'resolution_min',
            'escalation_min', 'priority', 'impact', 'type', 'category_id', 'is_active', 'match_operator'];
        const sets = [];
        const params = [];
        let i = 1;
        for (const key of allowed) {
            if (Object.prototype.hasOwnProperty.call(req.body, key)) {
                sets.push(`${key} = $${i++}`);
                params.push(req.body[key]);
            }
        }
        if (sets.length === 0) return res.json({ message: 'Aucun changement' });
        params.push(req.params.id);
        await pgDb.run(
            `UPDATE hub_tickets.sla_definitions SET ${sets.join(', ')} WHERE id = $${i}`,
            params
        );
        res.json({ message: 'SLA mis à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/sla/:id', authenticateTicketAdmin, async (req, res) => {
    try {
        await pgDb.run('UPDATE hub_tickets.sla_definitions SET is_active = false WHERE id = $1', [req.params.id]);
        res.json({ message: 'SLA désactivé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── SLA Check (déclenchement manuel) ──────────────────────────
router.post('/sla/check', authenticateTicketAdmin, async (req, res) => {
    try {
        const slaService = require('./services/sla.service');
        await slaService.checkSLAs();
        const breaches = await slaService.getActiveBreaches();
        res.json({ message: 'Vérification SLA terminée', breaches: breaches.length });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// Réinitialise complètement l'état SLA : purge ticket_sla (+ pauses) puis recalcule
// uniquement pour les définitions ACTIVES (via checkSLAs → applyMissingSLAs).
router.post('/sla/reset', authenticateTicketAdmin, async (req, res) => {
    try {
        const { pool } = require('../../shared/database');
        await pool.query('DELETE FROM hub_tickets.ticket_sla_pauses');
        const del = await pool.query('DELETE FROM hub_tickets.ticket_sla');
        const slaService = require('./services/sla.service');
        await slaService.checkSLAs(); // recrée pour les défs actives + tickets ouverts, puis évalue
        const breaches = await slaService.getActiveBreaches();
        res.json({ message: 'SLA réinitialisés', purged: del.rowCount || 0, breaches: breaches.length });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── SLA Calendars ─────────────────────────────────────────────
router.get('/sla/calendars', authenticateJWT, async (req, res) => {
    try {
        const calendars = await pgDb.all(`
            SELECT c.*,
                   COALESCE(json_agg(json_build_object('id', h.id, 'day_of_week', h.day_of_week, 'start_time', h.start_time, 'end_time', h.end_time))
                       FILTER (WHERE h.id IS NOT NULL), '[]') as hours
            FROM hub_tickets.sla_calendars c
            LEFT JOIN hub_tickets.sla_calendar_hours h ON c.id = h.calendar_id
            GROUP BY c.id, c.name, c.description, c.timezone, c.is_default, c.created_at
            ORDER BY c.name
        `);
        res.json(calendars);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/sla/calendars', authenticateTicketAdmin, async (req, res) => {
    try {
        const result = await pgDb.run(
            'INSERT INTO hub_tickets.sla_calendars (name, description, timezone) VALUES ($1, $2, $3)',
            [req.body.name, req.body.description, req.body.timezone || 'Europe/Paris']);
        res.status(201).json({ id: result.lastID, message: 'Calendrier créé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/sla/calendars/:id', authenticateTicketAdmin, async (req, res) => {
    try {
        await pgDb.run(
            'UPDATE hub_tickets.sla_calendars SET name = $1, description = $2, timezone = $3 WHERE id = $4',
            [req.body.name, req.body.description, req.body.timezone || 'Europe/Paris', req.params.id]);
        res.json({ message: 'Calendrier mis à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/sla/calendars/:id/hours/:hourId', authenticateTicketAdmin, async (req, res) => {
    try {
        await pgDb.run('DELETE FROM hub_tickets.sla_calendar_hours WHERE id = $1', [req.params.hourId]);
        res.json({ message: 'Plage horaire supprimée' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.post('/sla/calendars/:id/hours', authenticateTicketAdmin, async (req, res) => {
    try {
        await pgDb.run(
            'INSERT INTO hub_tickets.sla_calendar_hours (calendar_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
            [req.params.id, req.body.day_of_week, req.body.start_time, req.body.end_time]);
        res.status(201).json({ message: 'Plage horaire ajoutée' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Assignment Rules ───────────────────────────────────────────
router.get('/assignment-rules', authenticateJWT, async (req, res) => {
    try {
        const rules = await pgDb.all('SELECT * FROM hub_tickets.assignment_rules ORDER BY priority');
        res.json(rules);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/assignment-rules', authenticateTicketAdmin, async (req, res) => {
    try {
        const result = await pgDb.run(`
            INSERT INTO hub_tickets.assignment_rules
                (name, match_type, match_value, assign_type, assign_to_id, assign_to_value, priority)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [req.body.name, req.body.match_type || 'any', req.body.match_value || '',
            req.body.assign_type, req.body.assign_to_id || null, req.body.assign_to_value || null, req.body.priority || 0]);
        res.status(201).json({ id: result.lastID, message: 'Règle créée' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/assignment-rules/:id', authenticateTicketAdmin, async (req, res) => {
    try {
        await pgDb.run(`
            UPDATE hub_tickets.assignment_rules SET
                name = $1, match_type = $2, match_value = $3,
                assign_type = $4, assign_to_id = $5, assign_to_value = $6, priority = $7, is_active = $8
            WHERE id = $9
        `, [req.body.name, req.body.match_type, req.body.match_value,
            req.body.assign_type, req.body.assign_to_id || null, req.body.assign_to_value || null,
            req.body.priority, req.body.is_active ?? true, req.params.id]);
        res.json({ message: 'Règle mise à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/assignment-rules/:id', authenticateTicketAdmin, async (req, res) => {
    try {
        await pgDb.run('DELETE FROM hub_tickets.assignment_rules WHERE id = $1', [req.params.id]);
        res.json({ message: 'Règle supprimée' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── VIP Users ────────────────────────────────────────────────────
const syncElusToVip = async () => {
    // Synchronise les élus de hub.elus vers hub_tickets.vip_users
    const elus = await pgDb.all("SELECT prenom, nom, email FROM hub.elus WHERE email IS NOT NULL AND email != ''");
    for (const elu of elus) {
        const displayName = `${elu.prenom} ${elu.nom}`;
        const email = elu.email.toLowerCase().trim();
        await pgDb.run(
            `INSERT INTO hub_tickets.vip_users (username, display_name, email, is_elu)
             VALUES ($1, $2, $3, true)
             ON CONFLICT (username) DO UPDATE SET display_name = $2, email = $3, is_elu = true`,
            [email, displayName, email]
        );
    }
};

router.get('/vip-users', authenticateJWT, async (req, res) => {
    try {
        await syncElusToVip();
        const vips = await pgDb.all('SELECT * FROM hub_tickets.vip_users ORDER BY display_name, username');
        res.json(vips);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/vip-users', authenticateTicketAdmin, async (req, res) => {
    try {
        const { user_id, username, display_name, email } = req.body;
        if (!username?.trim()) return res.status(400).json({ message: 'Username requis' });
        const result = await pgDb.run(
            `INSERT INTO hub_tickets.vip_users (user_id, username, display_name, email, is_elu) VALUES ($1, $2, $3, $4, false) ON CONFLICT (username) DO NOTHING`,
            [user_id || null, username.trim().toLowerCase(), display_name || username, email || null]
        );
        res.status(201).json({ id: result.lastID, message: 'Utilisateur VIP ajouté' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// Applique le caractère VIP à tous les tickets dont le demandeur est VIP/élu.
// Utile après une "récupération GLPI" qui réimporte les tickets sans le flag is_vip.
router.post('/vip-users/apply-all', authenticateTicketAdmin, async (req, res) => {
    try {
        await syncElusToVip(); // rafraîchit la liste des élus d'abord
        const normName = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean).sort().join(' ');
        const vips = await pgDb.all(`SELECT email, username, display_name FROM hub_tickets.vip_users`);
        const emails = new Set(vips.map(v => (v.email || '').toLowerCase()).filter(Boolean));
        const names = new Set(vips.map(v => normName(v.display_name)).filter(Boolean));
        const tickets = await pgDb.all(`SELECT glpi_id, requester_email_22, email_alt, requester_name FROM hub_tickets.tickets WHERE (is_vip IS NULL OR is_vip = false)`);
        const toFlag = [];
        for (const t of tickets) {
            const em = (t.email_alt || t.requester_email_22 || '').toLowerCase().trim();
            const nm = normName(t.requester_name);
            if ((em && emails.has(em)) || (nm && names.has(nm))) toFlag.push(t.glpi_id);
        }
        for (let i = 0; i < toFlag.length; i += 500) {
            const batch = toFlag.slice(i, i + 500);
            if (batch.length) await pgDb.run(`UPDATE hub_tickets.tickets SET is_vip = true WHERE glpi_id IN (${batch.join(',')})`);
        }
        res.json({ message: `${toFlag.length} ticket(s) marqué(s) VIP`, flagged: toFlag.length, scanned: tickets.length });
    } catch (e) {
        console.error('[VIP] apply-all error:', e.message);
        res.status(500).json({ message: e.message });
    }
});

router.delete('/vip-users/:id', authenticateTicketAdmin, async (req, res) => {
    try {
        const vip = await pgDb.get('SELECT is_elu FROM hub_tickets.vip_users WHERE id = $1', [req.params.id]);
        if (!vip) return res.status(404).json({ message: 'VIP non trouvé' });
        if (vip.is_elu) return res.status(403).json({ message: 'Impossible de retirer un élu hérité. Supprimez-le depuis l\'onglet Élus de Param Ville.' });
        await pgDb.run('DELETE FROM hub_tickets.vip_users WHERE id = $1', [req.params.id]);
        res.json({ message: 'Utilisateur VIP retiré' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Notification Templates ────────────────────────────────────
router.get('/notification-templates', authenticateJWT, async (req, res) => {
    try {
        const templates = await pgDb.all('SELECT * FROM hub_tickets.notification_templates ORDER BY slug');
        res.json(templates);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/notification-templates', authenticateTicketAdmin, async (req, res) => {
    try {
        const result = await pgDb.run(`
            INSERT INTO hub_tickets.notification_templates (slug, label, subject, body_html)
            VALUES ($1, $2, $3, $4)
        `, [req.body.slug, req.body.label, req.body.subject, req.body.body_html]);
        res.status(201).json({ id: result.lastID, message: 'Template créé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/notification-templates/:id', authenticateTicketAdmin, async (req, res) => {
    try {
        // Support both id and slug as parameter
        const whereClause = isNaN(req.params.id) ? 'slug = $4' : 'id = $4';
        await pgDb.run(`
            UPDATE hub_tickets.notification_templates SET subject = $1, body_html = $2, label = $3 WHERE ${whereClause}
        `, [req.body.subject, req.body.body_html, req.body.label, req.params.id]);
        res.json({ message: 'Template mis à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Triggers ──────────────────────────────────────────────────
router.get('/notification-triggers', authenticateTicketAdmin, async (req, res) => {
    try {
        const triggers = await pgDb.all(`
            SELECT ntr.*, nt.label as template_label
            FROM hub_tickets.notification_triggers ntr
            JOIN hub_tickets.notification_templates nt ON ntr.template_slug = nt.slug
            ORDER BY ntr.event
        `);
        res.json(triggers);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/notification-triggers', authenticateTicketAdmin, async (req, res) => {
    try {
        await pgDb.run(`
            INSERT INTO hub_tickets.notification_triggers (event, template_slug, recipient_type)
            VALUES ($1, $2, $3) ON CONFLICT (event, recipient_type) DO NOTHING
        `, [req.body.event, req.body.template_slug, req.body.recipient_type]);
        res.status(201).json({ message: 'Déclencheur créé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/notification-triggers/:id', authenticateTicketAdmin, async (req, res) => {
    try {
        const { is_active } = req.body;
        await pgDb.run('UPDATE hub_tickets.notification_triggers SET is_active = $1 WHERE id = $2', [is_active, req.params.id]);
        res.json({ message: 'Déclencheur mis à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/notification-triggers/:id', authenticateTicketAdmin, async (req, res) => {
    try {
        await pgDb.run('DELETE FROM hub_tickets.notification_triggers WHERE id = $1', [req.params.id]);
        res.json({ message: 'Déclencheur supprimé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Escalation Rules ──────────────────────────────────────────
router.get('/sla/escalations', authenticateJWT, async (req, res) => {
    try {
        const rules = await pgDb.all(`
            SELECT ser.*, sd.name as sla_name
            FROM hub_tickets.sla_escalation_rules ser
            JOIN hub_tickets.sla_definitions sd ON ser.sla_definition_id = sd.id
            ORDER BY sd.name, ser.escalation_level
        `);
        res.json(rules);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── Technicians ────────────────────────────────────────────────
router.get('/technicians', authenticateTicketAdmin, async (req, res) => {
    try {
        const list = await technicianRepo.findAll(req.query.status || null);
        // Enrich with service data from SQLite (hub.users doesn't store service_code)
        const db = getSqlite();
        if (list.length > 0) {
            const placeholders = list.map(() => '?').join(', ');
            const usernames = list.map(t => (t.username || '').toLowerCase());
            const rows = await db.all(
                `SELECT LOWER(username) as un, service_code, service_complement FROM users WHERE LOWER(username) IN (${placeholders})`,
                usernames
            );
            const svcMap = {};
            for (const r of rows) svcMap[r.un] = r;
            for (const t of list) {
                const s = svcMap[(t.username || '').toLowerCase()];
                if (s) { t.service_code = s.service_code; t.service_complement = s.service_complement; }
            }
        }
        res.json(list);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// Rejoue la transposition des assignés GLPI → hub_tickets.ticket_assignments
// (login GLPI → hub.users.id). N'écrase pas les assignations existantes.
router.post('/technicians/reapply-assignments', authenticateTicketAdmin, async (req, res) => {
    try {
        // Diagnostic : combien d'assignés, combien résolvables par login
        const diag = await pgDb.get(`
            SELECT
                (SELECT COUNT(DISTINCT ticket_id) FROM glpi.assignees) AS glpi_assigned_tickets,
                (SELECT COUNT(DISTINCT a.ticket_id)
                   FROM glpi.assignees a
                   JOIN hub.users u ON LOWER(u.username) = LOWER(a.login)
                   JOIN hub_tickets.tickets t ON t.glpi_id = a.ticket_id) AS resolvable_tickets
        `);

        const result = await pgDb.run(`
            INSERT INTO hub_tickets.ticket_assignments (ticket_id, technician_id, is_primary)
            SELECT DISTINCT ON (a.ticket_id) a.ticket_id, u.id, true
            FROM glpi.assignees a
            JOIN hub.users u ON LOWER(u.username) = LOWER(a.login)
            JOIN hub_tickets.tickets t ON t.glpi_id = a.ticket_id
            WHERE NOT EXISTS (
                SELECT 1 FROM hub_tickets.ticket_assignments ta
                WHERE ta.ticket_id = a.ticket_id AND ta.technician_id = u.id
            )
            ORDER BY a.ticket_id, a.user_id
        `);

        const inserted = result.changes ?? result.rowCount ?? 0;
        res.json({
            message: `✅ ${inserted} assignation(s) technicien créée(s)`,
            inserted,
            glpi_assigned_tickets: Number(diag?.glpi_assigned_tickets || 0),
            resolvable_tickets: Number(diag?.resolvable_tickets || 0),
        });
    } catch (e) {
        console.error('[REAPPLY-ASSIGNMENTS] Error:', e.message);
        res.status(500).json({ message: e.message });
    }
});

router.get('/technicians/available', authenticateJWT, async (req, res) => {
    try {
        const list = await technicianRepo.findAvailableInDefaultGroup();
        res.json(list.filter(t => (t.module_role || 'technician') === 'technician'));
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/technicians/ad-search', authenticateTicketAdmin, async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q || q.length < 2) return res.json([]);
        const db = getSqlite();
        const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (!adSettings || !adSettings.is_enabled) {
            return res.json([]);
        }
        const results = await searchADUsersByQuery(q, adSettings);
        res.json(results);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/technicians', authenticateTicketAdmin, async (req, res) => {
    try {
        const { user_id, username, displayName, email } = req.body;
        const db = getSqlite();

        if (user_id) {
            // Legacy path: user_id is PG hub.users.id
            const existing = await pgDb.get('SELECT id, username FROM hub.users WHERE id = $1', [user_id]);
            if (!existing) return res.status(404).json({ message: 'Utilisateur non trouvé' });
            await technicianRepo.create(user_id, existing.username || null);
            // Sync technician role to SQLite (source of JWT)
            if (existing.username) {
                await db.run("UPDATE users SET role = 'technician' WHERE username = ? AND role NOT IN ('admin','superadmin')", [existing.username]);
            }
            res.status(201).json({ message: 'Technicien ajouté' });
        } else if (username) {
            // Preferred path: username from AD search
            // Normalize to lowercase to match SQLite convention
            const usernameLower = username.toLowerCase();
            // Look up or create in hub.users (PG) for the FK (case-insensitive lookup)
            let existingUser = await pgDb.get('SELECT id FROM hub.users WHERE LOWER(username) = LOWER($1)', [username]);
            if (!existingUser) {
                const result = await pgDb.run(`
                    INSERT INTO hub.users (username, displayName, email, role)
                    VALUES ($1, $2, $3, 'technician') RETURNING id
                `, [usernameLower, displayName || username, email || '']);
                existingUser = { id: result.lastID || result.id };
            }
            await technicianRepo.create(existingUser.id, usernameLower);
            // Sync technician role to SQLite (source of JWT)
            await db.run("UPDATE users SET role = 'technician' WHERE LOWER(username) = LOWER(?) AND role NOT IN ('admin','superadmin')", [username]);
            res.status(201).json({ message: 'Technicien ajouté', user_id: existingUser.id });
        } else {
            res.status(400).json({ message: 'user_id ou username requis' });
        }
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/technicians/:id/status', authenticateTicketAdmin, async (req, res) => {
    try {
        const { status, paused_until, notes } = req.body;
        const validStatuses = ['active', 'paused', 'inactive'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Statut invalide' });
        }
        await technicianRepo.updateStatus(parseInt(req.params.id), status, paused_until, notes);
        res.json({ message: 'Statut mis à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/technicians/:id', authenticateTicketAdmin, async (req, res) => {
    try {
        const { notes, mobile_phone, is_emergency_contact } = req.body;
        const sets = ['updated_at = CURRENT_TIMESTAMP'];
        const vals = [];
        let idx = 1;
        if (notes                !== undefined) { sets.push(`notes = $${idx++}`);                vals.push(notes); }
        if (mobile_phone         !== undefined) { sets.push(`mobile_phone = $${idx++}`);         vals.push(mobile_phone || null); }
        if (is_emergency_contact !== undefined) { sets.push(`is_emergency_contact = $${idx++}`); vals.push(!!is_emergency_contact); }
        vals.push(parseInt(req.params.id));
        await pgDb.run(
            `UPDATE hub_tickets.technician_profiles SET ${sets.join(', ')} WHERE user_id = $${idx}`,
            vals
        );
        res.json({ message: 'Technicien mis à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/technicians/:id', authenticateTicketAdmin, async (req, res) => {
    try {
        await technicianRepo.delete(parseInt(req.params.id));
        res.json({ message: 'Technicien désactivé' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.get('/technicians/:id/tickets', authenticateTicketAdmin, async (req, res) => {
    try {
        const tickets = await technicianRepo.getTicketsByTechnician(parseInt(req.params.id));
        res.json(tickets);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/technicians/:id/reassign', authenticateTicketAdmin, async (req, res) => {
    try {
        const { mode, target_id } = req.body;
        if (!['single', 'group', 'dispatch', 'unassign'].includes(mode)) {
            return res.status(400).json({ message: 'Mode invalide (single, group, dispatch, unassign)' });
        }
        if ((mode === 'single' || mode === 'group') && !target_id) {
            return res.status(400).json({ message: 'target_id requis pour ce mode' });
        }
        await technicianRepo.reassignTickets(parseInt(req.params.id), mode, target_id ? parseInt(target_id) : null);
        res.json({ message: 'Tickets réassignés' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Escalade ────────────────────────────────────────────────────

router.get('/escalade', authenticateTicketAdmin, async (req, res) => {
    try {
        const support = await pgDb.all(`SELECT * FROM hub_tickets.escalade_config WHERE type = 'support_agent' ORDER BY display_name`);
        const targets = await pgDb.all(`SELECT * FROM hub_tickets.escalade_config WHERE type = 'escalade_target' ORDER BY display_name, service_label`);
        res.json({ support_agents: support, escalade_targets: targets });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/escalade/agent-service', authenticateTicketAdmin, async (req, res) => {
    try {
        const username = (req.query.username || '').trim();
        if (!username) return res.json({ service: null });
        // D'abord chercher dans la base (magapp.users puis hub.users)
        const dbUser = await pgDb.get('SELECT service_code, service_complement FROM magapp.users WHERE LOWER(username) = LOWER($1)', [username])
            || await pgDb.get('SELECT service_code, service_complement FROM hub.users WHERE LOWER(username) = LOWER($1)', [username]);
        if (dbUser && dbUser.service_code) {
            return res.json({ service: dbUser.service_complement || dbUser.service_code, service_code: dbUser.service_code });
        }
        // Sinon chercher dans l'AD
        const db = getSqlite();
        const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (!adSettings || !adSettings.is_enabled) return res.json({ service: null });
        const results = await searchADUsersByQuery(username, adSettings);
        const match = results.find(u => (u.username || '').toLowerCase() === username.toLowerCase());
        res.json({ service: match?.service || null, displayName: match?.displayName || null });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/escalade/groups', authenticateTicketAdmin, async (req, res) => {
    try {
        const groups = await pgDb.all(`
            SELECT g.id, g.name, g.description, g.is_default,
                   COALESCE(json_agg(json_build_object('id', m.id, 'user_id', m.user_id, 'displayName', u.displayName, 'username', u.username))
                       FILTER (WHERE m.id IS NOT NULL), '[]') as members
            FROM hub_tickets.technician_groups g
            LEFT JOIN hub_tickets.technician_group_members m ON g.id = m.group_id
            LEFT JOIN hub.users u ON m.user_id = u.id
            WHERE g.is_active = true AND g.is_default = false
            GROUP BY g.id, g.name, g.description, g.is_active, g.created_at, g.is_default
            ORDER BY g.name
        `);
        res.json(groups);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/escalade/support-agent', authenticateTicketAdmin, async (req, res) => {
    try {
        const { user_id, username, display_name, email } = req.body;
        const existing = await pgDb.get(`SELECT id FROM hub_tickets.escalade_config WHERE type = 'support_agent' AND user_id = $1`, [user_id]);
        if (existing) return res.status(400).json({ message: 'Agent déjà dans la liste' });
        await pgDb.run(`INSERT INTO hub_tickets.escalade_config (type, user_id, username, display_name, email) VALUES ('support_agent', $1, $2, $3, $4)`, [user_id, username, display_name, email]);
        res.json({ message: 'Agent ajouté' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete('/escalade/support-agent/:id', authenticateTicketAdmin, async (req, res) => {
    try {
        await pgDb.run(`DELETE FROM hub_tickets.escalade_config WHERE id = $1 AND type = 'support_agent'`, [req.params.id]);
        res.json({ message: 'Agent retiré' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/escalade/target', authenticateTicketAdmin, async (req, res) => {
    try {
        const { target_type, user_id, username, display_name, email, service_code, service_label } = req.body;
        await pgDb.run(
            `INSERT INTO hub_tickets.escalade_config (type, target_type, user_id, username, display_name, email, service_code, service_label) VALUES ('escalade_target', $1, $2, $3, $4, $5, $6, $7)`,
            [target_type, user_id || null, username || null, display_name || null, email || null, service_code || null, service_label || null]
        );
        res.json({ message: 'Cible ajoutée' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete('/escalade/target/:id', authenticateTicketAdmin, async (req, res) => {
    try {
        await pgDb.run(`DELETE FROM hub_tickets.escalade_config WHERE id = $1 AND type = 'escalade_target'`, [req.params.id]);
        res.json({ message: 'Cible retirée' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/glpi-url', authenticateJWT, async (req, res) => {
    try {
        const db = getSqlite();
        const settings = await db.get('SELECT url FROM glpi_settings WHERE id = 1');
        if (!settings || !settings.url) return res.json({ url: null, ticketUrl: null });
        const base = settings.url.replace(/\/apirest\.php\/?$/, '').replace(/\/api\/?$/, '').replace(/\/+$/, '');
        res.json({ url: settings.url, ticketUrl: base + '/front/ticket.form.php?id=' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/config/:key', authenticateTicketAdmin, async (req, res) => {
    try {
        const val = await technicianRepo.getConfig(req.params.key);
        res.json({ key: req.params.key, value: val });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/config/:key', authenticateTicketAdmin, async (req, res) => {
    try {
        await technicianRepo.setConfig(req.params.key, req.body.value);
        res.json({ message: 'Configuration mise à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

router.get('/config-all', authenticateTicketAdmin, async (req, res) => {
    try {
        const rows = await pgDb.all('SELECT key, value FROM hub_tickets.module_config');
        const config = {};
        for (const r of rows) config[r.key] = r.value;
        res.json(config);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/config-bulk', authenticateTicketAdmin, async (req, res) => {
    try {
        const updates = req.body;
        if (typeof updates !== 'object' || Array.isArray(updates)) return res.status(400).json({ message: 'Object key/value expected' });
        for (const [key, value] of Object.entries(updates)) {
            await technicianRepo.setConfig(key, String(value));
        }
        res.json({ message: 'Configuration mise à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Clôture : log des clôtures (auto + par demandeurs/techniciens) ──────────
router.get('/closure-log', authenticateTicketAdmin, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
        const offset = parseInt(req.query.offset) || 0;
        const rows = await pgDb.all(`
            SELECT h.id, h.ticket_id, h.created_at, h.comment, h.user_id, h.username,
                   COALESCE(un.displayName, uid.displayName, h.username) AS closed_by,
                   t.title AS ticket_title,
                   t.requester_name,
                   (h.user_id IS NULL AND h.username IS NULL) AS is_auto,
                   (un.email IS NOT NULL AND LOWER(un.email) = LOWER(COALESCE(t.requester_email_22, ''))) AS by_requester
            FROM hub_tickets.ticket_history h
            LEFT JOIN hub.users un ON LOWER(un.username) = LOWER(h.username)
            LEFT JOIN hub.users uid ON h.username IS NULL AND h.user_id = uid.id
            LEFT JOIN hub_tickets.tickets t ON h.ticket_id = t.glpi_id
            WHERE h.action = 'status_changed' AND h.field_name = 'status' AND h.new_value = '6'
            ORDER BY h.created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);
        const count = await pgDb.get(`
            SELECT COUNT(*) AS total FROM hub_tickets.ticket_history
            WHERE action = 'status_changed' AND field_name = 'status' AND new_value = '6'
        `);
        res.json({ rows, total: parseInt(count.total) });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// Déclenche manuellement la clôture automatique (même logique que le cron de minuit).
router.post('/closure/run', authenticateTicketAdmin, async (req, res) => {
    try {
        const workflowService = require('./services/workflow.service');
        const result = await workflowService.autoCloseResolvedTickets();
        res.json({ message: result.disabled ? 'Clôture automatique désactivée (délai = 0).' : `${result.closed} ticket(s) clos.`, ...result });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── Journal (ticket history) ─────────────────────────────────────
router.get('/journal', authenticateTicketAdmin, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
        const offset = parseInt(req.query.offset) || 0;
        const rows = await pgDb.all(`
            SELECT h.id, h.ticket_id, h.action, h.field_name, h.old_value, h.new_value, h.comment, h.created_at,
                   h.user_id,
                   COALESCE(u.displayName, CASE WHEN h.user_id IS NULL THEN 'Système' ELSE '#' || h.user_id END) as user_name,
                   t.title as ticket_title
            FROM hub_tickets.ticket_history h
            LEFT JOIN hub.users u ON h.user_id = u.id
            LEFT JOIN hub_tickets.tickets t ON h.ticket_id = t.glpi_id
            ORDER BY h.created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);
        const count = await pgDb.get('SELECT COUNT(*) as total FROM hub_tickets.ticket_history');
        res.json({ rows, total: parseInt(count.total) });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── Rôle d'un membre de l'équipe ────────────────────────────────
router.put('/technicians/:id/role', authenticateTicketAdmin, async (req, res) => {
    try {
        const { role } = req.body;
        const validRoles = ['technician', 'supervisor', 'admin'];
        if (!validRoles.includes(role)) return res.status(400).json({ message: 'Rôle invalide (technician, supervisor, admin)' });
        const userId = parseInt(req.params.id);
        await pgDb.run(
            `INSERT INTO hub_tickets.technician_profiles (user_id, module_role, status, updated_at)
             VALUES ($1, $2, 'active', CURRENT_TIMESTAMP)
             ON CONFLICT (user_id) DO UPDATE SET module_role = $2, updated_at = CURRENT_TIMESTAMP`,
            [userId, role]
        );
        await pgDb.run('UPDATE hub.users SET role = $1 WHERE id = $2', [role, userId]);
        // Sync role back to SQLite (source of JWT) — look up username from hub.users
        try {
            const hubUser = await pgDb.get('SELECT username FROM hub.users WHERE id = $1', [userId]);
            if (hubUser?.username) {
                const db = getSqlite();
                // Case-insensitive sync to SQLite (AD usernames may be MixedCase vs lowercase SQLite)
                await db.run("UPDATE users SET role = ? WHERE LOWER(username) = LOWER(?) AND role NOT IN ('superadmin')", [role, hubUser.username]);
                // Normalize username to lowercase in technician_profiles for future lookups
                const normalizedUsername = hubUser.username.toLowerCase();
                await pgDb.run(
                    "UPDATE hub_tickets.technician_profiles SET username = $1 WHERE user_id = $2",
                    [normalizedUsername, userId]
                );
            }
        } catch (e) { console.error('[ROLE SYNC]', e.message); }
        res.json({ message: 'Rôle mis à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

// ─── Matrice de permissions par rôle ─────────────────────────────
router.get('/role-permissions', authenticateTicketAdmin, async (req, res) => {
    try {
        const rows = await pgDb.all('SELECT role, permission FROM hub_tickets.role_permissions ORDER BY permission, role');
        const result = {};
        for (const row of rows) {
            if (!result[row.permission]) result[row.permission] = [];
            result[row.permission].push(row.role);
        }
        res.json(result);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/role-permissions', authenticateTicketAdmin, async (req, res) => {
    try {
        const { permissions } = req.body;
        if (!permissions || typeof permissions !== 'object') {
            return res.status(400).json({ message: 'permissions object requis' });
        }
        // Vider la table puis réinsérer
        const { pool } = require('../../shared/database');
        await pool.query('DELETE FROM hub_tickets.role_permissions');
        for (const [perm, roles] of Object.entries(permissions)) {
            for (const role of Array.isArray(roles) ? roles : []) {
                await pool.query(
                    'INSERT INTO hub_tickets.role_permissions (role, permission) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [role, perm]
                );
            }
        }
        // Recharger le cache en mémoire
        const { loadPermissionsFromDb } = require('./middleware/ticket-permissions');
        await loadPermissionsFromDb();
        res.json({ message: 'Permissions mises à jour' });
    } catch (e) { res.status(400).json({ message: e.message }); }
});

/* ═══════════════════════════════════════════════════════════════════════════════
 *  Récupérer GLPI — réinitialisation complète + ré-import depuis le schéma glpi.*
 *
 *  La base tickets devient un miroir du schéma glpi.* :
 *   1. (optionnel) sauvegarde globale via le module backup ;
 *   2. effacement de TOUTES les données liées aux tickets (tickets, observers,
 *      suivis, assignations, historique, pièces jointes, liens, tags, SLA, favoris,
 *      relations, groupes/problèmes, chats live, KPI, files de notification) ;
 *   3. ré-import des 4 tables source glpi.* (ticket_status, tickets, observers, followups) ;
 *   4. réinitialisation des séquences.
 *
 *  La config admin (rôles, catégories, SLA, modèles, règles, VIP, groupes techniciens)
 *  et le niveau du collecteur mail (mail_collectors.last_run) sont CONSERVÉS.
 *  ═══════════════════════════════════════════════════════════════════════════════ */

// Tables de DONNÉES tickets à vider (RESTART IDENTITY réinitialise leurs séquences).
// CASCADE prend en charge les tables avec FK vers hub_tickets.tickets ; les tables
// sans FK (observers, ticket_followups, ticket_history) sont listées explicitement.
const GLPI_RESET_WIPE_TABLES = [
    'hub_tickets.tickets',          // CASCADE: ticket_assignments, ticket_category_assignments,
                                    //          ticket_tag_links, ticket_attachments, ticket_links,
                                    //          ticket_sla, ticket_sla_pauses, ticket_favorites,
                                    //          ticket_relations, ticket_email_mapping, ticket_group_members
    'hub_tickets.observers',
    'hub_tickets.ticket_followups',
    'hub_tickets.ticket_history',
    'hub_tickets.ticket_groups',    // groupes / problèmes
    'hub_tickets.ticket_group_members', // appartenances (sécurité ; aussi via CASCADE)
    'hub_tickets.ticket_status',
    'hub_tickets.kpi_history',
    'hub_tickets.notification_queue',
    'hub_tickets.notification_logs',
    'hub_tickets.auto_resolution_logs',
    'hub_tickets.live_satisfaction', // chats
    'hub_tickets.live_messages',
    'hub_tickets.live_sessions',
    'hub_tickets.live_otp_codes',
];

async function runGlpiReset({ backup, triggeredBy }) {
    const { pool } = require('../../shared/database');
    glpiResetProgress = {
        active: true, phase: 'starting', percent: 0, message: 'Initialisation…',
        startedAt: new Date().toISOString(), finishedAt: null, error: null, result: null,
    };

    try {
        // ─── Phase 1 : sauvegarde (optionnelle) ──────────────────────
        if (backup) {
            glpiResetProgress.phase = 'backup';
            glpiResetProgress.percent = 5;
            glpiResetProgress.message = 'Sauvegarde complète en cours… (cela peut prendre plusieurs minutes)';
            const backupCtrl = require('../backup/backup.controller');
            const summary = await backupCtrl.runAutomaticBackup('glpi-reset');
            glpiResetProgress.percent = 25;
            glpiResetProgress.message = `Sauvegarde terminée : ${summary?.file || ''}`;
        }

        // ─── Phase 2 : effacement + ré-import (transaction) ──────────
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Wipe — données tickets + chats
            glpiResetProgress.phase = 'wipe';
            glpiResetProgress.percent = 30;
            glpiResetProgress.message = 'Suppression des données tickets…';
            await client.query(
                `TRUNCATE TABLE ${GLPI_RESET_WIPE_TABLES.join(', ')} RESTART IDENTITY CASCADE`
            );
            // Tâches personnelles liées aux tickets
            await client.query(`DELETE FROM hub.user_tasks WHERE context_source = 'ticket'`);
            glpiResetProgress.percent = 55;

            // Import — ré-insertion depuis glpi.*
            glpiResetProgress.phase = 'import';
            glpiResetProgress.message = 'Import des statuts depuis GLPI…';
            await client.query(`
                INSERT INTO hub_tickets.ticket_status (id, label)
                SELECT id, label FROM glpi.ticket_status
            `);
            glpiResetProgress.percent = 60;

            glpiResetProgress.message = 'Import des tickets depuis GLPI…';
            await client.query(`
                INSERT INTO hub_tickets.tickets
                    (glpi_id, title, content, status, priority, urgency, impact,
                     category, type, date_creation, date_mod, date_closed, date_solved,
                     location, solution, source, entity, requester_name, email_alt,
                     requester_email_22)
                SELECT glpi_id, title, content, status, priority, urgency, impact,
                       category, type,
                       CASE WHEN date_creation ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}' THEN date_creation::TIMESTAMP ELSE NULL END,
                       CASE WHEN date_mod ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}' THEN date_mod::TIMESTAMP ELSE NULL END,
                       CASE WHEN status IN (5,6,7) AND date_closed ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}' THEN date_closed::TIMESTAMP ELSE NULL END,
                       CASE WHEN status IN (5,6,7) AND date_solved ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}' THEN date_solved::TIMESTAMP ELSE NULL END,
                       location, solution, source, entity, requester_name, email_alt,
                       requester_email_22
                FROM glpi.tickets
            `);
            glpiResetProgress.percent = 75;

            glpiResetProgress.message = 'Import des observateurs depuis GLPI…';
            await client.query(`
                INSERT INTO hub_tickets.observers
                    (ticket_id, user_id, name, login, email, is_active)
                SELECT ticket_id, user_id, name, login, email, is_active
                FROM glpi.observers
            `);
            glpiResetProgress.percent = 82;

            glpiResetProgress.message = 'Import des suivis/commentaires depuis GLPI…';
            await client.query(`
                INSERT INTO hub_tickets.ticket_followups
                    (ticket_id, content, content_hash, author_name, author_email,
                     is_private, date_creation)
                SELECT ticket_id, content, content_hash, author_name, author_email,
                       is_private,
                       CASE WHEN date_creation::text ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}'
                            THEN date_creation::text::TIMESTAMP ELSE NULL END
                FROM glpi.ticket_followups
            `);
            glpiResetProgress.percent = 88;

            // Assignations : copie glpi.assignees → ticket_assignments, en résolvant
            // l'id GLPI → hub.users.id par le login (renseigné via « noms/prénoms »).
            glpiResetProgress.message = 'Import des assignations depuis GLPI…';
            // ticket_assignments est vidé par le TRUNCATE ; un assigné principal par ticket.
            await client.query(`
                INSERT INTO hub_tickets.ticket_assignments (ticket_id, technician_id, is_primary)
                SELECT DISTINCT ON (a.ticket_id) a.ticket_id, u.id, true
                FROM glpi.assignees a
                JOIN hub.users u ON LOWER(u.username) = LOWER(a.login)
                JOIN hub_tickets.tickets t ON t.glpi_id = a.ticket_id
                ORDER BY a.ticket_id, a.user_id
            `);
            glpiResetProgress.percent = 90;

            // Assignations de groupe : copie glpi.group_assignees → ticket_assignments,
            // en utilisant le mapping glpi_group_mapping pour transformer l'id GLPI → groupe APP.
            glpiResetProgress.message = 'Import des assignations de groupe depuis GLPI…';
            await client.query(`
                INSERT INTO hub_tickets.ticket_assignments (ticket_id, group_id, is_primary)
                SELECT DISTINCT ON (ga.ticket_id) ga.ticket_id, gm.app_group_id, false
                FROM glpi.group_assignees ga
                JOIN hub_tickets.glpi_group_mapping gm ON ga.group_id = gm.glpi_group_id
                JOIN hub_tickets.tickets t ON t.glpi_id = ga.ticket_id
                WHERE gm.app_group_id IS NOT NULL
                  -- Ne sauter que si un GROUPE est déjà affecté (un tech seul ne doit pas bloquer
                  -- l'ajout du groupe → double affectation tech + groupe possible).
                  AND NOT EXISTS (
                      SELECT 1 FROM hub_tickets.ticket_assignments ta
                      WHERE ta.ticket_id = ga.ticket_id AND ta.group_id IS NOT NULL
                  )
                ORDER BY ga.ticket_id, ga.group_id
                ON CONFLICT DO NOTHING
            `);
            glpiResetProgress.percent = 92;

            // ─── Phase 3 : séquence d'ID des tickets hub ─────────────
            glpiResetProgress.phase = 'sequences';
            glpiResetProgress.message = 'Réinitialisation des séquences…';
            await client.query(`
                SELECT setval('hub_tickets.ticket_id_seq',
                    GREATEST(COALESCE((SELECT MAX(glpi_id) FROM hub_tickets.tickets), 0) + 1, 10000000))
            `);

            await client.query('COMMIT');

            // Rafraîchir les statistiques du planificateur pour des requêtes rapides post-import.
            glpiResetProgress.message = 'Optimisation (ANALYZE)…';
            try {
                await client.query('ANALYZE hub_tickets.tickets');
                await client.query('ANALYZE hub_tickets.ticket_followups');
                await client.query('ANALYZE hub_tickets.observers');
            } catch (e) { console.error('[GLPI-RESET] ANALYZE:', e.message); }
            glpiResetProgress.percent = 100;

            const counts = await pgDb.get(`
                SELECT
                    (SELECT COUNT(*) FROM hub_tickets.tickets) AS tickets,
                    (SELECT COUNT(*) FROM hub_tickets.observers) AS observers,
                    (SELECT COUNT(*) FROM hub_tickets.ticket_followups) AS followups
            `);
            glpiResetProgress.result = counts;
            glpiResetProgress.message =
                `Réinitialisation terminée : ${counts.tickets} ticket(s), ` +
                `${counts.observers} observateur(s), ${counts.followups} suivi(s) importé(s) depuis GLPI.`;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        glpiResetProgress.phase = 'done';
    } catch (error) {
        console.error('[GLPI-RESET] Erreur:', error.message);
        glpiResetProgress.phase = 'error';
        glpiResetProgress.error = error.message;
        glpiResetProgress.message = `Échec : ${error.message}`;
    } finally {
        glpiResetProgress.active = false;
        glpiResetProgress.finishedAt = new Date().toISOString();
        console.log(`[GLPI-RESET] Terminé (déclenché par ${triggeredBy}) : ${glpiResetProgress.message}`);
    }
}

// Progression de la réinitialisation (polling pour la barre de progression)
router.get('/sync-glpi/progress', authenticateJWT, async (req, res) => {
    const { resolveTicketRole } = require('./middleware/ticket-permissions');
    const role = await resolveTicketRole(req.user);
    if (!['superadmin', 'admin', 'supervisor'].includes(role)) {
        return res.status(403).json({ message: 'Rôle superviseur requis' });
    }
    res.json(glpiResetProgress);
});

// Déclenchement de la réinitialisation GLPI (asynchrone)
router.post('/sync-glpi', authenticateJWT, async (req, res) => {
    const { resolveTicketRole } = require('./middleware/ticket-permissions');

    try {
        const role = await resolveTicketRole(req.user);
        if (!['superadmin', 'admin', 'supervisor'].includes(role)) {
            return res.status(403).json({ message: 'Rôle superviseur requis' });
        }

        if (glpiResetProgress.active) {
            return res.status(409).json({ message: 'Une réinitialisation est déjà en cours.' });
        }

        // Vérifier que le schéma glpi.* contient des données
        const ticketCount = await pgDb.get('SELECT COUNT(*) as cnt FROM glpi.tickets');
        if (!ticketCount || Number(ticketCount.cnt) === 0) {
            return res.status(400).json({
                message: 'Aucun ticket dans le schéma glpi. Lancez d\'abord une synchro depuis /admin/glpi.'
            });
        }

        const backup = req.body?.backup === true || req.body?.backup === 'true';

        // Lancer en arrière-plan ; le front suit via /sync-glpi/progress
        runGlpiReset({ backup, triggeredBy: req.user?.username || 'inconnu' });

        res.status(202).json({ started: true, backup });
    } catch (error) {
        console.error('[GLPI-RESET] Erreur au démarrage:', error.message);
        res.status(500).json({ message: error.message });
    }
});

/* ═══════════════════════════════════════════════════════════════════════════════
 *  Notification Queue — GET / DELETE
 *  ═══════════════════════════════════════════════════════════════════════════════ */
const { pool } = require('../../shared/database');

router.get('/notification-queue', authenticateTicketAdmin, async (req, res) => {
    try {
        const { limit, status } = req.query;
        let sql = `SELECT * FROM hub_tickets.notification_queue`;
        const params = [];
        if (status) {
            sql += ` WHERE status = $1`;
            params.push(status);
        }
        sql += ` ORDER BY created_at DESC`;
        if (limit) sql += ` LIMIT ${parseInt(limit) || 300}`;
        const r = await pool.query(sql, params);
        res.json(r.rows);
    } catch (err) {
        console.error('[NOTIFICATION-QUEUE] GET error:', err.message);
        res.status(500).json({ message: err.message });
    }
});

router.delete('/notification-queue/:id', authenticateTicketAdmin, async (req, res) => {
    try {
        await pool.query(`DELETE FROM hub_tickets.notification_queue WHERE id = $1`, [req.params.id]);
        res.json({ message: 'Supprimé' });
    } catch (err) {
        console.error('[NOTIFICATION-QUEUE] DELETE error:', err.message);
        res.status(500).json({ message: err.message });
    }
});

router.delete('/notification-queue', authenticateTicketAdmin, async (req, res) => {
    try {
        const { status } = req.query;
        if (status) {
            const r = await pool.query(`DELETE FROM hub_tickets.notification_queue WHERE status = $1`, [status]);
            res.json({ message: `${r.rowCount} lignes supprimées (status=${status})` });
        } else {
            const r = await pool.query(`DELETE FROM hub_tickets.notification_queue`);
            res.json({ message: `${r.rowCount} lignes supprimées (total)` });
        }
    } catch (err) {
        console.error('[NOTIFICATION-QUEUE] CLEAR error:', err.message);
        res.status(500).json({ message: err.message });
    }
});

// ─── Reinitialize notification templates and triggers ─────────────
router.post('/reinit-notifications', authenticateTicketAdmin, async (req, res) => {
    let client;
    try {
        const { pool: pgPool } = require('../../shared/database');
        client = await pgPool.connect();

        // Répare les colonnes id (SERIAL manquant sur d'anciennes tables → id NULL/insert KO)
        for (const tbl of ['notification_templates', 'notification_triggers']) {
            try { await client.query(`CREATE SEQUENCE IF NOT EXISTS hub_tickets.${tbl}_id_seq`); } catch (e) {}
            try { await client.query(`ALTER TABLE hub_tickets.${tbl} ALTER COLUMN id SET DEFAULT nextval('hub_tickets.${tbl}_id_seq')`); } catch (e) {}
            try { await client.query(`ALTER SEQUENCE hub_tickets.${tbl}_id_seq OWNED BY hub_tickets.${tbl}.id`); } catch (e) {}
        }

        // Delete existing triggers
        await client.query(`DELETE FROM hub_tickets.notification_triggers`);

        // Delete existing templates
        await client.query(`DELETE FROM hub_tickets.notification_templates`);

        // Re-insert all templates (one by one with parameters to avoid quote issues)
        const templates = [
            ['ticket_created', 'Création de ticket', '{{app_name}} - Ticket #{{ticket_id}} créé : {{ticket_title}}', '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p>Bonjour {{recipient_name}},</p><p>Un nouveau ticket a été créé :</p><table cellpadding="4"><tr><td><strong>Priorité :</strong></td><td>{{priority_label}}</td></tr><tr><td><strong>Type :</strong></td><td>{{type_label}}</td></tr><tr><td><strong>Statut :</strong></td><td>{{status_label}}</td></tr></table><p>{{ticket_content}}</p><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir le ticket</a></p>'],
            ['ticket_assigned', 'Assignation de ticket', '{{app_name}} - Ticket #{{ticket_id}} vous a été assigné', '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p>Bonjour {{assignee_name}},</p><p>Le ticket <strong>#{{ticket_id}}</strong> vous a été assigné.</p><table cellpadding="4"><tr><td><strong>Priorité :</strong></td><td>{{priority_label}}</td></tr><tr><td><strong>Demandeur :</strong></td><td>{{requester_name}}</td></tr></table><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir le ticket</a></p>'],
            ['ticket_status_changed', 'Changement de statut', '{{app_name}} - Ticket #{{ticket_id}} : {{old_status}} → {{new_status}}', '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p>Le statut du ticket est passé de <strong>{{old_status}}</strong> à <strong>{{new_status}}</strong>.</p><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir le ticket</a></p>'],
            ['ticket_new_comment', 'Nouveau commentaire', '{{app_name}} - Nouveau commentaire sur le ticket #{{ticket_id}}', '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p><strong>{{author_name}}</strong> a ajouté un commentaire :</p><blockquote style="border-left:4px solid #6366f1;padding:8px 16px;margin:8px 0;">{{comment_content}}</blockquote><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir le ticket</a></p>'],
            ['ticket_comment_reply', 'Réponse au commentaire', '[Ticket #{{ticket_id}}] Réponse à votre demande', '<p>Bonjour {{recipient_name}},</p><p>Vous avez reçu une réponse concernant votre ticket <strong>#{{ticket_id}} – {{ticket_title}}</strong> :</p><blockquote style="border-left:4px solid #6366f1;padding-left:12px;margin:12px 0;color:#374151;">{{comment_content}}</blockquote><p style="margin-top:16px;"><a href="{{reply_url}}" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">↩ Répondre à ce message</a></p><p style="font-size:12px;color:#94a3b8;">Ou copiez ce lien dans votre navigateur : {{reply_url}}</p><p>Cordialement,<br>{{author_name}}</p>'],
            ['sla_warning', 'Alerte SLA', '{{app_name}} - ALERTE SLA : Ticket #{{ticket_id}}', '<h2>⚠️ Alerte SLA</h2><p>Le ticket <strong>#{{ticket_id}} - {{ticket_title}}</strong> approche de sa deadline.</p><p><strong>{{sla_type}}</strong> : {{sla_deadline}}</p><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#ef4444;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Agir maintenant</a></p>'],
            ['sla_breached', 'Dépassement SLA', '{{app_name}} - DÉPASSEMENT SLA : Ticket #{{ticket_id}}', '<h2>🚨 Dépassement SLA</h2><p>Le ticket <strong>#{{ticket_id}} - {{ticket_title}}</strong> a dépassé sa deadline.</p><p><strong>{{sla_type}}</strong> : {{sla_deadline}}</p><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#dc2626;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir le ticket</a></p>'],
            ['ticket_resolved', 'Ticket résolu', '{{app_name}} - Ticket #{{ticket_id}} résolu', '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p>Bonjour {{recipient_name}},</p><p>Votre ticket a été résolu par <strong>{{technician_name}}</strong>.</p><blockquote style="border-left:4px solid #22c55e;padding:8px 16px;margin:8px 0;">{{solution_text}}</blockquote><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#22c55e;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir la solution</a></p>'],
            ['ticket_closed', 'Ticket fermé', '{{app_name}} - Ticket #{{ticket_id}} fermé', '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p>Le ticket est maintenant fermé.</p><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir le ticket</a></p>'],
            ['ticket_reopened', 'Ticket réouvert', '{{app_name}} - Ticket #{{ticket_id}} réouvert', '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p>Le ticket a été réouvert par <strong>{{reopened_by}}</strong>.</p><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#f59e0b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir le ticket</a></p>'],
            ['live_summary', 'Résumé échange live', '[DSI] Résumé de votre échange', '<p>Bonjour {{recipient_name}},</p><p>Voici le résumé de votre échange #{{ticket_id}}.</p><p><a href="{{app_url}}/tickets/{{ticket_id}}">Voir le ticket</a></p>']
        ];

        for (const [slug, label, subject, body] of templates) {
            await client.query(
                'INSERT INTO hub_tickets.notification_templates (slug, label, subject, body_html, is_active) VALUES ($1, $2, $3, $4, true)',
                [slug, label, subject, body]
            );
        }

        // Re-insert all triggers (row by row, robuste)
        const triggers = [
            ['ticket.created', 'ticket_created', 'requester'],
            ['ticket.created', 'ticket_created', 'technician'],
            ['ticket.created', 'ticket_created', 'group'],
            ['ticket.created', 'ticket_created', 'supervisor'],
            ['ticket.created', 'ticket_created', 'watchers'],
            ['ticket.assigned', 'ticket_assigned', 'technician'],
            ['ticket.assigned', 'ticket_assigned', 'requester'],
            ['ticket.assigned', 'ticket_assigned', 'group'],
            ['ticket.assigned', 'ticket_assigned', 'supervisor'],
            ['ticket.status_changed', 'ticket_status_changed', 'requester'],
            ['ticket.status_changed', 'ticket_status_changed', 'technician'],
            ['ticket.status_changed', 'ticket_status_changed', 'group'],
            ['ticket.status_changed', 'ticket_status_changed', 'watchers'],
            ['ticket.comment_added', 'ticket_new_comment', 'requester'],
            ['ticket.comment_added', 'ticket_new_comment', 'watchers'],
            ['ticket.comment_added', 'ticket_new_comment', 'technician'],
            ['ticket.comment_added', 'ticket_new_comment', 'group'],
            ['ticket.sla_warning', 'sla_warning', 'technician'],
            ['ticket.sla_warning', 'sla_warning', 'group'],
            ['ticket.sla_warning', 'sla_warning', 'supervisor'],
            ['ticket.sla_warning', 'sla_warning', 'admin'],
            ['ticket.sla_breached', 'sla_breached', 'technician'],
            ['ticket.sla_breached', 'sla_breached', 'group'],
            ['ticket.sla_breached', 'sla_breached', 'supervisor'],
            ['ticket.sla_breached', 'sla_breached', 'admin'],
            ['ticket.resolved', 'ticket_resolved', 'requester'],
            ['ticket.resolved', 'ticket_resolved', 'watchers'],
            ['ticket.resolved', 'ticket_resolved', 'admin'],
            ['ticket.closed', 'ticket_closed', 'requester'],
            ['ticket.closed', 'ticket_closed', 'technician'],
            ['ticket.closed', 'ticket_closed', 'group'],
            ['ticket.closed', 'ticket_closed', 'admin'],
            ['ticket.closed', 'ticket_closed', 'watchers'],
            ['ticket.reopened', 'ticket_reopened', 'technician'],
            ['ticket.reopened', 'ticket_reopened', 'group'],
            ['ticket.reopened', 'ticket_reopened', 'supervisor'],
            ['ticket.reopened', 'ticket_reopened', 'watchers']
        ];

        let triggersInserted = 0;
        for (const [event, slug, recipient] of triggers) {
            const r = await client.query(
                `INSERT INTO hub_tickets.notification_triggers (event, template_slug, recipient_type, is_active)
                 VALUES ($1, $2, $3, true)`,
                [event, slug, recipient]
            );
            triggersInserted += r.rowCount || 0;
        }

        res.json({ message: `✅ ${templates.length} templates et ${triggersInserted} déclencheurs réinitialisés` });
    } catch (err) {
        console.error('[NOTIFICATION-REINIT] Error:', err.message);
        res.status(500).json({ message: err.message });
    } finally {
        if (client) client.release();
    }
});

// ─── Réponses auto (response templates) ─────────────────────────────────────

// GET /api/tickets/admin/response-templates?category_id=X
router.get('/response-templates', authenticateJWT, async (req, res) => {
    try {
        const { category_id, subcategory_id } = req.query;
        let sql = `
            SELECT rt.*,
                   c.name as category_name, c.full_path as category_path,
                   s.name as subcategory_name
            FROM hub_tickets.response_templates rt
            LEFT JOIN hub_tickets.ticket_categories c ON rt.category_id = c.id
            LEFT JOIN hub_tickets.ticket_categories s ON rt.subcategory_id = s.id
        `;
        const params = [];
        const conds = [];
        if (category_id) { conds.push(`rt.category_id = $${params.length + 1}`); params.push(parseInt(category_id)); }
        if (subcategory_id) { conds.push(`(rt.subcategory_id = $${params.length + 1} OR rt.subcategory_id IS NULL)`); params.push(parseInt(subcategory_id)); }
        if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
        sql += ' ORDER BY c.name, s.name, rt.name';
        const rows = await pgDb.all(sql, params);
        res.json(rows);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// POST /api/tickets/admin/response-templates
router.post('/response-templates', authenticateJWT, authenticateTicketAdmin, async (req, res) => {
    try {
        const { name, description, message, category_id, subcategory_id } = req.body;
        if (!name || !message) return res.status(400).json({ message: 'name et message requis' });
        const row = await pgDb.get(
            `INSERT INTO hub_tickets.response_templates (name, description, message, category_id, subcategory_id, created_by)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [name, description || null, message, category_id || null, subcategory_id || null, req.user.username]
        );
        res.status(201).json(row);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// PUT /api/tickets/admin/response-templates/:id
router.put('/response-templates/:id', authenticateJWT, authenticateTicketAdmin, async (req, res) => {
    try {
        const { name, description, message, category_id, subcategory_id } = req.body;
        const row = await pgDb.get(
            `UPDATE hub_tickets.response_templates
             SET name=$1, description=$2, message=$3, category_id=$4, subcategory_id=$5, updated_at=NOW()
             WHERE id=$6 RETURNING *`,
            [name, description || null, message, category_id || null, subcategory_id || null, req.params.id]
        );
        if (!row) return res.status(404).json({ message: 'Non trouvé' });
        res.json(row);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// DELETE /api/tickets/admin/response-templates/:id
router.delete('/response-templates/:id', authenticateJWT, authenticateTicketAdmin, async (req, res) => {
    try {
        await pgDb.run(`DELETE FROM hub_tickets.response_templates WHERE id=$1`, [req.params.id]);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── Base documentaire (knowledge documents) ───────────────────────────────

// GET /api/tickets/admin/knowledge-documents?category_id=X&app_id=Y
router.get('/knowledge-documents', authenticateJWT, async (req, res) => {
    try {
        const { category_id, app_id } = req.query;
        let sql = `
            SELECT d.id, d.name, d.description, d.category_id, d.app_id, d.original_name,
                   d.mimetype, d.size_bytes, d.uploaded_by, d.created_at,
                   c.name as category_name, c.full_path as category_path,
                   a.name as app_name
            FROM hub_tickets.knowledge_documents d
            LEFT JOIN hub_tickets.ticket_categories c ON d.category_id = c.id
            LEFT JOIN magapp.apps a ON d.app_id = a.id
        `;
        const params = [];
        const conds = [];
        if (category_id) { conds.push(`d.category_id = $${params.length + 1}`); params.push(parseInt(category_id)); }
        if (app_id) { conds.push(`d.app_id = $${params.length + 1}`); params.push(parseInt(app_id)); }
        if (conds.length) sql += ` WHERE ` + conds.join(' AND ');
        sql += ` ORDER BY a.name NULLS LAST, c.name NULLS FIRST, d.name`;
        const rows = await pgDb.all(sql, params);
        res.json(rows);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// POST /api/tickets/admin/knowledge-documents (multipart : file + name + description + category_id)
router.post('/knowledge-documents', authenticateJWT, authenticateTicketAdmin, kbUpload.single('file'), async (req, res) => {
    try {
        const { name, description, category_id, app_id } = req.body;
        if (!req.file) return res.status(400).json({ message: 'Fichier requis' });
        if (!name || !name.trim()) return res.status(400).json({ message: 'Nom requis' });

        // Stockage dans le repo configuré (/admin/ged) sous le module "tickets-kb"
        const saved = await storage.saveFile('tickets-kb', category_id || 'general', req.file);

        const row = await pgDb.get(
            `INSERT INTO hub_tickets.knowledge_documents
               (name, description, category_id, app_id, file_path, original_name, mimetype, size_bytes, uploaded_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [
                name.trim(), description || null,
                category_id ? parseInt(category_id) : null,
                app_id ? parseInt(app_id) : null,
                saved.dbPath,
                req.file.originalname,
                req.file.mimetype || null,
                req.file.size || null,
                req.user.username,
            ]
        );
        res.status(201).json({ id: row.id });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// PUT /api/tickets/admin/knowledge-documents/:id (métadonnées seulement)
router.put('/knowledge-documents/:id', authenticateJWT, authenticateTicketAdmin, async (req, res) => {
    try {
        const { name, description, category_id, app_id } = req.body;
        const row = await pgDb.get(
            `UPDATE hub_tickets.knowledge_documents
             SET name=$1, description=$2, category_id=$3, app_id=$4
             WHERE id=$5 RETURNING id`,
            [name, description || null, category_id || null, app_id || null, req.params.id]
        );
        if (!row) return res.status(404).json({ message: 'Non trouvé' });
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /api/tickets/admin/knowledge-documents/:id/download
router.get('/knowledge-documents/:id/download', authenticateJWT, async (req, res) => {
    try {
        const doc = await pgDb.get(`SELECT * FROM hub_tickets.knowledge_documents WHERE id=$1`, [req.params.id]);
        if (!doc) return res.status(404).json({ message: 'Document non trouvé' });
        const disposition = req.query.mode === 'attachment' ? 'attachment' : 'inline';

        if (storage.isStoragePath(doc.file_path)) {
            const f = await storage.getFileForServe(doc.file_path);
            if (!f) return res.status(404).json({ message: 'Fichier introuvable sur le stockage' });
            res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(doc.original_name)}"`);
            res.type(doc.mimetype || path.extname(doc.original_name) || 'application/octet-stream');
            if (f.absolutePath) return res.sendFile(f.absolutePath);
            return res.send(f.buffer);
        }
        res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(doc.original_name)}"`);
        res.type(doc.mimetype || 'application/octet-stream');
        res.sendFile(doc.file_path);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /api/tickets/admin/knowledge-documents/:id/public-link
// Renvoie un lien public signé (à insérer dans les réponses auto / emails)
router.get('/knowledge-documents/:id/public-link', authenticateJWT, async (req, res) => {
    try {
        const crypto = require('crypto');
        const { SECRET_KEY } = require('../../shared/config');
        const id = parseInt(req.params.id);
        const doc = await pgDb.get('SELECT id, name, original_name FROM hub_tickets.knowledge_documents WHERE id=$1', [id]);
        if (!doc) return res.status(404).json({ message: 'Document non trouvé' });
        const sig = crypto.createHmac('sha256', SECRET_KEY).update(`kbdoc|${id}`).digest('hex');
        // URL absolue (pour les liens dans les emails)
        let base = process.env.APP_BASE_URL || process.env.APP_URL || '';
        try {
            const db = getSqlite();
            const row = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'app_base_url'");
            if (row?.setting_value?.trim()) base = row.setting_value.trim();
        } catch (e) { /* ignore */ }
        base = (base || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
        const url = `${base}/api/public/kb-document/${id}?sig=${sig}`;
        res.json({ url, name: doc.name, original_name: doc.original_name });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /api/tickets/admin/magapp-doc-link/:docId
// Renvoie l'URL absolue d'un document magapp (préfixe app_base_url si relative)
router.get('/magapp-doc-link/:docId', authenticateJWT, async (req, res) => {
    try {
        const doc = await pgDb.get('SELECT id, title, url FROM magapp.app_docs WHERE id=$1', [parseInt(req.params.docId)]);
        if (!doc) return res.status(404).json({ message: 'Document non trouvé' });
        let url = (doc.url || '').trim();
        if (!/^https?:\/\//i.test(url)) {
            // URL relative (fichier uploadé) → préfixer avec l'URL de base configurée
            let base = process.env.APP_BASE_URL || process.env.APP_URL || '';
            try {
                const db = getSqlite();
                const row = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'app_base_url'");
                if (row?.setting_value?.trim()) base = row.setting_value.trim();
            } catch (e) { /* ignore */ }
            base = (base || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
            url = base + (url.startsWith('/') ? url : '/' + url);
        }
        res.json({ url, name: doc.title });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// DELETE /api/tickets/admin/knowledge-documents/:id
router.delete('/knowledge-documents/:id', authenticateJWT, authenticateTicketAdmin, async (req, res) => {
    try {
        const doc = await pgDb.get(`SELECT file_path FROM hub_tickets.knowledge_documents WHERE id=$1`, [req.params.id]);
        if (doc) {
            try { await storage.deleteFile(doc.file_path); } catch (e) { /* ignore */ }
        }
        await pgDb.run(`DELETE FROM hub_tickets.knowledge_documents WHERE id=$1`, [req.params.id]);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── Teams Crisis Webhook ──────────────────────────────────────
router.get('/teams-config', authenticateJWT, async (req, res) => {
    try {
        const rows = await pgDb.all(
            `SELECT key, value FROM hub_tickets.module_config WHERE key LIKE 'teams_%'`
        );
        const cfg = { teams_enabled: 'false', teams_webhook_url: '', teams_thread_title: '🚨 Incident Critique', teams_min_urgency: '4', teams_min_impact: '4', teams_channel_name: 'crise', teams_portal_url: 'https://dsihub.ivry.local' };
        for (const r of rows) cfg[r.key] = r.value;
        res.json(cfg);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/teams-config', authenticateJWT, authenticateTicketAdmin, async (req, res) => {
    try {
        const { teams_enabled, teams_webhook_url, teams_thread_title, teams_min_urgency, teams_min_impact, teams_channel_name, teams_portal_url } = req.body;
        console.log('[TEAMS-CONFIG] Saving:', JSON.stringify({ teams_enabled, teams_webhook_url: (teams_webhook_url || '').slice(0, 50) + '...', teams_thread_title }));
        const upsert = (key, val) => pgDb.run(
            `INSERT INTO hub_tickets.module_config (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [key, String(val ?? '')]
        );
        if (teams_enabled      !== undefined) await upsert('teams_enabled',      (teams_enabled === true || teams_enabled === 'true') ? 'true' : 'false');
        if (teams_webhook_url  !== undefined) await upsert('teams_webhook_url',  teams_webhook_url || '');
        if (teams_thread_title !== undefined) await upsert('teams_thread_title', teams_thread_title || '🚨 Incident Critique');
        if (teams_min_urgency  !== undefined) await upsert('teams_min_urgency',  String(teams_min_urgency));
        if (teams_min_impact   !== undefined) await upsert('teams_min_impact',   String(teams_min_impact));
        if (teams_channel_name !== undefined) await upsert('teams_channel_name', teams_channel_name || 'crise');
        if (teams_portal_url   !== undefined) await upsert('teams_portal_url',   teams_portal_url || 'https://dsihub.ivry.local');
        console.log('[TEAMS-CONFIG] Save successful');
        res.json({ success: true });
    } catch (e) {
        console.error('[TEAMS-CONFIG] Save error:', e.message, e.stack);
        res.status(500).json({ message: e.message });
    }
});

router.post('/test-teams-webhook', authenticateJWT, authenticateTicketAdmin, async (req, res) => {
    try {
        const webhookUrl = req.body.teams_webhook_url;
        if (!webhookUrl) return res.status(400).json({ message: 'URL du webhook requise' });

        const testCard = {
            '@type': 'MessageCard',
            '@context': 'http://schema.org/extensions',
            themeColor: '0072C6',
            title: '🔧 Test de connexion Teams',
            text: 'Ce message confirme que le webhook Teams est correctement configuré.',
            sections: [{ facts: [{ name: 'Date', value: new Date().toLocaleString('fr-FR') }] }]
        };

        const axios = require('axios');
        await axios.post(webhookUrl, testCard, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ message: 'Erreur : ' + (e.response?.data || e.message) });
    }
});

module.exports = router;
