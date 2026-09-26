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
    if (!jenjang) {
      return Response.json({ success: false, message: "Jenjang wajib dipilih." }, { status: 400 });
    }

    const assignments = await getAccessibleAssignments(session);
    const allowedClassIds = new Set(
      assignments
        .filter(a => String(a.unit || a.jenjang || "").trim().toLowerCase() === jenjang.toLowerCase())
        .map(a => String(a.classId || "").trim())
        .filter(Boolean)
    );

    const snap = await db.collection("classes").orderBy("name").get();
    const classes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(x =>
        String(x.status || "").trim().toUpperCase() === "AKTIF" &&
        String(x.jenjang || "").trim().toLowerCase() === jenjang.toLowerCase() &&
        allowedClassIds.has(String(x.id))
      );

    return Response.json({ success: true, classes });
  } catch (err) {
    console.error("CLASSES ERROR", err);
    return Response.json({ success: false, message: err?.message || "Gagal mengambil kelas." }, { status: 500 });
  }
}
