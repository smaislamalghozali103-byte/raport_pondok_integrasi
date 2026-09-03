import { db } from '@/lib/firebase-admin';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-session';
import { cookies } from 'next/headers';
export async function GET(){const token=(await cookies()).get(SESSION_COOKIE_NAME)?.value;const s=verifySessionToken(token);if(!s)return Response.json({success:false,message:'Belum login.'},{status:401});const snap=await db.collection('grade_batches').where('teacherId','==',s.teacherId).orderBy('createdAt','desc').limit(100).get();return Response.json({success:true,monitoring:snap.docs.map(d=>({id:d.id,...d.data()}))});}
