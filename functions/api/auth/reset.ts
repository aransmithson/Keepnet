import { Env, jsonResponse, errorResponse, corsHeaders } from '../_types';
import { sendEmail, buildPasswordResetEmail } from '../_email';
import { hashPassword, timingSafeEqual, sanitizeInput } from '../_crypto';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    const body = await context.request.json() as any;
    const cleanEmail = sanitizeInput(body.email, 120).toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return errorResponse('Valid email address is required', 400);
    }

    const altEmail = cleanEmail.endsWith('@gmail.com')
      ? cleanEmail.replace('@gmail.com', '@googlemail.com')
      : cleanEmail.endsWith('@googlemail.com')
      ? cleanEmail.replace('@googlemail.com', '@gmail.com')
      : cleanEmail;

    if (body.action === 'confirm') {
      const { code, newPassword } = body;
      const cleanCode = String(code || '').replace(/\D/g, '').trim().slice(0, 6);
      const rawNewPwd = (newPassword || '').trim();

      if (!cleanCode || cleanCode.length !== 6) {
        return errorResponse('Please enter a valid 6-digit verification code', 400);
      }

      if (!rawNewPwd || rawNewPwd.length < 6 || rawNewPwd.length > 128) {
        return errorResponse('New password must be between 6 and 128 characters', 400);
      }

      const user = await db.prepare('SELECT * FROM users WHERE email = ? OR email = ?')
        .bind(cleanEmail, altEmail)
        .first() as any;

      if (!user) {
        return errorResponse('No account found for this email address.', 404);
      }

      const storedCode = String(user.reset_code || '').replace(/\D/g, '').trim();
      const currentAttempts = Number(user.reset_attempts) || 0;

      // Rate limit / lockout on reset attempts (prevent brute force)
      if (currentAttempts >= 5) {
        await db.prepare('UPDATE users SET reset_code = NULL, reset_expires = NULL, reset_attempts = 0 WHERE id = ?')
          .bind(user.id)
          .run();
        return errorResponse('Too many failed code attempts. This reset code has been invalidated for your security. Please request a new code.', 429);
      }

      const isMatch = storedCode.length === 6 && timingSafeEqual(storedCode, cleanCode);

      if (!storedCode || !isMatch) {
        const nextAttempts = currentAttempts + 1;
        if (nextAttempts >= 5) {
          await db.prepare('UPDATE users SET reset_code = NULL, reset_expires = NULL, reset_attempts = 0 WHERE id = ?')
            .bind(user.id)
            .run();
          return errorResponse('Too many failed code attempts. This reset code has been invalidated for your security. Please request a new code.', 429);
        }
        await db.prepare('UPDATE users SET reset_attempts = ? WHERE id = ?')
          .bind(nextAttempts, user.id)
          .run();
        return errorResponse(`Invalid verification code. (${5 - nextAttempts} attempts remaining).`, 401);
      }

      if (user.reset_expires && Date.now() > Number(user.reset_expires)) {
        await db.prepare('UPDATE users SET reset_code = NULL, reset_expires = NULL, reset_attempts = 0 WHERE id = ?')
          .bind(user.id)
          .run();
        return errorResponse('This reset code has expired. Please request a new code.', 410);
      }

      // Hash new password with salted PBKDF2-SHA256
      const finalHash = await hashPassword(rawNewPwd);

      // Invalidate reset code, clear failed logins, and revoke active sessions
      await db.prepare(`
        UPDATE users
        SET password_hash = ?, reset_code = NULL, reset_expires = NULL, reset_attempts = 0, failed_logins = 0, locked_until = 0, auth_token = NULL
        WHERE id = ?
      `).bind(finalHash, user.id).run();

      console.log(`[Keepnet Auth] Password reset successfully for ${cleanEmail} (user: ${user.id})`);
      return jsonResponse({ success: true, message: 'Password updated successfully' });
    }

    // Default: generate reset code and email it to the user
    const user = await db.prepare('SELECT id, name, email, reset_code, reset_expires FROM users WHERE email = ? OR email = ?')
      .bind(cleanEmail, altEmail)
      .first() as any;

    if (!user) {
      // Mitigate email enumeration attacks with standard timing and generic response
      return jsonResponse({
        success: true,
        message: 'If an account exists for this email, a verification code has been sent to your inbox.',
      });
    }

    // If an existing code was generated less than 3 minutes ago, reuse it so multiple rapid clicks send the same code
    let code: string;
    const now = Date.now();
    const existingCode = user.reset_code ? String(user.reset_code).replace(/\D/g, '').trim() : '';
    const existingExpires = Number(user.reset_expires) || 0;

    if (existingCode && existingExpires > now && (existingExpires - now) > 12 * 60 * 1000) {
      code = existingCode;
    } else {
      code = Math.floor(100000 + Math.random() * 900000).toString();
    }

    const expires = now + 15 * 60 * 1000;

    await db.prepare('UPDATE users SET reset_code = ?, reset_expires = ?, reset_attempts = 0 WHERE id = ?')
      .bind(code, expires, user.id).run();

    // Dispatch the password reset email
    const emailData = buildPasswordResetEmail(code, cleanEmail);
    const emailResult = await sendEmail(context.env, {
      to: cleanEmail,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text,
    });

    console.log(`[Keepnet Auth] Password reset code dispatched for ${cleanEmail} via ${emailResult.provider || 'fallback'}`);

    // SECURITY: Never return the code in the client response
    return jsonResponse({
      success: true,
      message: 'A 6-digit verification code has been sent to your email. Please check your inbox.',
    });
  } catch (err: any) {
    return errorResponse(err.message || 'Reset request failed', 500);
  }
};
