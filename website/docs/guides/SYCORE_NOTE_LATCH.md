# Note Latch

**Note Latch** is a MIDI FLOW app source that holds incoming notes after key release, then forwards them through the normal MIDI FLOW OUT port. Multiple instruments (real or virtual) can share a single latch, and switching the latch off releases every held note at once — no need to unlatch each destination individually.

<img src="../../help/guides/sycore-note-latch.png"/>

---

## How It Works

A latch sits deliberately between a controller and its instruments. Unlike a per-device latch (which exists inside each destination and must be toggled individually), the Note Latch app intercepts notes once at the source and broadcasts them to everything cabled to that MIDI FLOW OUT.

When the master latch is **Off**, notes pass through untouched. When **On**, every note-on is held until you either switch the latch off, the latch runs out of slots, or you close the panel.

```
  Controller ──▶ Note Latch ──▶ MIDI FLOW OUT ──▶ Instrument A
                                                    ├── Instrument B
                                                    └── Instrument C
```

---

## Controls

### Master Switch

Toggles the latch on/off. When switched **Off**, all held notes are released immediately through every connected output. Right-click to MIDI Learn.

### Max Notes

Sets the maximum number of notes that can be held simultaneously (1–16). When the buffer is full, behavior depends on the selected mode. Right-click to MIDI Learn.

### Mode: FIFO / BLOCK

| Mode | Behavior when buffer is full |
|------|------------------------------|
| **FIFO** (default) | Oldest held note is released to make room for the new one — the buffer behaves like a first-in, first-out queue. |
| **BLOCK** | New notes are rejected outright. The performer must release a note (or turn off the latch) before new notes are accepted. |

### Held Notes Readout

Shows the current count of held notes vs the maximum (`N / M`). Turns cyan when notes are actively held.

---

## Setup

### Input Routing

Note Latch requires explicit cabling — there is no broadcast-mode fail-open. You must route a MIDI input device or another app source to the Note Latch node. This follows the same convention as the Arpeggiator, Chord Progression Sequencer, and Drum Machine.

### App-to-App Routing

The latch can receive notes from other SY.CORE apps (e.g. Chord Sequencer → Note Latch). Self-feedback is prevented by filtering out notes that originate from the Note Latch app itself.

---

## Practical Use Cases

- **Hands-free drone pads**: Play a chord, toggle latch on, and control your synths with both hands free.
- **Multi-instrument sustained layers**: One latch feeds several instruments at once — play a note once and it rings through every connected device.
- **Temporary pedal replacement**: Use a MIDI-learned toggle as a virtual sustain pedal that works across all your instruments simultaneously.
- **FIFO arpeggio effects**: Set Max Notes to 2–3 and each new note pushes out the oldest, creating a sliding window of sustained pitches.

---

## Tips

- **Release all notes at once**: Toggling the master latch Off releases every held note globally — more convenient than sending individual note-offs to each destination.
- **FIFO for live play**: FIFO mode is ideal when you want to keep a limited polyphony without ever losing a note event — the oldest note simply drops out.
- **BLOCK for precision**: Use BLOCK mode when every note matters and you don't want unexpected note releases.
- **Cabling is required**: If notes seem to pass through but never latch, check that the input device is explicitly routed to the Note Latch.