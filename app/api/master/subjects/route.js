import { db } from "@/lib/firebase-admin";
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const jenjang = String(searchParams.get("jenjang") || "").trim();
    const classId = String(searchParams.get("classId") || "").trim();

    if (!jenjang || !classId) {
      return Response.json({ success: false, message: "Jenjang dan kelas wajib dipilih." }, { status: 400 });
    }

    const snap = await db.collection("subjects").orderBy("name").get();
    const subjects = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(x =>
        String(x.status || "").trim().toUpperCase() === "AKTIF" &&
        String(x.unit || "").trim().toLowerCase() === jenjang.toLowerCase()
      );

    return Response.json({ success: true, subjects });
  } catch (err) {
    console.error("SUBJECTS ERROR", err);
    return Response.json({ success: false, message: err?.message || "Gagal mengambil mata pelajaran." }, { status: 500 });
  }
}
