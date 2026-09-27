import {
  ambientMelodyEvent,
  bassNote,
  chordNotes,
  makeComposition,
  nextSeed,
  sectionEnergy,
  textureEvent,
  type AmbientVariant,
  type Composition,
} from './composition';

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
  sources: Map<AudioScheduledSourceNode, () => void>;
  step: number;
  nextTime: number;
  retireAt?: number;
};

const SCHEDULE_INTERVAL_MS = 25;
const LOOKAHEAD_SECONDS = 0.22;
const CROSSFADE_SECONDS = 1;
const STEPS_PER_BAR = 16;

type Layer = readonly [OscillatorType, number, number];
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
  melodyType: OscillatorType;
  melodyLevel: number;
  melodyAttack: number;
  melodyHarmonic?: readonly [ratio: number, level: number];
  textureType: OscillatorType;
  textureLevel: number;
  textureAttack: number;
  bassType: OscillatorType;
  bassLevel: number;
};

// Each scene has a small but distinct instrument palette. The fixed room taps
// keep the graph bounded even as tracks change or play for hours.
const AMBIENT_SOUND: Record<AmbientVariant, AmbientSound> = {
  'Cloud Drift': { chordCutoff: 1550, melodyCutoff: 1650, bassCutoff: 420, drumLevel: 0.32, noiseCutoff: 2100, noiseLevel: 0.004, textureHighpass: 470, textureCutoff: 1650, roomCutoff: 1900, roomTimes: [0.23, 0.39], roomLevels: [0.14, 0.1], chordLayers: [['sine', -6, 0.72], ['triangle', 6, 0.32]], chordLevel: 0.038, chordAttack: 0.32, chordDecay: false, melodyType: 'sine', melodyLevel: 0.024, melodyAttack: 0.1, textureType: 'sine', textureLevel: 0.033, textureAttack: 0.11, bassType: 'sine', bassLevel: 0.12 },
  'Rain Window': { chordCutoff: 2200, melodyCutoff: 2050, bassCutoff: 470, drumLevel: 0.26, noiseCutoff: 3000, noiseLevel: 0.007, textureHighpass: 650, textureCutoff: 2500, roomCutoff: 2400, roomTimes: [0.17, 0.34], roomLevels: [0.11, 0.08], chordLayers: [['triangle', -4, 0.58], ['sine', 5, 0.42]], chordLevel: 0.034, chordAttack: 0.045, chordDecay: true, melodyType: 'triangle', melodyLevel: 0.022, melodyAttack: 0.045, textureType: 'sine', textureLevel: 0.027, textureAttack: 0.035, bassType: 'sine', bassLevel: 0.105 },
  'Dawn Haze': { chordCutoff: 1200, melodyCutoff: 1850, bassCutoff: 380, drumLevel: 0, noiseCutoff: 3800, noiseLevel: 0.003, textureHighpass: 520, textureCutoff: 2600, roomCutoff: 1700, roomTimes: [0.29, 0.46], roomLevels: [0.16, 0.11], chordLayers: [['sine', -8, 0.84], ['triangle', 7, 0.16]], chordLevel: 0.033, chordAttack: 0.65, chordDecay: false, melodyType: 'sine', melodyLevel: 0.019, melodyAttack: 0.22, textureType: 'triangle', textureLevel: 0.025, textureAttack: 0.13, bassType: 'sine', bassLevel: 0.1 },
  'Blue Hour': { chordCutoff: 1400, melodyCutoff: 2400, bassCutoff: 400, drumLevel: 0, noiseCutoff: 1900, noiseLevel: 0.003, textureHighpass: 840, textureCutoff: 3100, roomCutoff: 2100, roomTimes: [0.28, 0.43], roomLevels: [0.17, 0.12], chordLayers: [['triangle', -7, 0.56], ['sine', 9, 0.38]], chordLevel: 0.034, chordAttack: 0.42, chordDecay: false, melodyType: 'triangle', melodyLevel: 0.018, melodyAttack: 0.16, textureType: 'sine', textureLevel: 0.024, textureAttack: 0.07, bassType: 'sine', bassLevel: 0.095 },
  'Starlit Memory': { chordCutoff: 1750, melodyCutoff: 3200, bassCutoff: 430, drumLevel: 0, noiseCutoff: 3400, noiseLevel: 0.002, textureHighpass: 1100, textureCutoff: 3900, roomCutoff: 2800, roomTimes: [0.21, 0.41], roomLevels: [0.16, 0.13], chordLayers: [['sine', -11, 0.69], ['triangle', 11, 0.23]], chordLevel: 0.032, chordAttack: 0.39, chordDecay: false, melodyType: 'sine', melodyLevel: 0.021, melodyAttack: 0.025, melodyHarmonic: [2.01, 0.19], textureType: 'triangle', textureLevel: 0.021, textureAttack: 0.018, bassType: 'sine', bassLevel: 0.085 },
  'Velvet Tide': { chordCutoff: 1050, melodyCutoff: 1350, bassCutoff: 350, drumLevel: 0, noiseCutoff: 1450, noiseLevel: 0.003, textureHighpass: 390, textureCutoff: 1300, roomCutoff: 1450, roomTimes: [0.31, 0.48], roomLevels: [0.18, 0.12], chordLayers: [['sine', -5, 0.82], ['triangle', 5, 0.16]], chordLevel: 0.041, chordAttack: 0.8, chordDecay: false, melodyType: 'sine', melodyLevel: 0.017, melodyAttack: 0.29, textureType: 'sine', textureLevel: 0.027, textureAttack: 0.21, bassType: 'sine', bassLevel: 0.105 },
  'Faded Polaroid': { chordCutoff: 1500, melodyCutoff: 1650, bassCutoff: 390, drumLevel: 0, noiseCutoff: 1650, noiseLevel: 0.006, textureHighpass: 600, textureCutoff: 1800, roomCutoff: 1750, roomTimes: [0.16, 0.31], roomLevels: [0.12, 0.09], chordLayers: [['triangle', -3, 0.62], ['sine', 4, 0.33]], chordLevel: 0.035, chordAttack: 0.032, chordDecay: true, melodyType: 'triangle', melodyLevel: 0.019, melodyAttack: 0.03, textureType: 'sine', textureLevel: 0.024, textureAttack: 0.045, bassType: 'triangle', bassLevel: 0.079 },
  'Midnight Bloom': { chordCutoff: 1250, melodyCutoff: 2150, bassCutoff: 360, drumLevel: 0, noiseCutoff: 1200, noiseLevel: 0.002, textureHighpass: 740, textureCutoff: 2200, roomCutoff: 1600, roomTimes: [0.27, 0.45], roomLevels: [0.18, 0.11], chordLayers: [['sine', -9, 0.74], ['triangle', 7, 0.22]], chordLevel: 0.037, chordAttack: 0.56, chordDecay: false, melodyType: 'triangle', melodyLevel: 0.018, melodyAttack: 0.12, textureType: 'sine', textureLevel: 0.024, textureAttack: 0.15, bassType: 'sine', bassLevel: 0.095 },
  'Glass Garden': { chordCutoff: 2400, melodyCutoff: 3500, bassCutoff: 470, drumLevel: 0, noiseCutoff: 3200, noiseLevel: 0.002, textureHighpass: 1250, textureCutoff: 4300, roomCutoff: 2900, roomTimes: [0.19, 0.37], roomLevels: [0.14, 0.11], chordLayers: [['sine', -3, 0.52], ['triangle', 3, 0.37]], chordLevel: 0.03, chordAttack: 0.19, chordDecay: true, melodyType: 'triangle', melodyLevel: 0.017, melodyAttack: 0.012, melodyHarmonic: [2.72, 0.21], textureType: 'triangle', textureLevel: 0.018, textureAttack: 0.012, bassType: 'sine', bassLevel: 0.075 },
  'Winter Light': { chordCutoff: 1850, melodyCutoff: 2650, bassCutoff: 385, drumLevel: 0, noiseCutoff: 2300, noiseLevel: 0.002, textureHighpass: 1000, textureCutoff: 3100, roomCutoff: 2250, roomTimes: [0.24, 0.44], roomLevels: [0.16, 0.12], chordLayers: [['sine', -2, 0.74], ['triangle', 3, 0.19]], chordLevel: 0.032, chordAttack: 0.51, chordDecay: false, melodyType: 'sine', melodyLevel: 0.017, melodyAttack: 0.18, textureType: 'sine', textureLevel: 0.021, textureAttack: 0.1, bassType: 'sine', bassLevel: 0.08 },
  'Slow Orbit': { chordCutoff: 1100, melodyCutoff: 1900, bassCutoff: 355, drumLevel: 0, noiseCutoff: 1000, noiseLevel: 0.002, textureHighpass: 540, textureCutoff: 2050, roomCutoff: 1500, roomTimes: [0.33, 0.49], roomLevels: [0.16, 0.11], chordLayers: [['triangle', -12, 0.43], ['sine', 12, 0.49]], chordLevel: 0.035, chordAttack: 0.73, chordDecay: false, melodyType: 'sine', melodyLevel: 0.019, melodyAttack: 0.24, textureType: 'triangle', textureLevel: 0.019, textureAttack: 0.19, bassType: 'sine', bassLevel: 0.09 },
  'Golden Echo': { chordCutoff: 2050, melodyCutoff: 2750, bassCutoff: 445, drumLevel: 0, noiseCutoff: 2450, noiseLevel: 0.003, textureHighpass: 960, textureCutoff: 3250, roomCutoff: 2550, roomTimes: [0.22, 0.4], roomLevels: [0.18, 0.13], chordLayers: [['triangle', -4, 0.57], ['sine', 6, 0.32]], chordLevel: 0.033, chordAttack: 0.26, chordDecay: true, melodyType: 'sine', melodyLevel: 0.019, melodyAttack: 0.055, melodyHarmonic: [2, 0.14], textureType: 'triangle', textureLevel: 0.022, textureAttack: 0.045, bassType: 'sine', bassLevel: 0.086 },
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

/** A self-contained procedural Ambient player. Call dispose when leaving the page. */
export class ChillerEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private noise: AudioBuffer | null = null;
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
    this.limiter?.disconnect();
    this.limiter = null;
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
    this.noise = null;
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
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 18;
    limiter.ratio.value = 3;
    limiter.attack.value = 0.01;
    limiter.release.value = 0.25;
    master.connect(limiter).connect(context.destination);
    this.context = context;
    this.master = master;
    this.limiter = limiter;
    this.noise = createNoiseBuffer(context);
    return context;
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
      sources: new Map(), step: 0, nextTime: startTime,
    };
    this.startHiss(session, startTime);
    return session;
  }

  private startHiss(session: TrackSession, startTime: number): void {
    const context = this.context!;
    const sound = AMBIENT_SOUND[ambientVariant(session.composition)];
    const source = context.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = sound.noiseCutoff;
    const gain = context.createGain();
    gain.gain.value = sound.noiseLevel;
    source.connect(lowpass).connect(gain).connect(session.gain);
    this.trackSource(session, source, () => {
      lowpass.disconnect();
      gain.disconnect();
    });
    source.start(startTime);
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
    const energy = sectionEnergy(composition, bar);
    const beat = 60 / composition.bpm;
    const variant = ambientVariant(composition);
    const chord = (duration: number, strength: number) =>
      this.playChord(session, chordNotes(composition, bar), time, beat * duration, energy * strength);
    const bass = (duration: number, strength: number) =>
      this.playBass(session, bassNote(composition, bar, position), time, duration, energy * strength);
    switch (variant) {
      case 'Cloud Drift':
        if (position === 0) {
          chord(3.7, 0.9); bass(1.8, 0.75);
          if (bar % 4 === 0) this.playKick(session, time, energy * 0.26);
        }
        break;
      case 'Rain Window':
        if (position === 0 || position === 8) chord(1.65, position === 0 ? 0.8 : 0.58);
        if (position === 0) bass(1.45, 0.62);
        if (position === 8 && bar % 2 === 0) bass(0.8, 0.34);
        if (position === 0 && bar % 2 === 0) this.playKick(session, time, energy * 0.18);
        break;
      case 'Dawn Haze':
        if (position === 0) { chord(3.85, 0.75); bass(2.7, 0.48); }
        break;
      case 'Blue Hour':
        if (position === 0) { chord(3.55, 0.82); bass(2.15, 0.58); }
        if (position === 12 && bar % 2 === 1) chord(0.8, 0.25);
        break;
      case 'Starlit Memory':
        if (position === 0) { chord(3.3, 0.71); bass(1.9, 0.48); }
        if (position === 10 && bar % 4 === 2) chord(1.1, 0.3);
        break;
      case 'Velvet Tide':
        if (position === 0) { chord(3.9, 0.83); bass(3, 0.58); }
        break;
      case 'Faded Polaroid':
        if (position === 0 || position === 10) chord(position === 0 ? 2.2 : 1.1, position === 0 ? 0.77 : 0.42);
        if (position === 0) bass(1.6, 0.56);
        break;
      case 'Midnight Bloom':
        if (position === 0) { chord(3.75, 0.83); bass(2.4, 0.56); }
        if (position === 8 && bar % 2 === 1) chord(1.7, 0.32);
        break;
      case 'Glass Garden':
        if (position === 0 || position === 8) chord(position === 0 ? 1.9 : 1.35, position === 0 ? 0.73 : 0.48);
        if (position === 0) bass(1.25, 0.51);
        break;
      case 'Winter Light':
        if (position === 0) { chord(3.75, 0.78); bass(2.25, 0.51); }
        if (position === 12 && bar % 4 === 3) chord(0.7, 0.22);
        break;
      case 'Slow Orbit':
        if (position === 0) { chord(3.9, 0.79); bass(2.9, 0.57); }
        if (position === 8 && bar % 4 === 2) bass(1.3, 0.27);
        break;
      case 'Golden Echo':
        if (position === 0 || position === 8) chord(position === 0 ? 2.3 : 1.35, position === 0 ? 0.76 : 0.41);
        if (position === 0) bass(1.7, 0.51);
        break;
    }
    const event = ambientMelodyEvent(composition, bar, position);
    if (event) this.playMelody(session, event.note, time, event.duration, energy * event.strength);
    const texture = textureEvent(composition, bar, position);
    if (texture) this.playTexture(session, texture.note, time, texture.duration, energy * texture.strength);
  }

  private playTexture(session: TrackSession, note: number, at: number, duration: number, energy: number): void {
    const context = this.context!;
    const sound = AMBIENT_SOUND[ambientVariant(session.composition)];
    const osc = context.createOscillator();
    osc.type = sound.textureType;
    osc.frequency.value = midiFrequency(note);
    const envelope = context.createGain();
    const attack = Math.min(duration * 0.35, sound.textureAttack);
    const releaseStart = at + Math.max(attack, duration - 0.2);
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(sound.textureLevel * energy, at + attack);
    envelope.gain.linearRampToValueAtTime(sound.textureLevel * 0.82 * energy, releaseStart);
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
        osc.type = type;
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
    osc.type = sound.melodyType;
    osc.frequency.value = midiFrequency(note);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(sound.melodyLevel * energy,
      at + Math.min(sound.melodyAttack, duration * 0.35));
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(envelope).connect(session.melody);
    this.trackSource(session, osc, () => envelope.disconnect());
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
