import { db } from "@/lib/firebase-admin";
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const classId = String(searchParams.get("classId") || "").trim();

    if (!classId) {
      return Response.json({ success: false, message: "Kelas wajib dipilih." }, { status: 400 });
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
