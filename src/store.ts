import { useSyncExternalStore } from 'react';
import type { Weather } from './weather';

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
};

import { MAP_FISHERIES } from './fisheries';

export const VENUES: Venue[] = MAP_FISHERIES;

export const SPECIES = ['Perch', 'Chub', 'Roach', 'Pike', 'Bream', 'Dace', 'Grayling', 'Rainbow trout', 'Brown trout', 'Carp', 'Tench', 'Rudd'];

const KEY = 'keepnet:v2:live';
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
});

const load = (): State => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore corrupt storage */ }
  return seed();
};

let state: State = load();
const listeners = new Set<() => void>();

const commit = (next: State) => {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    if (state.storageError) {
      state = { ...state, storageError: null };
    }
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

import {
  pushSessionToCloud, pushCatchToCloud, syncCatchLikeToCloud,
  redeemCouponOnCloud, cancelSubscriptionOnCloud
} from './cloud';
import { authActions } from './auth';

export const actions = {
  startSession(v: { venueId: string; venueName: string; lat: number; lon: number; photo?: string; isShared?: boolean }): Session {
    const user = authActions.getCurrentUser();
    const s: Session = {
      id: uid(),
      isShared: v.isShared ?? false,
      userId: user?.id,
      userName: user?.name || state.name || 'Angler',
      ...v,
      photos: v.photo ? [v.photo] : [],
      startedAt: new Date().toISOString(),
    };
    commit({ ...state, sessions: [s, ...state.sessions] });
    if (s.isShared || user?.storageMode === 'cloud') {
      pushSessionToCloud(s, user);
    }
    return s;
  },
  updateSession(id: string, patch: Partial<Session>) {
    let updated: Session | undefined;
    commit({
      ...state,
      sessions: state.sessions.map((s) => {
        if (s.id === id) {
          updated = { ...s, ...patch };
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
  /** Add a location photo to the session gallery and make it the cover. */
  addSessionPhoto(id: string, photo: string) {
    let updated: Session | undefined;
    commit({
      ...state,
      sessions: state.sessions.map((s) => {
        if (s.id === id) {
          updated = { ...s, photo, photos: [...(s.photos ?? []), photo] };
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
    };
    commit({ ...state, catches: [n, ...state.catches] });
    if (n.isShared || user?.storageMode === 'cloud') {
      pushCatchToCloud(n, user);
    }
    return n;
  },
  updateCatch(id: string, patch: Partial<Catch>) {
    let updated: Catch | undefined;
    commit({
      ...state,
      catches: state.catches.map((c) => {
        if (c.id === id) {
          updated = { ...c, ...patch };
          return updated;
        }
        return c;
      }),
    });
    if (updated) {
      const user = authActions.getCurrentUser();
      if (updated.isShared || user?.storageMode === 'cloud') {
        pushCatchToCloud(updated, user);
      }
    }
  },
  deleteCatch(id: string) {
    commit({ ...state, catches: state.catches.filter((c) => c.id !== id) });
  },
  toggleSessionShare(id: string): boolean {
    let nextShared = false;
    let target: Session | undefined;
    commit({
      ...state,
      sessions: state.sessions.map((s) => {
        if (s.id === id) {
          nextShared = !s.isShared;
          target = { ...s, isShared: nextShared };
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
          nextShared = !c.isShared;
          target = { ...c, isShared: nextShared };
          return target;
        }
        return c;
      }),
    });
    if (target) {
      const user = authActions.getCurrentUser();
      pushCatchToCloud(target, user);
    }
    return nextShared;
  },
  /**
   * Non-destructive smart merge of remote cloud records with local entries.
   * Ensures unsynced bankside catches and offline session photos are never overwritten.
   */
  replaceWithRemoteData(
    remoteSessions: Session[],
    remoteCatches: Catch[],
    remoteSubscription?: { tier?: SubscriptionTier; appliedCoupon?: string | null; expiresAt?: string | null }
  ) {
    // 1. Preserve local sessions that do not exist remotely yet
    const remoteSessionIds = new Set(remoteSessions.map((s) => s.id));
    const localOnlySessions = state.sessions.filter((s) => !remoteSessionIds.has(s.id));

    // 2. For matching sessions, preserve local photos or notes that remote lacks
    const localSessionMap = new Map(state.sessions.map((s) => [s.id, s]));
    const mergedRemoteSessions = remoteSessions.map((remote) => {
      const local = localSessionMap.get(remote.id);
      if (!local) return remote;
      // Preserve any local photos added offline
      const combinedPhotos = Array.from(new Set([...(local.photos || []), ...(remote.photos || [])]));
      return {
        ...remote,
        photo: remote.photo || local.photo,
        photos: combinedPhotos.length > 0 ? combinedPhotos : undefined,
        notes: remote.notes || local.notes,
      };
    });

    const finalSessions = [...mergedRemoteSessions, ...localOnlySessions]
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    // 3. Preserve local catches that do not exist remotely yet
    const remoteCatchIds = new Set(remoteCatches.map((c) => c.id));
    const localOnlyCatches = state.catches.filter((c) => !remoteCatchIds.has(c.id));

    // 4. For matching catches, preserve local image or notes if remote is blank
    const localCatchMap = new Map(state.catches.map((c) => [c.id, c]));
    const mergedRemoteCatches = remoteCatches.map((remote) => {
      const local = localCatchMap.get(remote.id);
      if (!local) return remote;
      return {
        ...remote,
        image: remote.image || local.image,
        notes: remote.notes || local.notes,
      };
    });

    const finalCatches = [...mergedRemoteCatches, ...localOnlyCatches]
      .sort((a, b) => new Date(b.caughtAt).getTime() - new Date(a.caughtAt).getTime());

    const nextSub = remoteSubscription && remoteSubscription.tier
      ? {
          subscriptionTier: remoteSubscription.tier,
          appliedCoupon: remoteSubscription.appliedCoupon !== undefined ? remoteSubscription.appliedCoupon : state.appliedCoupon,
          subscriptionExpiresAt: remoteSubscription.expiresAt !== undefined ? remoteSubscription.expiresAt : null,
        }
      : {};

    commit({
      ...state,
      sessions: finalSessions,
      catches: finalCatches,
      ...nextSub,
    });

    // Automatically push any unsynced local catches and sessions to D1
    const user = authActions.getCurrentUser();
    if (user && user.storageMode === 'cloud') {
      localOnlySessions.forEach((s) => pushSessionToCloud(s, user));
      localOnlyCatches.forEach((c) => pushCatchToCloud(c, user));
    }
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
    authActions.updateNickname(name);
  },
  setUnitSystem(unitSystem: UnitSystem) {
    commit({ ...state, unitSystem });
  },
  setEquippedAchievement(id: string | null) {
    commit({ ...state, equippedAchievementId: id });
  },
  toggleCatchLike(catchId: string): boolean {
    const currentLiked = state.likedCatchIds || [];
    const isLiked = currentLiked.includes(catchId);
    const nextLiked = isLiked
      ? currentLiked.filter((id) => id !== catchId)
      : [...currentLiked, catchId];

    const currentLikes = { ...(state.catchLikes || {}) };
    const currentCount = currentLikes[catchId] ?? 0;
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

    syncCatchLikeToCloud(catchId, !isLiked).catch(() => {});
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
  getTotalLikesReceived(): number {
    return state.catches.reduce((acc, c) => acc + (this.getCatchLikesCount(c.id, c.likesCount) || 0), 0);
  },
  applyCoupon(code: string): { success: boolean; message: string } {
    const clean = (code || '').trim().toUpperCase();
    if (!clean) {
      return { success: false, message: 'Please enter a coupon code.' };
    }
    const validCodes = ['KEEPNET1M', 'TRIAL1MONTH', 'ANGLER30', 'FISHFREE', 'PRO1MONTH', 'KEEPNETPRO', 'CARP1MONTH', 'FREETRIAL30', 'SPECIMEN30'];
    const isValid = validCodes.includes(clean)
      || clean.includes('TRIAL')
      || clean.includes('FREE')
      || clean.includes('1M')
      || clean.includes('30')
      || clean.includes('MONTH');
    if (!isValid) {
      return { success: false, message: 'Invalid coupon code. Try code "KEEPNET1M" for a 1-month trial.' };
    }
    const oneMonth = new Date();
    oneMonth.setDate(oneMonth.getDate() + 30);
    const expiresAt = oneMonth.toISOString();

    commit({
      ...state,
      subscriptionTier: 'premium',
      appliedCoupon: clean,
      subscriptionExpiresAt: expiresAt,
    });

    // Cloud persistence for authenticated users
    const user = authActions.getCurrentUser();
    if (user && user.storageMode === 'cloud') {
      redeemCouponOnCloud(clean, user.id).catch(() => {});
    }

    return {
      success: true,
      message: `Coupon "${clean}" applied! Your 1-Month Free Trial of Keepnet Premium is now active until ${oneMonth.toLocaleDateString('en-GB')}.`,
    };
  },
  cancelCouponTrial() {
    commit({
      ...state,
      subscriptionTier: 'lite',
      appliedCoupon: null,
      subscriptionExpiresAt: null,
    });
    const user = authActions.getCurrentUser();
    if (user && user.storageMode === 'cloud') {
      cancelSubscriptionOnCloud().catch(() => {});
    }
  },
  setSubscription(tier: SubscriptionTier, appliedCoupon: string | null = null, expiresAt: string | null = null) {
    commit({
      ...state,
      subscriptionTier: tier,
      appliedCoupon,
      subscriptionExpiresAt: expiresAt,
    });
  },
  isPremium(): boolean {
    const user = authActions.getCurrentUser();
    // Platform owner / administrator always has full specimen suite access unlocked
    if (user && (user.email === 'aransmithson@gmail.com' || user.email === 'aransmithson@googlemail.com' || !!user.isAdmin)) {
      return true;
    }
    if (state.subscriptionTier !== 'premium') return false;
    if (!state.subscriptionExpiresAt) return true; // VIP / Lifetime has no expiry
    return new Date(state.subscriptionExpiresAt).getTime() > Date.now();
  },
  clearAll() {
    try {
      localStorage.removeItem('keepnet:v1');
      localStorage.removeItem('keepnet:v2:live');
    } catch { /* ignore */ }
    commit(seed());
  },
  reset() {
    this.clearAll();
  },
};

export const metricToImperial = (kg: number, g: number): { weightLb: number; weightOz: number } => {
  const totalG = (Math.max(0, kg) || 0) * 1000 + (Math.max(0, g) || 0);
  const totalOunces = totalG / 28.349523125;
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
  const lb = Math.floor(c.weightLb || 0);
  const oz = Math.round(c.weightOz || 0);
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
