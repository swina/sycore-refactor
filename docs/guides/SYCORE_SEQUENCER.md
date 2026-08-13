# Sequencer 

The **Sequencer** is a powerful algorithmic composition and MIDI sequencing engine integrated into SY.CORE. It allows you to create complex patterns, chord progressions, and automations quickly and intuitively, with a particular focus on live performance and creative generation.


<img src="/help/guides/sycore-sequencer.png"/>


---

## 1. Intelligent Generation (Algorithmic Engine)
At the heart of the sequencer is its style- and scale-based generation engine, which allows you to create musical patterns instantly.

- **Style-Based Generation**: Generates sequences optimized for specific genres:
  - *Electronic*: House, Techno, Acid, Minimal, Industrial, Drum&Bass.
  - *Groove*: Funk, HipHop, Latin, Reggae.
  - *Atmospheric*: Jazz, Ambient.
- **Scale & Key Engine**: Forces all generated notes within a selected musical scale (Major, Minor, Pentatonic, Dorian, Phrygian, Lydian, Mixolydian, etc.) and in a specific key.

## 2. Sequencer Architecture
- **16th Note Resolution**: Each pattern can extend up to 16 steps.
- **Native Polyphony**: Each step can contain multiple notes simultaneously, allowing for the creation of chords or melodic layering.
- **Parameter Locks (P1 & P2)**: Each step stores the value of two assignable MIDI CCs. This allows you to automate parameters like Cutoff, Resonance, or effect intensity on a per-step basis.
- **Gate & Tie (Slide)**:
  - **Gate**: Precise control of the note duration within the step (0-100%).
  - **Tie Steps**: Allows you to tie notes between consecutive steps, essential for creating TB-303 style "slides" (Acid).

## 3. Workflow & Performance
- **Real-time Recording**: Record notes in real-time from external MIDI keyboards or the integrated virtual keyboard directly into the steps.
- **Global Transpose**: Transpose the entire sequence in real-time without stopping playback.
- **Backing Track Sync**: Automatic synchronization with the Backing Track Player to start/stop sequences in sync with the backing tracks.
- **MIDI Export**: Export your patterns as standard MIDI files (.mid) for use in your favorite DAW.

## 4. Interface & UX
- **Step Visualizer**: Immediate visual feedback of the current transport position.
- **Contextual Editor**: Selecting a step brings up a dedicated editor to refine velocity, gate, notes, and parameters.
- **Quick Randomize**: Fast randomization functions for individual parameters (Velocity, Gate, CCs) to add organic variations on the fly.
- **Clear & Safety**: Confirmation-based clear system to prevent accidental pattern loss during live sets.

## 5. Using the Step Sequencer

The Step Sequencer is accessed directly from the Sound Engine header. It lives alongside the sound — each preset can carry its own embedded pattern — and drives the Roland S-1 hardware with the same MIDI routing used by the keyboard and arpeggiator.

### 5.1 — Opening the Sequencer

In the Sound Engine header, click the :ListMusic: **Sequencer** button (the list-music icon). The panel opens below the sound engine. While open, the button turns **amber**. If a pattern is already saved with the current sound, the button is **violet** even when the panel is closed — that is the SEQ badge.

```
[▶ / ■]  [AUTO]  [:ListMusic: violet]   ← sound has a linked pattern
[▶ / ■]  [AUTO]  [:ListMusic: amber]    ← panel is currently open
[▶ / ■]  [AUTO]  [:ListMusic: neutral]  ← no pattern linked yet
```

---

### 5.2 — Interface at a Glance

<img src="/help/guides/sycore-sequencer-steps-ui.png"/>


Each step is a vertical stack of 12 clickable note bars (C–B, chromatic) with its own:
- Octave (0–8) 
- Accent on/off 
- Probability (0–100%)
- Chords/Notes can be programmed by clicking directly instead of only live-recording from a keyboard. 
- Lenght of each bar indicates the gate value (0-100)
- A cyan dot if P1 is locked on that step
- An indigo dot if P2 is locked on that step
- An amber glow on the currently playing step

Runs as an independent MIDI FLOW app (own IN/OUT, own local pattern storage) alongside the existing Step Sequencer

---

### 5.3 — Generating a Pattern

The fastest way to get a pattern is to use the algorithmic generator.

