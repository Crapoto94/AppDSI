// ─── Import du parc mobilité (téléphones & tablettes) depuis un fichier Excel ──
// Modèle « historique par device » : chaque ligne source = un événement (action).
// La table hub_parc.mobilite_devices matérialise le dernier état de chaque appareil.
//
//   Usage : node scripts/import_mobilite.js [chemin_xlsx]
//   Défaut : ../Classeur1.xlsx (racine du dépôt)
//
// L'import est idempotent : il PURGE puis recharge l'intégralité des deux tables
// à partir du fichier (source de vérité = l'Excel).
const path = require('path');
const XLSX = require('xlsx');
const { pool, setupPgDb } = require('../shared/pg_db');

const FILE = process.argv[2] || path.join(__dirname, '..', '..', 'Classeur1.xlsx');
const SHEET = 'Source_Tel_Mob';
const HEADER_ROW = 6; // ligne d'en-têtes (0-indexée)

const norm = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());

// IMEI : retire un préfixe « IMEI », les espaces, et garde la valeur normalisée.
function normImei(v) {
  let s = norm(v).toUpperCase().replace(/^IMEI[:\s]*/i, '').replace(/\s+/g, '');
  // certaines cellules contiennent du texte parasite : ne garder que si ça ressemble à un IMEI
  if (!/^\d{8,17}$/.test(s)) return '';
  return s;
}

