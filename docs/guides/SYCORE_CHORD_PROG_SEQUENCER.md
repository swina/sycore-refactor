# Chord Progression Sequencer

The **Chord Progression Sequencer** is a dedicated step-based engine for building and performing harmonic sequences in SY.CORE. Each step holds a complete chord — or triggers it as an arpeggio — with individual control over timing, velocity, gate, and transpose. A built-in library of progressions organised by musical key and genre lets you go from zero to a full sequence in seconds.

<img src="/help/guides/sycore-chord-progression.png"/>
---

## 1. Overview

- Up to **16 steps**, each carrying a full chord (any number of notes).
- Two **play modes**: simultaneous chord voicing or staggered arpeggio.
- Per-step control: **duration**, **velocity**, **gate**, and **per-step transpose**.
- Global **sequence transpose** and **loop / once** playback.
- Built-in **progression library** organised by key and genre.
- **Algorithmic generation** from the loaded key source.
- **Save / Load** personal patterns to the cloud (requires account).
- **Draggable, resizable** floating panel — stays on screen during a live set.

---

## 2. Opening the Panel

Click the **Chord Prog** button in the SY.CORE toolbar (or the relevant trigger in your performance layout). The panel opens as a floating window at **z-index 700**, above most other panels.

The panel can be **minimised** (title bar only) without stopping playback, and can be dragged and resized freely on screen. Its position and size are saved to `localStorage` and restored on next open.

---

## 3. Interface at a Glance

<img src="/help/guides/sycore-chord-progression.png"/>

---

## 4. Transport Controls

| Control | Description |
|---------|-------------|
| **Bar:Beat:16th display** | Real-time position counter driven by internal tick counter (384th-note resolution). Resets to `001:1:1` on stop. |
| **Play / Stop** | Starts or stops the sequence. Tone.js transport is started on first play. |
| **Steps ◀ / ▶** | Increase or decrease the active step count (1–16). Steps beyond the count are greyed out and skipped. |
| **Chord \| Arp** | Toggles between simultaneous voicing and staggered arpeggio mode. |
| **Rate** | Arp step interval — visible only in Arp mode. Ranges from 128th note to whole note with dotted and triplet variants. |
| **Transpose** | Global pitch shift applied to every step (–24 to +24 semitones). Shown in yellow when non-zero. |
| **⟳ Loop / Once** | Loop plays the sequence indefinitely. Once plays through one cycle and stops. |
| **AOF ms** | Delay (milliseconds) before an All Notes Off is sent when stopping. Gives slow-release patches time to decay naturally. Set to `0` for immediate cut. |
| **REC SYNC** | When enabled, starting and stopping the sequencer also starts and stops the Audio Capture recorder. A pulsing red dot signals active recording. |
| **MIDI Ch** | Follows the global channel selector — shown read-only in the header. Change it via the Quick Channel Selector in the footer. |

---

## 5. Step Grid

The grid shows up to 16 cells. Each cell displays:

- **Step number** (top-left).
- **Chord name** (centre) — e.g. `Cmaj`, `F#m7`, `Bdim`.
- **Duration badge** (bottom-centre) — the note length for this step.
- **Velocity bar** (bottom edge) — colour-coded: blue < 40, green 40–80, bright green ≥ 80. No bar when velocity is 0.

### Interacting with Steps

| Action | Result |
|--------|--------|
| **Single click** | Selects the step (opens Step Detail row). If the sequencer is stopped, previews the chord via MIDI. |
| **Double click** | Toggles the step **active / off** without changing its chord data. |
| **Click duration badge** | Cycles the duration forward through all available values. |
| **Shift+click / Right-click duration badge** | Cycles the duration in reverse. |

The **currently playing step** is highlighted in yellow. The **selected step** is highlighted in purple.

---

## 6. Step Detail Row

Selecting any step reveals a detail bar beneath the grid:

| Field | Range | Notes |
|-------|-------|-------|
| **Active / Off** | Toggle | Inactive steps are skipped during playback but retain their data. |
| **Chord name** | Read-only | Set by loading from the library or assigning from the chord panel. |
| **Duration** | 128n → 8m | Step-specific note length. Overrides nothing globally — each step has its own timing. |
| **Velocity** | 0–127 | Use ↑ / ↓ arrow keys to nudge by 1; Shift+Arrow nudges by 10. |
| **Gate** | 0–100% | Portion of the step duration that the notes sound. `100%` = full legato. |
| **Transpose (Tr)** | –24 to +24 | Per-step pitch offset, stacked on top of the global Sequence Transpose. Yellow when non-zero; reset arrow appears when offset ≠ 0. |

---

## 7. Fill All Row

The Fill row applies a value to **all active steps at once**.

