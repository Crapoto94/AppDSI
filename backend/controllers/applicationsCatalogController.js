const { pgDb } = require('../shared/pg_db');
const { isAdminLike } = require('../shared/middleware');

const FIELDS = [
  'nom', 'agent', 'dossier', 'nature', 'version', 'repo_github', 'ports_docker',
  'objectif', 'modules_fonctions', 'techno_stack', 'base_donnees',
  'dependances_integrations', 'ia_embarquee', 'variables_env', 'complexite',
  'justification_complexite', 'swagger_doc', 'etat', 'lien_prod'
];

function canEdit(req, item) {
  return isAdminLike(req.user) || req.user.username === item.created_by;
}

exports.getAllApplications = async (req, res) => {
  try {
    const items = await pgDb.all(`
      SELECT id, nom, agent, dossier, nature, version, repo_github, ports_docker,
             etat, complexite, techno_stack, lien_prod, created_by, created_at, updated_at
      FROM hub.applications_catalog
      ORDER BY agent ASC, nom ASC
    `);
    res.json(items);
  } catch (error) {
    console.error('Error fetching applications catalog:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await pgDb.get(`SELECT * FROM hub.applications_catalog WHERE id = $1`, [id]);
    if (!item) return res.status(404).json({ error: 'Application not found' });
    res.json({ ...item, can_edit: canEdit(req, item) });
  } catch (error) {
    console.error('Error fetching application:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.createApplication = async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.nom || !body.agent) {
      return res.status(400).json({ error: 'Le nom et l\'agent sont requis' });
    }

    const values = FIELDS.map(f => (body[f] === undefined || body[f] === '') ? null : body[f]);
    const placeholders = FIELDS.map((_, i) => `$${i + 1}`).join(', ');

    const result = await pgDb.run(`
      INSERT INTO hub.applications_catalog (${FIELDS.join(', ')}, created_by, created_at, updated_at)
      VALUES (${placeholders}, $${FIELDS.length + 1}, NOW(), NOW())
    `, [...values, req.user.username]);

    res.json({ id: result.lastID, ...body, created_by: req.user.username });
  } catch (error) {
    console.error('Error creating application:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.updateApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await pgDb.get(`SELECT created_by FROM hub.applications_catalog WHERE id = $1`, [id]);
    if (!item) return res.status(404).json({ error: 'Application not found' });
    if (!canEdit(req, item)) {
      return res.status(403).json({ error: 'Seul le créateur (ou un administrateur) peut modifier cette application' });
    }

    const body = req.body || {};
    const updates = [];
    const params = [];
    let paramCount = 1;

    FIELDS.forEach(f => {
      if (body[f] !== undefined) {
        updates.push(`${f} = $${paramCount++}`);
        params.push(body[f] === '' ? null : body[f]);
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');
    params.push(id);

    await pgDb.run(`
      UPDATE hub.applications_catalog SET ${updates.join(', ')} WHERE id = $${paramCount}
    `, params);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating application:', error);
    res.status(500).json({ error: error.message });
  }
};

// Import en lot depuis un JSON genere par une IA (un objet, ou un tableau d'objets)
exports.importApplications = async (req, res) => {
  try {
    const body = req.body;
    const items = Array.isArray(body) ? body : [body];

    if (items.length === 0) {
      return res.status(400).json({ error: 'Aucune application à importer' });
    }

    const created = [];
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i] || {};
      if (!item.nom || !item.agent) {
        errors.push({ index: i, nom: item.nom || null, error: "Le nom et l'agent sont requis" });
        continue;
      }

      try {
        const values = FIELDS.map(f => (item[f] === undefined || item[f] === '') ? null : item[f]);
        const placeholders = FIELDS.map((_, idx) => `$${idx + 1}`).join(', ');

        const result = await pgDb.run(`
          INSERT INTO hub.applications_catalog (${FIELDS.join(', ')}, created_by, created_at, updated_at)
          VALUES (${placeholders}, $${FIELDS.length + 1}, NOW(), NOW())
        `, [...values, req.user.username]);

        created.push({ id: result.lastID, nom: item.nom });
      } catch (itemError) {
        errors.push({ index: i, nom: item.nom, error: itemError.message });
      }
    }

    res.json({ created, errors, total: items.length });
  } catch (error) {
    console.error('Error importing applications:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.deleteApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await pgDb.get(`SELECT created_by FROM hub.applications_catalog WHERE id = $1`, [id]);
    if (!item) return res.status(404).json({ error: 'Application not found' });
    if (!canEdit(req, item)) {
      return res.status(403).json({ error: 'Seul le créateur (ou un administrateur) peut supprimer cette application' });
    }

    await pgDb.run('DELETE FROM hub.applications_catalog WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting application:', error);
    res.status(500).json({ error: error.message });
  }
};
