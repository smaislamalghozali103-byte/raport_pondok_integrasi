import { MASTER_STUDENTS_SMP } from '@/data/master-source/masterStudents';
import { MASTER_STUDENTS_2_SMP } from '@/data/master-source/masterStudents2SMP';
import { MASTER_STUDENTS_3_SMP } from '@/data/master-source/masterStudents3SMP';
import { MASTER_STUDENTS_1_INTENSIF } from '@/data/master-source/masterStudents1Intensif';
import { MASTER_STUDENTS_2_INTENSIF } from '@/data/master-source/masterStudents2Intensif';
import { MASTER_STUDENTS_3_INTENSIF } from '@/data/master-source/masterStudents3Intensif';
import { MASTER_STUDENTS_4_SMA } from '@/data/master-source/masterStudents4SMA';
import { MASTER_STUDENTS_5_SMA } from '@/data/master-source/masterStudents5SMA';
import { MASTER_STUDENTS_6_SMA } from '@/data/master-source/masterStudents6SMA';
import { MASTER_STUDENTS_FULL_DAY } from '@/data/master-source/masterStudentsFullDay';
import { MASTER_TEACHING_SCHEDULE } from '@/data/master-source/masterTeachingSchedule';
import { TEACHER_ASSIGNMENTS_SMP_REKAP } from '@/data/master-source/teacherAssignmentsRekap';
import { TEACHER_ASSIGNMENTS_SMA_REKAP } from '@/data/master-source/teacherAssignmentsSMARekap';
import { DAFTAR_WALI_KELAS } from '@/data/master-source/waliKelasDatabase';
import { MASTER_SUBJECTS_CATALOG } from '@/data/master-source/curriculumSubjects';

export const MASTER_STUDENTS = [
  ...MASTER_STUDENTS_SMP, ...MASTER_STUDENTS_2_SMP, ...MASTER_STUDENTS_3_SMP,
  ...MASTER_STUDENTS_1_INTENSIF, ...MASTER_STUDENTS_2_INTENSIF, ...MASTER_STUDENTS_3_INTENSIF,
  ...MASTER_STUDENTS_4_SMA, ...MASTER_STUDENTS_5_SMA, ...MASTER_STUDENTS_6_SMA,
  ...MASTER_STUDENTS_FULL_DAY,
];

export const MASTER_TEACHER_ASSIGNMENTS = [
  ...TEACHER_ASSIGNMENTS_SMP_REKAP,
  ...TEACHER_ASSIGNMENTS_SMA_REKAP,
];

export { MASTER_TEACHING_SCHEDULE, DAFTAR_WALI_KELAS, MASTER_SUBJECTS_CATALOG };

const clean = value => String(value ?? '').trim();
const norm = value => clean(value).toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');

export function getTeacherMasterRecords() {
  const map = new Map();
  for (const row of MASTER_TEACHER_ASSIGNMENTS) {
    const name = clean(row.teacherName);
    if (!name) continue;
    const key = norm(name);
    const current = map.get(key) || { name, units: new Set(), subjects: new Set(), classes: new Set(), assignments: [] };
    if (row.unit) current.units.add(row.unit);
    if (row.subjectName) current.subjects.add(row.subjectName);
    if (row.className) current.classes.add(row.className);
    current.assignments.push(row);
    map.set(key, current);
  }
  return [...map.values()].map((x, index) => ({
    id: 'MASTER_T_' + norm(name).replace(/[^a-z0-9]+/g, '_').toUpperCase(),
    name: x.name, fullName: x.name,
    units: [...x.units].sort(), subjects: [...x.subjects].sort(), classes: [...x.classes].sort(),
    assignments: x.assignments, status: 'AKTIF', pinConfigured: false,
  }));
}

export function getClassMasterRecords() {
  const map = new Map();
  for (const s of MASTER_STUDENTS) {
    const id = clean(s.classId);
    if (!id) continue;
    const c = map.get(id) || { id, name: id, unit: '', studentCount: 0 };
    c.studentCount += 1;
    if (s.schoolType) c.unit = String(s.schoolType).toUpperCase();
    map.set(id, c);
  }
  for (const w of DAFTAR_WALI_KELAS) {
    const id = clean(w.classId);
    if (!id) continue;
    const c = map.get(id) || { id, name: clean(w.className) || id, unit: clean(w.unit), studentCount: 0 };
    c.name = clean(w.className) || c.name;
    c.unit = clean(w.unit) || c.unit;
    c.waliName = clean(w.waliName);
    c.levelLabel = clean(w.levelLabel);
    map.set(id, c);
  }
  return [...map.values()].map(x => ({
    ...x, code: x.id, jenjang: x.unit, schoolYear: '2026-2027',
    status: 'AKTIF', spreadsheetId: '', spreadsheetSheet: 'Rekap',
  }));
}

export function getStudentMasterRecords() {
  return MASTER_STUDENTS.map((s, index) => ({
    id: clean(s.id) || 'MASTER_S_' + (index + 1),
    classId: clean(s.classId), schoolYear: '2026-2027',
    no: s.no ?? null, name: clean(s.name || s.fullName), fullName: clean(s.name || s.fullName),
    nisn: clean(s.nisn) || null, status: 'AKTIF', source: 'MASTER_UPLOAD_2026_2027',
  })).filter(x => x.classId && x.name);
}

export function getSubjectMasterRecords() {
  const map = new Map();
  for (const [key, value] of Object.entries(MASTER_SUBJECTS_CATALOG || {})) {
    const name = clean(value?.nameId || key);
    if (!name) continue;
    const id = clean(value?.id || key).replace(/[^a-zA-Z0-9_-]/g, '_');
    map.set(id, { id, code: clean(value?.legacyId) || id, name, nameAr: clean(value?.nameAr),
      category: clean(value?.category), kkm: value?.kkm ?? null, status: 'AKTIF' });
  }
  for (const row of MASTER_TEACHER_ASSIGNMENTS) {
    const name = clean(row.subjectName);
    if (!name) continue;
    const id = 'ASSIGN_' + norm(name).replace(/[^a-z0-9]+/g, '_');
    if (!map.has(id)) map.set(id, { id, code: id, name, status: 'AKTIF' });
  }
  return [...map.values()];
}

export function getWaliMasterRecords() {
  return DAFTAR_WALI_KELAS.map((x, i) => ({
    id: clean(x.classId) || 'WALI_' + (i + 1), classId: clean(x.classId),
    className: clean(x.className), waliName: clean(x.waliName), unit: clean(x.unit),
    gender: clean(x.gender), levelLabel: clean(x.levelLabel), status: 'AKTIF',
  }));
}