1. Choose a **Style** from the dropdown — this sets rhythmic density, octave range, velocity profile, and gate character:

| Style | Character | Steps | Notes |
|-------|-----------|-------|-------|
| House | Driving four-on-the-floor | 16 | Mid velocity, short gate |
| Techno | Hard and accented | 16 | High velocity, accent grid |
| Acid | TB-303 slides | 16 | Dense, high resonance, auto-slide |
| Ambient | Sparse and sustained | 16 | Low velocity, long gate |
| Jazz | Swung melodic | 16 | Wide velocity range, varied gate |
| Funk | Syncopated accents | 16 | Tight gate, groove grid |
| Drum&Bass | Rapid 32nd-note runs | 32 | High velocity, short gate |
| HipHop | Laid-back groove | 16 | Mid density, swung |
| Latin | Rhythmic accents | 16 | Syncopated accent grid |
| Industrial | Heavy and driving | 16 | Max velocity, low octaves |
| Minimal | Very sparse | 16 | Low density, restrained |
| Reggae | Offbeat pattern | 16 | Accent grid, mid velocity |
| Pop | Balanced melodic | 16 | Accent grid, mid density |
| Rock | Energetic | 16 | High velocity, accent grid |
| Electronic | General purpose | 16 | Accent grid, mid gate |

2. Set **Scale** and **Key** — all generated notes are constrained to the scale. Available scales: Major, Minor, Harmonic Minor, Pentatonic Major, Pentatonic Minor, Blues, Dorian, Phrygian, Lydian, Mixolydian, Locrian, Whole Tone, Hungarian Minor, Chromatic.

3. Set **Base Octave** and **Range** (±3 octaves span).

4. Adjust **Density** (0–100 %) — how many of the available steps are activated.

5. Click **Generate**. A new pattern fills the grid immediately and playback starts if the transport is already running.

> Enable **Chords** mode and set **Max Polyphony** (1–4) before generating to get multi-note steps. The generator builds chord voicings from the selected scale.

---

### 5.4 — Editing Steps Manually

**Activate / deactivate a step:** Click any dim step cell to toggle it on; click an active (lit) cell to turn it off.

**Select a step for editing:** Click the step number at the top of the cell. The **Step Editor** row appears below the grid showing:

| Control | Range | Action |
|---------|-------|--------|
| ACTIVE toggle | On / Off | Enable or silence this step |
| Notes | text display | Shows all notes in the step |
| Velocity | 1–127 | Drag slider or use ↑↓ arrow keys (Shift = ×10) |
| Gate | 0–100 % | Duration of the note within the step |
| Tie | 0–16 steps | Extends the note across subsequent steps (TB-303 slide) |
| P1 | 0–127 | Value for the first parameter lock CC |
| P2 | 0–127 | Value for the second parameter lock CC |

Each slider has two quick-action buttons:
- **ALL** — copies this step's value to every step in the pattern
- **RND** — randomises all steps for that parameter

**Entering notes:** With a MIDI keyboard connected, select a step and play a key — the note is written to that step. Play multiple keys simultaneously to build a chord. Release all keys and the editor advances to the next step automatically.

---

### 5.5 — Parameter Locks (P1 / P2)

Parameter locks let each step send a different CC value — the classic "per-step automation" technique. By default P1 is mapped to **Cutoff (CC 74)** and P2 to **Resonance (CC 71)**. Both can be reassigned to any of the 36 Roland S-1 parameters via the dropdowns in the generation row.

**Setting a lock on a specific step:**

1. Select the step.
2. Drag the P1 or P2 slider in the step editor to the desired value.
3. A cyan (P1) or indigo (P2) dot appears on the cell — the lock is active.

**Recording locks live from hardware:**

1. Start playback and enable **REC**.
2. Turn the physical knob mapped to the P1 or P2 CC on your controller.
3. The current playing step captures the CC value automatically.

**Randomising all locks:** Click **RND** next to P1 or P2 in the step editor. Each step receives a random value within the ±variation range set in the generation controls.

---

### 5.6 — Playback and Transport

