import { useSyncExternalStore } from 'react';
import type { Session, Catch } from './store';
import { authActions, getAuthToken, type UserAccount } from './auth';
import { getAccountScope, onAccountScopeChange, scopedStorageKey } from './accountScope';

export type SyncStatusState = { status: 'idle' | 'syncing' | 'error' | 'success'; lastError: string | null; pendingCount: number };
type Queue = { sessions: Record<string, Session>; catches: Record<string, Catch>; deletedCatches: Record<string, string> };
const queues = new Map<string, Queue>();
const confirmedSessions = new Map<string, Set<string>>();
export const isSessionOnCloud = (id: string) => confirmedSessions.get(getAccountScope())?.has(id) || false;
function confirmSessions(scope: string, ids: string[]) {
  const known = confirmedSessions.get(scope) || new Set<string>();
  ids.forEach(id => known.add(id));
  confirmedSessions.set(scope, known);
}
const queueKey = 'keepnet:v3:pending';
const emptyQueue = (): Queue => ({ sessions: {}, catches: {}, deletedCatches: {} });
export function getPendingJournal(scope = getAccountScope()): Queue {
  if (!queues.has(scope)) {
    try {
      const raw = localStorage.getItem(scopedStorageKey(queueKey, scope));
      const old = raw ? JSON.parse(raw) : JSON.parse(localStorage.getItem('keepnet:pending_cloud_queue') || 'null');
      const queue = emptyQueue();
      for (const kind of ['sessions', 'catches'] as const) {
        for (const [id, item] of Object.entries(old?.[kind] || {})) {
          const record = item as Session & Catch;
          if (raw || (record.userId || 'guest') === scope) (queue[kind] as Record<string, Session | Catch>)[id] = record;
        }
      }
      queue.deletedCatches = old?.deletedCatches || {};
      if (!raw && scope !== 'guest') {
        const journal = JSON.parse(localStorage.getItem('keepnet:v2:live') || '{}');
        const current = JSON.parse(localStorage.getItem('keepnet:current_user') || '{}');
        const cloudMode = current.user?.id === scope && (current.user.storageMode || current.storageMode) === 'cloud';
        for (const session of journal.sessions || []) if (session.userId === scope && (cloudMode || session.isShared)) {
          queue.sessions[session.id] ||= { ...session, isShared: false, sharingConfirmed: false };
        }
        for (const catchItem of journal.catches || []) if (catchItem.userId === scope && (cloudMode || catchItem.isShared)) {
          queue.catches[catchItem.id] ||= { ...catchItem, isShared: false, sharingConfirmed: false };
          const parent = (journal.sessions || []).find((session: Session) => session.id === catchItem.sessionId && session.userId === scope);
          if (parent && !queue.sessions[parent.id]) queue.sessions[parent.id] = { ...parent, notes: undefined, photo: undefined, photos: [], isShared: false, sharingConfirmed: false };
        }
      }
      queues.set(scope, queue);
    } catch { queues.set(scope, emptyQueue()); }
  }
  return queues.get(scope)!;
}
const listeners = new Set<() => void>();
let status: SyncStatusState = { status: 'idle', lastError: null, pendingCount: 0 };
function notify(patch: Partial<SyncStatusState> = {}) {
  const q = getPendingJournal();
  status = { ...status, ...patch, pendingCount: Object.keys(q.sessions).length + Object.keys(q.catches).length + Object.keys(q.deletedCatches).length };
  listeners.forEach(listener => listener());
}
function save(scope: string) {
  try { localStorage.setItem(scopedStorageKey(queueKey, scope), JSON.stringify(getPendingJournal(scope))); }
  catch { if (scope === getAccountScope()) notify({ status: 'error', lastError: 'Offline work could not be saved to device storage. Keep this tab open and sync when online.' }); }
  if (scope === getAccountScope()) notify();
}
export function clearPendingJournal() { queues.set(getAccountScope(), emptyQueue()); save(getAccountScope()); }
onAccountScopeChange(() => notify({ status: 'idle', lastError: null }));
export const useCloudSyncStatus = () => useSyncExternalStore(callback => { listeners.add(callback); return () => listeners.delete(callback); }, () => status, () => status);
const headers = (token = getAuthToken()) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });
const unchanged = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const currentIdentity = (scope: string, token: string) => scope === getAccountScope() && token === getAuthToken();

