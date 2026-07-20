# Chord Prog — Per-Step Chord/Arp Mode

Currently the Chord Progression Sequencer has one global Play Mode (Chord or Arp) and one global Arp Rate for the entire 16-step sequence. The ask: let each individual step carry its own mode —

- **Chord Mode** (per step): Up, Down, UpDown, DownUp — a strum direction across the step's chord tones.
- **Arp Mode** (per step): the same 10 patterns already offered by the standalone Arpeggiator — `up`, `down`, `up-down`, `down-up`, `converge`, `diverge`, `pinky-up`, `thumb-up`, `random`, `random-other`.

---

## Phase 0 — Documentation Discovery (findings)

Two research passes read the actual chord-prog playback scheduler, the store's step data model, the standalone Arpeggiator's pattern engine, and the step-detail editor UI, before any design was proposed.

### Current state — neither mode has real "direction"/"pattern" today

**Chord mode** ([ChordProgSequencer.vue:215-233](/src/components/ChordProgSequencer.vue#L215-L233)) plays every note in `step.notes` **simultaneously** — `step.notes.forEach(note => { midiStore.sendNoteOn(...) })`, all at the same tick, same duration. There is no ordering/strum concept of any kind to toggle today — "Up/Down/UpDown/DownUp" is a wholly new playback algorithm, not a switch on existing behavior.

**Arp mode** ([ChordProgSequencer.vue:235-254](/src/components/ChordProgSequencer.vue#L235-L254)) is a hardcoded **ascending-only** cycle:
```js
const noteIdx = Math.floor(state.tickCounter / arpTicks) % step.notes.length
const clampedNote = ... step.notes[noteIdx] ...
```
It does not read `arpStore.arpMode` and is not connected to the standalone Arpeggiator's pattern engine at all — confirmed by grep: `ChordProgSequencer.vue`'s only reference to `arpStore` is `arpStore.arpBpm` ([lines 102, 157, 312, 699](/src/components/ChordProgSequencer.vue#L102)).

### `ChordStep` has no per-step mode field

[`useChordProgStore.ts:11-19`](/src/stores/useChordProgStore.ts#L11-L19):
```ts
export interface ChordStep {
  active: boolean
  chordName: string
  notes: number[]
  velocity: number
  duration: DurationOption
  gate: number
  transpose: number
}
```
`playMode`/`arpRate` are single refs for the whole slot ([useChordProgStore.ts:98](/src/stores/useChordProgStore.ts#L98) and around line 27), consumed identically by every step.

### The 10 arp patterns exist, but as stateful, non-reusable, tick-loop-coupled code

[`ArpeggiatorPanel.vue:146-289`](/src/components/ArpeggiatorPanel.vue#L146-L289)'s `startArpEngine()` computes the next note index inline, per mode, using **closure variables** (`currentArpIndex`, `subIndex`, `arpDirection`, `lastArpNote`) mutated across `setInterval` ticks reading live-held keyboard notes (`arpStore.getHeldNotes()`) — not a pure function, not exported, not reusable as-is. The mode list itself is a **local, untyped ref**, not a shared constant:
```js
// ArpeggiatorPanel.vue:27-37
const arpModes = ref([
  'up', 'down', 'up-down', 'down-up', 'converge', 'diverge',
  'pinky-up', 'thumb-up', 'random', 'random-other',
])
```
**Gotcha worth flagging**: the *exported* `ArpMode` TypeScript type is stale/incomplete relative to what's actually used at runtime — [`useArpStore.ts:11`](/src/stores/useArpStore.ts#L11):
```ts
export type ArpMode = 'up' | 'down' | 'up-down' | 'random'
```
only 4 of the 10 real values. No component or store exports the full 10-value list as a reusable constant anywhere.

### Step-detail editor — where a per-step picker belongs

Step selection lives in the **store**, not the component: [`useChordProgStore.ts:96`](/src/stores/useChordProgStore.ts#L96) `const selectedStepIdx = ref(0)` (exported at line 362), set by the grid's click handler ([ChordProgSequencer.vue:399-402](/src/components/ChordProgSequencer.vue#L399-L402)):
```js
function handleStepClick(idx) {
  store.selectedStepIdx = idx
  if (!store.isPlaying) previewStep(idx)
}
```
The "STEP DETAIL" panel template ([ChordProgSequencer.vue:994-1071](/src/components/ChordProgSequencer.vue#L994-L1071), gated `v-if="selectedStep"`) already has dedicated sections for Active/chord name, Duration ([1010-1020](/src/components/ChordProgSequencer.vue#L1010-L1020)), Velocity ([1022-1034](/src/components/ChordProgSequencer.vue#L1022-L1034)), Gate ([1036-1049](/src/components/ChordProgSequencer.vue#L1036-L1049)), and a rightmost (`ml-auto`) **Per-step Transpose** group ([1051-1070](/src/components/ChordProgSequencer.vue#L1051-L1070)) — the natural, precedented insertion point for a new per-step mode picker, copying that group's layout conventions.

### Migration is free — confirmed precedent

[`DEFAULT_CHORD_STEP`](/src/stores/useChordProgStore.ts#L52-L60) is spread first in every load path before any saved data — [line 89](/src/stores/useChordProgStore.ts#L89) `{ ...DEFAULT_CHORD_STEP, ...s }`, [line 131](/src/stores/useChordProgStore.ts#L131), [line 343](/src/stores/useChordProgStore.ts#L343), [line 353](/src/stores/useChordProgStore.ts#L353) all follow the same pattern. Adding a new `ChordStep` field + a default in `DEFAULT_CHORD_STEP` is transparently backfilled for every old saved progression — **no extra migration code needed**, confirmed by the existing precedent, not assumed.

### Allowed APIs / patterns to copy

| Concern | Source of truth | Citation |
|---|---|---|
| Per-step field + zero-migration default | `DEFAULT_CHORD_STEP` + spread-merge on load | [useChordProgStore.ts:52-60,89](/src/stores/useChordProgStore.ts#L52-L60) |
| Step-detail editor UI group layout (to copy for the new picker) | "Per-step Transpose" group | [ChordProgSequencer.vue:1051-1070](/src/components/ChordProgSequencer.vue#L1051-L1070) |
| Step selection | `store.selectedStepIdx` / `handleStepClick` | [useChordProgStore.ts:96](/src/stores/useChordProgStore.ts#L96), [ChordProgSequencer.vue:399-402](/src/components/ChordProgSequencer.vue#L399-L402) |
| Existing tick-scheduling infra to reuse for strum timing | the `'384n'` Tone.js repeat callback, `state.tickCounter`, `arpTicks` | [ChordProgSequencer.vue:235-254](/src/components/ChordProgSequencer.vue#L235-L254) |
| Pattern math to extract (not reinvent) | `startArpEngine()`'s per-mode `nextIndex` branches | [ArpeggiatorPanel.vue:196-279](/src/components/ArpeggiatorPanel.vue#L196-L279) |

### Anti-patterns to avoid (confirmed by grep, not assumption)

- **Do not write a second copy of the 10 arp-pattern branches inside `ChordProgSequencer.vue`.** Extract `ArpeggiatorPanel.vue`'s existing logic into a shared module first (Phase 1) — two independent copies of the same 10-branch if/else is exactly the kind of duplication this codebase has been actively removing all session.
- **Do not make the new per-step fields required or add manual migration code.** The spread-merge precedent already handles this for free — adding required fields or a migration script would be solving an already-solved problem.
- **Do not touch `arpStore.arpMode`/the standalone Arpeggiator's live playback** beyond refactoring it to call the extracted pure function. Its behavior (reading `arpStore.getHeldNotes()`, its own `setInterval` loop) must be unchanged — regression-tested by Phase 1's own verification.
- **Do not conflate Chord-mode "strum direction" with Arp-mode "pattern."** They're different concepts on different data (`chordMode` operates once per step on a fixed note order; `arpMode` cycles per-tick) — keep them as two distinct optional fields, not one shared enum.

---

## Phase 1 — Extract a reusable, stateless arp-pattern engine

**What to implement**: a new module, `src/lib/arp-patterns.ts`, that becomes the single source of truth for the 10 patterns — copying the exact math from `ArpeggiatorPanel.vue:196-279`, not reinventing it.

```ts
export const ARP_MODES = [
  'up', 'down', 'up-down', 'down-up', 'converge', 'diverge',
  'pinky-up', 'thumb-up', 'random', 'random-other',
] as const
export type ArpMode = typeof ARP_MODES[number]

export interface ArpPatternState {
  currentIndex: number
  subIndex: number
  direction: 1 | -1
}

export function defaultArpPatternState(): ArpPatternState {
  return { currentIndex: 0, subIndex: 0, direction: 1 }
}

// Pure function — copies ArpeggiatorPanel.vue:196-279's per-mode nextIndex
// math verbatim, taking state explicitly instead of closure variables, so
// each caller (the standalone Arpeggiator, or one instance per chord-prog
// step) can hold independent traversal state.
export function nextArpIndex(mode: ArpMode, state: ArpPatternState, len: number): number {
  // ...ported branch-for-branch from ArpeggiatorPanel.vue, mutating a copy
  // of `state` and returning { nextIndex, state: newState } — exact port,
  // see citation above for the source logic per mode.
}
```

Then rewire [`useArpStore.ts:11`](/src/stores/useArpStore.ts#L11)'s `ArpMode` type to `export type { ArpMode } from '@/lib/arp-patterns'` (fixing the stale 4-value type — a real, confirmed bug this phase incidentally fixes), and rewire `ArpeggiatorPanel.vue`'s `arpModes` ref ([lines 27-37](/src/components/ArpeggiatorPanel.vue#L27-L37)) to `ref(ARP_MODES)` imported from the new module instead of a hand-typed local array.

Rewire `startArpEngine()` ([ArpeggiatorPanel.vue:146-289](/src/components/ArpeggiatorPanel.vue#L146-L289)) to call `nextArpIndex(arpStore.arpMode, patternState, notesArray.length)` instead of its inline if/else chain, storing `patternState` in the same module-level closure slot the old `currentArpIndex`/`subIndex`/`arpDirection` variables occupied (same lifetime, just consolidated into one object and delegated to the shared function).

**Verification checklist**:
- [ ] `npm run test` — new Vitest unit tests for `nextArpIndex`, one deterministic sequence per mode (e.g. `up` over a 4-note array cycles 0,1,2,3,0,...; `converge` alternates low/high toward center; `random`/`random-other` just assert bounds + `random-other` never repeats consecutively).
- [ ] Manual: open the standalone Arpeggiator, hold a chord, confirm all 10 modes sound **identical** to before the refactor (regression guard — this phase must be behavior-preserving for the existing feature).

**Anti-pattern guards**: do not change any of the per-mode math while porting it — this phase is a pure extraction, not a rewrite; behavior must be bit-for-bit identical to `ArpeggiatorPanel.vue`'s current implementation.

---

## Phase 2 — Data model: per-step `chordMode` / `arpMode` fields

**What to implement**: extend [`ChordStep`](/src/stores/useChordProgStore.ts#L11-L19) and [`DEFAULT_CHORD_STEP`](/src/stores/useChordProgStore.ts#L52-L60):

```ts
export type ChordStrumMode = 'up' | 'down' | 'up-down' | 'down-up'

export interface ChordStep {
  active: boolean
  chordName: string
  notes: number[]
  velocity: number
  duration: DurationOption
  gate: number
  transpose: number
  chordMode?: ChordStrumMode   // used when the slot's global playMode === 'chord'
  arpMode?: ArpMode            // used when the slot's global playMode === 'arp'; import from '@/lib/arp-patterns'
}

export const DEFAULT_CHORD_STEP: ChordStep = {
  active: false,
  chordName: '—',
  notes: [],
  velocity: 100,
  duration: '4n',
  gate: 80,
  transpose: 0,
  chordMode: 'up',
  arpMode: 'up',
}
```

No migration code — per Phase 0's confirmed precedent, every load path already spreads `DEFAULT_CHORD_STEP` first.

**Verification checklist**:
- [ ] `npm run test` — confirm an old saved progression (a plain object literal missing `chordMode`/`arpMode`) loads via `ensureSteps16`/the store's load path and comes out with `chordMode: 'up', arpMode: 'up'` backfilled.
- [ ] Confirm `slotSave`/`slotLoad` round-trip the new fields (they're plain data, already covered generically by the existing `{ ...s }` spread in `slotSave`, cited at [useChordProgStore.ts:172](/src/stores/useChordProgStore.ts#L172) — verify, don't assume).

**Anti-pattern guards**: do not make the new fields required (breaks the zero-migration guarantee); do not reuse `PlayMode` for these — it's a different, slot-level concept.

---

## Phase 3 — Chord-mode strum playback

**What to implement**: replace the simultaneous `forEach` in [ChordProgSequencer.vue:215-233](/src/components/ChordProgSequencer.vue#L215-L233) with a staggered strum when `step.chordMode` isn't a no-op default.

Sort `step.notes` per direction (`up` = ascending pitch, `down` = descending, `up-down`/`down-up` = there-and-back across the chord in one step), then spread the note-on events across a small number of ticks within the step — reuse the exact tick-counting mechanism already driving Arp mode (`state.tickCounter`, the `'384n'` repeat callback) rather than introducing a second timing system. A reasonable default stagger: divide the step's `ticksNeeded` by `step.notes.length`, capped at a musically-sensible minimum (a fast strum, not a slow arpeggio) — confirm the exact cap with the user during implementation if the first pass sounds off; this is the one open feel/tuning parameter in this plan.

**Verification checklist**:
- [ ] Set a step to `chordMode: 'up'` with a 3-note chord, confirm notes fire in ascending pitch order with audible separation (not simultaneous) via the MIDI Monitor.
- [ ] Set `chordMode: 'down'`/`'up-down'`/`'down-up'`, confirm order matches.
- [ ] A step with `chordMode` left at its default (`'up'`) — confirm this doesn't silently change existing users' chord-mode progressions in a way that surprises them; if `'up'` staggered-strum reads as too different from today's simultaneous chord, consider whether "simultaneous" itself should be one of the 4 options rather than implied by a default (flag this as a decision point, don't guess silently).

**Anti-pattern guards**: don't introduce a second scheduling/timer mechanism — reuse the existing `'384n'` tick callback's counter, matching how Arp mode already subdivides a step.

---

## Phase 4 — Arp-mode: per-step pattern instead of hardcoded ascending

**What to implement**: replace [ChordProgSequencer.vue:235-254](/src/components/ChordProgSequencer.vue#L235-L254)'s hardcoded `Math.floor(tickCounter/arpTicks) % step.notes.length` with a call to Phase 1's `nextArpIndex(step.arpMode ?? 'up', perStepPatternState, step.notes.length)`.

Each of the 16 steps needs its **own** `ArpPatternState` (per Phase 1's shape) — a `Map<stepIndex, ArpPatternState>` alongside the existing playback closure state (`state` in the scheduler, per the citation above), reset when a step's notes change or on playback stop, mirroring how `currentArpIndex` already resets today when `notesArray.length === 0` in the standalone Arpeggiator ([ArpeggiatorPanel.vue:177-185](/src/components/ArpeggiatorPanel.vue#L177-L185)).

**Verification checklist**:
- [ ] Set step 1 to `arpMode: 'up'` and step 2 to `arpMode: 'random-other'` in the same progression, confirm each step's notes cycle per its own pattern during playback (via MIDI Monitor), independently.
- [ ] Confirm a step's arp position resets sensibly when playback loops back to it (no stale index carried over from a previous pass with a different note count).

**Anti-pattern guards**: do not share one `ArpPatternState` across all 16 steps — each needs independent traversal state, since they can have different note counts and different modes.

---

## Phase 5 — Step-detail editor UI

**What to implement**: in the "STEP DETAIL" panel ([ChordProgSequencer.vue:994-1071](/src/components/ChordProgSequencer.vue#L994-L1071)), add a new control group next to "Per-step Transpose" ([1051-1070](/src/components/ChordProgSequencer.vue#L1051-L1070)), copying its layout conventions:

- If `store.playMode === 'chord'`: a 4-button toggle group (Up/Down/UpDown/DownUp) bound to `selectedStep.chordMode`, styled like the existing Play-mode Chord/Arp toggle (moved to its own row earlier this session) — same button-group pattern, reused.
- If `store.playMode === 'arp'`: a `<select>` populated from Phase 1's exported `ARP_MODES`, bound to `selectedStep.arpMode` — copy the standalone Arpeggiator's existing `<option v-for="mode in arpModes">` dropdown markup ([ArpeggiatorPanel.vue:408](/src/components/ArpeggiatorPanel.vue#L408)) rather than inventing new dropdown markup.

**Verification checklist**:
- [ ] Selecting a step in Chord mode shows the 4-option strum picker; switching the slot to Arp mode and reselecting shows the 10-option pattern dropdown instead.
- [ ] Changing a step's mode via the picker updates playback on the next pass through that step (per Phase 3/4's wiring) — confirm via MIDI Monitor, not just that the store value changed.

**Anti-pattern guards**: don't build a custom dropdown component — copy the existing `<select>`/`<option v-for>` pattern already used for Arp Rate two lines above ([ChordProgSequencer.vue:847-857](/src/components/ChordProgSequencer.vue#L847-L857), pre-move) and for the standalone Arpeggiator's mode picker.

---

## Phase 6 — Final Verification

1. `npm run test` — Phase 1 and Phase 2's unit tests, plus no regressions elsewhere.
2. `grep -n "arpModes = ref(\[" src/components/ArpeggiatorPanel.vue` — confirm the hand-typed 10-value array is gone, replaced by an import from `@/lib/arp-patterns`.
3. `grep -rn "nextIndex = " src/components/ChordProgSequencer.vue` — confirm no second copy of the pattern math was written inline (Phase 1's anti-pattern guard).
4. Manual end-to-end in a Chromium dev build:
   - Build a 4-step chord progression, assign different `chordMode`s to two steps and different `arpMode`s to two others (toggling the slot's global Chord/Arp mode between edits), confirm each step plays its own assigned pattern.
   - Confirm the standalone Arpeggiator panel still sounds identical for all 10 modes post-refactor (Phase 1's regression guard, re-verified end-to-end).
   - Load a progression saved before this feature shipped, confirm it plays back exactly as before (defaults backfilled silently, per Phase 2).
