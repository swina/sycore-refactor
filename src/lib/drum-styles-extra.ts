/**
 * drum-styles-extra.ts — the Drum Machine's styles that align it with the Sequencer and the Chord
 * Prog (gen-styles.ts): Acid, Minimal, Industrial, Reggae, Electronic, Arpeggio, Berlin School.
 *
 * Written as one string per track (Kick, Snare, Closed HH, Open HH, Clap, Tom 1, Tom 2, Cymbal), one
 * character per 1/16 step, read into the store's step values (useDrumMachineStore's DRUM_STYLES):
 *   .  off        x  hit        A  accent        r  ratchet (2)        R  ratchet (3)
 *   o  a hit 60 % of the time   g  a ghost, 30 %  h  a ghost, 15 %
 */
type StepValue = number | 'A' | [number, number | 'A']

const CELL: Record<string, StepValue> = { '.': 0, x: 1, A: 'A', r: [1, 2], R: [1, 3], o: 0.6, g: 0.3, h: 0.15 }

/** One track's string → 16 step values (spaces ignored). */
export function parseDrumRow(row: string): StepValue[] {
  const cells = row.replace(/\s+/g, '').split('')
  if (cells.length !== 16) throw new Error(`drum row of ${cells.length} steps: ${row}`)
  return cells.map(c => {
    if (!(c in CELL)) throw new Error(`drum row: unknown cell "${c}"`)
    return CELL[c]
  })
}
const v = (...rows: string[]) => rows.map(parseDrumRow)

export interface DrumStyleDef { variants: StepValue[][][]; velMin: number; velMax: number; ghostVelMax: number }
export interface DrumStyleVariationDef { ghostSeedChance: number; accentShiftChance: number; ratchetChance: number; maxRatchet: number; velJitter: number }

