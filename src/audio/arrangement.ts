import { random01, type AmbientVariant, type Composition } from './composition';

export type SectionRole = 'intro' | 'theme' | 'lift' | 'breath' | 'reprise' | 'crest';
type Pattern = 'wash' | 'sway' | 'echo' | 'tide' | 'ripple';
type Hit = readonly [position: number, beats: number, strength: number];

export type ArrangementStep = {
  role: SectionRole;
  chord?: { beats: number; strength: number };
  bass?: { beats: number; strength: number; tone: 'root' | 'fifth' };
  kick?: number;
  leadLevel: number;
  textureLevel: number;
  energy: number;
};

// A shared vocabulary of quiet accompaniment figures. Each scene combines
// them differently, while the form changes its density over time.
const PATTERNS: Record<Pattern, readonly Hit[]> = {
  wash: [[0, 3.75, .82]],
  sway: [[0, 2.2, .78], [8, 1.55, .49]],
  echo: [[0, 3.0, .79], [12, .8, .31]],
  tide: [[0, 2.45, .78], [10, 1.15, .42]],
  ripple: [[0, 1.65, .75], [6, 1.1, .4], [11, 1.0, .37]],
};

const SCENE_PATTERNS: Record<AmbientVariant, { theme: Pattern; answer: Pattern; crest: Pattern; drums: boolean }> = {
  'Cloud Drift': { theme: 'wash', answer: 'echo', crest: 'sway', drums: true },
  'Rain Window': { theme: 'sway', answer: 'tide', crest: 'ripple', drums: true },
  'Dawn Haze': { theme: 'wash', answer: 'tide', crest: 'sway', drums: false },
  'Blue Hour': { theme: 'echo', answer: 'wash', crest: 'tide', drums: false },
  'Starlit Memory': { theme: 'wash', answer: 'echo', crest: 'tide', drums: false },
  'Velvet Tide': { theme: 'wash', answer: 'tide', crest: 'sway', drums: false },
  'Faded Polaroid': { theme: 'tide', answer: 'sway', crest: 'ripple', drums: false },
  'Midnight Bloom': { theme: 'echo', answer: 'wash', crest: 'tide', drums: false },
  'Glass Garden': { theme: 'sway', answer: 'ripple', crest: 'ripple', drums: false },
  'Winter Light': { theme: 'wash', answer: 'echo', crest: 'sway', drums: false },
  'Slow Orbit': { theme: 'wash', answer: 'tide', crest: 'echo', drums: false },
  'Golden Echo': { theme: 'sway', answer: 'tide', crest: 'ripple', drums: false },
};

// Forty-eight bars make one arc. Successive arcs rotate the middle sections;
// the starting order depends on the track seed.
const FORMS: readonly (readonly SectionRole[])[] = [
  ['intro', 'theme', 'lift', 'breath', 'reprise', 'crest'],
  ['intro', 'theme', 'breath', 'lift', 'reprise', 'crest'],
  ['intro', 'theme', 'lift', 'reprise', 'breath', 'crest'],
];

const ROLE_LEVELS: Record<SectionRole, {
  chord: number; bass: number; lead: number; texture: number; energy: number;
}> = {
  intro: { chord: .7, bass: .67, lead: .65, texture: .65, energy: .82 },
  theme: { chord: 1, bass: 1, lead: 1, texture: .85, energy: .96 },
  lift: { chord: .91, bass: 1.02, lead: 1.12, texture: .67, energy: 1.06 },
  breath: { chord: .63, bass: .62, lead: .72, texture: .9, energy: .78 },
  reprise: { chord: .92, bass: .95, lead: 1.07, texture: .78, energy: 1 },
  crest: { chord: .86, bass: 1, lead: 1.17, texture: .62, energy: 1.1 },
};

export function sectionRole(composition: Composition, bar: number): SectionRole {
  const arc = Math.floor(bar / 48);
  const firstForm = Math.floor(random01(composition.seed, 600) * FORMS.length);
  const form = FORMS[(firstForm + arc) % FORMS.length];
  return form[Math.floor((bar % 48) / 8)];
}

export function arrangementStep(composition: Composition, bar: number, position: number): ArrangementStep {
  const role = sectionRole(composition, bar);
  const scene = SCENE_PATTERNS[composition.ambientVariant];
  const levels = ROLE_LEVELS[role];
  const inSection = bar % 8;
  const phrase = Math.floor(inSection / 2);
  let pattern: Pattern = role === 'intro' || role === 'breath' ? 'wash'
    : role === 'theme' ? scene.theme
      : role === 'reprise' ? scene.answer : scene.crest;
  // The latter half of a section answers the opening figure. Odd pairs leave
  // more room for the lead, even in the active sections.
  if (role !== 'intro' && role !== 'breath' && phrase === 2) pattern = scene.answer;
  if ((role === 'lift' || role === 'crest') && phrase === 3) pattern = scene.theme;
  const hit = PATTERNS[pattern].find(([onset]) => onset === position);
  const lastBar = inSection === 7;
  const secondary = position !== 0;
  const chord = hit && !(lastBar && secondary) ? {
    beats: hit[1],
    strength: hit[2] * levels.chord * (lastBar ? .78 : 1),
  } : undefined;
  const bassOnBeat = position === 0 && !(role === 'intro' && inSection < 2)
    && !(role === 'breath' && inSection % 2 === 1);
  const fifth = position === 8 && (role === 'lift' || role === 'crest') && inSection % 2 === 0;
  const bass = bassOnBeat ? { beats: role === 'breath' ? 2 : 1.75, strength: .62 * levels.bass, tone: 'root' as const }
    : fifth ? { beats: 1.1, strength: .34 * levels.bass, tone: 'fifth' as const } : undefined;
  const kick = scene.drums && position === 0 && role !== 'intro' && role !== 'breath'
    && (role === 'lift' || role === 'crest' || bar % 2 === 0) ? .2 * levels.energy : undefined;
  return {
    role, chord, bass, kick,
    leadLevel: role === 'intro' && inSection < 2 ? 0 : levels.lead,
    textureLevel: levels.texture,
    energy: levels.energy,
  };
}
