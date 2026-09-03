import {cookies} from 'next/headers'; import {SESSION_COOKIE_NAME} from '../../../../lib/auth-session';
export async function POST(){(await cookies()).set(SESSION_COOKIE_NAME,'',{httpOnly:true,path:'/',maxAge:0});return Response.json({success:true})}
