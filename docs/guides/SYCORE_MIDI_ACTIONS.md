# MIDI Actions

<img src="../../help/guides/sycore-midi-actions.png"/>

**Purpose:** Per-device app action binding — maps MIDI CC/Note inputs to high-level SY.CORE actions (e.g. start sequencer, toggle looper, change preset).


**Capabilities:**

- MIDI Learn for app actions (CC and Note detection).
- Action selection organized in collapsible category groups (`MIDI_ACTION_GROUPS`).
- Trigger mode: `any` value, or exact value (for velocity/value-specific triggers).
- Per-device output selection (registered outputs with online/offline status).
- Built-in **Program Change sub-panel** (`ProgramChangeBrowser`): select channel, optional MSB (CC 0) / LSB (CC 32), program number (1–128) with live auto-send on value change.
- MIDI feedback testing via `useMidiFeedback.testFeedback`.
- Clock restart after Program Change (if `midiStore.sendClock` is active).
