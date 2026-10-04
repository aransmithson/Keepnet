import { Env, errorResponse } from '../_types';

/**
 * Verify that the requesting user is the authenticated owner / administrator.
 * Only aransmithson@gmail.com / aransmithson@googlemail.com or accounts with is_admin = 1 are authorized.
 */
export async function verifyAdmin(context: EventContext<Env, any, any>): Promise<{ authorized: boolean; error?: string; user?: any }> {
  const db = context.env.DB;
  const authHeader = context.request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return { authorized: false, error: 'Unauthorized: Admin authentication token required' };
  }

  const user: any = await db.prepare('SELECT id, email, name, nickname, is_admin FROM users WHERE auth_token = ?').bind(token).first();

  if (!user) {
    return { authorized: false, error: 'Unauthorized: Invalid or expired session' };
  }

  const isOwner = user.email === 'aransmithson@gmail.com' || user.email === 'aransmithson@googlemail.com' || user.is_admin === 1;
  if (!isOwner) {
    return { authorized: false, error: 'Forbidden: Access restricted strictly to Keepnet administrator' };
  }

  return { authorized: true, user };
}
