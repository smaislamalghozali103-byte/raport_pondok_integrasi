import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const appDir = path.join(rootDir, 'app');

function walk(dir) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walk(full));
    } else if (/\.(js|jsx|ts|tsx|mjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const allFiles = [...walk(appDir), path.join(rootDir, 'middleware.js')].filter(f => fs.existsSync(f));

let modifiedCount = 0;

for (const file of allFiles) {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Ubah semua variasi relative path ke /lib/ menjadi @/lib/
  // Contoh: '../../../../lib/xxx' atau '../../../../../lib/xxx' atau './lib/xxx'
  content = content.replace(/(['"])(\.\.\/)+lib\//g, '$1@/lib/');
  content = content.replace(/(['"])\.\/lib\//g, '$1@/lib/');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    modifiedCount++;
    console.log(`[FIXED] ${path.relative(rootDir, file)}`);
  }
}

console.log(`\n✅ Selesai! Berhasil menstandarkan import pada ${modifiedCount} file.`);
