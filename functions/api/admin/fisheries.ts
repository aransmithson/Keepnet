import { Env, jsonResponse, errorResponse, corsHeaders } from '../_types';
import { verifyAdmin } from './_auth';
import { sanitizeInput } from '../_crypto';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    const url = new URL(context.request.url);
    const search = sanitizeInput(url.searchParams.get('q') || '', 100);

    let query = 'SELECT * FROM fisheries';
    const params: unknown[] = [];

    if (search) {
      query += ' WHERE name LIKE ? OR region LIKE ? OR type LIKE ?';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    query += ' ORDER BY name ASC LIMIT 100';

    const { results } = await db.prepare(query).bind(...params).all();

    const formatted = (results || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      lat: Number(r.lat) || 0,
      lon: Number(r.lon) || 0,
      region: r.region,
      country: r.country || 'England',
      address: r.address,
      postcode: r.postcode,
      website: r.website,
      targets: r.targets_json ? JSON.parse(r.targets_json) : [],
      description: r.description,
      createdAt: r.created_at,
    }));

    return jsonResponse({ success: true, fisheries: formatted });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to fetch fisheries', 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const auth = await verifyAdmin(context);
    if (!auth.authorized) {
      return errorResponse(auth.error || 'Admin authorization required', 403);
    }

    const db = context.env.DB;
    const body = await context.request.json() as any;

    const name = sanitizeInput(body.name, 120);
    if (!name) {
      return errorResponse('Fishery name is required', 400);
    }

    const id = sanitizeInput(body.id, 80) || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const type = sanitizeInput(body.type || 'Coarse Lakes', 60);
    const lat = Number(body.lat);
    const lon = Number(body.lon);
    const region = sanitizeInput(body.region || 'UK', 60);
    const country = sanitizeInput(body.country || 'England', 50);
    const address = sanitizeInput(body.address || '', 200);
    const postcode = sanitizeInput(body.postcode || '', 20);
    const website = sanitizeInput(body.website || '', 255);
    const targets = Array.isArray(body.targets) ? JSON.stringify(body.targets.slice(0, 15)) : JSON.stringify(['Carp', 'Coarse']);
    const description = sanitizeInput(body.description || '', 2000);

    await db.prepare(`
      INSERT INTO fisheries (
        id, name, type, lat, lon, region, country, address, postcode, website, targets_json, description, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        lat = excluded.lat,
        lon = excluded.lon,
        region = excluded.region,
        country = excluded.country,
        address = excluded.address,
        postcode = excluded.postcode,
        website = excluded.website,
        targets_json = excluded.targets_json,
        description = excluded.description,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      id, name, type,
      Number.isFinite(lat) ? lat : 53.0,
      Number.isFinite(lon) ? lon : -1.5,
      region, country, address, postcode, website, targets, description
    ).run();

    return jsonResponse({
      success: true,
      message: `Fishery ${name} saved successfully`,
      fishery: { id, name, type, lat, lon, region, country, address, postcode, website, description },
    });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to save fishery', 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const auth = await verifyAdmin(context);
    if (!auth.authorized) {
      return errorResponse(auth.error || 'Admin authorization required', 403);
    }

    const db = context.env.DB;
    const url = new URL(context.request.url);
    const id = sanitizeInput(url.searchParams.get('id'), 80);

    if (!id) {
      return errorResponse('Fishery ID is required', 400);
    }

    await db.prepare('DELETE FROM fisheries WHERE id = ?').bind(id).run();
    return jsonResponse({ success: true, message: `Fishery deleted successfully` });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to delete fishery', 500);
  }
};
