# Sync Settings Reference

All sync-related settings, flags, and configuration options across the app.

---

## 1. MIDI Store (`src/stores/useMidiStore.js`)

### Reactive State

| Setting | localStorage Key | Default | Description |
|---|---|---|---|
| `sendClock` | `midiSendClock` | `false` | Send MIDI clock (24 PPQ) to output devices |
| `syncMidiTransport` | `midiSyncTransport` | `false` | Sync MIDI START/STOP when backing track plays |
| `syncSequencerTransport` | `midiSyncSequencerTransport` | `false` | Sequencer play/stop also sends MIDI START/STOP |
| `isTransportPlaying` | _(memory only)_ | `false` | Current transport state (not persisted) |
| `incomingBpm` | _(memory only)_ | `0` | Detected BPM from incoming MIDI clock (read-only display) |

### Methods

| Method | Description |
|---|---|
| `setSendClock(enabled)` | Enable/disable MIDI clock transmission |
| `setSyncMidiTransport(enabled)` | Enable/disable sync to incoming MIDI START/STOP |
| `setSyncSequencerTransport(enabled)` | Enable/disable sequencer transport sync |
| `toggleGlobalTransport()` | Toggle START/STOP based on current state |
| `sendStart()` | Send MIDI START message (0xFA) |
| `sendStop()` | Send MIDI STOP message (0xFC) |
| `startClock()` | Begin MIDI clock transmission |
| `stopClock()` | Stop MIDI clock transmission |
| `setBpm(bpm)` | Set BPM for clock generation |
| `addClockBpmListener(cb)` | Register callback for incoming MIDI clock BPM changes |

---

## 2. Config Store (`src/stores/useConfigStore.js`)

Persisted to Firestore at `system/app_settings`.

| Setting | Default | Description |
|---|---|---|
| `syncMidiTransportFromLivePad` | `true` | Whether Live Performance Pad sends MIDI START/STOP on play/stop |

---

## 3. Backing Track Player (`src/components/BackingTrackPlayer.vue`)

| Setting | localStorage Key | Default | Description |
|---|---|---|---|
| `syncInternalSequencer` | `S1_SYNC_TRACK` | `false` | When backing track plays, also starts/stops the Step Sequencer |
| `syncRecordAudioCapture` | `S1_SYNC_REC_CAPTURE` | `false` | When backing track plays, also starts/stops audio capture |

**Transport sync logic** (line 129–143): when `isPlaying` changes and `midiStore.syncMidiTransport` is enabled, sends `sendStart()` / `sendStop()`. Respects `configStore.syncMidiTransportFromLivePad` to avoid double-firing from Live Performance Pad.

---

## 4. Step Sequencer (`src/components/StepSequencer.vue`)

| Setting | localStorage Key | Description |
|---|---|---|
| `syncTrack` | `S1_SYNC_TRACK` | Mirror of backing track sync flag; when enabled, sequencer start/stop dispatches `toggle-backing-track` event |

**MIDI clock send points:**

| Location | Condition | Action |
|---|---|---|
| `handleToggle` — line 953 | Always, on toggle event | `sendStart()` / `sendStop()` |
| `watch(isPlaying)` — line 1233 | Only if `syncSequencerTransport` enabled and transport state differs | `sendStart()` / `sendStop()` |
| `watch(isPlaying)` — line 1284 | Always on play, inside `toneStart().then()` | `sendStart()` (primary clock send) |

---

## 5. MidiService (`src/core/midi/MidiService.ts`)

### Clock & Transport

| Method | Description |
|---|---|
| `startClock()` | Begin sending MIDI clock at 24 PPQ |
| `stopClock()` | Stop sending MIDI clock |
| `sendStart()` | Send 0xFA MIDI START |
| `sendStop()` | Send 0xFC MIDI STOP |
| `addTransportListener(cb)` | Register callback for incoming `start` / `stop` / `clock` events |
| `addClockBpmListener(cb)` | Register callback for incoming MIDI clock BPM detection |

### Incoming Clock Processing

- Uses a **24-pulse ring buffer** to compute BPM from incoming clock timestamps.
- Applies **exponential smoothing** (α = 0.1) to stabilize the BPM reading.
- Filtering: only processes clock from devices with `receiveSyncIn: true` in their registration.

---

## 6. Per-Device Registration Flags

Stored in `SYCORE_ADVANCED_MIDI_ROUTING` / `S1_MIDI_ROUTING` (localStorage), managed via MidiMatrix.

