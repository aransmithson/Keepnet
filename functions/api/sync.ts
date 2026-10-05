import { Env, jsonResponse, errorResponse, corsHeaders } from './_types';
import { sanitizeInput } from './_crypto';
import { requireAuth, verifyOwnership } from './_auth';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const auth = await requireAuth(context);
    if (!auth.success) {
      return auth.response;
    }
    const currentUser = auth.user;

    const db = context.env.DB;
    const body = await context.request.json() as any;
    const { user, sessions = [], catches = [], subscription } = body;

    // Ensure non-destructive user_subscriptions table exists
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

    const requestedUserId = sanitizeInput(user?.id, 64);
    if (requestedUserId && !verifyOwnership(currentUser, requestedUserId)) {
      return errorResponse('Forbidden: Cannot synchronize cloud data for another angler account', 403);
    }

    const userId = currentUser.id;
    const userName = currentUser.nickname || currentUser.name || 'Angler';

    const safeSessions = Array.isArray(sessions) ? sessions.slice(0, 50) : [];
    const safeCatches = Array.isArray(catches) ? catches.slice(0, 100) : [];

    const isDownloadOnly = body.mode === 'download' || body.replace === true;

    // Upsert sessions if provided and not in download-only mode
    if (!isDownloadOnly && safeSessions.length > 0) {
      const sessionStmt = db.prepare(`
        INSERT INTO sessions (
          id, user_id, user_name, venue_id, venue_name, lat, lon,
          started_at, ended_at, weather_json, weather_error, notes, photo, photos_json, is_shared, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          user_name = excluded.user_name,
          venue_id = excluded.venue_id,
          venue_name = excluded.venue_name,
          lat = excluded.lat,
          lon = excluded.lon,
          started_at = excluded.started_at,
          ended_at = excluded.ended_at,
          weather_json = excluded.weather_json,
          weather_error = excluded.weather_error,
          notes = excluded.notes,
          photo = excluded.photo,
          photos_json = excluded.photos_json,
          is_shared = excluded.is_shared,
          updated_at = CURRENT_TIMESTAMP
        WHERE sessions.user_id = ? OR sessions.user_id IS NULL
      `);

      const batch = safeSessions.map((s: any) => {
        const lat = Number(s.lat);
        const lon = Number(s.lon);
        return sessionStmt.bind(
          sanitizeInput(s.id, 64) || Math.random().toString(36).slice(2, 10),
          userId,
          userName,
          sanitizeInput(s.venueId, 64) || 'current',
          sanitizeInput(s.venueName, 100) || 'Fishing Swim',
          Number.isFinite(lat) ? lat : 0,
          Number.isFinite(lon) ? lon : 0,
          sanitizeInput(s.startedAt, 40) || new Date().toISOString(),
          s.endedAt ? sanitizeInput(s.endedAt, 40) : null,
          s.weather && typeof s.weather === 'object' ? JSON.stringify(s.weather).slice(0, 10000) : null,
          s.weatherError ? sanitizeInput(s.weatherError, 255) : null,
          s.notes ? sanitizeInput(s.notes, 5000) : null,
          s.photo && typeof s.photo === 'string' && s.photo.startsWith('data:image/') ? s.photo : null,
          Array.isArray(s.photos) ? JSON.stringify(s.photos.slice(0, 10)).slice(0, 200000) : null,
          s.isShared ? 1 : 0,
          userId
        );
      });
      await db.batch(batch);
    }

    // Upsert catches if provided and not in download-only mode
    if (!isDownloadOnly && safeCatches.length > 0) {
      const catchStmt = db.prepare(`
        INSERT INTO catches (
          id, session_id, user_id, user_name, species, weight_lb, weight_oz, bait, caught_at, image, notes, is_shared
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          session_id = excluded.session_id,
          user_name = excluded.user_name,
          species = excluded.species,
          weight_lb = excluded.weight_lb,
          weight_oz = excluded.weight_oz,
          bait = excluded.bait,
          caught_at = excluded.caught_at,
          image = excluded.image,
          notes = excluded.notes,
          is_shared = excluded.is_shared
        WHERE catches.user_id = ? OR catches.user_id IS NULL
      `);

      const batch = safeCatches.map((c: any) => {
        const lb = Number(c.weightLb);
        const oz = Number(c.weightOz);
        return catchStmt.bind(
          sanitizeInput(c.id, 64) || Math.random().toString(36).slice(2, 10),
          sanitizeInput(c.sessionId, 64) || 'session_default',
          userId,
          userName,
          sanitizeInput(c.species, 80) || 'Fish',
          Number.isFinite(lb) && lb >= 0 ? Math.min(lb, 1000) : 0,
          Number.isFinite(oz) && oz >= 0 ? Math.min(oz, 15) : 0,
          sanitizeInput(c.bait, 100) || 'Unknown',
          sanitizeInput(c.caughtAt, 40) || new Date().toISOString(),
          c.image && typeof c.image === 'string' && c.image.startsWith('data:image/') ? c.image : null,
          c.notes ? sanitizeInput(c.notes, 2000) : null,
          c.isShared ? 1 : 0,
          userId
        );
      });
      await db.batch(batch);
    }

    // Upsert subscription metadata if provided
    if (subscription && typeof subscription === 'object' && subscription.tier) {
      const subTier = subscription.tier === 'premium' ? 'premium' : 'lite';
      const appliedCoupon = sanitizeInput(subscription.appliedCoupon, 40) || null;
      const expiresAt = sanitizeInput(subscription.expiresAt, 40) || null;
      const subId = Math.random().toString(36).slice(2, 10);
      await db.prepare(`
        INSERT INTO user_subscriptions (id, user_id, tier, applied_coupon, expires_at, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
          tier = excluded.tier,
          applied_coupon = excluded.applied_coupon,
          expires_at = excluded.expires_at,
          updated_at = CURRENT_TIMESTAMP
      `).bind(subId, userId, subTier, appliedCoupon, expiresAt).run().catch(() => {});
    }

    // Fetch all cloud sessions and catches strictly for the authenticated user
    const sRes = await db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at DESC').bind(userId).all();
    const remoteSessions = (sRes.results || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      venueId: row.venue_id,
      venueName: row.venue_name,
      lat: Number(row.lat) || 0,
      lon: Number(row.lon) || 0,
      startedAt: row.started_at,
      endedAt: row.ended_at || undefined,
      weather: row.weather_json ? JSON.parse(row.weather_json) : undefined,
      weatherError: row.weather_error || undefined,
      notes: row.notes || undefined,
      photo: row.photo || undefined,
      photos: row.photos_json ? JSON.parse(row.photos_json) : [],
      isShared: row.is_shared === 1,
    }));

    const cRes = await db.prepare('SELECT * FROM catches WHERE user_id = ? ORDER BY caught_at DESC').bind(userId).all();
    const remoteCatches = (cRes.results || []).map((row: any) => ({
      id: row.id,
      sessionId: row.session_id,
      userId: row.user_id,
      userName: row.user_name,
      species: row.species,
      weightLb: Number(row.weight_lb || 0),
      weightOz: Number(row.weight_oz || 0),
      bait: row.bait,
      caughtAt: row.caught_at,
      image: row.image || undefined,
      notes: row.notes || undefined,
      isShared: row.is_shared === 1,
    }));

    // Fetch subscription status for user
    const userSub = await db.prepare('SELECT tier, applied_coupon, expires_at FROM user_subscriptions WHERE user_id = ?')
      .bind(userId)
      .first() as any;

    return jsonResponse({
      success: true,
      remoteSessions,
      remoteCatches,
      remoteSubscription: userSub ? {
        tier: userSub.tier || 'lite',
        appliedCoupon: userSub.applied_coupon || null,
        expiresAt: userSub.expires_at || null,
      } : null,
    });
  } catch (err: any) {
    return errorResponse(err.message || 'Sync failed', 500);
  }
};
