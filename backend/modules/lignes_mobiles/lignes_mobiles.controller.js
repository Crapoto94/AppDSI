// ─── Lignes mobiles (forfaits / SIM) — import depuis lignes.xlsx ──────────────
// Source de vérité = export opérateur (feuille « Lignes_Mobile »). L'import
// REMPLACE l'intégralité de la table hub_parc.lignes_mobiles. L'opérateur est
// forcé à « SFR » pour toutes les lignes importées.
const XLSX = require('xlsx');
const { pool, pgDb } = require('../../shared/database');

const norm = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());

function parseDate(v) {
  const s = norm(v);
  if (!s) return null;
  if (/^\d{5}$/.test(s)) {
    const d = XLSX.SSF ? XLSX.SSF.parse_date_code(Number(s)) : null;
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let [, a, b, yr] = m;
    a = parseInt(a, 10); b = parseInt(b, 10);
    yr = yr.length === 2 ? '20' + yr : yr;
    let mo, da;
    if (a > 12 && b <= 12) { da = a; mo = b; }
    else if (b > 12 && a <= 12) { mo = a; da = b; }
    else if (a > 12 && b > 12) return null;
    else { mo = a; da = b; } // ambigu → on suppose JJ/MM
    return `${yr}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
  }
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`;
  return null;
}

// En-tête source (français) → colonne de la table.
const COLS = [
  'numero_ligne', 'operateur', 'civilite', 'nom', 'prenom', 'email', 'siren',
  'raison_sociale', 'numero_contrat', 'numero_titulaire', 'numero_cf', 'nom_cf',
  'statut_ligne', 'date_mise_en_service', 'date_fin_engagement', 'date_facturation',
  'forfait', 'terminal', 'imei', 'format_sim', 'numero_csim', 'eid', 'type_offre',
  'ligne_secondaire', 'numero_ligne_principale', 'raw_data',
];

module.exports = {
  // POST /api/lignes-mobiles/import (multer field « file »)
  importExcel: async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Fichier manquant (champ « file »).' });
    const client = await pool.connect();
    try {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = wb.SheetNames.includes('Lignes_Mobile') ? 'Lignes_Mobile' : wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (rows.length < 2) return res.status(400).json({ message: 'Aucune ligne de données dans le fichier.' });

      // Index des en-têtes (normalisés) → position de colonne
      const headers = rows[0].map(h => norm(h));
      const idx = (label) => headers.findIndex(h => h.toLowerCase() === norm(label).toLowerCase());
      const H = {
        ref: idx('Référence'),
        civ: idx('Civilité'), nom: idx('Nom'), prenom: idx('Prénom'), email: idx('E-mail'),
        siren: idx('SIREN'), rs: idx('Raison Sociale'),
        contrat: idx('N° Contrat'), titulaire: idx('N° Titulaire'),
        cf: idx('N° CF'), nomcf: idx('Nom CF'),
        statut: idx('Statut Ligne'),
        dms: idx('Date de mise  en service'), dfe: idx("Date de Fin de  Période d'Engagement"),
        dfact: idx('Date de facturation'),
        forfait: idx('Forfait'),
        termComm: idx('Terminal communiquant'), termAch: idx('Terminal acheté'),
        imeiComm: idx('IMEI communiquant'), imeiAch: idx('IMEI acheté'),
        sim: idx('FORMAT SIM'), csim: idx('N° de CSIM'), eid: idx('Eid'),
        offre: idx("Type d'offre"),
        secondaire: idx('Ligne secondaire'), principale: idx('N° Ligne Principale'),
      };
      const at = (row, i) => (i >= 0 ? norm(row[i]) : '');

      const data = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const ref = at(row, H.ref);
        // Ligne vide → on saute
        if (!ref && !at(row, H.nom) && !at(row, H.contrat)) continue;
        // raw_data : tout le contenu indexé par en-tête source
        const raw = {};
        headers.forEach((h, i) => { if (h) raw[h] = norm(row[i]); });

        data.push([
          ref || null,
          'SFR', // opérateur forcé
          at(row, H.civ) || null, at(row, H.nom) || null, at(row, H.prenom) || null, at(row, H.email) || null,
          at(row, H.siren) || null, at(row, H.rs) || null,
          at(row, H.contrat) || null, at(row, H.titulaire) || null,
          at(row, H.cf) || null, at(row, H.nomcf) || null,
          at(row, H.statut) || null,
          parseDate(at(row, H.dms)), parseDate(at(row, H.dfe)), parseDate(at(row, H.dfact)),
          at(row, H.forfait) || null,
          at(row, H.termComm) || at(row, H.termAch) || null,
          at(row, H.imeiComm) || at(row, H.imeiAch) || null,
          at(row, H.sim) || null, at(row, H.csim) || null, at(row, H.eid) || null,
          at(row, H.offre) || null,
          at(row, H.secondaire) || null, at(row, H.principale) || null,
          JSON.stringify(raw),
        ]);
      }

      if (data.length === 0) return res.status(400).json({ message: 'Aucune ligne exploitable.' });

      // Remplacement total dans une transaction
      await client.query('BEGIN');
      await client.query('TRUNCATE hub_parc.lignes_mobiles RESTART IDENTITY');
      const colList = COLS.join(', ');
      const BATCH = 200;
      for (let i = 0; i < data.length; i += BATCH) {
        const slice = data.slice(i, i + BATCH);
        const valuesSql = slice.map((_, k) => {
          const base = k * COLS.length;
          return '(' + COLS.map((__, j) => `$${base + j + 1}`).join(', ') + ')';
        }).join(', ');
        const params = slice.flat();
        await client.query(`INSERT INTO hub_parc.lignes_mobiles (${colList}) VALUES ${valuesSql}`, params);
      }
      await client.query('COMMIT');

      res.json({ success: true, imported: data.length, operateur: 'SFR', sheet: sheetName });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (e) { /* noop */ }
      console.error('[lignes-mobiles] import error:', error.message);
      res.status(500).json({ message: "Erreur lors de l'import des lignes mobiles", error: error.message });
    } finally {
      client.release();
    }
  },

  // GET /api/lignes-mobiles?statut=&q=
  list: async (req, res) => {
    try {
      const { statut, q } = req.query;
      const where = [];
      const params = [];
      let i = 1;
      if (statut) { where.push(`statut_ligne = $${i++}`); params.push(statut); }
      if (q && q.trim()) {
        where.push(`(numero_ligne ILIKE $${i} OR nom ILIKE $${i} OR prenom ILIKE $${i} OR forfait ILIKE $${i} OR imei ILIKE $${i} OR numero_contrat ILIKE $${i})`);
        params.push(`%${q.trim()}%`); i++;
      }
      const sql = `SELECT * FROM hub_parc.lignes_mobiles
                   ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                   ORDER BY nom NULLS LAST, numero_ligne`;
      const rows = await pgDb.all(sql, params);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: 'Erreur lecture lignes mobiles', error: error.message });
    }
  },

  // GET /api/lignes-mobiles/kpis
  kpis: async (req, res) => {
    try {
      const total = await pgDb.get('SELECT COUNT(*)::int AS n FROM hub_parc.lignes_mobiles');
      const parStatut = await pgDb.all(
        `SELECT COALESCE(NULLIF(statut_ligne, ''), '—') AS statut, COUNT(*)::int AS n
         FROM hub_parc.lignes_mobiles GROUP BY 1 ORDER BY n DESC`
      );
      const lastImport = await pgDb.get('SELECT MAX(imported_at) AS d FROM hub_parc.lignes_mobiles');
      res.json({ total: total?.n || 0, par_statut: parStatut, last_import: lastImport?.d || null });
    } catch (error) {
      res.status(500).json({ message: 'Erreur KPIs lignes mobiles', error: error.message });
    }
  },
};
