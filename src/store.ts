import { useSyncExternalStore } from 'react';
import type { Weather } from './weather';
import { getAccountScope, onAccountScopeChange, scopedStorageKey } from './accountScope';

export type Venue = {
  id: string;
  name: string;
  type: string;
  lat: number;
  lon: number;
  targets: string[];
  description: string;
  country?: string;
  region?: string;
  nearestTown?: string | null;
  address?: string | null;
  postcode?: string | null;
  website?: string | null;
  accessType?: string;
  fisheryType?: string;
  accessNotes?: string;
  verificationNotes?: string;
  needsPinReview?: boolean;
  hasCoordinates?: boolean;
  coordinatePrecision?: string;
  sourceUrl?: string | null;
  sourceUrls?: string[];
};

export type Session = {
  sharingConfirmed?: boolean;
  updatedAt?: string;
  id: string;
  venueId: string;
  venueName: string;
  lat: number;
  lon: number;
  startedAt: string;
  endedAt?: string;
  weather?: Weather;
  weatherError?: string;
  notes?: string;
  /** Cover photo for the session (any photo from the session). */
  photo?: string;
  /** Location photos taken during the session. */
  photos?: string[];
  /** Whether this session is shared to the public Discover map. */
  isShared?: boolean;
  /** Syndicate / secret water privacy mode (Keepnet Premium) */
  isConfidential?: boolean;
  userId?: string;
  userName?: string;
};

export type Catch = {
  sharingConfirmed?: boolean;
  updatedAt?: string;
  id: string;
  sessionId: string;
  species: string;
  weightLb: number;
  weightOz: number;
  bait: string;
  caughtAt: string;
  image?: string;
  images?: string[];
  method?: string;
  notes?: string;
  /** Whether this catch is shared to the public Discover map. */
  isShared?: boolean;
  /** Syndicate / secret water privacy mode (Keepnet Premium) */
  isConfidential?: boolean;
  userId?: string;
  userName?: string;
  /** Number of likes/reactions received */
  likesCount?: number;
};

export type UnitSystem = 'imperial' | 'metric';
export type SubscriptionTier = 'lite' | 'premium';

type State = {
  deletedCatchIds?: string[];
  savedCatchIds?: string[];
  sessions: Session[];
  catches: Catch[];
  name: string;
  unitSystem?: UnitSystem;
  storageError?: string | null;
  equippedAchievementId?: string | null;
  /** List of catch IDs the current user has liked */
  likedCatchIds?: string[];
  /** Map of catch ID to live like count */
  catchLikes?: Record<string, number>;
  /** Total number of likes given by this angler */
  likesGivenCount?: number;
  /** Active subscription tier */
  subscriptionTier?: SubscriptionTier;
  /** Active coupon code applied */
  appliedCoupon?: string | null;
  /** Timestamp when current subscription or trial expires */
  subscriptionExpiresAt?: string | null;
  membershipVerified?: boolean;
};

import { MAP_FISHERIES } from './fisheries';

export const VENUES: Venue[] = MAP_FISHERIES;

export const SPECIES = ['Perch', 'Chub', 'Roach', 'Pike', 'Bream', 'Dace', 'Grayling', 'Rainbow trout', 'Brown trout', 'Carp', 'Tench', 'Rudd'];

const KEY = 'keepnet:v3:journal';
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** Production launch initial state: clean, empty journal. */
const seed = (): State => ({
  name: 'Angler',
  sessions: [],
  catches: [],
  unitSystem: 'imperial',
  equippedAchievementId: null,
  likedCatchIds: [],
  catchLikes: {},
  likesGivenCount: 0,
  subscriptionTier: 'lite',
  appliedCoupon: null,
  subscriptionExpiresAt: null,
  membershipVerified: false,
});

