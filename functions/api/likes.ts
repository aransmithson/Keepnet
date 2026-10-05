import { Env, jsonResponse, errorResponse, corsHeaders } from './_types';
import { sanitizeInput } from './_crypto';
import { getAuthenticatedUser } from './_auth';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    const url = new URL(context.request.url);
    const catchId = sanitizeInput(url.searchParams.get('catchId'), 64);

    // Ensure non-destructive table existence
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS catch_likes (
        id TEXT PRIMARY KEY,
        catch_id TEXT NOT NULL,
        user_id TEXT,
        created_at TEXT NOT NULL
      )
    `).run().catch(() => {});

    if (catchId) {
      const countRow = await db.prepare('SELECT count(*) as count FROM catch_likes WHERE catch_id = ?').bind(catchId).first<any>();
      return jsonResponse({ success: true, catchId, likesCount: Number(countRow?.count || 0) });
    }

    // Return all like counts grouped by catch_id
    const { results } = await db.prepare('SELECT catch_id, count(*) as count FROM catch_likes GROUP BY catch_id').all();
    const likes: Record<string, number> = {};
    (results || []).forEach((r: any) => {
      if (r.catch_id) likes[r.catch_id] = Number(r.count || 0);
    });

    return jsonResponse({ success: true, likes });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to fetch likes', 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    const body = await context.request.json() as any;
    const catchId = sanitizeInput(body.catchId, 64);
    const action = body.action === 'unlike' ? 'unlike' : 'like';

    if (!catchId) {
      return errorResponse('catchId is required', 400);
    }

    // Ensure non-destructive table existence
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS catch_likes (
        id TEXT PRIMARY KEY,
        catch_id TEXT NOT NULL,
        user_id TEXT,
        created_at TEXT NOT NULL
      )
    `).run().catch(() => {});

    const user = await getAuthenticatedUser(context);
    const userId = user?.id || null;

    if (action === 'unlike') {
      if (userId) {
        await db.prepare('DELETE FROM catch_likes WHERE catch_id = ? AND user_id = ?').bind(catchId, userId).run();
      } else {
        await db.prepare('DELETE FROM catch_likes WHERE id IN (SELECT id FROM catch_likes WHERE catch_id = ? LIMIT 1)').bind(catchId).run();
      }
    } else {
      const likeId = userId ? `${catchId}_${userId}` : `${catchId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await db.prepare(`
        INSERT OR IGNORE INTO catch_likes (id, catch_id, user_id, created_at)
        VALUES (?, ?, ?, ?)
      `).bind(likeId, catchId, userId, new Date().toISOString()).run();
    }

    const countRow = await db.prepare('SELECT count(*) as count FROM catch_likes WHERE catch_id = ?').bind(catchId).first<any>();
    const likesCount = Number(countRow?.count || 0);

    return jsonResponse({ success: true, catchId, likesCount, liked: action === 'like' });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to update catch like', 500);
  }
};
