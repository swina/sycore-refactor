# Smart Sync — Transport Unification & Bar-Aligned Start

## Motivation

When a user starts App A (e.g. Chord Prog) and later starts App B (e.g. Drum Machine), both must play in time. Previously each sequencer independently called `getTransport().start()`/`stop()` on the shared Tone.js singleton, causing two problems:

1. **Stop kills all** — when one sequencer stopped, `getTransport().stop()` halted every other sequencer.
2. **No bar-aligned join** — starting a second sequencer while the Transport is already running snapped it to the current position, causing audible drift.

## Phase 1 — Transport Ref-Counting (shared lifecycle) ✅ DONE

Created `src/composables/useTransportManager.ts` — wraps `getTransport().start()`/`stop()` with a participant reference count.

| Method | Behavior |
|---|---|
| `acquireTransport()` | Increments participant count. Starts `getTransport()` only if first participant. |
| `releaseTransport()` | Decrements count. Stops `getTransport()` only when count reaches 0. |
| `forceStopAll()` | Resets count to 0 and stops transport. |

**3 sequencers refactored** to replace `getTransport().start()` → `transportManager.acquireTransport()` and `getTransport().stop()` → `transportManager.releaseTransport()`:

- `ChordProgSequencer.vue`
- `StepSequencer.vue`
- `DrumMachine.vue`

Each still calls `getTransport().clear()` for its own `scheduleRepeat` callback (per-participant cleanup, unchanged).

`ArpeggiatorPanel.vue` — uses `setInterval`, not Tone.js Transport. Unaffected. Conversion deferred.

## Phase 2 — Bar-Aligned Schedule ✅ DONE

Added to `useTransportManager`:

- `getBarPosition()` — returns `{ bar, beat, sixteenth }` (1-indexed) from `getTransport().position`.
- `getNextBarPosition()` — returns a Tone.js position string for the next whole-bar boundary (e.g. `"4:0:0"`).

When a sequencer starts while the Transport is already running, its `scheduleRepeat()` now receives a `startTime` set to the next bar boundary:

```typescript
const startTime = transportManager.isRunning.value
  ? transportManager.getNextBarPosition()
  : undefined

repeatEventIdRef = getTransport().scheduleRepeat(callback, interval, startTime)
transportManager.acquireTransport()
```

- **First sequencer to start**: `isRunning` is `false`, no `startTime` → `scheduleRepeat` starts immediately, transport starts.
- **Subsequent sequencers**: `isRunning` is `true` → `scheduleRepeat` is offset to the next bar boundary → fire in sync.
- `getTransport().start()` removed from all three; `acquireTransport()` handles it.

## Phase 3 — Smart Activation UI (TODO)

Extend MidiSyncFlow / MidiSyncMatrix with a new connection type:

| Connection | Behavior |
|---|---|
| `{source} → {target}` (existing) | Toggle sync boolean — when source starts, target starts immediately |
| `{source} → {target} [sync start]` (new) | When source starts, target starts **at the next bar boundary** |

Add a global "Play All" / "Stop All" button to the transport bar that starts/stops all registered participants.