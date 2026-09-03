import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const targetDir = path.join(root, 'SIAP_UPLOAD_GITHUB');

// Hapus targetDir jika sudah ada, lalu buat baru
if (fs.existsSync(targetDir)) {
  fs.rmSync(targetDir, { recursive: true, force: true });
}
fs.mkdirSync(targetDir, { recursive: true });

// Daftar item yang aman dan wajib di-upload ke GitHub
const itemsToCopy = [
  'app',
  'lib',
  'public',
  'scripts',
  'data',
  'package.json',
  'package-lock.json',
  'middleware.js',
  'vercel.json',
  'firestore.rules',
  'firestore.indexes.json',
  '.env.example',
  '.gitignore',
  'README.md',
  'V16.0_SETUP.md'
];

for (const item of itemsToCopy) {
  const src = path.join(root, item);
  const dest = path.join(targetDir, item);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true });
    console.log(`[OK] Disalin: ${item}`);
  }
}

// Pastikan file rahasia sama sekali TIDAK ADA di targetDir
const forbidden = ['.env', '.env.local', 'service-account.json'];
for (const f of forbidden) {
  const check = path.join(targetDir, f);
  if (fs.existsSync(check)) {
    fs.rmSync(check, { force: true });
  }
}

console.log('\n✅ Folder SIAP_UPLOAD_GITHUB berhasil dibuat dengan bersih dan aman!');
console.log(`Lokasi folder: ${targetDir}`);
