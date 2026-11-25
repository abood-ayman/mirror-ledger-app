import type { AmbientSoundMode, AmbientSoundSettings } from '../types/tracker';

export const AMBIENT_MODES: AmbientSoundMode[] = ['rain', 'lofi', 'purr', 'quiet'];

export const DEFAULT_AMBIENT_SOUND: AmbientSoundSettings = {
  enabled: false,
  mode: 'rain',
  volume: 0.45,
};

export interface AmbientModeMeta {
  id: AmbientSoundMode;
  accent: string;
}

export const AMBIENT_MODE_META: Record<AmbientSoundMode, AmbientModeMeta> = {
  rain: { id: 'rain', accent: '#00B8A9' },
  lofi: { id: 'lofi', accent: '#A855F7' },
  purr: { id: 'purr', accent: '#FF6B35' },
  quiet: { id: 'quiet', accent: '#71717A' },
};

export function isValidAmbientMode(value: unknown): value is AmbientSoundMode {
  return value === 'quiet' || value === 'rain' || value === 'lofi' || value === 'purr';
}

export function clampVolume(value: unknown, fallback = DEFAULT_AMBIENT_SOUND.volume): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(1, Math.round(num * 100) / 100));
}

export function normalizeAmbientSettings(
  raw?: Partial<AmbientSoundSettings> | null
): AmbientSoundSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_AMBIENT_SOUND };
  }
  const mode: AmbientSoundMode = isValidAmbientMode(raw.mode)
    ? raw.mode
    : DEFAULT_AMBIENT_SOUND.mode;
  const enabled = Boolean(raw.enabled) && mode !== 'quiet';
  const volume = clampVolume(raw.volume, DEFAULT_AMBIENT_SOUND.volume);
  return { enabled, mode, volume };
}

export function toggleAmbientEnabled(current: AmbientSoundSettings): AmbientSoundSettings {
  const normalized = normalizeAmbientSettings(current);
  if (normalized.enabled) {
    return { ...normalized, enabled: false };
  }
  const nextMode: AmbientSoundMode = normalized.mode === 'quiet' ? 'rain' : normalized.mode;
  return {
    ...normalized,
    enabled: true,
    mode: nextMode,
    volume: normalized.volume <= 0 ? DEFAULT_AMBIENT_SOUND.volume : normalized.volume,
  };
}

export function selectAmbientMode(
  current: AmbientSoundSettings,
  mode: AmbientSoundMode
): AmbientSoundSettings {
  const normalized = normalizeAmbientSettings(current);
  if (mode === 'quiet') {
    return {
      ...normalized,
      enabled: false,
      mode: 'quiet',
    };
  }
  return {
    ...normalized,
    enabled: true,
    mode,
    volume: normalized.volume <= 0 ? DEFAULT_AMBIENT_SOUND.volume : normalized.volume,
  };
}

interface ActivePlaybackCleanup {
  stop: () => void;
}

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

