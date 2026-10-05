import { Env, jsonResponse, errorResponse, corsHeaders } from '../_types';
import { verifyAdmin } from './_auth';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const auth = await verifyAdmin(context);
    if (!auth.authorized) {
      return errorResponse(auth.error || 'Admin authorization required', 403);
    }

    const db = context.env.DB;

    // Export tables (excluding sensitive password hashes)
    const users = await db.prepare('SELECT id, email, name, nickname, storage_mode, created_at, failed_logins, is_admin FROM users').all();
    const sessions = await db.prepare('SELECT * FROM sessions').all();
    const catches = await db.prepare('SELECT * FROM catches').all();
    const fisheries = await db.prepare('SELECT * FROM fisheries').all();
    const species = await db.prepare('SELECT * FROM species_tags').all();
    const subscriptions = await db.prepare('SELECT * FROM user_subscriptions').all();
    const couponRedemptions = await db.prepare('SELECT * FROM coupon_redemptions').all();
    const trialClaims = await db.prepare('SELECT * FROM trial_claims').all();
    const likes = await db.prepare('SELECT * FROM catch_likes').all();
    const comments = await db.prepare('SELECT * FROM catch_comments').all();
    const deletions = await db.prepare('SELECT * FROM catch_deletions').all();

    return jsonResponse({
      success: true,
      timestamp: new Date().toISOString(),
      counts: {
        users: (users.results || []).length,
        sessions: (sessions.results || []).length,
        catches: (catches.results || []).length,
        fisheries: (fisheries.results || []).length,
        species: (species.results || []).length,
      },
      data: {
        users: users.results || [],
        sessions: sessions.results || [],
        catches: catches.results || [],
        fisheries: fisheries.results || [],
        species: species.results || [],
        subscriptions: subscriptions.results || [],
        couponRedemptions: couponRedemptions.results || [],
        trialClaims: trialClaims.results || [],
        likes: likes.results || [],
        comments: comments.results || [],
        deletions: deletions.results || [],
      },
    });
  } catch (err: any) {
    return errorResponse(err.message || 'Backup failed', 500);
  }
};
