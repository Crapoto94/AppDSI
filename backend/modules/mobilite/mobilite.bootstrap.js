// ─── Amorçage idempotent de la mobilité ───────────────────────────────────────
// Crée, si absents : le magasin dédié « DSI – Mobilité », le PDF de fond de la
// fiche de remise, et deux gabarits partagés (remise / retour). Appelé une fois
// au démarrage du serveur, après setupPgDb. Sans effet si tout existe déjà.
const fs = require('fs');
const path = require('path');
const { pgDb } = require('../../shared/database');
const docs = require('../../shared/documents.service');
const blTemplateRepo = require('../stocks/repositories/bl-template.repository');

const STORE_CODE = 'DSI-MOB';
const STORE_NAME = 'DSI – Mobilité';
const BASE_TITLE = 'Fiche remise — fond';

// Champs pré-positionnés sur le fond A4 (origine haut-gauche, en points).
// Coordonnées « au mieux » : ajustables ensuite via l'éditeur de champs de
// /stocks/admin (onglet « Modèles de documents »). Voir variables disponibles
// dans bl-pdf.service.js.
const REMISE_FIELDS = [
  { type: 'text', page: 0, x: 250, y: 150, font_size: 11, bold: true, variable: '{etat}' },
  { type: 'text', page: 0, x: 130, y: 250, font_size: 11, variable: '{agent.nom}' },
  { type: 'text', page: 0, x: 80, y: 280, font_size: 10, variable: '{agent.service}' },
  { type: 'text', page: 0, x: 330, y: 280, font_size: 10, variable: '{agent.direction}' },
  { type: 'text', page: 0, x: 360, y: 312, font_size: 10, variable: '{date.remise}' },
  { type: 'text', page: 0, x: 200, y: 345, font_size: 10, variable: '{designation}' },
  { type: 'text', page: 0, x: 70, y: 378, font_size: 11, bold: true, variable: '{chargeur}' },
  { type: 'text', page: 0, x: 160, y: 378, font_size: 11, bold: true, variable: '{cable}' },
  { type: 'text', page: 0, x: 110, y: 452, font_size: 11, variable: '{imei}' },
  { type: 'text', page: 0, x: 140, y: 478, font_size: 11, variable: '{numero_ligne}' },
  { type: 'signature_recipient', page: 0, x: 70, y: 560, width: 150, height: 55 },
  { type: 'signature_preparer', page: 0, x: 340, y: 560, width: 150, height: 55 },
];
// La fiche retour part du même fond ; on ajoute le motif / l'état de restitution.
const RETOUR_FIELDS = [
  { type: 'text', page: 0, x: 250, y: 150, font_size: 11, bold: true, variable: '{etat.retour}' },
  { type: 'text', page: 0, x: 130, y: 250, font_size: 11, variable: '{agent.nom}' },
  { type: 'text', page: 0, x: 80, y: 280, font_size: 10, variable: '{agent.service}' },
  { type: 'text', page: 0, x: 330, y: 280, font_size: 10, variable: '{agent.direction}' },
  { type: 'text', page: 0, x: 360, y: 312, font_size: 10, variable: '{date.retour}' },
  { type: 'text', page: 0, x: 200, y: 345, font_size: 10, variable: '{designation}' },
  { type: 'text', page: 0, x: 110, y: 452, font_size: 11, variable: '{imei}' },
  { type: 'text', page: 0, x: 140, y: 478, font_size: 11, variable: '{numero_ligne}' },
  { type: 'text', page: 0, x: 90, y: 510, font_size: 9, variable: '{motif.retour}' },
  { type: 'signature_recipient', page: 0, x: 70, y: 560, width: 150, height: 55 },
  { type: 'signature_preparer', page: 0, x: 340, y: 560, width: 150, height: 55 },
];

async function ensureStore() {
  let store = await pgDb.get(`SELECT * FROM hub_stocks.stores WHERE code = $1`, [STORE_CODE]);
  if (!store) {
    await pgDb.run(
      `INSERT INTO hub_stocks.stores (code, name, address, is_active) VALUES ($1, $2, $3, TRUE)`,
      [STORE_CODE, STORE_NAME, 'Direction des Systèmes d’Information']
    );
    store = await pgDb.get(`SELECT * FROM hub_stocks.stores WHERE code = $1`, [STORE_CODE]);
    console.log('[MOBILITE] magasin « DSI – Mobilité » créé (id', store.id + ')');
  }
  return store;
}

async function ensureBaseDocument() {
  const existing = await docs.findByTitle('stocks', 'bl_template_base', 0, BASE_TITLE);
  if (existing) return existing.id;
  // PDF fourni à la racine du dépôt.
  const candidates = [
    path.join(__dirname, '..', '..', '..', 'fiche remise.pdf'),
    path.join(__dirname, '..', '..', 'fiche remise.pdf'),
  ];
  const file = candidates.find(p => fs.existsSync(p));
  if (!file) { console.warn('[MOBILITE] « fiche remise.pdf » introuvable — gabarits sans fond.'); return null; }
  const buffer = fs.readFileSync(file);
  const { document } = await docs.uploadDocument({
    file: { buffer, originalname: 'fiche-remise.pdf', mimetype: 'application/pdf', size: buffer.length },
    module: 'stocks', entityType: 'bl_template_base', entityId: 0, title: BASE_TITLE, uploadedBy: 'system',
  });
  console.log('[MOBILITE] fond de fiche enregistré (document', document.id + ')');
  return document.id;
}

async function ensureTemplate(name, category, fields, baseDocId) {
  const all = await blTemplateRepo.list();
  const existing = all.find(t => t.name === name);
  if (existing) {
    // Renseigne le fond s'il manquait (ex. PDF ajouté après coup).
    if (!existing.base_document_id && baseDocId) await blTemplateRepo.setBaseDocument(existing.id, baseDocId);
    return existing.id;
  }
  const id = await blTemplateRepo.create({ name, base_document_id: baseDocId, fields, is_default: false, created_by: 'system' });
  // category n'est pas géré par create() → on le pose explicitement.
  await pgDb.run(`UPDATE hub_stocks.bl_templates SET category = $1 WHERE id = $2`, [category, id]);
  console.log(`[MOBILITE] gabarit « ${name} » (${category}) créé`);
  return id;
}

async function bootstrapMobilite() {
  try {
    await ensureStore();
    const baseDocId = await ensureBaseDocument();
    await ensureTemplate('Remise de matériel', 'remise', REMISE_FIELDS, baseDocId);
    await ensureTemplate('Retour de matériel', 'retour', RETOUR_FIELDS, baseDocId);
  } catch (e) {
    console.error('[MOBILITE] amorçage échoué :', e.message);
  }
}

module.exports = { bootstrapMobilite, STORE_CODE };
