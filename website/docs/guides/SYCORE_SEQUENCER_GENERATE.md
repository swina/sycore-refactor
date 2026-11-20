# Sequencer — Generate

## Overview

Generate writes a new pattern into the Sequencer's active bank (A–H), following Style, Key / Scale, octaves, Density, Rhythm and Melody. With **Vary** below 100 it replaces only part of the pattern and keeps the rest.

Where to trigger it:

| Where | Control | Notes |
| --- | --- | --- |
| EDIT panel | **Generate** | every option, in the generation row |
| Play View (Performance) | **Generate** | Style, Oct / Range, Arp notes, Density, Melody, Rhythm (Sync / Rot), Vary, P1 / P2 RND%; the P1 / P2 CC is picked in EDIT |
| Rig Controller (LIVE) | **GEN** on the Seq row | generates in the Chord Prog's key |
| Rig Controller (LIVE) | **Shift + GEN** (Mutate) | changes part of the pattern: Vary, or 25 % when Vary is at 100 |
| EDIT panel / Play View | **↻ P1**, **↻ P2**, **↻ P1+P2** | P1 / P2 only: new values on every step, the sequence kept |
| MIDI Learn | `seq_vary` | Vary from an encoder |

Every Generate is recorded in the session journal (one take before, one after), so you can go back. The generation settings are saved per bank.

## Options

The options are listed in the order Generate uses them: Style sets the character, Key / Scale the notes, Rhythm which steps play, Melody which notes.

| Option | Values | Effect |
| --- | --- | --- |
| **Style** | House, Techno, HipHop, Trap, Acid, Funk, Jazz, Ambient, Drum&Bass, Minimal, Latin, Industrial, Reggae, Pop, Rock, Electronic, EDM, Urban, Arpeggio, Berlin School (the same as the Drum Machine and the Chord Prog); bass lines: Root-5-Oct, Offbeat, Acid Slide, Walking | sets the starting Density and octaves, and gives the velocity profile, gate character and accent grid; Drum&Bass uses 32 steps, Acid adds slides automatically |
| **Key / Scale** | 12 keys; Major, Minor, Harmonic Minor, Pentatonic Maj / Min, Blues, Dorian, Phrygian, Lydian, Mixolydian, Locrian, Whole Tone, Hungarian Minor, Chromatic | every generated note stays in the scale |
| **Base Octave / Range** | octave 0–8, range ±3 | the span of the notes; a top at octave 3 or below = a bass line |
| **Density** | 0–100 % | how many steps are on |
| **Rhythm: Wgt** (default) | **Sync** 0–100 | strong positions first (1, half bar, beats, 8ths, 16ths) plus the style's accents; Sync moves the weight to the weak positions (0 = on the beat, 30–60 = groove, 100 = offbeat). With Sync < 50 and Density ≥ 25 % the 1 always plays |
| **Rhythm: Eucl** | **Rot** | the Density onsets spread evenly (4/16, 3/8 tresillo, 5/16…); Rot rotates by one step |
| **Rhythm: Rnd** | — | every step equally likely |
| **Melody: Line** (default) | — | a motif (half a bar at 16 steps, one bar at 32) repeated and varied at the end (A A′, A A′ A A″); stepwise motion, a leap followed by a step the other way, tonic-chord notes on the strong positions, ending on the tonic |
| **Melody: Classic** | — | a random scale note per step, in a random octave of the range |
| **Chords** | Max Polyphony 1–4 | steps with chords built on the scale, from progressions typical of the style |
| **Arpeggio** (Style) | Arp mode (Up, Down…); notes **1-3-5**, **+7**, **Scale** | every step on, in the mode's order; 1-3-5 = the key's chord |
| **Vary** | 0–100 (default 100) | the share of the pattern replaced (see below) |
| **P1 / P2 RND%** | −100…+100 | each step's P1 / P2 = the preset's value for that CC, moved at random: + towards 127, − towards 0, 0 = the preset's value |
| **↻ P1 / ↻ P2 / ↻ P1+P2** | — | new P1 / P2 values only (the same rule as RND%), the notes and the rhythm untouched |
| **Follow** | Degree (default) / Chrom | how the pattern follows incoming chords and notes: by scale degree, or by semitones |
| **Fit** (per lane, lanes strip) | SCL / CHD | with Degree: CHD fits the notes onto the Chord Prog's chord (beats on a chord tone, no b9 against it), so borrowed chords don't clash; default CHD on Bass / Arp |

Rhythm and Melody apply in melodic mode and are saved with the bank. P1 / P2 are written in every mode (melodic, Chords, Arpeggio).

## Vary and Mutate (Lock)

Vary changes the pattern a little at a time, like a Turing Machine's lock.

1. Generate makes a new pattern with the same rules.
2. Only Vary % of the positions take the new step; the others stay as they were.
3. Positions are counted within the motif, so a change lands in every repeat of it and the A A′ structure stays.
4. At least one position always changes.

Values: **100** = a whole new pattern (default), **25** = a quarter, **0** = nothing. **Mutate** (Shift + GEN on the Rig) uses Vary when it is between 1 and 99, otherwise 25 %. With Chords, Arpeggio or Melody Classic the block is the whole pattern.

## Links with the other apps

- **Chord Prog → the Rig's GEN:** GEN generates in the Chord Prog's key. It keeps the scale when it is of the same family (e.g. Pentatonic Min in a minor key), otherwise it switches to Major / Minor. With no Major / Minor in the Chord Prog (Modal Chords, a genre file, Both), the mode is detected from its chords (Dorian, Mixolydian…) and the lane takes exactly that scale; the same for Gen **Key: CP**.
- **Chord Prog while the Sequencer plays:** transposes the pattern (Follow Degree: by the root read from the chord's name). With *Drums + Sequencer follow* the sections switch the bank.
- **Independent Play / Stop:** a Chord Prog chord or slot doesn't start the Sequencer, and its stop doesn't stop it. A routed keyboard, with AUTO on, still starts it.
- **Seq Free (Rig):** the Sequencer ignores the Chord Prog's notes, stop and section changes.
- **P1 / P2 → Map (Ableton Live):** the generated values also move Map · Live Instruments slots, with a row per track in the **→ Map** modal. SY.CORE Link 1.8 is needed for the tracks the Map isn't driving.

## References

| What | File |
| --- | --- |
| User guide | [Sequencer](./SYCORE_SEQUENCER.md) (§5.3 Generating a Pattern, §5.5 P1 / P2) |
| Engine: Generate, the Rig's GEN, Vary | `src/core/engines/sequencer.js` (`_generateSequence`, `_generateFresh`, `_rigGenerate`) |
| Rhythm (Wgt / Eucl / Rnd) | `src/lib/seq-gen/rhythm.ts` |
| Melody (Line / Classic) | `src/lib/seq-gen/melody.ts` |
| Harmony and Arpeggio | `src/lib/seq-gen/harmony.ts` |
| P1 / P2 RND% | `src/lib/seq-gen/params.ts` |
| Vary / Mutate | `src/lib/seq-gen/mutate.ts` |
| Phase plan | `docs/plans/sequencer-generation.md` |
