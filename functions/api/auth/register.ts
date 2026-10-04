import { Env, jsonResponse, errorResponse, corsHeaders } from '../_types';
import { hashPassword, generateToken, sanitizeInput } from '../_crypto';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    const body = await context.request.json() as any;
    const { email, password, passwordHash, name, nickname, storageMode } = body;

    const cleanEmail = sanitizeInput(email, 120).toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return errorResponse('A valid email address is required', 400);
    }

    const rawPwd = (password || '').trim();
    if (!rawPwd && !passwordHash) {
      return errorResponse('Password is required', 400);
    }

    if (rawPwd && (rawPwd.length < 6 || rawPwd.length > 128)) {
      return errorResponse('Password must be between 6 and 128 characters', 400);
    }

    const altEmail = cleanEmail.endsWith('@gmail.com')
      ? cleanEmail.replace('@gmail.com', '@googlemail.com')
      : cleanEmail.endsWith('@googlemail.com')
      ? cleanEmail.replace('@googlemail.com', '@gmail.com')
      : cleanEmail;

    // Check if user already exists in D1
    const existing = await db.prepare('SELECT id, password_hash FROM users WHERE email = ? OR email = ?')
      .bind(cleanEmail, altEmail)
      .first() as any;

    const rawNick = sanitizeInput(nickname || name || '', 50);
    const cleanNick = rawNick.replace(/[<>]/g, '') || cleanEmail.split('@')[0];
    const mode = storageMode === 'local' ? 'local' : 'cloud';

    // Store modern salted cryptographic hash
    const secureHash = rawPwd ? await hashPassword(rawPwd) : passwordHash;
    const token = generateToken();

    if (existing) {
      if (existing.password_hash === 'temp_reset_pending') {
        await db.prepare('UPDATE users SET password_hash = ?, name = ?, nickname = ?, storage_mode = ?, auth_token = ? WHERE id = ?')
          .bind(secureHash, cleanNick, cleanNick, mode, token, existing.id).run();
        return jsonResponse({
          success: true,
          token,
          user: {
            id: existing.id,
            email: cleanEmail,
            name: cleanNick,
            nickname: cleanNick,
            storageMode: mode,
            createdAt: new Date().toISOString(),
          },
        });
      }
      return errorResponse('An account with this email already exists. Please sign in or reset your password.', 409);
    }

    const id = Math.random().toString(36).slice(2, 10);

    await db.prepare(`
      INSERT INTO users (id, email, password_hash, name, nickname, storage_mode, auth_token, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(id, cleanEmail, secureHash, cleanNick, cleanNick, mode, token).run();

    return jsonResponse({
      success: true,
      token,
      user: {
        id,
        email: cleanEmail,
        name: cleanNick,
        nickname: cleanNick,
        storageMode: mode,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    return errorResponse(err.message || 'Registration failed', 500);
  }
};
