import { cookies } from "next/headers";
import { db } from "@/lib/firebase-admin";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { getHomeroomClassIds, normalizeRole } from "@/lib/authorization";

export const dynamic = "force-dynamic";

function serialize(value) {
  if (!value) return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value?._seconds) return new Date(value._seconds * 1000).toISOString();
  return value;
}

export async function GET() {
  try {
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    const session = verifySessionToken(token);

    if (!session) {
      return Response.json({ success: false, message: "Belum login." }, { status: 401 });
    }

    if (normalizeRole(session.role) !== "wali_kelas") {
      return Response.json({ success: false, message: "Menu monitoring hanya untuk Wali Kelas." }, { status: 403 });
    }

    const classIds = await getHomeroomClassIds(session);

    if (!classIds.length) {
      return Response.json({
        success: true,
        classes: [],
        batches: [],
        summary: { totalClasses: 0, totalBatches: 0, totalStudents: 0, filledStudents: 0 }
      });
    }

    const classChunks = [];
    for (let i = 0; i < classIds.length; i += 30) {
      classChunks.push(classIds.slice(i, i + 30));
    }

    const batchMap = new Map();

    for (const chunk of classChunks) {
      const snap = await db.collection("grade_batches")
        .where("classId", "in", chunk)
        .get();

      for (const doc of snap.docs) {
        const data = doc.data() || {};
        batchMap.set(doc.id, {
          id: doc.id,
          ...data,
          createdAt: serialize(data.createdAt),
          updatedAt: serialize(data.updatedAt)
        });
      }
    }

    const classesSnap = await db.collection("classes").get();
    const classes = classesSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => classIds.includes(String(c.id)))
      .map(c => ({
        id: c.id,
        name: c.name || c.id,
        jenjang: c.jenjang || c.unit || ""
      }));

    const batches = [...batchMap.values()].sort((a, b) =>
      String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))
    );

    const byClass = new Map();
    for (const b of batches) {
      const key = String(b.classId);
      if (!byClass.has(key)) {
        byClass.set(key, { totalRows: 0, subjects: new Set(), teachers: new Set() });
      }
      const item = byClass.get(key);
      item.totalRows += Number(b.totalRows || b.matchedRows || 0);
      if (b.subjectName) item.subjects.add(String(b.subjectName));
      if (b.teacherName) item.teachers.add(String(b.teacherName));
    }

    const classSummary = classes.map(c => {
      const x = byClass.get(String(c.id)) || { totalRows: 0, subjects: new Set(), teachers: new Set() };
      return {
        ...c,
        inputCount: x.totalRows,
        subjectCount: x.subjects.size,
        subjects: [...x.subjects],
        teachers: [...x.teachers]
      };
    });

    return Response.json({
      success: true,
      classes: classSummary,
      batches,
      summary: {
        totalClasses: classes.length,
        totalBatches: batches.length,
        totalStudents: batches.reduce((n, b) => n + Number(b.totalRows || 0), 0),
        filledStudents: batches.reduce((n, b) => n + Number(b.matchedRows || b.totalRows || 0), 0)
      }
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("HOMEROOM MONITORING ERROR", err);
    return Response.json({
      success: false,
      message: err?.message || "Gagal memuat monitoring wali kelas."
    }, { status: 500 });
  }
}
