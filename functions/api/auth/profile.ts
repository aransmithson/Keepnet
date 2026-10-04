import { Env, jsonResponse, errorResponse, corsHeaders } from '../_types';
import { sanitizeInput } from '../_crypto';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    const { userId, nickname } = await context.request.json() as any;

    const cleanUserId = sanitizeInput(userId, 64);
    if (!cleanUserId) {
      return errorResponse('User ID is required', 400);
    }

    const cleanNick = sanitizeInput(nickname, 40).replace(/[<>]/g, '').trim();
    if (!cleanNick) {
      return errorResponse('Nickname cannot be empty', 400);
    }

    // Update in users table
    await db.prepare('UPDATE users SET nickname = ?, name = ? WHERE id = ?')
      .bind(cleanNick, cleanNick, cleanUserId).run();

    // Also update public userName in existing sessions & catches so shared content reflects new nickname
    await db.prepare('UPDATE sessions SET user_name = ? WHERE user_id = ?')
      .bind(cleanNick, cleanUserId).run();
    await db.prepare('UPDATE catches SET user_name = ? WHERE user_id = ?')
      .bind(cleanNick, cleanUserId).run();

    return jsonResponse({
      success: true,
      nickname: cleanNick,
    });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to update nickname', 500);
  }
};
