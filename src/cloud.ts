import { getAuthToken } from './auth';
import { actions } from './store';
import { getAccountScope } from './accountScope';
import type { Catch } from './store';
export { pushSessionToCloud, pushCatchToCloud, deleteCatchOnCloud, getPendingJournal, clearPendingJournal, isSessionOnCloud, flushPendingQueue, fetchPublicSharedData, syncUserWithCloud, fetchUserCloudData, useCloudSyncStatus, type SyncStatusState } from './journalSync';
function getHeaders(): Record<string, string> {
  const token = getAuthToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
export async function fetchSessionCatches(sessionId: string): Promise<Catch[]> {
  const response = await fetch(`/api/catches?sessionId=${encodeURIComponent(sessionId)}`, { headers: getHeaders() });
  if (!response.ok) throw new Error('Session catches could not be loaded. Please try again.');
  const data = await response.json();
  return data.catches || [];
}
export async function fetchRecord<T>(kind: 'sessions' | 'catches', id: string): Promise<T> {
  const response = await fetch(`/api/${kind}?id=${encodeURIComponent(id)}`, { headers: getHeaders() });
  if (!response.ok) throw new Error(response.status === 404 ? 'This record is private, removed, or unavailable to this account.' : 'The record could not be loaded. Please try again.');
  const data = await response.json();
  const record = data[kind]?.[0];
  if (!record) throw new Error('This record is private, removed, or unavailable to this account.');
  return record;
}
/** Redeem a 1-month free trial coupon with the backend API */
export async function redeemCouponOnCloud(
  code: string
): Promise<{ success: boolean; message: string; tier?: 'lite' | 'premium'; appliedCoupon?: string; expiresAt?: string }> {
  try {
    const res = await fetch('/api/subscription/coupon', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      return {
        success: true,
        message: data.message || `Coupon "${code}" applied!`,
        tier: data.tier,
        appliedCoupon: data.appliedCoupon,
        expiresAt: data.expiresAt,
      };
    }
    return {
      success: false,
      message: data.error || 'Invalid or expired coupon code.',
    };
  } catch (err: any) {
    console.warn('[Keepnet Cloud] Coupon redemption error', err);
    return {
      success: false,
      message: 'Unable to redeem the trial while offline. Please reconnect and try again.',
    };
  }
}

/** Cancel coupon trial or return to Lite on the backend */
export async function cancelSubscriptionOnCloud(): Promise<boolean> {
  try {
    const res = await fetch('/api/subscription/coupon', {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return res.ok;
  } catch (err) {
    console.warn('[Keepnet Cloud] Failed to cancel subscription on cloud', err);
    return false;
  }
}

/** Sync a like or unlike on a catch report to Cloudflare D1. */
export async function syncCatchLikeToCloud(catchId: string, liked: boolean): Promise<number | null> {
  try {
    const res = await fetch('/api/likes', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ catchId, action: liked ? 'like' : 'unlike' }),
    });
    if (res.ok) {
      const data = await res.json();
      return typeof data.likesCount === 'number' ? data.likesCount : null;
    }
  } catch (err) {
    console.warn('[Keepnet Cloud] Failed to sync like to cloud', err);
  }
  return null;
}

/** Fetch public like counts across shared community catches. */
export async function fetchCatchLikes(): Promise<Record<string, number>> {
  const scope = getAccountScope(), token = getAuthToken();
  const revision = actions.getSocialRevision();
  try {
    const res = await fetch('/api/likes', { headers: getHeaders() });
    if (res.ok) {
      const data = await res.json();
      if (scope !== getAccountScope() || token !== getAuthToken() || revision !== actions.getSocialRevision()) return {};
      if (Array.isArray(data.likedCatchIds)) actions.setLikedCatchIds(data.likedCatchIds);
      return data.likes || {};
    }
  } catch (err) {
    console.warn('[Keepnet Cloud] Failed to fetch catch likes', err);
  }
  return {};
}

export interface CatchComment {
  id: string;
  catch_id: string;
  user_id: string;
  user_name: string;
  is_premium: number;
  comment: string;
  created_at: string;
}

/** Fetch comments for a specific catch report from Cloudflare D1. */
export async function fetchCatchComments(catchId: string): Promise<CatchComment[]> {
    const res = await fetch(`/api/comments?catchId=${encodeURIComponent(catchId)}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Comments could not be loaded. Please try again.');
    const data = await res.json();
    return Array.isArray(data.comments) ? data.comments : [];
}

/** Post a new comment on a catch report (Requires Keepnet Premium). */
export async function postCatchComment(
  catchId: string,
  comment: string
): Promise<{ success: boolean; comment?: CatchComment; error?: string }> {
  try {
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ catchId, comment }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      return { success: true, comment: data.comment };
    }
    return { success: false, error: data.error || `Failed to post comment (${res.status})` };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error posting comment' };
  }
}

/** Delete a comment (Author or platform admin). */
export async function deleteCatchComment(commentId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/comments?id=${encodeURIComponent(commentId)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return res.ok;
  } catch (err) {
    console.warn('[Keepnet Cloud] Failed to delete comment', err);
    return false;
  }
}

/** Fetch comment counts across all shared catches. */
export async function fetchCatchCommentCounts(): Promise<Record<string, number>> {
  try {
    const res = await fetch('/api/comments', { headers: getHeaders() });
    if (res.ok) {
      const data = await res.json();
      return data.commentCounts || {};
    }
  } catch (err) {
    console.warn('[Keepnet Cloud] Failed to fetch comment counts', err);
  }
  return {};
}

