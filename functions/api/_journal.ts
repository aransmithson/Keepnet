import { sanitizeInput } from './_crypto';
import { verifyOwnership, type AuthenticatedUser } from './_auth';
import { errorResponse } from './_types';

export class ApiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const apiError = (err: unknown, fallback: string) => err instanceof ApiError
  ? errorResponse(err.message, err.status) : errorResponse(fallback, 500);

/** Never truncate serialized JSON. Reject oversized writes and recover legacy corrupt rows. */
export function parseJson<T>(raw: unknown, fallback: T): T {
  try { return typeof raw === 'string' ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function isImage(value: unknown): value is string {
  return typeof value === 'string' && (/^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(value)
    || /^\/images\/[A-Za-z0-9_./%-]+$/.test(value) || /^https:\/\//.test(value));
}
function image(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (!isImage(value)) throw new ApiError('Invalid photo format');
  if (value.length > 1_500_000) throw new ApiError('Photo is too large. Choose a smaller image.', 413);
  return value;
}
function gallery(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > 10) throw new ApiError('A gallery can contain up to 10 photos');
  const photos = value.map(image);
  if (photos.some(photo => !photo)) throw new ApiError('Invalid gallery photo');
  const json = JSON.stringify(photos);
  if (json.length > 1_500_000) throw new ApiError('Photo gallery is too large. Choose smaller images.', 413);
  return json;
}
function photoPayload(cover: string | null, photos: string | null) {
  if (new TextEncoder().encode((cover || '') + (photos || '')).byteLength > 1_750_000) {
    throw new ApiError('Combined photos are too large. Choose smaller images.', 413);
  }
}
function id(value: unknown, label: string): string {
  const clean = sanitizeInput(value, 64);
  if (!clean || clean !== value) throw new ApiError(`${label} is required and must be at most 64 characters`);
  return clean;
}
function timestamp(value: unknown, fallback = new Date().toISOString()): string {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new ApiError('Invalid record date');
  return new Date(value).toISOString();
}
function payloadOwner(value: any, user: AuthenticatedUser) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('Invalid journal record');
  if (value.userId && value.userId !== user.id) throw new ApiError('Cannot save another account journal', 403);
}

export function sessionRow(row: any) {
  const photos = parseJson<unknown>(row.photos_json, []);
  return {
    id: row.id, userId: row.user_id, userName: row.user_name,
    venueId: row.venue_id, venueName: row.venue_name,
    lat: Number(row.lat) || 0, lon: Number(row.lon) || 0,
    startedAt: row.started_at, endedAt: row.ended_at || undefined,
    weather: parseJson(row.weather_json, undefined), weatherError: row.weather_error || undefined,
    notes: row.notes || undefined, photo: row.photo || undefined,
    photos: Array.isArray(photos) ? photos.filter(isImage) : [],
    isShared: row.is_shared === 1 && row.is_confidential !== 1,
    sharingConfirmed: row.is_shared === 1 && row.is_confidential !== 1,
    isConfidential: row.is_confidential === 1, updatedAt: row.updated_at || undefined,
  };
}
export function catchRow(row: any) {
  const images = parseJson<unknown>(row.images_json, []);
  return {
    id: row.id, sessionId: row.session_id, userId: row.user_id, userName: row.user_name,
    species: row.species, weightLb: Number(row.weight_lb) || 0, weightOz: Number(row.weight_oz) || 0,
    bait: row.bait, caughtAt: row.caught_at, image: row.image || undefined,
    images: Array.isArray(images) ? images.filter(isImage) : [], method: row.method || undefined,
    notes: row.notes || undefined, isShared: row.is_shared === 1 && row.is_confidential !== 1,
    sharingConfirmed: row.is_shared === 1 && row.is_confidential !== 1,
    isConfidential: row.is_confidential === 1, updatedAt: row.updated_at || undefined,
  };
}

export function prepareSession(db: D1Database, s: any, user: AuthenticatedUser) {
  payloadOwner(s, user);
  const sessionId = id(s.id, 'Session ID');
  const lat = Number(s.lat), lon = Number(s.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new ApiError('Invalid session coordinates');
  const weather = s.weather && typeof s.weather === 'object' ? JSON.stringify(s.weather) : null;
  if (weather && weather.length > 10_000) throw new ApiError('Weather data is too large', 413);
  const confidential = !!s.isConfidential;
  const cover=image(s.photo),photos=gallery(s.photos);photoPayload(cover,photos);
  return { id: sessionId, statement: db.prepare(`
    INSERT INTO sessions (id,user_id,user_name,venue_id,venue_name,lat,lon,started_at,ended_at,weather_json,weather_error,notes,photo,photos_json,is_shared,is_confidential,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET user_name=excluded.user_name,venue_id=excluded.venue_id,venue_name=excluded.venue_name,
      lat=excluded.lat,lon=excluded.lon,started_at=excluded.started_at,ended_at=excluded.ended_at,weather_json=excluded.weather_json,
      weather_error=excluded.weather_error,notes=excluded.notes,photo=excluded.photo,photos_json=excluded.photos_json,
      is_shared=excluded.is_shared,is_confidential=excluded.is_confidential,updated_at=excluded.updated_at
    WHERE sessions.user_id = excluded.user_id
  `).bind(sessionId,user.id,user.nickname || user.name || 'Angler',sanitizeInput(s.venueId,64) || 'current',
    sanitizeInput(s.venueName,100) || 'Fishing Swim',lat,lon,timestamp(s.startedAt),s.endedAt ? timestamp(s.endedAt) : null,
    weather,sanitizeInput(s.weatherError,255) || null,sanitizeInput(s.notes,5000) || null,cover,photos,
    s.isShared && s.sharingConfirmed === true && !confidential ? 1 : 0,confidential ? 1 : 0,new Date().toISOString()) };
}
export function prepareCatch(db: D1Database, c: any, user: AuthenticatedUser) {
  payloadOwner(c, user);
  const catchId = id(c.id, 'Catch ID'), sessionId = id(c.sessionId, 'Session ID');
  const lb = Number(c.weightLb), oz = Number(c.weightOz);
  if (!Number.isFinite(lb) || !Number.isFinite(oz) || lb < 0 || lb > 1000 || oz < 0 || oz >= 16) throw new ApiError('Invalid catch weight');
  const confidential = !!c.isConfidential;
  const cover=image(c.image),photos=gallery(c.images);photoPayload(cover,photos);
  return { id: catchId, sessionId, statement: db.prepare(`
    INSERT INTO catches (id,session_id,user_id,user_name,species,weight_lb,weight_oz,bait,caught_at,image,images_json,method,notes,is_shared,is_confidential,updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM catch_deletions WHERE catch_id = ?)
    ON CONFLICT(id) DO UPDATE SET session_id=excluded.session_id,user_name=excluded.user_name,species=excluded.species,
      weight_lb=excluded.weight_lb,weight_oz=excluded.weight_oz,bait=excluded.bait,caught_at=excluded.caught_at,image=excluded.image,
      images_json=excluded.images_json,method=excluded.method,notes=excluded.notes,is_shared=excluded.is_shared,
      is_confidential=excluded.is_confidential,updated_at=excluded.updated_at
    WHERE catches.user_id = excluded.user_id
  `).bind(catchId,sessionId,user.id,user.nickname || user.name || 'Angler',sanitizeInput(c.species,80) || 'Fish',lb,oz,
    sanitizeInput(c.bait,100) || 'Unknown',timestamp(c.caughtAt),cover,photos,sanitizeInput(c.method,100) || null,
    sanitizeInput(c.notes,2000) || null,c.isShared && c.sharingConfirmed === true && !confidential ? 1 : 0,confidential ? 1 : 0,new Date().toISOString(),catchId) };
}

export async function checkRecordOwner(db: D1Database, table: 'sessions' | 'catches', recordId: string, userId: string) {
  const existing = await db.prepare(`SELECT user_id FROM ${table} WHERE id = ?`).bind(recordId).first<any>();
  if (existing && existing.user_id !== userId) throw new ApiError('Cannot change another account journal', 403);
}
export async function checkCatchParent(db: D1Database, sessionId: string, userId: string) {
  const parent = await db.prepare('SELECT user_id FROM sessions WHERE id = ?').bind(sessionId).first<any>();
  if (!parent) throw new ApiError('Save the parent session before its catches', 409);
  if (parent.user_id !== userId) throw new ApiError('Cannot add catches to another account session', 403);
}
export async function visibleCatch(db: D1Database, catchId: string, user: AuthenticatedUser | null) {
  const row = await db.prepare('SELECT * FROM catches WHERE id = ?').bind(catchId).first<any>();
  if (!row || !((row.is_shared === 1 && row.is_confidential !== 1) || (user && verifyOwnership(user, row.user_id)))) {
    throw new ApiError('Catch not found or private', 404);
  }
  return row;
}
