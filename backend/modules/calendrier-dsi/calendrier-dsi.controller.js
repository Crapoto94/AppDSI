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
  deploiement: '#4CAF50',
  reunion: '#9C27B0',
  hotline: '#22c55e'
};

let genIdCounter = -1;

function nextGenId() {
  return genIdCounter--;
}

async function getDemabsEventsForRange(debut, fin) {
  const demabsEvents = [];
  try {
    const demabsResult = await pool.query(`
          SELECT DISTINCT a.username, TRIM(a.nom) as nom, a.email, a.matricule,
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
  // Get manual events for this date (handle timezone offset - dates can be stored as UTC-2h from display date)
  const result = await pool.query(
    `SELECT id, date::text as date, categorie, periode, titre, description, agent_username, agent_nom, agent_email, couleur, created_by, created_at FROM hub_calendrier.evenements WHERE date::date = $1 OR date::date = ($1::date - interval '1 day') ORDER BY categorie, periode`,
    [date]
  );
  genIdCounter = -1;

  // Parse date string and calculate previous day for timezone-offset filtering
  const [year, month, day] = date.split('-').map(Number);
  const prevDate = new Date(year, month - 1, day - 1);
  const prevDay = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;

  // Filter events to only include those for the requested date or previous day (for timezone-offset events)
  const events = result.rows.filter(row => {
    const eventDate = row.date.split('T')[0];
    return eventDate === date || eventDate === prevDay;
  });

  // Get all agents with their TT days and absences
  const agentsResult = await pool.query(`
    SELECT a.username, TRIM(a.nom) as nom, a.email,
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
      // Use the actual event date, not the query parameter date
      const eventDate = row.date.split('T')[0];
      manualKeys.add(`${row.agent_username}|${eventDate}|${row.categorie}|${row.periode || ''}`);
      if (row.periode === '') {
        manualKeys.add(`${row.agent_username}|${eventDate}|${row.categorie}|matin`);
        manualKeys.add(`${row.agent_username}|${eventDate}|${row.categorie}|apres-midi`);
      }
    }
  }

  // Create date object and calculate day of week
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
            periode: (abs.periode || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 'journee' ? '' : (abs.periode || '').trim(),
            titre: agent.nom,
            description: `Absence permanente ${(abs.periode || '').trim()}`,
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

  // Add demabs (RH absence) events - only for this specific date
  const demabsEvts = await getDemabsEventsForRange(date, date);
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

  // Add dedicated maintenance table events
  try {
    const maintTable = await pool.query(`
      SELECT m.name, a.name as app_name FROM magapp.maintenances m
      JOIN magapp.apps a ON m.app_id = a.id
      WHERE m.start_date::date <= $1::date AND m.end_date::date >= $1::date
    `, [date]);
    for (const m of maintTable.rows) {
      events.push({
        id: nextGenId(), date, categorie: 'maintenance', periode: '', titre: `[${m.app_name}] ${m.name}`,
        description: `Maintenance ${m.app_name}`, agent_username: null, agent_nom: null,
        agent_email: null, couleur: CATEGORY_COLORS.maintenance || '#FF9800',
        created_by: 'auto', created_at: null, generated: true
      });
    }
  } catch (e) {}

  // Add hotline events
  try {
    const hlEvts = await getHotlineEventsForDate(date);
    for (const hl of hlEvts) {
      events.push(hl);
    }
  } catch (e) {}

  // Final dedup pass: remove any remaining duplicates by displayed content (titre+date+cat+periode)
  const finalKeys = new Set();
  return events.filter(e => {
    const k = `${e.titre || ''}|${e.date}|${e.categorie}|${e.periode || ''}`;
    if (finalKeys.has(k)) return false;
    finalKeys.add(k);
    return true;
  });
}

function getWeekNumber(d) {
  const temp = new Date(d.valueOf());
  const dayNum = (d.getDay() + 6) % 7;
  temp.setDate(temp.getDate() - dayNum + 3);
  const firstThursday = temp.valueOf();
  temp.setMonth(0, 1);
  if (temp.getDay() !== 4) {
    temp.setMonth(0, 1 + ((4 - temp.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - temp.valueOf()) / 604800000);
}

async function getHotlineEventsForDate(date) {
  const events = [];
  try {
    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return events;
    const weekNum = getWeekNumber(dateObj);
    const isEven = weekNum % 2 === 0;

    // Load all overrides for this date (including override-only)
    const allOverrides = await pool.query(
      `SELECT o.agent_username, a.nom, a.email, o.active, o.periode FROM hub_calendrier.hotline_overrides o
       LEFT JOIN hub_calendrier.agents_dsi a ON a.username = o.agent_username
       WHERE o.date = $1`,
      [date]
    );
    const overrideMap = {};
    for (const ov of allOverrides.rows) {
      const key = `${ov.agent_username}|${ov.periode || ''}`;
      overrideMap[key] = ov;
    }

    const defaults = await pool.query(
      `SELECT d.agent_username, a.nom, a.email, d.jour_semaine, d.semaine_type, d.periode
       FROM hub_calendrier.agents_hotline_defaults d
       JOIN hub_calendrier.agents_dsi a ON a.username = d.agent_username
       WHERE d.jour_semaine = $1 AND (d.semaine_type = 'les2' OR (d.semaine_type = 'paire' AND $2) OR (d.semaine_type = 'impaire' AND NOT $2))`,
      [dayOfWeek, isEven]
    );

    // Generate from defaults (skip if override active=false)
    for (const row of defaults.rows) {
      const periode = row.periode === 'journee' ? '' : row.periode;
      const key = `${row.agent_username}|${periode}`;
      const ov = overrideMap[key];
      if (ov !== undefined && !ov.active) continue;
      events.push({
        id: nextGenId(),
        date,
        categorie: 'hotline',
        periode: periode,
        titre: 'HL',
        description: 'Hotline',
        agent_username: row.agent_username,
        agent_nom: row.nom,
        agent_email: row.email || '',
        couleur: '#22c55e',
        created_by: 'auto-hotline',
        created_at: null,
        generated: true
      });
    }

    // Override-only hotline (active=true, no matching default)
    for (const ov of allOverrides.rows) {
      if (!ov.active) continue;
      let matchedDefault = false;
      for (const row of defaults.rows) {
        const periode = row.periode === 'journee' ? '' : row.periode;
        if (row.agent_username === ov.agent_username && periode === (ov.periode || '')) { matchedDefault = true; break; }
      }
      if (matchedDefault) continue;
      events.push({
        id: nextGenId(),
        date,
        categorie: 'hotline',
        periode: ov.periode || '',
        titre: 'HL',
        description: 'Hotline',
        agent_username: ov.agent_username,
        agent_nom: ov.nom,
        agent_email: ov.email || '',
        couleur: '#22c55e',
        created_by: 'auto-hotline',
        created_at: null,
        generated: true
      });
    }
  } catch (e) {
    console.error('[Calendrier DSI] getHotlineEventsForDate error:', e.message);
  }
  return events;
}

module.exports = {
  setSendMail: (fn) => { sendMailFn = fn; },
  getEventsForDate,

  getEvenements: async (req, res) => {
    try {
      const { debut, fin } = req.query;
      if (!debut || !fin) {
        return res.status(400).json({ message: 'Paramètres debut et fin requis' });
      }
      const [dbResult, agentsResult, appsResult, maintTableResult] = await Promise.all([
        pool.query(
          `SELECT id, date::text as date, categorie, periode, titre, description, agent_username, agent_nom, agent_email, couleur, created_by, created_at FROM hub_calendrier.evenements WHERE date >= $1 AND date <= $2 ORDER BY date, categorie`,
          [debut, fin]
        ),
        pool.query(`
    SELECT a.username, TRIM(a.nom) as nom, a.email,
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
        `, [debut, fin]),
        pool.query(`
          SELECT m.name, a.name as app_name, m.start_date::date::text as maintenance_start, m.end_date::date::text as maintenance_end
          FROM magapp.maintenances m
          JOIN magapp.apps a ON m.app_id = a.id
          WHERE m.start_date::date <= $2::date
            AND m.end_date::date >= $1::date
          ORDER BY m.name
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
            periode: (abs.periode || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 'journee' ? '' : (abs.periode || '').trim(),
              titre: agent.nom,
              description: `Absence permanente ${(abs.periode || '').trim()}`,
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
      SELECT DISTINCT a.username, TRIM(a.nom) as nom, a.email, a.matricule,
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

      // Maintenance events from app store legacy fields (one per day in range)
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

      // Maintenance events from dedicated maintenance table
      for (const m of maintTableResult.rows) {
        const start = m.maintenance_start > debut ? m.maintenance_start : debut;
        const end = m.maintenance_end && m.maintenance_end < fin ? m.maintenance_end : fin;
        const maintDates = getDatesInRange(start, end);
        for (const date of maintDates) {
          events.push({
            id: nextGenId(),
            date,
            categorie: 'maintenance',
            periode: '',
            titre: `[${m.app_name}] ${m.name}`,
            description: `Maintenance ${m.app_name}`,
            agent_username: null,
            agent_nom: null,
            agent_email: null,
            couleur: CATEGORY_COLORS.maintenance || '#FF9800',
            created_by: 'auto',
            created_at: null,
            generated: true,
            source: 'maintenance-table'
          });
        }
      }

      // O365 calendar events
      try {
        const o365Ctrl = require('../o365-calendar/o365-calendar.controller');
        const o365Events = await o365Ctrl.getEventsForDateRange(debut, fin);
        console.log('[Calendrier DSI] O365 events found:', o365Events.length, 'for range', debut, '-', fin, o365Events.map(e => ({ date: e.date, titre: e.titre })));
        events.push(...o365Events);
      } catch (e) {
        console.error('[Calendrier DSI] O365 events error (non-blocking):', e.message);
      }

      // Hotline events
      try {
        const hlDefaults = await pool.query(
          `SELECT d.agent_username, a.nom, a.email, d.jour_semaine, d.semaine_type, d.periode
           FROM hub_calendrier.agents_hotline_defaults d
           JOIN hub_calendrier.agents_dsi a ON a.username = d.agent_username`
        );

        const allHlUsernames = [...new Set(hlDefaults.rows.map(r => r.agent_username))];
        // Also include any override-only agents (no defaults but have overrides)
        const hlOverrides = await pool.query(
          `SELECT o.agent_username, a.nom, a.email, o.date::text as date, o.active, o.periode FROM hub_calendrier.hotline_overrides o
           LEFT JOIN hub_calendrier.agents_dsi a ON a.username = o.agent_username
           WHERE o.date >= $1 AND o.date <= $2`,
          [debut, fin]
        );
        for (const ov of hlOverrides.rows) {
          if (!allHlUsernames.includes(ov.agent_username)) allHlUsernames.push(ov.agent_username);
        }

        const overrideMap = {};
        for (const ov of hlOverrides.rows) {
          if (!overrideMap[ov.agent_username]) overrideMap[ov.agent_username] = {};
          if (!overrideMap[ov.agent_username][ov.date]) overrideMap[ov.agent_username][ov.date] = {};
          overrideMap[ov.agent_username][ov.date][ov.periode || ''] = ov;
        }

        const hlDates = getDatesInRange(debut, fin);
        for (const hlDate of hlDates) {
          const [y, m, d] = hlDate.split('-').map(Number);
          const dateObj = new Date(y, m - 1, d);
          const dayOfWeek = dateObj.getDay();
          if (dayOfWeek === 0 || dayOfWeek === 6) continue;
          const weekNum = getWeekNumber(dateObj);
          const isEven = weekNum % 2 === 0;

          // Generate events from default rules (checking overrides for disable)
          for (const row of hlDefaults.rows) {
            if (row.jour_semaine !== dayOfWeek) continue;
            if (row.semaine_type !== 'les2' && (row.semaine_type === 'paire') !== isEven) continue;

            const dayOv = overrideMap[row.agent_username]?.[hlDate];
            const defaultPeriode = row.periode === 'journee' ? '' : row.periode;
            const perOv = dayOv?.[defaultPeriode];

            // Skip if this default is explicitly disabled (suppressed)
            if (perOv !== undefined && !perOv.active) continue;

            const key = `${row.agent_username}|${hlDate}|hotline|${row.periode === 'journee' ? '' : row.periode}`;
            if (!manualKeys.has(key)) {
              events.push({
                id: nextGenId(),
                date: hlDate,
                categorie: 'hotline',
                periode: row.periode === 'journee' ? '' : row.periode,
                titre: 'HL',
                description: 'Hotline',
                agent_username: row.agent_username,
                agent_nom: row.nom,
                agent_email: row.email || '',
                couleur: '#22c55e',
                created_by: 'auto-hotline',
                created_at: null,
                generated: true
              });
            }
          }

          // Override-only hotline (active=true on a date where no default rule applies)
          for (const ovRow of hlOverrides.rows) {
            if (ovRow.date !== hlDate || !ovRow.active) continue;
            const ovPeriode = ovRow.periode || '';
            // Check if this override already matched a default (event already generated above)
            let matchedDefault = false;
            for (const row of hlDefaults.rows) {
              if (row.agent_username !== ovRow.agent_username) continue;
              if (row.jour_semaine !== dayOfWeek) continue;
              if (row.semaine_type !== 'les2' && (row.semaine_type === 'paire') !== isEven) continue;
              if (ovPeriode !== '' && row.periode !== 'journee' && row.periode !== ovPeriode) continue;
              const dayOv = overrideMap[row.agent_username]?.[hlDate];
              if (dayOv?.[''] !== undefined && !dayOv[''].active) continue;
              const perOv = dayOv?.[row.periode === 'journee' ? '' : row.periode];
              if (perOv !== undefined && !perOv.active) continue;
              matchedDefault = true;
              break;
            }
            if (matchedDefault) continue;

            const key = `${ovRow.agent_username}|${hlDate}|hotline|${ovPeriode}`;
            if (!manualKeys.has(key)) {
              events.push({
                id: nextGenId(),
                date: hlDate,
                categorie: 'hotline',
                periode: ovPeriode,
                titre: 'HL',
                description: 'Hotline',
                agent_username: ovRow.agent_username,
                agent_nom: ovRow.nom,
                agent_email: ovRow.email || '',
                couleur: '#22c55e',
                created_by: 'auto-hotline',
                created_at: null,
                generated: true
              });
            }
          }
        }
      } catch (e) {
        console.error('[Calendrier DSI] hotline events error:', e.message);
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
      const validCategories = ['absence', 'teletravail', 'deploiement', 'maintenance', 'reunion', 'absence_justifier', 'conge_previsionnel', 'asa'];
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
      const { date, categorie, periode, titre, description, agent_username, agent_nom, agent_email, couleur, updateSeries } = req.body;
      if (updateSeries) {
        const existing = await pool.query('SELECT agent_username, titre, categorie, agent_email FROM hub_calendrier.evenements WHERE id = $1', [id]);
        if (existing.rowCount === 0) return res.status(404).json({ message: 'Événement non trouvé' });
        const old = existing.rows[0];
        if (old.agent_username) {
          await pool.query(
            `UPDATE hub_calendrier.evenements SET categorie = $1, periode = $2, titre = $3, description = $4, agent_username = $5, agent_nom = $6, agent_email = $7, couleur = $8 WHERE agent_username = $9 AND titre = $10`,
            [categorie, periode || '', titre, description || '', agent_username || null, agent_nom || null, agent_email || null, couleur || '', old.agent_username, old.titre]
          );
        } else {
          await pool.query(
            `UPDATE hub_calendrier.evenements SET categorie = $1, periode = $2, titre = $3, description = $4, agent_username = $5, agent_nom = $6, agent_email = $7, couleur = $8 WHERE id = $9`,
            [categorie, periode || '', titre, description || '', agent_username || null, agent_nom || null, agent_email || null, couleur || '', id]
          );
        }
      } else {
        const result = await pool.query(
          `UPDATE hub_calendrier.evenements SET date = $1, categorie = $2, periode = $3, titre = $4, description = $5, agent_username = $6, agent_nom = $7, agent_email = $8, couleur = $9 WHERE id = $10 RETURNING id, date::text as date, categorie, periode, titre, description, agent_username, agent_nom, agent_email, couleur, created_by, created_at`,
          [date, categorie, periode || '', titre, description || '', agent_username || null, agent_nom || null, agent_email || null, couleur || '', id]
        );
        if (result.rowCount === 0) return res.status(404).json({ message: 'Événement non trouvé' });
      }
      res.json({ message: 'Mis à jour' });
    } catch (error) {
      console.error('[Calendrier DSI] updateEvenement error:', error);
      res.status(500).json({ message: 'Erreur lors de la mise à jour', error: error.message });
    }
  },

  deleteEvenement: async (req, res) => {
    try {
      const { id } = req.params;
      const { deleteSeries } = req.query;
      if (deleteSeries === 'true') {
        const evt = await pool.query('SELECT agent_username, titre, categorie, periode, date, agent_email FROM hub_calendrier.evenements WHERE id = $1', [id]);
        if (evt.rowCount === 0) return res.status(404).json({ message: 'Événement non trouvé' });
        const { agent_username, titre, categorie, periode, date, agent_email } = evt.rows[0];

        // Find all events of this type (same agent, title, category) - NO periode filter
        const allEventsQuery = agent_username
          ? 'SELECT id, date, periode FROM hub_calendrier.evenements WHERE agent_username = $1 AND titre = $2 AND categorie = $3 ORDER BY date, periode'
          : 'SELECT id, date, periode FROM hub_calendrier.evenements WHERE agent_email = $1 AND titre = $2 AND categorie = $3 ORDER BY date, periode';
        const allEventsParams = agent_username ? [agent_username, titre, categorie] : [agent_email, titre, categorie];
        const allEvents = await pool.query(allEventsQuery, allEventsParams);

        // Period order: empty string ('') = full day, 'matin' = morning, 'apres-midi' = afternoon
        const periodOrder = { 'matin': 1, '': 2, 'apres-midi': 3 };

        // Find the series: continuous chain of events (matin -> apres-midi -> next day matin -> etc)
        let seriesIds = new Set();
        const targetDateStr = new Date(date).toISOString().split('T')[0];

        // Find the target event in the list
        let targetIdx = -1;
        for (let i = 0; i < allEvents.rows.length; i++) {
          const eventDateStr = new Date(allEvents.rows[i].date).toISOString().split('T')[0];
          if (eventDateStr === targetDateStr && (allEvents.rows[i].periode || '') === (periode || '')) {
            targetIdx = i;
            break;
          }
        }

        if (targetIdx >= 0) {
          // Go backwards to find series start
          let j = targetIdx;
          while (j > 0) {
            const currDateStr = new Date(allEvents.rows[j].date).toISOString().split('T')[0];
            const prevDateStr = new Date(allEvents.rows[j-1].date).toISOString().split('T')[0];
            const currPeriod = allEvents.rows[j].periode || '';
            const prevPeriod = allEvents.rows[j-1].periode || '';

            const currDate = new Date(currDateStr);
            const prevDate = new Date(prevDateStr);
            const daysDiff = Math.floor((currDate - prevDate) / (1000 * 60 * 60 * 24));

            // Check if this is a valid continuation backwards
            // Valid backwards: same day + period before current, OR previous day last period + current day first period
            let isValidContinuation = false;
            if (daysDiff === 0) {
              // Same day: periode must be after in reverse order (apres-midi before matin, etc)
              isValidContinuation = (periodOrder[prevPeriod] > periodOrder[currPeriod]);
            } else if (daysDiff === 1) {
              // Previous day: should end with latest period, current day starts with earliest
              isValidContinuation = (periodOrder[prevPeriod] === 3 && periodOrder[currPeriod] === 1) ||
                                   (periodOrder[prevPeriod] === 2); // full day connects to next day
            }
            if (!isValidContinuation) break;
            j--;
          }

          // Go forwards to find series end
          let seriesStart = j;
          j = targetIdx;
          while (j < allEvents.rows.length - 1) {
            const currDateStr = new Date(allEvents.rows[j].date).toISOString().split('T')[0];
            const nextDateStr = new Date(allEvents.rows[j+1].date).toISOString().split('T')[0];
            const currPeriod = allEvents.rows[j].periode || '';
            const nextPeriod = allEvents.rows[j+1].periode || '';

            const currDate = new Date(currDateStr);
            const nextDate = new Date(nextDateStr);
            const daysDiff = Math.floor((nextDate - currDate) / (1000 * 60 * 60 * 24));

            // Check if this is a valid continuation forwards
            let isValidContinuation = false;
            if (daysDiff === 0) {
              // Same day: current period must be before next (matin before apres-midi, etc)
              isValidContinuation = (periodOrder[currPeriod] < periodOrder[nextPeriod]);
            } else if (daysDiff === 1) {
              // Next day: current should be latest period, next starts with earliest
              isValidContinuation = (periodOrder[currPeriod] === 3 && periodOrder[nextPeriod] === 1) ||
                                   (periodOrder[currPeriod] === 2); // full day
            }
            if (!isValidContinuation) break;
            j++;
          }

          // Collect all IDs in the series
          for (let k = seriesStart; k <= j; k++) {
            seriesIds.add(allEvents.rows[k].id);
          }
        }

        // Delete only events in this series
        let result;
        if (seriesIds.size > 0) {
          const idList = Array.from(seriesIds);
          const placeholders = idList.map((_, i) => `$${i + 1}`).join(',');
          result = await pool.query(
            `DELETE FROM hub_calendrier.evenements WHERE id IN (${placeholders})`,
            idList
          );
        } else {
          result = await pool.query('DELETE FROM hub_calendrier.evenements WHERE id = $1', [id]);
        }
        res.json({ message: `Série supprimée (${result.rowCount} événements)` });
      } else {
        const result = await pool.query('DELETE FROM hub_calendrier.evenements WHERE id = $1', [id]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'Événement non trouvé' });
        res.json({ message: 'Événement supprimé' });
      }
    } catch (error) {
      console.error('[Calendrier DSI] deleteEvenement error:', error);
      res.status(500).json({ message: 'Erreur lors de la suppression', error: error.message });
    }
  },

  listHotlineAgents: async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT DISTINCT agent_username FROM hub_calendrier.agents_hotline_defaults`
      );
      res.json(result.rows.map(r => r.agent_username));
    } catch (error) {
      console.error('[Calendrier DSI] listHotlineAgents error:', error);
      res.status(500).json({ message: 'Erreur', error: error.message });
    }
  },

  getHotlineCount: async (req, res) => {
    try {
      const { date, periode } = req.params;
      const periodeVal = periode === 'full' ? '' : periode;

      // Get hotlines for this date/period using same logic as getHotlineEventsForDate
      const [year, month, day] = date.split('-').map(Number);
      const dateObj = new Date(year, month - 1, day);
      const dayOfWeek = dateObj.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) return res.json({ total: 0, available: 0 });

      const weekNum = getWeekNumber(dateObj);
      const isEven = weekNum % 2 === 0;

      // Get hotline defaults and overrides
      const defaults = await pool.query(
        `SELECT d.agent_username, a.nom, d.periode
         FROM hub_calendrier.agents_hotline_defaults d
         JOIN hub_calendrier.agents_dsi a ON a.username = d.agent_username
         WHERE d.jour_semaine = $1 AND (d.semaine_type = 'les2' OR (d.semaine_type = 'paire' AND $2) OR (d.semaine_type = 'impaire' AND NOT $2))`,
        [dayOfWeek, isEven]
      );

      const allOverrides = await pool.query(
        `SELECT o.agent_username, a.nom, o.active, o.periode FROM hub_calendrier.hotline_overrides o
         LEFT JOIN hub_calendrier.agents_dsi a ON a.username = o.agent_username
         WHERE o.date = $1`,
        [date]
      );

      const overrideMap = {};
      for (const ov of allOverrides.rows) {
        const key = `${ov.agent_username}|${ov.periode || ''}`;
        overrideMap[key] = ov;
      }

      // Collect hotlines for this period (using Set to avoid duplicates)
      const hotlineAgentsSet = new Set();
      for (const row of defaults.rows) {
        const defaultPeriode = row.periode === 'journee' ? '' : row.periode;
        // A 'journee' (empty string) hotline applies to both 'matin' and 'apres-midi'
        if (defaultPeriode !== '' && defaultPeriode !== periodeVal) continue;

        // Check if override disables this
        const key = `${row.agent_username}|${defaultPeriode}`;
        const ov = overrideMap[key];
        if (ov !== undefined && !ov.active) continue; // Skipped by override
        hotlineAgentsSet.add(row.agent_username);
      }

      // Add override-only hotlines
      for (const ov of allOverrides.rows) {
        if (!ov.active) continue;
        const ovPeriode = ov.periode || '';
        // A 'journee' (empty string) override applies to both 'matin' and 'apres-midi'
        if (ovPeriode !== '' && ovPeriode !== periodeVal) continue;

        let matchedDefault = false;
        for (const row of defaults.rows) {
          const defaultPeriode = row.periode === 'journee' ? '' : row.periode;
          if (row.agent_username === ov.agent_username && defaultPeriode === ovPeriode) {
            matchedDefault = true;
            break;
          }
        }
        if (!matchedDefault) hotlineAgentsSet.add(ov.agent_username);
      }

      // Get absences from evenements (manual + auto-rh marked)
      const absences = await pool.query(
        `SELECT DISTINCT agent_username FROM hub_calendrier.evenements
         WHERE date = $1
         AND (categorie IN ('absence', 'absence_justifier', 'teletravail', 'conge_previsionnel', 'asa')
              OR created_by IN ('auto-rh', 'auto-rh-pending'))
         AND (periode = $2 OR periode = '')`,
        [date, periodeVal]
      );

      const absentSet = new Set(absences.rows.map(r => r.agent_username));

      // ALSO get absences from demabs (oracle.rh_tps_demabs)
      // Note: Dates in rh_tps_demabs are stored as JS Date toString, need parsing
      try {
        const demabsAbsences = await pool.query(`
          SELECT a.username, d."TPS_DMDA_DT_DEBUT", d."TPS_DMDA_DT_FIN",
                 d."TPS_DMDA_TYPJOUR_DEB", d."TPS_DMDA_TYPJOUR_FIN"
          FROM hub_calendrier.agents_dsi a
          JOIN oracle.rh_tps_demabs d ON TRIM(a.matricule) = TRIM(d."RH_AGENT_MATRICULE")
          WHERE a.matricule IS NOT NULL AND a.matricule != ''
            AND d."TPS_DMDA_DT_DEBUT" IS NOT NULL
            AND (d."TPS_DMDA_SUPPR" IS NULL OR TRIM(d."TPS_DMDA_SUPPR") = '0')
        `);

        // Parse dates and check if they cover the requested date/period
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

        for (const row of demabsAbsences.rows) {
          const startDate = parseJsDate(row.TPS_DMDA_DT_DEBUT);
          const endDate = parseJsDate(row.TPS_DMDA_DT_FIN) || startDate;
          if (!startDate) continue;
          if (endDate < date || startDate > date) continue; // Not in date range

          // Check periode: if it covers the requested period, add to absent set
          const typDeb = (row.TPS_DMDA_TYPJOUR_DEB || '').trim().toLowerCase();
          const typFin = (row.TPS_DMDA_TYPJOUR_FIN || '').trim().toLowerCase();
          const covers = typDeb.includes('matin') && typFin.includes('apres') ? '' :
                         typFin.includes('apres') || typDeb.includes('apres') ? 'apres-midi' : 'matin';

          // Add if full day (periode '') or specific period matches
          if (covers === '' || covers === periodeVal) {
            absentSet.add(row.username);
          }
        }
      } catch (demabsErr) {
        console.warn('[Calendrier DSI] demabs query warning:', demabsErr.message);
      }

      const hotlineAgents = Array.from(hotlineAgentsSet);
      const available = hotlineAgents.filter(a => !absentSet.has(a));

      console.log(`[Calendrier DSI] getHotlineCount ${date} ${periodeVal}: hotlines=${JSON.stringify(Array.from(hotlineAgentsSet))}, absents=${JSON.stringify(Array.from(absentSet))}, available=${available.length}`);

      res.json({
        total: hotlineAgents.length,
        available: available.length,
        absent: hotlineAgents.length - available.length
      });
    } catch (error) {
      console.error('[Calendrier DSI] getHotlineCount error:', error);
      res.status(500).json({ message: 'Erreur', error: error.message });
    }
  },

  getHotlineDefaults: async (req, res) => {
    try {
      const { agent_username } = req.params;
      const result = await pool.query(
        `SELECT id, jour_semaine, semaine_type, periode FROM hub_calendrier.agents_hotline_defaults WHERE agent_username = $1 ORDER BY jour_semaine, periode`,
        [agent_username]
      );
      res.json(result.rows);
    } catch (error) {
      console.error('[Calendrier DSI] getHotlineDefaults error:', error);
      res.status(500).json({ message: 'Erreur', error: error.message });
    }
  },

  saveHotlineDefaults: async (req, res) => {
    try {
      const { agent_username } = req.params;
      const { rules } = req.body;
      await pool.query('DELETE FROM hub_calendrier.agents_hotline_defaults WHERE agent_username = $1', [agent_username]);
      for (const r of rules) {
        await pool.query(
          `INSERT INTO hub_calendrier.agents_hotline_defaults (agent_username, jour_semaine, semaine_type, periode) VALUES ($1, $2, $3, $4)`,
          [agent_username, r.jour_semaine, r.semaine_type || 'les2', r.periode || 'journee']
        );
      }
      res.json({ message: 'Règles hotline enregistrées' });
    } catch (error) {
      console.error('[Calendrier DSI] saveHotlineDefaults error:', error);
      res.status(500).json({ message: 'Erreur', error: error.message });
    }
  },

  toggleHotlineOverride: async (req, res) => {
    try {
      const { agent_username, date, active, periode } = req.body;
      const activeBool = active !== false;
      const periodeVal = periode || '';
      const existing = await pool.query(
        `SELECT id FROM hub_calendrier.hotline_overrides WHERE agent_username = $1 AND date = $2 AND periode = $3`,
        [agent_username, date, periodeVal]
      );
      if (existing.rowCount > 0) {
        await pool.query(
          `UPDATE hub_calendrier.hotline_overrides SET active = $1 WHERE id = $2`,
          [activeBool, existing.rows[0].id]
        );
        res.json({ message: 'Override mis à jour', active: activeBool, periode: periodeVal });
      } else {
        await pool.query(
          `INSERT INTO hub_calendrier.hotline_overrides (agent_username, date, active, periode) VALUES ($1, $2, $3, $4)`,
          [agent_username, date, activeBool, periodeVal]
        );
        res.json({ message: 'Override ajouté', active: activeBool, periode: periodeVal });
      }
    } catch (error) {
      console.error('[Calendrier DSI] toggleHotlineOverride error:', error);
      res.status(500).json({ message: 'Erreur', error: error.message });
    }
  },

  getHotlineOverrides: async (req, res) => {
    try {
      const { agent_username } = req.params;
      const result = await pool.query(
        `SELECT id, date::text as date, active, periode FROM hub_calendrier.hotline_overrides WHERE agent_username = $1 ORDER BY date, periode`,
        [agent_username]
      );
      res.json(result.rows);
    } catch (error) {
      console.error('[Calendrier DSI] getHotlineOverrides error:', error);
      res.status(500).json({ message: 'Erreur', error: error.message });
    }
  },

  getVacances: async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, date_debut::text as date_debut, date_fin::text as date_fin, label, type, created_by, created_at FROM hub_calendrier.vacances ORDER BY date_debut`
      );
      res.json(result.rows);
    } catch (error) {
      console.error('[Calendrier DSI] getVacances error:', error);
      res.status(500).json({ message: 'Erreur', error: error.message });
    }
  },

  addVacance: async (req, res) => {
    try {
      const { date_debut, date_fin, label, type } = req.body;
      if (!date_debut || !label) return res.status(400).json({ message: 'Date début et label requis' });
      const result = await pool.query(
        `INSERT INTO hub_calendrier.vacances (date_debut, date_fin, label, type) VALUES ($1, $2, $3, $4) RETURNING id, date_debut::text as date_debut, date_fin::text as date_fin, label, type`,
        [date_debut, date_fin || date_debut, label, type || 'ferie']
      );
      res.json(result.rows[0]);
    } catch (error) {
      console.error('[Calendrier DSI] addVacance error:', error);
      res.status(500).json({ message: 'Erreur', error: error.message });
    }
  },

  deleteVacance: async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query(`DELETE FROM hub_calendrier.vacances WHERE id = $1`, [id]);
      res.json({ message: 'Supprimé' });
    } catch (error) {
      console.error('[Calendrier DSI] deleteVacance error:', error);
      res.status(500).json({ message: 'Erreur', error: error.message });
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
      const ttEvents = events.filter(e => e.categorie === 'teletravail');
      console.log(`[sendDailyCalendar] Date: ${date}, Total TT events: ${ttEvents.length}`);
      ttEvents.forEach(e => console.log(`  - ${e.agent_username}: ${e.agent_nom}`));
      const formattedDate = new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      // Get hotlines for this date
      const [year, month, day] = date.split('-').map(Number);
      const dateObj = new Date(year, month - 1, day);
      const dayOfWeek = dateObj.getDay();
      const weekNum = getWeekNumber(dateObj);
      const isEven = weekNum % 2 === 0;

      const hotlineDefaults = await pool.query(
        `SELECT d.agent_username, a.nom, d.periode FROM hub_calendrier.agents_hotline_defaults d
         JOIN hub_calendrier.agents_dsi a ON a.username = d.agent_username
         WHERE d.jour_semaine = $1 AND (d.semaine_type = 'les2' OR (d.semaine_type = 'paire' AND $2) OR (d.semaine_type = 'impaire' AND NOT $2))
         ORDER BY a.nom`,
        [dayOfWeek, isEven]
      );

      const hotlineOverrides = await pool.query(
        `SELECT agent_username, active, periode FROM hub_calendrier.hotline_overrides
         WHERE date = $1 AND active = false
         ORDER BY agent_username`,
        [date]
      );

      const overrideMap = {};
      for (const ov of hotlineOverrides.rows) {
        const key = `${ov.agent_username}|${ov.periode || ''}`;
        overrideMap[key] = ov;
      }

      const hotlineEvents = [];
      for (const h of hotlineDefaults.rows) {
        const periode = h.periode === 'journee' ? '' : h.periode;
        const key = `${h.agent_username}|${periode}`;
        if (!overrideMap[key]) {
          hotlineEvents.push({
            agent_nom: h.nom,
            periode: periode,
            agent_username: h.agent_username
          });
        }
      }

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

      // Hotline section
      if (hotlineEvents.length > 0) {
        html += '<div class="category-section"><div class="category-header" style="background-color: #22c55e">☎️ Agents Hotline (' + hotlineEvents.length + ')</div>';
        for (const h of hotlineEvents) {
          const periodLabel = h.periode ? ` - ${h.periode === 'matin' ? 'Matin' : 'Après-midi'}` : ' - Journée entière';
          html += '<div class="category-item"><div class="item-name">Hotline' + periodLabel + '</div><div class="item-period">👤 ' + h.agent_nom + '</div></div>';
        }
        html += '</div>';
      }

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
          // Final dedup by visible content (titre + periode)
          const rhKeys = new Set();
          const uniqueRh = rhAbsences.filter(e => {
            const k = `${e.titre || ''}|${e.periode || ''}`;
            if (rhKeys.has(k)) return false;
            rhKeys.add(k);
            return true;
          });
          const validated = uniqueRh.filter(e => !e.pending);
          const pending = uniqueRh.filter(e => e.pending);
          html += `
            <div class="category-section">
              <div class="category-header" style="background-color: ${CATEGORY_COLORS.absence}">
                🏥 Absences RH${validated.length > 0 ? ` (${validated.length} validée${validated.length > 1 ? 's' : ''})` : ''}${pending.length > 0 ? ` (${pending.length} en attente)` : ''}
              </div>
          `;
            for (const evt of uniqueRh) {
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