const load = (): State => {
  let preserved: State | undefined;
  try {
    const raw = localStorage.getItem(scopedStorageKey(KEY));
    if (raw) return JSON.parse(raw);
    const legacy = localStorage.getItem('keepnet:v2:live');
    if (legacy) {
      const old: State = JSON.parse(legacy);
      const currentProfile = JSON.parse(localStorage.getItem('keepnet:current_user') || '{}').user;
      const guestOnly = [...old.sessions, ...old.catches].every(item => !item.userId);
      const profileName = currentProfile?.id === getAccountScope() ? currentProfile.nickname || currentProfile.name : getAccountScope() === 'guest' && guestOnly ? old.name : 'Angler';
      preserved = { ...seed(), name: profileName || 'Angler', unitSystem: old.unitSystem,
        sessions: old.sessions.filter(item => (item.userId || 'guest') === getAccountScope()).map(item => ({ ...item, isShared: false, sharingConfirmed: false })),
        catches: old.catches.filter(item => (item.userId || 'guest') === getAccountScope()).map(item => ({ ...item, isShared: false, sharingConfirmed: false })),
      };
      const owners = new Set([...old.sessions, ...old.catches].map(item => item.userId || 'guest'));
      owners.add(getAccountScope());
      for (const owner of owners) {
        const key = scopedStorageKey(KEY, owner);
        if (!localStorage.getItem(key)) {
          const ownedSessions = old.sessions.filter(item => (item.userId || 'guest') === owner);
          const ownedCatches = old.catches.filter(item => (item.userId || 'guest') === owner);
          localStorage.setItem(key, JSON.stringify({
          ...seed(), ...(owner === getAccountScope() ? { name: profileName || 'Angler', unitSystem: old.unitSystem } : {}),
          sessions: ownedSessions.map(item => ({ ...item, isShared: false, sharingConfirmed: false })),
          catches: ownedCatches.map(item => ({ ...item, isShared: false, sharingConfirmed: false })),
        }));
          // Re-upload known fields lost by the legacy cloud schema before downloading it.
          if (owner !== 'guest') {
            const current = JSON.parse(localStorage.getItem('keepnet:current_user') || '{}');
            const cloudMode = current.user?.id === owner && (current.user.storageMode || current.storageMode) === 'cloud';
            const queueKey = scopedStorageKey('keepnet:v3:pending', owner);
            const previous = JSON.parse(localStorage.getItem(queueKey) || localStorage.getItem('keepnet:pending_cloud_queue') || '{}');
            const queue: { sessions: Record<string, Session>; catches: Record<string, Catch>; deletedCatches: Record<string, string> } = { sessions: {}, catches: {}, deletedCatches: previous.deletedCatches || {} };
            for (const kind of ['sessions', 'catches'] as const) for (const [recordId, record] of Object.entries(previous[kind] || {})) {
              if ((record as Session).userId === owner) (queue[kind] as Record<string, Session | Catch>)[recordId] = record as Session | Catch;
            }
            for (const session of ownedSessions) if (cloudMode || session.isShared) queue.sessions[session.id] = { ...session, isShared: false, sharingConfirmed: false };
            for (const catchItem of ownedCatches) if (cloudMode || catchItem.isShared) {
              queue.catches[catchItem.id] = { ...catchItem, isShared: false, sharingConfirmed: false };
              const parent = ownedSessions.find(session => session.id === catchItem.sessionId);
              if (parent && !queue.sessions[parent.id]) queue.sessions[parent.id] = { ...parent, notes: undefined, photo: undefined, photos: [], isShared: false };
            }
            localStorage.setItem(queueKey, JSON.stringify(queue));
          }
        }
      }
      return JSON.parse(localStorage.getItem(scopedStorageKey(KEY)) || 'null') || seed();
    }
  } catch {
    if (preserved) return { ...preserved, storageError: 'Your journal is preserved in memory, but device storage could not finish the account migration. Sync or free device storage before closing this tab.' };
  }
  return seed();
};

let state: State = load();
let socialRevision = 0;
const listeners = new Set<() => void>();

const commit = (next: State) => {
  state = { ...next, storageError: null };
  try {
    localStorage.setItem(scopedStorageKey(KEY), JSON.stringify(state));
  } catch (err: any) {
    const isQuota = err?.name === 'QuotaExceededError' || err?.code === 22 || err?.code === 1014;
    state = {
      ...state,
      storageError: isQuota
        ? 'Device storage limit reached. New catches remain in memory. Please sync to Keepnet cloud or clear old images.'
        : 'Failed to write journal data to device storage.',
    };
    console.warn('[Keepnet Storage] LocalStorage write error:', err);
  }
  listeners.forEach((l) => l());
};

