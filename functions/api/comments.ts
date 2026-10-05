import { Env, jsonResponse, errorResponse, corsHeaders } from './_types';
import { sanitizeInput } from './_crypto';
import { getAuthenticatedUser } from './_auth';
import { visibleCatch, apiError } from './_journal';

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { headers: corsHeaders });
};

async function ensureCommentsTable(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS catch_comments (
      id TEXT PRIMARY KEY,
      catch_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_email TEXT,
      is_premium INTEGER DEFAULT 1,
      comment TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run().catch(() => {});
}

// GET: Fetch comments for a specific catch or comment counts summary
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    await ensureCommentsTable(db);

    const url = new URL(context.request.url);
    const catchId = sanitizeInput(url.searchParams.get('catchId'), 64);

    if (catchId) {
      await visibleCatch(db, catchId, await getAuthenticatedUser(context));
      const { results } = await db.prepare(`
        SELECT id, catch_id, user_id, user_name, is_premium, comment, created_at
        FROM catch_comments
        WHERE catch_id = ?
        ORDER BY created_at DESC
      `).bind(catchId).all();

      return jsonResponse({
        success: true,
        catchId,
        comments: results || [],
      });
    }

    // Return comment counts grouped by catch_id
    const { results } = await db.prepare(`
      SELECT cc.catch_id, count(*) as count
      FROM catch_comments cc JOIN catches c ON c.id = cc.catch_id
      WHERE c.is_shared = 1 AND c.is_confidential = 0
      GROUP BY cc.catch_id
    `).all();

    const counts: Record<string, number> = {};
    (results || []).forEach((r: any) => {
      if (r.catch_id) counts[r.catch_id] = Number(r.count || 0);
    });

    return jsonResponse({ success: true, commentCounts: counts });
  } catch (err: any) {
    return apiError(err, 'Failed to fetch comments');
  }
};

// POST: Add a comment to a catch (PREMIUM MEMBERS ONLY)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    await ensureCommentsTable(db);

    const user = await getAuthenticatedUser(context);
    if (!user) {
      return errorResponse('Authentication required. Please sign in to comment.', 401);
    }

    const body = (await context.request.json().catch(() => ({}))) as any;
    const catchId = sanitizeInput(body.catchId, 64);
    const rawComment = String(body.comment || '').trim();

    if (!catchId) {
      return errorResponse('catchId is required', 400);
    }
    if (!rawComment) {
      return errorResponse('Comment cannot be empty', 400);
    }
    await visibleCatch(db, catchId, user);

    // Sanitize comment text (strip HTML tags, limit to 1000 characters)
    const cleanComment = sanitizeInput(rawComment, 1000).replace(/[<>]/g, '');
    if (!cleanComment) {
      return errorResponse('Invalid comment text', 400);
    }

    // ENFORCE: Commenting is STRICTLY for Keepnet Premium members
    const isOwner = user.is_admin === 1;
    let isPremium = isOwner;

    if (!isPremium) {
      // Check user_subscriptions in D1
      const sub = (await db.prepare(`
        SELECT tier, expires_at FROM user_subscriptions 
        WHERE user_id = ? AND tier = 'premium'
      `).bind(user.id).first().catch(() => null)) as any;

      if (sub && (!sub.expires_at || new Date(sub.expires_at).getTime() > Date.now())) {
        isPremium = true;
      }
    }

    if (!isPremium) {
      return errorResponse('Specimen Suite: Commenting and tactical feedback is exclusive to Keepnet Premium members.', 403);
    }

    const commentId = `cmt_${crypto.randomUUID()}`;
    const authorName = user.nickname || user.name || 'Specimen Angler';

    await db.prepare(`
      INSERT INTO catch_comments (id, catch_id, user_id, user_name, user_email, is_premium, comment, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
    `).bind(
      commentId,
      catchId,
      user.id,
      authorName,
      user.email,
      cleanComment
    ).run();

    return jsonResponse({
      success: true,
      message: 'Comment posted successfully',
      comment: {
        id: commentId,
        catch_id: catchId,
        user_id: user.id,
        user_name: authorName,
        is_premium: 1,
        comment: cleanComment,
        created_at: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    return apiError(err, 'Failed to post comment');
  }
};

// DELETE: Remove comment (author or admin/owner only)
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const db = context.env.DB;
    const user = await getAuthenticatedUser(context);
    if (!user) {
      return errorResponse('Authentication required', 401);
    }

    const url = new URL(context.request.url);
    const commentId = sanitizeInput(url.searchParams.get('id'), 64);
    if (!commentId) {
      return errorResponse('Comment ID is required', 400);
    }

    const comment = (await db.prepare('SELECT id, user_id FROM catch_comments WHERE id = ?')
      .bind(commentId)
      .first().catch(() => null)) as any;

    if (!comment) {
      return errorResponse('Comment not found', 404);
    }

    const isOwner = user.is_admin === 1;
    if (comment.user_id !== user.id && !isOwner) {
      return errorResponse('Forbidden: You can only delete your own comments', 403);
    }

    await db.prepare('DELETE FROM catch_comments WHERE id = ?').bind(commentId).run();

    return jsonResponse({ success: true, message: 'Comment deleted' });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to delete comment', 500);
  }
};
