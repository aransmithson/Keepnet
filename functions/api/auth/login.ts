import { Env, jsonResponse, errorResponse, corsHeaders } from '../_types';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    const { email, passwordHash, rawPassword } = await context.request.json() as any;

    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return errorResponse('Email is required');
    }

    const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(cleanEmail).first() as any;
    if (!user) {
      return errorResponse('No account found with this email address.');
    }

    // Match passwordHash or raw password check
    let matches = false;
    if (passwordHash && user.password_hash === passwordHash) {
      matches = true;
    } else if (rawPassword) {
      // Check standard or btoa variations
      const btoa1 = btoa(unescape(encodeURIComponent(rawPassword)));
      let btoa2: string | null = null;
      try { btoa2 = btoa(rawPassword); } catch { /* ignore */ }
      if (user.password_hash === btoa1 || user.password_hash === btoa2) {
        matches = true;
      }
    }

    if (!matches) {
      return errorResponse('Incorrect password. Use "Forgot password?" to reset it.');
    }

    return jsonResponse({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.nickname || user.name,
        nickname: user.nickname || user.name,
        storageMode: user.storage_mode || 'cloud',
        createdAt: user.created_at,
      },
    });
  } catch (err: any) {
    return errorResponse(err.message || 'Login failed', 500);
  }
};
