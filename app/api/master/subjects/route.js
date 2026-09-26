import { cookies } from "next/headers";
import { db } from "@/lib/firebase-admin";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { getAccessibleAssignments } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    const session = verifySessionToken(token);

    if (!session) {
      return Response.json({ success: false, message: "Belum login." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jenjang = String(searchParams.get("jenjang") || "").trim();
    const classId = String(searchParams.get("classId") || "").trim();

    if (!jenjang || !classId) {
      return Response.json({ success: false, message: "Jenjang dan kelas wajib dipilih." }, { status: 400 });
    }

    const assignments = await getAccessibleAssignments(session);
    const allowedSubjectIds = new Set(
      assignments
        .filter(a =>
          String(a.classId || "") === classId &&
          String(a.unit || a.jenjang || "").trim().toLowerCase() === jenjang.toLowerCase()
        )
        .map(a => String(a.subjectId || "").trim())
        .filter(Boolean)
    );

    const snap = await db.collection("subjects").orderBy("name").get();
    const subjects = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(x =>
        String(x.status || "").trim().toUpperCase() === "AKTIF" &&
        String(x.unit || "").trim().toLowerCase() === jenjang.toLowerCase() &&
        allowedSubjectIds.has(String(x.id))
      );

    return Response.json({ success: true, subjects });
  } catch (err) {
    console.error("SUBJECTS ERROR", err);
    return Response.json({ success: false, message: err?.message || "Gagal mengambil mata pelajaran." }, { status: 500 });
  }
}
