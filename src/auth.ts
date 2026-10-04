import { useSyncExternalStore } from 'react';

export type StorageMode = 'cloud' | 'local';

export type UserAccount = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  storageMode: StorageMode;
};

type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: string;
  /** Storage mode chosen at sign up; restored on sign in. Legacy accounts default to 'cloud'. */
  storageMode?: StorageMode;
  resetCode?: string;
  resetExpires?: number;
};

/** Unicode-safe encoding. Plain btoa() throws on characters outside Latin-1 (e.g. emoji, €). */
function encodePassword(password: string): string {
  return btoa(unescape(encodeURIComponent(password)));
}

/** Legacy encoding used by earlier builds; kept so existing accounts can still sign in. */
function legacyEncodePassword(password: string): string | null {
  try {
    return btoa(password);
  } catch {
    return null;
  }
}

function passwordMatches(stored: string, password: string): boolean {
  return stored === encodePassword(password) || stored === legacyEncodePassword(password);
}

type AuthState = {
  user: UserAccount | null;
  storageMode: StorageMode;
};

const USERS_KEY = 'keepnet:registered_users';
const CURRENT_KEY = 'keepnet:current_user';

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
    // Read back to confirm the write actually persisted (some private modes silently drop writes).
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
    storageMode: 'local', // Default to privacy-preserving local storage
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
  async signUp(email: string, password: string, name: string, saveLocallyOnly: boolean): Promise<{ success: boolean; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    if (password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }

    const mode: StorageMode = saveLocallyOnly ? 'local' : 'cloud';
    const pwdHash = encodePassword(password);
    const cleanName = name.trim() || cleanEmail.split('@')[0];
    let createdUser: UserAccount = {
      id: Math.random().toString(36).slice(2, 10),
      email: cleanEmail,
      name: cleanName,
      createdAt: new Date().toISOString(),
      storageMode: mode,
    };

    // If cloud mode, register with Cloudflare D1
    if (mode === 'cloud') {
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, passwordHash: pwdHash, name: cleanName, storageMode: mode }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          return { success: false, error: data.error || 'Cloud registration failed. Please try again.' };
        }
        if (data.user) {
          createdUser = data.user;
        }
      } catch (err) {
        console.warn('[Keepnet Auth] D1 registration network fallback', err);
      }
    }

    // Always cache locally so offline works
    const users = loadRegisteredUsers();
    const existingIdx = users.findIndex((u) => u.email === cleanEmail);
    const storedUser: StoredUser = {
      id: createdUser.id,
      email: cleanEmail,
      passwordHash: pwdHash,
      name: createdUser.name,
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

  /** Sign in with existing email and password across devices using D1 and local cache. */
  async signIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      return { success: false, error: 'Please enter your email.' };
    }

    let remoteUser: UserAccount | null = null;
    let remoteFailed = false;

    // 1. Try signing in with Cloudflare D1 first so users can sign in on any device
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, rawPassword: password }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        remoteUser = data.user;
      } else if (res.status === 400 || (data && data.error && data.error.includes('Incorrect password'))) {
        return { success: false, error: data.error || 'Incorrect password.' };
      } else if (data && data.error && !data.error.includes('No account found')) {
        return { success: false, error: data.error };
      }
    } catch {
      remoteFailed = true;
    }

    // 2. Fall back to local browser storage
    const users = loadRegisteredUsers();
    const found = users.find((u) => u.email === cleanEmail);

    if (remoteUser) {
      // Cache/update in local storage
      const stored: StoredUser = {
        id: remoteUser.id,
        email: remoteUser.email,
        passwordHash: encodePassword(password),
        name: remoteUser.name,
        createdAt: remoteUser.createdAt,
        storageMode: remoteUser.storageMode,
      };
      const idx = users.findIndex((u) => u.email === cleanEmail);
      if (idx >= 0) users[idx] = stored; else users.push(stored);
      saveRegisteredUsers(users);

      const mode = remoteUser.storageMode || 'cloud';
      authState = { user: remoteUser, storageMode: mode };
      notify();
      console.log(`[Keepnet Auth] Signed in ${cleanEmail} via Cloud D1 (Storage: ${mode})`);
      return { success: true };
    }

    if (!found) {
      return {
        success: false,
        error: remoteFailed
          ? 'Network error reaching server and no local account found with this email.'
          : 'No account found with this email. Please check your spelling or create an account.',
      };
    }

    if (!passwordMatches(found.passwordHash, password)) {
      return { success: false, error: 'Incorrect password. Use "Forgot password?" to reset it.' };
    }

    const mode: StorageMode = found.storageMode ?? 'cloud';
    authState = {
      user: {
        id: found.id,
        email: found.email,
        name: found.name,
        createdAt: found.createdAt,
        storageMode: mode,
      },
      storageMode: mode,
    };
    notify();

    console.log(`[Keepnet Auth] Signed in ${cleanEmail} via local cache (Storage: ${mode})`);
    return { success: true };
  },

  /** Sign out and retain local data as a guest. */
  signOut() {
    authState = {
      user: null,
      storageMode: 'local',
    };
    notify();
  },

  /** Request a password reset code / link for an email address. */
  async requestPasswordReset(email: string): Promise<{ success: boolean; code?: string; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    let remoteCode: string | undefined;

    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.code) {
        remoteCode = data.code;
      }
    } catch {
      // offline fallback
    }

    const users = loadRegisteredUsers();
    const found = users.find((u) => u.email === cleanEmail);

    if (!found && !remoteCode) {
      return { success: false, error: 'No account found with this email address.' };
    }

    const code = remoteCode || Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 15 * 60 * 1000;

    if (found) {
      found.resetCode = code;
      found.resetExpires = expires;
      saveRegisteredUsers(users);
    }

    console.groupCollapsed(`[Keepnet Auth] 🔐 Password Reset for ${cleanEmail}`);
    console.log(`Reset Code: ${code}`);
    console.log(`Expires in 15 minutes.`);
    console.groupEnd();

    return { success: true, code };
  },

  /** Confirm password reset with the code and set a new password. */
  async confirmPasswordReset(email: string, code: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    if (newPassword.length < 6) {
      return { success: false, error: 'New password must be at least 6 characters.' };
    }

    const newHash = encodePassword(newPassword);

    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, action: 'confirm', code, newPasswordHash: newHash }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const users = loadRegisteredUsers();
        const found = users.find((u) => u.email === cleanEmail);
        if (found) {
          found.passwordHash = newHash;
          delete found.resetCode;
          delete found.resetExpires;
          saveRegisteredUsers(users);
        }
        return { success: true };
      }
    } catch {
      // fallback
    }

    const users = loadRegisteredUsers();
    const found = users.find((u) => u.email === cleanEmail);

    if (!found || found.resetCode !== code.trim()) {
      return { success: false, error: 'Invalid reset code. Please check and try again.' };
    }

    if (found.resetExpires && Date.now() > found.resetExpires) {
      return { success: false, error: 'Reset code has expired. Please request a new one.' };
    }

    found.passwordHash = newHash;
    delete found.resetCode;
    delete found.resetExpires;
    saveRegisteredUsers(users);

    console.log(`[Keepnet Auth] Password successfully reset for ${cleanEmail}`);
    return { success: true };
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
};

export const useAuth = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => authState
  );
