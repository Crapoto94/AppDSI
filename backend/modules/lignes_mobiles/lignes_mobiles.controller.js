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

  // GET /api/lignes-mobiles/reconciliation
  // Rapproche les lignes SFR (hub_parc.lignes_mobiles) et les appareils mobiles
  // (hub_parc.mobilite_devices) par IMEI puis par n° de ligne, et liste tous les
  // désalignements, avec le détail des deux côtés + une recommandation d'action.
  reconciliation: async (req, res) => {
    try {
      const lignes = await pgDb.all(`
        SELECT id, numero_ligne, imei, nom, prenom, raison_sociale, forfait, type_offre,
               statut_ligne, date_mise_en_service, date_fin_engagement
        FROM hub_parc.lignes_mobiles`);
      const devices = await pgDb.all(`
        SELECT device_key, imei, numero_ligne, modele, type_appareil, famille,
               last_agent, last_service, last_direction, forfait, statut, is_actif,
               last_action_norm, last_date
        FROM hub_parc.mobilite_devices`);

      const digits = (s) => String(s || '').replace(/\D/g, '');
      const last10 = (s) => { const d = digits(s); return d.length > 10 ? d.slice(-10) : d; };
      const normName = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      const nameTokens = (s) => new Set(normName(s).split(' ').filter(t => t.length > 2));
      const ligneActive = (s) => /actif/i.test(s || '') && !/r[ée]sil|suspend|cl0tur|cl[oô]tur/i.test(s || '');
      const ligneCoupee = (s) => /r[ée]sil|suspend|cl[oô]tur/i.test(s || '');
      const deviceAttribue = (d) => d.statut === 'attribue' || d.statut === 'en_attribution' || (d.statut == null && d.is_actif === true);
      const isPhone = (d) => ['telephone', 'tablette'].includes((d.famille || '').toLowerCase());

      // Index des appareils par IMEI et par n° de ligne (normalisés)
      const devByImei = new Map();
      const devByNum = new Map();
      for (const d of devices) {
        const ki = digits(d.imei); if (ki) { (devByImei.get(ki) || devByImei.set(ki, []).get(ki)).push(d); }
        const kn = last10(d.numero_ligne); if (kn) { (devByNum.get(kn) || devByNum.set(kn, []).get(kn)).push(d); }
      }

      const items = [];
      const matchedKeys = new Set();
      const push = (type, severity, l, d, titre, action, extra = {}) => {
        items.push({
          type, severity, titre, action,
          numero_ligne: l ? l.numero_ligne : (d ? d.numero_ligne : null),
          imei: l ? l.imei : (d ? d.imei : null),
          sfr: l ? { id: l.id, numero_ligne: l.numero_ligne, imei: l.imei, titulaire: [l.nom, l.prenom].filter(Boolean).join(' ') || l.raison_sociale, forfait: l.forfait, type_offre: l.type_offre, statut_ligne: l.statut_ligne, date_mise_en_service: l.date_mise_en_service, date_fin_engagement: l.date_fin_engagement } : null,
          device: d ? { device_key: d.device_key, imei: d.imei, numero_ligne: d.numero_ligne, modele: d.modele, famille: d.famille, agent: d.last_agent, service: d.last_service, direction: d.last_direction, forfait: d.forfait, statut: d.statut, is_actif: d.is_actif, derniere_action: d.last_action_norm, last_date: d.last_date } : null,
          ...extra,
        });
      };

      for (const l of lignes) {
        const ki = digits(l.imei);
        const kn = last10(l.numero_ligne);
        const byImei = ki ? devByImei.get(ki) : null;
        const byNum = kn ? devByNum.get(kn) : null;
        const d = (byImei && byImei[0]) || (byNum && byNum[0]) || null;

        if (!d) {
          // Aucun appareil rapproché. Une ligne sans IMEI = probablement une SIM data/clé 4G.
          const hasImei = !!ki;
          const dataLike = /data|internet|m2m|modem/i.test(`${l.type_offre} ${l.forfait}`);
          push('ligne_sans_appareil',
            hasImei ? 'high' : (dataLike ? 'low' : 'medium'),
            l, null,
            hasImei ? 'Ligne avec terminal SFR introuvable dans le parc mobilité'
                    : 'Ligne SFR sans appareil rapproché',
            hasImei ? "Créer/importer l'appareil dans le parc mobilité ou vérifier l'IMEI."
                    : (dataLike ? 'Ligne data/SIM seule — vérifier si un suivi d\'appareil est nécessaire.'
                                : 'Identifier l\'appareil porteur de cette ligne et le rattacher.'));
          continue;
        }
        matchedKeys.add(d.device_key);

        // IMEI / numéro divergents (le rapprochement a réussi par une clé mais pas l'autre)
        if (ki && digits(d.imei) && ki !== digits(d.imei)) {
          push('imei_divergent', 'medium', l, d,
            'IMEI différent entre SFR et le parc pour ce numéro',
            'Le numéro est associé à un autre terminal côté parc : vérifier un changement de téléphone / SIM swap.');
        }
        if (kn && last10(d.numero_ligne) && kn !== last10(d.numero_ligne)) {
          push('numero_divergent', 'medium', l, d,
            'N° de ligne différent entre SFR et le parc pour cet IMEI',
            'Le terminal porte un autre numéro côté parc : mettre à jour le n° de ligne de l\'appareil.');
        }

        // Statuts croisés ligne ↔ appareil
        if (ligneActive(l.statut_ligne) && !deviceAttribue(d)) {
          push('ligne_active_appareil_non_attribue', 'medium', l, d,
            'Forfait SFR actif mais appareil non attribué',
            `Appareil « ${d.statut || 'non en service'} » alors que la ligne est facturée : réattribuer l'appareil ou résilier/suspendre la ligne.`);
        }
        if (ligneCoupee(l.statut_ligne) && deviceAttribue(d)) {
          push('ligne_coupee_appareil_attribue', 'high', l, d,
            'Appareil en service sur une ligne résiliée/suspendue',
            'L\'agent utilise un appareil dont la ligne est coupée : réactiver la ligne ou récupérer l\'appareil.');
        }

        // Titulaire SFR ↔ agent parc
        const sfrName = [l.nom, l.prenom].filter(Boolean).join(' ') || l.raison_sociale;
        if (sfrName && d.last_agent) {
          const a = nameTokens(sfrName), b = nameTokens(d.last_agent);
          const inter = [...a].some(t => b.has(t));
          if (a.size && b.size && !inter) {
            push('titulaire_divergent', 'low', l, d,
              'Titulaire SFR différent de l\'agent affecté dans le parc',
              'Vérifier qui détient réellement la ligne/l\'appareil (mutation, prêt, erreur de saisie).');
          }
        }

        // Forfait divergent
        if (l.forfait && d.forfait && normName(l.forfait) !== normName(d.forfait)) {
          push('forfait_divergent', 'low', l, d,
            'Forfait différent entre SFR et le parc',
            'Aligner le forfait enregistré sur l\'appareil avec celui facturé par SFR.');
        }
      }

      // Appareils mobiles sans ligne SFR rapprochée
      for (const d of devices) {
        if (matchedKeys.has(d.device_key)) continue;
        if (!isPhone(d)) continue; // on ignore les non-téléphones (autres familles)
        push('appareil_sans_ligne', deviceAttribue(d) ? 'medium' : 'low', null, d,
          'Appareil mobile sans ligne SFR connue',
          deviceAttribue(d) ? 'Appareil attribué sans forfait SFR rapproché : vérifier la ligne associée (autre opérateur ? IMEI/numéro manquant côté SFR ?).'
                            : 'Appareil sans ligne — normal s\'il est en stock/sorti ; sinon rattacher une ligne.');
      }

      const order = { high: 0, medium: 1, low: 2 };
      items.sort((a, b) => (order[a.severity] - order[b.severity]) || a.type.localeCompare(b.type));

      const counts = {};
      for (const it of items) counts[it.type] = (counts[it.type] || 0) + 1;
      const bySeverity = { high: 0, medium: 0, low: 0 };
      for (const it of items) bySeverity[it.severity]++;

      res.json({
        summary: {
          total_lignes: lignes.length,
          total_appareils: devices.length,
          appareils_rapproches: matchedKeys.size,
          total_desalignements: items.length,
          par_type: counts,
          par_gravite: bySeverity,
        },
        items,
      });
    } catch (error) {
      console.error('[lignes-mobiles] reconciliation error:', error.message);
      res.status(500).json({ message: 'Erreur lors du rapprochement', error: error.message });
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
