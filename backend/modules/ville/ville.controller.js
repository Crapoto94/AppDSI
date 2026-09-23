const { pgDb } = require('../../shared/database');
const { logMouchard } = require('../../shared/utils');
const VilleService = require('./ville.service');

// Normalise les délégations d'un·e élu·e en tableau de chaînes. Accepte un tableau
// ou un texte : sur le site de la ville, les délégations sont séparées par des points.
function normalizeDelegations(input) {
  let parts = [];
  if (Array.isArray(input)) parts = input;
  else if (typeof input === 'string') parts = input.split(/\.\s+|\.$/);
  return parts.map(s => String(s || '').trim().replace(/\.+$/, '')).filter(Boolean);
}
const delegationsToText = (arr) => arr.join(' ; ');

// Sexe (M/F) déduit d'un libellé de fonction (ex. « Adjointe » → F) ou, à défaut, du prénom.
function deduceSexe(fonction, prenom) {
  if (/(?:Adjointe|Conseillère|Présidente|Mairesse|Maire adjointe)/i.test(fonction || '')) return 'F';
  if (/(?:Adjoint|Conseiller|Maire)/i.test(fonction || '')) return 'M';
  return /(?:e|a|ie|ine|ette|elle|enne)$/i.test(String(prenom || '').trim()) ? 'F' : 'M';
}
const sexeToCivilite = (sexe) => (sexe === 'F' ? 'Mme' : sexe === 'M' ? 'M.' : null);

// Féminise / masculinise un rôle selon le sexe (Maire reste invariable).
function genderRole(role, sexe) {
  const r = String(role || '').trim();
  const f = sexe === 'F';
  if (/^Adjoint/i.test(r) || /^Adjointe/i.test(r)) return f ? 'Adjointe' : 'Adjoint';
  if (/^Conseill/i.test(r)) return f ? 'Conseillère municipale' : 'Conseiller municipal';
  if (/^Maire/i.test(r)) return 'Maire';
  return r;
}

