import { Env, jsonResponse, errorResponse, corsHeaders } from '../_types';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    const { userId, nickname } = await context.request.json() as any;

    if (!userId) {
      return errorResponse('User ID is required');
    }
    const cleanNick = (nickname || '').trim();
    if (!cleanNick) {
      return errorResponse('Nickname cannot be empty');
    }

    // Update in users table
    await db.prepare('UPDATE users SET nickname = ?, name = ? WHERE id = ?')
      .bind(cleanNick, cleanNick, userId).run();

    // Also update public userName in existing sessions & catches so shared content reflects new nickname
    await db.prepare('UPDATE sessions SET user_name = ? WHERE user_id = ?')
      .bind(cleanNick, userId).run();
    await db.prepare('UPDATE catches SET user_name = ? WHERE user_id = ?')
      .bind(cleanNick, userId).run();

    return jsonResponse({
      success: true,
      nickname: cleanNick,
    });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to update nickname', 500);
  }
};
