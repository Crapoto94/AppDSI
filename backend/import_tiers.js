const xlsx = require('xlsx');
const path = require('path');
const setupDb = require('./db');

async function importTiers() {
    const db = await setupDb();
    const filePath = path.join(__dirname, '../Liste_des_tiers.xls');
    
    try {
        const wb = xlsx.readFile(filePath);
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet);
        
        console.log(`Importation de ${data.length} tiers...`);
        
        let imported = 0;
        let errors = 0;

        for (const row of data) {
            try {
                await db.run(`
                    INSERT OR REPLACE INTO tiers (
                        code, nom, activite, siret, adresse, banque, guichet, 
                        compte, cle_rib, date_creation, telephone, fax, 
                        tva_intra, email, origine
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    row['Code'],
                    row['Nom'] ? row['Nom'].trim() : null,
                    row['Activité'],
                    row['SIRET'],
                    row['Adresse (Usuelle)'],
                    row['Banque'],
                    row['Guichet'],
                    row['N° compte'],
                    row['Clé RIB'],
                    row['Date de création'],
                    row['Téléphone'],
                    row['Fax'],
                    row['Tva Intra'],
                    row['Email'],
                    row['Origine']
                ]);
                imported++;
            } catch (err) {
                console.error(`Erreur pour le tiers ${row['Code']}:`, err.message);
                errors++;
            }
        }
        
        console.log(`Import terminé: ${imported} tiers importés, ${errors} erreurs.`);
    } catch (err) {
        console.error('Erreur lors de la lecture du fichier:', err.message);
    } finally {
        await db.close();
    }
}

importTiers();