//                        Kick                 Snare                Closed HH            Open HH              Clap                 Tom 1                Tom 2                Cymbal
export const EXTRA_DRUM_STYLES: Record<string, DrumStyleDef> = {
  // 909 four-on-the-floor under a 303: offbeat open hats, 16th closed hats, a clap on 2 and 4
  Acid: {
    variants: [
      v('x...x...x...x...', '................', 'xgxgxgxgxgxgxgxg', '..x...x...x...x.', '....A.......A...', '................', '................', 'A...............'),
      v('x...x...x...x.g.', '.......g.......g', 'xxxxxxxxxxxxxxxx', '..x...x...x...o.', '....A.......A...', '..........g.....', '................', '................'),
      v('x...x...x..gx...', '....x.......x..r', 'xgxxxgxxxgxxxgxx', '..x...x...x...x.', '....A.......A...', '................', '.............g..', 'A...............'),
    ],
    velMin: 85, velMax: 118, ghostVelMax: 55,
  },
  // sparse, clicky: the kick, a few hats, a percussion note off the grid
  Minimal: {
    variants: [
      v('x...x...x...x...', '................', '..g...x...g...x.', '................', '.......g.......g', '.....g..........', '................', '................'),
      v('x...x...x...x...', '............g...', 'h.x.h.x.h.x.h.x.', '..........o.....', '....x...........', '...........g....', '......g.........', '................'),
      v('x.....x.x...x...', '................', '..x...x...x...x.', '...............g', '....g.......x...', '..g.......g.....', '................', '................'),
    ],
    velMin: 70, velMax: 100, ghostVelMax: 45,
  },
  // hard, mechanical: ratcheted kicks, accented snares, toms and crashes
  Industrial: {
    variants: [
      v('x..xx..rx..xx..r', '....A.......A...', 'x.x.x.x.x.x.x.x.', '................', '....x.......x...', '..........x.....', '..............x.', 'A.......o.......'),
      v('x.xrx...x.xrx...', '....A..g....A..g', 'xxxxxxxxxxxxxxxx', '......o.......o.', '....A.......A...', '.x.......x......', '...x.......x....', 'A...............'),
      v('Ax..x.x.Ax..x.x.', '....A.......A.rR', 'x.xxx.xxx.xxx.xx', '..o.......o.....', '................', '..........x.x...', '..............xx', 'A.......A.......'),
    ],
    velMin: 100, velMax: 127, ghostVelMax: 60,
  },
  // one drop: kick and snare together on beat 3, hats on the 8ths, the open hat on the "and"
  Reggae: {
    variants: [
      v('........x.......', '........A.......', 'x.x.x.x.x.x.x.x.', '......o.......o.', '................', '................', '................', '................'),
      v('........x.......', '........A......g', 'x.xgx.xgx.xgx.xg', '..o.......o.....', '................', '..............g.', '...............g', '................'),
      // steppers: the kick on every beat
      v('x...x...x...x...', '........A.......', 'x.x.x.x.x.x.x.x.', '..x.......x.....', '................', '................', '................', 'o...............'),
    ],
    velMin: 72, velMax: 108, ghostVelMax: 45,
  },
  // synth-pop / electro: kick on the beats (a push before 3), snare + clap on 2 and 4
  Electronic: {
    variants: [
      v('x...x...x...x...', '....A.......A...', 'x.x.x.x.x.x.x.x.', '..............o.', '....x.......x...', '................', '................', 'A...............'),
      v('x.....x.x.......', '....A.......A...', 'xxxxxxxxxxxxxxxx', '..o.......o.....', '................', '..........g.....', '................', '................'),
      v('x..x..x...x.....', '....A.......A..g', 'x.xgx.xgx.xgx.xg', '................', '....x.......x...', '.............g..', '..............g.', 'A...............'),
    ],
    velMin: 82, velMax: 115, ghostVelMax: 50,
  },
  // trance / driving: four on the floor, open hats on the offbeats, rolling 16ths
  Arpeggio: {
    variants: [
      v('x...x...x...x...', '................', 'xxxxxxxxxxxxxxxx', '..x...x...x...x.', '....x.......x...', '................', '................', 'A...............'),
      v('x...x...x...x...', '....x.......x...', 'xgxxxgxxxgxxxgxx', '..x...x...x...x.', '................', '................', '................', '................'),
      v('x...x...x...x...', '............g.rR', 'xxxxxxxxxxxxxxxx', '..x...x...x...x.', '....A.......A...', '................', '..............g.', 'A...............'),
    ],
    velMin: 88, velMax: 118, ghostVelMax: 50,
  },
  // motorik (Neu!, kosmische): a steady kick and snare, even 8ths, barely any fills
  'Berlin School': {
    variants: [
      v('x.....x.x.......', '....x.......x...', 'x.x.x.x.x.x.x.x.', '................', '................', '................', '................', '................'),
      v('x.....x.x.....x.', '....x.......x...', 'xxxxxxxxxxxxxxxx', '................', '................', '................', '................', 'o...............'),
      v('x...x...x...x...', '....x.......x...', 'x.x.x.x.x.x.x.x.', '..............g.', '................', '..........h.....', '...........h....', '................'),
    ],
    velMin: 80, velMax: 100, ghostVelMax: 45,
  },
}

export const EXTRA_DRUM_STYLE_VARIATION: Record<string, DrumStyleVariationDef> = {
  Acid:            { ghostSeedChance: 0.06, accentShiftChance: 0.10, ratchetChance: 0.05, maxRatchet: 2, velJitter: 8 },
  Minimal:         { ghostSeedChance: 0.08, accentShiftChance: 0.04, ratchetChance: 0.03, maxRatchet: 2, velJitter: 10 },
  Industrial:      { ghostSeedChance: 0.05, accentShiftChance: 0.15, ratchetChance: 0.12, maxRatchet: 4, velJitter: 6 },
  Reggae:          { ghostSeedChance: 0.10, accentShiftChance: 0.04, ratchetChance: 0.02, maxRatchet: 2, velJitter: 10 },
  Electronic:      { ghostSeedChance: 0.05, accentShiftChance: 0.06, ratchetChance: 0.04, maxRatchet: 2, velJitter: 6 },
  Arpeggio:        { ghostSeedChance: 0.04, accentShiftChance: 0.06, ratchetChance: 0.04, maxRatchet: 3, velJitter: 5 },
  'Berlin School': { ghostSeedChance: 0.02, accentShiftChance: 0.02, ratchetChance: 0.00, maxRatchet: 2, velJitter: 4 },
}
