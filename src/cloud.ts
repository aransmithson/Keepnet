import { useSyncExternalStore } from 'react';
import type { Session, Catch } from './store';
import { type UserAccount, getAuthToken } from './auth';

export type SyncStatusState = {
  status: 'idle' | 'syncing' | 'error' | 'success';
  lastError: string | null;
  pendingCount: number;
};

// Queue storage key for offline bankside actions
const PENDING_QUEUE_KEY = 'keepnet:pending_cloud_queue';

interface PendingQueue {
  sessions: Record<string, Session>;
  catches: Record<string, Catch>;
}

function loadQueue(): PendingQueue {
  try {
    const raw = localStorage.getItem(PENDING_QUEUE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { sessions: {}, catches: {} };
}

function saveQueue(q: PendingQueue) {
  try {
    localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(q));
    notifySyncListeners();
  } catch {
    // ignore
  }
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

const syncListeners = new Set<() => void>();

let syncStatus: SyncStatusState = {
  status: 'idle',
  lastError: null,
  pendingCount: Object.keys(loadQueue().sessions).length + Object.keys(loadQueue().catches).length,
};

function notifySyncListeners() {
  const q = loadQueue();
  syncStatus = {
    ...syncStatus,
    pendingCount: Object.keys(q.sessions).length + Object.keys(q.catches).length,
  };
  syncListeners.forEach((cb) => cb());
}

function setSyncStatus(patch: Partial<SyncStatusState>) {
  syncStatus = { ...syncStatus, ...patch };
  notifySyncListeners();
}

export const useCloudSyncStatus = () =>
  useSyncExternalStore(
    (cb) => {
      syncListeners.add(cb);
      return () => syncListeners.delete(cb);
    },
    () => syncStatus
  );

/** Push a session to Cloudflare D1 if user is authenticated. Queues for retry if offline. */
export async function pushSessionToCloud(session: Session, user?: UserAccount | null): Promise<boolean> {
  const token = getAuthToken();
  if (!token && user?.storageMode === 'cloud') {
    setSyncStatus({ status: 'error', lastError: 'Sign in required to sync session to cloud' });
    return false;
  }

  try {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(session),
    });

    if (res.ok) {
      const q = loadQueue();
      if (q.sessions[session.id]) {
        delete q.sessions[session.id];
        saveQueue(q);
      }
      setSyncStatus({ status: 'success', lastError: null });
      return true;
    }

    const errData = await res.json().catch(() => ({}));
    const errMsg = errData.error || `HTTP ${res.status}`;
    setSyncStatus({ status: 'error', lastError: `Session save failed: ${errMsg}` });
    return false;
  } catch (err: any) {
    console.warn('[Keepnet Cloud] Failed to push session to D1 - queuing for retry', err);
    const q = loadQueue();
    q.sessions[session.id] = session;
    saveQueue(q);
    setSyncStatus({ status: 'error', lastError: 'Offline: session queued for bankside sync' });
    return false;
  }
}

/** Push a catch to Cloudflare D1 if user is authenticated. Queues for retry if offline. */
export async function pushCatchToCloud(item: Catch, user?: UserAccount | null): Promise<boolean> {
  const token = getAuthToken();
  if (!token && user?.storageMode === 'cloud') {
    setSyncStatus({ status: 'error', lastError: 'Sign in required to sync catch to cloud' });
    return false;
  }

  try {
    const res = await fetch('/api/catches', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(item),
    });

    if (res.ok) {
      const q = loadQueue();
      if (q.catches[item.id]) {
        delete q.catches[item.id];
        saveQueue(q);
      }
      setSyncStatus({ status: 'success', lastError: null });
      return true;
    }

    const errData = await res.json().catch(() => ({}));
    const errMsg = errData.error || `HTTP ${res.status}`;
    setSyncStatus({ status: 'error', lastError: `Catch save failed: ${errMsg}` });
    return false;
  } catch (err: any) {
    console.warn('[Keepnet Cloud] Failed to push catch to D1 - queuing for retry', err);
    const q = loadQueue();
    q.catches[item.id] = item;
    saveQueue(q);
    setSyncStatus({ status: 'error', lastError: 'Offline: catch queued for bankside sync' });
    return false;
  }
}

