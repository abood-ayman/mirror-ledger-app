import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import type { Language } from '../types/tracker';
import {
  applyOrbInteraction,
  computeWaveParameters,
  createInitialSnapshot,
  isCaughtByShield,
  type FocusGameSnapshot,
  type GameOrb,
  type GamePhase,
} from '../lib/focusGameRules';

const BEST_SCORE_STORAGE_KEY = 'mirror_ledger_orbital_best_v1';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

class ArcadeSynth {
  private ctx: AudioContext | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playTone(freq: number, type: OscillatorType, duration: number, gainPeak = 0.14) {
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  catchOrb(combo: number) {
    const pitchBoost = 1 + Math.min(12, combo) * 0.035 + (Math.random() - 0.5) * 0.06;
    this.playTone(460 * pitchBoost, 'sine', 0.14, 0.14);
  }

  deflectEmber() {
    const jitter = 0.94 + Math.random() * 0.12;
    this.playTone(290 * jitter, 'triangle', 0.11, 0.16);
  }

  coreHit() {
    this.playTone(115, 'sawtooth', 0.24, 0.2);
  }

  dispose() {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

interface FocusGameOverlayProps {
  lang: Language;
  autostart?: boolean;
  onClose: () => void;
  onSaveCloudScore?: (snapshot: FocusGameSnapshot) => void;
}

export function FocusGameOverlay({
  lang,
  autostart = false,
  onClose,
  onSaveCloudScore,
}: FocusGameOverlayProps) {
  const isAr = lang === 'ar';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const synthRef = useRef<ArcadeSynth | null>(null);
  if (!synthRef.current) synthRef.current = new ArcadeSynth();

  const initialBest = (() => {
    try {
      const saved = Number(window.localStorage.getItem(BEST_SCORE_STORAGE_KEY) || '0');
      return Number.isFinite(saved) ? saved : 0;
    } catch {
      return 0;
    }
  })();

  const [hud, setHud] = useState<FocusGameSnapshot>(() => ({
    ...createInitialSnapshot(initialBest),
    phase: autostart ? 'playing' : 'title',
  }));
  const [muted, setMuted] = useState(false);

  const simRef = useRef<{
    snapshot: FocusGameSnapshot;
    paddleAngle: number;
    targetAngle: number | null;
    orbs: GameOrb[];
    particles: Particle[];
    nextOrbId: number;
    spawnTimer: number;
    trauma: number;
    hitstop: number;
    coreFlash: number;
    keys: Set<string>;
  }>({
    snapshot: {
      ...createInitialSnapshot(initialBest),
      phase: autostart ? 'playing' : 'title',
    },
    paddleAngle: -Math.PI / 2,
    targetAngle: null,
    orbs: [],
    particles: Array.from({ length: 64 }, () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      color: '#00B8A9',
      size: 3,
    })),
    nextOrbId: 1,
    spawnTimer: 0.6,
    trauma: 0,
    hitstop: 0,
    coreFlash: 0,
    keys: new Set<string>(),
  });

  const particleCursorRef = useRef(0);
  const onSaveCloudRef = useRef(onSaveCloudScore);
  onSaveCloudRef.current = onSaveCloudScore;

  const syncBodyState = useCallback((phase: GamePhase) => {
    document.body.dataset.state = phase;
  }, []);

  useEffect(() => {
    syncBodyState(hud.phase);
    return () => {
      delete document.body.dataset.state;
    };
  }, [hud.phase, syncBodyState]);

  const spawnParticleBurst = (
    x: number,
    y: number,
    color: string,
    count: number,
    speed = 160
  ) => {
    const pool = simRef.current.particles;
    for (let i = 0; i < count; i++) {
      const p = pool[particleCursorRef.current % pool.length];
      particleCursorRef.current += 1;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.maxLife = 0.28 + Math.random() * 0.25;
      p.life = p.maxLife;
      p.color = color;
      p.size = 2 + Math.random() * 3;
    }
  };

  const startFreshRun = useCallback(() => {
    const currentBest = simRef.current.snapshot.bestScore;
    const fresh: FocusGameSnapshot = {
      ...createInitialSnapshot(currentBest),
      phase: 'playing',
    };
    simRef.current.snapshot = fresh;
    simRef.current.orbs = [];
    simRef.current.spawnTimer = 0.45;
    simRef.current.trauma = 0;
    simRef.current.hitstop = 0;
    simRef.current.coreFlash = 0;
    simRef.current.paddleAngle = -Math.PI / 2;
    simRef.current.targetAngle = null;
    simRef.current.keys.clear();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    syncBodyState('playing');
    setHud(fresh);
  }, [syncBodyState]);

  const togglePause = useCallback(() => {
    const cur = simRef.current.snapshot.phase;
    if (cur === 'playing') {
      simRef.current.snapshot = { ...simRef.current.snapshot, phase: 'paused' };
      simRef.current.keys.clear();
      syncBodyState('paused');
      setHud({ ...simRef.current.snapshot });
    } else if (cur === 'paused') {
      simRef.current.snapshot = { ...simRef.current.snapshot, phase: 'playing' };
      syncBodyState('playing');
      setHud({ ...simRef.current.snapshot });
    }
  }, [syncBodyState]);

  // Global keyboard & focus-loss hygiene
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const phase = simRef.current.snapshot.phase;
      if (phase === 'title' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        startFreshRun();
        return;
      }
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (phase === 'playing' || phase === 'paused') {
          e.preventDefault();
          togglePause();
          return;
        }
      }
      if (e.key === 'm' || e.key === 'M') {
        setMuted((prev) => {
          const next = !prev;
          if (synthRef.current) synthRef.current.muted = next;
          return next;
        });
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'a' || e.key === 'A' || e.key === 'd' || e.key === 'D') {
        simRef.current.targetAngle = null;
        simRef.current.keys.add(e.key);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      simRef.current.keys.delete(e.key);
    };

