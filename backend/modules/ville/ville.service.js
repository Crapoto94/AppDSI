const ExcelJS = require('exceljs');
const { pgDb } = require('../../shared/database');

module.exports = {
  importSitesFromExcel: async (filePath) => {
    try {
      console.log('[IMPORT] Début import fichier:', filePath);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) throw new Error('Aucune feuille trouvée');

      console.log('[IMPORT] Feuille trouvée, rowCount:', worksheet.rowCount);

      // Les en-têtes sont à la ligne 17
      // Les données commencent à la ligne 18
      const headerRowNum = 17;
      const dataStartRowNum = 18;

      let imported = 0;
      let updated = 0;
      let errors = [];
      let disabledCount = 0;
      let importedSites = [];

      console.log(`[IMPORT] Parcours des lignes ${dataStartRowNum} à ${worksheet.rowCount}`);

      // Parcourir les données
      const maxRows = Math.min(worksheet.rowCount, dataStartRowNum + 1000);
      for (let rowNum = dataStartRowNum; rowNum <= maxRows; rowNum++) {
        try {
          const row = worksheet.getRow(rowNum);

          // Récupérer les valeurs selon la vraie structure
          const codeCell = row.getCell(1); // A: Code du Bien
          const designCell = row.getCell(2); // B: Désignation du bien
          const categorieCell = row.getCell(3); // C: Désignation catégorie
          const abbreviationCell = row.getCell(4); // D: Abréviation
          const nueCell = row.getCell(5); // E: N° dans la rue
          const bisterCell = row.getCell(6); // F: Bis/Ter
          const rueCell = row.getCell(7); // G: Nom de la rue

          const codeBien = String(codeCell.value || '').trim();
          const designation = String(designCell.value || '').trim();
          const categorie = String(categorieCell.value || '').trim();
          const abbreviation = String(abbreviationCell.value || '').trim();

          // Construire l'adresse: concaténer N° Bis/Ter Rue
          const numero = String(nueCell.value || '').trim();
          const bister = String(bisterCell.value || '').trim();
          const rue = String(rueCell.value || '').trim();

          let adresse = '';
          if (numero) adresse += numero;
          if (bister) adresse += (adresse ? ' ' : '') + bister;
          if (rue) adresse += (adresse ? ' ' : '') + rue;

          if (!codeBien || !designation) {
            if (rowNum === dataStartRowNum || rowNum === dataStartRowNum + 1) {
              console.log(`[IMPORT] Ligne ${rowNum} vide ou sans code`);
            }
            continue;
          }

          if (rowNum <= dataStartRowNum + 5) {
            console.log(`[IMPORT] Ligne ${rowNum}: "${codeBien}" - "${designation}" @ "${adresse}"`);
          }

          // Détecter le strikethrough (texte barré)
          const hasStrike = codeCell.font?.strike || designCell.font?.strike;
          const is_active = !hasStrike;

          if (hasStrike) {
            disabledCount++;
          }

          // Chercher si ce site existe déjà par code
          const existing = await pgDb.get(
            'SELECT id FROM hub.sites WHERE code_bien = ?',
            [codeBien]
          );

          if (existing) {
            await pgDb.run(
              'UPDATE hub.sites SET nom = ?, categorie = ?, abbreviation = ?, adresse = ?, is_active = ?, updated_at = NOW() WHERE id = ?',
              [designation, categorie, abbreviation, adresse, is_active, existing.id]
            );
            updated++;
          } else {
            await pgDb.run(
              'INSERT INTO hub.sites (code_bien, nom, categorie, abbreviation, adresse, is_active) VALUES (?, ?, ?, ?, ?, ?)',
              [codeBien, designation, categorie, abbreviation, adresse, is_active]
            );
            imported++;
            importedSites.push({
              code: codeBien,
              designation,
              categorie,
              adresse,
              disabled: hasStrike
            });
          }
        } catch (error) {
          errors.push(`Ligne ${rowNum}: ${error.message}`);
        }
      }

      console.log(`[IMPORT] Terminé: ${imported} importés, ${updated} mis à jour, ${disabledCount} désactivés`);
      if (errors.length > 0) {
        console.log('[IMPORT] Erreurs:', errors.slice(0, 5));
      }

      return {
        message: `Import réussi: ${imported} importé(s), ${updated} mis à jour, ${disabledCount} désactivé(s)`,
        imported,
        updated,
        disabled: disabledCount,
        errors: errors.slice(0, 10),
        total: imported + updated,
        sites: importedSites
      };
    } catch (error) {
      console.error('[IMPORT] Erreur:', error.message, error.stack);
      throw new Error(`Erreur analyse Excel: ${error.message}`);
    }
  }
};
