import { Env, jsonResponse, errorResponse, corsHeaders } from '../_types';
import { sendEmail, buildPasswordResetEmail } from '../_email';

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

    const altEmail = cleanEmail.endsWith('@gmail.com')
      ? cleanEmail.replace('@gmail.com', '@googlemail.com')
      : cleanEmail.endsWith('@googlemail.com')
      ? cleanEmail.replace('@googlemail.com', '@gmail.com')
      : cleanEmail;

    if (body.action === 'confirm') {
      const { code, newPasswordHash } = body;
      const cleanCode = String(code || '').replace(/\D/g, '').trim();
      const user = await db.prepare('SELECT * FROM users WHERE email = ? OR email = ?').bind(cleanEmail, altEmail).first() as any;
      if (!user) return errorResponse('No account found for this email address.');

      const storedCode = String(user.reset_code || '').replace(/\D/g, '').trim();
      console.log(`[Keepnet Auth] Reset confirmation for ${cleanEmail}: stored="${storedCode}", submitted="${cleanCode}"`);

      if (!storedCode || storedCode !== cleanCode) {
        return errorResponse('Invalid verification code. Please check your email and try again.');
      }
      if (user.reset_expires && Date.now() > Number(user.reset_expires)) {
        return errorResponse('This reset code has expired. Please request a new code.');
      }

      await db.prepare('UPDATE users SET password_hash = ?, reset_code = NULL, reset_expires = NULL WHERE id = ?')
        .bind(newPasswordHash, user.id).run();

      console.log(`[Keepnet Auth] Password reset successfully for ${cleanEmail} (user: ${user.id})`);
      return jsonResponse({ success: true, message: 'Password updated successfully' });
    }

    // Default: generate reset code and email it to the user
    const user = await db.prepare('SELECT id, name, email, reset_code, reset_expires FROM users WHERE email = ? OR email = ?').bind(cleanEmail, altEmail).first() as any;
    if (!user) {
      // Return success with generic message to avoid email enumeration attacks
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

    await db.prepare('UPDATE users SET reset_code = ?, reset_expires = ? WHERE id = ?')
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

    // SECURITY: Never return the code in the JSON response
    return jsonResponse({
      success: true,
      message: 'A 6-digit verification code has been sent to your email. Please check your inbox.',
    });
  } catch (err: any) {
    return errorResponse(err.message || 'Reset request failed', 500);
  }
};
