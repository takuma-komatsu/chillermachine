import {
  ambientMelodyEvent,
  bassFifthNote,
  bassNote,
  chordNotes,
  makeComposition,
  nextSeed,
  sectionEnergy,
  textureEvent,
  type AmbientVariant,
  type Composition,
} from './composition';
import { arrangementStep } from './arrangement';

export type TrackInfo = { title: string; style: string; key: string; bpm: number; seed: number; ambientVariant: AmbientVariant };
export type PlayerSnapshot = {
  status: 'idle' | 'playing' | 'paused' | 'error';
  track: TrackInfo;
  volume: number;
  error?: string;
};

type TrackSession = {
  composition: Composition;
  gain: GainNode;
  chords: BiquadFilterNode;
  chordPan: StereoPannerNode;
  melody: BiquadFilterNode;
  melodyPan: StereoPannerNode;
  texture: BiquadFilterNode;
  textureTone: BiquadFilterNode;
  texturePan: StereoPannerNode;
  bass: BiquadFilterNode;
  drums: GainNode;
  roomHighpass: BiquadFilterNode;
  roomLowpass: BiquadFilterNode;
  roomTaps: Array<{ delay: DelayNode; gain: GainNode; pan: StereoPannerNode }>;
  reverb: ConvolverNode;
  reverbGain: GainNode;
  echoDelay: DelayNode;
  echoTone: BiquadFilterNode;
  echoGain: GainNode;
  echoFeedback: GainNode;
  echoPan: StereoPannerNode;
  sources: Map<AudioScheduledSourceNode, () => void>;
  step: number;
  nextTime: number;
  retireAt?: number;
};

const SCHEDULE_INTERVAL_MS = 25;
const LOOKAHEAD_SECONDS = 0.22;
const CROSSFADE_SECONDS = 1;
const STEPS_PER_BAR = 16;
const NOISE_BED_LEVEL = 0.85;

type Timbre = 'sine' | 'triangle' | 'warm' | 'air' | 'flute' | 'reed' | 'hollow' | 'glass' | 'bell' | 'pluck' | 'mallet' | 'shimmer';
type Layer = readonly [Timbre, number, number];
type NoteEnvelope = 'sustain' | 'pluck' | 'bell';
type AmbientSound = {
  chordCutoff: number;
  melodyCutoff: number;
  bassCutoff: number;
  drumLevel: number;
  noiseCutoff: number;
  noiseLevel: number;
  textureHighpass: number;
  textureCutoff: number;
  roomCutoff: number;
  roomTimes: readonly [number, number];
  roomLevels: readonly [number, number];
  chordLayers: readonly [Layer, Layer];
  chordLevel: number;
  chordAttack: number;
  chordDecay: boolean;
  melodyType: Timbre;
  melodyEnvelope: NoteEnvelope;
  melodyLevel: number;
  melodyAttack: number;
  melodyHarmonic?: readonly [ratio: number, level: number];
  textureType: Timbre;
  textureLevel: number;
  textureAttack: number;
  bassType: OscillatorType;
  bassLevel: number;
};

// One harmonic recipe per instrument family. PeriodicWave normalizes the
// peak of each recipe before it reaches the per-voice envelope.
const HARMONICS: Partial<Record<Timbre, readonly number[]>> = {
  warm: [1, 0.24, 0.1, 0.04],
  air: [1, 0.09, 0.2, 0.035, 0.08],
  flute: [1, 0.06, 0.035, 0.018],
  reed: [1, 0.56, 0.39, 0.27, 0.16, 0.09],
  hollow: [1, 0.025, 0.43, 0.015, 0.21, 0.01, 0.08],
  glass: [1, 0.08, 0.32, 0.035, 0.18, 0.02, 0.1],
  bell: [1, 0.21, 0.04, 0.19, 0.035, 0.11, 0.015, 0.07],
  pluck: [1, 0.5, 0.31, 0.19, 0.11, 0.06],
  mallet: [1, 0.18, 0.065, 0.1, 0.035],
  shimmer: [1, 0.11, 0.37, 0.04, 0.2, 0.02, 0.14, 0.015, 0.08],
};

