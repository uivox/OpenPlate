/**
 * Password-encrypted backups. The backup JSON is encrypted on the device with a key made from the
 * password (scrypt) and XChaCha20-Poly1305, from the audited @noble libraries, which are plain
 * JavaScript and need no server or native module. The password is never stored. Pure: no React
 * Native imports; random bytes come from the caller (expo-crypto in the app, node:crypto in tests).
 *
 * File format (JSON, so it still opens as a text file and imports through the same picker):
 *   { app: 'OpenPlate', encrypted: 1, kdf: { name: 'scrypt', N, r, p }, cipher: 'xchacha20poly1305',
 *     salt, nonce, data }   (bytes as base64)
 * The header (everything but `data`) is bound to the ciphertext as associated data, so changing
 * the key settings in the file makes decryption fail instead of weakening it.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';

export interface KdfParams {
  name: 'scrypt';
  N: number;
  r: number;
  p: number;
}

/** 64 MB of memory and a few seconds on a phone: slow enough to make guessing a password expensive. */
export const DEFAULT_KDF: KdfParams = { name: 'scrypt', N: 2 ** 16, r: 8, p: 1 };
/** Accepted when reading: a file can't make the app use a weak or a phone-crashing setting. */
const N_RANGE = [2 ** 14, 2 ** 20] as const;

export const MIN_PASSWORD = 8;

export type PasswordProblem = 'short' | 'mismatch';

export function passwordProblem(password: string, repeat: string): PasswordProblem | null {
  if ([...password].length < MIN_PASSWORD) return 'short';
  if (password !== repeat) return 'mismatch';
  return null;
}

/* ---------- Bytes ---------- */

export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    let c = ch.codePointAt(0)!;
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd; // lone surrogate
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

export function utf8Decode(b: Uint8Array): string {
  let s = '';
  const chunk: number[] = [];
  const flush = () => {
    s += String.fromCodePoint(...chunk);
    chunk.length = 0;
  };
  for (let i = 0; i < b.length; ) {
    const x = b[i];
    let c: number;
    let n: number;
    if (x < 0x80) [c, n] = [x, 1];
    else if (x >> 5 === 6) [c, n] = [((x & 31) << 6) | (b[i + 1] & 63), 2];
    else if (x >> 4 === 14) [c, n] = [((x & 15) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63), 3];
    else [c, n] = [((x & 7) << 18) | ((b[i + 1] & 63) << 12) | ((b[i + 2] & 63) << 6) | (b[i + 3] & 63), 4];
    chunk.push(c);
    if (chunk.length > 8000) flush();
    i += n;
  }
  flush();
  return s;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=');
  }
  return s;
}

export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[\s=]/g, '');
  if (/[^A-Za-z0-9+/]/.test(clean)) throw new Error('INVALID_BACKUP');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) |
      (B64.indexOf(clean[i + 1] ?? 'A') << 12) |
      ((clean[i + 2] ? B64.indexOf(clean[i + 2]) : 0) << 6) |
      (clean[i + 3] ? B64.indexOf(clean[i + 3]) : 0);
    out[o++] = (n >> 16) & 255;
    if (clean[i + 2]) out[o++] = (n >> 8) & 255;
    if (clean[i + 3]) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

/* ---------- Encrypting ---------- */

interface Header {
  app: 'OpenPlate';
  encrypted: 1;
  kdf: KdfParams;
  cipher: 'xchacha20poly1305';
  salt: string;
  nonce: string;
}

const headerBytes = (h: Header) =>
  utf8Encode(JSON.stringify([h.app, h.encrypted, h.kdf.name, h.kdf.N, h.kdf.r, h.kdf.p, h.cipher, h.salt, h.nonce]));

function deriveKey(password: string, salt: Uint8Array, kdf: KdfParams, onProgress?: (p: number) => void): Promise<Uint8Array> {
  return scryptAsync(utf8Encode(password.normalize('NFC')), salt, {
    N: kdf.N,
    r: kdf.r,
    p: kdf.p,
    dkLen: 32,
    asyncTick: 25,
    maxmem: 2 ** 30 + 4096,
    onProgress,
  });
}

/** The encrypted backup file's text. */
export async function encryptBackup(
  json: string,
  password: string,
  random: (n: number) => Uint8Array,
  kdf: KdfParams = DEFAULT_KDF,
  onProgress?: (p: number) => void,
): Promise<string> {
  const salt = random(16);
  const nonce = random(24);
  const header: Header = { app: 'OpenPlate', encrypted: 1, kdf, cipher: 'xchacha20poly1305', salt: toBase64(salt), nonce: toBase64(nonce) };
  const key = await deriveKey(password, salt, kdf, onProgress);
  try {
    const data = xchacha20poly1305(key, nonce, headerBytes(header)).encrypt(utf8Encode(json));
    return JSON.stringify({ ...header, data: toBase64(data) });
  } finally {
    key.fill(0);
  }
}

/** Whether a picked file is an encrypted backup (checked before asking for a password). */
export function isEncryptedBackup(text: string): boolean {
  const t = text.trimStart();
  if (!t.startsWith('{') || !t.includes('"encrypted"')) return false;
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    return o.app === 'OpenPlate' && o.encrypted === 1;
  } catch {
    return false;
  }
}

/**
 * The backup JSON inside an encrypted file. Throws 'WRONG_PASSWORD' when the password (or the
 * file) doesn't match, 'INVALID_BACKUP' when it isn't an encrypted OpenPlate backup.
 */
export async function decryptBackup(text: string, password: string, onProgress?: (p: number) => void): Promise<string> {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text.trim()) as Record<string, unknown>;
  } catch {
    throw new Error('INVALID_BACKUP');
  }
  const k = o.kdf as Record<string, unknown> | undefined;
  if (
    o.app !== 'OpenPlate' ||
    o.encrypted !== 1 ||
    o.cipher !== 'xchacha20poly1305' ||
    !k ||
    k.name !== 'scrypt' ||
    typeof k.N !== 'number' ||
    !Number.isInteger(Math.log2(k.N)) ||
    k.N < N_RANGE[0] ||
    k.N > N_RANGE[1] ||
    k.r !== 8 ||
    k.p !== 1 ||
    typeof o.salt !== 'string' ||
    typeof o.nonce !== 'string' ||
    typeof o.data !== 'string'
  )
    throw new Error('INVALID_BACKUP');
  const kdf: KdfParams = { name: 'scrypt', N: k.N, r: 8, p: 1 };
  const header: Header = { app: 'OpenPlate', encrypted: 1, kdf, cipher: 'xchacha20poly1305', salt: o.salt, nonce: o.nonce };
  const salt = fromBase64(o.salt);
  const nonce = fromBase64(o.nonce);
  if (salt.length < 16 || nonce.length !== 24) throw new Error('INVALID_BACKUP');
  const key = await deriveKey(password, salt, kdf, onProgress);
  try {
    const plain = xchacha20poly1305(key, nonce, headerBytes(header)).decrypt(fromBase64(o.data));
    return utf8Decode(plain);
  } catch {
    throw new Error('WRONG_PASSWORD');
  } finally {
    key.fill(0);
  }
}
