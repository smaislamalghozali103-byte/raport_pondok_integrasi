import { db } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/admin-auth';
import { noStore } from '@/lib/production';
import {
  MASTER_TEACHER_ASSIGNMENTS,
  MASTER_TEACHING_SCHEDULE,
  getTeacherMasterRecords,
  getClassMasterRecords,
  getStudentMasterRecords,
  getSubjectMasterRecords,
  getWaliMasterRecords,
} from '@/lib/master-registry';

export const dynamic = 'force-dynamic';

const clean = value => String(value ?? '').trim();
const safeId = value => clean(value).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 140);

async function writeCollection(name, items) {
  for (let i = 0; i < items.length; i += 300) {
    const batch = db.batch();
    for (const item of items.slice(i, i + 300)) {
      batch.set(db.collection(name).doc(item.id), item.data, { merge: true });
    }
    await batch.commit();
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ success: false, message: auth.message }, { status: auth.status, headers: noStore() });
  const collections = ['teachers', 'units', 'classes', 'subjects', 'teacher_assignments', 'students', 'grades', 'grade_batches', 'sync_queue', 'audit_logs', 'rekap_layouts', 'wali_kelas', 'teaching_schedule'];
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
    version: '17.0-master-registry',
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

    const schoolYear = process.env.SCHOOL_YEAR || '2026-2027';
    const teachers = getTeacherMasterRecords();
    const classes = getClassMasterRecords();
    const students = getStudentMasterRecords();
    const subjects = getSubjectMasterRecords();
    const wali = getWaliMasterRecords();

    const unitNames = new Set();
    for (const x of teachers) for (const u of x.units || []) unitNames.add(u);
    for (const x of classes) if (x.unit) unitNames.add(x.unit);
    const units = [...unitNames].map((name, i) => ({
      id: safeId(name) || 'UNIT_' + (i + 1),
      data: { id: safeId(name) || 'UNIT_' + (i + 1), code: name, name, status: 'AKTIF', schoolYear }
    }));

    await writeCollection('units', units);
    await writeCollection('teachers', teachers.map(x => ({
      id: x.id,
      data: {
        id: x.id, teacherId: x.id, name: x.name, fullName: x.fullName,
        units: x.units, subjects: x.subjects, classes: x.classes,
        status: 'AKTIF', masterSource: 'UPLOADED_MASTER_2026_2027'
      }
    })));
    await writeCollection('classes', classes.map(x => ({ id: x.id, data: { ...x, schoolYear } })));
    await writeCollection('subjects', subjects.map(x => ({ id: x.id, data: { ...x, schoolYear } })));
    await writeCollection('students', students.map(x => ({ id: safeId(x.id), data: { ...x, schoolYear } })));

    const assignmentItems = MASTER_TEACHER_ASSIGNMENTS.map((x, i) => {
      const teacherKey = safeId(x.teacherName);
      const classKey = safeId(x.className);
      const subjectKey = safeId(x.subjectName);
      return {
        id: safeId('ASSIGN_' + teacherKey + '__' + classKey + '__' + subjectKey + '__' + (x.unit || '') + '__' + (x.no ?? i)),
        data: {
          teacherName: clean(x.teacherName), unit: clean(x.unit), subjectName: clean(x.subjectName),
          className: clean(x.className), hours: Number(x.hours) || 0, no: x.no ?? null,
          schoolYear, status: 'AKTIF', source: 'TEACHER_ASSIGNMENTS_REKAP_2026_2027'
        }
      };
    });
    await writeCollection('teacher_assignments', assignmentItems);

    const scheduleItems = MASTER_TEACHING_SCHEDULE.map((x, i) => ({
      id: safeId('SCHEDULE_' + (x.no ?? i + 1) + '__' + x.className + '__' + x.subjectName + '__' + x.teacherName),
      data: {
        no: x.no ?? i + 1, className: clean(x.className), subjectName: clean(x.subjectName),
        unit: clean(x.unit), teacherName: clean(x.teacherName), hours: Number(x.hours) || 0,
        schoolYear, status: 'AKTIF', source: 'MASTER_TEACHING_SCHEDULE_2026_2027'
      }
    }));
    await writeCollection('teaching_schedule', scheduleItems);

    await writeCollection('wali_kelas', wali.map(x => ({
      id: safeId(x.id),
      data: { ...x, schoolYear, source: 'WALI_KELAS_DATABASE_2026_2027' }
    })));

    await db.collection('master_sync').doc('state').set({
      status: 'SYNCED',
      source: 'UPLOADED_MASTER_2026_2027',
      schoolYear,
      syncedAt: new Date().toISOString(),
      counts: {
        units: units.length, teachers: teachers.length, subjects: subjects.length,
        classes: classes.length, students: students.length,
        assignments: assignmentItems.length, schedule: scheduleItems.length, wali: wali.length
      }
    }, { merge: true });

    return Response.json({
      success: true,
      message: 'Master resmi 2026/2027 berhasil disinkronkan. Tidak ada data siswa contoh/fiktif yang dibuat.',
      counts: {
        units: units.length, teachers: teachers.length, subjects: subjects.length,
        classes: classes.length, students: students.length,
        assignments: assignmentItems.length, schedule: scheduleItems.length, wali: wali.length
      }
    }, { headers: noStore() });
  } catch (err) {
    console.error('MASTER REGISTRY SYNC ERROR', err);
    return Response.json({ success: false, message: err?.message || 'Gagal sinkronisasi master resmi.' }, { status: 500, headers: noStore() });
  }
}