// Each scene has a small but distinct instrument palette. The fixed room taps
// keep the graph bounded even as tracks change or play for hours.
const AMBIENT_SOUND: Record<AmbientVariant, AmbientSound> = {
  'Cloud Drift': { chordCutoff: 1550, melodyCutoff: 1650, bassCutoff: 420, drumLevel: 0.32, noiseCutoff: 2100, noiseLevel: 0.004, textureHighpass: 470, textureCutoff: 1650, roomCutoff: 1900, roomTimes: [0.23, 0.39], roomLevels: [0.14, 0.1], chordLayers: [['warm', -6, 0.72], ['air', 6, 0.32]], chordLevel: 0.038, chordAttack: 0.32, chordDecay: false, melodyType: 'flute', melodyEnvelope: 'sustain', melodyLevel: 0.024, melodyAttack: 0.1, textureType: 'air', textureLevel: 0.033, textureAttack: 0.11, bassType: 'sine', bassLevel: 0.12 },
  'Rain Window': { chordCutoff: 2200, melodyCutoff: 2050, bassCutoff: 470, drumLevel: 0.26, noiseCutoff: 3000, noiseLevel: 0.007, textureHighpass: 650, textureCutoff: 2500, roomCutoff: 2400, roomTimes: [0.17, 0.34], roomLevels: [0.11, 0.08], chordLayers: [['pluck', -4, 0.58], ['glass', 5, 0.34]], chordLevel: 0.034, chordAttack: 0.018, chordDecay: true, melodyType: 'pluck', melodyEnvelope: 'pluck', melodyLevel: 0.022, melodyAttack: 0.009, textureType: 'glass', textureLevel: 0.027, textureAttack: 0.035, bassType: 'sine', bassLevel: 0.105 },
  'Dawn Haze': { chordCutoff: 1200, melodyCutoff: 1850, bassCutoff: 380, drumLevel: 0, noiseCutoff: 3800, noiseLevel: 0.003, textureHighpass: 520, textureCutoff: 2600, roomCutoff: 1700, roomTimes: [0.29, 0.46], roomLevels: [0.16, 0.11], chordLayers: [['flute', -8, 0.84], ['warm', 7, 0.16]], chordLevel: 0.033, chordAttack: 0.65, chordDecay: false, melodyType: 'flute', melodyEnvelope: 'sustain', melodyLevel: 0.019, melodyAttack: 0.22, textureType: 'warm', textureLevel: 0.025, textureAttack: 0.13, bassType: 'sine', bassLevel: 0.1 },
  'Blue Hour': { chordCutoff: 1400, melodyCutoff: 2400, bassCutoff: 400, drumLevel: 0, noiseCutoff: 1900, noiseLevel: 0.003, textureHighpass: 840, textureCutoff: 3100, roomCutoff: 2100, roomTimes: [0.28, 0.43], roomLevels: [0.17, 0.12], chordLayers: [['hollow', -7, 0.56], ['reed', 9, 0.3]], chordLevel: 0.034, chordAttack: 0.42, chordDecay: false, melodyType: 'reed', melodyEnvelope: 'sustain', melodyLevel: 0.018, melodyAttack: 0.16, textureType: 'hollow', textureLevel: 0.024, textureAttack: 0.07, bassType: 'sine', bassLevel: 0.095 },
  'Starlit Memory': { chordCutoff: 1750, melodyCutoff: 3200, bassCutoff: 430, drumLevel: 0, noiseCutoff: 3400, noiseLevel: 0.002, textureHighpass: 1100, textureCutoff: 3900, roomCutoff: 2800, roomTimes: [0.21, 0.41], roomLevels: [0.16, 0.13], chordLayers: [['shimmer', -11, 0.62], ['glass', 11, 0.24]], chordLevel: 0.032, chordAttack: 0.39, chordDecay: false, melodyType: 'bell', melodyEnvelope: 'bell', melodyLevel: 0.021, melodyAttack: 0.01, melodyHarmonic: [2.01, 0.19], textureType: 'shimmer', textureLevel: 0.021, textureAttack: 0.018, bassType: 'sine', bassLevel: 0.085 },
  'Velvet Tide': { chordCutoff: 1050, melodyCutoff: 1350, bassCutoff: 350, drumLevel: 0, noiseCutoff: 1450, noiseLevel: 0.003, textureHighpass: 390, textureCutoff: 1300, roomCutoff: 1450, roomTimes: [0.31, 0.48], roomLevels: [0.18, 0.12], chordLayers: [['warm', -5, 0.82], ['hollow', 5, 0.16]], chordLevel: 0.041, chordAttack: 0.8, chordDecay: false, melodyType: 'hollow', melodyEnvelope: 'sustain', melodyLevel: 0.017, melodyAttack: 0.29, textureType: 'warm', textureLevel: 0.027, textureAttack: 0.21, bassType: 'sine', bassLevel: 0.105 },
  'Faded Polaroid': { chordCutoff: 1500, melodyCutoff: 1650, bassCutoff: 390, drumLevel: 0, noiseCutoff: 1650, noiseLevel: 0.006, textureHighpass: 600, textureCutoff: 1800, roomCutoff: 1750, roomTimes: [0.16, 0.31], roomLevels: [0.12, 0.09], chordLayers: [['pluck', -3, 0.62], ['mallet', 4, 0.33]], chordLevel: 0.035, chordAttack: 0.015, chordDecay: true, melodyType: 'mallet', melodyEnvelope: 'pluck', melodyLevel: 0.019, melodyAttack: 0.012, textureType: 'pluck', textureLevel: 0.024, textureAttack: 0.045, bassType: 'triangle', bassLevel: 0.079 },
  'Midnight Bloom': { chordCutoff: 1250, melodyCutoff: 2150, bassCutoff: 360, drumLevel: 0, noiseCutoff: 1200, noiseLevel: 0.002, textureHighpass: 740, textureCutoff: 2200, roomCutoff: 1600, roomTimes: [0.27, 0.45], roomLevels: [0.18, 0.11], chordLayers: [['hollow', -9, 0.74], ['warm', 7, 0.22]], chordLevel: 0.037, chordAttack: 0.56, chordDecay: false, melodyType: 'reed', melodyEnvelope: 'sustain', melodyLevel: 0.018, melodyAttack: 0.12, textureType: 'flute', textureLevel: 0.024, textureAttack: 0.15, bassType: 'sine', bassLevel: 0.095 },
  'Glass Garden': { chordCutoff: 2400, melodyCutoff: 3500, bassCutoff: 470, drumLevel: 0, noiseCutoff: 3200, noiseLevel: 0.002, textureHighpass: 1250, textureCutoff: 4300, roomCutoff: 2900, roomTimes: [0.19, 0.37], roomLevels: [0.14, 0.11], chordLayers: [['glass', -3, 0.52], ['bell', 3, 0.29]], chordLevel: 0.03, chordAttack: 0.025, chordDecay: true, melodyType: 'bell', melodyEnvelope: 'bell', melodyLevel: 0.017, melodyAttack: 0.008, melodyHarmonic: [2.72, 0.21], textureType: 'glass', textureLevel: 0.018, textureAttack: 0.012, bassType: 'sine', bassLevel: 0.075 },
  'Winter Light': { chordCutoff: 1850, melodyCutoff: 2650, bassCutoff: 385, drumLevel: 0, noiseCutoff: 2300, noiseLevel: 0.002, textureHighpass: 1000, textureCutoff: 3100, roomCutoff: 2250, roomTimes: [0.24, 0.44], roomLevels: [0.16, 0.12], chordLayers: [['air', -2, 0.74], ['flute', 3, 0.19]], chordLevel: 0.032, chordAttack: 0.51, chordDecay: false, melodyType: 'flute', melodyEnvelope: 'sustain', melodyLevel: 0.017, melodyAttack: 0.18, textureType: 'glass', textureLevel: 0.021, textureAttack: 0.1, bassType: 'sine', bassLevel: 0.08 },
  'Slow Orbit': { chordCutoff: 1100, melodyCutoff: 1900, bassCutoff: 355, drumLevel: 0, noiseCutoff: 1000, noiseLevel: 0.002, textureHighpass: 540, textureCutoff: 2050, roomCutoff: 1500, roomTimes: [0.33, 0.49], roomLevels: [0.16, 0.11], chordLayers: [['hollow', -12, 0.43], ['air', 12, 0.49]], chordLevel: 0.035, chordAttack: 0.73, chordDecay: false, melodyType: 'hollow', melodyEnvelope: 'sustain', melodyLevel: 0.019, melodyAttack: 0.24, textureType: 'shimmer', textureLevel: 0.019, textureAttack: 0.19, bassType: 'sine', bassLevel: 0.09 },
  'Golden Echo': { chordCutoff: 2050, melodyCutoff: 2750, bassCutoff: 445, drumLevel: 0, noiseCutoff: 2450, noiseLevel: 0.003, textureHighpass: 960, textureCutoff: 3250, roomCutoff: 2550, roomTimes: [0.22, 0.4], roomLevels: [0.18, 0.13], chordLayers: [['mallet', -4, 0.57], ['warm', 6, 0.32]], chordLevel: 0.033, chordAttack: 0.04, chordDecay: true, melodyType: 'mallet', melodyEnvelope: 'pluck', melodyLevel: 0.019, melodyAttack: 0.014, melodyHarmonic: [2, 0.14], textureType: 'bell', textureLevel: 0.022, textureAttack: 0.045, bassType: 'sine', bassLevel: 0.086 },
};

