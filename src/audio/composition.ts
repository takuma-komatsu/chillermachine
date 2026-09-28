/** Pure, repeatable musical choices. Audio rendering lives in ChillerEngine. */
export const STYLES = ['Soft Ambient'] as const;
export type Style = (typeof STYLES)[number];
export const AMBIENT_VARIANTS = [
  'Cloud Drift', 'Rain Window', 'Dawn Haze', 'Blue Hour', 'Starlit Memory',
  'Velvet Tide', 'Faded Polaroid', 'Midnight Bloom', 'Glass Garden',
  'Winter Light', 'Slow Orbit', 'Golden Echo',
] as const;
export type AmbientVariant = (typeof AMBIENT_VARIANTS)[number];

export type Composition = {
  seed: number;
  title: string;
  style: Style;
  ambientVariant: AmbientVariant;
  key: string;
  bpm: number;
  tonicMidi: number;
  scale: readonly number[];
  progression: readonly number[];
  leadStyle: 'sparse' | 'lyrical';
};

type Setting = {
  scale: readonly number[];
  keys: readonly { name: string; midi: number }[];
  progressions: readonly (readonly number[])[];
  bpm: readonly [number, number];
  words: readonly string[];
  endings: readonly string[];
  chordColor: 'seventh' | 'ninth' | 'eleventh' | 'open' | 'pentatonic';
};

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const PENTATONIC = [0, 2, 4, 7, 9];