function createPinkNoiseBuffer(ctx: AudioContext, seconds = 3): AudioBuffer {
  const sampleRate = ctx.sampleRate || 44100;
  const length = Math.max(1, Math.floor(sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const output = buffer.getChannelData(0);

  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;

  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.045;
    b6 = white * 0.115926;
    output[i] = Math.max(-0.95, Math.min(0.95, pink));
  }

  // Smooth loop crossfade at edges (~40ms) to avoid clicks
  const fadeSamples = Math.min(Math.floor(sampleRate * 0.04), Math.floor(length / 4));
  for (let i = 0; i < fadeSamples; i++) {
    const t = i / fadeSamples;
    const tailIdx = length - fadeSamples + i;
    const blended = output[i] * t + output[tailIdx] * (1 - t);
    output[i] = blended;
    output[tailIdx] = blended;
  }

  return buffer;
}

export class AmbientAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeCleanup: ActivePlaybackCleanup | null = null;
  private currentSettings: AmbientSoundSettings = { ...DEFAULT_AMBIENT_SOUND };
  private unlockBound = false;

  isSupported(): boolean {
    return getAudioContextConstructor() !== null;
  }

  getSettings(): AmbientSoundSettings {
    return { ...this.currentSettings };
  }

  private bindGestureUnlock(): void {
    if (this.unlockBound || typeof window === 'undefined') return;
    this.unlockBound = true;
    const unlock = () => {
      this.unlockBound = false;
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      if (this.currentSettings.enabled && this.currentSettings.mode !== 'quiet') {
        this.applySettings(this.currentSettings);
      }
    };
    window.addEventListener('pointerdown', unlock, { capture: true, once: true });
    window.addEventListener('keydown', unlock, { capture: true, once: true });
  }

  private canStartAudioNow(): boolean {
    if (typeof navigator !== 'undefined') {
      const ua = (navigator as unknown as { userActivation?: { hasBeenActive?: boolean } })
        .userActivation;
      if (ua && ua.hasBeenActive === false) {
        return false;
      }
    }
    return true;
  }

  private ensureContext(): boolean {
    if (!this.canStartAudioNow() && !this.ctx) {
      this.bindGestureUnlock();
      return false;
    }
    if (this.ctx && this.masterGain) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
        if (!this.canStartAudioNow()) {
          this.bindGestureUnlock();
          return false;
        }
      }
      return true;
    }
    const Ctor = getAudioContextConstructor();
    if (!Ctor) return false;
    try {
      const ctx = new Ctor();
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      masterGain.connect(ctx.destination);
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      this.ctx = ctx;
      this.masterGain = masterGain;
      return true;
    } catch {
      this.ctx = null;
      this.masterGain = null;
      return false;
    }
  }

  private stopActiveNodes(): void {
    if (this.activeCleanup) {
      try {
        this.activeCleanup.stop();
      } catch {
        // Ignore teardown issues in restricted contexts
      }
      this.activeCleanup = null;
    }
  }

  private startRain(ctx: AudioContext, dest: GainNode): ActivePlaybackCleanup {
    const noiseBuffer = createPinkNoiseBuffer(ctx, 4);

    // Mid-band rain shimmer
    const rainSource = ctx.createBufferSource();
    rainSource.buffer = noiseBuffer;
    rainSource.loop = true;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(1050, ctx.currentTime);
    bandpass.Q.setValueAtTime(0.55, ctx.currentTime);

    const rainGain = ctx.createGain();
    rainGain.gain.setValueAtTime(0.42, ctx.currentTime);

    // Warm steady base shower
    const bodySource = ctx.createBufferSource();
    bodySource.buffer = noiseBuffer;
    bodySource.loop = true;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(420, ctx.currentTime);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.35, ctx.currentTime);

    // Gentle swell LFO
    const swellLfo = ctx.createOscillator();
    swellLfo.type = 'sine';
    swellLfo.frequency.setValueAtTime(0.16, ctx.currentTime);
    const swellDepth = ctx.createGain();
    swellDepth.gain.setValueAtTime(0.09, ctx.currentTime);
    swellLfo.connect(swellDepth);
    swellDepth.connect(rainGain.gain);

    rainSource.connect(bandpass);
    bandpass.connect(rainGain);
    rainGain.connect(dest);

    bodySource.connect(lowpass);
    lowpass.connect(bodyGain);
    bodyGain.connect(dest);

    rainSource.start();
    bodySource.start();
    swellLfo.start();

    return {
      stop: () => {
        try { rainSource.stop(); } catch {}
        try { bodySource.stop(); } catch {}
        try { swellLfo.stop(); } catch {}
        rainSource.disconnect();
        bodySource.disconnect();
        swellLfo.disconnect();
        rainGain.disconnect();
        bodyGain.disconnect();
      },
    };
  }

  private startLofi(ctx: AudioContext, dest: GainNode): ActivePlaybackCleanup {
    const vinylBuffer = createPinkNoiseBuffer(ctx, 3);
    const vinylSource = ctx.createBufferSource();
    vinylSource.buffer = vinylBuffer;
    vinylSource.loop = true;

    const vinylFilter = ctx.createBiquadFilter();
    vinylFilter.type = 'bandpass';
    vinylFilter.frequency.setValueAtTime(1900, ctx.currentTime);
    vinylFilter.Q.setValueAtTime(1.1, ctx.currentTime);

    const vinylGain = ctx.createGain();
    vinylGain.gain.setValueAtTime(0.032, ctx.currentTime);

    vinylSource.connect(vinylFilter);
    vinylFilter.connect(vinylGain);
    vinylGain.connect(dest);
    vinylSource.start();

    // Warm filtered chord bus
    const chordFilter = ctx.createBiquadFilter();
    chordFilter.type = 'lowpass';
    chordFilter.frequency.setValueAtTime(760, ctx.currentTime);

    const chordBus = ctx.createGain();
    chordBus.gain.setValueAtTime(0.28, ctx.currentTime);
    chordFilter.connect(chordBus);
    chordBus.connect(dest);

    // Relaxed maj7 / m7 progression (Fmaj7 -> Em7 -> Dm7 -> Cmaj7)
    const progression: number[][] = [
      [174.61, 220.0, 261.63, 329.63],
      [164.81, 196.0, 246.94, 293.66],
      [146.83, 174.61, 220.0, 261.63],
      [130.81, 164.81, 196.0, 246.94],
    ];
    let step = 0;
    let disposed = false;

    const triggerChord = () => {
      if (disposed) return;
      const chord = progression[step % progression.length];
      step += 1;
      const now = ctx.currentTime;
      const dur = 2.75;

      chord.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now);
        // Slight warm detune
        osc.detune.setValueAtTime((idx - 1.5) * 3.5, now);

        const noteGain = ctx.createGain();
        noteGain.gain.setValueAtTime(0.0001, now);
        noteGain.gain.linearRampToValueAtTime(0.09, now + 0.35);
        noteGain.gain.exponentialRampToValueAtTime(0.035, now + dur - 0.3);
        noteGain.gain.linearRampToValueAtTime(0.0001, now + dur);

        osc.connect(noteGain);
        noteGain.connect(chordFilter);
        osc.start(now);
        osc.stop(now + dur + 0.05);
      });
    };

    triggerChord();
    const intervalId =
      typeof window !== 'undefined' ? window.setInterval(triggerChord, 2650) : null;

    return {
      stop: () => {
        disposed = true;
        if (intervalId !== null && typeof window !== 'undefined') {
          window.clearInterval(intervalId);
        }
        try { vinylSource.stop(); } catch {}
        vinylSource.disconnect();
        vinylGain.disconnect();
        chordBus.disconnect();
      },
    };
  }

  private startPurr(ctx: AudioContext, dest: GainNode): ActivePlaybackCleanup {
    // Cozy dual-harmonic cat purr (~26Hz fundamental + ~52Hz warmth)
    const fundamental = ctx.createOscillator();
    fundamental.type = 'triangle';
    fundamental.frequency.setValueAtTime(26, ctx.currentTime);

    const harmonic = ctx.createOscillator();
    harmonic.type = 'sine';
    harmonic.frequency.setValueAtTime(52, ctx.currentTime);

    const harmonicGain = ctx.createGain();
    harmonicGain.gain.setValueAtTime(0.45, ctx.currentTime);

    const warmthFilter = ctx.createBiquadFilter();
    warmthFilter.type = 'lowpass';
    warmthFilter.frequency.setValueAtTime(145, ctx.currentTime);

    const purrGain = ctx.createGain();
    purrGain.gain.setValueAtTime(0.28, ctx.currentTime);

    // Breathing rhythm LFO (~0.28Hz = ~3.5s cozy purr cycle)
    const breathLfo = ctx.createOscillator();
    breathLfo.type = 'sine';
    breathLfo.frequency.setValueAtTime(0.28, ctx.currentTime);

    const breathDepth = ctx.createGain();
    breathDepth.gain.setValueAtTime(0.18, ctx.currentTime);

    breathLfo.connect(breathDepth);
    breathDepth.connect(purrGain.gain);

    fundamental.connect(warmthFilter);
    harmonic.connect(harmonicGain);
    harmonicGain.connect(warmthFilter);
    warmthFilter.connect(purrGain);
    purrGain.connect(dest);

    fundamental.start();
    harmonic.start();
    breathLfo.start();

    return {
      stop: () => {
        try { fundamental.stop(); } catch {}
        try { harmonic.stop(); } catch {}
        try { breathLfo.stop(); } catch {}
        fundamental.disconnect();
        harmonic.disconnect();
        breathLfo.disconnect();
        purrGain.disconnect();
      },
    };
  }

  applySettings(rawSettings?: Partial<AmbientSoundSettings> | null): AmbientSoundSettings {
    const next = normalizeAmbientSettings(rawSettings);
    const prev = this.currentSettings;
    this.currentSettings = next;

    const shouldPlay = next.enabled && next.mode !== 'quiet';
    if (!shouldPlay) {
      if (this.masterGain && this.ctx) {
        try {
          this.masterGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
        } catch {}
      }
      this.stopActiveNodes();
      return next;
    }

    if (!this.ensureContext() || !this.ctx || !this.masterGain) {
      return next;
    }

    const modeChanged = prev.mode !== next.mode || !this.activeCleanup;
    if (modeChanged) {
      this.stopActiveNodes();
      if (next.mode === 'rain') {
        this.activeCleanup = this.startRain(this.ctx, this.masterGain);
      } else if (next.mode === 'lofi') {
        this.activeCleanup = this.startLofi(this.ctx, this.masterGain);
      } else if (next.mode === 'purr') {
        this.activeCleanup = this.startPurr(this.ctx, this.masterGain);
      }
    }

    try {
      const targetGain = Math.max(0.0001, next.volume * 0.85);
      this.masterGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.08);
    } catch {}

    return next;
  }

  dispose(): void {
    this.stopActiveNodes();
    if (this.ctx) {
      try {
        this.ctx.close().catch(() => {});
      } catch {}
      this.ctx = null;
      this.masterGain = null;
    }
    this.currentSettings = { ...DEFAULT_AMBIENT_SOUND };
  }
}

export const ambientAudioEngine = new AmbientAudioEngine();
