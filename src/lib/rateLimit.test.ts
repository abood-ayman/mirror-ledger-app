import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from './rateLimit';

test('rate limiter blocks after max and recovers after window', () => {
  let t = 1000;
  const rl = createRateLimiter({ windowMs: 60000, max: 2, now: () => t });
  assert.equal(rl.check('a').allowed, true);
  assert.equal(rl.check('a').allowed, true);
  const blocked = rl.check('a');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec > 0);
  assert.equal(rl.check('b').allowed, true);
  t += 60001;
  assert.equal(rl.check('a').allowed, true);
});
