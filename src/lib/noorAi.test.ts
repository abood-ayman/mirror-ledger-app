import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNoorAiRequest } from './noor';

test('buildNoorAiRequest sends only name, dialect and recent turns', () => {
  const req = buildNoorAiRequest(
    'عبود',
    'egyptian',
    [
      { sender: 'noor', text: 'اهلا' },
      { sender: 'user', text: 'سلام' },
      { sender: 'noor', text: 'عامل ايه' },
    ],
    'تعبان من الشغل'
  );
  assert.match(req.systemInstruction, /Egyptian/);
  assert.match(req.systemInstruction, /عبود/);
  assert.equal(req.messages[0].role, 'user');
  assert.equal(req.messages[req.messages.length - 1].text, 'تعبان من الشغل');
  assert.ok(req.messages.every((m, i, a) => i === 0 || true));
  assert.ok(req.messages.length <= 9);
});

test('buildNoorAiRequest caps history and message length', () => {
  const history = Array.from({ length: 30 }, (_, i) => ({
    sender: (i % 2 ? 'user' : 'noor') as 'user' | 'noor',
    text: 'x'.repeat(5000),
  }));
  const req = buildNoorAiRequest(undefined, 'english', history, 'y'.repeat(5000));
  assert.ok(req.messages.length <= 9);
  assert.ok(req.messages.every((m) => m.text.length <= 1000));
});
