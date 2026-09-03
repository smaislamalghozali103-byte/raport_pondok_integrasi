import { cookies } from 'next/headers';
import { db } from '../../../../lib/firebase-admin';
import { verifySessionToken, SESSION_COOKIE_NAME } from '../../../../lib/auth-session';
export async function GET(){
  try{
    const token=(await cookies()).get(SESSION_COOKIE_NAME)?.value; const session=verifySessionToken(token);
    if(!session) return Response.json({success:false,message:'Sesi login tidak valid.'},{status:401});
    const snap=await db.collection('sync_queue').where('teacherId','==',session.teacherId).orderBy('createdAt','desc').limit(20).get();
    return Response.json({success:true,items:snap.docs.map(d=>({id:d.id,...d.data()}))});
  }catch(err){return Response.json({success:false,message:err?.message||'Gagal mengambil status sinkronisasi.'},{status:500});}
}
