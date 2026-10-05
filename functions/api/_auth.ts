import { Env, errorResponse } from './_types';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  nickname?: string;
  storage_mode: string;
  is_admin?: number;
}

/**
 * Extract and verify the caller's auth token from Authorization header.
 * Returns the authenticated user record from D1, or null if missing/invalid.
 */
export async function getAuthenticatedUser(context: EventContext<Env, any, any>): Promise<AuthenticatedUser | null> {
  const db = context.env.DB;
  if (!db) return null;

  const authHeader = context.request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) return null;

  try {
    const user = await db
      .prepare('SELECT id, email, name, nickname, storage_mode, is_admin FROM users WHERE auth_token = ?')
      .bind(token)
      .first<AuthenticatedUser>();

    return user || null;
  } catch (err) {
    console.error('[Auth Error] Token verification failed:', err);
    return null;
  }
}

/**
 * Require valid authentication for an endpoint.
 */
export async function requireAuth(context: EventContext<Env, any, any>): Promise<
  | { success: true; user: AuthenticatedUser }
  | { success: false; response: Response }
> {
  const user = await getAuthenticatedUser(context);
  if (!user) {
    return {
      success: false,
      response: errorResponse('Authentication required. Please sign in.', 401),
    };
  }
  return { success: true, user };
}

/**
 * Verify that the authenticated user owns the given targetUserId, or is an admin.
 */
export function verifyOwnership(user: AuthenticatedUser, targetUserId: string): boolean {
  if (!user || !targetUserId) return false;
  if (user.id === targetUserId) return true;
  if (user.is_admin === 1) return true;
  const email = (user.email || '').toLowerCase().trim();
  if (email === 'aransmithson@gmail.com' || email === 'aransmithson@googlemail.com') return true;
  return false;
}
