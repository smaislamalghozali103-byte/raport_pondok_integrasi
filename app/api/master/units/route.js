import { db } from "../../../../lib/firebase-admin";
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snap = await db.collection("units").orderBy("name").get();
    const units = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(x => String(x.status || "").trim().toUpperCase() === "AKTIF");
    return Response.json({ success: true, units });
  } catch (err) {
    console.error("UNITS ERROR", err);
    return Response.json({ success: false, message: err?.message || "Gagal mengambil jenjang." }, { status: 500 });
  }
}
