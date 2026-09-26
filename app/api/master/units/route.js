import { cookies } from "next/headers";
import { db } from "@/lib/firebase-admin";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { getAccessibleAssignments } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    const session = verifySessionToken(token);

    if (!session) {
      return Response.json({ success: false, message: "Belum login." }, { status: 401 });
    }

    const assignments = await getAccessibleAssignments(session);
    const allowedUnits = new Set(
      assignments
        .map(a => String(a.unit || a.jenjang || "").trim().toLowerCase())
        .filter(Boolean)
    );

    const snap = await db.collection("units").orderBy("name").get();
    const units = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(x =>
        String(x.status || "").trim().toUpperCase() === "AKTIF" &&
        allowedUnits.has(String(x.name || x.code || "").trim().toLowerCase())
      );

    return Response.json({ success: true, units });
  } catch (err) {
    console.error("UNITS ERROR", err);
    return Response.json({ success: false, message: err?.message || "Gagal mengambil jenjang." }, { status: 500 });
  }
}
