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

export async function canTeach(session, classId, subjectId) {
  if (!session?.teacherId || !classId || !subjectId) return false;

  // Administrator yang memang dikonfigurasi tetap dapat mengelola nilai.
  const adminIds = configuredAdminIds();
  if (adminIds.includes(String(session.teacherId))) {
    return true;
  }

  try {
    // Penugasan baru adalah sumber otorisasi utama.
    const assignments = await db.collection('teacher_assignments')
      .where('teacherId', '==', session.teacherId)
      .where('classId', '==', classId)
      .where('subjectId', '==', subjectId)
      .get();

    if (!assignments.empty) {
      return assignments.docs.some(doc => activeStatus(doc.data()?.status));
    }

    // Kompatibilitas dengan data lama.
    const oldAssignments = await db.collection('assignments')
      .where('teacherId', '==', session.teacherId)
      .where('classId', '==', classId)
      .where('subjectId', '==', subjectId)
      .get();

    if (!oldAssignments.empty) {
      return oldAssignments.docs.some(doc => activeStatus(doc.data()?.status));
    }

    // Fail-closed: tidak ada penugasan = tidak boleh input.
    return false;
  } catch (err) {
    // Jangan pernah memberi akses ketika database/otorisasi gagal.
    console.error('[AUTHORIZATION] canTeach failed:', err);
    return false;
  }
}
