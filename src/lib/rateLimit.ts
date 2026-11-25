import type { NextFunction, Request, Response } from 'express';

/** Small in-memory fixed-window limiter. Protects the Gemini quota from anonymous abuse. */
export function createRateLimiter(opts: { windowMs: number; max: number; now?: () => number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const now = opts.now ?? Date.now;
  function check(key: string): { allowed: boolean; retryAfterSec: number } {
    const t = now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      hits.set(key, { count: 1, resetAt: t + opts.windowMs });
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
      }
      return { allowed: true, retryAfterSec: 0 };
    }
    entry.count += 1;
    if (entry.count > opts.max) {
      return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - t) / 1000) };
    }
    return { allowed: true, retryAfterSec: 0 };
  }
  function middleware(req: Request, res: Response, next: NextFunction): void {
    const result = check(req.ip || 'unknown');
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSec));
      res.status(429).json({ error: 'Too many requests. Please try again later.' });
      return;
    }
    next();
  }
  return { check, middleware };
}
