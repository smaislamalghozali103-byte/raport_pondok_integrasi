import { cookies } from 'next/headers';
import { db } from '../../../../lib/firebase-admin';
import { verifySessionToken, SESSION_COOKIE_NAME } from '../../../../lib/auth-session';
import { archiveSpreadsheet } from '../../../../lib/google-drive';

const clean=v=>String(v??'').trim();

export async function POST(request){
  try{
    const token=(await cookies()).get(SESSION_COOKIE_NAME)?.value;
    const session=verifySessionToken(token);
    if(!session) return Response.json({success:false,message:'Sesi login tidak valid.'},{status:401});
    const body=await request.json().catch(()=>({}));
    const batchId=clean(body.batchId);
    if(!batchId) return Response.json({success:false,message:'batchId wajib dikirim.'},{status:400});
    const batchRef=db.collection('grade_batches').doc(batchId);
    const batchSnap=await batchRef.get();
    if(!batchSnap.exists) return Response.json({success:false,message:'Batch nilai tidak ditemukan.'},{status:404});
    const batch=batchSnap.data();
    if(batch.teacherId && batch.teacherId!==session.teacherId) return Response.json({success:false,message:'Batch ini bukan milik guru yang sedang login.'},{status:403});
    if(batch.archiveId) return Response.json({success:true,status:'SUDAH_DIARSIPKAN',archiveId:batch.archiveId,archiveUrl:batch.archiveUrl||null,message:'Batch ini sudah memiliki arsip Google Drive.'});

    const classSnap=await db.collection('classes').doc(batch.classId).get();
    if(!classSnap.exists) throw new Error('Kelas batch tidak ditemukan.');
    const cls=classSnap.data();
    const teacherSnap=batch.teacherId?await db.collection('teachers').doc(batch.teacherId).get():null;
    const teacher=teacherSnap?.exists?teacherSnap.data():{};
    const result=await archiveSpreadsheet({
      spreadsheetId:clean(cls.spreadsheetId),
      schoolYear:clean(batch.schoolYear||cls.schoolYear||process.env.SCHOOL_YEAR||'2026-2027'),
      unitName:clean(cls.unit||cls.jenjang||'Tanpa Unit'),
      className:clean(cls.name||batch.className||batch.classId),
      batchId,
      sourceName:clean(`${teacher.name||batch.teacherName||'Guru'} - ${batch.subjectName||batch.subjectId||''}`)
    });
    const now=new Date();
    await batchRef.set({archiveStatus:'SELESAI',archiveId:result.archiveId,archiveName:result.archiveName,archiveUrl:result.archiveUrl||null,archiveFolderId:result.folderId,archivedAt:now,updatedAt:now},{merge:true});
    return Response.json({success:true,status:'SELESAI',...result});
  }catch(err){
    console.error('DRIVE ARCHIVE ERROR:',err);
    return Response.json({success:false,message:err?.message||'Gagal mengarsipkan ke Google Drive.'},{status:500});
  }
}