// Three independent beds make the noise feel less like one static loop. Values
// stay quiet beside the instruments, but remain audible in sparse passages.
const NOISE_PROFILE: Record<AmbientVariant, { hiss: number; rain: number; rainCutoff: number; crackle: number }> = {
  'Cloud Drift': { hiss: 2.4, rain: 0.009, rainCutoff: 1250, crackle: 0.002 },
  'Rain Window': { hiss: 2.1, rain: 0.026, rainCutoff: 2900, crackle: 0.007 },
  'Dawn Haze': { hiss: 2.7, rain: 0.007, rainCutoff: 1700, crackle: 0.002 },
  'Blue Hour': { hiss: 3, rain: 0.012, rainCutoff: 1500, crackle: 0.003 },
  'Starlit Memory': { hiss: 3.6, rain: 0.005, rainCutoff: 2400, crackle: 0.006 },
  'Velvet Tide': { hiss: 3.1, rain: 0.014, rainCutoff: 950, crackle: 0.002 },
  'Faded Polaroid': { hiss: 2.8, rain: 0.01, rainCutoff: 1800, crackle: 0.012 },
  'Midnight Bloom': { hiss: 3.5, rain: 0.009, rainCutoff: 1050, crackle: 0.004 },
  'Glass Garden': { hiss: 3.2, rain: 0.006, rainCutoff: 3100, crackle: 0.007 },
  'Winter Light': { hiss: 3.4, rain: 0.01, rainCutoff: 2100, crackle: 0.003 },
  'Slow Orbit': { hiss: 3.8, rain: 0.016, rainCutoff: 900, crackle: 0.002 },
  'Golden Echo': { hiss: 3, rain: 0.008, rainCutoff: 2300, crackle: 0.009 },
};

function ambientVariant(composition: Composition): AmbientVariant {
  return composition.ambientVariant;
}

function midiFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function firstSeed(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

function createNoiseBuffer(context: AudioContext): AudioBuffer {
  const length = Math.floor(context.sampleRate * 2);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let state = 0x6d2b79f5;
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    samples[i] = (state / 0x80000000 - 1) * 0.85;
  }
  return buffer;
}

function createRainBuffer(context: AudioContext): AudioBuffer {
  const length = Math.floor(context.sampleRate * 13.7);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let state = 0x4a3b2c1d;
  let droplet = 0;
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const random = state / 0x100000000;
    if (random < 0.0007) droplet = 0.5 + random * 400;
    droplet *= 0.998;
    const t = i / context.sampleRate;
    const swell = 0.35 + 0.2 * Math.sin(t * 0.71) + 0.16 * Math.sin(t * 1.37 + 1.2);
    const edge = Math.min(1, i / (context.sampleRate * 0.04), (length - i) / (context.sampleRate * 0.04));
    samples[i] = (random * 2 - 1) * (swell + droplet) * Math.max(0, edge);
  }
  return buffer;
}

function createCrackleBuffer(context: AudioContext): AudioBuffer {
  const length = Math.floor(context.sampleRate * 17.3);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let state = 0x71342a9f;
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    if (state / 0x100000000 >= 0.00013) continue;
    const amplitude = (state & 1 ? 1 : -1) * (0.3 + ((state >>> 8) & 255) / 365);
    for (let n = 0; n < 80 && i + n < length; n++) {
      samples[i + n] += amplitude * Math.exp(-n / 13) * Math.sin(n * 0.43);
    }
  }
  return buffer;
}

// A short, dark stereo tail. Its fixed seed and duration keep both the sound
// and memory use predictable across skips; the two channels decorrelate gently.
function createReverbImpulse(context: AudioContext): AudioBuffer {
  const length = Math.floor(context.sampleRate * 1.45);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  let state = 0x2847a9bd;
  for (let channel = 0; channel < 2; channel++) {
    const samples = buffer.getChannelData(channel);
    let dark = 0;
    for (let i = 0; i < length; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const time = i / context.sampleRate;
      dark += ((state / 0x80000000 - 1) - dark) * 0.23;
      // Keep the wet path near 18% of a broadband dry signal at the usual
      // room level; the sample-rate factor makes its energy rate-independent.
      samples[i] = time < 0.012 ? 0 : 9.6 * dark * Math.exp(-time * 3.2) / Math.sqrt(context.sampleRate);
    }
  }
  return buffer;
}

