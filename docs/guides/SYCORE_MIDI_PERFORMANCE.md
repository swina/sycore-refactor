# MIDI PERFORMANCE

<img src="/help/guides/sycore-midi-performance-grid.png"/>

**Purpose:** Source-to-output routing matrix — controls which SY.CORE internal sources (and physical inputs) route to which hardware outputs.

**Data source:** `useMidiStore.routingMatrix`, `midiService`

**Sources (rows):**

| Source ID | Label | Role |
|---|---|---|
| `TRANSPORT` | Transport / Clock | Sends 0xF8/0xFA/0xFC |
| `SEQUENCER` | Sequencer | Step sequencer MIDI out |
| `CHORD PROG SEQUENCER` | Arpeggiator | Arpeggiated note output |
| `ARPEGGIATOR` | Arpeggiator | Arpeggiated note output |
| `KEYBOARD` | Keyboard | On-screen keyboard |
| `UI` | UI / Preview | Sound library preview. This enables the sound engine generator (for this release ROLAND S-1) |
| *(dynamic)* | Physical inputs (inEnabled) | MIDI Thru from hardware inputs |

**Outputs (columns):** All registered devices with `outEnabled: true`, sorted with the experimental thru output first.

**Dual view modes:** Grid (checkbox matrix) and Flow (SVG bezier visualization — sources left, outputs right).

**Features beyond the matrix:**

<img src="/help/guides/sycore-midi-performance-extra.png"/>

- **Smart Latch** — holds incoming notes. Configurable: max notes (1–8), fade-out time (0–5000ms), FIFO replace mode.
- **Broadcast Mode** — overrides the matrix; sends all messages to all active devices simultaneously. Dims the matrix UI when active.
- **Sequencer Sync** — links global MIDI Start/Stop to internal sequencer playback.
- **Smart Latch per-device** toggle (lock icon on each output column header).
- **Experimental THRU** — dedicated USB icon marks the experimental thru output.
