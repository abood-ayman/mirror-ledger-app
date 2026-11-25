// Salted PBKDF2-HMAC-SHA256 via the browser's native WebCrypto, so the on-device account list does not keep
// passwords readable. Work factor follows the OWASP Password Storage Cheat Sheet (600,000 for PBKDF2-HMAC-SHA256).
// This is not a security boundary against someone who controls the device or browser profile: local data is not encrypted.
export const PBKDF2_ITERATIONS = 600000;

export interface PasswordRecord { salt: string; hash: string; iter: number }

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (s: string): Uint8Array<ArrayBuffer> => new Uint8Array((s.match(/../g) ?? []).map((x) => parseInt(x, 16)));

function subtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle || !c.getRandomValues) throw new Error('webcrypto_unavailable');
  return c.subtle;
}

export async function pbkdf2Sha256(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const s = subtle();
  const key = await s.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await s.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, salt?: Uint8Array<ArrayBuffer>, iter = PBKDF2_ITERATIONS): Promise<PasswordRecord> {
  subtle();
  const s = salt ?? globalThis.crypto.getRandomValues(new Uint8Array(16));
  return { salt: hex(s), hash: hex(await pbkdf2Sha256(password, s, iter)), iter };
}

export async function verifyPassword(password: string, rec: PasswordRecord): Promise<boolean> {
  if (!rec || typeof rec.salt !== 'string' || typeof rec.hash !== 'string' || !Number.isInteger(rec.iter) || rec.iter < 1 || rec.iter > 5_000_000) return false;
  if (!/^[0-9a-f]*$/.test(rec.salt) || rec.salt.length < 2 || rec.salt.length % 2) return false;
  const calc = hex(await pbkdf2Sha256(password, fromHex(rec.salt), rec.iter));
  if (calc.length !== rec.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < calc.length; i++) diff |= calc.charCodeAt(i) ^ rec.hash.charCodeAt(i);
  return diff === 0;
}
