import { Env, jsonResponse, errorResponse, corsHeaders } from '../_types';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    const { email, passwordHash, name, storageMode } = await context.request.json() as any;

    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return errorResponse('Invalid email address');
    }
    if (!passwordHash) {
      return errorResponse('Password is required');
    }

    // Check if user already exists in D1
    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(cleanEmail).first();
    if (existing) {
      return errorResponse('An account with this email already exists.');
    }

    const id = Math.random().toString(36).slice(2, 10);
    const cleanName = (name || '').trim() || cleanEmail.split('@')[0];
    const mode = storageMode === 'local' ? 'local' : 'cloud';

    await db.prepare(`
      INSERT INTO users (id, email, password_hash, name, storage_mode, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(id, cleanEmail, passwordHash, cleanName, mode).run();

    return jsonResponse({
      success: true,
      user: {
        id,
        email: cleanEmail,
        name: cleanName,
        storageMode: mode,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    return errorResponse(err.message || 'Registration failed', 500);
  }
};