// Date « M/D/YY » ou « M/D/YYYY » → ISO yyyy-mm-dd (null si illisible).
function parseDate(v) {
  const s = norm(v);
  if (!s) return null;
  // Excel renvoie parfois un nombre de série
  if (/^\d{5}$/.test(s)) {
    const d = XLSX.SSF ? XLSX.SSF.parse_date_code(Number(s)) : null;
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  // Formats mixtes dans la source : majorité M/D/YY (ex : 1/26/26) mais quelques
  // D/M/YY (ex : 13/04/22). On désambiguïse via la valeur > 12.
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let [, a, b, yr] = m;
    a = parseInt(a, 10); b = parseInt(b, 10);
    yr = yr.length === 2 ? '20' + yr : yr;
    let mo, da;
    if (a > 12 && b <= 12) { da = a; mo = b; }        // D/M
    else if (b > 12 && a <= 12) { mo = a; da = b; }   // M/D
    else if (a > 12 && b > 12) return null;            // illisible
    else { mo = a; da = b; }                           // ambigu → M/D par défaut
    return `${yr}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
  }
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`;
  return null;
}

// Famille d'appareil déduite du TYPE.
function familleOf(type) {
  const t = norm(type).toLowerCase();
  if (!t) return 'autre';
  if (t.includes('sim')) return 'sim';
  if (t.includes('ipad') || t.includes('tablette')) return 'tablette';
  if (t.includes('iphone') || t.includes('smartphone') || t.includes('téléphone') || t.includes('telephone')) return 'telephone';
  return 'autre';
}

// Normalisation de l'action en catégorie.
function actionNorm(action) {
  const a = norm(action).toLowerCase();
  if (!a) return 'Indéterminé';
  if (a.includes('retour')) return 'Retour';
  if (a.includes('vol')) return 'Vol';
  if (a.includes('cession')) return 'Cession';
  if (a.includes('remplacement')) return 'Remplacement';
  if (a.includes('prêt') || a.includes('pret')) return 'Prêt';
  if (a.includes('dotation')) return 'Dotation';
  if (a.includes('disposition')) return 'Mise à disposition';
  return norm(action);
}

const INACTIF = new Set(['Retour', 'Vol', 'Cession']);

(async () => {
  console.log('→ Lecture du fichier', FILE);
  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets[SHEET];
  if (!ws) throw new Error(`Feuille « ${SHEET} » introuvable. Feuilles : ${wb.SheetNames.join(', ')}`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });

  // Index des colonnes par en-tête (robuste à un éventuel décalage).
  const hdr = rows[HEADER_ROW].map((c) => norm(c).toLowerCase());
  const col = (label) => hdr.findIndex((h) => h === label.toLowerCase());
  const C = {
    direction: col('direction'), service: col('service'), agent: col('agent'),
    action: col('action'), date: col('date'), qte: col('quantité remise'),
    type: col('type'), modele: col('modele'), imei: col('imei'), sn: col('s/n'),
    etiq: col('etiquetage'), ligne: col('numero de ligne'), sim: col('carte sim'),
    puk: col('code puk'), pret: col('prêt'), ligneAct: col('ligne'), forfait: col('forfait'),
    mdm: col('mdm'), du: col('du'), au: col('au'), rapport: col('rapport prêt'),
    dernier: col('dernier utilisateur'), obs: col('observations'),
    bl: col('bl'), blDate: col('bl date'), bdc: col('bdc'), bdcDate: col('bdc date'),
  };
  const g = (r, k) => (C[k] >= 0 ? r[C[k]] : null);

  const dataRows = rows.slice(HEADER_ROW + 1)
    .filter((r) => Array.isArray(r) && r.some((c) => c != null && String(c).trim() !== ''));

  const batch = new Date().toISOString();
  const events = [];
  dataRows.forEach((r, i) => {
    const imei = normImei(g(r, 'imei'));
    const serial = norm(g(r, 'sn'));
    const etiq = norm(g(r, 'etiq'));
    const ligne = norm(g(r, 'ligne'));
    const key = imei ? `IMEI:${imei}`
      : serial ? `SN:${serial.toUpperCase()}`
        : etiq ? `ETIQ:${etiq.toUpperCase()}`
          : ligne ? `LIGNE:${ligne.replace(/\s+/g, '')}`
            : `ROW:${i}`;
    const aNorm = actionNorm(g(r, 'action'));
    events.push({
      device_key: key,
      direction: norm(g(r, 'direction')) || null,
      service: norm(g(r, 'service')) || null,
      agent: norm(g(r, 'agent')) || null,
      action: norm(g(r, 'action')) || null,
      action_norm: aNorm,
      is_retour: aNorm === 'Retour',
      date_event: parseDate(g(r, 'date')),
      quantite: (() => { const n = parseInt(norm(g(r, 'qte')), 10); return Number.isFinite(n) ? n : null; })(),
      type_appareil: norm(g(r, 'type')) || null,
      famille: familleOf(g(r, 'type')),
      modele: norm(g(r, 'modele')) || null,
      imei: imei || null,
      serial: serial || null,
      etiquetage: etiq || null,
      numero_ligne: ligne || null,
      carte_sim: norm(g(r, 'sim')) || null,
      code_puk: norm(g(r, 'puk')) || null,
      statut: norm(g(r, 'pret')) || null,
      ligne_active: norm(g(r, 'ligneAct')) || null,
      forfait: norm(g(r, 'forfait')) || null,
      mdm: norm(g(r, 'mdm')) || null,
      pret_du: norm(g(r, 'du')) || null,
      pret_au: norm(g(r, 'au')) || null,
      rapport_pret: norm(g(r, 'rapport')) || null,
      dernier_util: norm(g(r, 'dernier')) || null,
      observations: norm(g(r, 'obs')) || null,
      bl: norm(g(r, 'bl')) || null,
      bl_date: norm(g(r, 'blDate')) || null,
      bdc: norm(g(r, 'bdc')) || null,
      bdc_date: norm(g(r, 'bdcDate')) || null,
      _rowidx: i,
    });
  });

  // Regroupe par appareil + ordre chronologique (date asc, puis ordre du fichier).
  const groups = new Map();
  for (const e of events) {
    if (!groups.has(e.device_key)) groups.set(e.device_key, []);
    groups.get(e.device_key).push(e);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => {
      const da = a.date_event || '0000', db = b.date_event || '0000';
      if (da !== db) return da < db ? -1 : 1;
      return a._rowidx - b._rowidx;
    });
    list.forEach((e, idx) => { e.seq = idx + 1; });
  }

  console.log(`→ ${events.length} événements, ${groups.size} appareils distincts`);

  await setupPgDb().catch(() => {}); // s'assure que les tables existent
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE hub_parc.mobilite_events RESTART IDENTITY');
    await client.query('TRUNCATE hub_parc.mobilite_devices');

    // Insertion des événements (par lots).
    const cols = ['device_key', 'seq', 'direction', 'service', 'agent', 'action', 'action_norm',
      'is_retour', 'date_event', 'quantite', 'type_appareil', 'famille', 'modele', 'imei', 'serial',
      'etiquetage', 'numero_ligne', 'carte_sim', 'code_puk', 'statut', 'ligne_active', 'forfait', 'mdm',
      'pret_du', 'pret_au', 'rapport_pret', 'dernier_util', 'observations', 'bl', 'bl_date', 'bdc',
      'bdc_date', 'raw', 'import_batch'];
    const CHUNK = 200;
    for (let i = 0; i < events.length; i += CHUNK) {
      const slice = events.slice(i, i + CHUNK);
      const values = [];
      const params = [];
      slice.forEach((e, k) => {
        const base = k * cols.length;
        params.push(cols.map((_, j) => `$${base + j + 1}`).join(','));
        const raw = {};
        cols.forEach((c) => { if (!['raw'].includes(c)) raw[c] = e[c]; });
        values.push(
          e.device_key, e.seq, e.direction, e.service, e.agent, e.action, e.action_norm,
          e.is_retour, e.date_event, e.quantite, e.type_appareil, e.famille, e.modele, e.imei, e.serial,
          e.etiquetage, e.numero_ligne, e.carte_sim, e.code_puk, e.statut, e.ligne_active, e.forfait, e.mdm,
          e.pret_du, e.pret_au, e.rapport_pret, e.dernier_util, e.observations, e.bl, e.bl_date, e.bdc,
          e.bdc_date, JSON.stringify(raw), batch,
        );
      });
      await client.query(
        `INSERT INTO hub_parc.mobilite_events (${cols.join(',')}) VALUES ${params.map((p) => `(${p})`).join(',')}`,
        values,
      );
    }

    // Matérialisation du dernier état par appareil.
    for (const [key, list] of groups.entries()) {
      const last = list[list.length - 1];
      const first = list[0];
      // Identité : on prend la valeur non-nulle la plus récente pour chaque attribut.
      const pick = (f) => { for (let i = list.length - 1; i >= 0; i--) if (list[i][f]) return list[i][f]; return null; };
      const retours = list.filter((e) => e.is_retour).length;
      await client.query(
        `INSERT INTO hub_parc.mobilite_devices
          (device_key, imei, serial, etiquetage, type_appareil, famille, modele, numero_ligne,
           carte_sim, forfait, mdm, ligne_active, last_action, last_action_norm, last_statut, last_date,
           last_direction, last_service, last_agent, dernier_util, observations, events_count,
           retours_count, first_date, is_actif, import_batch, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,NOW())`,
        [
          key, pick('imei'), pick('serial'), pick('etiquetage'), pick('type_appareil'),
          last.famille, pick('modele'), pick('numero_ligne'), pick('carte_sim'), pick('forfait'),
          pick('mdm'), pick('ligne_active'), last.action, last.action_norm, last.statut, last.date_event,
          last.direction, last.service, last.agent, pick('dernier_util'), last.observations,
          list.length, retours, first.date_event, !INACTIF.has(last.action_norm), batch,
        ],
      );
    }

    await client.query('COMMIT');
    const dev = await client.query('SELECT COUNT(*)::int n FROM hub_parc.mobilite_devices');
    const ev = await client.query('SELECT COUNT(*)::int n FROM hub_parc.mobilite_events');
    console.log(`✔ Import terminé : ${dev.rows[0].n} appareils, ${ev.rows[0].n} événements.`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('�‼ Échec import :', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
