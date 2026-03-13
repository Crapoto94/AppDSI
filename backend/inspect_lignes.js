const xlsx = require('xlsx');
const path = require('path');

try {
    const wb = xlsx.readFile(path.join(__dirname, '../lignes.xls'));
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);
    if (data.length > 0) {
        console.log('Colonnes de lignes.xls:', JSON.stringify(Object.keys(data[0])));
    } else {
        console.log('Fichier vide');
    }
} catch (e) {
    console.error('Erreur:', e.message);
}
