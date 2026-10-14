// Entrées de journal de projet alimentées automatiquement :
//  - 'tache_terminee'   : une tâche rattachée au projet vient d'être terminée (date = date de validation) ;
//  - 'revue_commentaire': l'annotation faite sur le projet lors d'une revue de projets (date = date de la revue).
// Chaque entrée porte une clé stable (details.auto_key) : on peut la mettre à jour, la retirer (tâche rouverte,
// annotation vidée) sans doublon. Les commentaires d'une tâche sont relus à la volée (getJournal → enrichirEntrees).
const { pgDb, pool } = require('../../shared/database');

const TERMINE = ['terminé', 'terminée', 'terminee'];
const estTermine = (s) => TERMINE.includes(String(s || '').toLowerCase());

function parseDetails(d) {
    try { return d ? JSON.parse(d) : null; } catch { return null; }
}

async function trouverEntree(projetId, type, key) {
    const rows = await pgDb.all('SELECT id, details FROM projet_journal WHERE projet_id = $1 AND type_entree = $2', [projetId, type]);
    return rows.find(r => parseDetails(r.details)?.auto_key === key) || null;
}

async function retirerEntree(projetId, type, key) {
    const e = await trouverEntree(projetId, type, key);
    if (e) await pgDb.run('DELETE FROM projet_journal WHERE id = $1', [e.id]);
}

// keepDate : si l'entrée existe déjà, on ne touche pas à sa date (ex. tâche déjà terminée).
async function ecrireEntree({ projetId, type, key, message, details, username, date, keepDate }) {
    const payload = JSON.stringify({ ...details, auto_key: key });
    const e = await trouverEntree(projetId, type, key);
    if (e) {
        if (keepDate) return;
        await pgDb.run('UPDATE projet_journal SET message = $1, details = $2, username = COALESCE($3, username), date_entree = $4 WHERE id = $5',
            [message, payload, username || null, date, e.id]);
    } else {
        await pgDb.run('INSERT INTO projet_journal (projet_id, type_entree, message, details, username, date_entree) VALUES ($1, $2, $3, $4, $5, $6)',
            [projetId, type, message, payload, username || 'système', date]);
    }
}

// ─── Tâches ──────────────────────────────────────────────────────────────────

/** Tâche terminée → entrée datée de la validation ; tâche rouverte/refusée → entrée retirée. */
async function journaliserTache({ projetId, key, statut, description, username, responsable, notesRef, date }) {
    if (!projetId || !key) return;
    try {
        if (estTermine(statut)) {
            await ecrireEntree({
                projetId, type: 'tache_terminee', key,
                message: `Tâche terminée : ${String(description || '').trim() || '(sans titre)'}`,
                details: { notes_ref: notesRef || null, validated_by: username || null, responsable: responsable || null },
                username: username || 'système', date: date || new Date(), keepDate: true,
            });
        } else {
            await retirerEntree(projetId, 'tache_terminee', key);
        }
    } catch (e) { console.error('[journal-auto] tâche:', e.message); }
}

/**
 * Appelé après un changement de statut depuis « Mes tâches » (tasks.controller#updateTaskStatus).
 * Résout le projet et la clé selon l'origine de la tâche.
 */
async function journaliserDepuisStatut({ source, id, statut, taskContext, isUserTask, username }) {
    try {
        if (isUserTask) {
            const ctx = taskContext || {};
            if ((ctx.context_source === 'projet' || ctx.context_source === 'projet_standalone') && ctx.context_id) {
                await journaliserTache({
                    projetId: parseInt(ctx.context_id, 10), key: `ut:${ctx.team_group_id || id}`, statut,
                    description: ctx.description, username,
                    notesRef: { kind: 'task_notes', source: ctx.context_source, task_id: String(id) },
                });
            }
            return;
        }
        if (source === 'projet_standalone') {
            const r = (await pool.query('SELECT projet_id, tache, responsable FROM projets.projet_taches_standalone WHERE id = $1', [id])).rows[0];
            if (r) await journaliserTache({ projetId: r.projet_id, key: `st:${id}`, statut, description: r.tache, username, responsable: r.responsable, notesRef: { kind: 'standalone', id: Number(id) } });
        } else if (source === 'projet') {
            const r = (await pool.query('SELECT projet_id, titre, responsable_username FROM projets.projet_taches WHERE id = $1', [id])).rows[0];
            if (r) await journaliserTache({ projetId: r.projet_id, key: `pt:${id}`, statut, description: r.titre, username, responsable: r.responsable_username });
        } else if (source === 'revue') {
            const r = (await pool.query('SELECT projet_id, titre, responsable FROM hub_rencontres.revue_taches WHERE id = $1', [id])).rows[0];
            if (r?.projet_id) await journaliserTache({ projetId: r.projet_id, key: `rv:${id}`, statut, description: r.titre, username, responsable: r.responsable, notesRef: { kind: 'revue', id: Number(id) } });
        } else if (source === 'reunion') {
            const compositeId = parseInt(id, 10);
            const reunionId = Math.floor(compositeId / 10000);
            const index = (compositeId % 10000) - 1;
            await journaliserTacheReunion({ reunionId, index, statut, username });
        }
    } catch (e) { console.error('[journal-auto] depuis statut:', e.message); }
}

