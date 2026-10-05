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
    const userId = sanitizeInput(url.searchParams.get('userId'), 64);

    let query = 'SELECT * FROM sessions';
    const params: unknown[] = [];

    if (userId) {
      // Security: Accessing personal private sessions requires authenticated ownership
      const user = await getAuthenticatedUser(context);
      if (!user) {
        return errorResponse('Authentication required to access personal session records', 401);
      }
      if (!verifyOwnership(user, userId)) {
        return errorResponse('Forbidden: You can only access your own session records', 403);
      }

      query += ' WHERE user_id = ? ORDER BY started_at DESC';
      params.push(userId);
    } else {
      // Security: By default, public queries MUST ONLY return explicitly shared sessions
      query += ' WHERE is_shared = 1 ORDER BY started_at DESC LIMIT 100';
    }

    const { results } = await db.prepare(query).bind(...params).all();

    const formatted = (results || []).map((row: any) => ({
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

    return jsonResponse({ success: true, sessions: formatted });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to fetch sessions', 500);
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
    const rawSessions = Array.isArray(body) ? body : [body];

    // Limit maximum batch size to prevent payload overflow DoS
    const sessions = rawSessions.slice(0, 50);

    const stmt = db.prepare(`
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

    const batch = sessions.map((s: any) => {
      const lat = Number(s.lat);
      const lon = Number(s.lon);
      return stmt.bind(
        sanitizeInput(s.id, 64) || Math.random().toString(36).slice(2, 10),
        currentUser.id,
        currentUser.nickname || currentUser.name || sanitizeInput(s.userName, 60) || 'Angler',
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
        currentUser.id
      );
    });

    if (batch.length > 0) {
      await db.batch(batch);
    }

    return jsonResponse({ success: true, count: batch.length });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to save session', 500);
  }
};
