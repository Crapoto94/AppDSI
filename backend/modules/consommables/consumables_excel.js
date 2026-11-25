/**
 * Lecture des bons de commande Excel des écoles (module Consommables).
 *
 * Le fichier contient une ligne d'en-tête « MODELE IMPRIMANTE | Réf. Cartouches |
 * Nb de pages | Réf. Fournisseur | Quantité » ; seules les lignes dont la
 * quantité est > 0 sont retenues. Chaque ligne est rapprochée du catalogue
 * (référence cartouche, référence fournisseur, puis modèle d'imprimante).
 */
const XLSX = require('xlsx');

const norm = (s) => String(s == null ? '' : s)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/\s+/g, ' ').trim();
const refKey = (s) => norm(s).replace(/[^A-Z0-9]/g, '');
const toQty = (v) => {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.').replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};
const pad = (n) => String(n).padStart(2, '0');
function toIsoDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  const s = String(v).trim();
  let m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${pad(m[2])}-${pad(m[1])}`;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function matchCatalog(catalog, { model, cartridge, supplier }) {
  const ck = refKey(cartridge);
  const sk = refKey(supplier);
  const mk = norm(model);
  let best = null;
  let bestScore = 0;
  for (const c of catalog || []) {
    const a = refKey(c.article);
    const cf = refKey(c.code_fabricant);
    const rc = refKey(c.ref_commande);
    const d = norm(c.designation);
    let score = 0;
    if (ck && a && a === ck) score = 100;
    else if (ck && a && (a.includes(ck) || ck.includes(a))) score = 80;
    else if (sk && ((cf && cf === sk) || (rc && rc === sk))) score = 70;
    else if (mk && d && (d.includes(mk) || mk.includes(d))) score = 40;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

/** Lit une feuille et retourne les lignes du tableau + les infos d'en-tête. */
function parseSheet(rows, catalog) {
  const headerIdx = rows.findIndex(row =>
    row.some(c => norm(c).includes('MODELE IMPRIMANTE')) &&
    row.some(c => norm(c).includes('CARTOUCHES'))
  );
  const result = { items: [], unmatched: [], school: null, director: null, phone: null, date: null };
  if (headerIdx < 0) return result;

  const header = rows[headerIdx].map(c => norm(c));
  const col = (needle, fallback) => {
    const i = header.findIndex(h => h.includes(needle));
    return i >= 0 ? i : fallback;
  };
  const cModel = col('MODELE', 0);
  const cCart = col('CARTOUCHES', 1);
  const cSupplier = col('FOURNISSEUR', 3);
  const cQty = col('QUANTITE', 4);

  // Infos d'en-tête (école, directeur, téléphone, date)
  for (const row of rows.slice(0, headerIdx)) {
    const idx = row.findIndex(c => norm(c) === 'ECOLE');
    if (idx >= 0) {
      const typeCell = String(row[idx + 1] || '').trim();
      const name = String(row[idx + 2] || '').trim();
      const hay = `${typeCell} ${name}`;
      let type = '';
      if (/MATERNELLE/i.test(hay)) type = 'Maternelle';
      else if (/ELEMENTAIRE/i.test(hay)) type = 'Elémentaire';
      result.school = { type, name };
    }
    const dIdx = row.findIndex(c => norm(c).includes('DIRECTEUR'));
    if (dIdx >= 0 && row[dIdx + 1]) result.director = String(row[dIdx + 1]).trim();
    const tIdx = row.findIndex(c => norm(c).startsWith('TEL'));
    if (tIdx >= 0 && row[tIdx + 1]) result.phone = String(row[tIdx + 1]).trim();
    const dateIdx = row.findIndex(c => norm(c).startsWith('DATE DE LA COMMANDE'));
    if (dateIdx >= 0 && row[dateIdx + 1]) result.date = toIsoDate(row[dateIdx + 1]);
  }

  for (const row of rows.slice(headerIdx + 1)) {
    const qty = toQty(row[cQty]);
    if (!qty) continue;
    const model = String(row[cModel] || '').trim();
    const cartridge = String(row[cCart] || '').trim();
    const supplier = String(row[cSupplier] || '').trim();
    if (!model && !cartridge && !supplier) continue;
    const match = matchCatalog(catalog, { model, cartridge, supplier });
    if (match) {
      result.items.push({
        catalog_id: match.id,
        type_id: match.type_id,
        article: match.article,
        designation: match.designation,
        quantite: qty,
        model, cartridge, supplier,
      });
    } else {
      result.unmatched.push({ model, cartridge, supplier, quantite: qty });
    }
  }
  return result;
}

function parseWorkbook(buffer, catalog) {
  const out = { items: [], unmatched: [], school: null, director: null, phone: null, date: null };
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });
    const parsed = parseSheet(rows, catalog);
    // Fusionne les lignes (quantités cumulées par article)
    for (const it of parsed.items) {
      const prev = out.items.find(x => x.catalog_id === it.catalog_id);
      if (prev) prev.quantite += it.quantite;
      else out.items.push({ ...it });
    }
    out.unmatched.push(...parsed.unmatched);
    out.school = out.school || parsed.school;
    out.director = out.director || parsed.director;
    out.phone = out.phone || parsed.phone;
    out.date = out.date || parsed.date;
  }
  return out;
}

module.exports = { parseWorkbook, matchCatalog, norm, refKey };
