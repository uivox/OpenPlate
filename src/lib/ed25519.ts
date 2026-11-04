/**
 * Ed25519 signature verification (RFC 8032) and SHA-512, in plain TypeScript with BigInt.
 *
 * Used to check that a downloaded offline product pack was made by Tellerwerk's own build: the pack
 * workflow signs it with a private key kept as a GitHub secret, and the app holds the public key.
 * Only verification lives here; nothing in the app can sign. Not constant-time, which is fine for
 * checking public data. Tested against Node's own Ed25519 and SHA-512 in tests/logic.test.ts.
 */

const MASK64 = (1n << 64n) - 1n;

// SHA-512 round constants (FIPS 180-4, first 64 bits of the fractional parts of the cube roots of the first 80 primes).
const K = [
  '428a2f98d728ae22', '7137449123ef65cd', 'b5c0fbcfec4d3b2f', 'e9b5dba58189dbbc', '3956c25bf348b538', '59f111f1b605d019',
  '923f82a4af194f9b', 'ab1c5ed5da6d8118', 'd807aa98a3030242', '12835b0145706fbe', '243185be4ee4b28c', '550c7dc3d5ffb4e2',
  '72be5d74f27b896f', '80deb1fe3b1696b1', '9bdc06a725c71235', 'c19bf174cf692694', 'e49b69c19ef14ad2', 'efbe4786384f25e3',
  '0fc19dc68b8cd5b5', '240ca1cc77ac9c65', '2de92c6f592b0275', '4a7484aa6ea6e483', '5cb0a9dcbd41fbd4', '76f988da831153b5',
  '983e5152ee66dfab', 'a831c66d2db43210', 'b00327c898fb213f', 'bf597fc7beef0ee4', 'c6e00bf33da88fc2', 'd5a79147930aa725',
  '06ca6351e003826f', '142929670a0e6e70', '27b70a8546d22ffc', '2e1b21385c26c926', '4d2c6dfc5ac42aed', '53380d139d95b3df',
  '650a73548baf63de', '766a0abb3c77b2a8', '81c2c92e47edaee6', '92722c851482353b', 'a2bfe8a14cf10364', 'a81a664bbc423001',
  'c24b8b70d0f89791', 'c76c51a30654be30', 'd192e819d6ef5218', 'd69906245565a910', 'f40e35855771202a', '106aa07032bbd1b8',
  '19a4c116b8d2d0c8', '1e376c085141ab53', '2748774cdf8eeb99', '34b0bcb5e19b48a8', '391c0cb3c5c95a63', '4ed8aa4ae3418acb',
  '5b9cca4f7763e373', '682e6ff3d6b2b8a3', '748f82ee5defb2fc', '78a5636f43172f60', '84c87814a1f0ab72', '8cc702081a6439ec',
  '90befffa23631e28', 'a4506cebde82bde9', 'bef9a3f7b2c67915', 'c67178f2e372532b', 'ca273eceea26619c', 'd186b8c721c0c207',
  'eada7dd6cde0eb1e', 'f57d4f7fee6ed178', '06f067aa72176fba', '0a637dc5a2c898a6', '113f9804bef90dae', '1b710b35131c471b',
  '28db77f523047d84', '32caab7b40c72493', '3c9ebe0a15c9bebc', '431d67c49c100d4c', '4cc5d4becb3e42b6', '597f299cfc657e2a',
  '5fcb6fab3ad6faec', '6c44198c4a475817',
].map((h) => BigInt(`0x${h}`));

const IV = [
  '6a09e667f3bcc908', 'bb67ae8584caa73b', '3c6ef372fe94f82b', 'a54ff53a5f1d36f1',
  '510e527fade682d1', '9b05688c2b3e6c1f', '1f83d9abfb41bd6b', '5be0cd19137e2179',
].map((h) => BigInt(`0x${h}`));

const rotr = (x: bigint, n: bigint) => ((x >> n) | (x << (64n - n))) & MASK64;

/** SHA-512 of the bytes. Meant for short messages (BigInt is slow); large files are hashed natively. */
export function sha512(msg: Uint8Array): Uint8Array {
  const bitLen = BigInt(msg.length) * 8n;
  const padded = new Uint8Array(Math.ceil((msg.length + 17) / 128) * 128);
  padded.set(msg);
  padded[msg.length] = 0x80;
  for (let i = 0; i < 16; i++) padded[padded.length - 1 - i] = Number((bitLen >> BigInt(8 * i)) & 0xffn);

  const h = [...IV];
  const w = new Array<bigint>(80);
  for (let off = 0; off < padded.length; off += 128) {
    for (let t = 0; t < 16; t++) {
      let v = 0n;
      for (let b = 0; b < 8; b++) v = (v << 8n) | BigInt(padded[off + t * 8 + b]);
      w[t] = v;
    }
    for (let t = 16; t < 80; t++) {
      const s0 = rotr(w[t - 15], 1n) ^ rotr(w[t - 15], 8n) ^ (w[t - 15] >> 7n);
      const s1 = rotr(w[t - 2], 19n) ^ rotr(w[t - 2], 61n) ^ (w[t - 2] >> 6n);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) & MASK64;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 80; t++) {
      const S1 = rotr(e, 14n) ^ rotr(e, 18n) ^ rotr(e, 41n);
      const ch = (e & f) ^ (~e & MASK64 & g);
      const t1 = (hh + S1 + ch + K[t] + w[t]) & MASK64;
      const S0 = rotr(a, 28n) ^ rotr(a, 34n) ^ rotr(a, 39n);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) & MASK64;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) & MASK64;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) & MASK64;
    }
    h[0] = (h[0] + a) & MASK64;
    h[1] = (h[1] + b) & MASK64;
    h[2] = (h[2] + c) & MASK64;
    h[3] = (h[3] + d) & MASK64;
    h[4] = (h[4] + e) & MASK64;
    h[5] = (h[5] + f) & MASK64;
    h[6] = (h[6] + g) & MASK64;
    h[7] = (h[7] + hh) & MASK64;
  }
  const out = new Uint8Array(64);
  h.forEach((v, i) => {
    for (let b = 0; b < 8; b++) out[i * 8 + b] = Number((v >> BigInt(56 - 8 * b)) & 0xffn);
  });
  return out;
}

