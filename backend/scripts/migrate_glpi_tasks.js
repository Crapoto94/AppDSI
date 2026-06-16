/**
 * Migration : tâches GLPI (glpi.ticket_tasks) → DSIHUB
 *
 * Usage :
 *   node scripts/migrate_glpi_tasks.js            # dry-run (lecture seule)
 *   node scripts/migrate_glpi_tasks.js --execute   # écriture réelle
 *
 * Ce qu'il fait pour chaque tâche GLPI sur un ticket encore ouvert :
 *   state=1 (en cours) → crée une tâche DSIHUB (hub.user_tasks) + commentaire
 *   state=0 (planifiée) → commentaire uniquement
 *   state=2 (terminée) → commentaire uniquement
 */

const { pool } = require('../shared/database');
const crypto = require('crypto');

const isDryRun = !process.argv.includes('--execute');
const GROUP_FALLBACK_ID = 7;  // Support et Déploiement
const GROUP_FALLBACK_NAME = 'Support et Déploiement';

// Cache des groupes pour éviter de re-query
const groupMemberCache = new Map();

async function getGroupMembers(groupId) {
  if (groupMemberCache.has(groupId)) return groupMemberCache.get(groupId);
  const { rows } = await pool.query(`
    SELECT u.username, u.displayname
    FROM hub_tickets.technician_group_members tgm
    JOIN hub.users u ON u.id = tgm.user_id
    WHERE tgm.group_id = $1 AND u.is_approved = 1
  `, [groupId]);
  groupMemberCache.set(groupId, rows);
  return rows;
}

const STATE_LABEL = { 0: 'Planifiée', 1: 'En cours', 2: 'Terminée' };

function formatCommentContent(task, ticketTitle) {
  const stateLabel = STATE_LABEL[task.state] || `Inconnu (${task.state})`;
  const lines = [
    '---',
    `**Ancienne tâche GLPI — migrée le ${new Date().toLocaleDateString('fr-FR')}**`,
    `**État d'origine :** ${stateLabel}`,
    `**Auteur GLPI ID :** ${task.tech_name || 'non renseigné'}`,
    `**Date création :** ${task.date_creation ? new Date(task.date_creation).toLocaleString('fr-FR') : '?'}`,
    task.begin_date ? `**Début prévu :** ${new Date(task.begin_date).toLocaleString('fr-FR')}` : null,
    task.end_date ? `**Fin prévue :** ${new Date(task.end_date).toLocaleString('fr-FR')}` : null,
    task.actiontime ? `**Durée estimée :** ${Math.round(task.actiontime / 3600)}h` : null,
    '',
    '**Contenu original :**',
    (task.content || '(contenu vide)').replace(/<[^>]*>/g, '').trim(),
    '',
    '---',
  ].filter(Boolean);
  return lines.join('\n');
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim();
}

function truncate(str, max) {
  return str.length > max ? str.substring(0, max) + '…' : str;
}

