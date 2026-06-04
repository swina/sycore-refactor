# Live Timeline

## Overview

LiveTimeline is a draggable/resizable panel component that provides a visual arrangement
timeline for live performance. It sequences backing track segments, fires MIDI/UI events at
specific time positions (markers), and controls MIDI transport sync independently of the
Backing Track Player's own sync logic.

<img src="/help/guides/sycore-timeline.png"/>
---

## UI Structure

### Header Bar

- **Title + Tabs**: Timeline | Arrange
- **BPM display**: live `midiStore.currentBpm`
- **Active segment name**: shown while a segment is playing
- **Transport controls**: Stop (■) | Play/Pause (▶/⏸) buttons
- **Position counter**: `MM:SS / total`
- **Close button**

### Toolbar (Timeline tab only)

| Control | Description |
|---|---|
| Zoom slider + ± buttons | Pixels per second (5–200 px/s) |
| Reset (⏮) | Resets playhead to 0, sends MIDI STOP |
| Loop toggle | When active, loops back to start at end of timeline |
| Xfade toggle | Enables crossfade between segment transitions |
| Xfade ms input | Sets crossfade duration (synced to BTP via `playlist-mutate`) |
| + Segment | Opens Add Segment dialog |
| + Marker | Opens Add Marker dialog |

### Canvas (Timeline tab)

- **BPM badge** (fixed overlay, top-left): shows live global BPM, does not scroll with canvas
- **Time ruler** (top, 28px): click anywhere to seek the playhead
- **Marker label cards** (28–90px): per-marker mini-card showing icon + type badge, label, value
- **Segment lane** (90px–bottom): colored segment blocks with label and per-track BPM badge
- **Marker vertical lines**: colored lines extending through the segment lane
- **Playhead**: white vertical line with dot; auto-scrolls to stay visible during playback

### Arrange Tab

Two columns: **Segments** (ordered list with move up/down, delete) and **Markers** (sorted by position, delete).  
Both columns show BPM, labels, values, and position timestamps.

---

## Segments

Segments play in their defined order — when the playhead enters a segment's bounds, that track begins playing at the corresponding `segStart` offset.

### Adding a Segment

The Add Segment dialog has two source tabs:

**Playlist tab**: selects from Playlist tracks already loaded in the Backing Track Player. Shows label, BPM, and duration.

**Library tab**: live-searches the `backing_tracks` collection (same source as BTP library).
- If the selected library track is already in the playlist → reuses its existing index
- If not → auto-appends to `livePadStore.playlist` before creating the segment (index = `newPlaylist.length - 1`)

### BPM Propagation

When a segment starts playing, the track's BPM is promoted to the global tempo.

The fallback handles tracks that were added to the playlist before BPM was part of the data model.

---

## Markers

Markers fire at their `position` (seconds) as the playhead passes them. Each marker is fired exactly once per playback pass, tracked in the `_fired` Set. On loop restart, `_fired` is cleared so all markers re-arm.

### Marker Types

| Type | Label | Value Input | Effect |
|---|---|---|---|
| `tempo` | Change Tempo | BPM (20–300) | Sets `arpStore.arpBpm`, `midiStore.currentBpm`, `midiStore.setBpm()`, dispatches `bpm-update` |
| `perf-set` | Select Perf Set Pad | Pad 1–16 (index 0–15) | Dispatches `timeline-trigger-perf-set` → LPP calls `triggerSetPad(idx)` |
| `load-perf-set` | Load Performance Set | Dropdown of saved sets | Dispatches `timeline-load-perf-set` with `setId` → LPP calls `recallSet(set)` directly |
| `crossfade` | CrossFade | Duration (ms) | Dispatches `playlist-mutate { key: 'crossfadeSec', value: ms/1000 }` to BTP |
| `program-change` | Program Change (PC) | PC 0–127 + Device + Channel | Sends Bank Select (CC0/CC32) + PC to the selected MIDI output port |
| `seq-start` | Start Sequencer | — | Dispatches `toggle-sequencer { play: true, source: 'timeline' }` |
| `seq-stop` | Stop Sequencer | — | Dispatches `toggle-sequencer { play: false, source: 'timeline' }` |
| `transport-start` | MIDI Sync Start | — | Sets `_lastTransportWasPlay = true`, calls `midiStore.sendStart()` |
| `transport-stop` | MIDI Sync Stop | — | Sets `_lastTransportWasPlay = false`, calls `midiStore.sendStop()` |
| `clock-start` | Start Clock (ticks only) | — | Calls `midiStore.startClock()` — sends 0xF8 ticks only, no 0xFA |
| `clock-stop` | Stop Clock (ticks only) | — | Calls `midiStore.stopClock()` |

