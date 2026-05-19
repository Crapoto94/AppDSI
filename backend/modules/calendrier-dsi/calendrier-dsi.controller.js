const { pool } = require('../../shared/pg_db');

let sendMailFn = null;

function pad2(n) { return String(n).padStart(2, '0'); }

function formatDateStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function getDatesInRange(debutStr, finStr) {
  const dates = [];
  const d = new Date(debutStr + 'T00:00:00');
  const end = new Date(finStr + 'T00:00:00');
  while (d <= end) {
    dates.push(formatDateStr(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function getDatesForDayOfWeek(debut, fin, dayOfWeek) {
  const dates = [];
  const start = new Date(debut + 'T00:00:00');
  const end = new Date(fin + 'T00:00:00');
  const d = new Date(start);
  while (d <= end) {
    if (d.getDay() === dayOfWeek) {
      dates.push(formatDateStr(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function periodeLabel(code) {
  if (!code) return '';
  const normalized = code.toUpperCase().trim();
  if (['MATIN', 'M', 'AM'].includes(normalized)) return 'matin';
  if (['APRES-MIDI', 'APRES MIDI', 'APRESMIDI', 'PM', 'APM'].includes(normalized)) return 'apres-midi';
  if (['JOURNEE', 'JOUR', 'J'].includes(normalized)) return '';
  return '';
}

function computePeriodes(typjourDeb, typjourFin, hrDeb, hrFin) {
  // Returns array of periode strings: ['matin'], ['apres-midi'], or ['matin', 'apres-midi'] (full day -> '')
  const deb = (typjourDeb || '').toUpperCase().trim();
  const fin = (typjourFin || '').toUpperCase().trim();

  // Case 1: explicit Matin/Apres-midi
  if (deb === 'MATIN' && fin === 'MATIN') return ['matin'];
  if (deb === 'APRES MIDI' || deb === 'APRES-MIDI') return ['apres-midi'];
  if (fin === 'APRES MIDI' || fin === 'APRES-MIDI') return ['matin', 'apres-midi']; // Matin -> Apres midi = full day
  if (deb === 'MATIN') {
    if (fin === 'APRES MIDI' || fin === 'APRES-MIDI' || fin === '') return ['matin', 'apres-midi'];
    if (fin === 'MATIN') return ['matin'];
    return ['matin', 'apres-midi']; // default to full day
  }

  // Case 2: Heure - use actual times
  if (deb === 'HEURE' || fin === 'HEURE') {
    let startHour = 12;
    let endHour = 12;
    if (hrDeb instanceof Date) startHour = hrDeb.getHours();
    else if (hrDeb && typeof hrDeb === 'object' && hrDeb.getHours) startHour = hrDeb.getHours();
    if (hrFin instanceof Date) endHour = hrFin.getHours();
    else if (hrFin && typeof hrFin === 'object' && hrFin.getHours) endHour = hrFin.getHours();

    const startsMorning = startHour < 12;
    const endsAfternoon = endHour > 12 || (endHour === 12 && hrFin instanceof Date && hrFin.getMinutes() > 0);

    if (startsMorning && endsAfternoon) return ['matin', 'apres-midi'];
    if (startsMorning && !endsAfternoon) return ['matin'];
    if (!startsMorning) return ['apres-midi'];
    return ['matin', 'apres-midi']; // fallback
  }

  // Default: full day
  return ['matin', 'apres-midi'];
}

const CATEGORY_COLORS = {
  absence: '#E30613',
  teletravail: '#003366',
  maintenance: '#FF9800'
};

let genIdCounter = -1;

function nextGenId() {
  return genIdCounter--;
}

async function getDemabsEventsForRange(debut, fin) {
  const demabsEvents = [];
  try {
    const demabsResult = await pool.query(`
      SELECT a.username, a.nom, a.email, a.matricule,
             d."TPS_DMDA_DT_DEBUT", d."TPS_DMDA_DT_FIN",
             d."TPS_DMDA_TYPE", d."TPS_DMDA_CHRONO",
             d."TPS_DMDA_TYPJOUR_DEB", d."TPS_DMDA_TYPJOUR_FIN",
             d."TPS_DMDA_HR_DEBUT", d."TPS_DMDA_HR_FIN",
             d."TPS_DMDA_ETAT"
      FROM hub_calendrier.agents_dsi a
      JOIN oracle.rh_tps_demabs d ON TRIM(a.matricule) = TRIM(d."RH_AGENT_MATRICULE")
      WHERE a.matricule IS NOT NULL AND a.matricule != ''
        AND d."TPS_DMDA_DT_DEBUT" IS NOT NULL
        AND (d."TPS_DMDA_SUPPR" IS NULL OR TRIM(d."TPS_DMDA_SUPPR") = '0')
    `);

    const parseJsDate = (d) => {
      if (!d) return null;
      if (d instanceof Date) {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      }
      if (typeof d === 'string') {
        const m = d.match(/(\w{3}) (\w{3}) (\d{1,2}) (\d{4})/);
        if (m) { return new Date(d).toISOString().split('T')[0]; }
        return d.split('T')[0];
      }
      return null;
    };

    const typeLabels = { '1': 'Congé annuel', '2': 'Maladie', '3': 'Maternité', '4': 'PAT', '5': 'Sans solde', '6': 'Formation', '7': 'Convenance', '8': 'Autorisation absence' };

    const seenKeys = new Set();

    for (const row of demabsResult.rows) {
      const startDate = parseJsDate(row.TPS_DMDA_DT_DEBUT);
      const endDate = parseJsDate(row.TPS_DMDA_DT_FIN) || startDate;
      if (!startDate) continue;
      if (endDate < debut || startDate > fin) continue;

      const dates = getDatesInRange(
        startDate > debut ? startDate : debut,
        endDate < fin ? endDate : fin
      );
      if (dates.length === 0) continue;

      const periodes = computePeriodes(row.TPS_DMDA_TYPJOUR_DEB, row.TPS_DMDA_TYPJOUR_FIN, row.TPS_DMDA_HR_DEBUT, row.TPS_DMDA_HR_FIN);
      const periode = periodes.length === 2 ? '' : periodes[0] || '';
      const typeNum = String(row.TPS_DMDA_TYPE || '').trim();
      const typeLabel = typeLabels[typeNum] || `Type ${typeNum}`;
      const etat = String(row.TPS_DMDA_ETAT || '').trim();
      const chrono = String(row.TPS_DMDA_CHRONO || '').trim();
      const etatLabel = etat === 'A' ? 'En attente' : etat === 'E' ? 'En cours' : '';
      const isPending = etat === 'A' || etat === 'E';
      const periodeStr = periode === 'matin' ? 'Matin' : periode === 'apres-midi' ? 'Après-midi' : '';
      const description = `${typeLabel}${periodeStr ? ' (' + periodeStr + ')' : ''}${chrono ? ' - ' + chrono : ''}${etatLabel ? ' ⏳ ' + etatLabel : ''}`;

      for (const date of dates) {
        const dedupeKey = `${row.username}|${date}|${periode}`;
        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);

        demabsEvents.push({
          date,
          categorie: 'absence',
          periode,
          titre: row.nom,
          description,
          agent_username: row.username,
          agent_nom: row.nom,
          agent_email: row.email || '',
          couleur: CATEGORY_COLORS.absence,
          source: 'demabs',
          pending: isPending,
          demabs_id: null
        });
      }
    }
  } catch (err) {
    console.error('[Calendrier DSI] getDemabsEventsForRange error:', err.message);
  }
  return demabsEvents;
}

async function getEventsForDate(date) {
  // Get manual events for this date
  const result = await pool.query(
    `SELECT id, date::text as date, categorie, periode, titre, description, agent_username, agent_nom, agent_email, couleur, created_by, created_at FROM hub_calendrier.evenements WHERE date::date = $1 ORDER BY categorie, periode`,
    [date]
  );
  const events = [...result.rows];
  genIdCounter = -1;

  // Get all agents with their TT days and absences
  const agentsResult = await pool.query(`
    SELECT a.username, a.nom, a.email,
      COALESCE((SELECT json_agg(t.jour_semaine ORDER BY t.jour_semaine) FROM hub_calendrier.agents_tt_days t WHERE t.agent_username = a.username), '[]') as tt_fixed_days,
      COALESCE(json_agg(json_build_object('id', ap.id, 'jour_semaine', ap.jour_semaine, 'periode', ap.periode)) FILTER (WHERE ap.id IS NOT NULL), '[]') as absences
    FROM hub_calendrier.agents_dsi a
    LEFT JOIN hub_calendrier.absences_permanentes ap ON a.username = ap.agent_username
    GROUP BY a.username
  `);

  // Build set of existing manual events
  const manualKeys = new Set();
  for (const row of result.rows) {
    if (row.agent_username) {
      manualKeys.add(`${row.agent_username}|${date}|${row.categorie}|${row.periode || ''}`);
      if (row.periode === '') {
        manualKeys.add(`${row.agent_username}|${date}|${row.categorie}|matin`);
        manualKeys.add(`${row.agent_username}|${date}|${row.categorie}|apres-midi`);
      }
    }
  }

  // Parse date string and create date in local timezone
  const [year, month, day] = date.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  const dayOfWeek = dateObj.getDay(); // Use same convention as getDatesForDayOfWeek (0=Sun, 1=Mon, etc)

  // Add generated TT events
  for (const agent of agentsResult.rows) {
    const ttDays = agent.tt_fixed_days || [];
    if (ttDays.includes(dayOfWeek)) {
      if (!manualKeys.has(`${agent.username}|${date}|teletravail|`)) {
        events.push({
          id: nextGenId(),
          date,
          categorie: 'teletravail',
          periode: '',
          titre: agent.nom,
          description: 'TT fixe',
          agent_username: agent.username,
          agent_nom: agent.nom,
          agent_email: agent.email || '',
          couleur: CATEGORY_COLORS.teletravail,
          created_by: 'auto',
          created_at: null,
          generated: true
        });
      }
    }
  }

  // Add generated absence events
  for (const agent of agentsResult.rows) {
    const absences = agent.absences || [];
    for (const abs of absences) {
      if (abs.jour_semaine === dayOfWeek) {
        if (!manualKeys.has(`${agent.username}|${date}|absence|${abs.periode}`)) {
          events.push({
            id: nextGenId(),
            date,
            categorie: 'absence',
            periode: abs.periode === 'journee' ? '' : abs.periode,
            titre: agent.nom,
            description: `Absence permanente ${abs.periode}`,
            agent_username: agent.username,
            agent_nom: agent.nom,
            agent_email: agent.email || '',
            couleur: CATEGORY_COLORS.absence,
            created_by: 'auto',
            created_at: null,
            generated: true
          });
        }
      }
    }
  }

  // Add demabs (RH absence) events
  const finDate = new Date(date + 'T00:00:00');
  finDate.setDate(finDate.getDate() + 1);
  const finStr = formatDateStr(finDate);
  const demabsEvts = await getDemabsEventsForRange(date, finStr);
  for (const de of demabsEvts) {
    const dedupeKey = `${de.agent_username}|${de.date}|absence|${de.periode || ''}`;
    if (!manualKeys.has(dedupeKey)) {
      events.push({
        id: nextGenId(),
        ...de,
        created_by: de.pending ? 'auto-rh-pending' : 'auto-rh',
        created_at: null,
        generated: true
      });
      manualKeys.add(dedupeKey);
    }
  }

  // Final dedup pass: remove any remaining duplicates by agent+date+cat+periode
  const finalKeys = new Set();
  return events.filter(e => {
    const k = `${e.agent_username || ''}|${e.date}|${e.categorie}|${e.periode || ''}`;
    if (finalKeys.has(k)) return false;
    finalKeys.add(k);
    return true;
  });
}

module.exports = {
  setSendMail: (fn) => { sendMailFn = fn; },

  getEvenements: async (req, res) => {
    try {
      const { debut, fin } = req.query;
      if (!debut || !fin) {
        return res.status(400).json({ message: 'Paramètres debut et fin requis' });
      }
      const [dbResult, agentsResult, appsResult] = await Promise.all([
        pool.query(
          `SELECT id, date::text as date, categorie, periode, titre, description, agent_username, agent_nom, agent_email, couleur, created_by, created_at FROM hub_calendrier.evenements WHERE date >= $1 AND date <= $2 ORDER BY date, categorie`,
          [debut, fin]
        ),
        pool.query(`
          SELECT a.username, a.nom, a.email,
            COALESCE((SELECT json_agg(t.jour_semaine ORDER BY t.jour_semaine) FROM hub_calendrier.agents_tt_days t WHERE t.agent_username = a.username), '[]') as tt_fixed_days,
            COALESCE(json_agg(json_build_object('id', ap.id, 'jour_semaine', ap.jour_semaine, 'periode', ap.periode)) FILTER (WHERE ap.id IS NOT NULL), '[]') as absences
          FROM hub_calendrier.agents_dsi a
          LEFT JOIN hub_calendrier.absences_permanentes ap ON a.username = ap.agent_username
          GROUP BY a.username
        `),
        pool.query(`
          SELECT name, maintenance_start::date::text as maintenance_start, maintenance_end::date::text as maintenance_end
          FROM magapp.apps
          WHERE maintenance_start IS NOT NULL
            AND maintenance_start::date <= $2
            AND (maintenance_end IS NULL OR maintenance_end::date >= $1)
          ORDER BY name
        `, [debut, fin])
      ]);

      const events = [...dbResult.rows];
      genIdCounter = -1;

      // Build set of existing manual events to avoid duplicate generated events
      // Key includes periode so a manual AM event coexists with a virtual PM one
      const manualKeys = new Set();
      for (const row of dbResult.rows) {
        if (row.agent_username) {
          manualKeys.add(`${row.agent_username}|${row.date}|${row.categorie}|${row.periode || ''}`);
          // A full-day (periode '') manual event also blocks both AM and PM virtual events
          if (row.periode === '') {
            manualKeys.add(`${row.agent_username}|${row.date}|${row.categorie}|matin`);
            manualKeys.add(`${row.agent_username}|${row.date}|${row.categorie}|apres-midi`);
          }
        }
      }

      for (const agent of agentsResult.rows) {
        // Fixed TT day events (multiple days per agent) — generate as full-day
        const ttDays = agent.tt_fixed_days || [];
        for (const day of ttDays) {
          const dates = getDatesForDayOfWeek(debut, fin, day);
          for (const date of dates) {
            if (!manualKeys.has(`${agent.username}|${date}|teletravail|`)) {
              events.push({
                id: nextGenId(),
                date,
                categorie: 'teletravail',
                periode: '',
                titre: agent.nom,
                description: 'TT fixe',
                agent_username: agent.username,
                agent_nom: agent.nom,
                agent_email: agent.email || '',
                couleur: CATEGORY_COLORS.teletravail,
                created_by: 'auto',
                created_at: null,
                generated: true
              });
            }
          }
        }

        // Permanent absence events
        const absences = agent.absences || [];
        for (const abs of absences) {
          const dates = getDatesForDayOfWeek(debut, fin, abs.jour_semaine);
          for (const date of dates) {
            if (manualKeys.has(`${agent.username}|${date}|absence|${abs.periode}`)) continue;
            events.push({
              id: nextGenId(),
              date,
              categorie: 'absence',
              periode: abs.periode === 'journee' ? '' : abs.periode,
              titre: agent.nom,
              description: `Absence permanente ${abs.periode}`,
              agent_username: agent.username,
              agent_nom: agent.nom,
              agent_email: agent.email || '',
              couleur: CATEGORY_COLORS.absence,
              created_by: 'auto',
              created_at: null,
              generated: true
            });
          }
        }
      }

      // Demabs (RH absence) events for linked agents — read directly from oracle.rh_tps_demabs
      // Dates are stored as JS toString text, so we filter in JS not SQL
      try {
        const demabsResult = await pool.query(`
          SELECT a.username, a.nom, a.email, a.matricule,
                 d."TPS_DMDA_DT_DEBUT", d."TPS_DMDA_DT_FIN",
                 d."TPS_DMDA_TYPE", d."TPS_DMDA_CHRONO",
                 d."TPS_DMDA_TYPJOUR_DEB", d."TPS_DMDA_TYPJOUR_FIN",
                 d."TPS_DMDA_HR_DEBUT", d."TPS_DMDA_HR_FIN",
                 d."TPS_DMDA_ETAT"
          FROM hub_calendrier.agents_dsi a
          JOIN oracle.rh_tps_demabs d ON TRIM(a.matricule) = TRIM(d."RH_AGENT_MATRICULE")
          WHERE a.matricule IS NOT NULL AND a.matricule != ''
            AND d."TPS_DMDA_DT_DEBUT" IS NOT NULL
            AND (d."TPS_DMDA_SUPPR" IS NULL OR TRIM(d."TPS_DMDA_SUPPR") = '0')
        `);

        const parseJsDate = (d) => {
          if (!d) return null;
          if (d instanceof Date) {
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          }
          if (typeof d === 'string') {
            const m = d.match(/(\w{3}) (\w{3}) (\d{1,2}) (\d{4})/);
            if (m) { return new Date(d).toISOString().split('T')[0]; }
            return d.split('T')[0];
          }
          return null;
        };

        for (const de of demabsResult.rows) {
          const startDate = parseJsDate(de.TPS_DMDA_DT_DEBUT);
          const endDate = parseJsDate(de.TPS_DMDA_DT_FIN) || startDate;
          if (!startDate) continue;

          // Only include if the absence overlaps the visible range
          if (endDate < debut || startDate > fin) continue;

          const dates = getDatesInRange(
            startDate > debut ? startDate : debut,
            endDate < fin ? endDate : fin
          );
          if (dates.length === 0) continue;

          const periodes = computePeriodes(de.TPS_DMDA_TYPJOUR_DEB, de.TPS_DMDA_TYPJOUR_FIN, de.TPS_DMDA_HR_DEBUT, de.TPS_DMDA_HR_FIN);
          // If both matin and apres-midi => full day (periode = '')
          const periode = periodes.length === 2 ? '' : periodes[0] || '';
          const typeNum = String(de.TPS_DMDA_TYPE || '').trim();
          const etat = String(de.TPS_DMDA_ETAT || '').trim();
          const chrono = String(de.TPS_DMDA_CHRONO || '').trim();

          // Type 1=congé annuel, 2=maladie, etc.
          const typeLabels = { '1': 'Congé annuel', '2': 'Maladie', '3': 'Maternité', '4': 'PAT', '5': 'Sans solde', '6': 'Formation', '7': 'Convenance', '8': 'Autorisation absence' };
          const typeLabel = typeLabels[typeNum] || `Type ${typeNum}`;

          // ETAT: T=Validé, A=En attente, E=En cours
          const etatLabel = etat === 'A' ? 'En attente' : etat === 'E' ? 'En cours' : '';
          const isPending = etat === 'A' || etat === 'E';
          const periodeStr = periode === 'matin' ? 'Matin' : periode === 'apres-midi' ? 'Après-midi' : '';
          const description = `${typeLabel}${periodeStr ? ' (' + periodeStr + ')' : ''}${chrono ? ' - ' + chrono : ''}${etatLabel ? ' ⏳ ' + etatLabel : ''}`;

          for (const date of dates) {
            const dedupeKey = `${de.username}|${date}|absence|${periode}`;
            if (!manualKeys.has(dedupeKey)) {
              events.push({
                id: nextGenId(),
                date,
                categorie: 'absence',
                periode: periode,
                titre: de.nom,
                description: description,
                agent_username: de.username,
                agent_nom: de.nom,
                agent_email: de.email || '',
                couleur: CATEGORY_COLORS.absence,
                created_by: isPending ? 'auto-rh-pending' : 'auto-rh',
                created_at: null,
                generated: true,
                source: 'demabs',
                pending: isPending
              });
              manualKeys.add(dedupeKey);
            }
          }
        }
      } catch (err) {
        console.error('[Calendrier DSI] demabs query error:', err.message);
      }

      // Maintenance events from app store (one per day in range)
      for (const app of appsResult.rows) {
        const start = app.maintenance_start > debut ? app.maintenance_start : debut;
        const end = app.maintenance_end && app.maintenance_end < fin ? app.maintenance_end : fin;
        const maintDates = getDatesInRange(start, end);
        for (const date of maintDates) {
          events.push({
            id: nextGenId(),
            date,
            categorie: 'maintenance',
            periode: '',
            titre: app.name,
            description: app.maintenance_end ? `Maintenance jusqu'au ${app.maintenance_end}` : 'Maintenance programmée',
            agent_username: null,
            agent_nom: null,
            agent_email: null,
            couleur: CATEGORY_COLORS.maintenance || '#FF9800',
            created_by: 'auto',
            created_at: null,
            generated: true
          });
        }
      }

      events.sort((a, b) => a.date.localeCompare(b.date) || a.categorie.localeCompare(b.categorie));

      res.json(events);
    } catch (error) {
      console.error('[Calendrier DSI] getEvenements error:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération', error: error.message });
    }
  },

  createEvenement: async (req, res) => {
    try {
      const { date, categorie, periode, titre, description, agent_username, agent_nom, agent_email, couleur } = req.body;
      if (!date || !categorie || !titre) {
        return res.status(400).json({ message: 'Champs requis : date, categorie, titre' });
      }
      const validCategories = ['absence', 'teletravail', 'deploiement', 'maintenance', 'reunion'];
      if (!validCategories.includes(categorie)) {
        return res.status(400).json({ message: 'Catégorie invalide' });
      }
      const result = await pool.query(
        `INSERT INTO hub_calendrier.evenements (date, categorie, periode, titre, description, agent_username, agent_nom, agent_email, couleur, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, date::text as date, categorie, periode, titre, description, agent_username, agent_nom, agent_email, couleur, created_by, created_at`,
        [date, categorie, periode || '', titre, description || '', agent_username || null, agent_nom || null, agent_email || null, couleur || '', req.user.username]
      );
      res.json(result.rows[0]);
    } catch (error) {
      console.error('[Calendrier DSI] createEvenement error:', error);
      res.status(500).json({ message: "Erreur lors de la création", error: error.message });
    }
  },

  updateEvenement: async (req, res) => {
    try {
      const { id } = req.params;
      const { date, categorie, periode, titre, description, agent_username, agent_nom, agent_email, couleur } = req.body;
      const result = await pool.query(
        `UPDATE hub_calendrier.evenements SET date = $1, categorie = $2, periode = $3, titre = $4, description = $5, agent_username = $6, agent_nom = $7, agent_email = $8, couleur = $9 WHERE id = $10 RETURNING id, date::text as date, categorie, periode, titre, description, agent_username, agent_nom, agent_email, couleur, created_by, created_at`,
        [date, categorie, periode || '', titre, description || '', agent_username || null, agent_nom || null, agent_email || null, couleur || '', id]
      );
      if (result.rowCount === 0) return res.status(404).json({ message: 'Événement non trouvé' });
      res.json(result.rows[0]);
    } catch (error) {
      console.error('[Calendrier DSI] updateEvenement error:', error);
      res.status(500).json({ message: 'Erreur lors de la mise à jour', error: error.message });
    }
  },

  deleteEvenement: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query('DELETE FROM hub_calendrier.evenements WHERE id = $1', [id]);
      if (result.rowCount === 0) return res.status(404).json({ message: 'Événement non trouvé' });
      res.json({ message: 'Événement supprimé' });
    } catch (error) {
      console.error('[Calendrier DSI] deleteEvenement error:', error);
      res.status(500).json({ message: 'Erreur lors de la suppression', error: error.message });
    }
  },

  sendDailyCalendar: async (req, res) => {
    try {
      const { recipients, date } = req.body;
      if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ message: 'Au moins un destinataire requis' });
      }
      if (!date) {
        return res.status(400).json({ message: 'Une date est requise' });
      }

      const events = await getEventsForDate(date);
      const formattedDate = new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      // Group events by category, splitting absence into manual and RH
      const byCategory = {};
      const rhAbsences = [];
      const manualAbsences = [];
      const CATEGORY_LABELS = {
        absence: 'Absents',
        teletravail: 'Télétravailleurs',
        deploiement: 'Déploiements',
        maintenance: 'Maintenances',
        reunion: 'Réunions importantes'
      };
      const CATEGORY_COLORS = {
        absence: '#E30613',
        teletravail: '#003366',
        deploiement: '#4CAF50',
        maintenance: '#FF9800',
        reunion: '#9C27B0'
      };

      for (const evt of events) {
        if (evt.categorie === 'absence' && (evt.source === 'demabs' || evt.created_by === 'auto-rh' || evt.created_by === 'auto-rh-pending')) {
          rhAbsences.push(evt);
        } else if (evt.categorie === 'absence') {
          manualAbsences.push(evt);
        } else {
          if (!byCategory[evt.categorie]) byCategory[evt.categorie] = [];
          byCategory[evt.categorie].push(evt);
        }
      }

      let html = `
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: Arial, sans-serif; color: #333; margin: 0; padding: 20px; background: #f8fafc; }
              .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
              h1 { color: #0f172a; border-bottom: 3px solid #0f172a; padding-bottom: 15px; margin-bottom: 30px; text-align: center; }
              .category-section { margin-bottom: 30px; }
              .category-header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: 8px; margin-bottom: 15px; font-weight: 700; color: white; }
              .category-item { padding: 12px 16px; background: #f8fafc; border-left: 4px solid #ccc; border-radius: 4px; margin-bottom: 10px; }
              .item-name { font-weight: 600; color: #0f172a; font-size: 0.95rem; }
              .item-period { color: #64748b; font-size: 0.85rem; margin-top: 4px; }
              .item-desc { color: #475569; font-size: 0.85rem; margin-top: 4px; font-style: italic; }
              .empty-day { text-align: center; color: #94a3b8; font-style: italic; padding: 40px 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>📅 Calendrier du ${formattedDate}</h1>
      `;

      if (events.length === 0) {
        html += '<div class="empty-day">✅ Aucun événement prévu pour cette journée</div>';
      } else {
        // Manual absences section
        if (manualAbsences.length > 0) {
          html += `
            <div class="category-section">
              <div class="category-header" style="background-color: ${CATEGORY_COLORS.absence}">
                ❌ Absences saisies (${manualAbsences.length})
              </div>
          `;
          for (const evt of manualAbsences) {
            const periodLabel = evt.periode ? ` - ${evt.periode === 'matin' ? 'Matin' : 'Après-midi'}` : ' - Journée entière';
            html += `
              <div class="category-item">
                <div class="item-name">${evt.titre}${periodLabel}</div>
                ${evt.agent_nom ? `<div class="item-period">👤 ${evt.agent_nom}</div>` : ''}
                ${evt.description ? `<div class="item-desc">${evt.description}</div>` : ''}
              </div>
            `;
          }
          html += '</div>';
        }

        // RH absences section
        if (rhAbsences.length > 0) {
          const validated = rhAbsences.filter(e => !e.pending);
          const pending = rhAbsences.filter(e => e.pending);
          html += `
            <div class="category-section">
              <div class="category-header" style="background-color: ${CATEGORY_COLORS.absence}">
                🏥 Absences RH${validated.length > 0 ? ` (${validated.length} validée${validated.length > 1 ? 's' : ''})` : ''}${pending.length > 0 ? ` (${pending.length} en attente)` : ''}
              </div>
          `;
            for (const evt of rhAbsences) {
              const periodLabel = evt.periode ? ` - ${evt.periode === 'matin' ? 'Matin' : 'Après-midi'}` : ' - Journée entière';
              const badge = evt.pending ? '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:0.75rem;margin-left:8px">⏳ En attente</span>' : '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:4px;font-size:0.75rem;margin-left:8px">✅ Validé</span>';
              html += `
                <div class="category-item" style="${evt.pending ? 'border-left-color: #f59e0b; background: #fffbeb;' : ''}">
                  <div class="item-name">${evt.titre}${periodLabel}${badge}</div>
                  ${evt.agent_nom ? `<div class="item-period">👤 ${evt.agent_nom}</div>` : ''}
                </div>
              `;
            }
          html += '</div>';
        }

        const categoryOrder = ['teletravail', 'deploiement', 'maintenance', 'reunion'];
        for (const cat of categoryOrder) {
          if (byCategory[cat]) {
            const catEvents = byCategory[cat];
            const bgColor = CATEGORY_COLORS[cat];
            html += `
              <div class="category-section">
                <div class="category-header" style="background-color: ${bgColor}">
                  ${cat === 'teletravail' ? '💻' : cat === 'deploiement' ? '🔧' : cat === 'maintenance' ? '⚙️' : '📢'}
                  ${CATEGORY_LABELS[cat]} (${catEvents.length})
                </div>
            `;
            for (const evt of catEvents) {
              const periodLabel = evt.periode ? ` - ${evt.periode === 'matin' ? 'Matin' : 'Après-midi'}` : ' - Journée entière';
              html += `
                <div class="category-item">
                  <div class="item-name">${evt.titre}${periodLabel}</div>
                  ${evt.agent_nom ? `<div class="item-period">👤 ${evt.agent_nom}</div>` : ''}
                  ${evt.description ? `<div class="item-desc">${evt.description}</div>` : ''}
                </div>
              `;
            }
            html += '</div>';
          }
        }
      }

      html += `
            </div>
          </body>
        </html>
      `;

      // Send to each recipient
      if (!sendMailFn) {
        return res.status(500).json({ message: 'Service email non configuré' });
      }

      let sent = 0;
      let failed = 0;
      for (const recipient of recipients) {
        try {
          await sendMailFn(recipient, `Calendrier DSI - ${formattedDate}`, html);
          sent++;
        } catch (err) {
          console.error(`[Calendrier DSI] Erreur envoi à ${recipient}:`, err);
          failed++;
        }
      }

      res.json({ message: `Calendrier envoyé à ${sent} destinataire(s)${failed > 0 ? `, ${failed} échec(s)` : ''}` });
    } catch (error) {
      console.error('[Calendrier DSI] sendDailyCalendar error:', error);
      res.status(500).json({ message: 'Erreur lors de l\'envoi', error: error.message });
    }
  }
};
