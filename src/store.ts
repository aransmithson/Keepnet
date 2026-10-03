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
};

type State = { sessions: Session[]; catches: Catch[]; name: string };

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

export const actions = {
  startSession(v: { venueId: string; venueName: string; lat: number; lon: number; photo?: string; isShared?: boolean }): Session {
    const s: Session = { id: uid(), isShared: false, ...v, photos: v.photo ? [v.photo] : [], startedAt: new Date().toISOString() };
    commit({ ...state, sessions: [s, ...state.sessions] });
    return s;
  },
  updateSession(id: string, patch: Partial<Session>) {
    commit({ ...state, sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  },
  /** Add a location photo to the session gallery and make it the cover. */
  addSessionPhoto(id: string, photo: string) {
    commit({ ...state, sessions: state.sessions.map((s) => (s.id === id ? { ...s, photo, photos: [...(s.photos ?? []), photo] } : s)) });
  },
  addCatch(c: Omit<Catch, 'id'>): Catch {
    const n = { ...c, id: uid() };
    commit({ ...state, catches: [n, ...state.catches] });
    return n;
  },
  updateCatch(id: string, patch: Partial<Catch>) {
    commit({ ...state, catches: state.catches.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  },
  deleteCatch(id: string) {
    commit({ ...state, catches: state.catches.filter((c) => c.id !== id) });
  },
  toggleSessionShare(id: string): boolean {
    let nextShared = false;
    commit({
      ...state,
      sessions: state.sessions.map((s) => {
        if (s.id === id) {
          nextShared = !s.isShared;
          return { ...s, isShared: nextShared };
        }
        return s;
      }),
    });
    return nextShared;
  },
  toggleCatchShare(id: string): boolean {
    let nextShared = false;
    commit({
      ...state,
      catches: state.catches.map((c) => {
        if (c.id === id) {
          nextShared = !c.isShared;
          return { ...c, isShared: nextShared };
        }
        return c;
      }),
    });
    return nextShared;
  },
  setName(name: string) { commit({ ...state, name }); },
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

export const fmtWeight = (c: Pick<Catch, 'weightLb' | 'weightOz'>) => `${c.weightLb} lb ${c.weightOz} oz`;
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