/* ---------- Curve25519 in twisted Edwards form (-x² + y² = 1 + d·x²·y²) ---------- */

const P = (1n << 255n) - 19n;
const L = (1n << 252n) + 27742317777372353535851937790883648493n;
const mod = (a: bigint, m = P) => {
  const r = a % m;
  return r >= 0n ? r : r + m;
};
function pow(base: bigint, exp: bigint): bigint {
  let r = 1n;
  let b = mod(base);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % P;
    b = (b * b) % P;
    e >>= 1n;
  }
  return r;
}
const inv = (a: bigint) => pow(a, P - 2n);
const D = mod(-121665n * inv(121666n));
const D2 = mod(2n * D);
const SQRT_M1 = pow(2n, (P - 1n) / 4n);

/** A point in extended coordinates (X:Y:Z:T), x = X/Z, y = Y/Z, x·y = T/Z. */
type Point = { X: bigint; Y: bigint; Z: bigint; T: bigint };
const ZERO: Point = { X: 0n, Y: 1n, Z: 1n, T: 0n };

function add(p: Point, q: Point): Point {
  const a = mod((p.Y - p.X) * (q.Y - q.X));
  const b = mod((p.Y + p.X) * (q.Y + q.X));
  const c = mod(p.T * D2 * q.T);
  const d = mod(p.Z * 2n * q.Z);
  const e = b - a;
  const f = d - c;
  const g = d + c;
  const h = b + a;
  return { X: mod(e * f), Y: mod(g * h), Z: mod(f * g), T: mod(e * h) };
}

function multiply(p: Point, n: bigint): Point {
  let r = ZERO;
  let q = p;
  let k = n;
  while (k > 0n) {
    if (k & 1n) r = add(r, q);
    q = add(q, q);
    k >>= 1n;
  }
  return r;
}

const leInt = (bytes: Uint8Array) => {
  let n = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
  return n;
};

/** Decodes a 32-byte point (RFC 8032 section 5.1.3); null when it isn't a valid point. */
function decodePoint(bytes: Uint8Array): Point | null {
  if (bytes.length !== 32) return null;
  const n = leInt(bytes);
  const sign = n >> 255n;
  const y = n & ((1n << 255n) - 1n);
  if (y >= P) return null;
  const y2 = (y * y) % P;
  const u = mod(y2 - 1n);
  const v = mod(D * y2 + 1n);
  const x2 = mod(u * inv(v));
  let x = pow(x2, (P + 3n) / 8n);
  if (mod(x * x - x2) !== 0n) x = mod(x * SQRT_M1);
  if (mod(x * x - x2) !== 0n) return null;
  if (x === 0n && sign === 1n) return null;
  if ((x & 1n) !== sign) x = P - x;
  return { X: x, Y: y, Z: 1n, T: mod(x * y) };
}

const BASE = decodePoint(Uint8Array.from({ length: 32 }, (_, i) => (i === 0 ? 0x58 : 0x66)))!;

const samePoint = (p: Point, q: Point) => mod(p.X * q.Z - q.X * p.Z) === 0n && mod(p.Y * q.Z - q.Y * p.Z) === 0n;

/** True when `signature` (64 bytes) is a valid Ed25519 signature of `message` by `publicKey` (32 bytes). */
export function verifyEd25519(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  if (publicKey.length !== 32 || signature.length !== 64) return false;
  const A = decodePoint(publicKey);
  const R = decodePoint(signature.subarray(0, 32));
  if (!A || !R) return false;
  const s = leInt(signature.subarray(32));
  if (s >= L) return false;
  const hashed = new Uint8Array(64 + message.length);
  hashed.set(signature.subarray(0, 32));
  hashed.set(publicKey, 32);
  hashed.set(message, 64);
  const k = leInt(sha512(hashed)) % L;
  // [s]B = R + [k]A
  return samePoint(multiply(BASE, s), add(R, multiply(A, k)));
}

/* ---------- Encoding helpers ---------- */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Standard base64 → bytes; null on anything else (no whitespace, correct padding). */
export function base64ToBytes(s: string): Uint8Array | null {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s)) return null;
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buf = 0;
  let bits = 0;
  let o = 0;
  for (const ch of clean) {
    buf = (buf << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buf >> bits) & 0xff;
    }
  }
  return out;
}

/** UTF-8 bytes of a string (TextEncoder exists in browsers, Node and Hermes). */
export const utf8 = (s: string) => new TextEncoder().encode(s);

export const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