/** Tâche issue d'une réunion (JSON liste_taches) : journalisée dans chaque projet auquel la réunion est liée. */
async function journaliserTacheReunion({ reunionId, index, statut, username, projetId }) {
    try {
        const r = (await pool.query('SELECT liste_taches FROM hub_rencontres.rencontres_reunions WHERE id = $1', [reunionId])).rows[0];
        let taches = []; try { taches = JSON.parse(r?.liste_taches || '[]'); } catch { /* ignore */ }
        const t = taches[index];
        if (!t) return;
        let projetIds = projetId ? [projetId] : (await pool.query('SELECT DISTINCT projet_id FROM projets.projet_reunions WHERE reunion_id = $1', [reunionId])).rows.map(x => x.projet_id);
        for (const pid of projetIds) {
            await journaliserTache({
                projetId: pid, key: `rn:${reunionId}-${index}`, statut, description: t.tache, username, responsable: t.responsable,
                notesRef: { kind: 'meeting', reunion_id: reunionId, index },
            });
        }
    } catch (e) { console.error('[journal-auto] réunion:', e.message); }
}

// ─── Annotation de revue de projets ──────────────────────────────────────────

const htmlVide = (html) => !html || String(html).replace(/<(.|\n)*?>/g, '').replace(/&nbsp;/g, ' ').trim().length === 0;

/** Annotation du projet lors d'une revue → entrée datée de la revue ; annotation vidée → entrée retirée. */
async function journaliserCommentaireRevue({ revueId, projetId, commentaire, username }) {
    try {
        const key = `revue:${revueId}`;
        if (htmlVide(commentaire)) { await retirerEntree(projetId, 'revue_commentaire', key); return; }
        const rv = (await pool.query('SELECT titre, date_revue FROM hub_rencontres.revues WHERE id = $1', [revueId])).rows[0];
        await ecrireEntree({
            projetId, type: 'revue_commentaire', key,
            message: `Revue de projets${rv?.date_revue ? ' du ' + new Date(rv.date_revue).toLocaleDateString('fr-FR') : ''} : annotation sur le projet`,
            details: { revue_id: revueId, revue_titre: rv?.titre || null, commentaire_html: commentaire },
            username, date: rv?.date_revue || new Date(),
        });
    } catch (e) { console.error('[journal-auto] revue:', e.message); }
}

async function retirerCommentairesRevue(revueId) {
    try {
        const rows = await pgDb.all(`SELECT id, details FROM projet_journal WHERE type_entree = 'revue_commentaire'`);
        for (const r of rows) if (parseDetails(r.details)?.auto_key === `revue:${revueId}`) await pgDb.run('DELETE FROM projet_journal WHERE id = $1', [r.id]);
    } catch (e) { console.error('[journal-auto] retrait revue:', e.message); }
}

// ─── Lecture : commentaires des tâches terminées ─────────────────────────────

async function lireNotes(ref, projetId) {
    if (!ref) return [];
    try {
        if (ref.kind === 'task_notes') {
            const { rows } = await pool.query('SELECT id, type, content, filename, created_by, created_at FROM hub.task_notes WHERE source = $1 AND task_id = $2 ORDER BY created_at', [ref.source, String(ref.task_id)]);
            return rows.map(n => ({ ...n, file_url: n.type === 'file' ? `/api/tasks/${ref.source}/${ref.task_id}/notes/${n.id}/file` : null }));
        }
        let notes = []; let aggId = null;
        if (ref.kind === 'standalone') {
            const r = (await pool.query('SELECT notes FROM projets.projet_taches_standalone WHERE id = $1', [ref.id])).rows[0];
            try { notes = JSON.parse(r?.notes || '[]'); } catch { /* ignore */ }
            aggId = `s-${ref.id}`;
        } else if (ref.kind === 'revue') {
            const r = (await pool.query('SELECT notes FROM hub_rencontres.revue_taches WHERE id = $1', [ref.id])).rows[0];
            try { notes = JSON.parse(r?.notes || '[]'); } catch { /* ignore */ }
            aggId = `revue-${ref.id}`;
        } else if (ref.kind === 'meeting') {
            const r = (await pool.query('SELECT liste_taches FROM hub_rencontres.rencontres_reunions WHERE id = $1', [ref.reunion_id])).rows[0];
            let t = []; try { t = JSON.parse(r?.liste_taches || '[]'); } catch { /* ignore */ }
            notes = t[ref.index]?.notes || [];
            aggId = `m-${ref.reunion_id}-${ref.index}`;
        }
        return (Array.isArray(notes) ? notes : []).map((n, i) => ({
            id: n.id ?? i, type: n.type || 'comment', content: n.content, filename: n.filename || null,
            created_by: n.created_by, created_at: n.created_at,
            file_url: n.type === 'file' ? `/api/projets/${projetId}/taches-agregees/${aggId}/notes/${i}/file` : null,
        }));
    } catch (e) { return []; }
}

/** Ajoute `notes` (commentaires à jour) aux entrées 'tache_terminee' d'une liste de journal. */
async function enrichirEntrees(entries) {
    for (const e of entries) {
        if (e.type_entree !== 'tache_terminee') continue;
        const d = parseDetails(e.details);
        e.notes = await lireNotes(d?.notes_ref, e.projet_id);
    }
    return entries;
}

module.exports = {
    estTermine, journaliserTache, journaliserDepuisStatut, journaliserTacheReunion,
    journaliserCommentaireRevue, retirerCommentairesRevue, enrichirEntrees,
};