const SETTINGS: Record<AmbientVariant, Setting> = {
  'Cloud Drift': {
    scale: MAJOR,
    keys: [{ name: 'C major', midi: 48 }, { name: 'F major', midi: 53 }, { name: 'G major', midi: 55 }],
    progressions: [[0, 5, 3, 4], [3, 0, 5, 4], [5, 3, 0, 4]],
    bpm: [56, 62], words: ['Cloud', 'Still', 'Floating', 'Open', 'Weightless'],
    endings: ['Hours', 'Horizon', 'Drift', 'Clouds', 'Sky'], chordColor: 'seventh',
  },
  'Rain Window': {
    scale: MAJOR,
    keys: [{ name: 'C major', midi: 48 }, { name: 'F major', midi: 53 }, { name: 'G major', midi: 55 }],
    progressions: [[5, 3, 0, 3], [5, 3, 5, 0], [5, 0, 3, 0]],
    bpm: [59, 66], words: ['Rain', 'Blue', 'Quiet', 'Silver', 'Passing'],
    endings: ['Window', 'Letters', 'Lantern', 'Evening', 'Glass'], chordColor: 'eleventh',
  },
  'Dawn Haze': {
    scale: MAJOR,
    keys: [{ name: 'C major', midi: 48 }, { name: 'F major', midi: 53 }, { name: 'G major', midi: 55 }],
    progressions: [[0, 3, 1, 3], [0, 1, 5, 3], [3, 1, 0, 3]],
    bpm: [63, 70], words: ['Dawn', 'Golden', 'Morning', 'Soft', 'First'],
    endings: ['Haze', 'Light', 'Air', 'Glow', 'Day'], chordColor: 'ninth',
  },
  'Blue Hour': {
    scale: MINOR,
    keys: [{ name: 'A minor', midi: 45 }, { name: 'D minor', midi: 50 }, { name: 'E minor', midi: 52 }],
    progressions: [[0, 5, 3, 6], [0, 3, 5, 3], [5, 3, 0, 6]],
    bpm: [54, 61], words: ['Blue', 'Fading', 'Violet', 'Last', 'Indigo'],
    endings: ['Hour', 'Light', 'Sky', 'Letters', 'Street'], chordColor: 'eleventh',
  },
  'Starlit Memory': {
    scale: LYDIAN,
    keys: [{ name: 'F Lydian', midi: 53 }, { name: 'C Lydian', midi: 48 }, { name: 'G Lydian', midi: 55 }],
    progressions: [[0, 4, 1, 4], [0, 2, 4, 1], [4, 1, 0, 4]],
    bpm: [51, 58], words: ['Starlit', 'Distant', 'Remembered', 'Pale', 'Wishing'],
    endings: ['Memory', 'Stars', 'Orbit', 'Night', 'Wish'], chordColor: 'ninth',
  },
  'Velvet Tide': {
    scale: DORIAN,
    keys: [{ name: 'D Dorian', midi: 50 }, { name: 'A Dorian', midi: 45 }, { name: 'G Dorian', midi: 55 }],
    progressions: [[0, 3, 4, 3], [0, 4, 6, 3], [3, 0, 4, 0]],
    bpm: [58, 65], words: ['Velvet', 'Deep', 'Low', 'Gentle', 'Moonlit'],
    endings: ['Tide', 'Water', 'Shore', 'Current', 'Blue'], chordColor: 'open',
  },
  'Faded Polaroid': {
    scale: MAJOR,
    keys: [{ name: 'D major', midi: 50 }, { name: 'A major', midi: 45 }, { name: 'C major', midi: 48 }],
    progressions: [[0, 5, 3, 1], [5, 3, 1, 0], [3, 1, 5, 0]],
    bpm: [60, 68], words: ['Faded', 'Old', 'Summer', 'Sepia', 'Forgotten'],
    endings: ['Polaroid', 'Photograph', 'Summer', 'Faces', 'Album'], chordColor: 'seventh',
  },
  'Midnight Bloom': {
    scale: MINOR,
    keys: [{ name: 'C minor', midi: 48 }, { name: 'G minor', midi: 55 }, { name: 'D minor', midi: 50 }],
    progressions: [[0, 6, 3, 5], [0, 3, 6, 3], [5, 6, 0, 3]],
    bpm: [61, 69], words: ['Midnight', 'Hidden', 'Dark', 'Quiet', 'After'],
    endings: ['Bloom', 'Garden', 'Petals', 'Moon', 'Shadow'], chordColor: 'eleventh',
  },
  'Glass Garden': {
    scale: PENTATONIC,
    keys: [{ name: 'C pentatonic', midi: 48 }, { name: 'F pentatonic', midi: 53 }, { name: 'G pentatonic', midi: 55 }],
    progressions: [[0, 3, 1, 4], [0, 2, 3, 1], [3, 1, 0, 4]],
    bpm: [66, 74], words: ['Glass', 'Clear', 'Little', 'Crystal', 'Bright'],
    endings: ['Garden', 'Drops', 'Petals', 'Shimmer', 'Light'], chordColor: 'pentatonic',
  },
  'Winter Light': {
    scale: MAJOR,
    keys: [{ name: 'F major', midi: 53 }, { name: 'B-flat major', midi: 46 }, { name: 'C major', midi: 48 }],
    progressions: [[5, 3, 0, 4], [3, 5, 1, 0], [5, 1, 3, 0]],
    bpm: [48, 55], words: ['Winter', 'White', 'Frosted', 'Quiet', 'Snowfall'],
    endings: ['Light', 'Morning', 'Room', 'Silence', 'Glass'], chordColor: 'ninth',
  },
  'Slow Orbit': {
    scale: DORIAN,
    keys: [{ name: 'E Dorian', midi: 52 }, { name: 'D Dorian', midi: 50 }, { name: 'A Dorian', midi: 45 }],
    progressions: [[0, 6, 3, 4], [0, 4, 3, 6], [3, 6, 0, 4]],
    bpm: [50, 57], words: ['Slow', 'Far', 'Endless', 'Quiet', 'Turning'],
    endings: ['Orbit', 'Satellite', 'Distance', 'Gravity', 'Stars'], chordColor: 'open',
  },
  'Golden Echo': {
    scale: MAJOR,
    keys: [{ name: 'G major', midi: 55 }, { name: 'D major', midi: 50 }, { name: 'F major', midi: 53 }],
    progressions: [[0, 3, 5, 4], [3, 0, 4, 5], [5, 3, 1, 4]],
    bpm: [62, 70], words: ['Golden', 'Warm', 'Honey', 'Last', 'Lingering'],
    endings: ['Echo', 'Sun', 'Afterglow', 'Light', 'Home'], chordColor: 'ninth',
  },
};

