import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });
import { db } from '../lib/firebase-admin.js';

const search = process.argv.slice(2).join(' ').trim();

if (!search) {
  console.log('Penggunaan: node scripts/reset-teacher-pin.mjs <Nama Guru atau ID Guru>');
  console.log('Contoh: node scripts/reset-teacher-pin.mjs "Ahmad"');
  process.exit(0);
}

async function run() {
  const snap = await db.collection('teachers').get();
  const lower = search.toLowerCase();
  const matched = snap.docs.filter(d => {
    const data = d.data();
    return d.id.toLowerCase().includes(lower) || 
           (data.name && data.name.toLowerCase().includes(lower));
  });

  if (matched.length === 0) {
    console.log(`❌ Tidak ditemukan guru dengan kata kunci: "${search}"`);
    return;
  }

  for (const doc of matched) {
    const data = doc.data();
    await doc.ref.update({
      pinHash: null,
      pinConfigured: false,
      pinCreatedAt: null,
      updatedAt: new Date()
    });
    console.log(`✅ PIN guru "${data.name}" (${doc.id}) berhasil DIRESET.`);
    console.log('   Guru dapat membuat PIN baru saat login di web.');
  }
}

run().catch(console.error);
