export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export type OrbKind = 'clarity' | 'ember' | 'focus_star';

export interface GameOrb {
  id: number;
  kind: OrbKind;
  angle: number; // Radians around sanctuary core
  radius: number; // Distance from center (0 = core impact)
  speed: number; // Radial speed inward
  size: number;
  active: boolean;
}

export interface FocusGameSnapshot {
  phase: GamePhase;
  score: number;
  bestScore: number;
  shields: number;
  maxShields: number;
  combo: number;
  maxCombo: number;
  wave: number;
  elapsedSeconds: number;
  caughtCount: number;
  deflectedCount: number;
}

export interface GameSimConfig {
  paddleAngle: number; // Radians
  paddleArc: number; // Width in radians
  ringRadius: number; // Defense orbit radius
  coreRadius: number; // Center core radius
  shieldPulseTimer: number;
}

export function normalizeAngleDiff(a: number, b: number): number {
  let diff = (a - b) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export function createInitialSnapshot(bestScore = 0): FocusGameSnapshot {
  return {
    phase: 'title',
    score: 0,
    bestScore,
    shields: 3,
    maxShields: 3,
    combo: 0,
    maxCombo: 0,
    wave: 1,
    elapsedSeconds: 0,
    caughtCount: 0,
    deflectedCount: 0,
  };
}

export function computeWaveParameters(elapsedSeconds: number): {
  wave: number;
  spawnInterval: number;
  baseSpeed: number;
  emberRatio: number;
  paddleArc: number;
} {
  const wave = Math.max(1, Math.floor(elapsedSeconds / 15) + 1);
  const spawnInterval = Math.max(0.42, 1.35 - (wave - 1) * 0.11);
  const baseSpeed = Math.min(265, 115 + (wave - 1) * 18);
  const emberRatio = Math.min(0.55, 0.24 + (wave - 1) * 0.045);
  const paddleArc = Math.max(0.82, 1.15 - (wave - 1) * 0.03);
  return { wave, spawnInterval, baseSpeed, emberRatio, paddleArc };
}

export function isCaughtByShield(
  orbAngle: number,
  paddleAngle: number,
  paddleArc: number
): boolean {
  return Math.abs(normalizeAngleDiff(orbAngle, paddleAngle)) <= paddleArc * 0.56;
}

export function applyOrbInteraction(
  snapshot: FocusGameSnapshot,
  kind: OrbKind,
  interceptedByShield: boolean
): {
  next: FocusGameSnapshot;
  event: 'catch_clarity' | 'catch_star' | 'deflect_ember' | 'core_hit' | 'missed_clarity';
} {
  if (kind === 'ember') {
    if (interceptedByShield) {
      const nextCombo = snapshot.combo + 1;
      const bonus = 15 + Math.min(30, nextCombo * 2);
      const nextScore = snapshot.score + bonus;
      return {
        next: {
          ...snapshot,
          score: nextScore,
          bestScore: Math.max(snapshot.bestScore, nextScore),
          combo: nextCombo,
          maxCombo: Math.max(snapshot.maxCombo, nextCombo),
          deflectedCount: snapshot.deflectedCount + 1,
        },
        event: 'deflect_ember',
      };
    }
    const nextShields = Math.max(0, snapshot.shields - 1);
    return {
      next: {
        ...snapshot,
        shields: nextShields,
        combo: 0,
        phase: nextShields <= 0 ? 'gameover' : snapshot.phase,
      },
      event: 'core_hit',
    };
  }

  // Clarity orb or bonus focus star
  if (interceptedByShield) {
    const nextCombo = snapshot.combo + 1;
    const basePoints = kind === 'focus_star' ? 40 : 20;
    const nextScore = snapshot.score + basePoints + Math.min(40, nextCombo * 3);
    const healedShield =
      kind === 'focus_star'
        ? Math.min(snapshot.maxShields, snapshot.shields + 1)
        : snapshot.shields;
    return {
      next: {
        ...snapshot,
        score: nextScore,
        bestScore: Math.max(snapshot.bestScore, nextScore),
        combo: nextCombo,
        maxCombo: Math.max(snapshot.maxCombo, nextCombo),
        shields: healedShield,
        caughtCount: snapshot.caughtCount + 1,
      },
      event: kind === 'focus_star' ? 'catch_star' : 'catch_clarity',
    };
  }

  return {
    next: {
      ...snapshot,
      combo: 0,
    },
    event: 'missed_clarity',
  };
}
