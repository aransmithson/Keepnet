import { useSyncExternalStore } from 'react';

export type StorageMode = 'cloud' | 'local';

export type UserAccount = {
  id: string;
  email: string;
  name: string;
  nickname?: string;
  createdAt: string;
  storageMode: StorageMode;
  isAdmin?: boolean;
};

export function isUserAdmin(user?: UserAccount | null): boolean {
  if (!user?.email) return false;
  const email = user.email.toLowerCase().trim();
  return email === 'aransmithson@gmail.com' || email === 'aransmithson@googlemail.com' || !!user.isAdmin;
}

export function getAuthToken(): string {
  try {
    return sessionStorage.getItem('keepnet:auth_token') || localStorage.getItem('keepnet:auth_token') || '';
  } catch {
    return '';
  }
}

export function setAuthToken(token: string | null) {
  try {
    if (token) {
      sessionStorage.setItem('keepnet:auth_token', token);
      localStorage.setItem('keepnet:auth_token', token);
    } else {
      sessionStorage.removeItem('keepnet:auth_token');
      localStorage.removeItem('keepnet:auth_token');
    }
  } catch {
    // ignore private browsing quota
  }
}

type StoredUser = {
  id: string;
  email: string;
  name: string;
  nickname?: string;
  createdAt: string;
  /** Storage mode chosen at sign up; restored on sign in. Legacy accounts default to 'cloud'. */
  storageMode?: StorageMode;
};

type AuthState = {
  user: UserAccount | null;
  storageMode: StorageMode;
};

const USERS_KEY = 'keepnet:registered_users';
const CURRENT_KEY = 'keepnet:current_user';

// Scrub any legacy reversible passwords stored in localStorage by earlier builds
(function scrubLegacyPasswords() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        let modified = false;
        list.forEach((u: any) => {
          if (u && typeof u === 'object') {
            if ('passwordHash' in u) {
              delete u.passwordHash;
              modified = true;
            }
            if ('resetCode' in u) {
              delete u.resetCode;
              modified = true;
            }
            if ('resetExpires' in u) {
              delete u.resetExpires;
              modified = true;
            }
          }
        });
        if (modified) {
          localStorage.setItem(USERS_KEY, JSON.stringify(list));
        }
      }
    }
  } catch {
    // ignore
  }
})();

function loadRegisteredUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRegisteredUsers(users: StoredUser[]): boolean {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    return localStorage.getItem(USERS_KEY) !== null;
  } catch {
    return false;
  }
}

function loadInitialState(): AuthState {
  try {
    const raw = localStorage.getItem(CURRENT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        user: parsed.user ?? null,
        storageMode: parsed.storageMode ?? 'local',
      };
    }
  } catch {
    // ignore
  }
  return {
    user: null,
    storageMode: 'local',
  };
}

let authState: AuthState = loadInitialState();
const listeners = new Set<() => void>();

function notify() {
  try {
    localStorage.setItem(CURRENT_KEY, JSON.stringify(authState));
  } catch {
    // quota
  }
  listeners.forEach((cb) => cb());
}

