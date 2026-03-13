const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function updateM57Labels() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    console.log('Mise à jour des libellés M57...');

    const mapping = {
        '2031': 'Frais d\'études',
        '2051': 'Concessions et droits similaires, brevets, licences',
        '2183': 'Matériel de bureau et matériel informatique',
        '2184': 'Mobilier',
        '2188': 'Autres immobilisations corporelles',
        '60632': 'Fournitures de petit équipement',
        '60636': 'Vêtements de travail',
        '6064': 'Fournitures administratives',
        '6068': 'Autres fournitures',
        '611': 'Contrats de prestations de services',
        '6135': 'Locations mobilières',
        '6156': 'Maintenance',
        '6188': 'Autres frais divers',
        '6226': 'Honoraires',
        '6231': 'Annonces et insertions',
        '6251': 'Voyages et déplacements',
        '6283': 'Frais de nettoyage des locaux',
        '6288': 'Autres services extérieurs'
    };

    for (const [code, label] of Object.entries(mapping)) {
        await db.run('UPDATE m57_plan SET label = ? WHERE code = ?', [label, code]);
        // Also update orders if they have this nature code but generic label
        await db.run('UPDATE orders SET "Libellé" = ? WHERE "Article par nature" = ? AND ("Libellé" IS NULL OR "Libellé" = "" OR "Libellé" = "Sans libellé")', [label, code]);
    }

    console.log('Mise à jour terminée.');
    await db.close();
}

updateM57Labels().catch(console.error);
