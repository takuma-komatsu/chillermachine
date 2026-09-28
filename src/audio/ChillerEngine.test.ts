import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChillerEngine } from './ChillerEngine';
import { AMBIENT_VARIANTS, ambientMelodyEvent, makeComposition, textureEvent, type AmbientVariant, type Composition } from './composition';

class FakeParam {
  value = 0;
  setValueAtTime(value: number): this { this.value = value; return this; }
  linearRampToValueAtTime(value: number): this { this.value = value; return this; }
  exponentialRampToValueAtTime(value: number): this { this.value = value; return this; }
  setTargetAtTime(value: number): this { this.value = value; return this; }
  cancelScheduledValues(): this { return this; }
}

class FakeNode {
  constructor(private readonly onDisconnect?: (node: FakeNode) => void) {}
  gain = new FakeParam();
  frequency = new FakeParam();
  delayTime = new FakeParam();
  pan = new FakeParam();
  detune = new FakeParam();
  Q = new FakeParam();
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  type = '';
  curve: Float32Array | null = null;
  buffer: AudioBuffer | null = null;
  normalize = true;
  oversample = 'none';
  disconnected = false;
  connections: FakeNode[] = [];
  connect<T extends FakeNode>(target: T): T { this.connections.push(target); return target; }
  disconnect(): void {
    this.disconnected = true;
    this.onDisconnect?.(this);
  }
}

class FakeSource extends FakeNode {
  constructor(private readonly context: FakeAudioContext, onDisconnect: (node: FakeNode) => void) {
    super(onDisconnect);
  }
  loop = false;
  onended: ((event: Event) => void) | null = null;
  startedAt?: number;
  stopsAt?: number;
  ended = false;
  start(when: number, _offset?: number, duration?: number): void {
    this.startedAt = when;
    this.context.recentStartTimes.push(when);
    if (this.context.recentStartTimes.length > 32) this.context.recentStartTimes.shift();
    if (duration !== undefined) this.stopsAt = when + duration;
  }
  stop(when?: number): void { this.stopsAt = when ?? 0; }
  finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.onended?.({} as Event);
    this.context.finishedSources++;
    if (!this.disconnected) this.context.orphanedFinishedSources++;
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  sampleRate = 8000;
  currentTime = 0;
  state: AudioContextState = 'suspended';
  destination = new FakeNode();
  sources = new Set<FakeSource>();
  nodes = new Set<FakeNode>();
  oscillators: FakeSource[] = [];
  panners: FakeNode[] = [];
  createdSources = 0;
  finishedSources = 0;
  orphanedFinishedSources = 0;
  recentStartTimes: number[] = [];
  resumeCalls = 0;
  constructor() { FakeAudioContext.instances.push(this); }
  createGain(): FakeNode { return this.node(); }
  createBiquadFilter(): FakeNode { return this.node(); }
  createDelay(): FakeNode { return this.node(); }
  createStereoPanner(): FakeNode {
    const panner = this.node();
    this.panners.push(panner);
    return panner;
  }
  createDynamicsCompressor(): FakeNode { return this.node(); }
  createWaveShaper(): FakeNode { return this.node(); }
  createConvolver(): FakeNode { return this.node(); }
  createOscillator(): FakeSource {
    const oscillator = this.source();
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createBufferSource(): FakeSource { return this.source(); }
  createBuffer(channels: number, length: number): AudioBuffer {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, getChannelData: (channel: number) => data[channel] } as unknown as AudioBuffer;
  }
  resume(): Promise<void> { this.resumeCalls++; this.state = 'running'; return Promise.resolve(); }
  suspend(): Promise<void> { this.state = 'suspended'; return Promise.resolve(); }
  close(): Promise<void> { this.state = 'closed'; return Promise.resolve(); }
  advanceTo(time: number): void {
    this.currentTime = time;
    for (const source of this.sources) {
      if (source.stopsAt !== undefined && source.stopsAt <= time) source.finish();
    }
  }
  private node(): FakeNode {
    const node = new FakeNode((finished) => this.nodes.delete(finished));
    this.nodes.add(node);
    return node;
  }
  private source(): FakeSource {
    const source = new FakeSource(this, (finished) => {
      this.sources.delete(finished as FakeSource);
      this.nodes.delete(finished);
    });
    this.sources.add(source);
    this.nodes.add(source);
    this.createdSources++;
    return source;
  }
}

