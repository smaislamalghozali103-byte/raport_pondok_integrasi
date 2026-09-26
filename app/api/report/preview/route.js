import { cookies } from 'next/headers';
import { db } from '@/lib/firebase-admin';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-session';
import { requireAdmin } from '@/lib/admin-auth';
import { getHomeroomClassIds } from '@/lib/authorization';

export const dynamic = 'force-dynamic';

const clean = v => String(v ?? '').trim();

export async function GET(request) {
  try {
    const admin = await requireAdmin();
    let session = admin.ok ? admin.session : null;
    let isAdmin = admin.ok;

    if (!session) {
      const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
      session = verifySessionToken(token);
    }

    if (!session) {
      return Response.json({ success: false, message: 'Sesi login tidak valid.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const classId = clean(searchParams.get('classId'));
    const studentId = clean(searchParams.get('studentId'));

    if (!classId || !studentId) {
      return Response.json({ success: false, message: 'classId dan studentId wajib diisi.' }, { status: 400 });
    }

    if (!isAdmin) {
      const homeroomIds = await getHomeroomClassIds(session);
      if (!homeroomIds.map(String).includes(String(classId))) {
        return Response.json({
          success: false,
          message: 'Preview raport hanya tersedia untuk kelas binaan wali kelas.'
        }, { status: 403 });
      }
    }

    const [classSnap, studentSnap] = await Promise.all([
      db.collection('classes').doc(classId).get(),
      db.collection('students').doc(studentId).get()
    ]);

    if (!classSnap.exists || !studentSnap.exists) {
      return Response.json({ success: false, message: 'Kelas atau siswa tidak ditemukan.' }, { status: 404 });
    }

    const classData = classSnap.data() || {};
    const student = { id: studentSnap.id, ...studentSnap.data() };

    if (String(student.classId || '') !== String(classId)) {
      return Response.json({ success: false, message: 'Siswa bukan anggota kelas yang dipilih.' }, { status: 400 });
    }

    const gradeSnap = await db.collection('grades')
      .where('classId', '==', classId)
      .where('studentId', '==', studentId)
      .get();

    const grades = gradeSnap.docs.map(doc => {
      const g = doc.data() || {};
      return {
        subjectId: g.subjectId || '',
        subjectName: g.subjectName || '',
        value: g.value ?? ''
      };
    });

    grades.sort((a, b) => clean(a.subjectName).localeCompare(clean(b.subjectName), 'id'));

    const allGradesSnap = await db.collection('grades')
      .where('classId', '==', classId)
      .get();

    const perStudent = new Map();
    for (const doc of allGradesSnap.docs) {
      const g = doc.data() || {};
      const sid = clean(g.studentId);
      const value = Number(g.value);
      if (!sid || !Number.isFinite(value)) continue;
      if (!perStudent.has(sid)) perStudent.set(sid, []);
      perStudent.get(sid).push(value);
    }

    const rankingRows = [...perStudent.entries()]
      .map(([sid, values]) => ({
        sid,
        average: values.reduce((sum, value) => sum + value, 0) / values.length
      }))
      .sort((a, b) => b.average - a.average);

    const rankIndex = rankingRows.findIndex(item => item.sid === String(studentId));
    const ranking = rankIndex >= 0
      ? {
          rank: rankIndex + 1,
          total: rankingRows.length,
          average: rankingRows[rankIndex].average
        }
      : null;

    return Response.json({
      success: true,
      meta: {
        name: student.name || student.full_name || '',
        nisn: student.nisn || student.nis || '',
        className: classData.name || '',
        unit: classData.unit || '',
        schoolYear: classData.schoolYear || process.env.SCHOOL_YEAR || '2026/2027',
        waliKelas: classData.waliKelas || classData.homeroomTeacher || '',
        director: classData.director || process.env.DIRECTOR_NAME || "M. Ya'qub Unang, S.Ag"
      },
      grades,
      ranking
    });
  } catch (error) {
    console.error('[REPORT PREVIEW ERROR]', error);
    return Response.json({
      success: false,
      message: error?.message || 'Gagal memuat data raport.'
    }, { status: 500 });
  }
}