    const clearInputs = () => {
      simRef.current.keys.clear();
      simRef.current.targetAngle = null;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInputs);
    document.addEventListener('visibilitychange', clearInputs);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInputs);
      document.removeEventListener('visibilitychange', clearInputs);
    };
  }, [startFreshRun, togglePause]);

  // 60Hz Canvas Simulation Loop decoupled from React
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.clientWidth || window.innerWidth;
    let height = canvas.clientHeight || window.innerHeight;
    const applySize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth || window.innerWidth;
      height = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    applySize();

    const ro = new ResizeObserver(applySize);
    ro.observe(canvas);

    let rafId = 0;
    let lastTime = performance.now();
    let hudSyncAccum = 0;

    const tick = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      const sim = simRef.current;
      const snap = sim.snapshot;
      const cx = width / 2;
      const cy = height / 2;
      const arenaRadius = Math.min(width, height) * 0.44;
      const ringRadius = Math.max(82, Math.min(138, arenaRadius * 0.42));

      // Update particles & trauma even during hitstop/title
      sim.trauma = Math.max(0, sim.trauma - dt * 1.8);
      sim.coreFlash = Math.max(0, sim.coreFlash - dt * 3.5);
      for (const p of sim.particles) {
        if (p.life > 0) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.94;
          p.vy *= 0.94;
          p.life -= dt;
        }
      }

      if (snap.phase === 'playing') {
        if (sim.hitstop > 0) {
          sim.hitstop -= dt;
        } else {
          const waveParams = computeWaveParameters(snap.elapsedSeconds);
          let nextSnap: FocusGameSnapshot = {
            ...snap,
            elapsedSeconds: snap.elapsedSeconds + dt,
            wave: waveParams.wave,
          };

          // Keyboard rotation
          const rotSpeed = 3.9;
          if (sim.keys.has('ArrowLeft') || sim.keys.has('a') || sim.keys.has('A')) {
            sim.paddleAngle -= rotSpeed * dt;
          }
          if (sim.keys.has('ArrowRight') || sim.keys.has('d') || sim.keys.has('D')) {
            sim.paddleAngle += rotSpeed * dt;
          }
          if (sim.targetAngle !== null) {
            let diff = (sim.targetAngle - sim.paddleAngle) % (Math.PI * 2);
            if (diff > Math.PI) diff -= Math.PI * 2;
            if (diff < -Math.PI) diff += Math.PI * 2;
            sim.paddleAngle += diff * (1 - Math.exp(-16 * dt));
          }

          // Spawn orbs
          sim.spawnTimer -= dt;
          if (sim.spawnTimer <= 0) {
            sim.spawnTimer = waveParams.spawnInterval;
            const r = Math.random();
            const kind =
              r < waveParams.emberRatio
                ? 'ember'
                : r > 0.92
                ? 'focus_star'
                : 'clarity';
            sim.orbs.push({
              id: sim.nextOrbId++,
              kind,
              angle: Math.random() * Math.PI * 2,
              radius: Math.max(width, height) * 0.52,
              speed: waveParams.baseSpeed * (0.92 + Math.random() * 0.2),
              size: kind === 'focus_star' ? 12 : kind === 'ember' ? 11 : 10,
              active: true,
            });
          }

          // Step orbs
          let immediateHudSync = false;
          for (const orb of sim.orbs) {
            if (!orb.active) continue;
            orb.radius -= orb.speed * dt;
            if (orb.radius <= ringRadius + 10) {
              const ox = cx + Math.cos(orb.angle) * ringRadius;
              const oy = cy + Math.sin(orb.angle) * ringRadius;
              const caught = isCaughtByShield(
                orb.angle,
                sim.paddleAngle,
                waveParams.paddleArc
              );

              if (caught) {
                orb.active = false;
                const result = applyOrbInteraction(nextSnap, orb.kind, true);
                nextSnap = result.next;
                immediateHudSync = true;
                if (result.event === 'deflect_ember') {
                  synthRef.current?.deflectEmber();
                  spawnParticleBurst(ox, oy, '#FF6B35', 14, 210);
                } else {
                  synthRef.current?.catchOrb(nextSnap.combo);
                  spawnParticleBurst(
                    ox,
                    oy,
                    orb.kind === 'focus_star' ? '#F59E0B' : '#00B8A9',
                    14,
                    190
                  );
                }
              } else if (orb.radius <= 30) {
                orb.active = false;
                const result = applyOrbInteraction(nextSnap, orb.kind, false);
                nextSnap = result.next;
                immediateHudSync = true;
                if (result.event === 'core_hit') {
                  synthRef.current?.coreHit();
                  sim.trauma = Math.min(1, sim.trauma + 0.55);
                  sim.hitstop = 0.055;
                  sim.coreFlash = 1;
                  spawnParticleBurst(cx, cy, '#FF6B35', 22, 240);
                  if (nextSnap.phase === 'gameover') {
                    try {
                      window.localStorage.setItem(
                        BEST_SCORE_STORAGE_KEY,
                        String(nextSnap.bestScore)
                      );
                    } catch {
                      // Ignore storage issues
                    }
                    onSaveCloudRef.current?.(nextSnap);
                    syncBodyState('gameover');
                  }
                }
              }
            }
          }
          sim.orbs = sim.orbs.filter((o) => o.active);
          sim.snapshot = nextSnap;

          hudSyncAccum += dt;
          if (immediateHudSync || hudSyncAccum >= 0.12) {
            hudSyncAccum = 0;
            setHud(nextSnap);
          }
        }
      }

      // Render Canvas2D Scene
      const shakeMag = sim.trauma * sim.trauma * 12;
      const sx = (Math.random() - 0.5) * shakeMag;
      const sy = (Math.random() - 0.5) * shakeMag;

      ctx.save();
      ctx.fillStyle = '#0A0E14';
      ctx.fillRect(0, 0, width, height);
      ctx.translate(sx, sy);

      // Subtle concentric sanctuary guide rings
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (const mul of [1.65, 2.4, 3.2]) {
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius * mul * 0.55, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Shield Track Ring
      ctx.strokeStyle = 'rgba(0, 184, 169, 0.22)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Core Lantern Emblem
      ctx.fillStyle = sim.coreFlash > 0.1 ? '#FF6B35' : '#121923';
      ctx.strokeStyle = sim.coreFlash > 0.1 ? '#FFB385' : '#00B8A9';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#00B8A9';
      ctx.beginPath();
      ctx.arc(cx, cy, 10 + Math.sin(now * 0.005) * 2, 0, Math.PI * 2);
      ctx.fill();

      // Shield Arc Paddle
      const waveParams = computeWaveParameters(snap.elapsedSeconds);
      const halfArc = waveParams.paddleArc * 0.5;
      ctx.strokeStyle = '#00B8A9';
      ctx.lineCap = 'round';
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.arc(
        cx,
        cy,
        ringRadius,
        sim.paddleAngle - halfArc,
        sim.paddleAngle + halfArc
      );
      ctx.stroke();

      // Orbs
      for (const orb of sim.orbs) {
        const ox = cx + Math.cos(orb.angle) * orb.radius;
        const oy = cy + Math.sin(orb.angle) * orb.radius;

        if (orb.kind === 'ember') {
          ctx.fillStyle = '#FF6B35';
          ctx.strokeStyle = '#0F0F0F';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(ox, oy - orb.size);
          ctx.lineTo(ox + orb.size, oy);
          ctx.lineTo(ox, oy + orb.size);
          ctx.lineTo(ox - orb.size, oy);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (orb.kind === 'focus_star') {
          ctx.fillStyle = '#F59E0B';
          ctx.beginPath();
          ctx.arc(ox, oy, orb.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = '#00E0CE';
          ctx.strokeStyle = '#0F0F0F';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(ox, oy, orb.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      // Pooled particles
      for (const p of sim.particles) {
        if (p.life <= 0) continue;
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [syncBodyState]);

  useEffect(() => {
    return () => {
      synthRef.current?.dispose();
    };
  }, []);

  const handlePointerAim = (clientX: number, clientY: number) => {
    if (simRef.current.snapshot.phase !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    simRef.current.targetAngle = Math.atan2(dy, dx);
  };

  return (
    <div
      data-testid="focus-game-shell"
      className="fixed inset-0 z-50 bg-[#0A0E14] select-none overflow-hidden"
    >
      {/* Full-viewport Playfield Canvas */}
      <canvas
        ref={canvasRef}
        data-testid="focus-game-canvas"
        onPointerDown={(e) => handlePointerAim(e.clientX, e.clientY)}
        onPointerMove={(e) => {
          if (e.buttons > 0 || e.pointerType === 'mouse') {
            handlePointerAim(e.clientX, e.clientY);
          }
        }}
        className="w-full h-full block touch-none"
      />

      {/* Playing HUD (Pointer-pass-through, zero backdrop-filter) */}
      {hud.phase === 'playing' && (
        <div className="pointer-events-none fixed inset-0 p-4 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-4">
            {/* Score + Wave + Shield Sockets */}
            <div className="flex items-center gap-4 bg-[#121923]/92 border border-[#2A2A2A] rounded-2xl px-4 py-2.5">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#A1A1AA]">
                  {isAr ? 'النقاط' : 'SCORE'}
                </div>
                <div className="text-2xl font-extrabold text-[#00B8A9] tabular-nums leading-none">
                  {Math.round(hud.score)}
                </div>
              </div>

              <div className="h-8 w-px bg-[#2A2A2A]" />

              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#A1A1AA]">
                  {isAr ? 'الموجة' : 'WAVE'}
                </div>
                <div className="text-lg font-extrabold text-white tabular-nums leading-none">
                  {hud.wave}
                </div>
              </div>

              <div className="h-8 w-px bg-[#2A2A2A]" />

              <div className="flex items-center gap-1.5" aria-label="Shields">
                {Array.from({ length: hud.maxShields }).map((_, idx) => {
                  const full = idx < hud.shields;
                  return (
                    <svg
                      key={idx}
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      aria-hidden="true"
                    >
                      <path
                        d="M12 2L4 5.5v6.2c0 5 3.4 9.6 8 10.8 4.6-1.2 8-5.8 8-10.8V5.5L12 2z"
                        fill={full ? '#00B8A9' : '#1F2937'}
                        stroke="#0F0F0F"
                        strokeWidth="1.5"
                      />
                    </svg>
                  );
                })}
              </div>
            </div>

            {/* Compact Top-Right Action Controls */}
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  setMuted((prev) => {
                    const next = !prev;
                    if (synthRef.current) synthRef.current.muted = next;
                    return next;
                  });
                }}
                aria-label="Mute sound [M]"
                className="w-10 h-10 rounded-xl bg-[#121923]/92 border border-[#2A2A2A] hover:border-[#00B8A9] text-white flex items-center justify-center"
              >
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  togglePause();
                }}
                aria-label="Pause game [P]"
                className="w-10 h-10 rounded-xl bg-[#121923]/92 border border-[#2A2A2A] hover:border-[#00B8A9] text-white flex items-center justify-center"
              >
                <Pause size={16} />
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={onClose}
                aria-label="Exit game"
                className="w-10 h-10 rounded-xl bg-[#121923]/92 border border-[#2A2A2A] hover:border-[#FF6B35] text-[#FF6B35] flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {hud.combo > 1 && (
            <div className="self-center bg-[#121923]/90 border border-[#00B8A9]/50 rounded-full px-3.5 py-1 text-xs font-extrabold text-[#00B8A9] tabular-nums">
              ×{hud.combo} {isAr ? 'سلسلة' : 'COMBO'}
            </div>
          )}
        </div>
      )}

      {/* Title Screen Overlay */}
      {hud.phase === 'title' && (
        <div className="fixed inset-0 bg-[#0A0E14]/88 flex flex-col items-center justify-between p-6">
          <div className="self-end">
            <button
              type="button"
              onClick={onClose}
              aria-label={isAr ? 'العودة للتطبيق' : 'Back to app'}
              className="w-11 h-11 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] text-white flex items-center justify-center hover:border-[#FF6B35]"
            >
              <X size={18} />
            </button>
          </div>

          <div className="max-w-[440px] w-full text-center space-y-6">
            {/* Custom SVG Emblem Lockup */}
            <svg
              viewBox="0 0 120 120"
              width="96"
              height="96"
              className="mx-auto"
              aria-hidden="true"
            >
              <circle
                cx="60"
                cy="60"
                r="46"
                fill="none"
                stroke="#00B8A9"
                strokeWidth="5"
                strokeDasharray="95 195"
                strokeLinecap="round"
              />
              <circle
                cx="60"
                cy="60"
                r="30"
                fill="#121923"
                stroke="#2A2A2A"
                strokeWidth="2"
              />
              <circle cx="60" cy="60" r="11" fill="#00B8A9" />
              <polygon points="60,8 66,18 54,18" fill="#FF6B35" />
            </svg>

            <div className="space-y-2">
              <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
                {isAr ? 'توازن التركيز' : 'ORBITAL BALANCE'}
              </h1>
              <div className="text-sm font-bold text-[#00B8A9] tabular-nums">
                {isAr ? `أعلى نتيجة: ${hud.bestScore}` : `BEST SCORE: ${hud.bestScore}`}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                data-start="true"
                onClick={startFreshRun}
                className="px-8 py-4 rounded-full bg-[#00B8A9] text-[#0F0F0F] font-extrabold text-base inline-flex items-center justify-center gap-2 min-h-[50px]"
              >
                <Play size={18} />
                <span>{isAr ? 'ابدأ اللعب' : 'Start Focus Run'}</span>
              </button>
            </div>
          </div>

          {/* Flat Single-Line Control Hint */}
          <div className="text-xs font-bold text-[#A1A1AA] text-center">
            {isAr
              ? '← → أو A / D للتحريك · الماوس أو اللمس للدوران · P إيقاف · M كتم الصوت'
              : '← → / A D Rotate · Mouse/Touch Aim · P Pause · M Mute'}
          </div>
        </div>
      )}

      {/* Paused / Game Over Modal Card */}
      {(hud.phase === 'paused' || hud.phase === 'gameover') && (
        <div className="fixed inset-0 bg-[#0A0E14]/88 flex items-center justify-center p-4">
          <div className="w-full max-w-[380px] bg-[#1A1A1A] border border-[#2A2A2A] rounded-[24px] p-6 text-center space-y-5">
            <h2 className="text-2xl font-extrabold text-white">
              {hud.phase === 'paused'
                ? isAr
                  ? 'اللعبة متوقفة'
                  : 'PAUSED'
                : isAr
                ? 'انتهت الجولة'
                : 'RUN COMPLETE'}
            </h2>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-[#0F0F0F] border border-[#2A2A2A] rounded-2xl p-3">
                <div className="text-[10px] font-bold text-[#A1A1AA]">
                  {isAr ? 'النقاط' : 'SCORE'}
                </div>
                <div className="text-lg font-extrabold text-[#00B8A9] tabular-nums">
                  {hud.score}
                </div>
              </div>
              <div className="bg-[#0F0F0F] border border-[#2A2A2A] rounded-2xl p-3">
                <div className="text-[10px] font-bold text-[#A1A1AA]">
                  {isAr ? 'الأعلى' : 'BEST'}
                </div>
                <div className="text-lg font-extrabold text-white tabular-nums">
                  {hud.bestScore}
                </div>
              </div>
              <div className="bg-[#0F0F0F] border border-[#2A2A2A] rounded-2xl p-3">
                <div className="text-[10px] font-bold text-[#A1A1AA]">
                  {isAr ? 'أقصى سلسلة' : 'COMBO'}
                </div>
                <div className="text-lg font-extrabold text-[#FF6B35] tabular-nums">
                  ×{hud.maxCombo}
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              {hud.phase === 'paused' ? (
                <button
                  type="button"
                  onClick={togglePause}
                  className="w-full py-3.5 rounded-full bg-[#00B8A9] text-[#0F0F0F] font-extrabold text-sm inline-flex items-center justify-center gap-2 min-h-[46px]"
                >
                  <Play size={16} />
                  <span>{isAr ? 'متابعة' : 'Resume'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  data-start="true"
                  onClick={startFreshRun}
                  className="w-full py-3.5 rounded-full bg-[#00B8A9] text-[#0F0F0F] font-extrabold text-sm inline-flex items-center justify-center gap-2 min-h-[46px]"
                >
                  <RotateCcw size={16} />
                  <span>{isAr ? 'العب مرة أخرى' : 'Play Again'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={startFreshRun}
                className="w-full py-3 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] text-white font-bold text-xs min-h-[44px]"
              >
                {isAr ? 'إعادة من البداية' : 'Restart Run'}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] text-[#A1A1AA] hover:text-white font-bold text-xs min-h-[44px]"
              >
                {isAr ? 'رجوع للاستوديو' : 'Exit to Studio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
