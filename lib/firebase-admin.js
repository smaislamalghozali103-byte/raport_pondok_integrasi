import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });
import fs from 'node:fs';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import XLSX from 'xlsx';

export function formatPrivateKey(key) {
  if (!key) return '';
  let str = String(key).trim();
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1);
  }
  str = str.replace(/\\n/g, '\n').replace(/\r/g, '');
  return str.trim() + '\n';
}

// =========================================================
// IN-MEMORY FALLBACK FIRESTORE
// Digunakan otomatis bila credential Firebase belum disediakan
// =========================================================

const memoryStore = new Map();

function getMemoryCollection(colName) {
  if (!memoryStore.has(colName)) {
    memoryStore.set(colName, new Map());
  }
  return memoryStore.get(colName);
}

class MemoryDocRef {
  constructor(collectionName, id) {
    this.collectionName = collectionName;
    this.id = id;
  }

  async get() {
    const col = getMemoryCollection(this.collectionName);
    const exists = col.has(this.id);
    const data = exists ? { ...col.get(this.id) } : undefined;
    return {
      id: this.id,
      exists,
      data: () => data,
    };
  }

  async set(data, options = {}) {
    const col = getMemoryCollection(this.collectionName);
    const existing = col.get(this.id) || {};
    const newData = options.merge ? { ...existing, ...data } : { ...data };
    newData.id = this.id;
    col.set(this.id, newData);
    return { writeTime: new Date() };
  }

  async update(data) {
    const col = getMemoryCollection(this.collectionName);
    const existing = col.get(this.id) || {};
    const updated = { ...existing, ...data, id: this.id };
    col.set(this.id, updated);
    return { writeTime: new Date() };
  }

  async delete() {
    const col = getMemoryCollection(this.collectionName);
    col.delete(this.id);
    return { writeTime: new Date() };
  }
}

class MemoryQuery {
  constructor(collectionName, filters = [], orders = [], limitCount = null) {
    this.collectionName = collectionName;
    this.filters = filters;
    this.orders = orders;
    this.limitCount = limitCount;
  }

  where(field, op, value) {
    return new MemoryQuery(this.collectionName, [...this.filters, { field, op, value }], this.orders, this.limitCount);
  }

  orderBy(field, dir = 'asc') {
    return new MemoryQuery(this.collectionName, this.filters, [...this.orders, { field, dir }], this.limitCount);
  }

  limit(count) {
    return new MemoryQuery(this.collectionName, this.filters, this.orders, count);
  }

  count() {
    return {
      get: async () => {
        const snap = await this.get();
        return {
          data: () => ({ count: snap.docs.length })
        };
      }
    };
  }

  async get() {
    const col = getMemoryCollection(this.collectionName);
    let items = Array.from(col.values());

    for (const f of this.filters) {
      if (f.op === '==' || f.op === '===') {
        items = items.filter(item => {
          const itemVal = item[f.field];
          return itemVal === f.value || String(itemVal ?? '') === String(f.value ?? '');
        });
      }
    }

    for (const o of this.orders) {
      items.sort((a, b) => {
        const valA = a[o.field] ?? '';
        const valB = b[o.field] ?? '';
        let cmp = 0;
        if (typeof valA === 'number' && typeof valB === 'number') {
          cmp = valA - valB;
        } else {
          cmp = String(valA).localeCompare(String(valB), 'id');
        }
        return o.dir === 'desc' ? -cmp : cmp;
      });
    }

    if (this.limitCount !== null && this.limitCount >= 0) {
      items = items.slice(0, this.limitCount);
    }

    const docs = items.map(d => ({
      id: d.id,
      exists: true,
      data: () => ({ ...d }),
    }));

    return {
      empty: docs.length === 0,
      size: docs.length,
      docs,
    };
  }

  doc(id) {
    const docId = id || ('doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9));
    return new MemoryDocRef(this.collectionName, docId);
  }
}

class MemoryBatch {
  constructor() {
    this.ops = [];
  }

