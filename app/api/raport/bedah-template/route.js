import { cookies } from "next/headers";
import { db } from "@/lib/firebase-admin";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { analyzeExcelStructure } from "@/lib/excel-raport-filler";
import { readRekap } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const session = verifySessionToken(token);

    if (!session) {
      return Response.json({ success: false, message: "Sesi login tidak valid." }, { status: 401 });
    }

    const contentType = request.headers.get("content-type") || "";

    // Ambil master mata pelajaran untuk referensi pencocokan
    const subjectsSnap = await db.collection("subjects").get();
    const knownSubjects = subjectsSnap.docs.map(d => ({
      id: d.id,
      name: d.data().name,
      code: d.data().code,
    }));

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") || formData.get("template");

      if (!file || typeof file === "string") {
        return Response.json({ success: false, message: "File template Excel tidak ditemukan pada request." }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const analysis = await analyzeExcelStructure(buffer, knownSubjects);

      return Response.json({
        success: true,
        sourceType: "EXCEL_FILE",
        fileName: file.name,
        fileSize: file.size,
        analysis,
        summary: {
          totalSheets: analysis.workbookSummary.totalSheets,
          sheetNames: analysis.workbookSummary.sheetNames,
          primarySheet: analysis.workbookSummary.primarySheet,
          headerRow: analysis.primaryAnalysis?.detectedHeaderRow,
          totalStudentsDetected: analysis.primaryAnalysis?.totalStudentsDetected || 0,
          detectedSubjectsCount: analysis.primaryAnalysis?.subjectColumns?.length || 0,
          hasFormulas: analysis.primaryAnalysis?.hasFormulas,
          formulaCount: analysis.primaryAnalysis?.formulaCount || 0,
          mergedCellsCount: analysis.primaryAnalysis?.mergedCellsCount || 0,
        },
      });
    }

    // Jika berupa JSON (misal Spreadsheet URL)
    const body = await request.json().catch(() => ({}));
    const { spreadsheetUrl, sheetName } = body;

    if (spreadsheetUrl) {
      const { values } = await readRekap(spreadsheetUrl, sheetName || "Rekap");
      return Response.json({
        success: true,
        sourceType: "GOOGLE_SPREADSHEET",
        totalRows: values.length,
        message: "Spreadsheet berhasil dibaca.",
      });
    }

    return Response.json({ success: false, message: "Kirim file Excel (.xlsx) atau URL Google Spreadsheet." }, { status: 400 });
  } catch (err) {
    console.error("BEDAH TEMPLATE ERROR:", err);
    return Response.json({ success: false, message: err?.message || "Gagal membedah struktur file raport." }, { status: 500 });
  }
}
