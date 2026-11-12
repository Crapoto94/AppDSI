const path = require('path');
const { pool } = require('../../../shared/database');
const storage = require('../../../shared/storage');

// Dates en texte AAAA-MM-JJ côté API (évite tout décalage de fuseau avec les objets Date)
const COLUMNS = `id, nom, niveau, to_char(date_arrivee, 'YYYY-MM-DD') AS date_arrivee,
  to_char(date_fin, 'YYYY-MM-DD') AS date_fin, duree_semaines, maitre_stage, maitre_username, notes, cv_nom, rapport_nom, created_at, updated_at`;

// Documents d'un stagiaire (CV, rapport de stage) : stockés via le service de stockage unifié sous
// « rh_stagiaires/<id>/ ». Les chemins ne sont jamais renvoyés au client (données personnelles) : le
// téléchargement passe par une route authentifiée, et le préfixe est bloqué sur /storage (voir server.js).
const MODULE = 'rh_stagiaires';
const DOCS = {
  cv: { path: 'cv_path', nom: 'cv_nom', label: 'CV' },
  rapport: { path: 'rapport_path', nom: 'rapport_nom', label: 'Rapport de stage' },
};
const DOC_EXT = ['.pdf', '.doc', '.docx', '.odt', '.rtf'];
const DOC_MAX = 15 * 1024 * 1024;

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const txt = (v, max) => String(v ?? '').trim().slice(0, max);
const day = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };

// Durée en semaines : jours calendaires inclusifs / 7, arrondi au supérieur (24/11 → 19/12 = 4 semaines)
function dureeSemaines(arrivee, fin) {
  if (!arrivee || !fin) return null;
  return Math.ceil(((day(fin) - day(arrivee)) / 86400000 + 1) / 7);
}

// Nettoie et valide un stagiaire ; renvoie { error } ou { value }
function clean(body) {
  const nom = txt(body?.nom, 255);
  if (!nom) return { error: 'Le nom du stagiaire est obligatoire' };
  const arrivee = txt(body?.date_arrivee, 10) || null;
  const fin = txt(body?.date_fin, 10) || null;
  for (const d of [arrivee, fin]) {
    if (d && (!RE_DATE.test(d) || Number.isNaN(day(d)))) return { error: `Date invalide : ${d}` };
  }
  if (arrivee && fin && fin < arrivee) return { error: "La date de fin est antérieure à la date d'arrivée" };
  return {
    value: {
      nom, niveau: txt(body?.niveau, 100), arrivee, fin,
      duree: dureeSemaines(arrivee, fin), maitre: txt(body?.maitre_stage, 100), maitreUser: txt(body?.maitre_username, 100) || null,
      notes: txt(body?.notes, 4000),
    },
  };
}

// Le maître de stage est un agent DSI (hub_calendrier.agents_dsi, la liste de /calendrier-dsi).
// - `maitre_username` fourni : l'agent doit exister ; son nom est recopié dans `maitre_stage`
//   (l'affichage et l'historique restent lisibles même si l'agent est retiré de la liste).
// - sinon, texte libre (import Excel) : rattaché à l'agent seulement si UN SEUL agent correspond
//   (nom ou prénom) ; en cas d'homonymie le texte est conservé tel quel, à rattacher à la main.
async function resolveMaitre(q, v) {
  if (v.maitreUser) {
    const r = await q.query('SELECT username, nom FROM hub_calendrier.agents_dsi WHERE username = $1', [v.maitreUser]);
    if (!r.rows.length) return { error: `Maître de stage inconnu : ${v.maitreUser}` };
    return { username: r.rows[0].username, nom: r.rows[0].nom };
  }
  if (v.maitre) {
    const r = await q.query(
      `SELECT username, nom FROM hub_calendrier.agents_dsi
       WHERE LOWER(nom) = LOWER($1) OR LOWER(SPLIT_PART(nom, ' ', 1)) = LOWER($1) OR LOWER(SPLIT_PART(nom, ' ', 2)) = LOWER($1)`,
      [v.maitre]
    );
    if (r.rows.length === 1) return { username: r.rows[0].username, nom: r.rows[0].nom };
  }
  return { username: null, nom: v.maitre };
}