  set(docRef, data, options = {}) {
    this.ops.push(() => docRef.set(data, options));
    return this;
  }

  update(docRef, data) {
    this.ops.push(() => docRef.update(data));
    return this;
  }

  delete(docRef) {
    this.ops.push(() => docRef.delete());
    return this;
  }

  async commit() {
    for (const op of this.ops) {
      await op();
    }
  }
}

function createMemoryDb() {
  return {
    collection(name) {
      return new MemoryQuery(name);
    },
    batch() {
      return new MemoryBatch();
    }
  };
}

function seedDefaultMasterData() {
  const unitsCol = getMemoryCollection('units');
  const defaultUnits = [
    { id: 'SMA', code: 'SMA', name: 'SMA Islam Al-Ghozali', status: 'AKTIF' },
    { id: 'SMP', code: 'SMP', name: 'SMP Islam Al-Ghozali', status: 'AKTIF' },
    { id: 'PONDOK', code: 'PONDOK', name: 'Pondok Pesantren Al-Ghozali', status: 'AKTIF' }
  ];
  defaultUnits.forEach(u => unitsCol.set(u.id, u));

  const teachersCol = getMemoryCollection('teachers');
  const defaultTeachers = [
    { id: 'GURU_01', teacherId: 'GURU_01', teacherCode: 'GURU_01', name: 'Ust. Ahmad Dahlan, S.Pd.I', fullName: 'Ust. Ahmad Dahlan, S.Pd.I', unit: 'SMA', unitId: 'SMA', status: 'AKTIF', pinConfigured: false },
    { id: 'GURU_02', teacherId: 'GURU_02', teacherCode: 'GURU_02', name: 'Ustazah Fatimah Zahra, M.Pd', fullName: 'Ustazah Fatimah Zahra, M.Pd', unit: 'SMA', unitId: 'SMA', status: 'AKTIF', pinConfigured: false },
    { id: 'GURU_03', teacherId: 'GURU_03', teacherCode: 'GURU_03', name: 'Ust. Muhammad Ridwan, S.Ag', fullName: 'Ust. Muhammad Ridwan, S.Ag', unit: 'SMP', unitId: 'SMP', status: 'AKTIF', pinConfigured: false },
    { id: 'GURU_04', teacherId: 'GURU_04', teacherCode: 'GURU_04', name: 'Ustazah Siti Maryam, S.Pd', fullName: 'Ustazah Siti Maryam, S.Pd', unit: 'SMP', unitId: 'SMP', status: 'AKTIF', pinConfigured: false },
    { id: 'GURU_05', teacherId: 'GURU_05', teacherCode: 'GURU_05', name: 'Ust. Hasan Basri, Lc', fullName: 'Ust. Hasan Basri, Lc', unit: 'PONDOK', unitId: 'PONDOK', status: 'AKTIF', pinConfigured: false }
  ];
  defaultTeachers.forEach(t => teachersCol.set(t.id, t));

  const subjectsCol = getMemoryCollection('subjects');
  const defaultSubjects = [
    { id: 'PAI_SMA', code: 'PAI_SMA', name: 'Pendidikan Agama Islam', unit: 'SMA', unitId: 'SMA', status: 'AKTIF' },
    { id: 'MTK_SMA', code: 'MTK_SMA', name: 'Matematika', unit: 'SMA', unitId: 'SMA', status: 'AKTIF' },
    { id: 'BINDO_SMA', code: 'BINDO_SMA', name: 'Bahasa Indonesia', unit: 'SMA', unitId: 'SMA', status: 'AKTIF' },
    { id: 'BING_SMA', code: 'BING_SMA', name: 'Bahasa Inggris', unit: 'SMA', unitId: 'SMA', status: 'AKTIF' },
    { id: 'FIQIH_PDK', code: 'FIQIH_PDK', name: 'Fiqih & Ushul Fiqih', unit: 'PONDOK', unitId: 'PONDOK', status: 'AKTIF' },
    { id: 'TAHFIDZ', code: 'TAHFIDZ', name: 'Tahfidz Al-Qur\'an', unit: 'PONDOK', unitId: 'PONDOK', status: 'AKTIF' }
  ];
  defaultSubjects.forEach(s => subjectsCol.set(s.id, s));

  const classesCol = getMemoryCollection('classes');
  const defaultClasses = [
    { id: 'X_MIPA_1', code: 'X_MIPA_1', name: 'X MIPA 1', jenjang: 'SMA', unit: 'SMA', unitId: 'SMA', schoolYear: process.env.SCHOOL_YEAR || '2026-2027', status: 'AKTIF', spreadsheetId: '', spreadsheetSheet: 'Rekap' },
    { id: 'XI_MIPA_1', code: 'XI_MIPA_1', name: 'XI MIPA 1', jenjang: 'SMA', unit: 'SMA', unitId: 'SMA', schoolYear: process.env.SCHOOL_YEAR || '2026-2027', status: 'AKTIF', spreadsheetId: '', spreadsheetSheet: 'Rekap' },
    { id: 'VII_A', code: 'VII_A', name: 'VII A', jenjang: 'SMP', unit: 'SMP', unitId: 'SMP', schoolYear: process.env.SCHOOL_YEAR || '2026-2027', status: 'AKTIF', spreadsheetId: '', spreadsheetSheet: 'Rekap' },
    { id: 'VIII_A', code: 'VIII_A', name: 'VIII A', jenjang: 'SMP', unit: 'SMP', unitId: 'SMP', schoolYear: process.env.SCHOOL_YEAR || '2026-2027', status: 'AKTIF', spreadsheetId: '', spreadsheetSheet: 'Rekap' }
  ];
  defaultClasses.forEach(c => classesCol.set(c.id, c));

  const assignmentsCol = getMemoryCollection('teacher_assignments');
  const defaultAssignments = [
    { id: 'TUGAS_1', teacherId: 'GURU_01', teacherName: 'Ust. Ahmad Dahlan, S.Pd.I', unit: 'SMA', subjectId: 'PAI_SMA', subjectName: 'Pendidikan Agama Islam', classId: 'X_MIPA_1', className: 'X MIPA 1', status: 'AKTIF' },
    { id: 'TUGAS_2', teacherId: 'GURU_01', teacherName: 'Ust. Ahmad Dahlan, S.Pd.I', unit: 'SMA', subjectId: 'PAI_SMA', subjectName: 'Pendidikan Agama Islam', classId: 'XI_MIPA_1', className: 'XI MIPA 1', status: 'AKTIF' },
    { id: 'TUGAS_3', teacherId: 'GURU_02', teacherName: 'Ustazah Fatimah Zahra, M.Pd', unit: 'SMA', subjectId: 'MTK_SMA', subjectName: 'Matematika', classId: 'X_MIPA_1', className: 'X MIPA 1', status: 'AKTIF' },
    { id: 'TUGAS_4', teacherId: 'GURU_03', teacherName: 'Ust. Muhammad Ridwan, S.Ag', unit: 'SMP', subjectId: 'BINDO_SMA', subjectName: 'Bahasa Indonesia', classId: 'VII_A', className: 'VII A', status: 'AKTIF' },
    { id: 'TUGAS_5', teacherId: 'GURU_04', teacherName: 'Ustazah Siti Maryam, S.Pd', unit: 'SMP', subjectId: 'BING_SMA', subjectName: 'Bahasa Inggris', classId: 'VII_A', className: 'VII A', status: 'AKTIF' },
    { id: 'TUGAS_6', teacherId: 'GURU_05', teacherName: 'Ust. Hasan Basri, Lc', unit: 'PONDOK', subjectId: 'FIQIH_PDK', subjectName: 'Fiqih & Ushul Fiqih', classId: 'X_MIPA_1', className: 'X MIPA 1', status: 'AKTIF' }
  ];
  defaultAssignments.forEach(a => assignmentsCol.set(a.id, a));

  const studentsCol = getMemoryCollection('students');
  const sampleNames = [
    'Ahmad Fauzi', 'Aisyah Putri', 'Budi Pratama', 'Dewi Lestari', 'Fajar Ramadhan',
    'Hani Safitri', 'Irfan Hakim', 'Nur Halimah', 'Rizky Kurniawan', 'Zahra Amalia'
  ];
  for (const cls of defaultClasses) {
    sampleNames.forEach((name, idx) => {
      const studentId = `S_${cls.id}_${String(idx + 1).padStart(2, '0')}`;
      studentsCol.set(studentId, {
        id: studentId,
        classId: cls.id,
        schoolYear: process.env.SCHOOL_YEAR || '2026-2027',
        name,
        fullName: name,
        nis: `10${String(idx + 1).padStart(2, '0')}`,
        nisn: `00812345${String(idx + 1).padStart(2, '0')}`,
        status: 'AKTIF'
      });
    });
  }

  console.log(`[AI Studio] Seeded fallback master data: ${unitsCol.size} units, ${teachersCol.size} teachers, ${subjectsCol.size} subjects, ${classesCol.size} classes, ${assignmentsCol.size} assignments, ${studentsCol.size} students`);
}

let memorySeeded = false;

function seedMemoryStore() {
  if (memorySeeded) return;
  memorySeeded = true;

  // System health doc
  getMemoryCollection('system').set('health', {
    ok: true,
    status: 'ok',
    updatedAt: new Date().toISOString()
  });

  try {
    const xlsxPath = process.env.MASTER_XLSX || path.join(process.cwd(), 'data', 'MASTER_GURU_MAPEL_PER_UNIT_HASIL_REKAP(1).xlsx');
    if (!fs.existsSync(xlsxPath)) {
      seedDefaultMasterData();
      return;
    }

    const wb = XLSX.readFile(xlsxPath, { cellDates: false });
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

    const unitRows = rows('MASTER UNIT');
    const mapelRows = rows('MASTER MAPEL');
    const guruRows = rows('MASTER GURU');
    const kelasRows = rows('MASTER KELAS');
    const tugasRows = rows('PENUGASAN GURU');

    const unitsCol = getMemoryCollection('units');
    const unitMap = new Map();
    unitRows.forEach(r => {
      const code = pick(r, ['Kode Unit', 'Unit', 'Kode', 'ID Unit']);
      const name = pick(r, ['Nama Unit', 'Unit', 'Nama']);
      const status = pick(r, ['Status']) || 'AKTIF';
      if (code || name) {
        const id = code || norm(name).replaceAll(' ', '_').toUpperCase();
        unitMap.set(norm(code), id);
        unitMap.set(norm(name), id);
        unitsCol.set(id, { id, code: code || id, name: name || code, status });
      }
    });

    const subjectsCol = getMemoryCollection('subjects');
    mapelRows.forEach(r => {
      const code = pick(r, ['Kode Mapel', 'Kode', 'Kode Mata Pelajaran']);
      const name = pick(r, ['Mata Pelajaran', 'Nama Mapel', 'Mapel']);
      const unit = pick(r, ['Unit', 'Kode Unit']);
      if (!name) return;
      const id = code || norm(name).replaceAll(' ', '_').toUpperCase();
      subjectsCol.set(id, {
        id,
        code: id,
        name,
        unit: unit || '',
        unitId: unitMap.get(norm(unit)) || null,
        status: pick(r, ['Status']) || 'AKTIF'
      });
    });

    const teachersCol = getMemoryCollection('teachers');
    guruRows.forEach(r => {
      const code = pick(r, ['ID Guru', 'ID', 'Kode Guru']);
      const name = pick(r, ['Nama Guru', 'Nama']);
      const unit = pick(r, ['Unit', 'Kode Unit']);
      if (!name) return;
      const id = code || norm(name).replaceAll(' ', '_').toUpperCase();
      teachersCol.set(id, {
        id,
        teacherId: id,
        teacherCode: code || id,
        name,
        fullName: name,
        unit: unit || '',
        unitId: unitMap.get(norm(unit)) || null,
        status: pick(r, ['Status']) || 'AKTIF',
        pinConfigured: false
      });
    });

    const classesCol = getMemoryCollection('classes');
    kelasRows.forEach(r => {
      const code = pick(r, ['ID Kelas', 'ID', 'Kode Kelas']);
      const name = pick(r, ['Nama Kelas', 'Kelas']);
      const unit = pick(r, ['Unit', 'Kode Unit']);
      if (!name) return;
      const id = code || norm(name).replaceAll(' ', '_').toUpperCase();
      classesCol.set(id, {
        id,
        code: id,
        name,
        jenjang: unit || '',
        unit: unit || '',
        unitId: unitMap.get(norm(unit)) || null,
        schoolYear: process.env.SCHOOL_YEAR || '2026-2027',
        status: pick(r, ['Status']) || 'AKTIF',
        spreadsheetId: '',
        spreadsheetSheet: 'Rekap'
      });
    });

    const assignmentsCol = getMemoryCollection('teacher_assignments');
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
        assignmentsCol.set(id, {
          id,
          teacherId,
          teacherName,
          unit,
          subjectId,
          subjectName,
          classId,
          className,
          status
        });
      }
    });

    // Seed students for each class
    const studentsCol = getMemoryCollection('students');
    const sampleNames = [
      'Ahmad Fauzi', 'Aisyah Putri', 'Budi Pratama', 'Dewi Lestari', 'Fajar Ramadhan',
      'Hani Safitri', 'Irfan Hakim', 'Nur Halimah', 'Rizky Kurniawan', 'Zahra Amalia'
    ];
    for (const cls of classesCol.values()) {
      sampleNames.forEach((name, idx) => {
        const studentId = `S_${cls.id}_${String(idx + 1).padStart(2, '0')}`;
        studentsCol.set(studentId, {
          id: studentId,
          classId: cls.id,
          schoolYear: process.env.SCHOOL_YEAR || '2026-2027',
          name,
          fullName: name,
          nis: `10${String(idx + 1).padStart(2, '0')}`,
          nisn: `00812345${String(idx + 1).padStart(2, '0')}`,
          status: 'AKTIF'
        });
      });
    }

    console.log(`[AI Studio] Seeded in-memory store: ${unitsCol.size} units, ${teachersCol.size} teachers, ${subjectsCol.size} subjects, ${classesCol.size} classes, ${assignmentsCol.size} assignments, ${studentsCol.size} students`);
  } catch (err) {
    console.warn('[AI Studio] Gagal seed memory store dari Excel:', err.message);
  }
}

let cachedDb = null;

function getFirebaseDb() {
  if (cachedDb) return cachedDb;

  const saPath = path.join(process.cwd(), 'service-account.json');
  const hasSa = fs.existsSync(saPath);
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (hasSa || (projectId && clientEmail && privateKey)) {
    try {
      if (!getApps().length) {
        if (hasSa) {
          const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
          if (sa.project_id && sa.private_key && sa.client_email) {
            initializeApp({ credential: cert(sa) });
          }
        } else {
          initializeApp({
            credential: cert({
              projectId,
              clientEmail,
              privateKey,
            }),
          });
        }
      }
      cachedDb = getFirestore();
      return cachedDb;
    } catch (e) {
      console.warn('[AI Studio] Firebase init failed, fallback to in-memory store:', e.message);
    }
  }

  // Fallback to in-memory Firestore
  seedMemoryStore();
  cachedDb = createMemoryDb();
  return cachedDb;
}

export const db = new Proxy({}, {
  get(_target, prop) {
    const firestore = getFirebaseDb();
    const value = firestore[prop];
    return typeof value === 'function' ? value.bind(firestore) : value;
  }
});
