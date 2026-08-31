# Global Transport

**Purpose:** Centralized playback coordinator that synchronizes multiple sequencers and sound engines to a shared Tone.js transport clock.

## Overview

The Global Transport replaces each sequencer managing its own Tone.Transport lifecycle with a shared coordinator. When any synced sequencer starts or stops, it acquires or releases a reference count on the transport. This ensures that:

- The transport stays running as long as at least one sequencer is active
- The transport stops automatically when the last sequencer releases it
- Sequencers that join after the transport is running can align to the next bar boundary

## Architecture

### Transport Manager (`useTransportManager`)

A module-level singleton composable that wraps Tone.Transport with a reference-counted lifecycle.

| Method | Description |
|--------|-------------|
| `acquireTransport()` | Increments the participant count. Starts Tone.Transport if not already running. |
| `releaseTransport()` | Decrements the participant count. Stops Tone.Transport when it reaches 0. |
| `forceStopAll()` | Resets the counter to 0 and stops the transport immediately (used by Stop All). |
| `getBarPosition()` | Returns `{ bar, beat, sixteenth }` (1-indexed) for display. |
| `getNextBarPosition()` | Returns a Tone.js position string for the next whole-bar boundary (e.g. `"4:0:0"`). |

The transport only stops when every participant has released it, preventing premature halts when multiple sequencers are running independently.

### TransportBar Component

Located in the app footer, the TransportBar provides:

- **Play All / Stop All button** — Starts or stops the global transport and triggers any synced sequencers
- **Position display** — Real-time bar:beat:sixteenth readout updated via `requestAnimationFrame`
- **BPM input** — Controls the shared BPM (stored in `arpStore.arpBpm`)
- **Sync configuration panel** (gear icon) — Toggles which apps are synced to the transport

Right-click the Play All / Stop All button to MIDI Learn it via the context menu. This exposes `transport-play-all` as a MIDI-mappable action (see [MIDI Controller Designer](./SYCORE_MIDI_CONTROLLER_DESIGNER.md)).

## Sync to Transport

Three sequencers can be synced to the global transport:

| Sync Flag | Sequencer | Trigger Event |
|-----------|-----------|---------------|
| `syncSequencerToTransport` | Step Sequencer | `toggle-sequencer` (play/stop) |
| `syncChordProgToTransport` | Chord Prog Sequencer | `cp-start` / `cp-stop` |
| `syncDrumMachineToTransport` | Drum Machine | `timeline-dm-start` / `timeline-dm-stop` |

When **Play All** is pressed:
1. `forceStopAll()` resets the transport to bar 0
2. `acquireTransport()` starts Tone.Transport
3. Each synced app receives its start event

When **Stop All** is pressed:
1. Each synced app receives its stop event
2. `forceStopAll()` stops the transport

### Bar-Aligned Start

When the transport is already running and a synced sequencer starts playing independently, it schedules its first event at the next whole-bar boundary using `getNextBarPosition()` rather than immediately. This prevents timing drift and keeps all synced sequencers phase-aligned.

### Sync Configuration

Sync preferences are persisted in localStorage under keys:
- `S1_SYNC_SEQ_TRANSPORT`
- `S1_SYNC_CP_TRANSPORT`
- `S1_SYNC_DM_TRANSPORT`

These are read on page load and restored when the user logs in.

## MIDI Actions

Two MIDI actions are available for transport control:

| Action | Event | Description |
|--------|-------|-------------|
| `transport_play_all` | `transport-play-all` | Triggers Play All (synced) |
| `transport_stop_all` | `transport-stop-all` | Triggers Stop All |

These can be assigned to any pad, button, or key in the [MIDI Controller Designer](./SYCORE_MIDI_CONTROLLER_DESIGNER.md) or via `useAppActions` for custom mapping.

The `global_start_stop` action (in MIDI Actions) sends raw MIDI transport START/STOP messages to connected devices — it is separate from Global Transport.

## Integration in Sequencers

Each synced sequencer follows this pattern:

1. Watch its internal `isPlaying` state
2. On play: call `transportManager.acquireTransport()`, schedule repeats with `getNextBarPosition()` offset if the transport is already running
3. On stop: call `transportManager.releaseTransport()`, clear scheduled events
4. On unmount: release transport and clean up listeners

This decouples each sequencer's UI state from the shared clock while maintaining perfect sync alignment.
