import test from 'node:test';
import assert from 'node:assert/strict';
import { INT_MAX, bodyParserFailure, validateScore, validateTrackerPayload } from './cloudValidation.ts';

const base = { language: 'ar', dialect: 'egyptian', userName: 'x', actions: [], logs: {}, totalPoints: 0 };

test('score: boundary values accepted and rounded', () => {
  for (const s of [0, 1, 99.6, INT_MAX]) assert.equal(validateScore({ score: s }).ok, true);
  const r = validateScore({ score: 99.6, wave: 0, maxCombo: -4 });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.value, { score: 100, wave: 1, maxCombo: 0 });
});
test('score: INT_MAX accepted, INT_MAX+1 rejected with 400 and bilingual message', () => {
  assert.equal(validateScore({ score: INT_MAX }).ok, true);
  const r = validateScore({ score: INT_MAX + 1 });
  assert.ok(!r.ok);
  if (!r.ok) { assert.equal(r.status, 400); assert.equal(r.code, 'number_too_large'); assert.ok(r.errorAr.length > 0); }
});
test('score: wave and maxCombo overflow rejected, not silently changed', () => {
  for (const body of [{ score: 1, wave: INT_MAX + 1 }, { score: 1, maxCombo: 1e12 }]) {
    const r = validateScore(body); assert.ok(!r.ok); if (!r.ok) assert.equal(r.status, 400);
  }
  assert.equal(validateScore({ score: 1, wave: INT_MAX, maxCombo: INT_MAX }).ok, true);
});
test('score: negative, NaN, string, missing rejected with 400', () => {
  for (const b of [{ score: -1 }, { score: NaN }, { score: '5' }, {}, null]) {
    const r = validateScore(b as any); assert.ok(!r.ok); if (!r.ok) assert.equal(r.code, 'invalid_score');
  }
});
test('tracker: valid payload accepted, defaults applied', () => {
  const r = validateTrackerPayload({ ...base, language: 'fr', dialect: 5, userName: 7 });
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.value.language, 'ar'); assert.equal(r.value.dialect, 'egyptian'); assert.equal(r.value.userName, null); }
});
test('tracker: shape errors rejected (non-array actions, null/array logs)', () => {
  for (const b of [{ ...base, actions: 'x' }, { ...base, logs: null }, { ...base, logs: [] }, null, {}]) {
    const r = validateTrackerPayload(b as any); assert.ok(!r.ok); if (!r.ok) assert.equal(r.status, 400);
  }
});
test('tracker: totalPoints boundary, overflow rejected, negative clamps to 0, missing is 0', () => {
  assert.equal((validateTrackerPayload({ ...base, totalPoints: INT_MAX }) as any).value.totalPoints, INT_MAX);
  const o = validateTrackerPayload({ ...base, totalPoints: INT_MAX + 1 }); assert.ok(!o.ok);
  assert.equal((validateTrackerPayload({ ...base, totalPoints: -5 }) as any).value.totalPoints, 0);
  const { totalPoints, ...noPts } = base; assert.equal((validateTrackerPayload(noPts) as any).value.totalPoints, 0);
});
test('body parser failures map to friendly bilingual JSON; others pass through', () => {
  const big = bodyParserFailure({ type: 'entity.too.large' });
  assert.equal(big?.status, 413); assert.equal(big?.code, 'backup_too_large'); assert.ok(big!.errorAr.length > 0);
  assert.equal(bodyParserFailure({ type: 'entity.parse.failed' })?.status, 400);
  assert.equal(bodyParserFailure(new Error('other')), null);
  assert.equal(bodyParserFailure(null), null);
});

test('tracker: populated DailyLog (Arabic text, entries) passes through unchanged', () => {
  const logs = {
    '2026-11-19': {
      date: '2026-11-19',
      entries: { a1: { actionId: 'a1', times: 2, amounts: [10, 20], total: 30, startedWith10Min: true } },
      energy: 7, focus: 6, feelingWhy: 'تعبان شوية بس مبسوط', quickNote: 'ملاحظة تجريبية ✓', pointsEarned: 45,
      updatedAt: '2026-11-19T20:00:00.000Z',
    },
  };
  const r = validateTrackerPayload({ ...base, actions: [{ id: 'a1', name: 'مذاكرة' }], logs, totalPoints: 45 });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.value.logs, logs);
});
