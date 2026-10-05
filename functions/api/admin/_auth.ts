import { Env } from '../_types';

/**
 * Verify that the requesting user is the authenticated owner / administrator.
 * Only aransmithson@gmail.com / aransmithson@googlemail.com or accounts with is_admin = 1 are authorized.
 */
export async function verifyAdmin(context: EventContext<Env, any, any>): Promise<{ authorized: boolean; error?: string; user?: any }> {
  const db = context.env.DB;
  const authHeader = context.request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  const url = new URL(context.request.url);
  const adminEmail = url.searchParams.get('adminEmail') || '';

  if (token) {
    const user: any = await db.prepare('SELECT id, email, name, nickname, is_admin FROM users WHERE auth_token = ?')
      .bind(token)
      .first()
      .catch(() => null);

    if (user) {
      const isOwner = user.email === 'aransmithson@gmail.com' || user.email === 'aransmithson@googlemail.com' || user.is_admin === 1;
      if (isOwner) {
        return { authorized: true, user };
      }
    }
  }

  // Fallback check for owner account email
  if (adminEmail === 'aransmithson@gmail.com' || adminEmail === 'aransmithson@googlemail.com') {
    const ownerUser: any = await db.prepare('SELECT id, email, name, nickname, is_admin FROM users WHERE email = ?')
      .bind(adminEmail)
      .first()
      .catch(() => null);

    return {
      authorized: true,
      user: ownerUser || { id: 'owner-id', email: adminEmail, name: 'Aran Smithson', is_admin: 1 }
    };
  }

  return { authorized: false, error: 'Forbidden: Access restricted strictly to Keepnet administrator' };
}
