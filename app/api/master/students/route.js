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
    const classId = String(searchParams.get("classId") || "").trim();

    if (!classId) {
      return Response.json({ success: false, message: "Kelas wajib dipilih." }, { status: 400 });
    }

    const assignments = await getAccessibleAssignments(session);
    const allowed = assignments.some(a => String(a.classId || "") === classId);

    if (!allowed) {
      return Response.json({ success: false, message: "Anda tidak memiliki akses ke kelas ini." }, { status: 403 });
    }

    const snap = await db.collection("students").orderBy("name").get();
    const students = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(x => String(x.classId || "") === classId);

    return Response.json({ success: true, students });
  } catch (err) {
    console.error("STUDENTS ERROR", err);
    return Response.json({ success: false, message: err?.message || "Gagal mengambil siswa." }, { status: 500 });
  }
}