/** A self-contained procedural Ambient player. Call dispose when leaving the page. */
export class ChillerEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private tapeTone: BiquadFilterNode | null = null;
  private tapeDrive: WaveShaperNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private noise: AudioBuffer | null = null;
  private rain: AudioBuffer | null = null;
  private crackle: AudioBuffer | null = null;
  private reverbImpulse: AudioBuffer | null = null;
  private waves = new Map<Timbre, PeriodicWave>();
  private sessions: TrackSession[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(snapshot: PlayerSnapshot) => void>();
  private operation: Promise<void> = Promise.resolve();
  private disposed = false;
  private composition = makeComposition(firstSeed());
  private status: PlayerSnapshot['status'] = 'idle';
  private volume = 0.72;
  private error?: string;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  getSnapshot(): PlayerSnapshot {
    const { title, style, key, bpm, seed, ambientVariant } = this.composition;
    return {
      status: this.status,
      track: { title, style, key, bpm, seed, ambientVariant },
      volume: this.volume,
      ...(this.error ? { error: this.error } : {}),
    };
  }

  subscribe(listener: (snapshot: PlayerSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  play(): Promise<void> {
    if (this.disposed || this.status === 'playing') return Promise.resolve();
    // Begin resume in the click handler's activation window (not a later microtask).
    let resume: Promise<void>;
    try {
      resume = this.ensureContext().resume();
    } catch (error) {
      this.fail(error);
      return Promise.resolve();
    }
    return this.enqueue(async () => {
      if (this.disposed || this.status === 'playing') return;
      try {
        const context = this.context!;
        await resume;
        // A queued pause may have suspended the context after the first resume.
        if (context.state === 'suspended') await context.resume();
        if (this.disposed) return;
        const now = context.currentTime;
        if (this.sessions.length === 0) {
          this.sessions.push(this.createSession(this.composition, now + 0.05, 1));
        }
        const master = this.master!;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(0, now);
        master.gain.linearRampToValueAtTime(this.volume, now + 0.06);
        this.error = undefined;
        this.status = 'playing';
        this.emit();
        this.startScheduler();
      } catch (error) {
        this.fail(error);
      }
    });
  }

  pause(): Promise<void> {
    return this.enqueue(async () => {
      if (this.disposed || this.status !== 'playing' || !this.context || !this.master) return;
      this.stopScheduler();
      this.status = 'paused';
      this.emit();
      const context = this.context;
      const now = context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.045);
      await new Promise<void>((resolve) => setTimeout(resolve, 55));
      if (!this.disposed) {
        try {
          await context.suspend();
        } catch (error) {
          this.fail(error);
        }
      }
    });
  }

  next(): Promise<void> {
    return this.enqueue(async () => {
      if (this.disposed) return;
      this.composition = makeComposition(nextSeed(this.composition.seed));
      this.error = undefined;
      if (this.status === 'error') this.status = 'idle';
      if (this.status === 'playing' && this.context) {
        const now = this.context.currentTime;
        // Keep at most two live arrangements even under rapid repeated skips.
        for (const session of [...this.sessions]) {
          if (session.retireAt !== undefined) this.stopSession(session);
        }
        const outgoing = this.sessions[this.sessions.length - 1];
        if (outgoing) {
          outgoing.gain.gain.cancelScheduledValues(now);
          outgoing.gain.gain.setValueAtTime(outgoing.gain.gain.value, now);
          outgoing.gain.gain.linearRampToValueAtTime(0, now + CROSSFADE_SECONDS);
          outgoing.retireAt = now + CROSSFADE_SECONDS + 0.05;
        }
        const incoming = this.createSession(this.composition, now + 0.05, 0);
        incoming.gain.gain.setValueAtTime(0, now);
        incoming.gain.gain.linearRampToValueAtTime(1, now + CROSSFADE_SECONDS);
        this.sessions.push(incoming);
        this.tick();
      } else {
        for (const session of [...this.sessions]) this.stopSession(session);
      }
      this.emit();
    });
  }

  setVolume(value: number): void {
    if (this.disposed || !Number.isFinite(value)) return;
    this.volume = clampVolume(value);
    if (this.context && this.master && this.status === 'playing') {
      this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.035);
    }
    this.emit();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopScheduler();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    for (const session of [...this.sessions]) this.stopSession(session);
    this.master?.disconnect();
    this.master = null;
    this.tapeTone?.disconnect();
    this.tapeTone = null;
    this.tapeDrive?.disconnect();
    this.tapeDrive = null;
    this.limiter?.disconnect();
    this.limiter = null;
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
    this.noise = null;
    this.rain = null;
    this.crackle = null;
    this.reverbImpulse = null;
    this.waves.clear();
    this.listeners.clear();
  }

  private enqueue(action: () => Promise<void>): Promise<void> {
    const result = this.operation.then(action);
    this.operation = result.catch(() => {});
    return result;
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private fail(error: unknown): void {
    if (this.disposed) return;
    this.stopScheduler();
    for (const session of [...this.sessions]) this.stopSession(session);
    if (this.context && this.master) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(0, now);
    }
    this.status = 'error';
    this.error = error instanceof Error ? error.message : 'Audio playback is unavailable.';
    this.emit();
  }

  private ensureContext(): AudioContext {
    if (this.context) return this.context;
    if (typeof AudioContext === 'undefined') throw new Error('This browser does not support Web Audio.');
    const context = new AudioContext({ latencyHint: 'interactive' });
    const master = context.createGain();
    master.gain.value = 0;
    const tapeTone = context.createBiquadFilter();
    tapeTone.type = 'lowpass';
    tapeTone.frequency.value = 4500;
    tapeTone.Q.value = 0.5;
    const tapeDrive = context.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const input = i / (curve.length - 1) * 2 - 1;
      curve[i] = Math.tanh(input * 2.2) / 2.2;
    }
    tapeDrive.curve = curve;
    tapeDrive.oversample = '2x';
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 18;
    limiter.ratio.value = 3;
    limiter.attack.value = 0.01;
    limiter.release.value = 0.25;
    master.connect(tapeTone).connect(tapeDrive).connect(limiter).connect(context.destination);
    this.context = context;
    this.master = master;
    this.tapeTone = tapeTone;
    this.tapeDrive = tapeDrive;
    this.limiter = limiter;
    this.noise = createNoiseBuffer(context);
    this.rain = createRainBuffer(context);
    this.crackle = createCrackleBuffer(context);
    this.reverbImpulse = createReverbImpulse(context);
    return context;
  }

  private setTimbre(osc: OscillatorNode, timbre: Timbre): void {
    const harmonics = HARMONICS[timbre];
    if (!harmonics) {
      osc.type = timbre as OscillatorType;
      return;
    }
    let wave = this.waves.get(timbre);
    if (!wave) {
      const real = new Float32Array(harmonics.length + 1);
      const imag = new Float32Array(harmonics.length + 1);
      harmonics.forEach((amplitude, index) => { imag[index + 1] = amplitude; });
      wave = this.context!.createPeriodicWave(real, imag);
      this.waves.set(timbre, wave);
    }
    osc.setPeriodicWave(wave);
  }

  private createSession(composition: Composition, startTime: number, initialGain: number): TrackSession {
    const context = this.context!;
    const sound = AMBIENT_SOUND[ambientVariant(composition)];
    const gain = context.createGain();
    gain.gain.value = initialGain;
    gain.connect(this.master!);
    const chords = context.createBiquadFilter();
    chords.type = 'lowpass';
    chords.frequency.value = sound.chordCutoff;
    chords.Q.value = 0.55;
    const chordPan = context.createStereoPanner();
    chordPan.pan.value = -0.18;
    chords.connect(chordPan).connect(gain);
    const melody = context.createBiquadFilter();
    melody.type = 'lowpass';
    melody.frequency.value = sound.melodyCutoff;
    melody.Q.value = 0.55;
    const melodyPan = context.createStereoPanner();
    melodyPan.pan.value = 0.16;
    melody.connect(melodyPan).connect(gain);
    // Keep the added counterline above the chord bed and off the lead's center.
    const texture = context.createBiquadFilter();
    texture.type = 'highpass';
    texture.frequency.value = sound.textureHighpass;
    const textureTone = context.createBiquadFilter();
    textureTone.type = 'lowpass';
    textureTone.frequency.value = sound.textureCutoff;
    const texturePan = context.createStereoPanner();
    texturePan.pan.value = -0.38;
    texture.connect(textureTone).connect(texturePan).connect(gain);
    // Two filtered, non-feedback reflections add space without an accumulating tail.
    // Their fixed graph is shared by keys, melody, and counterline for each track.
    const roomHighpass = context.createBiquadFilter();
    roomHighpass.type = 'highpass';
    roomHighpass.frequency.value = 340;
    const roomLowpass = context.createBiquadFilter();
    roomLowpass.type = 'lowpass';
    roomLowpass.frequency.value = sound.roomCutoff;
    roomHighpass.connect(roomLowpass);
    chords.connect(roomHighpass);
    melody.connect(roomHighpass);
    textureTone.connect(roomHighpass);
    const roomTaps = sound.roomTimes.map((time, index) => {
      const level = sound.roomLevels[index];
      const pan = index === 0 ? -0.68 : 0.68;
      const delay = context.createDelay(0.5);
      delay.delayTime.value = time;
      const tapGain = context.createGain();
      tapGain.gain.value = level;
      const tapPan = context.createStereoPanner();
      tapPan.pan.value = pan;
      roomLowpass.connect(delay).connect(tapGain).connect(tapPan).connect(gain);
      return { delay, gain: tapGain, pan: tapPan };
    });
    const reverb = context.createConvolver();
    reverb.normalize = false;
    reverb.buffer = this.reverbImpulse;
    const reverbGain = context.createGain();
    reverbGain.gain.value = sound.roomLevels[0] + 0.1;
    roomLowpass.connect(reverb).connect(reverbGain).connect(gain);
    // Only the lead repeats. Low-passed feedback recedes with each repeat,
    // while the session gain owns the full tail during crossfades and pause.
    const echoDelay = context.createDelay(0.8);
    echoDelay.delayTime.value = Math.min(0.75, sound.roomTimes[1] * 1.5);
    const echoTone = context.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = Math.min(sound.roomCutoff, 1900);
    const echoGain = context.createGain();
    echoGain.gain.value = sound.roomLevels[1] * 1.35;
    const echoFeedback = context.createGain();
    echoFeedback.gain.value = 0.22;
    const echoPan = context.createStereoPanner();
    echoPan.pan.value = -0.42;
    melody.connect(echoDelay).connect(echoTone);
    echoTone.connect(echoGain).connect(echoPan).connect(gain);
    echoTone.connect(echoFeedback).connect(echoDelay);
    const bass = context.createBiquadFilter();
    bass.type = 'lowpass';
    bass.frequency.value = sound.bassCutoff;
    bass.connect(gain);
    const drums = context.createGain();
    drums.gain.value = sound.drumLevel;
    drums.connect(gain);
    const session: TrackSession = {
      composition, gain, chords, chordPan, melody, melodyPan,
      texture, textureTone, texturePan, bass, drums, roomHighpass, roomLowpass, roomTaps,
      reverb, reverbGain, echoDelay, echoTone, echoGain, echoFeedback, echoPan,
      sources: new Map(), step: 0, nextTime: startTime,
    };
    this.startHiss(session, startTime);
    return session;
  }

  private startHiss(session: TrackSession, startTime: number): void {
    const context = this.context!;
    const sound = AMBIENT_SOUND[ambientVariant(session.composition)];
    const profile = NOISE_PROFILE[ambientVariant(session.composition)];
    const beds = [
      { buffer: this.noise, level: sound.noiseLevel * profile.hiss, cutoff: sound.noiseCutoff, highpass: 550 },
      { buffer: this.rain, level: profile.rain, cutoff: profile.rainCutoff, highpass: 160 },
      { buffer: this.crackle, level: profile.crackle, cutoff: 3400, highpass: 900 },
    ];
    for (const bed of beds) {
      const source = context.createBufferSource();
      source.buffer = bed.buffer;
      source.loop = true;
      const highpass = context.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = bed.highpass;
      const lowpass = context.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = bed.cutoff;
      const gain = context.createGain();
      gain.gain.value = bed.level * NOISE_BED_LEVEL;
      source.connect(highpass).connect(lowpass).connect(gain).connect(session.gain);
      this.trackSource(session, source, () => {
        highpass.disconnect();
        lowpass.disconnect();
        gain.disconnect();
      });
      source.start(startTime);
    }
  }

  private trackSource(session: TrackSession, source: AudioScheduledSourceNode, cleanup: () => void): void {
    session.sources.set(source, cleanup);
    source.onended = () => {
      session.sources.delete(source);
      source.disconnect();
      cleanup();
    };
  }

  private stopSession(session: TrackSession): void {
    for (const [source, cleanup] of session.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* already ended */ }
      source.disconnect();
      cleanup();
    }
    session.sources.clear();
    session.chords.disconnect();
    session.chordPan.disconnect();
    session.melody.disconnect();
    session.melodyPan.disconnect();
    session.texture.disconnect();
    session.textureTone.disconnect();
    session.texturePan.disconnect();
    session.bass.disconnect();
    session.drums.disconnect();
    session.roomHighpass.disconnect();
    session.roomLowpass.disconnect();
    for (const tap of session.roomTaps) {
      tap.delay.disconnect();
      tap.gain.disconnect();
      tap.pan.disconnect();
    }
    session.reverb.disconnect();
    session.reverbGain.disconnect();
    session.echoDelay.disconnect();
    session.echoTone.disconnect();
    session.echoGain.disconnect();
    session.echoFeedback.disconnect();
    session.echoPan.disconnect();
    session.gain.disconnect();
    this.sessions = this.sessions.filter((item) => item !== session);
  }

  private startScheduler(): void {
    this.stopScheduler();
    this.tick();
    this.timer = setInterval(() => this.tick(), SCHEDULE_INTERVAL_MS);
  }

  private stopScheduler(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    if (this.disposed || this.status !== 'playing' || !this.context) return;
    const now = this.context.currentTime;
    for (const session of [...this.sessions]) {
      if (session.retireAt !== undefined && now >= session.retireAt) {
        this.stopSession(session);
        continue;
      }
      const stepDuration = 60 / session.composition.bpm / 4;
      if (session.nextTime < now - stepDuration) {
        // Background timer throttling can leave the queue far in the past.
        session.nextTime = now + 0.05;
      }
      while (session.nextTime < now + LOOKAHEAD_SECONDS) {
        if (session.retireAt === undefined || session.nextTime < session.retireAt) {
          this.scheduleStep(session, session.step, session.nextTime);
        }
        session.step++;
        session.nextTime += stepDuration;
      }
    }
  }

  private scheduleStep(session: TrackSession, step: number, time: number): void {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const position = step % STEPS_PER_BAR;
    const composition = session.composition;
    const arrangement = arrangementStep(composition, bar, position);
    const energy = sectionEnergy(composition, bar) * arrangement.energy;
    const beat = 60 / composition.bpm;
    const lyrical = composition.leadStyle === 'lyrical';
    if (arrangement.chord) this.playChord(session, chordNotes(composition, bar), time,
      beat * arrangement.chord.beats, energy * arrangement.chord.strength * (lyrical ? .75 : 1));
    if (arrangement.bass) {
      const note = arrangement.bass.tone === 'root'
        ? bassNote(composition, bar, position) : bassFifthNote(composition, bar);
      this.playBass(session, note, time, beat * arrangement.bass.beats, energy * arrangement.bass.strength);
    }
    if (arrangement.kick) this.playKick(session, time, energy * arrangement.kick);
    const event = ambientMelodyEvent(composition, bar, position);
    if (event && arrangement.leadLevel > 0) this.playMelody(session, event.note,
      time + event.offset, event.duration,
      energy * arrangement.leadLevel * (lyrical ? 1.5 : 1) * event.strength);
    const texture = textureEvent(composition, bar, position);
    if (texture) this.playTexture(session, texture.note, time + texture.offset, texture.duration,
      energy * arrangement.textureLevel * (lyrical ? .7 : 1) * texture.strength);
  }

  private playTexture(session: TrackSession, note: number, at: number, duration: number, energy: number): void {
    const context = this.context!;
    const sound = AMBIENT_SOUND[ambientVariant(session.composition)];
    const osc = context.createOscillator();
    this.setTimbre(osc, sound.textureType);
    osc.frequency.value = midiFrequency(note);
    const envelope = context.createGain();
    const attack = Math.min(duration * 0.35, sound.textureAttack);
    const releaseStart = at + Math.max(attack, duration - 0.2);
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(sound.textureLevel * energy, at + attack);
    const textureDecay = sound.textureType === 'pluck' || sound.textureType === 'bell' || sound.textureType === 'glass';
    envelope.gain.linearRampToValueAtTime(sound.textureLevel * (textureDecay ? 0.24 : 0.82) * energy, releaseStart);
    envelope.gain.linearRampToValueAtTime(0, at + duration);
    osc.connect(envelope).connect(session.texture);
    this.trackSource(session, osc, () => envelope.disconnect());
    osc.start(at);
    osc.stop(at + duration + 0.015);
  }

  private playChord(session: TrackSession, notes: number[], at: number, duration: number, energy: number): void {
    const context = this.context!;
    const sound = AMBIENT_SOUND[ambientVariant(session.composition)];
    for (const note of notes) {
      const voice = context.createGain();
      const level = sound.chordLevel * energy;
      if (sound.chordDecay) {
        voice.gain.setValueAtTime(0.0001, at);
        voice.gain.linearRampToValueAtTime(level, at + sound.chordAttack);
        voice.gain.exponentialRampToValueAtTime(level * 0.28, at + duration * 0.62);
        voice.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      } else {
        voice.gain.setValueAtTime(0, at);
        voice.gain.linearRampToValueAtTime(level, at + Math.min(sound.chordAttack, duration * 0.4));
        voice.gain.setValueAtTime(level * 0.86, at + duration - 0.28);
        voice.gain.linearRampToValueAtTime(0, at + duration);
      }
      voice.connect(session.chords);
      let layersRemaining = 2;
      for (const [type, detune, mix] of sound.chordLayers) {
        const osc = context.createOscillator();
        this.setTimbre(osc, type);
        osc.frequency.value = midiFrequency(note);
        osc.detune.value = detune;
        const layer = context.createGain();
        layer.gain.value = mix;
        osc.connect(layer).connect(voice);
        this.trackSource(session, osc, () => {
          layer.disconnect();
          if (--layersRemaining === 0) voice.disconnect();
        });
        osc.start(at);
        osc.stop(at + duration + 0.02);
      }
    }
  }

  private playBass(session: TrackSession, note: number, at: number, duration: number, energy: number): void {
    const context = this.context!;
    const osc = context.createOscillator();
    const sound = AMBIENT_SOUND[ambientVariant(session.composition)];
    osc.type = sound.bassType;
    osc.frequency.value = midiFrequency(note);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(sound.bassLevel * energy, at + 0.018);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(envelope).connect(session.bass);
    this.trackSource(session, osc, () => envelope.disconnect());
    osc.start(at);
    osc.stop(at + duration + 0.015);
  }

  private playMelody(session: TrackSession, note: number, at: number, duration: number, energy: number): void {
    const context = this.context!;
    const sound = AMBIENT_SOUND[ambientVariant(session.composition)];
    const osc = context.createOscillator();
    this.setTimbre(osc, sound.melodyType);
    osc.frequency.value = midiFrequency(note);
    const envelope = context.createGain();
    const level = Math.max(0.0001, sound.melodyLevel * energy);
    const attack = Math.min(sound.melodyAttack, duration * 0.35);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.linearRampToValueAtTime(level, at + attack);
    if (sound.melodyEnvelope === 'pluck') {
      envelope.gain.exponentialRampToValueAtTime(level * 0.35, at + duration * 0.45);
      envelope.gain.exponentialRampToValueAtTime(level * 0.13, at + duration * 0.8);
    } else if (sound.melodyEnvelope === 'bell') {
      envelope.gain.exponentialRampToValueAtTime(level * 0.48, at + duration * 0.4);
      envelope.gain.exponentialRampToValueAtTime(level * 0.18, at + duration * 0.8);
    } else {
      envelope.gain.linearRampToValueAtTime(level * 0.82, at + duration * 0.72);
    }
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    if (sound.melodyEnvelope !== 'sustain') {
      const frequency = midiFrequency(note);
      osc.frequency.setValueAtTime(frequency * (sound.melodyEnvelope === 'bell' ? 1.018 : 1.012), at);
      osc.frequency.exponentialRampToValueAtTime(frequency, at + Math.min(0.04, duration * 0.2));
    }
    // The brighter attack closes down as a struck note rings out. The sweep
    // separates plucked and bell-like voices from sustained leads in motion,
    // not just in their fixed harmonic recipes.
    const tone = sound.melodyEnvelope === 'sustain' ? null : context.createBiquadFilter();
    if (tone) {
      const frequency = midiFrequency(note);
      const high = Math.min(context.sampleRate * 0.45, Math.max(2400, frequency * 10));
      const low = Math.min(high * 0.65, Math.max(650, frequency * (sound.melodyEnvelope === 'bell' ? 4 : 2.5)));
      tone.type = 'lowpass';
      tone.Q.value = 0.6;
      tone.frequency.setValueAtTime(high, at);
      tone.frequency.exponentialRampToValueAtTime(low, at + Math.min(duration * 0.65, sound.melodyEnvelope === 'bell' ? 0.6 : 0.3));
      osc.connect(envelope).connect(tone).connect(session.melody);
    } else {
      osc.connect(envelope).connect(session.melody);
    }
    this.trackSource(session, osc, () => {
      envelope.disconnect();
      tone?.disconnect();
    });
    osc.start(at);
    osc.stop(at + duration + 0.015);
    if (sound.melodyHarmonic) {
      const [ratio, mix] = sound.melodyHarmonic;
      const partial = context.createOscillator();
      partial.type = 'sine';
      partial.frequency.value = midiFrequency(note) * ratio;
      const shimmer = context.createGain();
      const end = at + Math.min(duration * 0.65, 0.75);
      shimmer.gain.setValueAtTime(0.0001, at);
      shimmer.gain.exponentialRampToValueAtTime(sound.melodyLevel * mix * energy, at + 0.012);
      shimmer.gain.exponentialRampToValueAtTime(0.0001, end);
      partial.connect(shimmer).connect(session.melody);
      this.trackSource(session, partial, () => shimmer.disconnect());
      partial.start(at);
      partial.stop(end + 0.015);
    }
  }

  private playKick(session: TrackSession, at: number, energy: number): void {
    const context = this.context!;
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, at);
    osc.frequency.exponentialRampToValueAtTime(48, at + 0.13);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(0.22 * energy, at + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.19);
    osc.connect(envelope).connect(session.drums);
    this.trackSource(session, osc, () => envelope.disconnect());
    osc.start(at);
    osc.stop(at + 0.2);
  }

  private onVisibilityChange = (): void => {
    if (this.status !== 'playing' || !this.context || document.hidden) return;
    if (this.context.state === 'suspended') {
      void this.context.resume().then(() => this.tick()).catch((error) => this.fail(error));
    } else {
      this.tick();
    }
  };
}
