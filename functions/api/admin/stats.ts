import { Env, jsonResponse, errorResponse, corsHeaders } from '../_types';
import { verifyAdmin } from './_auth';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const auth = await verifyAdmin(context);
    if (!auth.authorized) {
      return errorResponse(auth.error || 'Forbidden', 403);
    }

    const db = context.env.DB;

    // Ensure non-destructive table existence
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

    // 1. Overall Totals
    const userCount = await db.prepare('SELECT count(*) as total FROM users').first('total');
    const sessionCount = await db.prepare('SELECT count(*) as total FROM sessions').first('total');
    const catchCount = await db.prepare('SELECT count(*) as total FROM catches').first('total');
    const sharedCatchCount = await db.prepare('SELECT count(*) as total FROM catches WHERE is_shared = 1').first('total');
    const sharedSessionCount = await db.prepare('SELECT count(*) as total FROM sessions WHERE is_shared = 1').first('total');
    const activeLockouts = await db.prepare('SELECT count(*) as total FROM users WHERE locked_until > ?').bind(Date.now()).first('total');

    // Subscription & Coupon Totals
    const totalCouponsRedeemed = await db.prepare('SELECT count(*) as total FROM coupon_redemptions').first('total').catch(() => 0);
    const activeTrials = await db.prepare(`
      SELECT count(*) as total FROM user_subscriptions 
      WHERE tier = 'premium' AND (expires_at IS NULL OR julianday(expires_at) > julianday('now'))
    `).first('total').catch(() => 0);
    const couponBreakdown = await db.prepare(`
      SELECT coupon_code as code, count(*) as count 
      FROM coupon_redemptions 
      GROUP BY coupon_code 
      ORDER BY count DESC 
      LIMIT 10
    `).all().catch(() => ({ results: [] }));

    // 2. Growth over time (Daily trends for catches & signups)
    const userGrowth = await db.prepare(`
      SELECT substr(created_at, 1, 10) as date, count(*) as count
      FROM users
      GROUP BY substr(created_at, 1, 10)
      ORDER BY date DESC
      LIMIT 14
    `).all();

    const catchGrowth = await db.prepare(`
      SELECT substr(caught_at, 1, 10) as date, count(*) as count
      FROM catches
      GROUP BY substr(caught_at, 1, 10)
      ORDER BY date DESC
      LIMIT 14
    `).all();

    const sessionGrowth = await db.prepare(`
      SELECT substr(started_at, 1, 10) as date, count(*) as count
      FROM sessions
      GROUP BY substr(started_at, 1, 10)
      ORDER BY date DESC
      LIMIT 14
    `).all();

    // 3. Species breakdown
    const speciesStats = await db.prepare(`
      SELECT species, count(*) as count, max(weight_lb * 16 + weight_oz) as max_oz
      FROM catches
      GROUP BY species
      ORDER BY count DESC
      LIMIT 10
    `).all();

    // 4. Recent Anglers list with subscription tier
    const recentUsers = await db.prepare(`
      SELECT u.id, u.email, u.name, u.nickname, u.storage_mode, u.created_at, u.failed_logins, u.locked_until, u.is_admin,
             s.tier as subscription_tier, s.applied_coupon, s.expires_at as subscription_expires_at
      FROM users u
      LEFT JOIN user_subscriptions s ON u.id = s.user_id
      ORDER BY u.created_at DESC
      LIMIT 15
    `).all().catch(() => ({ results: [] }));

    // 5. Recent Catch Reports list
    const recentCatches = await db.prepare(`
      SELECT id, session_id, user_name, species, weight_lb, weight_oz, bait, caught_at, is_shared, image
      FROM catches
      ORDER BY caught_at DESC
      LIMIT 15
    `).all();

    return jsonResponse({
      success: true,
      totals: {
        users: Number(userCount) || 0,
        sessions: Number(sessionCount) || 0,
        catches: Number(catchCount) || 0,
        sharedCatches: Number(sharedCatchCount) || 0,
        sharedSessions: Number(sharedSessionCount) || 0,
        activeLockouts: Number(activeLockouts) || 0,
        totalCouponsRedeemed: Number(totalCouponsRedeemed) || 0,
        activeTrials: Number(activeTrials) || 0,
      },
      subscriptions: {
        totalCouponsRedeemed: Number(totalCouponsRedeemed) || 0,
        activeTrials: Number(activeTrials) || 0,
        breakdown: couponBreakdown.results || [],
      },
      growth: {
        users: (userGrowth.results || []).reverse(),
        catches: (catchGrowth.results || []).reverse(),
        sessions: (sessionGrowth.results || []).reverse(),
      },
      species: speciesStats.results || [],
      recentUsers: recentUsers.results || [],
      recentCatches: recentCatches.results || [],
    });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to fetch admin stats', 500);
  }
};