/** Safely flush and retry any pending offline sessions and catches */
export async function flushPendingQueue(): Promise<void> {
  const token = getAuthToken();
  if (!token) return;

  const q = loadQueue();
  const sessions = Object.values(q.sessions);
  const catches = Object.values(q.catches);

  if (sessions.length === 0 && catches.length === 0) return;

  setSyncStatus({ status: 'syncing', lastError: null });

  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ sessions, catches }),
    });

    if (res.ok) {
      saveQueue({ sessions: {}, catches: {} });
      setSyncStatus({ status: 'success', lastError: null });
      console.log(`[Keepnet Cloud] Successfully flushed pending queue (${sessions.length} sessions, ${catches.length} catches)`);
    } else {
      const errData = await res.json().catch(() => ({}));
      setSyncStatus({ status: 'error', lastError: errData.error || 'Pending sync failed' });
    }
  } catch {
    setSyncStatus({ status: 'error', lastError: 'Network error flushing sync queue' });
  }
}

// Automatically retry offline queue when network connectivity resumes
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[Keepnet Cloud] Network connection restored. Flushing sync queue...');
    flushPendingQueue();
  });
}

/** Fetch public shared sessions and shared catches from Cloudflare D1 for the Discover map. */
export async function fetchPublicSharedData(): Promise<{ sessions: Session[]; catches: Catch[] }> {
  try {
    const [sRes, cRes] = await Promise.all([
      fetch('/api/sessions?shared=1'),
      fetch('/api/catches?shared=1'),
    ]);

    const sJson = sRes.ok ? await sRes.json() : { sessions: [] };
    const cJson = cRes.ok ? await cRes.json() : { catches: [] };

    return {
      sessions: Array.isArray(sJson.sessions) ? sJson.sessions : [],
      catches: Array.isArray(cJson.catches) ? cJson.catches : [],
    };
  } catch (err) {
    console.warn('[Keepnet Cloud] Failed to fetch shared community data', err);
    return { sessions: [], catches: [] };
  }
}

/** Sync user account sessions and catches with Cloudflare D1 upon login or manual sync. */
export async function syncUserWithCloud(
  user: UserAccount,
  localSessions: Session[],
  localCatches: Catch[]
): Promise<{ sessions: Session[]; catches: Catch[] } | null> {
  if (user.storageMode === 'local') return null;

  setSyncStatus({ status: 'syncing', lastError: null });

  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        user,
        sessions: localSessions,
        catches: localCatches,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const errMsg = errData.error || `Sync failed (${res.status})`;
      setSyncStatus({ status: 'error', lastError: errMsg });
      return null;
    }

    const data = await res.json();
    setSyncStatus({ status: 'success', lastError: null });
    return {
      sessions: data.remoteSessions || [],
      catches: data.remoteCatches || [],
    };
  } catch (err: any) {
    console.warn('[Keepnet Cloud] User sync error', err);
    setSyncStatus({ status: 'error', lastError: 'Network error during cloud sync' });
    return null;
  }
}

/** Fetch user account sessions and catches directly from Cloudflare D1 without pushing local state. */
export async function fetchUserCloudData(
  user: UserAccount
): Promise<{ sessions: Session[]; catches: Catch[] } | null> {
  if (user.storageMode === 'local') return null;

  setSyncStatus({ status: 'syncing', lastError: null });

  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        user,
        mode: 'download',
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const errMsg = errData.error || `Cloud fetch failed (${res.status})`;
      setSyncStatus({ status: 'error', lastError: errMsg });
      return null;
    }

    const data = await res.json();
    setSyncStatus({ status: 'success', lastError: null });
    return {
      sessions: data.remoteSessions || [],
      catches: data.remoteCatches || [],
    };
  } catch (err: any) {
    console.warn('[Keepnet Cloud] User cloud fetch error', err);
    setSyncStatus({ status: 'error', lastError: 'Network error fetching cloud records' });
    return null;
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
  try {
    const res = await fetch('/api/likes');
    if (res.ok) {
      const data = await res.json();
      return data.likes || {};
    }
  } catch (err) {
    console.warn('[Keepnet Cloud] Failed to fetch catch likes', err);
  }
  return {};
}
