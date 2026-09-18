import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

console.log('✅ Master data directory verified at:', dataDir);
const files = fs.readdirSync(dataDir);
console.log('Files present:', files);
