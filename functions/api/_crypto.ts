/**
 * Security & Cryptography Utilities for Cloudflare Pages Functions
 * Implements PBKDF2-SHA256 password hashing with salt, constant-time verification,
 * timing-attack prevention, and cryptographically secure token generation.
 */

/** Hex encode a Uint8Array */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/** Hex decode a string into a Uint8Array */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/** Constant-time string equality check to prevent timing analysis attacks */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

const PBKDF2_ITERATIONS = 100000;
const HASH_LENGTH = 32; // 256 bits

/**
 * Hash a password using PBKDF2-HMAC-SHA256 with a unique 16-byte cryptographic salt.
 * Output format: `pbkdf2:100000:<salt_hex>:<hash_hex>`
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    HASH_LENGTH * 8
  );

  const saltHex = bytesToHex(salt);
  const hashHex = bytesToHex(new Uint8Array(derivedBits));

  return `pbkdf2:${PBKDF2_ITERATIONS}:${saltHex}:${hashHex}`;
}

/**
 * Verify a plaintext password against a stored hash.
 * Handles both modern PBKDF2 hashes and legacy Base64 hashes (flagging legacy for transparent upgrade).
 */
export async function verifyPassword(
  plain: string,
  stored: string
): Promise<{ valid: boolean; needsRehash?: boolean }> {
  if (!plain || !stored) {
    return { valid: false };
  }

  // Modern PBKDF2 format
  if (stored.startsWith('pbkdf2:')) {
    const parts = stored.split(':');
    if (parts.length !== 4) return { valid: false };

    const iterations = parseInt(parts[1], 10);
    const saltHex = parts[2];
    const expectedHashHex = parts[3];

    if (!iterations || iterations < 1000 || !saltHex || !expectedHashHex) {
      return { valid: false };
    }

    try {
      const salt = hexToBytes(saltHex);
      const enc = new TextEncoder();
      const passwordKey = await crypto.subtle.importKey(
        'raw',
        enc.encode(plain),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
      );

      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt,
          iterations,
          hash: 'SHA-256',
        },
        passwordKey,
        HASH_LENGTH * 8
      );

      const computedHashHex = bytesToHex(new Uint8Array(derivedBits));
      const valid = timingSafeEqual(computedHashHex, expectedHashHex);
      return { valid, needsRehash: false };
    } catch {
      return { valid: false };
    }
  }

  // Legacy Base64 check for seamless backwards compatibility
  const btoa1 = btoa(unescape(encodeURIComponent(plain)));
  let btoa2: string | null = null;
  try {
    btoa2 = btoa(plain);
  } catch {
    /* ignore */
  }

  if (stored === btoa1 || stored === btoa2) {
    return { valid: true, needsRehash: true };
  }

  return { valid: false };
}

/** Generate a 256-bit cryptographically secure session token */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToHex(bytes);
}

/**
 * Sanitize and validate general string inputs:
 * - Trims whitespace
 * - Strips dangerous control characters and null bytes
 * - Truncates to max length
 */
export function sanitizeInput(input: unknown, maxLength = 255): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // strip control chars
    .trim()
    .slice(0, maxLength);
}
