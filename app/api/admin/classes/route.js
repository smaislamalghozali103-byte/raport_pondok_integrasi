import { db } from '../../../../lib/firebase-admin';
export const dynamic = 'force-dynamic';
import { requireAdmin } from '../../../../lib/admin-auth';
import { spreadsheetIdFromUrl, readSheet } from '../../../../lib/google-sheets';

const clean=v=>String(v??'').trim();

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return Response.json({success:false,message:auth.message},{status:auth.status});
    const snap = await db.collection('classes').orderBy('name').get();
    const classes = snap.docs.map(d=>({id:d.id,...d.data()}));
    return Response.json({success:true,classes});
  } catch(e) { return Response.json({success:false,message:e.message||'Gagal mengambil kelas.'},{status:500}); }
}

export async function PATCH(request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return Response.json({success:false,message:auth.message},{status:auth.status});
    const body=await request.json();
    const classId=clean(body.classId), raw=clean(body.spreadsheetId||body.spreadsheetUrl), sheetName=clean(body.sheetName||'Rekap')||'Rekap';
    if(!classId||!raw) return Response.json({success:false,message:'Kelas dan Spreadsheet ID/URL wajib diisi.'},{status:400});
    const id=spreadsheetIdFromUrl(raw);
    const ref=db.collection('classes').doc(classId); const snap=await ref.get();
    if(!snap.exists) return Response.json({success:false,message:'Kelas tidak ditemukan.'},{status:404});
    await ref.set({spreadsheetId:id,spreadsheetSheet:sheetName,updatedAt:new Date(),updatedBy:auth.session.teacherId},{merge:true});
    return Response.json({success:true,spreadsheetId:id,sheetName});
  } catch(e) { return Response.json({success:false,message:e.message||'Gagal menyimpan Spreadsheet.'},{status:500}); }
}

export async function POST(request) {
  try {
    const auth=await requireAdmin();
    if(!auth.ok) return Response.json({success:false,message:auth.message},{status:auth.status});
    const body=await request.json();
    const classId=clean(body.classId), raw=clean(body.spreadsheetId||body.spreadsheetUrl), sheetName=clean(body.sheetName||'Rekap')||'Rekap';
    if(!classId||!raw) return Response.json({success:false,message:'Kelas dan Spreadsheet ID/URL wajib diisi.'},{status:400});
    const id=spreadsheetIdFromUrl(raw);
    const result=await readSheet(id,sheetName,'A:Z');
    return Response.json({success:true,spreadsheetId:result.spreadsheetId,sheetName,rows:result.values.length,columns:Math.max(0,...result.values.map(r=>r.length))});
  } catch(e) { return Response.json({success:false,message:e.message||'Koneksi Google Sheets gagal.'},{status:500}); }
}
