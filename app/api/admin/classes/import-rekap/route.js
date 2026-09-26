import { requireAdmin } from '@/lib/admin-auth';
import { db } from '@/lib/firebase-admin';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-session';
import { readRekap } from '@/lib/google-sheets';
import { detectRekap, normalize } from '@/lib/rekap-detector';

export const dynamic = 'force-dynamic';

const clean=v=>String(v??'').trim();
export async function POST(request){
  try{
    const auth=await requireAdmin();
    if(!auth.ok) return Response.json({success:false,message:auth.message},{status:auth.status});
    const session=auth.session;
    const body=await request.json();
    const classId=clean(body.classId||body.class_id), spreadsheetId=clean(body.spreadsheetId||body.spreadsheet_id||body.spreadsheet_url);
    const sheetName=clean(body.sheetName||body.sheet_name||'Rekap')||'Rekap';
    const schoolYear=clean(body.schoolYear||body.school_year||process.env.SCHOOL_YEAR||'2026-2027');
    if(!classId||!spreadsheetId) return Response.json({success:false,message:'classId dan spreadsheetId wajib.'},{status:400});
    const classRef=db.collection('classes').doc(classId); const classSnap=await classRef.get();
    if(!classSnap.exists) return Response.json({success:false,message:'Kelas tidak ditemukan.'},{status:404});
    const cls=classSnap.data();
    const subjectsSnap=await db.collection('subjects').where('status','==','AKTIF').get();
    const subjects=subjectsSnap.docs.map(d=>({id:d.id,...d.data()}));
    const {values,spreadsheetId:resolvedId}=await readRekap(spreadsheetId,sheetName);
    const layout=detectRekap(values,subjects.map(s=>s.name));
    if(!layout.students.length) return Response.json({success:false,message:'Baris siswa pada Rekap tidak ditemukan.'},{status:400});

    const writes=[];
    for(const s of layout.students){
      const no=clean(s.no), nisn=clean(s.nisn), name=clean(s.name);
      if(!name) continue;
      const key=nisn?`nisn__${normalize(nisn)}`:`name__${normalize(name)}`;
      const ref=db.collection('students').doc(`${classId}__${key}`.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,140));
      writes.push({ref,data:{classId,schoolYear,no:no||null,name,fullName:name,nisn:nisn||null,status:'AKTIF',rekapRow:s.row+1,updatedAt:new Date()}});
    }
    for(let i=0;i<writes.length;i+=400){const b=db.batch();for(const x of writes.slice(i,i+400))b.set(x.ref,x.data,{merge:true});await b.commit();}

    const layoutRef=db.collection('rekap_layouts').doc(`${classId}__${schoolYear}__${sheetName}`.replace(/[^a-zA-Z0-9_-]/g,'_'));
    await layoutRef.set({classId,schoolYear,sheetName,headerRow:layout.headerRow,noColumn:layout.noColumn??-1,nameColumn:layout.nameColumn,idColumn:layout.idColumn,subjectMapping:layout.subjectColumns,studentRowMapping:layout.students,status:'DETECTED',detectedAt:new Date(),spreadsheetId:resolvedId},{merge:true});
    await classRef.set({spreadsheetId:resolvedId,spreadsheetSheet:sheetName,schoolYear,updatedAt:new Date()},{merge:true});
    return Response.json({success:true,spreadsheetId:resolvedId,class:cls.name||classId,studentsImported:writes.length,headerRow:layout.headerRow+1,subjectsDetected:Object.keys(layout.subjectColumns).length});
  }catch(err){console.error('IMPORT REKAP ERROR',err);return Response.json({success:false,message:err?.message||'Gagal impor Rekap.'},{status:500});}
}