| Control | Behaviour |
|---------|-----------|
| **▶ Play** | Starts the Tone.js transport; the amber step cursor begins moving |
| **■ Stop** | Stops transport, sends Note Off to all active notes, restores Expression (CC 11) to 127 |
| **BPM** | Numeric input — changes tempo immediately; syncs to incoming MIDI clock if a clock source is configured |
| **Steps** | 2–64 — shrink or extend the loop length without clearing existing steps |
| **Transpose** | −24 to +24 semitones — shifts all notes in real time without rewriting the pattern |
| **Transport position** | Displays as `BAR : BEAT : 16TH` |

**Sync to Backing Track:** Enable the link in the [MIDI Sync Matrix](./SYCORE_MIDI%20MANAGER.md) (`Backing Track → Step Sequencer`). When the backing track starts, the sequencer starts with it.

---

### 5.7 — Live Recording

**Step record (sequencer stopped):**

1. Click **⏺ REC** — the button glows red.
2. Click a step cell to select it.
3. Play a note (or chord) on your MIDI keyboard → the note writes to that step.
4. Release all keys → the editor auto-advances to the next step.
5. Repeat until the pattern is filled. Click REC again to exit.

**Overdub record (sequencer playing):**

1. Start playback, then click **⏺ REC**.
2. Play notes on your keyboard — they record into whichever step is currently playing.
3. Playing a new step overwrites its notes; playing additional notes on the same step builds a chord.
4. Turn a knob assigned to P1/P2 to record parameter locks simultaneously.
5. Click **⏺ REC** again or press Stop to exit.

---

### 5.8 — Linking a Pattern to a Sound

A pattern that is not linked exists only in the sequencer panel — it is lost when you load another sound. Linking saves the pattern inside the preset itself.

1. Design your pattern and confirm it sounds right with the current sound.
2. Click **LINK** in the top-right of the sequencer toolbar. The button turns **violet** and reads **UNLINK**.
3. Save the preset (💾 in the Sound Engine header). The pattern is now embedded in the preset.

When a linked pattern exists:

- The **SEQ badge** (violet chip) appears in the Sound Engine identity header.
- Loading this preset from the library recalls the pattern automatically.
- The **▶ Play** button in the Sound Engine header starts the sequencer directly without opening the panel.
- **AUTO mode** (see below) lets an incoming MIDI note trigger the whole thing hands-free.

To detach the pattern, click **UNLINK** — the sequencer state remains but the preset no longer carries it.

---

### 5.9 — AUTO Mode

AUTO mode starts the sequencer automatically on the first MIDI Note On received after a sound with a linked pattern is loaded. No button press required on stage.

**Enable:** Click **AUTO** in the Sound Engine header — it glows when active.

**What happens when a note arrives:**

1. The sequencer starts from step 1.
2. The played note becomes the **dynamic transpose root** — the entire pattern shifts so that the pattern's root note maps to the key you played.
3. Subsequent notes continue to transpose dynamically as long as AUTO is on.

This makes it possible to play the sequencer like a monophonic instrument — tap a key and the pattern plays in that key, instantly.

**Disabling:** Click AUTO again. The sequencer continues playing but stops auto-starting on new notes.

---

### 5.10 — Exporting as MIDI

Click the **⬇ MIDI** export button in the toolbar. SY.CORE generates a standard `.mid` file (Format 0, 480 PPQ) containing:

- All active steps with their note(s), velocity, and gate duration
- Tie extensions applied to note lengths
- Global transpose baked into the note pitches
- A tempo meta event matching the current BPM

The file is named `S1_Sequence_[SoundName].mid` and downloads immediately. Import it into any DAW to continue editing or to layer it with other tracks.

---

### 5.11 — Sequencer Workflow Recipes

**Acid bassline in 60 seconds**

1. Set Style → **Acid**, Scale → **Minor**, Key → **A**, Octave → **2**
2. Click **Generate** — dense pattern with auto-slides appears
3. Open FILTER tab → pull Cutoff down to 40, Resonance up to 90
4. Map P1 to **Cutoff** (CC 74), enable REC, turn the cutoff knob while playing → per-step filter motion recorded
5. LINK → Save

**Live transpose performance**

1. Load a sound with a linked pattern and AUTO enabled
2. Play single notes on your keyboard — each note re-roots the sequence
3. Use the **Transpose** control (±24) for coarser shifts mid-performance
4. Switch A/B variant for an instant tonal change without stopping

---



---
*SY.CORE LABS · Step Sequencer Pro v2.5*
