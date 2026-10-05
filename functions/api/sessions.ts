import { Env, jsonResponse, errorResponse, corsHeaders } from './_types';
import { sanitizeInput } from './_crypto';
import { requireAuth, getAuthenticatedUser, verifyOwnership } from './_auth';
import { ApiError, apiError, sessionRow, prepareSession, checkRecordOwner } from './_journal';

export const onRequestOptions: PagesFunction<Env> = async () => new Response(null, { headers: corsHeaders });

export const onRequestGet: PagesFunction<Env> = async context => {
  try {
    const db = context.env.DB, url = new URL(context.request.url);
    const userId = sanitizeInput(url.searchParams.get('userId'), 64);
    const recordId = sanitizeInput(url.searchParams.get('id'), 64);
    const user = await getAuthenticatedUser(context);
    if (recordId) {
      const row = await db.prepare('SELECT * FROM sessions WHERE id = ?').bind(recordId).first<any>();
      if (!row || !((row.is_shared === 1 && row.is_confidential !== 1) || (user && verifyOwnership(user,row.user_id)))) {
        return errorResponse('Session not found or private',404);
      }
      return jsonResponse({ success:true, sessions:[sessionRow(row)] });
    }
    if (userId && (!user || !verifyOwnership(user,userId))) return errorResponse('Authentication and ownership required',user ? 403 : 401);
    const { results } = userId
      ? await db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at DESC').bind(userId).all()
      : await db.prepare('SELECT * FROM sessions WHERE is_shared = 1 AND is_confidential = 0 ORDER BY started_at DESC LIMIT 100').all();
    return jsonResponse({ success:true, sessions:(results || []).map(sessionRow) });
  } catch(err) { return apiError(err,'Failed to fetch sessions'); }
};

export const onRequestPost: PagesFunction<Env> = async context => {
  try {
    const auth = await requireAuth(context);
    if (!auth.success) return auth.response;
    const db = context.env.DB, body = await context.request.json();
    const entries = Array.isArray(body) ? body : [body];
    if (entries.length > 50) throw new ApiError('Send up to 50 sessions per batch',413);
    const prepared = entries.map(s=>prepareSession(db,s,auth.user));
    for (const record of prepared) await checkRecordOwner(db,'sessions',record.id,auth.user.id);
    if (prepared.length) await db.batch(prepared.map(record=>record.statement));
    return jsonResponse({success:true,count:prepared.length,savedSessionIds:prepared.map(record=>record.id)});
  } catch(err) { return apiError(err,'Failed to save sessions'); }
};
