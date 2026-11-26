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

/**
 * Type de consommable probable pour une ligne absente du catalogue.
 * 1 = LASER MONO, 2 = LASER COULEUR, 3 = JET D'ENCRE, 4 = FAX, 5 = DIVERS.
 * Les références sont souvent communes à une gamme : c'est le modèle
 * d'imprimante (lui aussi rempli par recopie vers le bas) qui tranche.
 */
function inferTypeId({ model, cartridge, supplier }) {
  const hay = norm(`${model} ${cartridge} ${supplier}`);
  if (/\bFAX\b/.test(hay)) return 4;
  if (/ENCRE|\bINK\b|JET D ENCRE/.test(hay)) return 3;
  if (/COLOR|COULEUR|CYAN|MAGENTA|JAUNE|YELLOW/.test(hay)) return 2;
  if (/TONER|LASER|NOIR|BLACK|BROTHER|HP|CANON|EPSON|RICOH|KYOCERA/.test(hay)) return 1;
  return 5;
}

/** Clé de regroupement d'une ligne (catalogue ou non) dans un même bon. */
function itemKey(it) {
  if (it.catalog_id) return `id:${it.catalog_id}`;
  return `ref:${refKey(it.article)}|${refKey(it.code_fabricant)}`;
}

/** Lit une feuille et retourne les lignes du tableau + les infos d'en-tête. */
function parseSheet(rows, catalog) {
  const headerIdx = rows.findIndex(row =>
    row.some(c => norm(c).includes('MODELE')) &&
    (row.some(c => norm(c).includes('CARTOUCHE')) || row.some(c => norm(c).includes('QUANTITE')))
  );
  const result = { items: [], unmatched: [], school: null, director: null, phone: null, date: null };
  if (headerIdx < 0) return result;

  const header = rows[headerIdx].map(c => norm(c));
  const col = (needle, fallback) => {
    const i = header.findIndex(h => h.includes(needle));
    return i >= 0 ? i : fallback;
  };
  const cModel = col('MODELE', 0);
  // Ancien bon de commande (2024-2025) : deux colonnes de références
  // (cartouche noire et cartouches couleur) + quantité en colonne I.
  const cBlack = header.findIndex(h => h.includes('CARTOUCHE NOIRE') || h.includes('CARTOUCHES NOIRE'));
  const cColor = header.findIndex(h => h.includes('CARTOUCHES COULEUR') || h.includes('CARTOUCHE COULEUR'));
  const legacy = cBlack >= 0 || cColor >= 0;
  const cCart = legacy ? -1 : col('CARTOUCHES', 1);
  const cSupplier = col('FOURNISSEUR', legacy ? 6 : 3);
  const cQty = col('QUANTITE', legacy ? 8 : 4);

  // Infos d'en-tête (école, directeur, téléphone, date)
  for (const row of rows.slice(0, headerIdx)) {
    const idx = row.findIndex(c => norm(c) === 'ECOLE');
    if (idx >= 0) {
      const typeCell = String(row[idx + 1] || '').trim();
      let name = String(row[idx + 2] || '').trim();
      // Le libellé de la colonne B est souvent le modèle générique
      // « Maternelle / Elémentaire * » : il ne faut pas en déduire le type.
      // On se fie d'abord au nom saisi dans la colonne C.
      let type = '';
      if (/MATERNELLE/i.test(name)) type = 'Maternelle';
      else if (/ELEMENTAIRE|PRIMAIRE/i.test(name)) type = 'Elémentaire';
      else if (/^MATERNELLE$/i.test(typeCell)) type = 'Maternelle';
      else if (/^(ELEMENTAIRE|ÉLÉMENTAIRE|PRIMAIRE)$/i.test(typeCell)) type = 'Elémentaire';
      // Le champ peut ne contenir que le type (« maternelle », « Elémentaire ») :
      // le nom de l'école sera alors déduit de l'expéditeur / du fichier.
      name = name.replace(/^\s*(maternelle|élémentaire|elementaire|primaire)\s*[\/\-–—:]?\s*/i, '').trim();
      result.school = { type, name };
    }
    const dIdx = row.findIndex(c => norm(c).includes('DIRECTEUR'));
    if (dIdx >= 0 && row[dIdx + 1]) result.director = String(row[dIdx + 1]).trim();
    const tIdx = row.findIndex(c => norm(c).startsWith('TEL'));
    if (tIdx >= 0 && row[tIdx + 1]) result.phone = String(row[tIdx + 1]).trim();
    const dateIdx = row.findIndex(c => norm(c).startsWith('DATE DE LA COMMANDE'));
    if (dateIdx >= 0 && row[dateIdx + 1]) result.date = toIsoDate(row[dateIdx + 1]);
  }

  const isPageCount = (v) => {
    const s = String(v || '').trim();
    return !s || s === "'" || /^\(?\s*\d[\d\s.]*\s*pages?\s*\)?$/i.test(s);
  };
  const pushItem = ({ model, cartridge, supplier, qty }) => {
    if (!model && !cartridge && !supplier) return;
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
      // Référence inconnue du catalogue : on la conserve malgré tout, elle
      // sera ajoutée au catalogue par l'appelant (commande réelle de l'école).
      const type_id = inferTypeId({ model, cartridge, supplier });
      result.items.push({
        catalog_id: null,
        type_id,
        article: cartridge || supplier || model,
        designation: model || 'Article commandé par école',
        code_fabricant: supplier || '',
        ref_commande: '',
        quantite: qty,
        model, cartridge, supplier,
        unmatched: true,
      });
      result.unmatched.push({ model, cartridge, supplier, quantite: qty, type_id });
    }
  };

  // Le modèle d'imprimante n'est saisi que sur la première ligne d'un groupe
  // (cellules fusionnées) : on le recopie vers le bas pour les lignes suivantes.
  let lastModel = '';
  for (const row of rows.slice(headerIdx + 1)) {
    // Le modèle figure sur la première ligne du groupe, souvent sans quantité :
    // on le mémorise avant de filtrer sur la quantité.
    const rowModel = String(row[cModel] || '').trim();
    if (rowModel) lastModel = rowModel;
    const qty = toQty(row[cQty]);
    if (!qty) continue;
    const model = rowModel || lastModel;
    const supplier = String(row[cSupplier] || '').trim();

    if (legacy) {
      // Une seule quantité par ligne, mais la référence peut être dans la
      // colonne « noire » ou dans la colonne « couleur » ; l'autre contient
      // le nombre de pages imprimées. On retient la ou les vraies références.
      const refs = [row[cBlack], row[cColor]]
        .map(v => String(v || '').trim())
        .filter(v => !isPageCount(v));
      if (!refs.length) continue;
      for (const cartridge of refs) {
        pushItem({ model, cartridge, supplier, qty });
      }
    } else {
      const cartridge = String(row[cCart] || '').trim();
      if (isPageCount(cartridge)) continue;
      pushItem({ model, cartridge, supplier, qty });
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
      const key = itemKey(it);
      const prev = out.items.find(x => itemKey(x) === key);
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

module.exports = { parseWorkbook, matchCatalog, inferTypeId, itemKey, norm, refKey };
