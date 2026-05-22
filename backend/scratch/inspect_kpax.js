const XLSX = require('xlsx');
const workbook = XLSX.readFile('c:/dev/AppDSI/KPAX.xlsx');
const ws = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
console.log('First 5 rows:');
console.log(rows.slice(0, 5));