describe('ChillerEngine scheduling', () => {
  beforeEach(() => {
    FakeAudioContext.instances = [];
    vi.stubGlobal('AudioContext', FakeAudioContext);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('resumes on the play gesture and keeps voices and graph nodes bounded for 30 minutes', async () => {
    const engine = new ChillerEngine();
    (engine as unknown as { composition: Composition }).composition = makeComposition(0);
    const playing = engine.play();
    const context = FakeAudioContext.instances[0];
    expect(context.resumeCalls).toBe(1);
    await playing;
    expect(engine.getSnapshot().status).toBe('playing');

    const tick = (engine as unknown as { tick(): void }).tick.bind(engine);
    let peakSources = 0;
    let peakNodes = 0;
    for (let quarter = 1; quarter <= 30 * 60 * 4; quarter++) {
      context.advanceTo(quarter / 4);
      tick();
      peakSources = Math.max(peakSources, context.sources.size);
      peakNodes = Math.max(peakNodes, context.nodes.size);
    }
    expect(context.createdSources).toBeGreaterThan(4000);
    expect(context.finishedSources).toBeGreaterThan(4000);
    expect(context.orphanedFinishedSources).toBe(0);
    expect(peakSources).toBeLessThan(40);
    expect(peakNodes).toBeLessThan(100);
    expect(context.sources.size).toBeLessThan(40);
    expect(context.nodes.size).toBeLessThan(100);
    engine.dispose();
    expect(context.sources.size).toBe(0);
    expect(context.nodes.size).toBe(0);
  });

  it.each(AMBIENT_VARIANTS)('gives %s a distinct sound, arrangement, and bounded graph', async (variant) => {
    const seed = AMBIENT_VARIANTS.indexOf(variant);
    const composition = makeComposition(seed);
    const engine = new ChillerEngine();
    (engine as unknown as { composition: Composition }).composition = composition;
    expect(composition.ambientVariant).toBe(variant);
    expect(engine.getSnapshot().track.style).toBe('Soft Ambient');
    await engine.play();
    const context = FakeAudioContext.instances[0];
    const internals = engine as unknown as {
      sessions: Array<{
        chords: FakeNode; melody: FakeNode; texture: FakeNode; textureTone: FakeNode;
        bass: FakeNode; drums: FakeNode; roomHighpass: FakeNode; roomLowpass: FakeNode;
        roomTaps: Array<{ delay: FakeNode; gain: FakeNode; pan: FakeNode }>;
      }>;
      scheduleStep(session: unknown, step: number, time: number): void;
      tick(): void;
      playChord(session: unknown, notes: number[], at: number, duration: number, energy: number): void;
      playBass(session: unknown, note: number, at: number, duration: number, energy: number): void;
      playKick(session: unknown, at: number, energy: number): void;
      playMelody(session: unknown, note: number, at: number, duration: number, energy: number): void;
      playTexture(session: unknown, note: number, at: number, duration: number, energy: number): void;
    };
    const session = internals.sessions[0];
    expect(session.texture.type).toBe('highpass');
    expect(session.textureTone.type).toBe('lowpass');
    expect(session.chords.connections).toContain(session.roomHighpass);
    expect(session.melody.connections).toContain(session.roomHighpass);
    expect(session.textureTone.connections).toContain(session.roomHighpass);
    expect(session.roomTaps.map((tap) => tap.pan.pan.value)).toEqual([-0.68, 0.68]);
    expect(session.chords.frequency.value).toBeGreaterThanOrEqual(1000);
    expect(session.chords.frequency.value).toBeLessThanOrEqual(2400);
    expect(session.drums.gain.value).toBeLessThanOrEqual(0.32);

    const chord = vi.spyOn(internals, 'playChord');
    const bass = vi.spyOn(internals, 'playBass');
    const kick = vi.spyOn(internals, 'playKick');
    const melody = vi.spyOn(internals, 'playMelody');
    const texture = vi.spyOn(internals, 'playTexture');
    const stepDuration = 60 / composition.bpm / 4;
    for (let step = 0; step < 4 * 16; step++) {
      internals.scheduleStep(session, step, 10 + step * stepDuration);
    }
    const expected = {
      'Cloud Drift': [4, 4, 1], 'Rain Window': [8, 6, 2], 'Dawn Haze': [4, 4, 0],
      'Blue Hour': [6, 4, 0], 'Starlit Memory': [5, 4, 0], 'Velvet Tide': [4, 4, 0],
      'Faded Polaroid': [8, 4, 0], 'Midnight Bloom': [6, 4, 0], 'Glass Garden': [8, 4, 0],
      'Winter Light': [5, 4, 0], 'Slow Orbit': [4, 5, 0], 'Golden Echo': [8, 4, 0],
    } satisfies Record<AmbientVariant, [number, number, number]>;
    expect([chord.mock.calls.length, bass.mock.calls.length, kick.mock.calls.length]).toEqual(expected[variant]);
    expect(melody).toHaveBeenCalledTimes(Array.from({ length: 64 }, (_, step) =>
      ambientMelodyEvent(composition, Math.floor(step / 16), step % 16)).filter(Boolean).length);
    expect(texture).toHaveBeenCalledTimes(Array.from({ length: 64 }, (_, step) =>
      textureEvent(composition, Math.floor(step / 16), step % 16)).filter(Boolean).length);
    expect(melody.mock.calls.length).toBeGreaterThan(0);
    expect(texture.mock.calls.length).toBeGreaterThan(0);
    chord.mockRestore(); bass.mockRestore(); kick.mockRestore(); melody.mockRestore(); texture.mockRestore();

    context.advanceTo(100);
    internals.tick();
    let peakSources = 0;
    let peakNodes = 0;
    for (let quarter = 1; quarter <= 2 * 60 * 4; quarter++) {
      context.advanceTo(100 + quarter / 4);
      internals.tick();
      peakSources = Math.max(peakSources, context.sources.size);
      peakNodes = Math.max(peakNodes, context.nodes.size);
    }
    expect(context.orphanedFinishedSources).toBe(0);
    expect(peakSources).toBeLessThan(40);
    expect(peakNodes).toBeLessThan(100);
    engine.dispose();
    expect(context.sources.size).toBe(0);
    expect(context.nodes.size).toBe(0);
  });

  it('renders all twelve instrument palettes with varied lead, pad, and space settings', async () => {
    const signatures = new Set<string>();
    const leadTypes = new Set<string>();
    const textureTypes = new Set<string>();
    for (let seed = 0; seed < AMBIENT_VARIANTS.length; seed++) {
      const engine = new ChillerEngine();
      (engine as unknown as { composition: Composition }).composition = makeComposition(seed);
      await engine.play();
      const context = FakeAudioContext.instances.at(-1)!;
      const internals = engine as unknown as {
        sessions: Array<{ chords: FakeNode; melody: FakeNode; textureTone: FakeNode;
          roomTaps: Array<{ delay: FakeNode; gain: FakeNode }> }>;
        playChord(session: unknown, notes: number[], at: number, duration: number, energy: number): void;
        playMelody(session: unknown, note: number, at: number, duration: number, energy: number): void;
        playTexture(session: unknown, note: number, at: number, duration: number, energy: number): void;
      };
      const session = internals.sessions[0];
      const at = context.currentTime + 0.3;
      const beforePad = context.oscillators.length;
      internals.playChord(session, [60], at, 2, 1);
      const pad = context.oscillators.slice(beforePad).map((osc) => [osc.type, osc.detune.value]);
      expect(pad).toHaveLength(2);
      const beforeLead = context.oscillators.length;
      internals.playMelody(session, 72, at, 1.2, 1);
      const lead = context.oscillators.slice(beforeLead);
      const harmonicRatios: Partial<Record<AmbientVariant, number>> = {
        'Starlit Memory': 2.01, 'Glass Garden': 2.72, 'Golden Echo': 2,
      };
      const variant = makeComposition(seed).ambientVariant;
      expect(lead).toHaveLength(harmonicRatios[variant] ? 2 : 1);
      if (harmonicRatios[variant]) {
        expect(lead[1].frequency.value / lead[0].frequency.value).toBeCloseTo(harmonicRatios[variant]);
        expect(lead[1].type).toBe('sine');
      }
      leadTypes.add(lead[0].type);
      const beforeTexture = context.oscillators.length;
      internals.playTexture(session, 84, at, 1.2, 1);
      const texture = context.oscillators.slice(beforeTexture);
      expect(texture).toHaveLength(1);
      textureTypes.add(texture[0].type);
      signatures.add(JSON.stringify([pad, lead.map((osc) => [osc.type, osc.frequency.value]), texture[0].type,
        session.chords.frequency.value, session.melody.frequency.value,
        session.textureTone.frequency.value, session.roomTaps.map((tap) => tap.delay.delayTime.value)]));
      engine.dispose();
      expect(context.nodes.size).toBe(0);
    }
    expect(signatures.size).toBe(AMBIENT_VARIANTS.length);
    expect(leadTypes).toEqual(new Set(['sine', 'triangle']));
    expect(textureTypes).toEqual(new Set(['sine', 'triangle']));
  });

  it('layers three distinct noise beds through a shared tape tone and drive', async () => {
    const signatures = new Set<string>();
    for (const variant of AMBIENT_VARIANTS) {
      const engine = new ChillerEngine();
      (engine as unknown as { composition: Composition }).composition = makeComposition(AMBIENT_VARIANTS.indexOf(variant));
      await engine.play();
      const context = FakeAudioContext.instances.at(-1)!;
      const beds = [...context.sources].filter((source) => source.loop);
      expect(beds).toHaveLength(3);
      const settings = beds.map((source) => {
        const highpass = source.connections[0];
        const lowpass = highpass.connections[0];
        const gain = lowpass.connections[0];
        expect(highpass.type).toBe('highpass');
        expect(lowpass.type).toBe('lowpass');
        expect(gain.gain.value).toBeGreaterThan(0);
        return [highpass.frequency.value, lowpass.frequency.value, gain.gain.value];
      });
      signatures.add(JSON.stringify(settings));
      const internals = engine as unknown as { master: FakeNode; tapeTone: FakeNode; tapeDrive: FakeNode };
      expect(internals.master.connections).toContain(internals.tapeTone);
      expect(internals.tapeTone.frequency.value).toBe(4500);
      expect(internals.tapeDrive.curve).toHaveLength(1024);
      engine.dispose();
      expect(context.nodes.size).toBe(0);
    }
    expect(signatures.size).toBe(AMBIENT_VARIANTS.length);
  });

  it('adds a short stereo reverb and a quiet, filtered lead echo that retire with each track', async () => {
    const engine = new ChillerEngine();
    (engine as unknown as { composition: Composition }).composition = makeComposition(0);
    await engine.play();
    const context = FakeAudioContext.instances[0];
    const internals = engine as unknown as { sessions: Array<{
      gain: FakeNode; melody: FakeNode; roomLowpass: FakeNode;
      reverb: FakeNode; reverbGain: FakeNode; echoDelay: FakeNode;
      echoTone: FakeNode; echoGain: FakeNode; echoFeedback: FakeNode; echoPan: FakeNode;
    }>; tick(): void };
    const first = internals.sessions[0];
    expect(first.reverb.buffer?.numberOfChannels).toBe(2);
    expect(first.reverb.buffer?.length).toBe(Math.floor(context.sampleRate * 1.45));
    expect(first.reverb.normalize).toBe(false);
    const impulse = first.reverb.buffer!.getChannelData(0);
    const energy = (from: number, to: number) => {
      let sum = 0;
      for (let i = Math.floor(from * context.sampleRate); i < Math.floor(to * context.sampleRate); i++) {
        sum += impulse[i] ** 2;
      }
      return sum;
    };
    // Kernel energy approximates wet/dry RMS for broadband sound. The late
    // window must decay even though the initial tail remains clearly present.
    const wetRatio = Math.sqrt(energy(0, 1.45)) * first.reverbGain.gain.value;
    expect(wetRatio).toBeGreaterThan(0.14);
    expect(wetRatio).toBeLessThan(0.25);
    expect(energy(0.8, 1.3)).toBeLessThan(energy(0.05, 0.4) * 0.03);
    expect(first.roomLowpass.connections).toContain(first.reverb);
    expect(first.reverb.connections).toContain(first.reverbGain);
    expect(first.reverbGain.connections).toContain(first.gain);
    expect(first.melody.connections).toContain(first.echoDelay);
    expect(first.echoDelay.connections).toContain(first.echoTone);
    expect(first.echoTone.connections).toContain(first.echoFeedback);
    expect(first.echoFeedback.connections).toContain(first.echoDelay);
    expect(first.echoTone.connections).toContain(first.echoGain);
    expect(first.echoPan.connections).toContain(first.gain);
    expect(first.echoDelay.delayTime.value).toBeGreaterThan(0.4);
    expect(first.echoGain.gain.value).toBeLessThan(0.2);
    expect(first.echoFeedback.gain.value).toBeLessThan(0.3);

    await engine.next();
    expect(internals.sessions).toHaveLength(2);
    const second = internals.sessions[1];
    expect(second.reverb.buffer).toBe(first.reverb.buffer);
    expect(second.echoDelay.delayTime.value).not.toBe(first.echoDelay.delayTime.value);
    context.advanceTo(1.2);
    internals.tick();
    expect(internals.sessions).toEqual([second]);
    for (const node of [first.reverb, first.reverbGain, first.echoDelay, first.echoTone,
      first.echoGain, first.echoFeedback, first.echoPan]) expect(node.disconnected).toBe(true);
    engine.dispose();
    expect(context.nodes.size).toBe(0);
  });

  it('recovers from a throttled timer without scheduling notes in the distant past', async () => {
    const engine = new ChillerEngine();
    await engine.play();
    const context = FakeAudioContext.instances[0];
    const before = context.createdSources;
    context.recentStartTimes = [];
    context.advanceTo(1800);
    (engine as unknown as { tick(): void }).tick();
    for (let quarter = 1; quarter <= 24; quarter++) {
      context.advanceTo(1800 + quarter / 4);
      (engine as unknown as { tick(): void }).tick();
    }
    expect(context.createdSources).toBeGreaterThan(before);
    expect(context.recentStartTimes.every((time) => time >= 1800)).toBe(true);
    engine.dispose();
  });

  it('changes Ambient variants while playing and pauses without leaving sources alive', async () => {
    vi.useFakeTimers();
    const engine = new ChillerEngine();
    await engine.play();
    const context = FakeAudioContext.instances[0];
    const firstSeed = engine.getSnapshot().track.seed;
    let previousVariant = engine.getSnapshot().track.ambientVariant;
    for (let skip = 0; skip < 32; skip++) {
      await engine.next();
      const track = engine.getSnapshot().track;
      expect(track.style).toBe('Soft Ambient');
      expect(track.ambientVariant).not.toBe(previousVariant);
      previousVariant = track.ambientVariant;
    }
    expect(engine.getSnapshot().track.seed).not.toBe(firstSeed);
    context.advanceTo(1.2);
    (engine as unknown as { tick(): void }).tick();
    const pausing = engine.pause();
    await vi.advanceTimersByTimeAsync(60);
    await pausing;
    expect(engine.getSnapshot().status).toBe('paused');
    expect(context.state).toBe('suspended');
    engine.dispose();
    expect(context.sources.size).toBe(0);
    expect(context.nodes.size).toBe(0);
  });

  it('returns to the ready state when choosing a new mix after playback fails', async () => {
    class FailingAudioContext extends FakeAudioContext {
      override resume(): Promise<void> { return Promise.reject(new Error('Playback blocked')); }
    }
    vi.stubGlobal('AudioContext', FailingAudioContext);
    const engine = new ChillerEngine();
    await engine.play();
    expect(engine.getSnapshot().status).toBe('error');
    expect(engine.getSnapshot().error).toBe('Playback blocked');
    const failedSeed = engine.getSnapshot().track.seed;

    await engine.next();
    expect(engine.getSnapshot().status).toBe('idle');
    expect(engine.getSnapshot().error).toBeUndefined();
    expect(engine.getSnapshot().track.seed).not.toBe(failedSeed);
    engine.dispose();
  });
});
