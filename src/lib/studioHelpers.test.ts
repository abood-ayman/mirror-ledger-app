import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyUpstreamError,
  extractGroundingSources,
  float32ToInt16PcmBase64,
  int16PcmBase64ToFloat32,
} from './studioHelpers';
import {
  applyOrbInteraction,
  computeWaveParameters,
  createInitialSnapshot,
  isCaughtByShield,
} from './focusGameRules';

test('extractGroundingSources extracts web and maps chunks with review snippets cleanly', () => {
  const sources = extractGroundingSources([
    {
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: 'https://example.com/study', title: 'Deep Work Tips' } },
          { web: { uri: 'https://example.com/study', title: 'Duplicate' } },
          {
            maps: {
              uri: 'https://maps.google.com/?cid=123',
              title: 'Quiet Library Cairo',
              placeAnswerSources: {
                reviewSnippets: [{ content: 'Very quiet study hall with strong Wi-Fi.' }],
              },
            },
          },
        ],
      },
    },
  ]);

  assert.equal(sources.length, 2);
  assert.equal(sources[0].kind, 'web');
  assert.equal(sources[0].title, 'Deep Work Tips');
  assert.equal(sources[1].kind, 'maps');
  assert.equal(sources[1].reviewSnippets?.[0], 'Very quiet study hall with strong Wi-Fi.');
});

test('PCM Float32 <-> Int16 base64 roundtrip stays within quantization tolerance', () => {
  const input = new Float32Array([0, 0.5, -0.5, 0.9, -0.9]);
  const b64 = float32ToInt16PcmBase64(input);
  const decoded = int16PcmBase64ToFloat32(b64);

  assert.equal(decoded.length, input.length);
  for (let i = 0; i < input.length; i++) {
    assert.ok(Math.abs(decoded[i] - input[i]) < 0.002);
  }
});

test('classifyUpstreamError detects paid-key and quota states', () => {
  const paid = classifyUpstreamError(403, 'Billing must be enabled');
  assert.equal(paid.requiresPaidKey, true);

  const quota = classifyUpstreamError(429, 'RESOURCE_EXHAUSTED');
  assert.equal(quota.quotaExceeded, true);
  assert.equal(quota.requiresPaidKey, false);
});

test('focus game wave progression and orb collision scoring', () => {
  const initial = createInitialSnapshot(100);
  assert.equal(initial.shields, 3);
  assert.equal(computeWaveParameters(0).wave, 1);
  assert.equal(computeWaveParameters(32).wave, 3);

  assert.equal(isCaughtByShield(0.1, 0, 1.0), true);
  assert.equal(isCaughtByShield(Math.PI, 0, 1.0), false);

  const caught = applyOrbInteraction(initial, 'clarity', true);
  assert.equal(caught.event, 'catch_clarity');
  assert.ok(caught.next.score > 0);
  assert.equal(caught.next.combo, 1);

  const hit1 = applyOrbInteraction(caught.next, 'ember', false);
  assert.equal(hit1.event, 'core_hit');
  assert.equal(hit1.next.shields, 2);
  assert.equal(hit1.next.combo, 0);

  const hit3 = applyOrbInteraction(
    { ...hit1.next, shields: 1 },
    'ember',
    false
  );
  assert.equal(hit3.next.shields, 0);
  assert.equal(hit3.next.phase, 'gameover');
});
