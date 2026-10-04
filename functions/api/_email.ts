import { Env } from './_types';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Dispatch transactional email via configured provider:
 * 1. Resend (RESEND_API_KEY)
 * 2. Postmark (POSTMARK_SERVER_TOKEN)
 * 3. SendGrid (SENDGRID_API_KEY)
 * 4. Brevo (BREVO_API_KEY)
 * 5. Mailchannels fallback
 */
export async function sendEmail(env: Env, opts: EmailOptions): Promise<{ success: boolean; provider?: string; error?: string }> {
  const fromEmail = env.EMAIL_FROM || 'Keepnet <security@keepnet.pages.dev>';
  const fallbackFrom = env.EMAIL_FROM || 'Keepnet <onboarding@resend.dev>';

  // 1. Resend
  if (env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fallbackFrom,
          to: [opts.to],
          subject: opts.subject,
          html: opts.html,
          text: opts.text,
        }),
      });
      if (res.ok) {
        return { success: true, provider: 'resend' };
      }
      const errText = await res.text();
      console.error('[Keepnet Email] Resend error:', errText);

      // If in Resend test mode, check if recipient matches owner testing address (e.g. gmail vs googlemail)
      const match = errText.match(/send testing emails to your own email address \(([^)]+)\)/i);
      if (match && match[1]) {
        const ownerEmail = match[1].toLowerCase().trim();
        const userTo = opts.to.toLowerCase().trim();
        const userPrefix = userTo.split('@')[0];
        const ownerPrefix = ownerEmail.split('@')[0];
        if (userPrefix === ownerPrefix || userTo === ownerEmail) {
          const retryRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: fallbackFrom,
              to: [ownerEmail],
              subject: opts.subject,
              html: opts.html,
              text: opts.text,
            }),
          });
          if (retryRes.ok) {
            console.log(`[Keepnet Email] Resend sent to owner testing address ${ownerEmail}`);
            return { success: true, provider: 'resend' };
          }
        }
      }
    } catch (e: any) {
      console.error('[Keepnet Email] Resend exception:', e.message);
    }
  }

  // 2. Postmark
  if (env.POSTMARK_SERVER_TOKEN) {
    try {
      const res = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'X-Postmark-Server-Token': env.POSTMARK_SERVER_TOKEN,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          From: fromEmail,
          To: opts.to,
          Subject: opts.subject,
          HtmlBody: opts.html,
          TextBody: opts.text,
        }),
      });
      if (res.ok) {
        return { success: true, provider: 'postmark' };
      }
      const errText = await res.text();
      console.error('[Keepnet Email] Postmark error:', errText);
    } catch (e: any) {
      console.error('[Keepnet Email] Postmark exception:', e.message);
    }
  }

  // 3. SendGrid
  if (env.SENDGRID_API_KEY) {
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: opts.to }] }],
          from: { email: fromEmail.replace(/.*<([^>]+)>.*/, '$1') || 'no-reply@keepnet.pages.dev', name: 'Keepnet' },
          subject: opts.subject,
          content: [
            { type: 'text/html', value: opts.html },
          ],
        }),
      });
      if (res.ok || res.status === 202) {
        return { success: true, provider: 'sendgrid' };
      }
      const errText = await res.text();
      console.error('[Keepnet Email] SendGrid error:', errText);
    } catch (e: any) {
      console.error('[Keepnet Email] SendGrid exception:', e.message);
    }
  }

  // 4. Brevo
  if (env.BREVO_API_KEY) {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Keepnet', email: fromEmail.replace(/.*<([^>]+)>.*/, '$1') || 'security@keepnet.pages.dev' },
          to: [{ email: opts.to }],
          subject: opts.subject,
          htmlContent: opts.html,
          textContent: opts.text,
        }),
      });
      if (res.ok) {
        return { success: true, provider: 'brevo' };
      }
      const errText = await res.text();
      console.error('[Keepnet Email] Brevo error:', errText);
    } catch (e: any) {
      console.error('[Keepnet Email] Brevo exception:', e.message);
    }
  }

  // 5. Mailchannels fallback for Cloudflare Workers
  try {
    const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: opts.to }] }],
        from: { email: 'security@keepnet.pages.dev', name: 'Keepnet Security' },
        subject: opts.subject,
        content: [{ type: 'text/html', value: opts.html }],
      }),
    });
    if (res.ok || res.status === 202) {
      return { success: true, provider: 'mailchannels' };
    }
  } catch {
    // ignore
  }

  console.warn(`[Keepnet Email] No active email delivery service configured for ${opts.to}. Add RESEND_API_KEY secret to Cloudflare Pages for live email delivery.`);
  return { success: false, error: 'No email service configured' };
}

export function buildPasswordResetEmail(code: string, email: string): { subject: string; html: string; text: string } {
  const subject = 'Keepnet — Your Password Reset Code';
  const text = `Your Keepnet password reset code is: ${code}\n\nThis code will expire in 15 minutes.\n\nIf you did not request a password reset, please ignore this email.`;
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Keepnet Password Reset</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F5F3EB; color: #1A1A1A;">
  <div style="max-width: 480px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; border: 1px solid #DCD8C5; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
    <div style="background: #014731; padding: 24px; text-align: center;">
      <h1 style="margin: 0; color: #FFFFFF; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Keepnet</h1>
      <p style="margin: 4px 0 0; color: rgba(255,255,255,0.8); font-size: 13px;">Time by the Water</p>
    </div>
    <div style="padding: 28px 24px;">
      <h2 style="margin: 0 0 12px; font-size: 19px; color: #1A1A1A; font-weight: 600;">Password Reset Request</h2>
      <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.5; color: #5A5A5A;">
        We received a request to reset the password for your Keepnet account (<strong>${email}</strong>). Use the verification code below to set a new password:
      </p>
      
      <div style="background: #F5F3EB; border: 2px dashed #014731; border-radius: 12px; padding: 18px; text-align: center; margin: 24px 0;">
        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #5A5A5A; font-weight: 600; display: block; margin-bottom: 6px;">Your 6-Digit Code</span>
        <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #014731;">${code}</span>
      </div>

      <p style="margin: 0 0 16px; font-size: 13px; line-height: 1.5; color: #5A5A5A;">
        ⏱️ This code will expire in <strong>15 minutes</strong> for your security.
      </p>

      <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #8A8A8A; border-top: 1px solid #E8E5D5; padding-top: 16px;">
        If you did not request this code, you can safely ignore this email. Your account password remains unchanged.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, html, text };
}