export const useStore = () =>
  useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
onAccountScopeChange(() => { state = load(); listeners.forEach(listener => listener()); });

import {
  pushSessionToCloud, pushCatchToCloud, syncCatchLikeToCloud,
  redeemCouponOnCloud, cancelSubscriptionOnCloud, deleteCatchOnCloud, getPendingJournal, clearPendingJournal, isSessionOnCloud
} from './cloud';
import { authActions } from './auth';

async function syncCatchWithParent(item: Catch, user: ReturnType<typeof authActions.getCurrentUser>) {
  if (!user) return;
  const parent = state.sessions.find(session => session.id === item.sessionId);
  if (parent && (!isSessionOnCloud(parent.id) || getPendingJournal().sessions[parent.id])) {
    const session = user.storageMode === 'local' ? { ...parent, photo: undefined, photos: [], notes: undefined, isShared: !!parent.isShared && !parent.isConfidential } : parent;
    void pushSessionToCloud(session, user);
  }
  await pushCatchToCloud(item, user);
}

export const actions = {
  getSnapshot(): State { return state; },
  getSocialRevision(): number { return socialRevision; },
  startSession(v: { venueId: string; venueName: string; lat: number; lon: number; photo?: string; isShared?: boolean }): Session {
    const user = authActions.getCurrentUser();
    const s: Session = {
      id: uid(),
      isShared: v.isShared ?? false,
      sharingConfirmed: !!v.isShared,
      userId: user?.id,
      userName: user?.name || state.name || 'Angler',
      ...v,
      photos: v.photo ? [v.photo] : [],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    commit({ ...state, sessions: [s, ...state.sessions] });
    if (s.isShared || user?.storageMode === 'cloud') {
      pushSessionToCloud(s, user);
    }
    return s;
  },
  updateSession(id: string, patch: Partial<Session>) {
    const wasShared = !!state.sessions.find(s => s.id === id)?.isShared;
    let updated: Session | undefined;
    commit({
      ...state,
      sessions: state.sessions.map((s) => {
        if (s.id === id) {
          updated = { ...s, ...patch, sharingConfirmed: patch.isShared === undefined ? s.sharingConfirmed : !!patch.isShared, updatedAt: new Date().toISOString(), isShared: (patch.isConfidential ?? s.isConfidential) ? false : patch.isShared ?? s.isShared };
          return updated;
        }
        return s;
      }),
    });
    if (updated) {
      const user = authActions.getCurrentUser();
      if (wasShared || updated.isShared || user?.storageMode === 'cloud') {
        pushSessionToCloud(updated, user);
      }
    }
  },
  /** Add a location photo to the session gallery and make it the cover. */
  addSessionPhoto(id: string, photo: string) {
    let updated: Session | undefined;
    commit({
      ...state,
      sessions: state.sessions.map((s) => {
        if (s.id === id) {
          updated = { ...s, photo, photos: [...(s.photos ?? []), photo], updatedAt: new Date().toISOString() };
          return updated;
        }
        return s;
      }),
    });
    if (updated) {
      const user = authActions.getCurrentUser();
      if (updated.isShared || user?.storageMode === 'cloud') {
        pushSessionToCloud(updated, user);
      }
    }
  },
  addCatch(c: Omit<Catch, 'id'>): Catch {
    const user = authActions.getCurrentUser();
    const n = {
      ...c,
      id: uid(),
      userId: user?.id,
      userName: user?.name || state.name || 'Angler',
      isShared: c.isConfidential ? false : !!c.isShared,
      sharingConfirmed: !!c.isShared && !c.isConfidential,
      updatedAt: new Date().toISOString(),
    };
    commit({ ...state, catches: [n, ...state.catches] });
    if (n.isShared || user?.storageMode === 'cloud') {
      void syncCatchWithParent(n, user);
    }
    return n;
  },
  updateCatch(id: string, patch: Partial<Catch>) {
    const wasShared = !!state.catches.find(c => c.id === id)?.isShared;
    let updated: Catch | undefined;
    commit({
      ...state,
      catches: state.catches.map((c) => {
        if (c.id === id) {
          updated = { ...c, ...patch, sharingConfirmed: patch.isShared === undefined ? c.sharingConfirmed : !!patch.isShared, updatedAt: new Date().toISOString(), isShared: (patch.isConfidential ?? c.isConfidential) ? false : patch.isShared ?? c.isShared };
          return updated;
        }
        return c;
      }),
    });
    if (updated) {
      const user = authActions.getCurrentUser();
      if (wasShared || updated.isShared || user?.storageMode === 'cloud') {
        void syncCatchWithParent(updated, user);
      }
    }
  },
  deleteCatch(id: string) {
    const existing = state.catches.find(c => c.id === id);
    commit({ ...state, catches: state.catches.filter((c) => c.id !== id), deletedCatchIds: [...new Set([...(state.deletedCatchIds || []), id])] });
    if (existing && authActions.getCurrentUser()) void deleteCatchOnCloud(id);
  },
  toggleSessionShare(id: string): boolean {
    let nextShared = false;
    let target: Session | undefined;
    commit({
      ...state,
      sessions: state.sessions.map((s) => {
        if (s.id === id) {
          nextShared = !s.isShared && !s.isConfidential;
          target = { ...s, isShared: nextShared, sharingConfirmed: nextShared, updatedAt: new Date().toISOString() };
          return target;
        }
        return s;
      }),
    });
    if (target) {
      const user = authActions.getCurrentUser();
      pushSessionToCloud(target, user);
    }
    return nextShared;
  },
  toggleCatchShare(id: string): boolean {
    let nextShared = false;
    let target: Catch | undefined;
    commit({
      ...state,
      catches: state.catches.map((c) => {
        if (c.id === id) {
          nextShared = !c.isShared && !c.isConfidential;
          target = { ...c, isShared: nextShared, sharingConfirmed: nextShared, updatedAt: new Date().toISOString() };
          return target;
        }
        return c;
      }),
    });
    if (target) {
      const user = authActions.getCurrentUser();
      void syncCatchWithParent(target, user);
    }
    return nextShared;
  },
  /**
   * Non-destructive smart merge of remote cloud records with local entries.
   * Ensures unsynced bankside catches and offline session photos are never overwritten.
   */
  replaceWithRemoteData(
    remoteSessions: Session[], remoteCatches: Catch[],
    remoteSubscription?: { tier?: SubscriptionTier; appliedCoupon?: string | null; expiresAt?: string | null },
    deletedCatchIds: string[] = []
  ) {
    const scope = getAccountScope();
    const pending = getPendingJournal();
    const deleted = new Set([...(state.deletedCatchIds || []), ...deletedCatchIds, ...Object.keys(pending.deletedCatches)]);
    const belongs = (item: Session | Catch) => !item.userId || item.userId === scope;
    const reconcile = <T extends Session | Catch>(local: T[], remote: T[], dirty: Record<string, T>) => {
      const merged = new Map(local.filter(belongs).map(item => [item.id, item]));
      for (const server of remote.filter(belongs)) {
        const saved = merged.get(server.id);
        if (saved && (dirty[server.id] || (saved.updatedAt && server.updatedAt && new Date(saved.updatedAt).getTime() > new Date(server.updatedAt).getTime()))) continue;
        merged.set(server.id, saved ? { ...saved, ...server } : server);
      }
      return [...merged.values()];
    };
    commit({
      ...state,
      sessions: reconcile(state.sessions, remoteSessions, pending.sessions).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)),
      catches: reconcile(state.catches, remoteCatches, pending.catches).filter(item => !deleted.has(item.id)).sort((a, b) => Date.parse(b.caughtAt) - Date.parse(a.caughtAt)),
      deletedCatchIds: [...deleted],
      ...(remoteSubscription?.tier ? { membershipVerified: true, subscriptionTier: remoteSubscription.tier, appliedCoupon: remoteSubscription.appliedCoupon || null, subscriptionExpiresAt: remoteSubscription.expiresAt || null } : {}),
    });
  },
  mergeRemoteData(remoteSessions: Session[], remoteCatches: Catch[]) {
    this.replaceWithRemoteData(remoteSessions, remoteCatches);
  },
  clearStorageError() {
    if (state.storageError) {
      commit({ ...state, storageError: null });
    }
  },
  setName(name: string) {
    commit({ ...state, name });

  },
  setUnitSystem(unitSystem: UnitSystem) {
    commit({ ...state, unitSystem });
  },
  setEquippedAchievement(id: string | null) {
    commit({ ...state, equippedAchievementId: id });
  },
  isCatchSaved(id: string): boolean { return (state.savedCatchIds || []).includes(id); },
  toggleCatchSave(id: string) {
    const saved = state.savedCatchIds || [];
    commit({ ...state, savedCatchIds: saved.includes(id) ? saved.filter(item => item !== id) : [...saved, id] });
  },
  toggleCatchLike(catchId: string): boolean {
    if (!authActions.getCurrentUser()) return false;
    ++socialRevision;
    const scope = getAccountScope();
    const currentLiked = state.likedCatchIds || [];
    const isLiked = currentLiked.includes(catchId);
    const nextLiked = isLiked
      ? currentLiked.filter((id) => id !== catchId)
      : [...currentLiked, catchId];

    const currentLikes = { ...(state.catchLikes || {}) };
    const currentCount = this.getCatchLikesCount(catchId);
    const nextCount = isLiked ? Math.max(0, currentCount - 1) : currentCount + 1;
    currentLikes[catchId] = nextCount;

    const nextCatches = state.catches.map((c) =>
      c.id === catchId ? { ...c, likesCount: nextCount } : c
    );

    const nextLikesGiven = isLiked
      ? Math.max(0, (state.likesGivenCount || 0) - 1)
      : (state.likesGivenCount || 0) + 1;

    commit({
      ...state,
      likedCatchIds: nextLiked,
      catchLikes: currentLikes,
      catches: nextCatches,
      likesGivenCount: nextLikesGiven,
    });

    syncCatchLikeToCloud(catchId, !isLiked).then(count => {
      if (scope !== getAccountScope() || this.isCatchLiked(catchId) !== !isLiked) return;
      if (count !== null) this.setCatchLikes(catchId, count);
      else commit({ ...state, likedCatchIds: isLiked ? [...new Set([...(state.likedCatchIds || []), catchId])] : (state.likedCatchIds || []).filter(id => id !== catchId), catchLikes: { ...state.catchLikes, [catchId]: currentCount }, catches: state.catches.map(item => item.id === catchId ? { ...item, likesCount: currentCount } : item), likesGivenCount: Math.max(0, (state.likesGivenCount || 0) + (isLiked ? 1 : -1)) });
    });
    return !isLiked;
  },
  isCatchLiked(catchId: string): boolean {
    return (state.likedCatchIds || []).includes(catchId);
  },
  getCatchLikesCount(catchId: string, fallbackCount?: number): number {
    if (state.catchLikes && typeof state.catchLikes[catchId] === 'number') {
      return state.catchLikes[catchId];
    }
    const c = state.catches.find((x) => x.id === catchId);
    if (c && typeof c.likesCount === 'number') {
      return c.likesCount;
    }
    return fallbackCount || 0;
  },
  setCatchLikes(catchId: string, count: number) {
    const currentLikes = { ...(state.catchLikes || {}) };
    currentLikes[catchId] = count;
    commit({ ...state, catchLikes: currentLikes });
  },
  setAllCatchLikes(likes: Record<string, number>) {
    commit({
      ...state,
      catchLikes: { ...(state.catchLikes || {}), ...likes },
    });
  },
  setLikedCatchIds(ids: string[]) {
    ++socialRevision;
    commit({ ...state, likedCatchIds: [...new Set(ids)] });
  },
  getTotalLikesReceived(): number {
    return state.catches.reduce((acc, c) => acc + (this.getCatchLikesCount(c.id, c.likesCount) || 0), 0);
  },
  async applyCoupon(code: string): Promise<{ success: boolean; message: string }> {
    const clean = code.trim().toUpperCase();
    if (!clean) return { success: false, message: 'Please enter a coupon code.' };
    if (!authActions.getCurrentUser()) return { success: false, message: 'Sign in before redeeming a trial.' };
    const scope = getAccountScope();
    const result = await redeemCouponOnCloud(clean);
    if (scope !== getAccountScope()) return { success: false, message: 'Account changed. Please try again.' };
    if (result.success && result.tier) this.setSubscription(result.tier, result.appliedCoupon, result.expiresAt);
    return result;
  },
  async cancelCouponTrial(): Promise<boolean> {
    const scope = getAccountScope();
    if (!state.appliedCoupon || !authActions.getCurrentUser()) return false;
    if (!await cancelSubscriptionOnCloud() || scope !== getAccountScope()) return false;
    this.setSubscription('lite');
    return true;
  },
  setSubscription(tier: SubscriptionTier, appliedCoupon: string | null = null, expiresAt: string | null = null) {
    commit({
      ...state,
      subscriptionTier: tier,
      appliedCoupon,
      subscriptionExpiresAt: expiresAt,
      membershipVerified: true,
    });
  },
  isPremium(): boolean {
    const user = authActions.getCurrentUser();
    // Platform owner / administrator always has full specimen suite access unlocked
    if (!user) return false;
    if (user.isAdmin) {
      return true;
    }
    if (state.subscriptionTier !== 'premium') return false;
    if (!state.subscriptionExpiresAt) return true; // VIP / Lifetime has no expiry
    return new Date(state.subscriptionExpiresAt).getTime() > Date.now();
  },
  clearAll() {
    try {
      localStorage.removeItem('keepnet:v1');
      localStorage.removeItem(scopedStorageKey(KEY));
    } catch { /* ignore */ }
    clearPendingJournal();
    commit(seed());
  },
  reset() {
    this.clearAll();
  },
};

