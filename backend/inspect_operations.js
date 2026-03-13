const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'opérations.xlsx');
const workbook = xlsx.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet);

console.log('Headers:', Object.keys(data[0] || {}));
console.log('Sample data (first 2 rows):', JSON.stringify(data.slice(0, 2), null, 2));
console.log('Total rows:', data.length);