const INSERT = `INSERT INTO hub.stagiaires (nom, niveau, date_arrivee, date_fin, duree_semaines, maitre_stage, maitre_username, notes)
  VALUES ($1, $2, $3::date, $4::date, $5, $6, $7, $8)`;
const params = (v, m) => [v.nom, v.niveau, v.arrivee, v.fin, v.duree, m.nom, m.username, v.notes];

module.exports = {
  DOC_MAX,
  list: async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT ${COLUMNS} FROM hub.stagiaires ORDER BY date_arrivee ASC NULLS LAST, nom ASC`);
      res.json(rows);
    } catch (e) {
      console.error('[STAGIAIRES] liste :', e.message);
      res.status(500).json({ message: 'Erreur chargement des stagiaires' });
    }
  },

  create: async (req, res) => {
    const v = clean(req.body);
    if (v.error) return res.status(400).json({ message: v.error });
    try {
      const m = await resolveMaitre(pool, v.value);
      if (m.error) return res.status(400).json({ message: m.error });
      const { rows } = await pool.query(`${INSERT} RETURNING ${COLUMNS}`, params(v.value, m));
      res.status(201).json(rows[0]);
    } catch (e) {
      console.error('[STAGIAIRES] création :', e.message);
      res.status(500).json({ message: "Erreur lors de l'ajout du stagiaire" });
    }
  },

  update: async (req, res) => {
    const v = clean(req.body);
    if (v.error) return res.status(400).json({ message: v.error });
    try {
      const m = await resolveMaitre(pool, v.value);
      if (m.error) return res.status(400).json({ message: m.error });
      const { rows } = await pool.query(
        `UPDATE hub.stagiaires SET nom = $1, niveau = $2, date_arrivee = $3::date, date_fin = $4::date,
           duree_semaines = $5, maitre_stage = $6, maitre_username = $7, notes = $8, updated_at = CURRENT_TIMESTAMP
         WHERE id = $9 RETURNING ${COLUMNS}`,
        [...params(v.value, m), req.params.id]
      );
      if (!rows.length) return res.status(404).json({ message: 'Stagiaire introuvable' });
      res.json(rows[0]);
    } catch (e) {
      console.error('[STAGIAIRES] modification :', e.message);
      res.status(500).json({ message: 'Erreur lors de la modification du stagiaire' });
    }
  },

  remove: async (req, res) => {
    try {
      const r = await pool.query('DELETE FROM hub.stagiaires WHERE id = $1 RETURNING cv_path, rapport_path', [req.params.id]);
      if (!r.rowCount) return res.status(404).json({ message: 'Stagiaire introuvable' });
      for (const f of [r.rows[0].cv_path, r.rows[0].rapport_path]) if (f) await storage.deleteFile(f).catch(() => {});
      res.json({ message: 'Stagiaire supprimé' });
    } catch (e) {
      console.error('[STAGIAIRES] suppression :', e.message);
      res.status(500).json({ message: 'Erreur lors de la suppression du stagiaire' });
    }
  },

  // --- Documents : POST/GET/DELETE /:id/documents/:kind (kind = cv | rapport) ---
  uploadDocument: async (req, res) => {
    const k = DOCS[req.params.kind];
    if (!k) return res.status(404).json({ message: 'Type de document inconnu' });
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu' });
    const nom = path.basename(storage.fixUploadName(req.file.originalname) || 'document');
    if (!DOC_EXT.includes(path.extname(nom).toLowerCase())) {
      return res.status(400).json({ message: `${k.label} : format non accepté (PDF, DOC, DOCX, ODT ou RTF).` });
    }
    try {
      const cur = await pool.query(`SELECT ${k.path} AS p FROM hub.stagiaires WHERE id = $1`, [req.params.id]);
      if (!cur.rows.length) return res.status(404).json({ message: 'Stagiaire introuvable' });
      const saved = await storage.saveFile(MODULE, req.params.id, { buffer: req.file.buffer, originalname: nom });
      const { rows } = await pool.query(
        `UPDATE hub.stagiaires SET ${k.path} = $1, ${k.nom} = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING ${COLUMNS}`,
        [saved.dbPath, nom, req.params.id]
      );
      if (cur.rows[0].p) await storage.deleteFile(cur.rows[0].p).catch(() => {}); // remplace l'ancien fichier
      res.status(201).json(rows[0]);
    } catch (e) {
      console.error('[STAGIAIRES] dépôt de document :', e.message);
      res.status(500).json({ message: "Erreur lors de l'enregistrement du document" });
    }
  },

  downloadDocument: async (req, res) => {
    const k = DOCS[req.params.kind];
    if (!k) return res.status(404).json({ message: 'Type de document inconnu' });
    try {
      const { rows } = await pool.query(`SELECT ${k.path} AS p, ${k.nom} AS nom FROM hub.stagiaires WHERE id = $1`, [req.params.id]);
      if (!rows.length || !rows[0].p) return res.status(404).json({ message: 'Document introuvable' });
      const f = await storage.getFileForServe(rows[0].p);
      if (!f) return res.status(404).json({ message: 'Fichier introuvable sur le stockage' });
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(rows[0].nom || 'document')}`);
      if (f.absolutePath) return res.sendFile(f.absolutePath);
      res.type(path.extname(rows[0].nom || '') || 'application/octet-stream');
      return res.send(f.buffer);
    } catch (e) {
      console.error('[STAGIAIRES] lecture de document :', e.message);
      res.status(500).json({ message: 'Erreur lors de la lecture du document' });
    }
  },

  deleteDocument: async (req, res) => {
    const k = DOCS[req.params.kind];
    if (!k) return res.status(404).json({ message: 'Type de document inconnu' });
    try {
      const cur = await pool.query(`SELECT ${k.path} AS p FROM hub.stagiaires WHERE id = $1`, [req.params.id]);
      if (!cur.rows.length) return res.status(404).json({ message: 'Stagiaire introuvable' });
      const { rows } = await pool.query(
        `UPDATE hub.stagiaires SET ${k.path} = NULL, ${k.nom} = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING ${COLUMNS}`,
        [req.params.id]
      );
      if (cur.rows[0].p) await storage.deleteFile(cur.rows[0].p).catch(() => {});
      res.json(rows[0]);
    } catch (e) {
      console.error('[STAGIAIRES] suppression de document :', e.message);
      res.status(500).json({ message: 'Erreur lors de la suppression du document' });
    }
  },

  // Import en masse : { rows: [{ nom, niveau, date_arrivee, date_fin, maitre_stage }] }.
  // Tout ou rien : une ligne invalide annule l'import et est signalée avec son numéro.
  importMany: async (req, res) => {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ message: 'Aucune ligne à importer' });
    if (rows.length > 1000) return res.status(400).json({ message: 'Import limité à 1000 lignes' });
    const cleaned = [];
    for (let i = 0; i < rows.length; i++) {
      const v = clean(rows[i]);
      if (v.error) return res.status(400).json({ message: `Ligne ${i + 1} : ${v.error}` });
      cleaned.push(v.value);
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < cleaned.length; i++) {
        const m = await resolveMaitre(client, cleaned[i]);
        if (m.error) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: `Ligne ${i + 1} : ${m.error}` });
        }
        await client.query(INSERT, params(cleaned[i], m));
      }
      await client.query('COMMIT');
      res.status(201).json({ imported: cleaned.length });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[STAGIAIRES] import :', e.message);
      res.status(500).json({ message: "Erreur lors de l'import" });
    } finally {
      client.release();
    }
  },
};
