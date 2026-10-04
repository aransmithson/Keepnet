import { Env, jsonResponse, errorResponse, corsHeaders } from '../_types';
import { verifyPassword, hashPassword, generateToken, sanitizeInput } from '../_crypto';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    const body = await context.request.json() as any;
    const { email, rawPassword, password, passwordHash } = body;

    const cleanEmail = sanitizeInput(email, 120).toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return errorResponse('Valid email is required', 400);
    }

    const candidatePassword = (rawPassword || password || '').trim();
    if (!candidatePassword && !passwordHash) {
      return errorResponse('Password is required', 400);
    }

    const altEmail = cleanEmail.endsWith('@gmail.com')
      ? cleanEmail.replace('@gmail.com', '@googlemail.com')
      : cleanEmail.endsWith('@googlemail.com')
      ? cleanEmail.replace('@googlemail.com', '@gmail.com')
      : cleanEmail;

    const user = await db.prepare('SELECT * FROM users WHERE email = ? OR email = ?')
      .bind(cleanEmail, altEmail)
      .first() as any;

    if (!user) {
      // Mitigate timing attacks by performing a dummy hash comparison
      await verifyPassword('dummy_password_timing_pad', 'pbkdf2:100000:0000000000000000:0000000000000000000000000000000000000000000000000000000000000000');
      return errorResponse('Invalid email or password.', 401);
    }

    // Check account lockout
    const now = Date.now();
    const lockedUntil = Number(user.locked_until) || 0;
    if (lockedUntil > now) {
      const minsLeft = Math.max(1, Math.ceil((lockedUntil - now) / 60000));
      return errorResponse(`Account temporarily locked for security due to multiple failed attempts. Please try again in ${minsLeft} minute(s) or reset your password.`, 429);
    }

    let isValid = false;
    let needsUpgrade = false;

    if (candidatePassword) {
      const verification = await verifyPassword(candidatePassword, user.password_hash);
      isValid = verification.valid;
      needsUpgrade = !!verification.needsRehash;
    } else if (passwordHash && user.password_hash) {
      // Fallback for legacy cached client hash if supplied without raw password
      if (user.password_hash === passwordHash) {
        isValid = true;
      }
    }

    if (!isValid) {
      const newFails = (Number(user.failed_logins) || 0) + 1;
      const willLock = newFails >= 5;
      const newLockUntil = willLock ? now + 15 * 60 * 1000 : 0;

      await db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?')
        .bind(newFails, newLockUntil, user.id)
        .run();

      console.warn(`[Keepnet Auth] Failed login for ${cleanEmail} (attempt ${newFails}/5)`);

      if (willLock) {
        return errorResponse('Account temporarily locked for 15 minutes due to 5 consecutive failed login attempts. Please use "Forgot password?" to reset.', 429);
      }
      return errorResponse(`Invalid email or password. Attempt ${newFails} of 5 before temporary lock.`, 401);
    }

    // Login succeeded: reset counters and generate fresh authentication session token
    const token = generateToken();
    let upgradedHash: string | null = null;
    if (needsUpgrade && candidatePassword) {
      upgradedHash = await hashPassword(candidatePassword);
    }

    if (upgradedHash) {
      await db.prepare('UPDATE users SET failed_logins = 0, locked_until = 0, auth_token = ?, password_hash = ? WHERE id = ?')
        .bind(token, upgradedHash, user.id)
        .run();
      console.log(`[Keepnet Auth] Transparently upgraded password hash to PBKDF2-SHA256 for user ${user.id}`);
    } else {
      await db.prepare('UPDATE users SET failed_logins = 0, locked_until = 0, auth_token = ? WHERE id = ?')
        .bind(token, user.id)
        .run();
    }

    return jsonResponse({
      success: true,
      token,
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