async function run() {
  console.log('');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Migration GLPI Tasks → DSIHUB`);
  console.log(`  Mode : ${isDryRun ? 'DRY-RUN (aucune écriture)' : 'EXÉCUTION RÉELLE'}`);
  console.log('══════════════════════════════════════════════════════════');
  console.log('');

  // 1. Préparer la colonne migrated_at
  const hasCol = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='glpi' AND table_name='ticket_tasks' AND column_name='migrated_at'
  `);
  if (hasCol.rows.length === 0 && !isDryRun) {
    await pool.query('ALTER TABLE glpi.ticket_tasks ADD COLUMN migrated_at TIMESTAMP');
  }
  const colExists = hasCol.rows.length > 0;

  // 2. Charger les tâches GLPI non migrées sur tickets ouverts
  const { rows: tasks } = await pool.query(`
    SELECT tt.id, tt.glpi_task_id, tt.ticket_id, tt.content, tt.state,
           tt.tech_name, tt.begin_date, tt.end_date, tt.actiontime,
           tt.date_creation, tt.date_mod, tt.is_private,
           ht.title AS ticket_title, ht.status AS ticket_status,
           COALESCE((
             SELECT tg.id FROM hub_tickets.ticket_assignments ta2
             JOIN hub_tickets.technician_groups tg ON tg.id = ta2.group_id
             WHERE ta2.ticket_id = tt.ticket_id AND ta2.group_id IS NOT NULL
             LIMIT 1
           ), $1) AS group_id,
           COALESCE((
             SELECT tg.name FROM hub_tickets.ticket_assignments ta2
             JOIN hub_tickets.technician_groups tg ON tg.id = ta2.group_id
             WHERE ta2.ticket_id = tt.ticket_id AND ta2.group_id IS NOT NULL
             LIMIT 1
           ), $2) AS group_name${colExists ? `,
           tt.migrated_at` : ''}
    FROM glpi.ticket_tasks tt
    JOIN glpi.tickets ht ON ht.glpi_id = tt.ticket_id
    WHERE (ht.status NOT IN (5, 6) OR tt.state IN (1, 2))
      ${colExists ? "AND tt.migrated_at IS NULL" : ""}
    ORDER BY tt.ticket_id, tt.id
  `, [GROUP_FALLBACK_ID, GROUP_FALLBACK_NAME]);

  if (tasks.length === 0) {
    console.log('Aucune tâche GLPI à migrer.');
    process.exit(0);
  }

  // 3. Regrouper par ticket pour affichage
  const byTicket = {};
  for (const t of tasks) {
    if (!byTicket[t.ticket_id]) byTicket[t.ticket_id] = { title: t.ticket_title, tasks: [] };
    byTicket[t.ticket_id].tasks.push(t);
  }

  // 4. Statistiques
  const byState = { 0: 0, 1: 0, 2: 0 };
  const byGroup = {};
  for (const t of tasks) {
    byState[t.state] = (byState[t.state] || 0) + 1;
    const g = t.group_name || 'Aucun';
    byGroup[g] = (byGroup[g] || 0) + 1;
  }

  console.log(`Total à traiter : ${tasks.length} tâches sur ${Object.keys(byTicket).length} tickets\n`);

  console.log('Répartition par état :');
  for (const [s, c] of Object.entries(byState)) {
    console.log(`  state=${s} (${STATE_LABEL[s] || '?'}) : ${c}`);
  }
  console.log('');

  console.log('Répartition par groupe :');
  for (const [g, c] of Object.entries(byGroup).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${g} : ${c}`);
  }
  console.log('');

  if (isDryRun) {
    // ── DRY RUN : affichage uniquement ──
    let dsihubCount = 0;
    for (const t of tasks) {
      const isClosed = [5, 6].includes(t.ticket_status);
      const action = (t.state === 1 && !isClosed)
        ? `TÂCHE DSIHUB + commentaire → groupe « ${t.group_name} »`
        : 'Commentaire uniquement';
      if (t.state === 1 && !isClosed) dsihubCount++;

      const contentPreview = truncate(stripHtml(t.content), 60);
      console.log(`  #${t.ticket_id} | Tâche GLPI #${t.id} | state=${t.state} | ${action}`);
      console.log(`    Ticket : ${truncate(t.ticket_title || '', 80)}`);
      console.log(`    Contenu : ${contentPreview || '(vide)'}`);
      console.log('');
    }

    // Aperçu des group members pour chaque groupe concerné
    const groupsNeeded = new Set(tasks.filter(t => t.state === 1 && ![5, 6].includes(t.ticket_status)).map(t => t.group_id));
    console.log('══════════════════════════════════════════════════════════');
    console.log('Membres des groupes qui recevront des tâches DSIHUB :');
    for (const gid of groupsNeeded) {
      const members = await getGroupMembers(gid);
      const gname = tasks.find(t => t.group_id === gid)?.group_name || `ID ${gid}`;
      console.log(`  ${gname} (ID ${gid}) : ${members.map(m => m.username || m.displayname).join(', ') || 'aucun membre'}`);
    }
    console.log('');

    // Simulation nombre de lignes user_tasks créées
    let userTaskRows = 0;
    for (const t of tasks) {
      if (t.state === 1 && ![5, 6].includes(t.ticket_status)) {
        const members = await getGroupMembers(t.group_id);
        userTaskRows += Math.max(members.length, 1);
      }
    }
    console.log(`Résumé dry-run :`);
    console.log(`  Tickets concernés        : ${Object.keys(byTicket).length}`);
    console.log(`  Tâches GLPI à traiter    : ${tasks.length}`);
    console.log(`  Dont → Tâches DSIHUB     : ${dsihubCount} (state=1)`);
    console.log(`  Dont → Commentaires seuls : ${tasks.length - dsihubCount} (state=0/2)`);
    console.log(`  Lignes user_tasks créées : ~${userTaskRows} (une par membre de groupe)`);
    console.log(`  Commentaires créés       : ${tasks.length}`);
    console.log('');
    console.log('⚠️  Mode DRY-RUN — aucune modification. Relancer avec --execute pour appliquer.');
    console.log('');
    process.exit(0);
  }

  // ── EXÉCUTION RÉELLE ──
  console.log('Exécution de la migration...');
  let done = 0;
  let errors = 0;

  for (const t of tasks) {
    try {
      // --- Étape A : Commentaire sur le ticket ---
      const commentContent = formatCommentContent(t, t.ticket_title);
      const contentHash = crypto.createHash('md5').update(commentContent).digest('hex');
      await pool.query(`
        INSERT INTO hub_tickets.ticket_followups
          (ticket_id, content, content_hash, author_name, author_email, is_private, date_creation)
        VALUES ($1, $2, $3, $4, $5, 0, NOW())
      `, [t.ticket_id, commentContent, contentHash, 'Système (migration GLPI)', 'migration@dsihub.local']);

      // --- Étape B : Tâche DSIHUB si state=1 et ticket ouvert ---
      if (t.state === 1 && ![5, 6].includes(t.ticket_status)) {
        const members = await getGroupMembers(t.group_id);
        const teamGroupId = crypto.randomUUID();
        const desc = `[GLPI #${t.id}] ${stripHtml(t.content).substring(0, 200)}`;

        for (const member of members) {
          await pool.query(`
            INSERT INTO hub.user_tasks
              (username, description, echeance, statut,
               is_team_task, team_group_id, team_group_name, created_by,
               context_source, context_id, context_title,
               priority, is_public, created_at, updated_at)
            VALUES ($1, $2, $3, 'a_faire',
                    true, $4, $5, 'migration',
                    'ticket', $6, $7,
                    'normale', false, NOW(), NOW())
          `, [
            member.username, desc,
            t.end_date ? new Date(t.end_date).toISOString().substring(0, 10) : null,
            teamGroupId, t.group_name,
            t.ticket_id, truncate(t.ticket_title || '', 255),
          ]);
        }

        // Si le groupe n'a pas de membres, créer quand même une tâche "orpheline"
        if (members.length === 0) {
          await pool.query(`
            INSERT INTO hub.user_tasks
              (username, description, echeance, statut,
               is_team_task, team_group_id, team_group_name, created_by,
               context_source, context_id, context_title,
               priority, is_public, created_at, updated_at)
            VALUES ($1, $2, $3, 'a_faire',
                    false, NULL, $4, 'migration',
                    'ticket', $5, $6,
                    'normale', true, NOW(), NOW())
          `, [
            'migration', desc,
            t.end_date ? new Date(t.end_date).toISOString().substring(0, 10) : null,
            t.group_name,
            t.ticket_id, truncate(t.ticket_title || '', 255),
          ]);
        }
      }

      // --- Étape C : Marquer comme migré ---
      await pool.query('UPDATE glpi.ticket_tasks SET migrated_at = NOW() WHERE id = $1', [t.id]);

      done++;
      if (done % 25 === 0) process.stdout.write(`  ${done}/${tasks.length} traités...\n`);
    } catch (err) {
      console.error(`  ERREUR sur tâche GLPI #${t.id} (ticket #${t.ticket_id}) :`, err.message);
      errors++;
    }
  }

  console.log('');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Migration terminée.`);
  console.log(`  Traités   : ${done}/${tasks.length}`);
  console.log(`  Erreurs   : ${errors}`);
  console.log('══════════════════════════════════════════════════════════');
  process.exit(errors > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
