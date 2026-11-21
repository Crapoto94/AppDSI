const seditSource = require('./sedit-source.service');

// Lignes d'exécution budgétaires utilisées par les virements de crédits.
// Lecture exclusivement via l'API Sedit Finances : le périmètre (budgets × services)
// vient des droits Sedit de l'agent, eux aussi résolus par l'API.
async function getLiveLines(opts = {}) {
    const { rows } = await seditSource.readVirementLines(opts);
    return rows;
}

module.exports = { getLiveLines };
