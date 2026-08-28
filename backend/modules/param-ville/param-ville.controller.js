const db = require('../../shared/database');

async function list(req, res) {
    try {
        const result = await pgDb.all(`SELECT * FROM hub.param_ville ORDER BY nom`);
        res.json(result);
    } catch (err) {
        res.status(500).json({ message: 'Erreur', error: err.message });
    }
}

async function getById(req, res) {
    try {
        const result = await pgDb.all(`SELECT * FROM hub.param_ville WHERE id = $1`, [req.params.id]);
        if (result.length === 0) {
            return res.status(404).json({ message: 'Non trouvé' });
        }
        res.json(result[0]);
    } catch (err) {
        res.status(500).json({ message: 'Erreur', error: err.message });
    }
}

async function create(req, res) {
    try {
        const { nom, valeur, description } = req.body;
        const result = await pgDb.run(
            `INSERT INTO hub.param_ville (nom, valeur, description, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
            [nom, valeur, description]
        );
        res.json({ id: result.id, nom, valeur, description, message: 'Créé avec succès' });
    } catch (err) {
        res.status(500).json({ message: 'Erreur', error: err.message });
    }
}

async function update(req, res) {
    try {
        const { nom, valeur, description } = req.body;
        const result = await pgDb.run(
            `UPDATE hub.param_ville SET nom = $1, valeur = $2, description = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
            [nom, valeur, description, req.params.id]
        );
        if (result.rowsAffected === 0) {
            return res.status(404).json({ message: 'Non trouvé' });
        }
        res.json({ id: req.params.id, nom, valeur, description, message: 'Mis à jour avec succès' });
    } catch (err) {
        res.status(500).json({ message: 'Erreur', error: err.message });
    }
}

async function remove(req, res) {
    try {
        const result = await pgDb.run(`DELETE FROM hub.param_ville WHERE id = $1`, [req.params.id]);
        if (result.rowsAffected === 0) {
            return res.status(404).json({ message: 'Non trouvé' });
        }
        res.json({ message: 'Supprimé avec succès' });
    } catch (err) {
        res.status(500).json({ message: 'Erreur', error: err.message });
    }
}

module.exports = { list, getById, create, update, remove };