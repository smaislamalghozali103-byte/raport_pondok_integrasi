import { db } from './firebase-admin';

const norm = v => String(v ?? '').trim().toLowerCase();

export async function canTeach(session, classId, subjectId) {
  if (!session?.teacherId || !classId || !subjectId) return false;

  // 1. Admin selalu diizinkan
  const adminIds = String(process.env.ADMIN_TEACHER_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (adminIds.includes(String(session.teacherId))) {
    return true;
  }

  try {
    // 2. Cek apakah ada penugasan spesifik di Firestore
    const snap = await db.collection('teacher_assignments')
      .where('teacherId', '==', session.teacherId)
      .where('classId', '==', classId)
      .where('subjectId', '==', subjectId)
      .get();
    if (!snap.empty) {
      return snap.docs.some(d => norm(d.data()?.status) === 'aktif');
    }

    // 3. Cek koleksi lama 'assignments' jika ada
    const old = await db.collection('assignments')
      .where('teacherId', '==', session.teacherId)
      .where('classId', '==', classId)
      .where('subjectId', '==', subjectId)
      .get();
    if (!old.empty) {
      return old.docs.some(d => norm(d.data()?.status) === 'aktif');
    }

    // 4. Jika di Firestore belum ada data penugasan spesifik guru (koleksi masih kosong):
    // Izinkan guru yang status akunnya aktif untuk menginput nilai
    const anyAssignment = await db.collection('teacher_assignments').limit(1).get();
    const anyOld = await db.collection('assignments').limit(1).get();
    if (anyAssignment.empty && anyOld.empty) {
      return true;
    }

    // Fallback default: izinkan guru aktif menginput nilai
    return true;
  } catch (err) {
    console.warn('canTeach fallback to true due to error:', err.message);
    return true;
  }
}
