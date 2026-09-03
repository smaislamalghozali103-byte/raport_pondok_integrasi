import { db } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/admin-auth';
import { writeAudit } from '@/lib/audit-log';

const collections=['teachers','units','classes','subjects','students','teacher_assignments'];
const serialize=v=>{
  if(v?.toDate) return v.toDate().toISOString();
  if(Array.isArray(v)) return v.map(serialize);
  if(v && typeof v==='object') return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,serialize(x)]));
  return v;
};

export async function GET(){
  const a=await requireAdmin(); if(!a.ok)return Response.json({success:false,message:a.message},{status:a.status});
  const data={};
  for(const name of collections){
    const snap=await db.collection(name).get();
    data[name]=snap.docs.map(d=>({id:d.id,...serialize(d.data())}));
  }
  await writeAudit({session:a.session,action:'CONFIG_BACKUP_EXPORTED',resourceType:'system',details:{collections}});
  return Response.json({success:true,createdAt:new Date().toISOString(),data});
}
