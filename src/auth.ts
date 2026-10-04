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
  /** Sign up with email & password. If saveLocallyOnly is true, user opts out of cloud syncing. */
  signUp(email: string, password: string, name: string, saveLocallyOnly: boolean): { success: boolean; error?: string } {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    if (password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }

    const users = loadRegisteredUsers();
    if (users.some((u) => u.email === cleanEmail)) {
      return { success: false, error: 'An account with this email already exists.' };
    }

    const mode: StorageMode = saveLocallyOnly ? 'local' : 'cloud';
    const newUser: StoredUser = {
      id: Math.random().toString(36).slice(2, 10),
      email: cleanEmail,
      passwordHash: encodePassword(password), // Obfuscation only — not real hashing (local-only store)
      name: name.trim() || cleanEmail.split('@')[0],
      createdAt: new Date().toISOString(),
      storageMode: mode,
    };

    users.push(newUser);
    if (!saveRegisteredUsers(users)) {
      return {
        success: false,
        error:
          "Couldn't save your account — this browser is blocking storage (private/incognito mode or storage disabled). Please use a normal browser window and try again.",
      };
    }

    authState = {
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        createdAt: newUser.createdAt,
        storageMode: mode,
      },
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

  /** Sign in with existing email and password. */
  signIn(email: string, password: string): { success: boolean; error?: string } {
    const cleanEmail = email.trim().toLowerCase();
    const users = loadRegisteredUsers();
    const found = users.find((u) => u.email === cleanEmail);

    if (!found) {
      return {
        success: false,
        error:
          "No account with this email exists in this browser. Accounts are currently stored on the device where they were created — if you registered on another device or browser, please sign up again here.",
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

    console.log(`[Keepnet Auth] Signed in ${cleanEmail} (Storage: ${mode})`);
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
  requestPasswordReset(email: string): { success: boolean; code?: string; error?: string } {
    const cleanEmail = email.trim().toLowerCase();
    const users = loadRegisteredUsers();
    const found = users.find((u) => u.email === cleanEmail);

    if (!found) {
      return { success: false, error: 'No account found with this email address.' };
    }

    // Generate a 6-digit confirmation code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 15 * 60 * 1000; // 15 mins

    found.resetCode = code;
    found.resetExpires = expires;
    saveRegisteredUsers(users);

    console.groupCollapsed(`[Keepnet Auth] 🔐 Password Reset for ${cleanEmail}`);
    console.log(`Reset Code: ${code}`);
    console.log(`Expires in 15 minutes.`);
    console.groupEnd();

    return { success: true, code };
  },

  /** Confirm password reset with the code and set a new password. */
  confirmPasswordReset(email: string, code: string, newPassword: string): { success: boolean; error?: string } {
    const cleanEmail = email.trim().toLowerCase();
    if (newPassword.length < 6) {
      return { success: false, error: 'New password must be at least 6 characters.' };
    }

    const users = loadRegisteredUsers();
    const found = users.find((u) => u.email === cleanEmail);

    if (!found || found.resetCode !== code.trim()) {
      return { success: false, error: 'Invalid reset code. Please check and try again.' };
    }

    if (found.resetExpires && Date.now() > found.resetExpires) {
      return { success: false, error: 'Reset code has expired. Please request a new one.' };
    }

    found.passwordHash = encodePassword(newPassword);
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