module.exports = {
  // Onglet Général
  getConfig: async (req, res) => {
    try {
      const config = await pgDb.get('SELECT * FROM hub.ville_config LIMIT 1');
      res.json(config || { nom: '', code_postal: '' });
    } catch (error) {
      res.status(500).json({ message: 'Erreur récupération config', error: error.message });
    }
  },

  updateConfig: async (req, res) => {
    try {
      const { nom, code_postal } = req.body;
      const existing = await pgDb.get('SELECT id FROM hub.ville_config LIMIT 1');

      if (existing) {
        await pgDb.run(
          'UPDATE hub.ville_config SET nom = ?, code_postal = ?, updated_at = NOW() WHERE id = ?',
          [nom, code_postal, existing.id]
        );
      } else {
        await pgDb.run(
          'INSERT INTO hub.ville_config (nom, code_postal) VALUES (?, ?)',
          [nom, code_postal]
        );
      }
      logMouchard(`Config ville mise à jour: ${nom} (${code_postal})`);
      res.json({ message: 'Config mise à jour' });
    } catch (error) {
      res.status(500).json({ message: 'Erreur mise à jour config', error: error.message });
    }
  },

  // Onglet Élus
  getElus: async (req, res) => {
    try {
      const elus = await pgDb.all('SELECT * FROM hub.elus ORDER BY nom, prenom');
      // `delegations` (JSONB) est renvoyé tel quel ; repli sur l'ancien champ texte
      // `delegation` (séparé par des points) s'il est vide.
      const normalized = elus.map(e => {
        let delegations = Array.isArray(e.delegations) ? e.delegations : [];
        if (delegations.length === 0 && e.delegation) delegations = normalizeDelegations(e.delegation);
        return { ...e, delegations };
      });
      res.json(normalized);
    } catch (error) {
      res.status(500).json({ message: 'Erreur récupération élus', error: error.message });
    }
  },

  createElu: async (req, res) => {
    try {
      const { civilite, sexe, nom, prenom, email, telephone, role, liste, delegation, delegations } = req.body;
      if (!nom || !prenom || !role) {
        return res.status(400).json({ message: 'Champs requis: nom, prenom, role' });
      }
      const delArr = normalizeDelegations(delegations != null ? delegations : delegation);
      const sexeVal = sexe || deduceSexe(role, prenom);
      const civiliteVal = civilite || sexeToCivilite(sexeVal);
      const roleVal = genderRole(role, sexeVal);

      const result = await pgDb.run(
        `INSERT INTO hub.elus (civilite, sexe, nom, prenom, email, telephone, role, liste, delegation, delegations)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [civiliteVal || null, sexeVal || null, nom, prenom, email || null, telephone || null,
         roleVal, liste || null, delegationsToText(delArr) || null, JSON.stringify(delArr)]
      );
      logMouchard(`Élu créé: ${prenom} ${nom}`);
      res.status(201).json({ id: result.lastID, civilite: civiliteVal, sexe: sexeVal, nom, prenom, email, telephone, role: roleVal, liste, delegations: delArr });
    } catch (error) {
      res.status(500).json({ message: 'Erreur création élu', error: error.message });
    }
  },

  updateElu: async (req, res) => {
    try {
      const { id } = req.params;
      const { civilite, sexe, nom, prenom, email, telephone, role, liste, delegation, delegations } = req.body;
      const delArr = normalizeDelegations(delegations != null ? delegations : delegation);
      const sexeVal = sexe || deduceSexe(role, prenom);
      const civiliteVal = civilite || sexeToCivilite(sexeVal);
      const roleVal = genderRole(role, sexeVal);
      await pgDb.run(
        `UPDATE hub.elus SET civilite = ?, sexe = ?, nom = ?, prenom = ?, email = ?, telephone = ?,
                             role = ?, liste = ?, delegation = ?, delegations = ?, updated_at = NOW()
         WHERE id = ?`,
        [civiliteVal || null, sexeVal || null, nom, prenom, email || null, telephone || null,
         roleVal, liste || null, delegationsToText(delArr) || null, JSON.stringify(delArr), id]
      );
      logMouchard(`Élu modifié: ${prenom} ${nom}`);
      res.json({ message: 'Élu mis à jour' });
    } catch (error) {
      res.status(500).json({ message: 'Erreur mise à jour élu', error: error.message });
    }
  },

  deleteElu: async (req, res) => {
    try {
      const { id } = req.params;
      const elu = await pgDb.get('SELECT * FROM hub.elus WHERE id = ?', [id]);
      if (!elu) return res.status(404).json({ message: 'Élu non trouvé' });
      await pgDb.run('DELETE FROM hub.elus WHERE id = ?', [id]);
      logMouchard(`Élu supprimé: ${elu.prenom} ${elu.nom}`);
      res.json({ message: 'Élu supprimé' });
    } catch (error) {
      res.status(500).json({ message: 'Erreur suppression élu', error: error.message });
    }
  },

  importElus: async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'Aucun fichier envoyé' });

      const XLSX = require('xlsx');
      const fs = require('fs');
      const workbook = XLSX.readFile(req.file.path, { cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      // Nettoyer le fichier temporaire
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

      // Ligne 0 = en-tête, données à partir de ligne 1
      const dataRows = rows.slice(1).filter(r => r[0] && r[1] && r[2] && r[3]);

      // Supprimer tous les élus existants
      await pgDb.run('DELETE FROM hub.elus');

      let imported = 0;
      for (const row of dataRows) {
        const liste = String(row[0] || '').trim();
        const nomPrenom = String(row[1] || '').trim();
        const email = String(row[2] || '').trim();
        const fonction = String(row[3] || '').trim();
        const telephone = String(row[4] || '').trim();

        // Split "NOM Prénom" en nom et prenom
        const parts = nomPrenom.split(/\s+/);
        const idx = parts.findIndex(p => /^[A-Z][a-zà-öø-ÿéèêëîïôöùûüç]/.test(p));
        const nom = idx > 0 ? parts.slice(0, idx).join(' ') : parts[0] || '';
        const prenom = idx > 0 ? parts.slice(idx).join(' ') : parts.slice(1).join(' ') || '';

        // Normaliser le rôle
        let role = 'Conseiller municipal';
        if (fonction.toLowerCase().includes('maire')) role = 'Maire';
        else if (fonction.toLowerCase().includes('adjoint')) role = 'Adjoint';

        // Sexe déduit du libellé de fonction (ex. « Adjointe » → F), à défaut du prénom.
        const sexe = deduceSexe(fonction, prenom);
        const civilite = sexeToCivilite(sexe);
        role = genderRole(role, sexe);

        await pgDb.run(
          `INSERT INTO hub.elus (civilite, sexe, nom, prenom, email, telephone, role, liste, delegation, delegations)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [civilite, sexe, nom.toUpperCase(), prenom, email || null, telephone || null, role, liste || null, null, '[]']
        );
        imported++;
      }

      logMouchard(`Import élus Excel: ${imported} importés`);
      res.json({ message: `${imported} élu(s) importés`, imported });
    } catch (error) {
      res.status(500).json({ message: 'Erreur import élus', error: error.message });
    }
  },

  // Onglet Sites
  getSitesList: async (req, res) => {
    try {
      const sites = await pgDb.all(
        'SELECT id, code_bien, nom, abbreviation, categorie FROM hub.sites WHERE is_active = true ORDER BY code_bien'
      );
      res.json(sites);
    } catch (error) {
      res.status(500).json({ message: 'Erreur récupération sites', error: error.message });
    }
  },

  getSites: async (req, res) => {
    try {
      const sites = await pgDb.all(
        'SELECT *, COALESCE(geocoded_manually, false) AS geocoded_manually FROM hub.sites ORDER BY nom'
      );
      res.json(sites);
    } catch (error) {
      res.status(500).json({ message: 'Erreur récupération sites', error: error.message });
    }
  },

  importSites: async (req, res) => {
    try {
      console.log('[CONTROLLER] Requête import reçue');
      console.log('[CONTROLLER] Fichier:', req.file ? `${req.file.filename} (${req.file.size} bytes)` : 'AUCUN');

      if (!req.file) {
        console.log('[CONTROLLER] ERREUR: Aucun fichier');
        return res.status(400).json({ message: 'Aucun fichier envoyé' });
      }

      console.log('[CONTROLLER] Appel service import:', req.file.path);
      const result = await VilleService.importSitesFromExcel(req.file.path);

      console.log('[CONTROLLER] Import réussi:', result);
      logMouchard(`Import sites Excel: ${result.imported} importés, ${result.updated} mis à jour`);
      res.json(result);
    } catch (error) {
      console.error('[CONTROLLER] ERREUR import:', error.message);
      res.status(500).json({ message: 'Erreur import sites', error: error.message });
    }
  },

  updateSite: async (req, res) => {
    try {
      const { id } = req.params;
      const { nom, adresse, is_active } = req.body;
      await pgDb.run(
        'UPDATE hub.sites SET nom = ?, adresse = ?, is_active = ?, updated_at = NOW() WHERE id = ?',
        [nom, adresse, is_active, id]
      );
      res.json({ message: 'Site mis à jour' });
    } catch (error) {
      res.status(500).json({ message: 'Erreur mise à jour site', error: error.message });
    }
  },

  saveGeocode: async (req, res) => {
    try {
      const { id } = req.params;
      const { lat, lng, manual = false } = req.body;
      await pgDb.run(
        'UPDATE hub.sites SET lat = ?, lng = ?, geocoded_manually = ?, updated_at = NOW() WHERE id = ?',
        [lat, lng, !!manual, id]
      );
      res.json({ ok: true, geocoded_manually: !!manual });
    } catch (error) {
      res.status(500).json({ message: 'Erreur sauvegarde géocodage', error: error.message });
    }
  },

  // Onglet Écoles
  getEcoles: async (req, res) => {
    try {
      const ecoles = await pgDb.all('SELECT * FROM hub.ecoles ORDER BY nom');
      res.json(ecoles);
    } catch (error) {
      res.status(500).json({ message: 'Erreur récupération écoles', error: error.message });
    }
  },

  createEcole: async (req, res) => {
    try {
      const { nom, adresse, code_postal, email, telephone, directeur } = req.body;
      if (!nom) return res.status(400).json({ message: 'Nom requis' });

      const result = await pgDb.run(
        'INSERT INTO hub.ecoles (nom, adresse, code_postal, email, telephone, directeur) VALUES (?, ?, ?, ?, ?, ?)',
        [nom, adresse || null, code_postal || null, email || null, telephone || null, directeur || null]
      );
      logMouchard(`École créée: ${nom}`);
      res.status(201).json({ id: result.lastID, nom, adresse, code_postal, email, telephone, directeur });
    } catch (error) {
      res.status(500).json({ message: 'Erreur création école', error: error.message });
    }
  },

  updateEcole: async (req, res) => {
    try {
      const { id } = req.params;
      const { nom, adresse, code_postal, email, telephone, directeur } = req.body;
      await pgDb.run(
        'UPDATE hub.ecoles SET nom = ?, adresse = ?, code_postal = ?, email = ?, telephone = ?, directeur = ?, updated_at = NOW() WHERE id = ?',
        [nom, adresse || null, code_postal || null, email || null, telephone || null, directeur || null, id]
      );
      logMouchard(`École modifiée: ${nom}`);
      res.json({ message: 'École mise à jour' });
    } catch (error) {
      res.status(500).json({ message: 'Erreur mise à jour école', error: error.message });
    }
  },

  deleteEcole: async (req, res) => {
    try {
      const { id } = req.params;
      const ecole = await pgDb.get('SELECT * FROM hub.ecoles WHERE id = ?', [id]);
      if (!ecole) return res.status(404).json({ message: 'École non trouvée' });
      await pgDb.run('DELETE FROM hub.ecoles WHERE id = ?', [id]);
      logMouchard(`École supprimée: ${ecole.nom}`);
      res.json({ message: 'École supprimée' });
    } catch (error) {
      res.status(500).json({ message: 'Erreur suppression école', error: error.message });
    }
  }
};
