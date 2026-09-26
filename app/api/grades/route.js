import { cookies } from "next/headers";
import { db } from "@/lib/firebase-admin";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { canTeach } from "@/lib/authorization";
import { writeAudit } from "@/lib/audit-log";

export const dynamic = 'force-dynamic';

const clean = (v) => String(v ?? "").trim();

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const session = verifySessionToken(token);

    if (!session) {
      return Response.json({ success: false, message: "Sesi login tidak valid." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const classId = clean(searchParams.get("classId") || searchParams.get("class_id"));
    const subjectId = clean(searchParams.get("subjectId") || searchParams.get("subject_id"));

    if (!classId || !subjectId) {
      return Response.json({ success: false, message: "classId dan subjectId wajib diisi." }, { status: 400 });
    }

    if (!(await canTeach(session, classId, subjectId))) {
      return Response.json({ success: false, message: "Anda tidak memiliki akses ke kelas dan mata pelajaran ini." }, { status: 403 });
    }

    const snap = await db.collection("grades")
      .where("classId", "==", classId)
      .where("subjectId", "==", subjectId)
      .get();

    const grades = snap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        studentId: data.studentId,
        value: data.value,
        updatedAt: data.updatedAt,
        syncStatus: data.syncStatus
      };
    });

    return Response.json({ success: true, count: grades.length, grades });
  } catch (err) {
    console.error("GET GRADES ERROR", err);
    return Response.json({ success: false, message: err?.message || "Gagal mengambil nilai." }, { status: 500 });
  }
}

function validScore(v) {
  if (v === null || v === undefined || v === "") return true;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100;
}

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const session = verifySessionToken(token);

    if (!session) {
      return Response.json({ success: false, message: "Sesi login tidak valid." }, { status: 401 });
    }

    const body = await request.json();
    const classId = clean(body.classId);
    const subjectId = clean(body.subjectId);
    const className = clean(body.className);
    const subjectName = clean(body.subjectName);
    const inputMethod = clean(body.inputMethod) || "manual";
    const grades = Array.isArray(body.grades) ? body.grades : [];

    if (!classId || !subjectId) {
      return Response.json({ success: false, message: "Kelas dan mata pelajaran wajib dipilih." }, { status: 400 });
    }

    if (!grades.length) {
      return Response.json({ success: false, message: "Belum ada nilai yang disimpan." }, { status: 400 });
    }

    const classSnap = await db.collection("classes").doc(classId).get();
    if (!classSnap.exists) {
      return Response.json({ success: false, message: "Kelas tidak ditemukan." }, { status: 404 });
    }

    if (!(await canTeach(session, classId, subjectId))) {
      return Response.json({ success: false, message: "Guru tidak memiliki penugasan aktif untuk kelas dan mata pelajaran ini." }, { status: 403 });
    }

    const subjectSnap = await db.collection("subjects").doc(subjectId).get();
    if (!subjectSnap.exists) {
      return Response.json({ success: false, message: "Mata pelajaran tidak ditemukan." }, { status: 404 });
    }

    const cleanGrades = [];
    const seen = new Set();

    for (const item of grades) {
      const studentId = clean(item.studentId);
      const value = item.value === "" || item.value === null || item.value === undefined
        ? null
        : Number(item.value);

      if (!studentId) continue;
      if (seen.has(studentId)) continue;
      seen.add(studentId);

      if (!validScore(value)) {
        return Response.json({
          success: false,
          message: `Nilai siswa ${studentId} harus antara 0 sampai 100.`,
        }, { status: 400 });
      }

      cleanGrades.push({
        studentId,
        value,
      });
    }

    if (!cleanGrades.length) {
      return Response.json({ success: false, message: "Tidak ada data nilai yang valid." }, { status: 400 });
    }

    const batchId = db.collection("grade_batches").doc().id;
    const now = new Date();
    const batchRef = db.collection("grade_batches").doc(batchId);

    // Simpan maksimum 400 operasi per Firestore batch.
    const chunks = [];
    for (let i = 0; i < cleanGrades.length; i += 350) {
      chunks.push(cleanGrades.slice(i, i + 350));
    }

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const batch = db.batch();

      if (chunkIndex === 0) {
        batch.set(batchRef, {
          batchId,
          teacherId: session.teacherId,
          teacherCode: session.teacherCode,
          teacherName: session.teacherName,
          classId,
          className: className || classSnap.data().name || "",
          subjectId,
          subjectName: subjectName || subjectSnap.data().name || "",
          schoolYear: session.schoolYear || process.env.SCHOOL_YEAR || "2026-2027",
          inputMethod,
          totalRows: cleanGrades.length,
          status: "TERSIMPAN",
          syncStatus: "MENUNGGU",
          createdAt: now,
          updatedAt: now,
        });
      }

      for (const item of chunks[chunkIndex]) {
        const gradeId = [
          session.schoolYear || process.env.SCHOOL_YEAR || "2026-2027",
          classId,
          subjectId,
          item.studentId,
        ].join("__");

        const ref = db.collection("grades").doc(gradeId);

        batch.set(ref, {
          gradeId,
          batchId,
          schoolYear: session.schoolYear || process.env.SCHOOL_YEAR || "2026-2027",
          classId,
          className: className || classSnap.data().name || "",
          subjectId,
          subjectName: subjectName || subjectSnap.data().name || "",
          studentId: item.studentId,
          value: item.value,
          teacherId: session.teacherId,
          teacherCode: session.teacherCode,
          teacherName: session.teacherName,
          inputMethod,
          syncStatus: "MENUNGGU",
          updatedAt: now,
        }, { merge: true });
      }

      await batch.commit();
    }

    // Queue terpisah untuk tahap sinkronisasi Google Sheets.
    await db.collection("sync_queue").doc(batchId).set({
      id: batchId,
      batchId,
      type: "GRADES_TO_GOOGLE_SHEETS",
      classId,
      subjectId,
      teacherId: session.teacherId,
      schoolYear: session.schoolYear || process.env.SCHOOL_YEAR || "2026-2027",
      status: "MENUNGGU",
      createdAt: now,
      updatedAt: now,
    });

    await writeAudit({ session, action: "GRADES_SAVED", resourceType: "grade_batch", resourceId: batchId, details: { classId, subjectId, saved: cleanGrades.length, inputMethod } });

    return Response.json({
      success: true,
      batchId,
      saved: cleanGrades.length,
      message: "Nilai berhasil disimpan ke Firestore.",
    });
  } catch (err) {
    console.error("SAVE GRADES ERROR:", err);
    return Response.json({
      success: false,
      message: err?.message || "Gagal menyimpan nilai.",
    }, { status: 500 });
  }
}
