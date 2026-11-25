import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { eq } from 'drizzle-orm';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { db, hasCloudSqlConfig } from './src/db/index.ts';
import { focusGameScores, userTrackers, users } from './src/db/schema.ts';
import { adminAuth } from './src/lib/firebase-admin.ts';
import { getOrCreateUser } from './src/db/users.ts';
import { createRateLimiter } from './src/lib/rateLimit.ts';
import { bodyParserFailure, validateTrackerPayload } from './src/lib/cloudValidation.ts';
import { requireAuth, type AuthenticatedRequest } from './src/middleware/auth.ts';
import {
  getGeminiClient,
  Modality,
  runAudioTranscription,
  runGeminiChat,
} from './src/server/gemini.ts';
import { classifyUpstreamError } from './src/lib/studioHelpers.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    next();
  });
  app.use(express.json({ limit: '20mb' }));
  // Friendly JSON when the existing 20 MB limit is exceeded or the JSON is malformed (was an HTML error page).
  app.use((err: unknown, _req: Request, res: Response, next: (e?: unknown) => void) => {
    const f = bodyParserFailure(err);
    if (!f) return next(err);
    res.status(f.status).json({ code: f.code, error: f.error, errorAr: f.errorAr });
  });

  // Per-user limits on cloud routes. Legitimate use can reach them, so the reply is a clear 429 with Retry-After.
  const cloudWriteLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 30 });
  const perUser = (limiter: ReturnType<typeof createRateLimiter>) =>
    (req: AuthenticatedRequest, res: Response, next: () => void) => {
      const r = limiter.check(req.user!.uid);
      if (!r.allowed) {
        res.setHeader('Retry-After', String(r.retryAfterSec));
        res.status(429).json({
          code: 'rate_limited',
          error: `Too many requests. Please try again in ${r.retryAfterSec} seconds.`,
          errorAr: `طلبات كثيرة. حاول مرة أخرى بعد ${r.retryAfterSec} ثانية.`,
        });
        return;
      }
      next();
    };

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Cloud SQL + Firebase Auth sync endpoints
  app.get(
    '/api/cloud/state',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      if (!hasCloudSqlConfig()) {
        res.status(503).json({ error: 'Cloud storage is not configured on this instance' });
        return;
      }
      try {
        await getOrCreateUser(req.user!);
        const rows = await db
          .select()
          .from(userTrackers)
          .where(eq(userTrackers.userId, req.user!.uid))
          .limit(1);

        if (rows.length === 0) {
          res.json({ synced: false, state: null });
          return;
        }
        const row = rows[0];
        res.json({
          synced: true,
          state: {
            language: row.language,
            dialect: row.dialect,
            userName: row.userName,
            actions: row.actionsJson,
            logs: row.logsJson,
            totalPoints: row.totalPoints,
            updatedAt: row.updatedAt,
          },
        });
      } catch (err) {
        console.error('Failed to read cloud state:', err);
        res.status(500).json({ error: 'Unable to load cloud backup right now' });
      }
    }
  );

  app.put(
    '/api/cloud/state',
    requireAuth,
    perUser(cloudWriteLimiter),
    async (req: AuthenticatedRequest, res: Response) => {
      if (!hasCloudSqlConfig()) {
        res.status(503).json({ error: 'Cloud storage is not configured on this instance' });
        return;
      }
      const checked = validateTrackerPayload(req.body);
      if (!checked.ok) {
        res.status(checked.status).json({ code: checked.code, error: checked.error, errorAr: checked.errorAr });
        return;
      }
      const v = checked.value;

      try {
        await getOrCreateUser(req.user!);
        const [saved] = await db
          .insert(userTrackers)
          .values({
            userId: req.user!.uid,
            language: v.language,
            dialect: v.dialect,
            userName: v.userName,
            actionsJson: v.actions,
            logsJson: v.logs,
            totalPoints: v.totalPoints,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: userTrackers.userId,
            set: {
              language: v.language,
              dialect: v.dialect,
              userName: v.userName,
              actionsJson: v.actions,
              logsJson: v.logs,
              totalPoints: v.totalPoints,
              updatedAt: new Date(),
            },
          })
          .returning();

        res.json({ synced: true, updatedAt: saved.updatedAt });
      } catch (err) {
        console.error('Failed to save cloud state:', err);
        res.status(500).json({ error: 'Unable to save cloud backup right now' });
      }
    }
  );

  // Delete the signed-in user's account and everything stored for it (tracker backup, scores, profile row),
  // then remove the Firebase Auth user. Local data on the device is not touched.
  app.delete(
    '/api/cloud/account',
    requireAuth,
    perUser(cloudWriteLimiter),
    async (req: AuthenticatedRequest, res: Response) => {
      const uid = req.user!.uid;
      try {
        if (hasCloudSqlConfig()) {
          await db.delete(focusGameScores).where(eq(focusGameScores.userId, uid));
          await db.delete(userTrackers).where(eq(userTrackers.userId, uid));
          await db.delete(users).where(eq(users.id, uid));
        }
        await adminAuth.deleteUser(uid);
        res.json({ deleted: true });
      } catch (err) {
        console.error('Failed to delete account:', err);
        res.status(500).json({ error: 'Unable to delete the account right now' });
      }
    }
  );

  // Server-side Gemini AI Routes (sign-in required so the shared free key is not open to anonymous visitors; also rate limited)
  const geminiLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 30 }).middleware;
  // Free-tier Gemini terms do not allow sensitive or personal inputs, so AI forwarding of user
  // text, audio or chat is off in the public build unless GEMINI_PUBLIC_ENABLED=1 is set on purpose.
  const aiPublicGate = (_req: Request, res: Response, next: () => void) => {
    if (process.env.GEMINI_PUBLIC_ENABLED === '1') {
      next();
      return;
    }
    res.status(403).json({ error: 'AI features are turned off in this public build.' });
  };

  app.post('/api/gemini/chat', requireAuth, aiPublicGate, geminiLimiter, async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      model?: string;
      messages?: Array<{ role: 'user' | 'model'; text: string }>;
      systemInstruction?: string;
      grounding?: 'none' | 'search' | 'maps';
      latLng?: { latitude: number; longitude: number } | null;
    };

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json({ error: 'Messages array is required' });
      return;
    }

    const sanitizedMessages = body.messages
      .filter((m) => (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && m.text.trim())
      .slice(-20)
      .map((m) => ({ role: m.role, text: m.text.trim().slice(0, 6000) }));

    if (sanitizedMessages.length === 0) {
      res.status(400).json({ error: 'At least one non-empty message is required' });
      return;
    }

    try {
      const result = await runGeminiChat({
        model: typeof body.model === 'string' ? body.model : 'gemini-4-hydrogen',
        messages: sanitizedMessages,
        systemInstruction: body.systemInstruction,
        grounding: body.grounding,
        latLng: body.latLng,
      });
      res.json(result);
    } catch (err: unknown) {
      const e = err as { status?: number; statusCode?: number; message?: string };
      const status = e.statusCode ?? e.status ?? 500;
      const classified = classifyUpstreamError(status, e.message ?? '');
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: classified.userMessage,
        requiresPaidKey: classified.requiresPaidKey,
        quotaExceeded: classified.quotaExceeded,
      });
    }
  });

  app.post('/api/gemini/transcribe', requireAuth, aiPublicGate, geminiLimiter, async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      base64Audio?: string;
      mimeType?: string;
      languageHint?: string;
    };
    if (typeof body.base64Audio !== 'string' || body.base64Audio.length < 8) {
      res.status(400).json({ error: 'Audio payload is required' });
      return;
    }

    try {
      const result = await runAudioTranscription({
        base64Audio: body.base64Audio,
        mimeType: body.mimeType || 'audio/webm',
        languageHint: body.languageHint,
      });
      res.json(result);
    } catch (err: unknown) {
      const e = err as { status?: number; statusCode?: number; message?: string };
      const status = e.statusCode ?? e.status ?? 500;
      const classified = classifyUpstreamError(status, e.message ?? '');
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: classified.userMessage,
        requiresPaidKey: classified.requiresPaidKey,
        quotaExceeded: classified.quotaExceeded,
      });
    }
  });

  // Paid-tier creative endpoints (explicitly return billing-key guidance unless user configured billing)
  app.post('/api/gemini/creative', requireAuth, aiPublicGate, geminiLimiter, async (_req: Request, res: Response) => {
    res.status(402).json({
      requiresPaidKey: true,
      error:
        'Paid Gemini models (Image, Video, Music, Carbon/Neon) require attaching a billing-enabled API key in AI Studio Settings > Secrets.',
    });
  });

  // Vite dev middleware or static dist serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);

  // Live API WebSocket Bridge (/ws/live)
  const wss = new WebSocketServer({ server, path: '/ws/live' });

  wss.on('connection', async (ws: WebSocket) => {
    if (process.env.GEMINI_PUBLIC_ENABLED !== '1') {
      ws.send(JSON.stringify({ type: 'error', message: 'AI features are turned off in this public build.' }));
      ws.close();
      return;
    }
    const ai = getGeminiClient();
    if (!ai) {
      ws.send(
        JSON.stringify({
          type: 'error',
          message: 'GEMINI_API_KEY is not configured in Settings > Secrets.',
        })
      );
      ws.close();
      return;
    }

    let liveSession: Awaited<ReturnType<typeof ai.live.connect>> | null = null;
    let closed = false;

    try {
      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Zephyr' },
            },
          },
          systemInstruction: {
            parts: [
              {
                text: 'You are Noor, a warm, supportive productivity companion inside Mirror + Ledger. Keep voice replies concise, friendly, and in the language or Arabic dialect the user speaks.',
              },
            ],
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            if (!closed && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ready' }));
            }
          },
          onmessage: (message: unknown) => {
            if (closed || ws.readyState !== WebSocket.OPEN) return;
            const msg = message as {
              serverContent?: {
                interrupted?: boolean;
                turnComplete?: boolean;
                inputTranscription?: { text?: string };
                outputTranscription?: { text?: string };
                modelTurn?: {
                  parts?: Array<{
                    inlineData?: { data?: string; mimeType?: string };
                    text?: string;
                  }>;
                };
              };
            };
            const sc = msg.serverContent;
            if (!sc) return;

            if (sc.interrupted) {
              ws.send(JSON.stringify({ type: 'interrupted' }));
            }
            if (sc.inputTranscription?.text) {
              ws.send(
                JSON.stringify({
                  type: 'input_transcript',
                  text: sc.inputTranscription.text,
                })
              );
            }
            if (sc.outputTranscription?.text) {
              ws.send(
                JSON.stringify({
                  type: 'output_transcript',
                  text: sc.outputTranscription.text,
                })
              );
            }
            if (sc.modelTurn?.parts) {
              for (const part of sc.modelTurn.parts) {
                if (part.inlineData?.data) {
                  ws.send(
                    JSON.stringify({
                      type: 'audio',
                      data: part.inlineData.data,
                      mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000',
                    })
                  );
                }
              }
            }
            if (sc.turnComplete) {
              ws.send(JSON.stringify({ type: 'turn_complete' }));
            }
          },
          onerror: (err: unknown) => {
            if (!closed && ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  message:
                    err instanceof Error ? err.message : 'Live session encountered an error.',
                })
              );
            }
          },
          onclose: () => {
            if (!closed && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'closed' }));
              ws.close();
            }
          },
        },
      });
    } catch (err: unknown) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'error',
            message:
              err instanceof Error ? err.message : 'Could not start Gemini Live session.',
          })
        );
        ws.close();
      }
      return;
    }

    ws.on('message', (raw: Buffer | string) => {
      if (!liveSession || closed) return;
      try {
        const payload = JSON.parse(raw.toString()) as {
          type?: string;
          data?: string;
          text?: string;
        };
        if (payload.type === 'audio' && typeof payload.data === 'string') {
          liveSession.sendRealtimeInput({
            audio: {
              data: payload.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (payload.type === 'text' && typeof payload.text === 'string' && payload.text.trim()) {
          liveSession.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: payload.text.trim() }] }],
            turnComplete: true,
          });
        }
      } catch {
        // Ignore malformed socket frames
      }
    });

    ws.on('close', () => {
      closed = true;
      try {
        liveSession?.close();
      } catch {
        // Ignore close errors
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Mirror + Ledger server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