async function enqueueRecord(kind: 'sessions' | 'catches', item: Session | Catch, user?: UserAccount | null): Promise<boolean> {
  const scope = getAccountScope();
  if (!user || scope !== user.id || (item.userId && item.userId !== user.id)) return false;
  const queue = getPendingJournal(scope);
  if (kind === 'catches' && queue.deletedCatches[item.id]) return false;
  (queue[kind] as Record<string, Session | Catch>)[item.id] = { ...item, userId: user.id };
  save(scope);
  return flushPendingQueue();
}
export const pushSessionToCloud = (session: Session, user?: UserAccount | null) => enqueueRecord('sessions', session, user);
export const pushCatchToCloud = (catchItem: Catch, user?: UserAccount | null) => enqueueRecord('catches', catchItem, user);
export async function deleteCatchOnCloud(id: string): Promise<boolean> {
  if (!authActions.getCurrentUser()) return false;
  const scope = getAccountScope();
  const queue = getPendingJournal(scope);
  delete queue.catches[id];
  queue.deletedCatches[id] = new Date().toISOString();
  save(scope);
  return flushPendingQueue();
}
const activeFlush = new Map<string, Promise<boolean>>();
export async function flushPendingQueue(): Promise<boolean> {
  const scope = getAccountScope(), token = getAuthToken();
  if (scope === 'guest' || !token) return false;
  const existing = activeFlush.get(scope);
  if (existing) return existing;
  const promise = (async () => {
    notify({ status: 'syncing', lastError: null });
    try {
      while (currentIdentity(scope, token)) {
        const queue = getPendingJournal(scope);
        const deletion = Object.entries(queue.deletedCatches)[0];
        if (deletion) {
          const [id, version] = deletion;
          const response = await fetch(`/api/catches?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers(token) });
          if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Unable to delete cloud catch.');
          if (!currentIdentity(scope, token)) return false;
          if (queue.deletedCatches[id] === version) delete queue.deletedCatches[id];
          save(scope);
          continue;
        }
        const sessions = Object.values(queue.sessions).slice(0, 50);
        const selectedParents = new Set(sessions.map(item => item.id));
        const catches = Object.values(queue.catches).filter(item => !queue.sessions[item.sessionId] || selectedParents.has(item.sessionId)).slice(0, 100);
        if (!sessions.length && !catches.length) { notify({ status: 'success', lastError: null }); return true; }
        const response = await fetch('/api/sync', { method: 'POST', headers: headers(token), body: JSON.stringify({ sessions, catches }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Cloud sync failed (${response.status}).`);
        if (!currentIdentity(scope, token)) return false;
        const sessionIds: string[] = data.savedSessionIds || [];
        confirmSessions(scope, sessionIds);
        const catchIds: string[] = data.savedCatchIds || [];
        const deleted: string[] = data.deletedCatchIds || [];
        if (!sessionIds.length && !catchIds.length && !deleted.length) throw new Error('Cloud did not acknowledge the saved records. Offline work has been retained.');
        for (const item of sessions) if (sessionIds.includes(item.id) && unchanged(queue.sessions[item.id], item)) delete queue.sessions[item.id];
        for (const item of catches) if (catchIds.includes(item.id) && unchanged(queue.catches[item.id], item)) delete queue.catches[item.id];
        for (const id of deleted) delete queue.catches[id];
        save(scope);
      }
      return false;
    } catch (error) {
      if (currentIdentity(scope, token)) notify({ status: 'error', lastError: error instanceof Error ? error.message : 'Sync failed. Offline work has been retained.' });
      return false;
    }
  })();
  activeFlush.set(scope, promise);
  try { return await promise; } finally { activeFlush.delete(scope); }
}
if (typeof window !== 'undefined') window.addEventListener('online', () => { void flushPendingQueue(); });

export async function fetchPublicSharedData(): Promise<{ sessions: Session[]; catches: Catch[] }> {
  const [sessions, catches] = await Promise.all([fetch('/api/sessions?shared=1'), fetch('/api/catches?shared=1')]);
  if (!sessions.ok || !catches.ok) throw new Error('Community records could not be loaded.');
  const [s, c] = await Promise.all([sessions.json(), catches.json()]);
  return { sessions: s.sessions || [], catches: c.catches || [] };
}
export async function fetchUserCloudData(user: UserAccount): Promise<{ sessions: Session[]; catches: Catch[]; deletedCatchIds?: string[]; subscription?: { tier: 'lite' | 'premium'; appliedCoupon?: string | null; expiresAt?: string | null } } | null> {
  if (getAccountScope() !== user.id || !getAuthToken()) return null;
  const scope = user.id, token = getAuthToken();
  await flushPendingQueue();
  if (!currentIdentity(scope, token)) return null;
  try {
    const response = await fetch('/api/sync', { method: 'POST', headers: headers(token), body: JSON.stringify({ mode: 'download' }) });
    const data = await response.json();
    if (!currentIdentity(scope, token)) return null;
    if (!response.ok) throw new Error(data.error || 'Cloud records could not be loaded.');
    confirmSessions(scope, (data.remoteSessions || []).map((item: Session) => item.id));
    // Local-mode accounts refresh membership only; private journal data stays on this device.
    return { sessions: user.storageMode === 'local' ? [] : data.remoteSessions || [], catches: user.storageMode === 'local' ? [] : data.remoteCatches || [], subscription: data.remoteSubscription, deletedCatchIds: data.deletedCatchIds || [] };
  } catch (error) {
    if (currentIdentity(scope, token)) notify({ status: 'error', lastError: error instanceof Error ? error.message : 'Cloud records could not be loaded.' });
    return null;
  }
}
export async function syncUserWithCloud(user: UserAccount, sessions: Session[], catches: Catch[]) {
  if (getAccountScope() !== user.id || user.storageMode === 'local') return null;
  const queue = getPendingJournal(user.id);
  for (const session of sessions) if (session.userId === user.id) queue.sessions[session.id] = session;
  for (const catchItem of catches) if (catchItem.userId === user.id && !queue.deletedCatches[catchItem.id]) queue.catches[catchItem.id] = catchItem;
  save(user.id);
  await flushPendingQueue();
  return fetchUserCloudData(user);
}
