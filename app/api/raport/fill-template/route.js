import { cookies } from "next/headers";
import { db } from "@/lib/firebase-admin";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { fillExcelTemplateNonDestructive } from "@/lib/excel-raport-filler";
import { writeAudit } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const session = verifySessionToken(token);

    if (!session) {
      return Response.json({ success: false, message: "Sesi login tidak valid." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") || formData.get("template");
    const classId = String(formData.get("classId") || "").trim();
    const subjectId = String(formData.get("subjectId") || "").trim();
    const sheetName = String(formData.get("sheetName") || "").trim() || undefined;

    if (!file || typeof file === "string") {
      return Response.json({ success: false, message: "File template Excel wajib diunggah." }, { status: 400 });
    }

    if (!classId) {
      return Response.json({ success: false, message: "ID Kelas wajib dipilih." }, { status: 400 });
    }

    // Ambil data kelas
    const classSnap = await db.collection("classes").doc(classId).get();
    if (!classSnap.exists) {
      return Response.json({ success: false, message: "Kelas tidak ditemukan di database." }, { status: 404 });
    }
    const classData = classSnap.data();

    // Ambil daftar santri di kelas ini
    const studentsSnap = await db.collection("students").where("classId", "==", classId).get();
    const studentsMap = new Map();
    studentsSnap.docs.forEach(d => {
      const s = d.data();
      studentsMap.set(d.id, {
        id: d.id,
        name: s.name || s.full_name,
        nisn: s.nisn || "",
        nis: s.nis || "",
      });
    });

    // Ambil nilai dari database
    let gradesQuery = db.collection("grades").where("classId", "==", classId);
    if (subjectId) {
      gradesQuery = gradesQuery.where("subjectId", "==", subjectId);
    }
    const gradesSnap = await gradesQuery.get();

    // Ambil master subjects untuk nama mapel
    const subjectsSnap = await db.collection("subjects").get();
    const subjectsMap = new Map();
    subjectsSnap.docs.forEach(d => {
      subjectsMap.set(d.id, d.data().name);
    });

    // Kelompokkan nilai per mata pelajaran
    const groupedBySubject = new Map();

    gradesSnap.docs.forEach(doc => {
      const g = doc.data();
      const sId = g.subjectId;
      const sName = g.subjectName || subjectsMap.get(sId) || sId;

      if (!groupedBySubject.has(sId)) {
        groupedBySubject.set(sId, {
          subjectId: sId,
          subjectName: sName,
          grades: [],
        });
      }

      const st = studentsMap.get(g.studentId);
      groupedBySubject.get(sId).grades.push({
        studentId: g.studentId,
        name: st?.name || g.studentName || "",
        nisn: st?.nisn || "",
        nis: st?.nis || "",
        score: g.value,
      });
    });

    const subjectMappings = Array.from(groupedBySubject.values());

    if (subjectMappings.length === 0) {
      if (studentsMap.size === 0) {
        return Response.json(
          {
            success: false,
            message: "Tidak ada data santri yang ditemukan untuk kelas ini di database.",
          },
          { status: 400 }
        );
      }
      // Buat pemetaan roster santri agar nama dan NISN tetap terisi di template
      const defaultSubj = subjectId || "UMUM";
      const sName = subjectsMap.get(defaultSubj) || "Nilai Santri";
      const rosterGrades = Array.from(studentsMap.values()).map(st => ({
        studentId: st.id,
        name: st.name,
        nisn: st.nisn,
        nis: st.nis,
        score: "",
      }));
      subjectMappings.push({
        subjectId: defaultSubj,
        subjectName: sName,
        grades: rosterGrades,
      });
    }

    const templateBuffer = Buffer.from(await file.arrayBuffer());

    // Jalankan pengisian non-destruktif
    const result = await fillExcelTemplateNonDestructive({
      templateBuffer,
      sheetName,
      subjectMappings,
    });

    await writeAudit({
      session,
      action: "RAPORT_EXCEL_FILLED",
      resourceType: "class",
      resourceId: classId,
      details: {
        className: classData.name,
        totalUpdatedCells: result.totalUpdatedCells,
        subjectCount: subjectMappings.length,
      },
    });

    const safeClassName = (classData.name || "Kelas").replace(/[^a-zA-Z0-9_-]/g, "_");
    const downloadFileName = `Raport_Asli_Terisi_${safeClassName}.xlsx`;

    return new Response(result.outputBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${downloadFileName}"`,
        "X-Updated-Cells": String(result.totalUpdatedCells),
        "X-Sheet-Name": result.sheetName,
      },
    });
  } catch (err) {
    console.error("FILL TEMPLATE ERROR:", err);
    return Response.json({ success: false, message: err?.message || "Gagal mengisi template raport." }, { status: 500 });
  }
}
