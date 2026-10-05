import { Env } from '../_types';
import { getAuthenticatedUser } from '../_auth';

/**
 * Verify that the requesting user is the authenticated owner / administrator.
 * The administrator role is stored in D1 and assigned only by a trusted administrator.
 */
export async function verifyAdmin(context: EventContext<Env, any, any>): Promise<{ authorized: boolean; error?: string; user?: any }> {
  const user = await getAuthenticatedUser(context);
  if (user?.is_admin === 1) {
    return { authorized: true, user };
  }

  return { authorized: false, error: 'Forbidden: Access restricted strictly to Keepnet administrator' };
}
