import { cookies } from 'next/headers';
import { db } from '@/lib/firebase-admin';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-session';
import { requireAdmin } from '@/lib/admin-auth';
import { writeAudit } from '@/lib/audit-log';

const clean=v=>String(v??'').trim();

export async function POST(request){
  const token=(await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session=verifySessionToken(token);
  if(!session) return Response.json({success:false,message:'Belum login.'},{status:401});
  const body=await request.json().catch(()=>({}));
  const batchId=clean(body.batchId);
  if(!batchId) return Response.json({success:false,message:'batchId wajib dikirim.'},{status:400});
  const ref=db.collection('sync_queue').doc(batchId);
  const snap=await ref.get();
  if(!snap.exists) return Response.json({success:false,message:'Antrean tidak ditemukan.'},{status:404});
  const item=snap.data();
  const admin=await requireAdmin();
  if(item.teacherId!==session.teacherId && !admin.ok) return Response.json({success:false,message:'Akses ditolak.'},{status:403});
  await ref.set({status:'MENUNGGU',retryCount:Number(item.retryCount||0)+1,retryRequestedAt:new Date(),retryRequestedBy:session.teacherId,error:null,updatedAt:new Date()},{merge:true});
  await writeAudit({session,action:'SYNC_RETRY_REQUESTED',resourceType:'sync_queue',resourceId:batchId,details:{previousStatus:item.status||null}});
  return Response.json({success:true,batchId,status:'MENUNGGU',message:'Batch dimasukkan kembali ke antrean. Jalankan endpoint sinkronisasi untuk memprosesnya.'});
}
