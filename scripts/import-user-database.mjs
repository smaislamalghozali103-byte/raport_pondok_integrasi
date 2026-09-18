import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../lib/firebase-admin.js';

const root = process.cwd();
const schoolYear = process.env.SCHOOL_YEAR || '2026-2027';

console.log('🚀 Memulai Impor Database Pengguna (Kelas, Siswa, Mapel) ke Database...');

const masterKelasPath = path.join(root, 'data', 'master-kelas.json');
const masterSiswaPath = path.join(root, 'data', 'master-siswa.json');
const masterMapelPath = path.join(root, 'data', 'master-mapel.json');

if (!fs.existsSync(masterKelasPath) || !fs.existsSync(masterSiswaPath) || !fs.existsSync(masterMapelPath)) {
  throw new Error('File master data JSON tidak lengkap di direktori data/. Pastikan master-kelas.json, master-siswa.json, dan master-mapel.json ada.');
}

const rawKelas = JSON.parse(fs.readFileSync(masterKelasPath, 'utf8'));
const rawSiswa = JSON.parse(fs.readFileSync(masterSiswaPath, 'utf8'));
const rawMapel = JSON.parse(fs.readFileSync(masterMapelPath, 'utf8'));

const kelasList = rawKelas.kelas || [];
const siswaList = rawSiswa.siswa || [];
const mapelList = rawMapel.mapel || [];

console.log(`📦 Data terbaca: ${kelasList.length} kelas, ${siswaList.length} siswa, ${mapelList.length} mata pelajaran.`);

async function batchWrite(collectionName, items) {
  console.log(`⏳ Menyimpan ${items.length} data ke koleksi '${collectionName}'...`);
  for (let i = 0; i < items.length; i += 300) {
    const chunk = items.slice(i, i + 300);
    const batch = db.batch();
    for (const item of chunk) {
      const ref = db.collection(collectionName).doc(item.id);
      batch.set(ref, item.data, { merge: true });
    }
    await batch.commit();
  }
  console.log(`✅ Sukses menyimpan '${collectionName}'.`);
}

// 1. Simpan Units
const unitsData = [
  { id: 'SMP', data: { id: 'SMP', code: 'SMP', name: 'SMP Islam Al Ghozali', status: 'AKTIF' } },
  { id: 'SMA', data: { id: 'SMA', code: 'SMA', name: 'SMA Islam Al Ghozali', status: 'AKTIF' } },
];
await batchWrite('units', unitsData);

// 2. Simpan 32 Kelas
const classesData = kelasList.map(k => {
  const name = k.nama_kelas;
  const isSmp = /^[123][A-Za-z]/.test(name) && !name.includes('INT');
  const unit = isSmp ? 'SMP' : 'SMA';
  return {
    id: name,
    data: {
      id: name,
      code: name,
      name: name,
      jenjang: unit,
      unit: unit,
      unitId: unit,
      jumlah_siswa: k.jumlah_siswa || 0,
      schoolYear,
      status: 'AKTIF',
      spreadsheetId: '',
      spreadsheetSheet: 'Rekap',
      updatedAt: new Date().toISOString()
    }
  };
});
await batchWrite('classes', classesData);

// 3. Simpan 328 Mata Pelajaran
const mapelData = mapelList.map(m => {
  const id = m.kode_mapel;
  return {
    id,
    data: {
      id,
      code: m.kode_mapel || id,
      name: m.nama_mapel,
      kelompokKelas: m.kelompok_kelas,
      unit: m.unit || '',
      unitId: m.unit || '',
      status: m.status || 'AKTIF',
      updatedAt: new Date().toISOString()
    }
  };
});
await batchWrite('subjects', mapelData);

// 4. Simpan 625 Siswa
const siswaData = siswaList.map((s, idx) => {
  const sId = s.id_siswa || `S${String(idx + 1).padStart(4, '0')}`;
  return {
    id: sId,
    data: {
      id: sId,
      studentId: sId,
      no: s.no || (idx + 1),
      classId: s.kelas,
      className: s.kelas,
      schoolYear,
      name: s.nama_siswa,
      fullName: s.nama_siswa,
      nisn: s.nisn || '',
      nis: s.nisn || '',
      sumberSheet: s.sumber_sheet || '',
      status: s.status || 'AKTIF',
      updatedAt: new Date().toISOString()
    }
  };
});
await batchWrite('students', siswaData);

console.log('\n=============================================================');
console.log('🎉 SEMUA DATA DATABASE BERHASIL DIMASUKKAN KE APLIKASI:');
console.log(`- Total Kelas: ${classesData.length}`);
console.log(`- Total Santri: ${siswaData.length}`);
console.log(`- Total Mata Pelajaran: ${mapelData.length}`);
console.log('=============================================================\n');
