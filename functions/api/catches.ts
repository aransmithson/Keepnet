import { Env, jsonResponse, errorResponse, corsHeaders } from './_types';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    const url = new URL(context.request.url);
    const sharedOnly = url.searchParams.get('shared') === '1' || url.searchParams.get('shared') === 'true';
    const sessionId = url.searchParams.get('sessionId');
    const userId = url.searchParams.get('userId');

    let query = 'SELECT * FROM catches';
    const params: unknown[] = [];

    if (sharedOnly) {
      query += ' WHERE is_shared = 1 ORDER BY caught_at DESC LIMIT 200';
    } else if (sessionId) {
      query += ' WHERE session_id = ? ORDER BY caught_at DESC';
      params.push(sessionId);
    } else if (userId) {
      query += ' WHERE user_id = ? ORDER BY caught_at DESC';
      params.push(userId);
    } else {
      query += ' ORDER BY caught_at DESC LIMIT 200';
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
    const db = context.env.DB;
    const body = await context.request.json() as any;
    const catches = Array.isArray(body) ? body : [body];

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
    `);

    const batch = catches.map((c: any) =>
      stmt.bind(
        c.id,
        c.sessionId,
        c.userId || null,
        c.userName || 'Angler',
        c.species,
        c.weightLb ?? 0,
        c.weightOz ?? 0,
        c.bait || 'Unknown',
        c.caughtAt || new Date().toISOString(),
        c.image || null,
        c.notes || null,
        c.isShared ? 1 : 0
      )
    );

    if (batch.length > 0) {
      await db.batch(batch);
    }

    return jsonResponse({ success: true, count: batch.length });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to save catch', 500);
  }
};
