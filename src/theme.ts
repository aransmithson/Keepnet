import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'keepnet:theme';

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // ignore
  }
  return 'light';
}

let currentTheme: Theme = getInitialTheme();
const listeners = new Set<() => void>();

function applyTheme(theme: Theme) {
  currentTheme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
  } catch {
    // ignore
  }
  listeners.forEach((cb) => cb());
}

// Initial apply
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', currentTheme);
}

export const themeActions = {
  getTheme: () => currentTheme,
  setTheme: (theme: Theme) => applyTheme(theme),
  toggleTheme: () => applyTheme(currentTheme === 'light' ? 'dark' : 'light'),
};

export const useTheme = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => currentTheme
  );
