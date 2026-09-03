import { cookies } from 'next/headers';
import { db } from '@/lib/firebase-admin';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-session';
import { readRekap, writeRekapCells } from '@/lib/google-sheets';
import { detectRekap, normalize, colLetter } from '@/lib/rekap-detector';
import { archiveSpreadsheet } from '@/lib/google-drive';

const clean=v=>String(v??'').trim();
const schoolYearDefault=()=>process.env.SCHOOL_YEAR||'2026-2027';

export async function POST(request){
  let queueRef;
  try{
    const token=(await cookies()).get(SESSION_COOKIE_NAME)?.value;
    const session=verifySessionToken(token);
    if(!session) return Response.json({success:false,message:'Sesi login tidak valid.'},{status:401});
    const body=await request.json().catch(()=>({}));
    const batchId=clean(body.batchId);
    if(!batchId) return Response.json({success:false,message:'batchId wajib dikirim.'},{status:400});

    queueRef=db.collection('sync_queue').doc(batchId);
    const queueSnap=await queueRef.get();
    if(!queueSnap.exists) return Response.json({success:false,message:'Antrean sinkronisasi tidak ditemukan.'},{status:404});
    const queue=queueSnap.data();
    if(queue.teacherId && queue.teacherId!==session.teacherId) return Response.json({success:false,message:'Antrean ini bukan milik guru yang sedang login.'},{status:403});
    if(queue.type!=='GRADES_TO_GOOGLE_SHEETS') return Response.json({success:false,message:'Jenis antrean tidak didukung.'},{status:400});
    if(['SELESAI','BERHASIL'].includes(String(queue.status).toUpperCase())) return Response.json({success:true,batchId,status:'SELESAI',message:'Batch sudah tersinkron.'});

    await queueRef.set({status:'DIPROSES',startedAt:new Date(),updatedAt:new Date(),error:null},{merge:true});

    const batchSnap=await db.collection('grade_batches').doc(batchId).get();
    if(!batchSnap.exists) throw new Error('Grade batch tidak ditemukan.');
    const batch=batchSnap.data();
    const classSnap=await db.collection('classes').doc(batch.classId).get();
    if(!classSnap.exists) throw new Error('Kelas batch tidak ditemukan.');
    const cls=classSnap.data();
    const spreadsheetId=clean(cls.spreadsheetId||cls.spreadsheet_id||'');
    if(!spreadsheetId) throw new Error(`Kelas ${cls.name||batch.classId} belum memiliki spreadsheetId Google Sheets.`);
    const sheetName=clean(cls.spreadsheetSheet||cls.spreadsheet_sheet||'Rekap')||'Rekap';

    const subjectSnap=await db.collection('subjects').doc(batch.subjectId).get();
    if(!subjectSnap.exists) throw new Error('Mata pelajaran batch tidak ditemukan.');
    const subject=subjectSnap.data();
    const subjectName=clean(batch.subjectName||subject.name);

    const studentDocs=await db.collection('students').where('classId','==',batch.classId).get();
    const studentById=new Map();
    for(const d of studentDocs.docs) studentById.set(d.id,{id:d.id,...d.data()});
    const gradesSnap=await db.collection('grades').where('batchId','==',batchId).get();
    const grades=gradesSnap.docs.map(d=>({id:d.id,...d.data()}));
    if(!grades.length) throw new Error('Tidak ada nilai pada batch.');

    const { values } = await readRekap(spreadsheetId, sheetName);
    const allSubjectsSnap = await db.collection('subjects').where('status', '==', 'AKTIF').get();
    const allSubjectNames = allSubjectsSnap.docs.map(d => d.data().name).filter(Boolean);
    const subjectList = Array.from(new Set([subjectName, ...allSubjectNames]));

    const layout = detectRekap(values, subjectList);
    let subjectInfo = layout.subjectColumns[normalize(subjectName)];

    if (!subjectInfo) {
      const normTarget = normalize(subjectName);
      const foundKey = Object.keys(layout.subjectColumns).find(k => k.includes(normTarget) || normTarget.includes(k));
      if (foundKey) {
        subjectInfo = layout.subjectColumns[foundKey];
      }
    }

    if (!subjectInfo) {
      const layoutRef = db.collection('rekap_layouts').doc(`${batch.classId}__${batch.schoolYear || schoolYearDefault()}__${sheetName}`.replace(/[^a-zA-Z0-9_-]/g, '_'));
      const lSnap = await layoutRef.get();
      if (lSnap.exists) {
        const sm = lSnap.data().subjectMapping || {};
        subjectInfo = sm[normalize(subjectName)] || Object.values(sm).find(x => normalize(x.name || '').includes(normalize(subjectName)));
      }
    }

    if (!subjectInfo) {
      const headerRow = values[layout.headerRow] || [];
      for (let c = 0; c < headerRow.length; c++) {
        const cell = normalize(headerRow[c]);
        if (cell && (cell.includes(normalize(subjectName)) || normalize(subjectName).includes(cell))) {
          subjectInfo = { column: c, a1Column: colLetter(c), name: headerRow[c] };
          break;
        }
      }
    }

    if (!subjectInfo) {
      throw new Error(`Kolom mata pelajaran "${subjectName}" tidak ditemukan pada sheet ${sheetName}.`);
    }

    const byNisn = new Map(), byNis = new Map(), byName = new Map(), byRow = new Map();
    for (const s of layout.students) {
      if (s.nisn) byNisn.set(normalize(s.nisn), s);
      if (s.nis) byNis.set(normalize(s.nis), s);
      if (s.name) byName.set(normalize(s.name), s);
      byRow.set(s.row + 1, s);
    }
    const cells = []; const matched = []; const unmatched = [];
    for (const g of grades) {
      const student = studentById.get(g.studentId);
      if (!student) { unmatched.push({ studentId: g.studentId, reason: 'Siswa tidak ditemukan di database' }); continue; }
      const target = student.nisn ? byNisn.get(normalize(student.nisn)) : null;
      const target2 = !target && student.nis ? byNis.get(normalize(student.nis)) : null;
      const target3 = !target && !target2 && student.name ? byName.get(normalize(student.name)) : null;
      const target4 = !target && !target2 && !target3 && student.rekapRow ? byRow.get(student.rekapRow) : null;
      const row = target || target2 || target3 || target4;
      if (!row) { unmatched.push({ studentId: g.studentId, name: student.name || '', reason: 'Siswa tidak ditemukan di baris Rekap' }); continue; }
      const value = g.value === null || g.value === undefined ? '' : g.value;
      cells.push({ a1: `${subjectInfo.a1Column}${row.row + 1}`, value });
      matched.push({ studentId: g.studentId, name: student.name || row.name, row: row.row + 1, value });
    }
    if (!cells.length) throw new Error('Tidak ada siswa yang cocok dengan baris Rekap.');
    const result = await writeRekapCells(spreadsheetId, sheetName, cells);
    const now=new Date();
    const gradeBatch=db.batch();
    for(const g of grades){
      const m=matched.find(x=>x.studentId===g.studentId);
      gradeBatch.set(db.collection('grades').doc(g.id),{syncStatus:m?'SELESAI':'GAGAL',sheetRow:m?.row||null,syncedAt:m?now:null,syncError:m?null:'Siswa tidak ditemukan di Rekap'},{merge:true});
    }
    gradeBatch.set(db.collection('grade_batches').doc(batchId),{syncStatus:unmatched.length?'SEBAGIAN':'SELESAI',status:'TERSIMPAN',updatedAt:now,syncedAt:now,matchedRows:matched.length,unmatchedRows:unmatched.length,updatedCells:result.updatedCells},{merge:true});
    await gradeBatch.commit();
    await queueRef.set({status:unmatched.length?'SEBAGIAN':'SELESAI',finishedAt:now,updatedAt:now,matchedRows:matched.length,unmatchedRows:unmatched.length,updatedCells:result.updatedCells,error:unmatched.length?`${unmatched.length} siswa tidak cocok dengan Rekap.`:null},{merge:true});

    let archive=null;
    let archiveError=null;
    if(String(process.env.AUTO_ARCHIVE_DRIVE||'true').toLowerCase()!=='false'){
      try{
        const teacherSnap=queue.teacherId?await db.collection('teachers').doc(queue.teacherId).get():null;
        const teacher=teacherSnap?.exists?teacherSnap.data():{};
        archive=await archiveSpreadsheet({
          spreadsheetId,
          schoolYear:batch.schoolYear||cls.schoolYear||schoolYearDefault(),
          unitName:cls.unit||cls.jenjang||'Tanpa Unit',
          className:cls.name||batch.className||batch.classId,
          batchId,
          sourceName:`${teacher.name||batch.teacherName||'Guru'} - ${subjectName}`
        });
        await batchSnap.ref.set({archiveStatus:'SELESAI',archiveId:archive.archiveId,archiveName:archive.archiveName,archiveUrl:archive.archiveUrl||null,archiveFolderId:archive.folderId,archivedAt:now,updatedAt:now},{merge:true});
      }catch(e){
        archiveError=e?.message||'Gagal mengarsipkan ke Google Drive.';
        await batchSnap.ref.set({archiveStatus:'GAGAL',archiveError,updatedAt:now},{merge:true});
      }
    }
    return Response.json({success:true,batchId,status:unmatched.length?'SEBAGIAN':'SELESAI',updatedCells:result.updatedCells,matched:matched.length,unmatched:unmatched.length,unmatchedRows:unmatched,archive,archiveError});
  }catch(err){
    console.error('SYNC QUEUE ERROR:',err);
    if(queueRef) await queueRef.set({status:'GAGAL',error:err?.message||'Gagal sinkronisasi.',updatedAt:new Date()},{merge:true}).catch(()=>{});
    return Response.json({success:false,message:err?.message||'Gagal sinkronisasi Google Sheets.'},{status:500});
  }
}
