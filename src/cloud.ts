import type { Session, Catch } from './store';
import type { UserAccount } from './auth';

/** Push a session to Cloudflare D1 if it is public or user is cloud-synced. */
export async function pushSessionToCloud(session: Session, user?: UserAccount | null): Promise<boolean> {
  try {
    const payload = {
      ...session,
      userId: user?.id || session.userId || null,
      userName: user?.nickname || user?.name || session.userName || 'Angler',
    };
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.warn('[Keepnet Cloud] Failed to push session to D1', err);
    return false;
  }
}

/** Push a catch to Cloudflare D1 if it is public or user is cloud-synced. */
export async function pushCatchToCloud(item: Catch, user?: UserAccount | null): Promise<boolean> {
  try {
    const payload = {
      ...item,
      userId: user?.id || item.userId || null,
      userName: user?.nickname || user?.name || item.userName || 'Angler',
    };
    const res = await fetch('/api/catches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.warn('[Keepnet Cloud] Failed to push catch to D1', err);
    return false;
  }
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

  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user,
        sessions: localSessions,
        catches: localCatches,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return {
      sessions: data.remoteSessions || [],
      catches: data.remoteCatches || [],
    };
  } catch (err) {
    console.warn('[Keepnet Cloud] User sync error', err);
    return null;
  }
}
