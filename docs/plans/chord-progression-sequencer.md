# Chord Progression Sequencer — Implementation Plan

## Context

The app has a rich step sequencer (`StepSequencer.vue`) and a large library of chord progression data (`src/data/progressions/`). This feature adds a dedicated **Chord Progression Sequencer** panel that treats each step as a full chord (from the progression library), with per-step musical duration and velocity, plus generation and save/recall of custom progressions.

---

## Data Format Notes

**Key files** (`01-CMajor-Aminor.json` … `12-BMajor-G#minor.json`):
```json
{
  "A bIIM iv III i": [
    ["A#M", [70, 62, 65, 46]],
    ["Dm",  [50, 53, 57]]
  ]
}
```
Each entry: `[chordName: string, midiNotes: number[]]`

**`Custom 1.json`** uses a different nesting: `[displayName, [typeName, midiNotes[]]]`.  
The progression loader must normalize both formats into `{ chordName: string, notes: number[] }`.

---

## Step Data Structure

```ts
interface ChordStep {
  active: boolean
  chordName: string    // e.g. "Am7"
  notes: number[]      // MIDI note numbers
  velocity: number     // 0–127; 0 = skip (notes off)
  duration: string     // Tone.js notation: '8m'|'4m'|'2m'|'1m'|'2n'|'4n'|'8n'|'16n'|'32n'|'64n'|'128n'
  gate: number         // 0–100 % of duration as sustain
}
```

Duration range: `8m` (8/1) → `128n` (1/128), stored as Tone.js strings.  
`DURATION_OPTIONS`: `['8m','4m','2m','1m','2n','4n','8n','16n','32n','64n','128n']`

---

## New Files

### `src/stores/useChordProgStore.js`
Pinia store containing:
- `steps: Ref<ChordStep[]>` — always 16 elements; `numSteps: Ref<number>` (1–16)
- `isPlaying`, `currentStep`, `selectedStepIdx`, `selectedKey`, `playMode` (`'chord'|'arp'`), `arpRate`
- `playStateRef` — plain non-reactive object mutated in the Tone.js callback (mirrors StepSequencer pattern)
- `watch(steps)` → syncs into `playStateRef.current` immediately
- `watch(arpStore.arpBpm)` → updates Tone.js transport BPM
- IDB actions: `saveToLibrary(name)`, `loadLibrary()`, `deleteFromLibrary(id)` — subcollection `'chord_progressions'`
- `generateFromProgression(progressionData)` — maps chord `i` to step `i % numSteps`
- `generateAlgorithmic(style, key)` — picks a random named progression from the key file
- localStorage session persistence under `'SYCORE_CHORD_PROG_STATE'`

### `src/composables/useProgressionLoader.js`
- `loadKeyFile(keyIndex: 0..11)` — dynamic `import()` of the matching JSON (Vite `/* @vite-ignore */`)
- `loadModalChords()` — lazy-loads `ModalChords.json` on first call (587 KB), caches result, exposes `loading` ref
- Returns `progressionData`, `progressionNames`, `loading`
- Normalizes both data formats to `{ chordName, notes }`

### `src/composables/useChordProgPlayback.js`
Isolated playback composable:
- `scheduleRepeat('16n')` tick with a running `tickAccumulator` in `playStateRef` tracking when each variable-duration step fires
- `durationInTicks = Tone.Time(step.duration).toSeconds() / Tone.Time('16n').toSeconds()`
- Velocity 0 → step skipped
- Note-off via `window.setTimeout`: `durationMs * (gate / 100)`
- Arp mode: stagger each note by `new Tone.Time(arpRate).toMilliseconds()`
- `stop()`: clears repeat event, sends allNotesOff, clears all pending timeouts (tracked in a `Set`)

### `src/components/ChordProgSequencer.vue`
Main component (~800 lines). Sections:

**Header bar** — BPM display (read-only from `arpStore.arpBpm`), play/stop, step-count (1–16), MIDI channel, Chord/Arp toggle, minimize button.

**Step grid** — 2 rows × 8 cells. Each cell shows:
- Chord name label
- Duration badge (click to cycle through `DURATION_OPTIONS`)
- Velocity bar (click to open inline editor)
- Active/inactive + current-playing highlight

**Chord Assignment panel** (shown when step selected):
- Key selector → named progression list → chord list
- "Assign to step" button; velocity & duration overrides; gate % slider

**Bottom tabs**:
1. **Library** — key dropdown, scrollable progression names; click to auto-assign chords to steps
2. **Generate** — key + style selectors, "Generate" button
3. **Save/Load** — user's saved sequences (IDB); save-with-name, delete

Draggable/resizable via `useDraggableResizable` (same as StepSequencer).

---

## Files to Modify

### `src/lib/idb.ts`
- Bump `DB_VERSION`: `6` → `7`
- Add to `STORES`: `user_chord_progressions: 'id'`
- Add to `parsePath` storeMap: `'chord_progressions': 'user_chord_progressions'`

### `src/stores/useUiStore.js`
- Add: `const isChordProgOpen = ref(false)`
- Add to `closeAll()`: `isChordProgOpen.value = false`
- Export `isChordProgOpen`

### `src/views/SynthApp.vue`
- Import `ChordProgSequencer`
- Add toolbar button: icon `Music2`, label `'Chord Progression Sequencer'`, state `isChordProgOpen`
- Add `<ChordProgSequencer v-show="uiStore.isChordProgOpen" …>` in the Teleport panel section

---

## Playback Mechanism

Single `scheduleRepeat('16n')` callback with a tick accumulator:
```
Each 16th-note tick:
  tickAccumulator++
  if tickAccumulator >= step.durationInTicks:
    fire step (send noteOn for all notes in step.notes)
    advance step pointer, reset tickAccumulator
```
CPS shares the Tone.js transport with StepSequencer — calling `toneStart()` when already running is idempotent. CPS reads `arpStore.arpBpm` as **read-only** and never emits `bpmChange`.

---

## Save/Load Flow

- **Session persistence**: localStorage `SYCORE_CHORD_PROG_STATE` (no auth required)
- **Library (auth required)**: IDB path `users/{uid}/chord_progressions/{id}` → `user_chord_progressions` with key `uid__docId`
- Load: `getDocs(collection(db, 'users', uid, 'chord_progressions'))` sorted by `createdAt` desc
- Delete: `deleteDoc(doc(db, 'users', uid, 'chord_progressions', id))`

---

## Verification

1. Run dev server and open the workspace
2. Open Chord Progression Sequencer from toolbar
3. Load C Major, select a named progression, click "Load into steps" — verify chord names appear in cells
4. Press Play — confirm MIDI notes fire, step highlight advances
5. Set a step velocity to 0 — confirm that step is skipped
6. Change a step duration to `'2n'` — confirm it holds twice as long as `'4n'`
7. Save a custom progression (auth required), reload page, verify it appears in Save/Load tab
8. Trigger Generate — confirm steps populate with chords from the selected key
9. Verify StepSequencer and CPS play simultaneously without interference
