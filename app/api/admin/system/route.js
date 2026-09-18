import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { db } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/admin-auth';
import { noStore } from '@/lib/production';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ success: false, message: auth.message }, { status: auth.status, headers: noStore() });
  const collections = ['teachers', 'units', 'classes', 'subjects', 'teacher_assignments', 'students', 'grades', 'grade_batches', 'sync_queue', 'audit_logs', 'rekap_layouts'];
  const counts = {};
  for (const name of collections) {
    try {
      const snap = await db.collection(name).count().get();
      counts[name] = snap.data().count;
    } catch {
      counts[name] = 0;
    }
  }
  return Response.json({
    success: true,
    version: '16.0',
    node: process.version,
    environment: process.env.NODE_ENV || 'development',
    serverTime: new Date().toISOString(),
    counts
  }, { headers: noStore() });
}

export async function POST() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return Response.json({ success: false, message: auth.message }, { status: auth.status, headers: noStore() });

    const xlsxPath = process.env.MASTER_XLSX || path.join(process.cwd(), 'data', 'MASTER_GURU_MAPEL_PER_UNIT_HASIL_REKAP(1).xlsx');
    if (!fs.existsSync(xlsxPath)) {
      return Response.json({ success: false, message: `File master data tidak ditemukan di: ${xlsxPath}` }, { status: 404 });
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

    async function writeCollection(name, items) {
      for (let i = 0; i < items.length; i += 350) {
        const batch = db.batch();
        for (const item of items.slice(i, i + 350)) {
          batch.set(db.collection(name).doc(item.id), item.data, { merge: true });
        }
        await batch.commit();
      }
    }

    const unitRows = rows('MASTER UNIT');
    const mapelRows = rows('MASTER MAPEL');
    const guruRows = rows('MASTER GURU');
    const kelasRows = rows('MASTER KELAS');
    const tugasRows = rows('PENUGASAN GURU');

    const unitMap = new Map();
    const unitItems = [];
    unitRows.forEach(r => {
      const code = pick(r, ['Kode Unit', 'Unit', 'Kode', 'ID Unit']);
      const name = pick(r, ['Nama Unit', 'Unit', 'Nama']);
      const status = pick(r, ['Status']) || 'AKTIF';
      if (code || name) {
        const id = code || norm(name).replaceAll(' ', '_').toUpperCase();
        unitMap.set(norm(code), id);
        unitMap.set(norm(name), id);
        unitItems.push({ id, data: { id, code: code || id, name: name || code, status } });
      }
    });
    if (unitItems.length) await writeCollection('units', unitItems);

    const subjectItems = [];
    mapelRows.forEach(r => {
      const code = pick(r, ['Kode Mapel', 'Kode', 'Kode Mata Pelajaran']);
      const name = pick(r, ['Mata Pelajaran', 'Nama Mapel', 'Mapel']);
      const unit = pick(r, ['Unit', 'Kode Unit']);
      if (!name) return;
      const id = code || norm(name).replaceAll(' ', '_').toUpperCase();
      subjectItems.push({
        id,
        data: {
          id,
          code: id,
          name,
          unit: unit || '',
          unitId: unitMap.get(norm(unit)) || null,
          status: pick(r, ['Status']) || 'AKTIF'
        }
      });
    });
    if (subjectItems.length) await writeCollection('subjects', subjectItems);

    const teacherItems = [];
    guruRows.forEach(r => {
      const code = pick(r, ['ID Guru', 'ID', 'Kode Guru']);
      const name = pick(r, ['Nama Guru', 'Nama']);
      const unit = pick(r, ['Unit', 'Kode Unit']);
      if (!name) return;
      const id = code || norm(name).replaceAll(' ', '_').toUpperCase();
      teacherItems.push({
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
      });
    });
    if (teacherItems.length) await writeCollection('teachers', teacherItems);

    const classItems = [];
    kelasRows.forEach(r => {
      const code = pick(r, ['ID Kelas', 'ID', 'Kode Kelas']);
      const name = pick(r, ['Nama Kelas', 'Kelas']);
      const unit = pick(r, ['Unit', 'Kode Unit']);
      if (!name) return;
      const id = code || norm(name).replaceAll(' ', '_').toUpperCase();
      classItems.push({
        id,
        data: {
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
        }
      });
    });
    if (classItems.length) await writeCollection('classes', classItems);

    const assignmentItems = [];
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
        assignmentItems.push({
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
    if (assignmentItems.length) await writeCollection('teacher_assignments', assignmentItems);

    // Seed student records for classes so every class is linked with students
    const sampleNames = [
      'Ahmad Fauzi', 'Aisyah Putri', 'Budi Pratama', 'Dewi Lestari', 'Fajar Ramadhan',
      'Hani Safitri', 'Irfan Hakim', 'Nur Halimah', 'Rizky Kurniawan', 'Zahra Amalia'
    ];
    const studentItems = [];
    for (const cls of classItems) {
      sampleNames.forEach((name, idx) => {
        const studentId = `S_${cls.id}_${String(idx + 1).padStart(2, '0')}`;
        studentItems.push({
          id: studentId,
          data: {
            id: studentId,
            classId: cls.id,
            schoolYear: process.env.SCHOOL_YEAR || '2026-2027',
            name,
            fullName: name,
            nis: `10${String(idx + 1).padStart(2, '0')}`,
            nisn: `00812345${String(idx + 1).padStart(2, '0')}`,
            status: 'AKTIF'
          }
        });
      });
    }
    if (studentItems.length) await writeCollection('students', studentItems);

    return Response.json({
      success: true,
      message: 'Semua data master berhasil dihubungkan dan disinkronkan ke database.',
      counts: {
        units: unitItems.length,
        teachers: teacherItems.length,
        subjects: subjectItems.length,
        classes: classItems.length,
        assignments: assignmentItems.length,
        students: studentItems.length
      }
    }, { headers: noStore() });
  } catch (err) {
    console.error('SYSTEM SYNC ERROR', err);
    return Response.json({ success: false, message: err?.message || 'Gagal sinkronisasi data master.' }, { status: 500 });
  }
}
