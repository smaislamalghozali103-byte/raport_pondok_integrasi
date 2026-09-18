import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

const root = process.cwd();
const dataDir = path.join(root, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// We will write master-kelas.json, master-siswa.json, and master-mapel.json
console.log('Importer initialized.');
