import { describe, expect, it } from 'vitest';
import { AMBIENT_VARIANTS, bassFifthNote, bassNote, chordNotes, makeComposition } from './composition';
import { arrangementStep, sectionRole } from './arrangement';

describe('song arrangement', () => {
  it('builds repeatable, seed-selected arcs with a quiet opening, return, and peak', () => {
    const forms = new Set<string>();
    for (let seed = 0; seed < 120; seed++) {
      const composition = makeComposition(seed);
      const roles = Array.from({ length: 6 }, (_, section) => sectionRole(composition, section * 8));
      expect(roles[0]).toBe('intro');
      expect(roles[1]).toBe('theme');
      expect(roles).toContain('breath');
      expect(roles).toContain('reprise');
      expect(roles).toContain('crest');
      expect(new Set(roles).size).toBe(6);
      for (let bar = 0; bar < 96; bar++) {
        expect(sectionRole(composition, bar)).toBe(sectionRole(makeComposition(seed), bar));
        expect(sectionRole(composition, bar)).toBe(sectionRole(composition, Math.floor(bar / 8) * 8));
      }
      forms.add(roles.join(','));
      const nextArc = Array.from({ length: 6 }, (_, section) => sectionRole(composition, 48 + section * 8));
      expect(nextArc).not.toEqual(roles);
    }
    expect(forms.size).toBeGreaterThanOrEqual(3);
  });

  it('changes pad, bass, percussion, and lead space within every scene', () => {
    const signatures = new Set<string>();
    for (let seed = 0; seed < AMBIENT_VARIANTS.length; seed++) {
      const composition = makeComposition(seed);
      const sectionSignatures = Array.from({ length: 6 }, (_, section) => {
        const cues = Array.from({ length: 8 * 16 }, (_, step) =>
          arrangementStep(composition, section * 8 + Math.floor(step / 16), step % 16));
        return JSON.stringify([
          cues.flatMap((cue, index) => cue.chord ? [index] : []),
          cues.flatMap((cue, index) => cue.bass ? [`${index}:${cue.bass.tone}`] : []),
          cues.filter((cue) => cue.kick).length,
          cues[0].leadLevel,
        ]);
      });
      expect(new Set(sectionSignatures).size).toBeGreaterThanOrEqual(4);
      signatures.add(sectionSignatures.join('|'));
      const count = (role: string, key: 'chord' | 'bass') => {
        const section = Array.from({ length: 6 }, (_, index) => index)
          .find((index) => sectionRole(composition, index * 8) === role)!;
        return Array.from({ length: 8 * 16 }, (_, step) =>
          arrangementStep(composition, section * 8 + Math.floor(step / 16), step % 16))
          .filter((cue) => cue[key]).length;
      };
      expect(count('crest', 'chord')).toBeGreaterThan(count('intro', 'chord'));
      expect(count('breath', 'bass')).toBeLessThan(count('theme', 'bass'));
      expect(arrangementStep(composition, 0, 0).leadLevel).toBe(0);
      expect(arrangementStep(composition, 2, 0).leadLevel).toBeGreaterThan(0);
      expect(arrangementStep(composition, 0, 0).bass).toBeUndefined();
      expect(arrangementStep(composition, 2, 0).bass).toBeDefined();
      for (let bar = 0; bar < 48; bar++) {
        for (let position = 0; position < 16; position++) {
          const cue = arrangementStep(composition, bar, position);
          expect(cue.energy).toBeGreaterThan(0);
          if (cue.chord) expect(cue.chord.beats).toBeLessThanOrEqual(4 - position / 4);
          if (cue.bass) expect(cue.bass.beats).toBeLessThanOrEqual(4 - position / 4);
          if (cue.bass?.tone === 'fifth') {
            const note = bassFifthNote(composition, bar);
            expect(composition.scale).toContain(((note - composition.tonicMidi) % 12 + 12) % 12);
            expect(chordNotes(composition, bar).map((tone) => tone % 12)).toContain(note % 12);
          }
        }
      }
    }
    expect(signatures.size).toBeGreaterThanOrEqual(8);
  });

  it('keeps the bass fifth on a chord tone through inverted sections in every scene', () => {
    for (let seed = 0; seed < AMBIENT_VARIANTS.length; seed++) {
      const composition = makeComposition(seed);
      let invertedFifths = 0;
      for (let bar = 8; bar < 288; bar++) {
        if (arrangementStep(composition, bar, 8).bass?.tone !== 'fifth') continue;
        const chord = chordNotes(composition, bar);
        const fifth = bassFifthNote(composition, bar);
        expect(chord.map((note) => note % 12)).toContain(fifth % 12);
        if (chord[0] % 12 !== bassNote(composition, bar) % 12) invertedFifths++;
      }
      expect(invertedFifths).toBeGreaterThan(0);
    }
  });
});
