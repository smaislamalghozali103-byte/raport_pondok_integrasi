import {cookies} from 'next/headers'; import {verifySessionToken,SESSION_COOKIE_NAME} from '@/lib/auth-session';
export async function GET(){const t=(await cookies()).get(SESSION_COOKIE_NAME)?.value;const s=verifySessionToken(t);return Response.json(s?{success:true,authenticated:true,teacher:s}:{success:false,authenticated:false})}
