import { cookies } from 'next/headers';
import { db } from '@/lib/firebase-admin';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-session';
import { readRekap, writeRekapCells } from '@/lib/google-sheets';
import { detectRekap, normalize } from '@/lib/rekap-detector';
import { archiveSpreadsheet } from '@/lib/google-drive';
import { canTeach } from '@/lib/authorization';
import { writeAudit } from '@/lib/audit-log';

const clean=v=>String(v??'').trim();
const schoolYearDefault=()=>process.env.SCHOOL_YEAR||'2026-2027';

export async function POST(request){
  let queueRef=null;
  try{
    const token=(await cookies()).get(SESSION_COOKIE_NAME)?.value;
    const session=verifySessionToken(token);
    if(!session) return Response.json({success:false,message:'Sesi login tidak valid.'},{status:401});
    const body=await request.json().catch(()=>({}));
    const batchId=clean(body.batchId);
    if(!batchId) return Response.json({success:false,message:'batchId wajib dikirim.'},{status:400});
    queueRef=db.collection('sync_queue').doc(batchId);
    const qs=await queueRef.get();
    if(!qs.exists) return Response.json({success:false,message:'Antrean tidak ditemukan.'},{status:404});
    const queue=qs.data();
    if(queue.teacherId!==session.teacherId) return Response.json({success:false,message:'Antrean bukan milik guru yang login.'},{status:403});
    const batchRef=db.collection('grade_batches').doc(batchId);
    const bs=await batchRef.get(); if(!bs.exists) throw new Error('Batch nilai tidak ditemukan.');
    const batch=bs.data();
    if(!(await canTeach(session,batch.classId,batch.subjectId))) return Response.json({success:false,message:'Guru tidak memiliki penugasan aktif untuk kelas/mapel ini.'},{status:403});
    await queueRef.set({status:'DIPROSES',startedAt:new Date(),updatedAt:new Date(),error:null},{merge:true});
    const cs=await db.collection('classes').doc(batch.classId).get(); if(!cs.exists) throw new Error('Kelas tidak ditemukan.');
    const cls=cs.data();
    const spreadsheetId=clean(cls.spreadsheetId||cls.spreadsheet_id);
    if(!spreadsheetId) throw new Error(`Kelas ${cls.name||batch.classId} belum memiliki spreadsheetId.`);
    const sheetName=clean(cls.spreadsheetSheet||cls.spreadsheet_sheet||'Rekap')||'Rekap';
    const ss=await db.collection('subjects').doc(batch.subjectId).get(); if(!ss.exists) throw new Error('Mata pelajaran tidak ditemukan.');
    const subject=ss.data(); const subjectName=clean(batch.subjectName||subject.name);
    const studentsSnap=await db.collection('students').where('classId','==',batch.classId).get();
    const students=new Map(studentsSnap.docs.map(d=>[d.id,{id:d.id,...d.data()}]));
    const gradesSnap=await db.collection('grades').where('batchId','==',batchId).get();
    const grades=gradesSnap.docs.map(d=>({id:d.id,...d.data()}));
    if(!grades.length) throw new Error('Tidak ada nilai pada batch.');
    const {values}=await readRekap(spreadsheetId,sheetName);
    const layout=detectRekap(values,[subjectName]);
    if(!layout.headerRow && layout.headerRow!==0) throw new Error('Header mata pelajaran pada Rekap tidak terdeteksi.');
    const subjectInfo=layout.subjectColumns[normalize(subjectName)];
    if(!subjectInfo) throw new Error(`Kolom mata pelajaran "${subjectName}" tidak ditemukan pada Rekap.`);
    const byNisn=new Map(),byNis=new Map(),byName=new Map();
    for(const r of layout.students){if(r.nisn)byNisn.set(normalize(r.nisn),r);if(r.nis)byNis.set(normalize(r.nis),r);if(r.name)byName.set(normalize(r.name),r);}
    const cells=[],matched=[],unmatched=[];
    for(const g of grades){const s=students.get(g.studentId);if(!s){unmatched.push({studentId:g.studentId,reason:'Siswa tidak ditemukan di Firestore'});continue;}const row=(s.nisn&&byNisn.get(normalize(s.nisn)))||(s.nis&&byNis.get(normalize(s.nis)))||byName.get(normalize(s.name));if(!row){unmatched.push({studentId:g.studentId,name:s.name||'',reason:'Siswa tidak ditemukan di Rekap'});continue;}cells.push({a1:`${subjectInfo.a1Column}${row.row+1}`,value:g.value==null?'':g.value});matched.push({studentId:g.studentId,row:row.row+1});}
    if(!cells.length) throw new Error('Tidak ada siswa yang cocok dengan Rekap.');
    const result=await writeRekapCells(spreadsheetId,sheetName,cells); const now=new Date();
    const wb=db.batch();
    for(const g of grades){const m=matched.find(x=>x.studentId===g.studentId);wb.set(db.collection('grades').doc(g.id),{syncStatus:m?'SELESAI':'GAGAL',sheetRow:m?.row||null,syncedAt:m?now:null,syncError:m?null:'Siswa tidak ditemukan di Rekap'},{merge:true});}
    wb.set(batchRef,{syncStatus:unmatched.length?'SEBAGIAN':'SELESAI',updatedAt:now,syncedAt:now,matchedRows:matched.length,unmatchedRows:unmatched.length,updatedCells:result.updatedCells},{merge:true}); await wb.commit();
    await queueRef.set({status:unmatched.length?'SEBAGIAN':'SELESAI',finishedAt:now,updatedAt:now,matchedRows:matched.length,unmatchedRows:unmatched.length,updatedCells:result.updatedCells,error:unmatched.length?`${unmatched.length} siswa tidak cocok dengan Rekap.`:null},{merge:true});
    await writeAudit({session,action:'GRADES_SYNCED',resourceType:'grade_batch',resourceId:batchId,details:{classId:batch.classId,subjectId:batch.subjectId,matched:matched.length,unmatched:unmatched.length,updatedCells:result.updatedCells}});
    let archive=null,archiveError=null;
    if(String(process.env.AUTO_ARCHIVE_DRIVE||'true').toLowerCase()!=='false'){try{archive=await archiveSpreadsheet({spreadsheetId,schoolYear:batch.schoolYear||schoolYearDefault(),unitName:cls.unit||cls.jenjang||'Tanpa Unit',className:cls.name||batch.className||batch.classId,batchId,sourceName:`${batch.teacherName||'Guru'} - ${subjectName}`});await batchRef.set({archiveStatus:'SELESAI',archiveId:archive.archiveId,archiveName:archive.archiveName,archiveUrl:archive.archiveUrl||null,archiveFolderId:archive.folderId,archivedAt:now},{merge:true});}catch(e){archiveError=e?.message||'Gagal arsip Drive';await batchRef.set({archiveStatus:'GAGAL',archiveError},{merge:true});}}
    return Response.json({success:true,batchId,status:unmatched.length?'SEBAGIAN':'SELESAI',updatedCells:result.updatedCells,matched:matched.length,unmatched:unmatched.length,unmatchedRows:unmatched,archive,archiveError});
  }catch(err){console.error('SYNC ERROR',err);if(queueRef)await queueRef.set({status:'GAGAL',error:err?.message||'Gagal sinkronisasi.',updatedAt:new Date()},{merge:true}).catch(()=>{});return Response.json({success:false,message:err?.message||'Gagal sinkronisasi Google Sheets.'},{status:500});}
}
