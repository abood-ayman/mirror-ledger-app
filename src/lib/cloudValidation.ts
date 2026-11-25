export const INT_MAX = 2147483647;
/** Existing overall request limit (express.json limit '20mb', measured in bytes). Kept unchanged; see tooLargeBody(). */
export const REQUEST_BODY_LIMIT_BYTES = 20 * 1024 * 1024;

export type ValidationFailure = {
  ok: false;
  status: 400 | 413;
  code: string;
  error: string;
  errorAr: string;
};
export type Validated<T> = { ok: true; value: T } | ValidationFailure;

const fail = (status: 400 | 413, code: string, error: string, errorAr: string): ValidationFailure => ({
  ok: false, status, code, error, errorAr,
});

/** Returns a rounded non-negative integer, or a failure when the value is not a finite number or exceeds the int32 range. Negative values clamp to 0 (existing behavior). */
export function toStoredInt(value: unknown, field: string, min = 0): Validated<number> {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fail(400, 'invalid_number', `${field} must be a number`, `قيمة ${field} غير صالحة`);
  }
  const r = Math.round(value);
  if (r > INT_MAX) {
    return fail(400, 'number_too_large', `${field} is too large`, `قيمة ${field} كبيرة جدا`);
  }
  return { ok: true, value: Math.max(min, r) };
}

export type TrackerInput = {
  language: 'ar' | 'en';
  dialect: string;
  userName: string | null;
  actions: unknown[];
  logs: Record<string, unknown>;
  totalPoints: number;
};

export function validateTrackerPayload(body: any): Validated<TrackerInput> {
  if (!body || !Array.isArray(body.actions) || typeof body.logs !== 'object' || body.logs === null || Array.isArray(body.logs)) {
    return fail(400, 'invalid_tracker', 'Invalid tracker payload', 'بيانات النسخة الاحتياطية غير صالحة');
  }
  let pts = 0;
  if (Number.isFinite(body.totalPoints)) {
    const p = toStoredInt(body.totalPoints, 'totalPoints');
    if (!p.ok) return p;
    pts = p.value;
  }
  return {
    ok: true,
    value: {
      language: body.language === 'en' ? 'en' : 'ar',
      dialect: typeof body.dialect === 'string' ? body.dialect.slice(0, 32) : 'egyptian',
      userName: typeof body.userName === 'string' ? body.userName.slice(0, 80) : null,
      actions: body.actions,
      logs: body.logs,
      totalPoints: pts,
    },
  };
}

export type ScoreInput = { score: number; wave: number; maxCombo: number };

export function validateScore(body: any): Validated<ScoreInput> {
  const { score, wave, maxCombo } = (body ?? {}) as Record<string, unknown>;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) {
    return fail(400, 'invalid_score', 'Invalid score value', 'قيمة النتيجة غير صالحة');
  }
  const s = toStoredInt(score, 'score');
  if (!s.ok) return s;
  let w = 1;
  if (typeof wave === 'number' && Number.isFinite(wave)) {
    const x = toStoredInt(wave, 'wave', 1);
    if (!x.ok) return x;
    w = x.value;
  }
  let c = 0;
  if (typeof maxCombo === 'number' && Number.isFinite(maxCombo)) {
    const x = toStoredInt(maxCombo, 'maxCombo');
    if (!x.ok) return x;
    c = x.value;
  }
  return { ok: true, value: { score: s.value, wave: w, maxCombo: c } };
}

/** Friendly JSON for the two body-parser failures (too large, malformed JSON). express.json already enforces the 20 MB byte limit. */
export function bodyParserFailure(err: any): { status: number; code: string; error: string; errorAr: string } | null {
  if (err?.type === 'entity.too.large') {
    return { status: 413, code: 'backup_too_large', error: 'Backup is too large to save', errorAr: 'النسخة الاحتياطية كبيرة جدا للحفظ' };
  }
  if (err?.type === 'entity.parse.failed') {
    return { status: 400, code: 'invalid_json', error: 'Request body is not valid JSON', errorAr: 'بيانات الطلب غير صالحة' };
  }
  return null;
}