/** Stable hash-based random number in [0, 1), independent of scheduling order. */
export function random01(seed: number, ...values: number[]): number {
  let x = (seed ^ 0x9e3779b9) >>> 0;
  for (const value of values) {
    x = Math.imul(x ^ (value >>> 0), 0x85ebca6b) >>> 0;
    x ^= x >>> 13;
  }
  x = Math.imul(x ^ (x >>> 16), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000;
}

export function makeComposition(seed: number): Composition {
  const normalized = seed >>> 0;
  const ambientVariant = AMBIENT_VARIANTS[normalized % AMBIENT_VARIANTS.length];
  const settings = SETTINGS[ambientVariant];
  const key = settings.keys[Math.floor(random01(normalized, 1) * settings.keys.length)];
  const progression = settings.progressions[Math.floor(random01(normalized, 2) * settings.progressions.length)];
  const adjective = settings.words[Math.floor(random01(normalized, 3) * settings.words.length)];
  const noun = settings.endings[Math.floor(random01(normalized, 4) * settings.endings.length)];
  return {
    seed: normalized,
    title: `${adjective} ${noun}`,
    style: 'Soft Ambient',
    ambientVariant,
    key: key.name,
    bpm: settings.bpm[0] + Math.floor(random01(normalized, 5) * (settings.bpm[1] - settings.bpm[0] + 1)),
    tonicMidi: key.midi,
    scale: settings.scale,
    progression,
    leadStyle: random01(normalized, 6) < .4 ? 'lyrical' : 'sparse',
  };
}

function degreeForBar(composition: Composition, bar: number): number {
  return composition.progression[bar % composition.progression.length];
}

function scaleNote(composition: Composition, degree: number): number {
  const count = composition.scale.length;
  return composition.tonicMidi + composition.scale[degree % count] + 12 * Math.floor(degree / count);
}

/** Four airy voices, with each variant's upper extension above the triad. */
export function chordNotes(composition: Composition, bar: number): number[] {
  const degree = degreeForBar(composition, bar);
  const color = SETTINGS[composition.ambientVariant].chordColor;
  const isMinor = scaleNote(composition, degree + 2) - scaleNote(composition, degree) === 3;
  const offsets = color === 'pentatonic' ? [0, 2, 3, 5]
    : color === 'open' ? [0, 2, 4, 7]
      : color === 'seventh' ? [0, 2, 4, 6]
        : color === 'eleventh' && isMinor ? [0, 2, 4, 10]
          : isMinor ? [0, 2, 4, 7] : [0, 2, 4, 8];
  const tones = offsets.map((offset) => scaleNote(composition, degree + offset));
  const section = Math.floor(bar / 8);
  if (section > 0 && random01(composition.seed, section, 30) > 0.48) {
    tones[0] += 12;
    tones.sort((a, b) => a - b);
  }
  return tones;
}

/** A long, low root follows each bar's harmony. */
export function bassNote(composition: Composition, bar: number, _position = 0): number {
  return scaleNote(composition, degreeForBar(composition, bar)) - 12;
}

/** The chord's scale fifth, independent of any octave changes in its pad voicing. */
export function bassFifthNote(composition: Composition, bar: number): number {
  // Glass Garden's pentatonic chords use [0, 2, 3, 5], rather than the
  // diatonic [0, 2, 4, ...]. Match the chord's third voice before inversion.
  const fifthDegree = composition.ambientVariant === 'Glass Garden' ? 3 : 4;
  return scaleNote(composition, degreeForBar(composition, bar) + fifthDegree) - 12;
}

/** A deterministic chord tone, useful to callers that need a single pitch. */
export function melodyNote(composition: Composition, bar: number, beat: number): number {
  const tones = chordNotes(composition, bar);
  const index = Math.floor(random01(composition.seed, bar, beat, 40) * tones.length);
  let note = tones[index];
  while (note < 65) note += 12;
  while (note > 81) note -= 12;
  return note;
}

export type MelodyEvent = { note: number; duration: number; strength: number; offset: number };
type PhraseNote = readonly [bar: number, position: number, tone: number, duration: number, strength: number];
type TextureNote = readonly [step: number, tone: number, duration: number, strength: number];
type LeadNote = readonly [bar: number, position: number, contour: number, strength: number];

// Two distinct four-bar phrases per variant. Pauses are as much a part of each
// phrase as the notes; the brighter colors answer more often than the dark ones.
const PHRASES: Record<AmbientVariant, readonly (readonly PhraseNote[])[]> = {
  'Cloud Drift': [
    [[0, 0, 0, 1.3, .68], [2, 8, 1, 1, .76]],
    [[0, 8, 1, 1.1, .68], [2, 4, 0, 1.35, .76]],
  ],
  'Rain Window': [
    [[0, 4, 1, 1.2, .75], [1, 10, 0, .95, .64], [2, 8, 2, 1, .78], [3, 4, 1, 1.1, .6]],
    [[0, 8, 2, 1, .75], [1, 4, 1, 1.15, .64], [2, 10, 0, .95, .78], [3, 8, 1, .85, .6]],
  ],
  'Dawn Haze': [
    [[0, 0, 1, 1.15, .72], [0, 10, 2, .9, .59], [1, 6, 3, 1.05, .67], [2, 4, 1, 1.1, .7], [3, 12, 2, .68, .58]],
    [[0, 2, 2, 1.15, .72], [1, 0, 1, 1.15, .67], [1, 10, 3, .9, .59], [2, 8, 2, 1, .7], [3, 4, 1, 1.1, .58]],
  ],
  'Blue Hour': [
    [[0, 0, 0, 1.45, .74], [1, 12, 1, .85, .57], [3, 4, 2, 1.2, .7]],
    [[0, 8, 2, 1.1, .67], [2, 0, 1, 1.5, .72], [3, 10, 0, .9, .58]],
  ],
  'Starlit Memory': [
    [[0, 8, 2, 1.25, .63], [2, 0, 1, 1.7, .72]],
    [[1, 0, 3, 1.45, .67], [3, 8, 1, 1.2, .7]],
  ],
  'Velvet Tide': [
    [[0, 4, 0, 1.05, .66], [1, 8, 2, 1.1, .7], [3, 0, 1, 1.4, .73]],
    [[0, 12, 1, .8, .63], [2, 4, 2, 1.1, .72], [3, 8, 0, 1, .66]],
  ],
  'Faded Polaroid': [
    [[0, 2, 2, .8, .71], [1, 0, 1, 1, .66], [2, 10, 0, .7, .58], [3, 4, 1, 1.2, .72]],
    [[0, 6, 1, 1, .7], [1, 12, 2, .8, .6], [2, 4, 1, 1.05, .7], [3, 8, 0, .95, .66]],
  ],
  'Midnight Bloom': [
    [[0, 8, 0, 1.2, .67], [2, 6, 2, 1.1, .73], [3, 12, 1, .72, .55]],
    [[0, 4, 1, 1.15, .66], [1, 12, 0, .8, .55], [3, 0, 2, 1.4, .73]],
  ],
  'Glass Garden': [
    [[0, 0, 2, .6, .65], [0, 8, 1, .55, .55], [1, 12, 3, .65, .62], [2, 4, 1, .7, .68], [3, 8, 0, .8, .73]],
    [[0, 4, 1, .7, .65], [1, 0, 3, .65, .65], [1, 10, 2, .55, .54], [2, 12, 0, .75, .68], [3, 4, 2, .7, .73]],
  ],
  'Winter Light': [
    [[0, 0, 0, 1.8, .64], [2, 12, 1, 1.2, .71]],
    [[1, 4, 1, 1.6, .65], [3, 0, 0, 1.8, .7]],
  ],
  'Slow Orbit': [
    [[0, 8, 1, 1.6, .64], [2, 0, 2, 1.9, .73]],
    [[0, 0, 2, 1.75, .67], [3, 4, 0, 1.5, .7]],
  ],
  'Golden Echo': [
    [[0, 0, 1, 1.05, .7], [1, 8, 2, .9, .61], [2, 4, 3, 1.1, .68], [3, 10, 0, .8, .72]],
    [[0, 8, 2, 1, .69], [1, 4, 3, .95, .65], [2, 12, 1, .75, .59], [3, 0, 0, 1.4, .72]],
  ],
};

// Four-bar sung motifs. Each pair shares its opening hook, then changes the
// answer and cadence on the next pass. Contour is relative to the lead register;
// the note is fitted to each bar's safe chord tones below.
const LYRICAL_MOTIFS: readonly (readonly [readonly LeadNote[], readonly LeadNote[]])[] = [
  [
    [
      [0, 0, -3, .89], [0, 3, 0, .78], [0, 6, 2, .82], [0, 11, 5, .88],
      [1, 1, 3, .84], [1, 5, 1, .75], [1, 9, -1, .79], [1, 12, -3, .83],
      [2, 0, -3, .87], [2, 3, 0, .78], [2, 6, 2, .82], [2, 11, 6, .9],
      [3, 2, 4, .83], [3, 6, 1, .77], [3, 10, 0, .88],
    ],
    [
      [0, 0, -3, .89], [0, 3, 0, .78], [0, 6, 2, .82], [0, 11, 5, .88],
      [1, 1, 3, .84], [1, 5, 1, .75], [1, 9, -1, .79], [1, 12, -3, .83],
      [2, 0, -3, .87], [2, 3, 0, .78], [2, 7, 4, .83], [2, 11, 6, .9],
      [3, 0, 5, .86], [3, 4, 3, .79], [3, 8, 1, .77], [3, 12, -2, .88],
    ],
  ],
  [
    [
      [0, 2, 2, .85], [0, 6, 0, .78], [0, 9, -2, .82], [0, 13, 0, .85],
      [1, 2, 3, .88], [1, 7, 5, .81], [1, 11, 3, .83],
      [2, 2, 2, .85], [2, 6, 0, .78], [2, 9, -2, .82], [2, 13, -4, .87],
      [3, 2, -2, .83], [3, 6, 0, .78], [3, 10, 2, .88],
    ],
    [
      [0, 2, 2, .85], [0, 6, 0, .78], [0, 9, -2, .82], [0, 13, 0, .85],
      [1, 2, 3, .88], [1, 7, 5, .81], [1, 11, 3, .83],
      [2, 2, 2, .85], [2, 6, 0, .78], [2, 10, -3, .83], [2, 13, 0, .84],
      [3, 2, 4, .85], [3, 6, 2, .8], [3, 10, -1, .88],
    ],
  ],
  [
    [
      [0, 0, -1, .87], [0, 4, 2, .82], [0, 8, 4, .8], [0, 12, 2, .84],
      [1, 0, 0, .83], [1, 5, -2, .78], [1, 8, 0, .79], [1, 12, 3, .86],
      [2, 0, -1, .87], [2, 4, 2, .82], [2, 8, 5, .84], [2, 12, 3, .83],
      [3, 0, 2, .82], [3, 5, 0, .79], [3, 9, -2, .88],
    ],
    [
      [0, 0, -1, .87], [0, 4, 2, .82], [0, 8, 4, .8], [0, 12, 2, .84],
      [1, 0, 0, .83], [1, 5, -2, .78], [1, 8, 0, .79], [1, 12, 3, .86],
      [2, 0, -1, .87], [2, 4, 2, .82], [2, 8, 4, .82], [2, 12, 6, .86],
      [3, 0, 4, .84], [3, 4, 2, .8], [3, 8, 0, .77], [3, 12, -1, .88],
    ],
  ],
];

const TEXTURES: Record<AmbientVariant, readonly (readonly TextureNote[])[]> = {
  'Cloud Drift': [[[12, 0, 1.1, .42], [52, 1, 1.3, .48]], [[8, 1, 1.15, .43], [46, 0, 1.25, .47]]],
  'Rain Window': [[[14, 0, .8, .47], [42, 1, 1.1, .52]], [[6, 1, 1, .46], [55, 0, .95, .5]]],
  'Dawn Haze': [[[7, 0, .75, .48], [30, 2, .85, .51], [54, 1, .82, .53]], [[11, 1, .9, .48], [35, 0, .8, .52], [57, 2, .75, .55]]],
  'Blue Hour': [[[20, 1, 1.2, .48], [55, 0, 1.1, .53]], [[8, 0, 1.15, .47], [45, 2, 1.25, .51]]],
  'Starlit Memory': [[[14, 2, 1.45, .46], [43, 0, 1.6, .5]], [[24, 1, 1.5, .48], [57, 2, 1.25, .49]]],
  'Velvet Tide': [[[18, 1, 1.1, .44], [50, 0, 1.2, .49]], [[6, 2, 1.2, .45], [44, 1, 1.1, .5]]],
  'Faded Polaroid': [[[14, 0, .7, .5], [34, 1, .85, .48], [57, 2, .9, .53]], [[4, 1, .75, .5], [27, 2, .8, .47], [50, 0, .95, .52]]],
  'Midnight Bloom': [[[23, 0, 1.3, .45], [52, 2, 1.15, .51]], [[12, 1, 1.15, .46], [39, 0, 1.3, .52]]],
  'Glass Garden': [[[6, 0, .6, .48], [29, 2, .75, .53], [49, 1, .68, .5]], [[14, 2, .65, .51], [35, 0, .7, .49], [56, 1, .75, .53]]],
  'Winter Light': [[[13, 0, 1.6, .45], [48, 1, 1.7, .49]], [[24, 1, 1.45, .46], [59, 0, 1.5, .5]]],
  'Slow Orbit': [[[26, 1, 1.65, .46], [58, 0, 1.5, .51]], [[15, 0, 1.55, .45], [48, 2, 1.7, .5]]],
  'Golden Echo': [[[11, 2, .9, .46], [36, 0, 1.05, .52], [54, 1, 1, .5]], [[18, 1, .95, .48], [43, 2, 1.1, .53], [60, 0, .9, .49]]],
};

function safeChordTones(chord: number[]): number[] {
  return chord.filter((note) => chord.every((other) => {
    const interval = ((note - other) % 12 + 12) % 12;
    return interval !== 1 && interval !== 11;
  }));
}

/** Small, repeatable performance changes keep a four-bar loop from sounding quantized. */
function performedEvent(
  composition: Composition, bar: number, position: number,
  note: number, duration: number, strength: number, voice: number,
): MelodyEvent {
  const variation = random01(composition.seed, bar, position, voice);
  const length = duration * (.92 + variation * .16);
  const barRoom = (16 - position) * 15 / composition.bpm - .035;
  return {
    note,
    duration: Math.min(length, barRoom),
    strength: strength * (.86 + random01(composition.seed, bar, position, voice + 1) * .24),
    offset: position === 0 ? 0 : .01 + random01(composition.seed, bar, position, voice + 2) * .025,
  };
}

function lyricalMelodyEvent(composition: Composition, bar: number, position: number): MelodyEvent | null {
  const motif = LYRICAL_MOTIFS[Math.floor(random01(composition.seed, 610) * LYRICAL_MOTIFS.length)];
  const cycle = Math.floor(bar / 4);
  const phrase = motif[(cycle + Math.floor(random01(composition.seed, 611) * 2)) % 2];
  const index = phrase.findIndex(([phraseBar, onset]) => phraseBar === bar % 4 && onset === position);
  if (index < 0) return null;

  const [, , contour, strength] = phrase[index];
  const chord = chordNotes(composition, bar);
  const safe = safeChordTones(chord);
  const classes = new Set((safe.length ? safe : chord).map((note) => note % 12));
  const candidates = Array.from({ length: 18 }, (_, index) => index + 64)
    .filter((note) => classes.has(note % 12));
  const target = 71 + Math.floor(random01(composition.seed, 612) * 3) - 1 + contour;
  const note = candidates.reduce((best, candidate) => {
    const distance = Math.abs(candidate - target);
    const bestDistance = Math.abs(best - target);
    return distance < bestDistance || (distance === bestDistance &&
      (contour >= 0 ? candidate > best : candidate < best)) ? candidate : best;
  });
  const currentStep = (bar % 4) * 16 + position;
  const next = phrase[index + 1];
  const nextStep = next ? next[0] * 16 + next[1] : 64;
  const duration = Math.min(1.35, (nextStep - currentStep) * 15 / composition.bpm * .86);
  return performedEvent(composition, bar, position, note, duration, strength, 620);
}

/** Chord-aware lead: an occasional sung motif or the variant's sparse notes. */
export function ambientMelodyEvent(composition: Composition, bar: number, position: number): MelodyEvent | null {
  if (composition.leadStyle === 'lyrical') return lyricalMelodyEvent(composition, bar, position);
  const variant = composition.ambientVariant;
  const cycle = Math.floor(bar / 4);
  const phrase = PHRASES[variant][(cycle + Math.floor(random01(composition.seed, 201) * 2)) % 2];
  const event = phrase.find(([phraseBar, onset]) => phraseBar === bar % 4 && onset === position);
  if (!event) return null;
  const [, , toneIndex, duration, strength] = event;
  const chord = chordNotes(composition, bar);
  const safeTones = safeChordTones(chord);
  const notes = safeTones.length ? safeTones : chord;
  let note = notes[toneIndex % notes.length];
  while (note < 64) note += 12;
  while (note > 81) note -= 12;
  return performedEvent(composition, bar, position, note, duration, strength, 220);
}

/** High, quiet responses that avoid the lead and every pad semitone clash. */
export function textureEvent(composition: Composition, bar: number, position: number): MelodyEvent | null {
  const phrase = Math.floor(bar / 4);
  const phase = (phrase + Math.floor(random01(composition.seed, 410) * 2)) % 2;
  const event = TEXTURES[composition.ambientVariant][phase].find(([step]) => step === (bar % 4) * 16 + position);
  if (!event || ambientMelodyEvent(composition, bar, position)) return null;
  const chord = chordNotes(composition, bar);
  const safeClasses = new Set(safeChordTones(chord).map((note) => note % 12));
  const notes = Array.from({ length: 14 }, (_, index) => index + 80)
    .filter((note) => safeClasses.has(note % 12) && note > chord[chord.length - 1]);
  if (!notes.length) return null;
  const [, tone, duration, strength] = event;
  const note = notes[(tone + Math.floor(random01(composition.seed, phrase, 411) * 2)) % notes.length];
  return performedEvent(composition, bar, position, note, duration, strength, 430);
}

export function sectionEnergy(composition: Composition, bar: number): number {
  const section = Math.floor(bar / 8);
  return .75 + random01(composition.seed, section, 50) * .35;
}

/** Every next seed picks another Ambient variation, including across uint32 wrap. */
export function nextSeed(seed: number): number {
  const normalized = seed >>> 0;
  const count = AMBIENT_VARIANTS.length;
  const target = (normalized % count + 1 + Math.floor(random01(normalized, 97) * (count - 1))) % count;
  const mixed = (Math.imul(normalized ^ 0x9e3779b9, 1664525) + 1013904223) >>> 0;
  let next = mixed - mixed % count + target;
  if (next > 0xffffffff) next -= count;
  return next >>> 0;
}
