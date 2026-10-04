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
  notes?: string;
  /** Whether this catch is shared to the public Discover map. */
  isShared?: boolean;
  userId?: string;
  userName?: string;
};

export type UnitSystem = 'imperial' | 'metric';

type State = {
  sessions: Session[];
  catches: Catch[];
  name: string;
  unitSystem?: UnitSystem;
};

export const VENUES: Venue[] = [
  { id: 'dolphinholme', name: 'Dolphinholme', type: 'Coarse fishing', lat: 54.0003, lon: -2.7372, targets: ['Perch', 'Chub'], description: 'Upper River Wyre — quiet glides and deep pools under the weir.' },
  { id: 'lune-caton', name: 'River Lune, Caton', type: 'River', lat: 54.0758, lon: -2.7150, targets: ['Chub', 'Dace', 'Grayling'], description: 'Classic Lune beats with gravel runs and slack eddies.' },
  { id: 'wyre-garstang', name: 'River Wyre, Garstang', type: 'River', lat: 53.9025, lon: -2.7735, targets: ['Roach', 'Chub', 'Pike'], description: 'Slow-moving town stretch — great for trotting in winter.' },
  { id: 'bank-house', name: 'Bank House Fly Fishery', type: 'Stillwater', lat: 54.1060, lon: -2.6400, targets: ['Rainbow trout', 'Brown trout'], description: 'Spring-fed lakes with clear water and wary fish.' },
  { id: 'lancaster-canal', name: 'Lancaster Canal, Galgate', type: 'Canal', lat: 53.9930, lon: -2.7900, targets: ['Perch', 'Roach', 'Bream'], description: 'Tree-lined towpath with boats moored for shade.' },
];

export const SPECIES = ['Perch', 'Chub', 'Roach', 'Pike', 'Bream', 'Dace', 'Grayling', 'Rainbow trout', 'Brown trout', 'Carp', 'Tench', 'Rudd'];

const KEY = 'keepnet:v2:live';
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** Production launch initial state: clean, empty journal. */
const seed = (): State => ({
  name: 'Angler',
  sessions: [],
  catches: [],
  unitSystem: 'imperial',
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
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota */ }
  listeners.forEach((l) => l());
};

export const useStore = () =>
  useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);

import { pushSessionToCloud, pushCatchToCloud } from './cloud';
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
  mergeRemoteData(remoteSessions: Session[], remoteCatches: Catch[]) {
    const sMap = new Map(state.sessions.map((s) => [s.id, s]));
    remoteSessions.forEach((s) => sMap.set(s.id, s));

    const cMap = new Map(state.catches.map((c) => [c.id, c]));
    remoteCatches.forEach((c) => cMap.set(c.id, c));

    commit({
      ...state,
      sessions: Array.from(sMap.values()).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),
      catches: Array.from(cMap.values()).sort((a, b) => new Date(b.caughtAt).getTime() - new Date(a.caughtAt).getTime()),
    });
  },
  setName(name: string) {
    commit({ ...state, name });
    authActions.updateNickname(name);
  },
  setUnitSystem(unitSystem: UnitSystem) {
    commit({ ...state, unitSystem });
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
