import { cookies } from 'next/headers';
import { db } from '../../../lib/firebase-admin';
import { verifySessionToken, SESSION_COOKIE_NAME } from '../../../lib/auth-session';
export async function GET(){const token=(await cookies()).get(SESSION_COOKIE_NAME)?.value;const session=verifySessionToken(token);if(!session)return Response.json({success:false,message:'Belum login.'},{status:401});const s=await db.collection('teachers').doc(session.teacherId).get();return Response.json({success:true,teacher:{id:session.teacherId,...(s.exists?s.data():{}),name:session.teacherName||s.data()?.name||''},session});}
