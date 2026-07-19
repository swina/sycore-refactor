# ChordProg Audio Capture Automation

## Goal
Upgrade the REC SYNC feature in `ChordProgSequencer.vue` so that chord progression playback precisely triggers audio recording in `AudioCapture.vue` with proper bar-aligned timing, pre-roll trimming, and optional auto-stop.

## Current State

- **ChordProgSequencer.vue**: A `watch` on `store.isPlaying` dispatches `capture-start-rec` / `capture-stop-rec` immediately via Vue reactivity. No alignment to the Tone.js transport bar boundary. No pre-roll.
- **AudioCapture.vue**: Listens to those events, starts/stops recording in `background: true` mode. Supports `preRoll` detail for trimming leading silence.
- **DrumMachine.vue** (reference implementation): Uses Tone.js `getTransport().schedule()` to fire `capture-start-rec` at the exact bar boundary with a calculated `preRoll`. Also supports auto-stop after N bars.

## Plan

### 1. Reactive State (script setup)

Add capture-specific refs:

- `captureBarCount` — number of bars to record (default: 4, persisted)
- `captureAutoStop` — whether to auto-stop (default: true, persisted)
- `captureArmed` — ref for UI "ARMED" indicator
- `captureRecording` — ref for UI "REC" indicator

### 2. Plain JS Capture State (non-reactive, for schedule callback)

- `_captureArmed` — set true on play, consumed by next schedule tick
- `_captureBarsRemaining` — tick counter until auto-stop
- `_captureRecording` — set true after pre-roll fires

### 3. Modify the `store.isPlaying` Watcher

On play: set `_captureArmed = true` instead of dispatching immediately.
On stop: cancel arm, dispatch `capture-stop-rec` if recording.

### 4. Add Capture Logic Inside `scheduleRepeat`

In the existing Tone.js `scheduleRepeat` callback, before note processing:

- If `_captureArmed`: set `_captureRecording = true`, calculate `preRoll` from `time - toneNow()`, dispatch `capture-start-rec` via `setTimeout` with the pre-roll, and initialise `_captureBarsRemaining` based on `captureBarCount`.
- If `_captureRecording`: decrement `_captureBarsRemaining` by ticks per bar. When it reaches 0, dispatch `capture-stop-rec` via `getDraw().schedule()`.

### 5. UI Updates

In the REC SYNC section of the header:

- Bar count spinner (when sync is enabled)
- Armed / Recording indicator badges
- Auto-stop toggle

### 6. Files Changed

| File | Changes |
|---|---|
| `ChordProgSequencer.vue` | ~50 lines: capture state, schedule logic, UI controls |
| *(none else)* | Event contract with AudioCapture already supports preRoll & background |

## Event Contract (unchanged, for reference)

- `capture-start-rec` detail: `{ background: true, preRoll: seconds }`
- `capture-stop-rec` — no detail needed
- AudioCapture trims `preRoll` seconds from the blob start (line 770-797)