export const authActions = {
  getCurrentUser(): UserAccount | null {
    return authState.user;
  },

  /** Sign up with email & password. If saveLocallyOnly is true, user opts out of cloud syncing. */
  async signUp(email: string, password: string, nickname: string, saveLocallyOnly: boolean): Promise<{ success: boolean; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    if (password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }

    const mode: StorageMode = saveLocallyOnly ? 'local' : 'cloud';
    const cleanNick = (nickname || '').trim() || cleanEmail.split('@')[0];
    let createdUser: UserAccount = {
      id: Math.random().toString(36).slice(2, 10),
      email: cleanEmail,
      name: cleanNick,
      nickname: cleanNick,
      createdAt: new Date().toISOString(),
      storageMode: mode,
    };

    // If cloud mode, register with Cloudflare D1
    if (mode === 'cloud') {
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password, name: cleanNick, nickname: cleanNick, storageMode: mode }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          return { success: false, error: data.error || 'Cloud registration failed. Please try again.' };
        }
        if (data.token) {
          setAuthToken(data.token);
        }
        if (data.user) {
          createdUser = {
            ...data.user,
            nickname: data.user.nickname || cleanNick,
          };
        }
      } catch (err) {
        console.warn('[Keepnet Auth] D1 registration network fallback', err);
        return { success: false, error: 'Could not connect to Keepnet authentication service. Please check your network connection.' };
      }
    }

    // Cache user profile locally without storing passwords
    const users = loadRegisteredUsers();
    const existingIdx = users.findIndex((u) => u.email === cleanEmail);
    const storedUser: StoredUser = {
      id: createdUser.id,
      email: cleanEmail,
      name: createdUser.name,
      nickname: createdUser.nickname,
      createdAt: createdUser.createdAt,
      storageMode: mode,
    };
    if (existingIdx >= 0) {
      users[existingIdx] = storedUser;
    } else {
      users.push(storedUser);
    }
    saveRegisteredUsers(users);

    authState = {
      user: createdUser,
      storageMode: mode,
    };
    notify();

    console.log(`[Keepnet Auth] Signed up ${cleanEmail} (Storage: ${mode})`);
    return { success: true };
  },

  /** True if at least one account has been registered in this browser. */
  hasAccounts(): boolean {
    return loadRegisteredUsers().length > 0;
  },

  /** Sign in with existing email and password across devices using Cloudflare D1. */
  async signIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      return { success: false, error: 'Please enter your email.' };
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, rawPassword: password }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        if (data.token) {
          setAuthToken(data.token);
        }

        // Cache user profile without password
        const users = loadRegisteredUsers();
        const stored: StoredUser = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          nickname: data.user.nickname,
          createdAt: data.user.createdAt,
          storageMode: data.user.storageMode,
        };
        const idx = users.findIndex((u) => u.email === cleanEmail);
        if (idx >= 0) users[idx] = stored; else users.push(stored);
        saveRegisteredUsers(users);

        const mode = data.user.storageMode || 'cloud';
        authState = { user: data.user, storageMode: mode };
        notify();
        console.log(`[Keepnet Auth] Signed in ${cleanEmail} via Cloud D1 (Storage: ${mode})`);
        return { success: true };
      }

      if (!res.ok && data && data.error) {
        return { success: false, error: data.error };
      }

      return { success: false, error: 'Login failed. Please verify your credentials.' };
    } catch {
      return {
        success: false,
        error: 'Network error connecting to Keepnet authentication service. Please check your internet connection.',
      };
    }
  },

  /** Sign out, clear authentication session, and revert to local guest mode. */
  signOut() {
    setAuthToken(null);
    authState = {
      user: null,
      storageMode: 'local',
    };
    notify();
  },

  /** Request a password reset code to be sent to the user's email address. */
  async requestPasswordReset(email: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();

    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return {
          success: true,
          message: data.message || 'A 6-digit verification code has been sent to your email.',
        };
      }
      if (!res.ok && data.error) {
        return { success: false, error: data.error };
      }
      return { success: false, error: 'Failed to request password reset.' };
    } catch {
      return {
        success: false,
        error: 'Network error reaching password reset service. Please check your connection.',
      };
    }
  },

  /** Confirm password reset with the emailed code and set a new password on Cloudflare D1. */
  async confirmPasswordReset(email: string, code: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = String(code || '').replace(/\D/g, '').trim();

    if (!cleanCode) {
      return { success: false, error: 'Please enter the 6-digit reset code from your email.' };
    }

    if (newPassword.length < 6) {
      return { success: false, error: 'New password must be at least 6 characters.' };
    }

    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, action: 'confirm', code: cleanCode, newPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true };
      }
      if (!res.ok && data.error) {
        return { success: false, error: data.error };
      }
      return { success: false, error: 'Password reset failed. Please request a new code.' };
    } catch {
      return {
        success: false,
        error: 'Network error communicating with Keepnet password service. Please check your connection.',
      };
    }
  },

  /** Toggle or set storage mode (cloud vs local device only). */
  setStorageMode(mode: StorageMode) {
    authState = {
      ...authState,
      storageMode: mode,
      user: authState.user ? { ...authState.user, storageMode: mode } : null,
    };
    notify();
  },

  /** Update user public angler nickname and sync to Cloudflare D1. */
  async updateNickname(nickname: string): Promise<boolean> {
    const clean = nickname.trim();
    if (!clean) return false;

    if (authState.user) {
      authState = {
        ...authState,
        user: { ...authState.user, nickname: clean, name: clean },
      };
      notify();
    }

    const token = getAuthToken();
    if (token) {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch('/api/auth/nickname', {
          method: 'POST',
          headers,
          body: JSON.stringify({ nickname: clean }),
        });
        return res.ok;
      } catch {
        return false;
      }
    }
    return true;
  },
};

export const useAuth = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => authState
  );
