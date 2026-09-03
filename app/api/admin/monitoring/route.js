import { db } from '../../../../../lib/firebase-admin';
import { requireAdmin } from '../../../../../lib/admin-auth';
export async function GET(){
 const a=await requireAdmin(); if(!a.ok)return Response.json({success:false,message:a.message},{status:a.status});
 const [bs,qs,ts,cs,ss,logs]=await Promise.all([
  db.collection('grade_batches').orderBy('createdAt','desc').limit(200).get(),
  db.collection('sync_queue').orderBy('updatedAt','desc').limit(200).get(),
  db.collection('teachers').get(),db.collection('classes').get(),db.collection('subjects').get(),
  db.collection('audit_logs').orderBy('createdAt','desc').limit(20).get()
 ]);
 const tm=new Map(ts.docs.map(d=>[d.id,d.data()])),cm=new Map(cs.docs.map(d=>[d.id,d.data()])),sm=new Map(ss.docs.map(d=>[d.id,d.data()]));
 const batches=bs.docs.map(d=>{const b={id:d.id,...d.data()};return {...b,teacherName:tm.get(b.teacherId)?.name||b.teacherName||'-',className:cm.get(b.classId)?.name||b.className||'-',subjectName:sm.get(b.subjectId)?.name||b.subjectName||'-'};});
 return Response.json({success:true,batches,queue:qs.docs.map(d=>({id:d.id,...d.data()})),recentAudit:logs.docs.map(d=>({id:d.id,...d.data()})),counts:{teachers:ts.size,classes:cs.size,subjects:ss.size,batches:bs.size,queue:qs.size}});
}
