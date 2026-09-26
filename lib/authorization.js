import { db } from './firebase-admin';

const norm = v => String(v ?? '').trim().toLowerCase();

function activeStatus(value) {
  const status = norm(value);
  return status === '' || status === 'aktif' || status === 'active';
}

function configuredAdminIds() {
  return String(process.env.ADMIN_TEACHER_IDS || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
}

export function normalizeRole(value) {
  const role = norm(value);
  if (['wali_kelas', 'wali kelas', 'wali'].includes(role)) return 'wali_kelas';
  if (['admin', 'administrator'].includes(role)) return 'admin';
  return 'guru';
}

export function isAdminSession(session) {
  return normalizeRole(session?.role) === 'admin';
}

export async function getTeacherRole(teacherId) {
  if (!teacherId) return 'guru';

  if (configuredAdminIds().includes(String(teacherId))) {
    return 'admin';
  }

  try {
    const snap = await db.collection('teachers').doc(String(teacherId)).get();
    if (!snap.exists) return 'guru';

    const data = snap.data() || {};
    if (data.isAdmin === true) return 'admin';
    return normalizeRole(data.role);
  } catch (err) {
    console.error('[AUTHORIZATION] getTeacherRole failed:', err);
    return 'guru';
  }
}

async function loadAssignments(teacherId) {
  let snap = await db.collection('teacher_assignments')
    .where('teacherId', '==', teacherId)
    .get();

  if (snap.empty) {
    snap = await db.collection('assignments')
      .where('teacherId', '==', teacherId)
      .get();
  }

  return snap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(item => activeStatus(item.status));
}

export async function getAccessibleAssignments(session) {
  if (!session?.teacherId) return [];

  const role = normalizeRole(session.role);
  if (role === 'admin') return [];

  try {
    return await loadAssignments(session.teacherId);
  } catch (err) {
    console.error('[AUTHORIZATION] getAccessibleAssignments failed:', err);
    return [];
  }
}

function assignmentMatches(a, classId, subjectId) {
  return String(a.classId || '') === String(classId) &&
    String(a.subjectId || '') === String(subjectId);
}

export async function canTeach(session, classId, subjectId) {
  if (!session?.teacherId || !classId || !subjectId) return false;

  const role = normalizeRole(session.role);

  // Admin memiliki jalur akses sendiri melalui autentikasi admin.
  // Admin tidak menggunakan sesi guru.
  if (role === 'admin') return false;

  try {
    const assignments = await loadAssignments(session.teacherId);
    return assignments.some(a => assignmentMatches(a, classId, subjectId));
  } catch (err) {
    console.error('[AUTHORIZATION] canTeach failed:', err);
    return false;
  }
}

function isHomeroomAssignment(a) {
  const role = normalizeRole(a.role || a.assignmentRole || a.type || '');
  return role === 'wali_kelas' ||
    a.isHomeroom === true ||
    a.waliKelas === true ||
    norm(a.position) === 'wali kelas';
}

export async function getHomeroomClassIds(session) {
  if (!session?.teacherId) return [];

  try {
    const teacherSnap = await db.collection('teachers').doc(String(session.teacherId)).get();
    const teacher = teacherSnap.exists ? (teacherSnap.data() || {}) : {};
    const ids = new Set();

    const direct = [
      teacher.homeroomClassId,
      teacher.waliKelasClassId,
      teacher.classWaliId
    ].filter(Boolean);

    for (const id of direct) ids.add(String(id));

    for (const field of ['homeroomClassIds', 'waliKelasClassIds']) {
      if (Array.isArray(teacher[field])) {
        for (const id of teacher[field]) {
          if (id) ids.add(String(id));
        }
      }
    }

    const assignments = await loadAssignments(session.teacherId);
    for (const a of assignments) {
      if (a.classId && isHomeroomAssignment(a)) {
        ids.add(String(a.classId));
      }
    }

    return [...ids];
  } catch (err) {
    console.error('[AUTHORIZATION] getHomeroomClassIds failed:', err);
    return [];
  }
}
