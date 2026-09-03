import XLSX from 'xlsx';
import path from 'node:path';

const file = path.join(process.cwd(), 'data', 'MASTER_GURU_MAPEL_PER_UNIT_HASIL_REKAP(1).xlsx');
const wb = XLSX.readFile(file);
console.log('Sheet Names in Excel:');
console.log(wb.SheetNames);

for (const name of wb.SheetNames) {
  const sheet = wb.Sheets[name];
  const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`\n--- Sheet: "${name}" (${json.length} rows) ---`);
  if (json.length > 0) {
    console.log('Header:', json[0]);
    if (json.length > 1) console.log('Sample row 1:', json[1]);
  }
}
