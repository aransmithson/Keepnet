import { Env, jsonResponse, errorResponse, corsHeaders } from './_types';
import { verifyAdmin } from './admin/_auth';
import { sanitizeInput } from './_crypto';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    const { results } = await db.prepare('SELECT name, category, sort_order FROM species_tags ORDER BY sort_order ASC, name ASC').all();

    if (!results || results.length === 0) {
      // Fallback default UK fish tags if table is unpopulated
      const defaults = [
        'Carp', 'Pike', 'Perch', 'Chub', 'Roach', 'Bream', 'Tench',
        'Barbel', 'Brown trout', 'Rainbow trout', 'Grayling', 'Dace', 'Rudd'
      ];
      return jsonResponse({ success: true, species: defaults });
    }

    const species = results.map((r: any) => r.name);
    return jsonResponse({ success: true, species, details: results });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to fetch species', 500);
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
    const action = body.action || 'add';

    if (action === 'delete') {
      const name = sanitizeInput(body.name, 60);
      if (!name) return errorResponse('Species name is required', 400);

      await db.prepare('DELETE FROM species_tags WHERE name = ?').bind(name).run();
      return jsonResponse({ success: true, message: `Removed ${name} from species list` });
    }

    // Add or update species tag
    const name = sanitizeInput(body.name, 60);
    const category = sanitizeInput(body.category || 'Coarse', 40);
    const sortOrder = Number(body.sortOrder) || 100;

    if (!name) {
      return errorResponse('Species name cannot be empty', 400);
    }

    await db.prepare(`
      INSERT INTO species_tags (name, category, sort_order)
      VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        category = excluded.category,
        sort_order = excluded.sort_order
    `).bind(name, category, sortOrder).run();

    return jsonResponse({ success: true, message: `Saved species tag ${name}` });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to update species', 500);
  }
};
