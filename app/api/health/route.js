import { db } from '../../../lib/firebase-admin';
export async function GET(){
  const started = Date.now();
  try{
    await db.collection('system').doc('health').get();
    return Response.json({ok:true,version:'16.0',service:'raport-integrasi',firebase:'ok',latencyMs:Date.now()-started,time:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    return Response.json({ok:false,version:'16.0',firebase:'error',latencyMs:Date.now()-started},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
