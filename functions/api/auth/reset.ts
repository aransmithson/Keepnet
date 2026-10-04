import { Env, jsonResponse, errorResponse, corsHeaders } from '../_types';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    const body = await context.request.json() as any;
    const cleanEmail = (body.email || '').trim().toLowerCase();

    if (!cleanEmail) {
      return errorResponse('Email is required');
    }

    if (body.action === 'confirm') {
      const { code, newPasswordHash } = body;
      const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(cleanEmail).first() as any;
      if (!user) return errorResponse('User not found');
      if (user.reset_code !== code) return errorResponse('Invalid verification code');
      if (user.reset_expires && Date.now() > user.reset_expires) return errorResponse('Code expired');

      await db.prepare('UPDATE users SET password_hash = ?, reset_code = NULL, reset_expires = NULL WHERE id = ?')
        .bind(newPasswordHash, user.id).run();

      return jsonResponse({ success: true, message: 'Password updated successfully' });
    }

    // Default: generate reset code
    const user = await db.prepare('SELECT id FROM users WHERE email = ?').bind(cleanEmail).first() as any;
    if (!user) {
      return errorResponse('No account found with this email address.');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 15 * 60 * 1000;

    await db.prepare('UPDATE users SET reset_code = ?, reset_expires = ? WHERE id = ?')
      .bind(code, expires, user.id).run();

    return jsonResponse({ success: true, code });
  } catch (err: any) {
    return errorResponse(err.message || 'Reset request failed', 500);
  }
};
