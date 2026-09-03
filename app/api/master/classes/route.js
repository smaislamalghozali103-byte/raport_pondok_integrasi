import { db } from "@/lib/firebase-admin";
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const jenjang = String(searchParams.get("jenjang") || "").trim();
    if (!jenjang) return Response.json({ success: false, message: "Jenjang wajib dipilih." }, { status: 400 });

    const snap = await db.collection("classes").orderBy("name").get();
    const classes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(x =>
        String(x.status || "").trim().toUpperCase() === "AKTIF" &&
        String(x.jenjang || "").trim().toLowerCase() === jenjang.toLowerCase()
      );

    return Response.json({ success: true, classes });
  } catch (err) {
    console.error("CLASSES ERROR", err);
    return Response.json({ success: false, message: err?.message || "Gagal mengambil kelas." }, { status: 500 });
  }
}
