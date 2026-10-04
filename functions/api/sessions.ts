import { Env, jsonResponse, errorResponse, corsHeaders } from './_types';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    const url = new URL(context.request.url);
    const sharedOnly = url.searchParams.get('shared') === '1' || url.searchParams.get('shared') === 'true';
    const userId = url.searchParams.get('userId');

    let query = 'SELECT * FROM sessions';
    const params: unknown[] = [];

    if (sharedOnly) {
      query += ' WHERE is_shared = 1 ORDER BY started_at DESC LIMIT 100';
    } else if (userId) {
      query += ' WHERE user_id = ? ORDER BY started_at DESC';
      params.push(userId);
    } else {
      query += ' ORDER BY started_at DESC LIMIT 100';
    }

    const { results } = await db.prepare(query).bind(...params).all();

    const formatted = (results || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      venueId: row.venue_id,
      venueName: row.venue_name,
      lat: Number(row.lat),
      lon: Number(row.lon),
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
    const db = context.env.DB;
    const body = await context.request.json() as any;
    const sessions = Array.isArray(body) ? body : [body];

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
    `);

    const batch = sessions.map((s: any) =>
      stmt.bind(
        s.id,
        s.userId || null,
        s.userName || 'Angler',
        s.venueId || 'current',
        s.venueName || 'Fishing Swim',
        s.lat ?? 0,
        s.lon ?? 0,
        s.startedAt || new Date().toISOString(),
        s.endedAt || null,
        s.weather ? JSON.stringify(s.weather) : null,
        s.weatherError || null,
        s.notes || null,
        s.photo || null,
        s.photos ? JSON.stringify(s.photos) : null,
        s.isShared ? 1 : 0
      )
    );

    if (batch.length > 0) {
      await db.batch(batch);
    }

    return jsonResponse({ success: true, count: batch.length });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to save session', 500);
  }
};