| Flag | Default | Description |
|---|---|---|
| `clock` | `true` | Device receives MIDI clock output |
| `transport` | `true` | Device receives MIDI START/STOP output |
| `receiveSyncIn` | `false` | App accepts MIDI clock/transport input from this device |

---

## 7. MIDI Config Presets (`src/lib/midi-config-presets.ts`)

Snapshot includes sync settings so they are saved/restored with presets (persisted to Firestore):

| Field | Type | Description |
|---|---|---|
| `sendClock` | `boolean` | Clock transmission state |
| `syncMidiTransport` | `boolean` | Transport sync state |
| `syncSequencerTransport` | `boolean` | Sequencer transport sync state |

---

## 8. MIDI Init (`src/composables/useMidiInit.js`)

- On app init, if `sendClock` is enabled: sets BPM from the arpeggiator and calls `startClock()`.
- Watches arpeggiator BPM changes → updates MIDI clock BPM in real time.
- If arpeggiator is disabled → calls `stopClock()`.

---

## 9. UI Controls Summary

| Control | Component | Binds To |
|---|---|---|
| Send MIDI Clock toggle | `MidiSettingsPanel.vue` | `midiStore.setSendClock()` |
| Sync MIDI Transport toggle | `MidiSettingsPanel.vue` | `midiStore.setSyncMidiTransport()` |
| Sync Sequencer Transport toggle | `MidiSettingsPanel.vue` | `midiStore.setSyncSequencerTransport()` |
| Incoming BPM display | `MidiSettingsPanel.vue` | `midiStore.incomingBpm` (read-only) |
| MIDI Sync Link button | `BackingTrackPlayer.vue` (floating bar) | `midiStore.syncMidiTransport` |
| Global MIDI Sync toggle | `BackingTrackPlayer.vue` (panel) | `midiStore.setSyncMidiTransport()` |
| Internal Sequencer Sync toggle | `BackingTrackPlayer.vue` (panel) | `syncInternalSequencer` |
| Sync Record Audio Capture toggle | `BackingTrackPlayer.vue` (panel) | `syncRecordAudioCapture` |
| Sequencer Transport Sync toggle + badge | `MidiPerformancePanel.vue` | `midiStore.setSyncSequencerTransport()` |
| Per-device transport checkbox | `MidiMatrix.vue` | Device registration `transport` flag |
| `syncMidiTransportFromLivePad` button | `MidiMatrix.vue` | `configStore.syncMidiTransportFromLivePad` |

---

## 10. Persistence Summary

| Setting | Storage | Key / Document |
|---|---|---|
| `sendClock` | localStorage | `midiSendClock` |
| `syncMidiTransport` | localStorage | `midiSyncTransport` |
| `syncSequencerTransport` | localStorage | `midiSyncSequencerTransport` |
| `syncInternalSequencer` | localStorage | `S1_SYNC_TRACK` |
| `syncRecordAudioCapture` | localStorage | `S1_SYNC_REC_CAPTURE` |
| `syncMidiTransportFromLivePad` | Firestore | `system/app_settings` |
| MIDI config presets (incl. sync flags) | Firestore | `system/midiConfigPresets` |
| Device registrations (clock/transport) | localStorage | `SYCORE_ADVANCED_MIDI_ROUTING`, `S1_MIDI_ROUTING` |

---

## 11. Event Flow

```
User toggles "Sync MIDI Transport"
  → midiStore.setSyncMidiTransport(true)
  → localStorage: midiSyncTransport = true

BackingTrackPlayer starts playback
  → watch(isPlaying) fires
  → if syncMidiTransport enabled
    → midiStore.sendStart()  →  0xFA sent to all devices with transport=true

StepSequencer starts playback
  → toneStart().then()
    → midiStore.sendStart()  [unconditional — primary clock send]
  → watch(isPlaying) also fires
    → if syncSequencerTransport enabled AND state differs
      → midiStore.sendStart()  [guarded — avoids double-send]

Incoming MIDI clock from external device (receiveSyncIn=true)
  → MidiService ring buffer → smoothed BPM
  → addClockBpmListener callbacks fire
  → midiStore.incomingBpm updates (display only)

Incoming MIDI START from external device
  → addTransportListener callbacks fire
  → Components (AudioLooper, etc.) respond accordingly
```

---

## 12. MIDI Messages Reference

| Message | Hex | Decimal | Description |
|---|---|---|---|
| MIDI Clock | `0xF8` | 248 | Sent 24 times per quarter note |
| MIDI Start | `0xFA` | 250 | Start playback from beginning |
| MIDI Stop | `0xFC` | 252 | Stop playback |
| MIDI Continue | `0xFB` | 251 | Resume playback (not currently used) |
