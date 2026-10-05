import { Env, jsonResponse, errorResponse, corsHeaders } from '../_types';
import { verifyAdmin } from './_auth';
import { sanitizeInput } from '../_crypto';

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
    const url = new URL(context.request.url);
    const search = sanitizeInput(url.searchParams.get('q') || '', 100).toLowerCase();
    const tierFilter = url.searchParams.get('tier') || 'all';
    const statusFilter = url.searchParams.get('status') || 'all';

    // Ensure subscriptions table exists
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

    let query = `
      SELECT 
        u.id, 
        u.email, 
        u.name, 
        u.nickname, 
        u.storage_mode, 
        u.created_at, 
        u.failed_logins, 
        u.locked_until, 
        u.is_admin,
        COALESCE(s.tier, 'lite') as subscription_tier,
        s.applied_coupon,
        s.expires_at as subscription_expires_at,
        (SELECT COUNT(*) FROM catches WHERE user_id = u.id) as catch_count,
        (SELECT COUNT(*) FROM sessions WHERE user_id = u.id) as session_count
      FROM users u
      LEFT JOIN user_subscriptions s ON u.id = s.user_id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (search) {
      query += ` AND (LOWER(u.email) LIKE ? OR LOWER(u.nickname) LIKE ? OR LOWER(u.name) LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (tierFilter === 'premium') {
      query += ` AND s.tier = 'premium' AND (s.expires_at IS NULL OR julianday(s.expires_at) > julianday('now'))`;
    } else if (tierFilter === 'lite') {
      query += ` AND (s.tier IS NULL OR s.tier = 'lite' OR (s.expires_at IS NOT NULL AND julianday(s.expires_at) <= julianday('now')))`;
    }

    if (statusFilter === 'locked') {
      query += ` AND u.locked_until > ?`;
      params.push(Date.now());
    } else if (statusFilter === 'admin') {
      query += ` AND (u.is_admin = 1 OR u.email = 'aransmithson@gmail.com' OR u.email = 'aransmithson@googlemail.com')`;
    }

    query += ` ORDER BY u.created_at DESC LIMIT 100`;

    const { results } = await db.prepare(query).bind(...params).all();

    return jsonResponse({
      success: true,
      users: results || [],
      total: (results || []).length,
    });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to fetch angler accounts', 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const auth = await verifyAdmin(context);
    if (!auth.authorized) {
      return errorResponse(auth.error || 'Forbidden', 403);
    }

    const db = context.env.DB;
    const body = (await context.request.json().catch(() => ({}))) as any;
    const { action, userId } = body;

    if (!userId) {
      return errorResponse('Missing target user ID', 400);
    }

    // Fetch target user to check permissions and existence
    const targetUser: any = await db.prepare('SELECT id, email, nickname, name, is_admin FROM users WHERE id = ?')
      .bind(userId)
      .first();

    if (!targetUser) {
      return errorResponse('Angler account not found in database', 404);
    }

    const isTargetOwner = targetUser.email === 'aransmithson@gmail.com' || targetUser.email === 'aransmithson@googlemail.com';

    // 1. Update Subscription (Upgrade to Premium, Set Trial, or Downgrade to Lite)
    if (action === 'update_subscription') {
      const tier = body.tier === 'premium' ? 'premium' : 'lite';
      const expiresAt = body.expiresAt ? String(body.expiresAt) : null;
      const appliedCoupon = body.coupon ? sanitizeInput(String(body.coupon), 32) : (tier === 'premium' ? 'ADMIN_PASS' : null);

      await db.prepare(`
        INSERT INTO user_subscriptions (id, user_id, tier, applied_coupon, expires_at, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
          tier = excluded.tier,
          applied_coupon = excluded.applied_coupon,
          expires_at = excluded.expires_at,
          updated_at = CURRENT_TIMESTAMP
      `).bind(
        `sub_${crypto.randomUUID()}`,
        userId,
        tier,
        appliedCoupon,
        expiresAt
      ).run();

      return jsonResponse({
        success: true,
        message: tier === 'premium' ? `Angler upgraded to Premium (${appliedCoupon || 'Manual'})` : 'Angler returned to Keepnet Lite tier',
        tier,
        expiresAt,
        appliedCoupon,
      });
    }

    // 2. Unlock Account
    if (action === 'unlock') {
      await db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?')
        .bind(userId)
        .run();

      return jsonResponse({
        success: true,
        message: `Account for ${targetUser.nickname || targetUser.email} has been unlocked`,
      });
    }

    // 3. Lock Account
    if (action === 'lock') {
      if (isTargetOwner) {
        return errorResponse('Owner account cannot be locked', 400);
      }
      const lockDurationMs = Number(body.durationMs) || (7 * 24 * 60 * 60 * 1000); // default 7 days
      const lockUntil = Date.now() + lockDurationMs;

      await db.prepare('UPDATE users SET locked_until = ?, failed_logins = 5, auth_token = NULL WHERE id = ?')
        .bind(lockUntil, userId)
        .run();

      return jsonResponse({
        success: true,
        message: `Account has been locked until ${new Date(lockUntil).toLocaleDateString()}`,
        lockedUntil: lockUntil,
      });
    }

    // 4. Toggle Admin Privileges
    if (action === 'toggle_admin') {
      if (isTargetOwner && body.isAdmin === false) {
        return errorResponse('Owner cannot be stripped of admin privileges', 400);
      }
      const newAdminVal = body.isAdmin ? 1 : 0;
      await db.prepare('UPDATE users SET is_admin = ? WHERE id = ?')
        .bind(newAdminVal, userId)
        .run();

      return jsonResponse({
        success: true,
        message: `Admin privileges ${newAdminVal === 1 ? 'granted to' : 'revoked from'} ${targetUser.nickname || targetUser.email}`,
        isAdmin: newAdminVal === 1,
      });
    }

    // 5. Update Nickname
    if (action === 'update_nickname') {
      const cleanNick = sanitizeInput(body.nickname || '', 40).replace(/[<>]/g, '').trim();
      if (!cleanNick) {
        return errorResponse('Nickname cannot be empty', 400);
      }

      await db.prepare('UPDATE users SET nickname = ?, name = ? WHERE id = ?')
        .bind(cleanNick, cleanNick, userId)
        .run();

      await db.prepare('UPDATE sessions SET user_name = ? WHERE user_id = ?')
        .bind(cleanNick, userId)
        .run().catch(() => {});

      await db.prepare('UPDATE catches SET user_name = ? WHERE user_id = ?')
        .bind(cleanNick, userId)
        .run().catch(() => {});

      return jsonResponse({
        success: true,
        message: `Nickname updated to "${cleanNick}"`,
        nickname: cleanNick,
      });
    }

    // 6. Delete Angler Account & Data
    if (action === 'delete_user') {
      if (isTargetOwner) {
        return errorResponse('Owner account cannot be deleted', 400);
      }

      await db.batch([
        db.prepare('DELETE FROM catch_comments WHERE user_id = ? OR catch_id IN (SELECT id FROM catches WHERE user_id = ?)').bind(userId, userId),
        db.prepare('DELETE FROM catch_likes WHERE user_id = ? OR catch_id IN (SELECT id FROM catches WHERE user_id = ?)').bind(userId, userId),
        db.prepare('DELETE FROM catches WHERE user_id = ?').bind(userId),
        db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
        db.prepare('DELETE FROM user_subscriptions WHERE user_id = ?').bind(userId),
        db.prepare('DELETE FROM coupon_redemptions WHERE user_id = ?').bind(userId),
        db.prepare('DELETE FROM trial_claims WHERE user_id = ?').bind(userId),
        db.prepare('DELETE FROM catch_deletions WHERE user_id = ?').bind(userId),
        db.prepare('DELETE FROM users WHERE id = ?').bind(userId),
      ]);

      return jsonResponse({
        success: true,
        message: `Angler account ${targetUser.email} and associated data successfully deleted`,
      });
    }

    return errorResponse(`Unknown action: ${action}`, 400);
  } catch (err: any) {
    return errorResponse(err.message || 'Operation failed', 500);
  }
};
