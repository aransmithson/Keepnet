import { Env, jsonResponse, errorResponse, corsHeaders } from './_types';
import { sanitizeInput } from './_crypto';
import { requireAuth, getAuthenticatedUser, verifyOwnership } from './_auth';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    const url = new URL(context.request.url);
    const sessionId = sanitizeInput(url.searchParams.get('sessionId'), 64);
    const userId = sanitizeInput(url.searchParams.get('userId'), 64);

    let query = 'SELECT * FROM catches';
    const params: unknown[] = [];

    if (userId) {
      // Security: Accessing personal private catches requires authenticated ownership
      const user = await getAuthenticatedUser(context);
      if (!user) {
        return errorResponse('Authentication required to access personal catch records', 401);
      }
      if (!verifyOwnership(user, userId)) {
        return errorResponse('Forbidden: You can only access your own catch records', 403);
      }

      query += ' WHERE user_id = ? ORDER BY caught_at DESC';
      params.push(userId);
    } else if (sessionId) {
      // Security: Check if session is public or belongs to authenticated caller
      const sessionRow = await db.prepare('SELECT user_id, is_shared FROM sessions WHERE id = ?').bind(sessionId).first<any>();
      if (!sessionRow) {
        return jsonResponse({ success: true, catches: [] });
      }

      if (sessionRow.is_shared !== 1) {
        const user = await getAuthenticatedUser(context);
        if (!user || !verifyOwnership(user, sessionRow.user_id)) {
          return errorResponse('Forbidden: This session and its catches are private', 403);
        }
      }

      query += ' WHERE session_id = ? ORDER BY caught_at DESC';
      params.push(sessionId);
    } else {
      // Security: By default, public queries MUST ONLY return explicitly shared catches
      query += ' WHERE is_shared = 1 ORDER BY caught_at DESC LIMIT 200';
    }

    const { results } = await db.prepare(query).bind(...params).all();

    const formatted = (results || []).map((row: any) => ({
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

    return jsonResponse({ success: true, catches: formatted });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to fetch catches', 500);
  }
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
    const rawCatches = Array.isArray(body) ? body : [body];
    const catches = rawCatches.slice(0, 50);

    const stmt = db.prepare(`
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

    const batch = catches.map((c: any) => {
      const lb = Number(c.weightLb);
      const oz = Number(c.weightOz);
      return stmt.bind(
        sanitizeInput(c.id, 64) || Math.random().toString(36).slice(2, 10),
        sanitizeInput(c.sessionId, 64) || 'session_default',
        currentUser.id,
        currentUser.nickname || currentUser.name || sanitizeInput(c.userName, 60) || 'Angler',
        sanitizeInput(c.species, 80) || 'Fish',
        Number.isFinite(lb) && lb >= 0 ? Math.min(lb, 1000) : 0,
        Number.isFinite(oz) && oz >= 0 ? Math.min(oz, 15) : 0,
        sanitizeInput(c.bait, 100) || 'Unknown',
        sanitizeInput(c.caughtAt, 40) || new Date().toISOString(),
        c.image && typeof c.image === 'string' && c.image.startsWith('data:image/') ? c.image : null,
        c.notes ? sanitizeInput(c.notes, 2000) : null,
        c.isShared ? 1 : 0,
        currentUser.id
      );
    });

    if (batch.length > 0) {
      await db.batch(batch);
    }

    return jsonResponse({ success: true, count: batch.length });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to save catch', 500);
  }
};
