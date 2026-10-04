import { Env, jsonResponse, errorResponse, corsHeaders } from './_types';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    const body = await context.request.json() as any;
    const { user, sessions = [], catches = [] } = body;

    const userId = user?.id || null;
    const userName = user?.name || 'Angler';

    // Upsert sessions if provided
    if (sessions.length > 0) {
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
      `);

      const batch = sessions.map((s: any) =>
        sessionStmt.bind(
          s.id,
          userId || s.userId || null,
          s.userName || userName,
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
      await db.batch(batch);
    }

    // Upsert catches if provided
    if (catches.length > 0) {
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
      `);

      const batch = catches.map((c: any) =>
        catchStmt.bind(
          c.id,
          c.sessionId,
          userId || c.userId || null,
          c.userName || userName,
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
      await db.batch(batch);
    }

    // If userId provided, fetch all their cloud sessions and catches to return to client
    let remoteSessions: any[] = [];
    let remoteCatches: any[] = [];

    if (userId) {
      const sRes = await db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at DESC').bind(userId).all();
      remoteSessions = (sRes.results || []).map((row: any) => ({
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

      const cRes = await db.prepare('SELECT * FROM catches WHERE user_id = ? ORDER BY caught_at DESC').bind(userId).all();
      remoteCatches = (cRes.results || []).map((row: any) => ({
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
    }

    return jsonResponse({
      success: true,
      remoteSessions,
      remoteCatches,
    });
  } catch (err: any) {
    return errorResponse(err.message || 'Sync failed', 500);
  }
};