export const metricToImperial = (kg: number, g: number): { weightLb: number; weightOz: number } => {
  const totalG = (Math.max(0, kg) || 0) * 1000 + (Math.max(0, g) || 0);
  const totalOunces = Math.round(totalG / 28.349523125 * 100) / 100;
  const lb = Math.floor(totalOunces / 16);
  const oz = +(totalOunces - lb * 16).toFixed(2);
  return { weightLb: lb, weightOz: oz };
};

export const imperialToMetric = (weightLb: number, weightOz: number): { kg: number; g: number; totalG: number } => {
  const totalOzVal = (Math.max(0, weightLb) || 0) * 16 + (Math.max(0, weightOz) || 0);
  const totalG = Math.round(totalOzVal * 28.349523125);
  const kg = Math.floor(totalG / 1000);
  const g = totalG % 1000;
  return { kg, g, totalG };
};

export const fmtWeight = (
  c: Pick<Catch, 'weightLb' | 'weightOz'>,
  unit?: UnitSystem
): string => {
  const activeUnit = unit ?? state.unitSystem ?? 'imperial';
  if (activeUnit === 'metric') {
    const { kg, g, totalG } = imperialToMetric(c.weightLb, c.weightOz);
    if (!totalG) return '0 kg';
    if (totalG < 1000) return `${totalG} g`;
    if (g === 0) return `${kg} kg`;
    const decimalKg = +(totalG / 1000).toFixed(2);
    return `${decimalKg} kg`;
  }
  const ounces = Math.round((c.weightLb || 0) * 16 + (c.weightOz || 0));
  const lb = Math.floor(ounces / 16);
  const oz = ounces % 16;
  if (!lb && !oz) return '0 lb 0 oz';
  if (!lb) return `${oz} oz`;
  if (!oz) return `${lb} lb`;
  return `${lb} lb ${oz} oz`;
};

export const totalOz = (c: Pick<Catch, 'weightLb' | 'weightOz'>) => c.weightLb * 16 + c.weightOz;

export const fmtDay = (iso: string) => {
  const d = new Date(iso);
  const diff = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Downscale an uploaded photo to a compact JPEG data URL so it persists locally. */
export const resizeImage = (file: File, max = 640): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
