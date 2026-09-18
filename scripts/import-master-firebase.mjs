import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { db } from '../lib/firebase-admin.js';

const root = process.cwd();
const file = process.env.MASTER_XLSX || path.join(root, 'data', 'MASTER_GURU_MAPEL_PER_UNIT_HASIL_REKAP(1).xlsx');
const schoolYear = process.env.SCHOOL_YEAR || '2026-2027';

if (!fs.existsSync(file)) throw new Error(`File master tidak ditemukan: ${file}`);
const wb = XLSX.readFile(file, { cellDates: false });
const rows = s => wb.Sheets[s] ? XLSX.utils.sheet_to_json(wb.Sheets[s], { defval: null }) : [];

const pick = (o, names) => {
  for (const n of names) {
    if (o[n] != null && String(o[n]).trim()) return String(o[n]).trim();
  }
  const w = names.map(x => x.toLowerCase());
  for (const [k, v] of Object.entries(o)) {
    if (v != null && w.includes(String(k).trim().toLowerCase())) return String(v).trim();
  }
  return '';
};
const norm = s => String(s ?? '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');

async function writeCollection(name, items) {
  for (let i = 0; i < items.length; i += 350) {
    const b = db.batch();
    for (const x of items.slice(i, i + 350)) {
      b.set(db.collection(name).doc(x.id), x.data, { merge: true });
    }
    try {
      await b.commit();
    } catch (err) {
      if (err.code === 5 || String(err.message).includes('NOT_FOUND')) {
        console.error('\n❌ ERROR 5 NOT_FOUND: Database Cloud Firestore belum dibuat atau belum aktif!');
        console.error(`👉 Buka browser ke: https://console.firebase.google.com/project/${process.env.FIREBASE_PROJECT_ID || 'raport-integrasi-pondok'}/firestore`);
        console.error('👉 Klik tombol "Create database" (Pilih Database ID: (default) dan lokasi misal: asia-southeast2).\n');
      }
      throw err;
    }
  }
}

const unitRows = rows('MASTER UNIT');
const mapelRows = rows('MASTER MAPEL');
const guruRows = rows('MASTER GURU');
const kelasRows = rows('MASTER KELAS');
const tugasRows = rows('PENUGASAN GURU');

const units = unitRows.map(r => ({
  code: pick(r, ['Kode Unit', 'Unit', 'Kode']),
  name: pick(r, ['Nama Unit', 'Unit', 'Nama']),
  status: pick(r, ['Status']) || 'AKTIF'
})).filter(x => x.code || x.name);

const unitMap = new Map();
await writeCollection('units', units.map(u => {
  const id = u.code || norm(u.name).replaceAll(' ', '_').toUpperCase();
  unitMap.set(norm(u.code), id);
  unitMap.set(norm(u.name), id);
  return { id, data: { id, code: u.code || id, name: u.name || u.code, status: u.status } };
}));

const subjects = mapelRows.map(r => {
  const code = pick(r, ['Kode Mapel', 'Kode', 'Kode Mata Pelajaran']);
  const name = pick(r, ['Mata Pelajaran', 'Nama Mapel', 'Mapel']);
  const unit = pick(r, ['Unit', 'Kode Unit']);
  if (!name) return null;
  const id = code || norm(name).replaceAll(' ', '_').toUpperCase();
  return {
    id,
    data: {
      id,
      code: id,
      name,
      unit: unit || '',
      unitId: unitMap.get(norm(unit)) || null,
      status: pick(r, ['Status']) || 'AKTIF'
    }
  };
}).filter(Boolean);
await writeCollection('subjects', subjects);

const teachers = guruRows.map(r => {
  const code = pick(r, ['ID Guru', 'ID', 'Kode Guru']);
  const name = pick(r, ['Nama Guru', 'Nama']);
  const unit = pick(r, ['Unit', 'Kode Unit']);
  if (!name) return null;
  const id = code || norm(name).replaceAll(' ', '_').toUpperCase();
  return {
    id,
    data: {
      id,
      teacherId: id,
      teacherCode: code || id,
      name,
      fullName: name,
      unit: unit || '',
      unitId: unitMap.get(norm(unit)) || null,
      status: pick(r, ['Status']) || 'AKTIF',
      pinConfigured: false
    }
  };
}).filter(Boolean);
await writeCollection('teachers', teachers);

const classes = kelasRows.map(r => {
  const code = pick(r, ['ID Kelas', 'ID', 'Kode Kelas']);
  const name = pick(r, ['Nama Kelas', 'Kelas']);
  const unit = pick(r, ['Unit', 'Kode Unit']);
  if (!name) return null;
  const id = code || norm(name).replaceAll(' ', '_').toUpperCase();
  return {
    id,
    data: {
      id,
      code: id,
      name,
      jenjang: unit || '',
      unit: unit || '',
      unitId: unitMap.get(norm(unit)) || null,
      schoolYear,
      status: pick(r, ['Status']) || 'AKTIF',
      spreadsheetId: '',
      spreadsheetSheet: 'Rekap'
    }
  };
}).filter(Boolean);
await writeCollection('classes', classes);

// Penugasan Guru
const assignments = [];
tugasRows.forEach((r, idx) => {
  const id = pick(r, ['ID Penugasan']) || `TUGAS_${idx + 1}`;
  const teacherId = pick(r, ['ID Guru']);
  const teacherName = pick(r, ['Nama Guru']);
  const unit = pick(r, ['Unit']);
  const subjectId = pick(r, ['Kode Mapel']);
  const subjectName = pick(r, ['Mata Pelajaran']);
  const classId = pick(r, ['ID Kelas']);
  const className = pick(r, ['Kelas']);
  const status = pick(r, ['Status']) || 'AKTIF';
  if (teacherId && classId && subjectId) {
    assignments.push({
      id,
      data: {
        id,
        teacherId,
        teacherName,
        unit,
        subjectId,
        subjectName,
        classId,
        className,
        status
      }
    });
  }
});
if (assignments.length) await writeCollection('teacher_assignments', assignments);

// Siswa Sample per Kelas
const sampleNames = [
  'Ahmad Fauzi', 'Aisyah Putri', 'Budi Pratama', 'Dewi Lestari', 'Fajar Ramadhan',
  'Hani Safitri', 'Irfan Hakim', 'Nur Halimah', 'Rizky Kurniawan', 'Zahra Amalia'
];
const students = [];
for (const cls of classes) {
  sampleNames.forEach((name, idx) => {
    const studentId = `S_${cls.id}_${String(idx + 1).padStart(2, '0')}`;
    students.push({
      id: studentId,
      data: {
        id: studentId,
        classId: cls.id,
        schoolYear,
        name,
        fullName: name,
        nis: `10${String(idx + 1).padStart(2, '0')}`,
        nisn: `00812345${String(idx + 1).padStart(2, '0')}`,
        status: 'AKTIF'
      }
    });
  });
}
if (students.length) await writeCollection('students', students);

console.log(`Unit: ${units.length} | Guru: ${teachers.length} | Mapel: ${subjects.length} | Kelas: ${classes.length} | Penugasan: ${assignments.length} | Siswa: ${students.length}`);
console.log('✅ IMPORT MASTER DATA KE DATABASE SELESAI & SEMUA DATA TERHUBUNG.');
