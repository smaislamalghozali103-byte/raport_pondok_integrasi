import { cookies } from 'next/headers';
import { db } from '../../../lib/firebase-admin';
import { verifySessionToken, SESSION_COOKIE_NAME } from '../../../lib/auth-session';
export async function GET(){const session=verifySessionToken((await cookies()).get(SESSION_COOKIE_NAME)?.value);if(!session)return Response.json({success:false,message:'Belum login.'},{status:401});let snap=await db.collection('teacher_assignments').where('teacherId','==',session.teacherId).get();if(snap.empty)snap=await db.collection('assignments').where('teacherId','==',session.teacherId).get();const assignments=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>String(x.status||'').toUpperCase()==='AKTIF');return Response.json({success:true,assignments});}
