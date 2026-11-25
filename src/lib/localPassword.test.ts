import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { hashPassword, pbkdf2Sha256, verifyPassword, PBKDF2_ITERATIONS } from './localPassword.ts';
import {
  ACCOUNTS_KEY, getActiveUsername, getUserDataKey, loadAccounts, loadUserAppState,
  loginLocalAccount, logoutLocalAccount, registerExternalAccount, registerLocalAccount, saveUserAppState,
} from './storage.ts';

function mockStorage(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed));
  const ls = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  };
  (globalThis as unknown as { window: unknown }).window = { localStorage: ls };
  return m;
}


test('work factor is 600000 (OWASP, PBKDF2-HMAC-SHA256) and WebCrypto matches node reference', async () => {
  assert.equal(PBKDF2_ITERATIONS, 600000);
  const salt = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  for (const pw of ['1', 'pass', 'ك'.repeat(50), 'z'.repeat(100)]) {
    const mine = Buffer.from(await pbkdf2Sha256(pw, salt, 1500)).toString('hex');
    assert.equal(mine, pbkdf2Sync(pw, Buffer.from(salt), 1500, 32, 'sha256').toString('hex'));
  }
});

test('hash verifies right password only; salts differ; time at 600k', async () => {
  const t = Date.now();
  const a = await hashPassword('secret'); const b = await hashPassword('secret');
  const ms = Date.now() - t;
  assert.equal(a.iter, 600000); assert.notEqual(a.salt, b.salt); assert.notEqual(a.hash, b.hash);
  assert.ok(await verifyPassword('secret', a)); assert.ok(!(await verifyPassword('Secret', a))); assert.ok(!(await verifyPassword('', a)));
  console.log(`# two 600k hashes: ${ms} ms in node`);
});

test('new registration stores no plaintext password and login works', async () => {
  const m = mockStorage();
  assert.deepEqual(await registerLocalAccount('Sara', 'p@ss-Word1', 'ar'), { ok: true, username: 'Sara' });
  assert.ok(!m.get(ACCOUNTS_KEY)!.includes('p@ss-Word1'));
  const acc = loadAccounts().sara;
  assert.equal(acc.password, undefined); assert.ok(acc.passwordHash);
  logoutLocalAccount();
  assert.deepEqual(await loginLocalAccount('sara', 'wrong'), { ok: false, error: 'invalid' });
  assert.deepEqual(await loginLocalAccount('SARA', 'p@ss-Word1'), { ok: true, username: 'Sara' });
  assert.equal(getActiveUsername(), 'Sara');
  assert.deepEqual(await registerLocalAccount('sara', 'other', 'ar'), { ok: false, error: 'exists' });
});

test('legacy plaintext account: login works, upgraded in place, data and other accounts untouched', async () => {
  const legacy = {
    omar: { username: 'Omar', password: 'old-pass', createdAt: '2026-11-01T00:00:00.000Z' },
    lina: { username: 'Lina', password: 'lina-pass', createdAt: '2026-11-02T00:00:00.000Z' },
  };
  const m = mockStorage({ [ACCOUNTS_KEY]: JSON.stringify(legacy) });
  const st = loadUserAppState('Omar'); st.userName = 'OmarSynthetic'; saveUserAppState('Omar', st);
  const dataBefore = m.get(getUserDataKey('Omar'));
  assert.deepEqual(await loginLocalAccount('omar', 'bad'), { ok: false, error: 'invalid' });
  assert.equal(loadAccounts().omar.password, 'old-pass', 'failed login must not change the record');
  assert.deepEqual(await loginLocalAccount('Omar', 'old-pass'), { ok: true, username: 'Omar' });
  const after = loadAccounts();
  assert.equal(after.omar.password, undefined); assert.ok(after.omar.passwordHash);
  assert.equal(after.omar.createdAt, legacy.omar.createdAt);
  assert.ok(!m.get(ACCOUNTS_KEY)!.includes('old-pass'));
  assert.equal(after.lina.password, 'lina-pass');
  assert.equal(m.get(getUserDataKey('Omar')), dataBefore, 'user data is untouched');
  logoutLocalAccount();
  assert.deepEqual(await loginLocalAccount('omar', 'old-pass'), { ok: true, username: 'Omar' });
  assert.deepEqual(await loginLocalAccount('lina', 'lina-pass'), { ok: true, username: 'Lina' });
  assert.equal(loadUserAppState('Omar').userName, 'OmarSynthetic');
});

test('if WebCrypto is unavailable: legacy login still works (no lockout), new hashing fails closed', async () => {
  mockStorage({ [ACCOUNTS_KEY]: JSON.stringify({ o: { username: 'O', password: 'pw', createdAt: 'c' } }) });
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto')!;
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  try {
    assert.deepEqual(await loginLocalAccount('o', 'pw'), { ok: true, username: 'O' });
    assert.equal(loadAccounts().o.password, 'pw', 'record left as is');
    assert.deepEqual(await registerLocalAccount('new', 'x', 'ar'), { ok: false, error: 'unavailable' });
  } finally { Object.defineProperty(globalThis, 'crypto', desc); }
});

test('Google account: no local password, uid never stored as one; legacy uid-password record is converted', async () => {
  const uid = 'uidSYNTH123';
  const legacy = { 'g@x.test': { username: 'g@x.test', password: uid, createdAt: 'c0' }, keep: { username: 'keep', password: 'kp', createdAt: 'c1' } };
  const m = mockStorage({ [ACCOUNTS_KEY]: JSON.stringify(legacy) });
  registerExternalAccount('new@x.test', uid, 'ar');
  registerExternalAccount('g@x.test', uid, 'ar');
  const a = loadAccounts();
  assert.ok(!m.get(ACCOUNTS_KEY)!.includes(uid), 'uid not present as a credential');
  assert.equal(a['g@x.test'].external, 'google'); assert.equal(a['g@x.test'].createdAt, 'c0');
  assert.equal(a['new@x.test'].external, 'google');
  assert.equal(a.keep.password, 'kp');
  assert.deepEqual(await loginLocalAccount('new@x.test', uid), { ok: false, error: 'invalid' });
});

test('malformed or empty account records fail closed without throwing', async () => {
  mockStorage({ [ACCOUNTS_KEY]: JSON.stringify({ x: { username: 'X', createdAt: 'c' }, y: { username: 'Y', passwordHash: { salt: 'zz', hash: 'a', iter: 1e12 }, createdAt: 'c' } }) });
  assert.deepEqual(await loginLocalAccount('x', 'anything'), { ok: false, error: 'invalid' });
  assert.deepEqual(await loginLocalAccount('y', 'anything'), { ok: false, error: 'invalid' });
  assert.deepEqual(await loginLocalAccount('', ''), { ok: false, error: 'empty' });
});
