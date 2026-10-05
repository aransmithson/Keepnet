import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'keepnet:theme';

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // ignore
  }
  return 'dark';
}

let currentTheme: Theme = getInitialTheme();
const listeners = new Set<() => void>();

function applyTheme(theme: Theme) {
  currentTheme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#04180f' : '#f5f3eb');
  } catch {
    // ignore
  }
  listeners.forEach((cb) => cb());
}

// Initial apply
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', currentTheme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', currentTheme === 'dark' ? '#04180f' : '#f5f3eb');
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
