import { Env, jsonResponse, errorResponse, corsHeaders } from '../_types';
import { sanitizeInput } from '../_crypto';
import { requireAuth } from '../_auth';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const auth = await requireAuth(context);
    if (!auth.success) return auth.response;
    const db = context.env.DB;
    const { userId, nickname } = await context.request.json() as any;

    const cleanUserId = auth.user.id;
    if (userId && userId !== cleanUserId) return errorResponse('Cannot change another account profile', 403);

    const cleanNick = sanitizeInput(nickname, 40).replace(/[<>]/g, '').trim();
    if (!cleanNick) {
      return errorResponse('Nickname cannot be empty', 400);
    }

    // Update in users table
    await db.batch([
      db.prepare('UPDATE users SET nickname = ?, name = ? WHERE id = ?').bind(cleanNick, cleanNick, cleanUserId),
      db.prepare('UPDATE sessions SET user_name = ? WHERE user_id = ?').bind(cleanNick, cleanUserId),
      db.prepare('UPDATE catches SET user_name = ? WHERE user_id = ?').bind(cleanNick, cleanUserId),
    ]);

    return jsonResponse({
      success: true,
      nickname: cleanNick,
    });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to update nickname', 500);
  }
};