| Parameter | Description |
|-----------|-------------|
| **Dur** | Set a fixed duration, or tick **~** to randomise each step independently. Click **All** to apply. |
| **Vel** | Fixed velocity (0–127), or **~** for random. Click **All** to apply. |
| **Gate** | Fixed gate (0–100%), or **~** for random. Click **All** to apply. |
| **Tr** | Fixed transpose (–24 to +24), or **~** for random (uniform distribution). Click **All** to apply. |
| **Clear** | Resets all steps to empty defaults (inactive, no chord, default duration). Requires confirmation via the `↺ Clear` button. |

---

## 8. Library Tab

The Library gives access to SY.CORE's built-in chord progression database.

### 8.1 Key / Genre Selector (left column)

Two sub-tabs:

- **Keys** — 13 entries covering standard musical keys (e.g. *C Major*, *G Major*, *A Minor* …). Select a key to load its progressions.
- **Genre** — Style-based categories (e.g. *Jazz*, *Pop*, *Bossa Nova*, *Blues* …). Useful when you want genre-specific harmony rather than a specific tonal centre.

### 8.2 Progressions (centre column)

Lists all named progressions within the selected key/genre. Click a name to load its chords into the chord panel on the right. The first progression is auto-selected when a new key is loaded.

### 8.3 Chords (right column)

Shows every chord in the selected progression.

| Action | Result |
|--------|--------|
| **Click a chord** | Previews the chord over MIDI immediately (1-second sustain). |
| **Chord Transpose** | Shifts the preview (and any subsequent assignment) up/down by semitones without modifying the library data. |
| **+ Step N** | Assigns the selected chord to the currently selected step. |
| **Load All** | Distributes the entire progression across the active step count, replacing existing chord data. Steps are overwritten in order. |

---

## 9. Generate Tab

Generates a random progression automatically from the currently loaded key source.

1. Select your **key or genre** in the Library tab.
2. Switch to **Generate** and click **Generate Progression**.
3. Chords are drawn from a random named progression in the loaded data and spread evenly across all active steps.
4. The **Fill duration** setting in the Fill row is applied to all generated steps. Tick the **~** checkbox in the Fill row before generating if you want random per-step durations.

> The Generate button is disabled while progression data is loading.

---

## 10. Save / Load Tab

Requires a SY.CORE account.

### Saving

1. Enter a name in the text field.
2. Press **Save** or hit **Enter**.
3. The current steps (chord data, duration, velocity, gate, per-step transpose) and the active step count are persisted to the cloud under your account.

### Loading

Your saved progressions appear in the right column. Hover a row to reveal:

- **Load** (folder icon) — replaces the current sequence with the saved pattern.
- **Delete** (trash icon) — permanently removes the pattern from the library.

---

## 11. Performance Set Tab

List of available Performance Sets to select and load the devices patches.

---

## 12. Playback Engine Details

The sequencer uses a **384th-note tick grid** (4× the standard 96 PPQ) to support all standard durations including dotted and triplet values as exact integers.

| Duration | Ticks |
|----------|-------|
| 128th note | 3 |
| 64th note | 6 |
| 16th note | 24 |
| 16th triplet | 16 |
| 8th note | 48 |
| Quarter note | 96 |
| Half note | 192 |
| 1 bar | 384 |
| 2 bars | 768 |

In **Arp mode**, notes within a chord are staggered by the **Rate** interval. The note-off for each arpeggiated note is independent of the overall step gate.

A delayed **All Notes Off** panic (`AOF ms`) fires after stop to catch any notes that slipped through the timing gap between the sequencer stop and the final scheduled note-off callbacks.

---

## 13. MIDI Sync

| Option | Where to enable |
|--------|----------------|
| **MIDI START/STOP sync** | Enable *Sync MIDI Transport* in the MIDI Manager — sends MIDI Start/Stop messages alongside play/stop. |
| **Audio Capture sync** | Enable **REC SYNC** in the Chord Prog header — recording starts/stops with the sequencer. |

The sequencer output is tagged `MidiSource.CHORD_PROG` internally, which allows the MIDI routing matrix to route it separately from keyboard and Step Sequencer output.

---

## 14. Tips & Best Practices

- **Combine with the Step Sequencer** — run a bass/lead pattern in the Step Sequencer on one MIDI channel while the Chord Prog Sequencer drives pads or strings on another.
- **Use per-step transpose for modulation** — assign the same chord to multiple steps, then use per-step Tr offsets to create a modulating progression without changing the chord.
- **AOF tuning** — if your synth's release tail is cutting off, raise the AOF delay. If you hear ghost notes, lower it or set it to 0.
- **Loop off for one-shot fills** — switch to *Once* mode for a chord fill that plays exactly one cycle and waits for the next trigger.
- **Chord preview before assigning** — always click a chord in the library panel to hear it before loading it into a step. The preview uses the current MIDI channel and Chord Transpose.
