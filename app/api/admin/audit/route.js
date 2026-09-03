import { db } from '../../../../lib/firebase-admin';
import { requireAdmin } from '../../../../lib/admin-auth';

export async function GET(request){
  const a=await requireAdmin(); if(!a.ok)return Response.json({success:false,message:a.message},{status:a.status});
  const {searchParams}=new URL(request.url);
  const limit=Math.min(Math.max(Number(searchParams.get('limit')||100),1),300);
  const snap=await db.collection('audit_logs').orderBy('createdAt','desc').limit(limit).get();
  return Response.json({success:true,items:snap.docs.map(d=>({id:d.id,...d.data()}))});
}
