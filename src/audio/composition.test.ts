import { describe, expect, it } from 'vitest';
import {
  AMBIENT_VARIANTS, STYLES, ambientMelodyEvent, bassNote, chordNotes,
  makeComposition, melodyNote, nextSeed, sectionEnergy, textureEvent,
} from './composition';

const onsets = (seed: number, firstBar: number, event: typeof ambientMelodyEvent,
  leadStyle?: 'sparse' | 'lyrical') => {
  const composition = makeComposition(seed);
  if (leadStyle) composition.leadStyle = leadStyle;
  return Array.from({ length: 64 }, (_, step) => {
    const bar = firstBar + Math.floor(step / 16);
    return event(composition, bar, step % 16) ? step : -1;
  }).filter((step) => step >= 0);
};

describe('Ambient composition', () => {
  it('generates only Ambient, with all twelve variations available from seeds and Next', () => {
    expect(STYLES).toEqual(['Soft Ambient']);
    expect(AMBIENT_VARIANTS).toHaveLength(12);
    expect(new Set(Array.from({ length: 12 }, (_, seed) => makeComposition(seed).ambientVariant)))
      .toEqual(new Set(AMBIENT_VARIANTS));

    for (const initial of [0, 2, 123456789, 0xffffffff]) {
      let seed = initial;
      const heard = new Set<string>();
      for (let skip = 0; skip < 1024 && heard.size < AMBIENT_VARIANTS.length; skip++) {
        const current = makeComposition(seed);
        heard.add(current.ambientVariant);
        const next = nextSeed(seed);
        expect(next).not.toBe(seed >>> 0);
        expect(makeComposition(next).ambientVariant).not.toBe(current.ambientVariant);
        seed = next;
      }
      expect(heard).toEqual(new Set(AMBIENT_VARIANTS));
    }
  });

  it('is repeatable while producing many titles, harmonies and tempi', () => {
    const compositions = Array.from({ length: 1200 }, (_, seed) => makeComposition(seed));
    for (const composition of compositions) {
      expect(makeComposition(composition.seed)).toEqual(composition);
      expect(composition.style).toBe('Soft Ambient');
      expect(composition.progression).toHaveLength(4);
      expect(composition.bpm).toBeGreaterThanOrEqual(48);
      expect(composition.bpm).toBeLessThanOrEqual(74);
    }
    const titles = compositions.map((composition) => composition.title);
    expect(new Set(titles).size).toBeGreaterThan(400);
    expect(titles.filter((title) => title.split(' ').length === 2).length).toBeGreaterThan(300);
    expect(titles.filter((title) => title.split(' ').length >= 3).length).toBeGreaterThan(300);
    expect(titles.every((title) => title.length <= 30)).toBe(true);
    const titleCounts = new Map<string, number>();
    for (const title of titles) titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
    expect(Math.max(...titleCounts.values())).toBeLessThanOrEqual(8);
    expect(titles.slice(1).filter((title, index) => title === titles[index])).toHaveLength(0);
    for (const variant of AMBIENT_VARIANTS) {
      expect(new Set(compositions.filter((composition) => composition.ambientVariant === variant)
        .map((composition) => composition.title)).size).toBeGreaterThan(35);
    }
    expect(new Set(compositions.map((composition) => `${composition.key}:${composition.progression.join(',')}`)).size)
      .toBeGreaterThan(70);
    expect(new Set(compositions.map((composition) => composition.bpm)).size).toBeGreaterThan(20);
    const leadStyles = compositions.map((composition) => composition.leadStyle);
    expect(leadStyles.filter((style) => style === 'lyrical').length).toBeGreaterThan(300);
    expect(leadStyles.filter((style) => style === 'sparse').length).toBeGreaterThan(300);
  });

  it('gives each variation distinct harmony or mode and a distinct phrase rhythm', () => {
    const fingerprints = new Set<string>();
    const rhythms = new Set<string>();
    for (let seed = 0; seed < AMBIENT_VARIANTS.length; seed++) {
      const composition = makeComposition(seed);
      fingerprints.add(`${composition.scale.join(',')}:${composition.progression.join(',')}:${composition.bpm}`);
      const first = onsets(seed, 0, ambientMelodyEvent);
      const second = onsets(seed, 4, ambientMelodyEvent);
      expect(first.length).toBeGreaterThanOrEqual(composition.leadStyle === 'lyrical' ? 14 : 2);
      expect(first.length).toBeLessThanOrEqual(composition.leadStyle === 'lyrical' ? 16 : 5);
      expect(second).not.toEqual(first);
      rhythms.add(onsets(seed, 0, ambientMelodyEvent, 'sparse').join(','));
      expect(onsets(seed, 0, textureEvent).length).toBeGreaterThan(0);
    }
    expect(fingerprints.size).toBe(AMBIENT_VARIANTS.length);
    expect(rhythms.size).toBe(AMBIENT_VARIANTS.length);
    expect(makeComposition(8).scale).toHaveLength(5); // Glass Garden is pentatonic.
    expect(makeComposition(4).scale).toContain(6); // Starlit Memory is Lydian.
  });

  it('repeats a singable hook while changing its answer in lyrical tracks', () => {
    const lyricalSeeds = Array.from({ length: 120 }, (_, seed) => seed)
      .filter((seed) => makeComposition(seed).leadStyle === 'lyrical');
    expect(lyricalSeeds.length).toBeGreaterThan(20);
    for (const seed of lyricalSeeds) {
      const composition = makeComposition(seed);
      const first = onsets(seed, 0, ambientMelodyEvent);
      const answer = onsets(seed, 4, ambientMelodyEvent);
      expect(first).toEqual(onsets(seed, 8, ambientMelodyEvent));
      expect(first.filter((step) => step < 16)).toEqual(answer.filter((step) => step < 16));
      expect(first).not.toEqual(answer);
      const pitches = Array.from({ length: 64 }, (_, step) =>
        ambientMelodyEvent(composition, Math.floor(step / 16), step % 16)?.note)
        .filter((note): note is number => note !== undefined);
      expect(new Set(pitches).size).toBeGreaterThanOrEqual(4);
      expect(pitches.some((note, index) => index > 0 && note > pitches[index - 1])).toBe(true);
      expect(pitches.some((note, index) => index > 0 && note < pitches[index - 1])).toBe(true);
    }
  });

  it('keeps bass, pads, lead and responses in key without semitone clashes', () => {
    for (let seed = 0; seed < 120; seed++) {
      const composition = makeComposition(seed);
      for (let bar = 0; bar < 16; bar++) {
        const chord = chordNotes(composition, bar);
        const chordClasses = chord.map((note) => note % 12);
        const root = bassNote(composition, bar);
        expect(chord).toHaveLength(4);
        expect(chord).toEqual([...chord].sort((left, right) => left - right));
        expect(chordClasses).toContain(root % 12);
        for (const note of [...chord, root, melodyNote(composition, bar, 0)]) {
          const relative = ((note - composition.tonicMidi) % 12 + 12) % 12;
          expect(composition.scale).toContain(relative);
        }
        for (let position = 0; position < 16; position++) {
          const lead = ambientMelodyEvent(composition, bar, position);
          const response = textureEvent(composition, bar, position);
          expect(ambientMelodyEvent(composition, bar, position)).toEqual(lead);
          expect(textureEvent(composition, bar, position)).toEqual(response);
          if (lead) expect(response).toBeNull();
          for (const event of [lead, response]) {
            if (!event) continue;
            expect(chordClasses).toContain(event.note % 12);
            expect(chordClasses.every((chordClass) => {
              const interval = (event.note - chordClass + 120) % 12;
              return interval !== 1 && interval !== 11;
            })).toBe(true);
            expect(composition.scale).toContain(((event.note - composition.tonicMidi) % 12 + 12) % 12);
            expect(event.duration).toBeGreaterThan(0);
            expect(event.duration).toBeLessThanOrEqual((16 - position) * 15 / composition.bpm - .03);
            expect(event.offset).toBeGreaterThanOrEqual(0);
            expect(event.offset).toBeLessThanOrEqual(.035);
            expect(event.duration + event.offset).toBeLessThanOrEqual((16 - position) * 15 / composition.bpm);
          }
          if (lead) {
            expect(lead.note).toBeGreaterThanOrEqual(64);
            expect(lead.note).toBeLessThanOrEqual(81);
          }
          if (response) {
            expect(response.note).toBeGreaterThan(chord[chord.length - 1]);
            expect(response.note).toBeGreaterThanOrEqual(80);
            expect(response.note).toBeLessThanOrEqual(93);
          }
        }
      }
    }
  });

  it('varies repeated phrases with small, repeatable performance changes', () => {
    const composition = makeComposition(0);
    const repeatedEvents = Array.from({ length: 4 * 16 }, (_, step) => {
      const bar = Math.floor(step / 16);
      const position = step % 16;
      return [ambientMelodyEvent(composition, bar, position),
        ambientMelodyEvent(composition, bar + 8, position)] as const;
    }).filter(([first, repeat]) => first !== null && repeat !== null);
    expect(repeatedEvents.length).toBeGreaterThan(0);
    expect(repeatedEvents.some(([first, repeat]) => first!.strength !== repeat!.strength)).toBe(true);

    const responses = Array.from({ length: 32 * 16 }, (_, step) =>
      textureEvent(composition, Math.floor(step / 16), step % 16)).filter((event) => event !== null);
    expect(responses.some((event) => event.offset > 0)).toBe(true);
  });

  it('changes the gentle section dynamics without changing notes inside a section', () => {
    const composition = makeComposition(42);
    expect(sectionEnergy(composition, 0)).toBe(sectionEnergy(composition, 7));
    expect(sectionEnergy(composition, 0)).toBeGreaterThanOrEqual(.75);
    expect(sectionEnergy(composition, 0)).toBeLessThanOrEqual(1.1);
    expect(new Set(Array.from({ length: 8 }, (_, section) => sectionEnergy(composition, section * 8))).size)
      .toBeGreaterThan(1);
  });
});
