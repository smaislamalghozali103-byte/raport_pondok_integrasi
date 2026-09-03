import { db } from '../../../../lib/firebase-admin';
export const dynamic = 'force-dynamic';
export async function GET(){try{const s=await db.collection('teachers').orderBy('name').get();const teachers=s.docs.map(d=>({id:d.id,...d.data()})).filter(t=>String(t.status||'').trim().toUpperCase()==='AKTIF').map(t=>({id:t.id,teacherCode:t.teacherCode||t.id,name:t.name||'',unit:t.unit||'',pinConfigured:t.pinConfigured===true}));return Response.json({success:true,teachers})}catch(e){return Response.json({success:false,message:e.message},{status:500})}}
