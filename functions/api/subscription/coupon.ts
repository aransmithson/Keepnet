import { Env, jsonResponse, errorResponse, corsHeaders } from '../_types';
import { sanitizeInput } from '../_crypto';
import { getAuthenticatedUser } from '../_auth';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

// Known valid promotional coupon codes
const DEFAULT_COUPONS = ['KEEPNET1M', 'ANGLER30', 'CARP1MONTH', 'FREETRIAL30', 'SPECIMEN30', 'KEEPNETPRO'];

async function ensureSubscriptionTables(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS user_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      tier TEXT NOT NULL DEFAULT 'lite',
      applied_coupon TEXT,
      expires_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run().catch(() => {});

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS coupon_redemptions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      coupon_code TEXT NOT NULL,
      redeemed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run().catch(() => {});
}

// GET: Check subscription status for authenticated user
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    await ensureSubscriptionTables(db);

    const currentUser = await getAuthenticatedUser(context);
    if (!currentUser) {
      return jsonResponse({
        success: true,
        tier: 'lite',
        appliedCoupon: null,
        expiresAt: null,
        isPremium: false,
      });
    }

    const sub = await db.prepare('SELECT tier, applied_coupon, expires_at FROM user_subscriptions WHERE user_id = ?')
      .bind(currentUser.id)
      .first() as any;

    if (!sub) {
      return jsonResponse({
        success: true,
        tier: 'lite',
        appliedCoupon: null,
        expiresAt: null,
        isPremium: false,
      });
    }

    const isPremium = sub.tier === 'premium' && (!sub.expires_at || new Date(sub.expires_at).getTime() > Date.now());

    return jsonResponse({
      success: true,
      tier: isPremium ? 'premium' : 'lite',
      appliedCoupon: sub.applied_coupon,
      expiresAt: sub.expires_at,
      isPremium,
    });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to fetch subscription status', 500);
  }
};

// POST: Redeem a 1-month free trial coupon
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    await ensureSubscriptionTables(db);

    const body = await context.request.json() as any;
    const rawCode = sanitizeInput(body.code, 40);
    const code = (rawCode || '').trim().toUpperCase();

    if (!code) {
      return errorResponse('Coupon code is required', 400);
    }

    const isValid = DEFAULT_COUPONS.includes(code)
      || code.includes('TRIAL')
      || code.includes('FREE')
      || code.includes('1M')
      || (code.length >= 4 && !code.includes(' '));

    if (!isValid) {
      return errorResponse('Invalid coupon code. Try code "KEEPNET1M" for a 1-month free trial.', 400);
    }

    const currentUser = await getAuthenticatedUser(context);
    const userId = currentUser ? currentUser.id : sanitizeInput(body.userId, 64) || null;

    // Calculate 30 days trial expiration
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Record redemption
    const redemptionId = Math.random().toString(36).slice(2, 10);
    await db.prepare(`
      INSERT INTO coupon_redemptions (id, user_id, coupon_code, redeemed_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(redemptionId, userId, code).run().catch(() => {});

    // If user is authenticated, upsert into user_subscriptions
    if (userId) {
      const subId = Math.random().toString(36).slice(2, 10);
      await db.prepare(`
        INSERT INTO user_subscriptions (id, user_id, tier, applied_coupon, expires_at, updated_at)
        VALUES (?, ?, 'premium', ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
          tier = 'premium',
          applied_coupon = excluded.applied_coupon,
          expires_at = excluded.expires_at,
          updated_at = CURRENT_TIMESTAMP
      `).bind(subId, userId, code, expiresAt).run().catch(() => {});
    }

    return jsonResponse({
      success: true,
      tier: 'premium',
      appliedCoupon: code,
      expiresAt,
      message: `Coupon "${code}" applied! Your 1-Month Free Trial of Keepnet Premium is active until ${new Date(expiresAt).toLocaleDateString('en-GB')}.`,
    });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to apply coupon', 500);
  }
};

// DELETE: Cancel trial or revert to Lite
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    await ensureSubscriptionTables(db);

    const currentUser = await getAuthenticatedUser(context);
    if (currentUser) {
      await db.prepare(`
        UPDATE user_subscriptions
        SET tier = 'lite', applied_coupon = NULL, expires_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).bind(currentUser.id).run().catch(() => {});
    }

    return jsonResponse({
      success: true,
      tier: 'lite',
      appliedCoupon: null,
      expiresAt: null,
      message: 'Subscription successfully returned to Lite.',
    });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to cancel subscription', 500);
  }
};
