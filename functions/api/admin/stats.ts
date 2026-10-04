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

    // 1. Overall Totals
    const userCount = await db.prepare('SELECT count(*) as total FROM users').first('total');
    const sessionCount = await db.prepare('SELECT count(*) as total FROM sessions').first('total');
    const catchCount = await db.prepare('SELECT count(*) as total FROM catches').first('total');
    const sharedCatchCount = await db.prepare('SELECT count(*) as total FROM catches WHERE is_shared = 1').first('total');
    const sharedSessionCount = await db.prepare('SELECT count(*) as total FROM sessions WHERE is_shared = 1').first('total');
    const activeLockouts = await db.prepare('SELECT count(*) as total FROM users WHERE locked_until > ?').bind(Date.now()).first('total');

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

    // 4. Recent Anglers list
    const recentUsers = await db.prepare(`
      SELECT id, email, name, nickname, storage_mode, created_at, failed_logins, locked_until, is_admin
      FROM users
      ORDER BY created_at DESC
      LIMIT 15
    `).all();

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
