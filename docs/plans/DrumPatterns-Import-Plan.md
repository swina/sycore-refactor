# Drum Patterns Import Plan

## Source
Repository: https://github.com/stephenhandley/DrumMachinePatterns.git
- 200 Drum Machine Patterns (Rene-Pierre Bardet)
- 260 Drum Machine Patterns (Rene-Pierre Bardet)

## Files to create
- `src/data/imported-patterns.ts` — All patterns organized by merged category, plus track mapping constant

## Files to modify
1. `src/types/drum-machine.ts` — Add `ImportedPattern`, `ImportedPatternCategory` types
2. `src/stores/useDrumMachineStore.ts` — Add `loadImportedPattern()` function
3. `src/components/DrumMachine.vue` — Add UI for browsing/loading imported patterns

## Track mapping (repo sound → sycore track index)
| Repo sound | Sycore track     | Index |
|------------|------------------|-------|
| BassDrum   | Kick             | 0     |
| SnareDrum  | Snare            | 1     |
| ClosedHiHat| Closed HH        | 2     |
| OpenHiHat  | Open HH          | 3     |
| Clap       | Clap             | 4     |
| HighTom    | Tom 1            | 5     |
| MediumTom  | Tom 2            | 6     |
| LowTom     | Tom 2            | 6     |
| Cymbal     | Cymbal           | 7     |
| RimShot    | Snare            | 1     |
| Cowbell    | skip             | -1    |
| Tambourine | skip             | -1    |

## Pattern categories (merged from both books)
Afro-Cuban, Blues, Boogie, Bossa Nova, Cha-Cha, Charleston, Disco, Funk, Jazz, March/Paso, Pop, Reggae, Rhythm & Blues, Rock, Samba, Shuffle, Ska, Slow, Swing, Tango, Twist, Waltz, Ballad, Endings

## Notes
- Flam → treated as Note with accent (velocity 85)
- 12-step patterns (Blues, Waltz) kept at native length
- Cowbell/Tambourine skipped (no matching track)
- Only step grids are overwritten; sound assignments, FX, volumes are preserved