### `perf-set` vs `load-perf-set`

- **`perf-set`** triggers a pad slot (0–15) on the Live Performance Pad. The set must already be assigned to that pad.
- **`load-perf-set`** loads a saved performance set directly by its persisted ID from `SYCORE_PC_PERFORMANCE_SETS` in localStorage. No pad assignment required — `recallSet()` is called directly.

### Program Change Browser

When adding a `program-change` marker with a device that has a preset catalog entry and a **Browse** button appears.

The PC Preset Browser loads bank and lets the user select a sound by name.  
On selection: computes the PC number from `program_base`, stores `msb` / `lsb` / `soundName`.

---

## MIDI Transport Behavior

### Rules

1. **Stop** always sends MIDI STOP (0xFC) — regardless of whether a `transport-start` marker had fired
2. **Pause** always sends MIDI STOP (0xFC)
3. **Resume from Pause**: if `_lastTransportWasPlay === true` (a `transport-start` marker had fired before the pause point), re-sends `midiStore.sendStart()` (0xFC reset → 0xFA start + clock)
4. **Timeline end** (non-loop): sends MIDI STOP
5. **Loop restart**: resets `_lastTransportWasPlay = false`; no automatic transport message is sent
6. **`transport-start` / `transport-stop` markers are the only way** to auto-send MIDI START during playback

### `transport-start` vs `clock-start`

| Marker | MIDI bytes sent | Use case |
|---|---|---|
| `transport-start` | 0xFC (reset) → 10ms → 0xFA (start) + 0xF8 ticks | Full sync; device needs START to lock to clock |
| `clock-start` | 0xF8 ticks only | Device already started; just re-enable the clock |

### BTP Integration and `source: 'timeline'`

The timeline passes `source: 'timeline'` in every `playlist-play` event. BTP's transport sync
watcher (`watch(isPlaying)`) checks `triggerSource.value === 'timeline'` and skips auto-sync,
preventing double transport messages when the timeline controls BTP playback.

Without this guard, a `transport-start` marker firing 10 seconds into a set would race with BTP's
own `sendStart()` triggered by track playback starting.

## Playback Engine

```
play()
  └─ requestAnimationFrame(_tick)

_tick():
  timelinePos = _posAtStart + (performance.now() - _startedAt) / 1000
  ├─ check end → stop() or loop restart
  ├─ auto-scroll canvas (keeps playhead 35% from right edge)
  ├─ _checkSegments()   → fires playlist-play + BPM sync
  └─ _checkMarkers()    → fires each marker once (guarded by _fired Set)
       └─ requestAnimationFrame(_tick)
```

### Seeking

Click anywhere on the time ruler to seek. If currently playing:
- `_posAtStart` and `_startedAt` are reset to the new position
- All markers and segments before the new position are added to `_fired` (will not re-fire)

### Loop

When `loopTimeline` is true and the playhead reaches the end of the last segment:
- `timelinePos` resets to 0
- `_posAtStart` and `_startedAt` reset
- `_fired` is cleared (all markers re-arm)
- `_lastTransportWasPlay` resets to `false`

---

## Event Bus API

All events are dispatched and consumed via `window.dispatchEvent` / `window.addEventListener`.

### Dispatched by LiveTimeline

| Event | Detail | Consumer |
|---|---|---|
| `playlist-play` | `{ idx, playlist, crossfade, source: 'timeline' }` | BackingTrackPlayer |
| `playlist-seek` | `ratio` (0–1) | BackingTrackPlayer |
| `toggle-backing-track` | `{ play: false }` | BackingTrackPlayer (stop only) |
| `playlist-mutate` | `{ key: 'crossfadeSec', value: sec }` | BackingTrackPlayer |
| `bpm-update` | `{ bpm }` | AppFooter, ArpPanel, global listeners |
| `toggle-sequencer` | `{ play, source: 'timeline' }` | StepSequencer |
| `timeline-trigger-perf-set` | `{ idx }` | LivePerformancePad |
| `timeline-load-perf-set` | `{ setId }` | LivePerformancePad |

### Consumed by LiveTimeline

None — the timeline only dispatches; it does not listen to external events.

---

## Known Constraints

- **Segment `segStart`/`segEnd`**: sub-region playback is passed to BTP via `playlist-play`; actual track seek support depends on BTP implementing the seek offset.
- **Performance set loading**: `recallSet()` in LivePerformancePad is called synchronously; any async loading (e.g., large soundfonts) is not awaited by the timeline.
- **Loop + MIDI transport**: On loop restart, no MIDI STOP/START pair is automatically sent. Place explicit `transport-stop` and `transport-start` markers near the loop boundary if devices need resync.
