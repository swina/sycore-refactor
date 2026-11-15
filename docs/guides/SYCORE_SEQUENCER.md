# Sequencer 

The **Sequencer** is a powerful algorithmic composition and MIDI sequencing engine integrated into SY.CORE. It allows you to create complex patterns, chord progressions, and automations quickly and intuitively, with a particular focus on live performance and creative generation.


<img src="../../help/guides/sycore-sequencer.png"/>


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
- **Follows the Chord Prog**: with MIDI Flow cabling Chord Prog → Sequencer and AUTO on, a chord starts the Sequencer and its root transposes the pattern. Started this way, it **stops with the chord**: the Chord Prog's STOP (or MIDI `cp_panic`), a click on the chord sounding, or the Chord Prog's own Stop. Started by Play, Play All or a Rig pad, it plays on. **Stopped by you** (its Stop button, its Rig pad, or a MIDI-learned `seq_play`) the chords no longer start it: it stays off until you start it again (Play, a pad, Play All) — then it follows the chords' key again. So the Sequencer comes in and out when you choose; Stop All and Live's Stop don't hold it off. To never auto-start it, turn AUTO off.
- **Follow: Degree / Chrom** (the generation row, remembered per user) — how the pattern moves on the chords or notes it receives. **Degree** (default): by **scale degree**, inside the Sequencer's Key / Scale, so it stays in key — in C major, a Dm moves C-E-G to D-F-A (a chromatic shift would give D-F♯-A), an Am moves it two degrees down (the nearest way, the line keeps its register). The Chord Prog's chord moves it by its **root, read from the chord's name** (an inversion such as F-A-D is still D), not by each note of the voicing. Set the Sequencer's Key / Scale to the chords' key (the Rig's GEN does it from the Chord Prog's key). **Chrom**: by semitones from the pattern's first note, as before.
- **Backing Track Sync**: Automatic synchronization with the Backing Track Player to start/stop sequences in sync with the backing tracks.
- **MIDI Export**: Export your patterns as standard MIDI files (.mid) for use in your favorite DAW.
- **Performance workspace**: a play view (banks A–H, the pattern on one row, the step sounding lit); its header has **EDIT** (the full panel; **Play view** goes back) and the active bank's **Style** menu — what Generate and the Rig's GEN write.

## 4. Interface & UX
- **Step Visualizer**: Immediate visual feedback of the current transport position.
- **Contextual Editor**: Selecting a step brings up a dedicated editor to refine velocity, gate, notes, and parameters.
- **Quick Randomize**: Fast randomization functions for individual parameters (Velocity, Gate, CCs) to add organic variations on the fly.
- **Clear & Safety**: Confirmation-based clear system to prevent accidental pattern loss during live sets.

### 5.1 — Opening the Sequencer

Click the **Sequencer** button.

---

### 5.2 — Interface at a Glance


<img src="../../help/guides/sycore-sequencer.png"/>

Each step is a vertical stack of 12 clickable note bars (C–B, chromatic) with its own:
- Octave (0–8) 
- Accent on/off 
- Probability (0–100%)
- Chords/Notes can be programmed by clicking directly instead of only live-recording from a keyboard. 
- Lenght of each bar indicates the gate value (0-100)
- A cyan dot if P1 is locked on that step
- An indigo dot if P2 is locked on that step
- An amber glow on the currently playing step

Runs as an independent MIDI FLOW app (own IN/OUT, own local pattern storage).

---

### 5.3 — Generating a Pattern

The fastest way to get a pattern is to use the algorithmic generator.

1. Choose a **Style** from the dropdown — picking one sets its **Density** and **octaves** (Base Octave, Range) as a starting point, and gives Generate its velocity profile, gate character and **accent grid** (the steps it favours in *Weighted* rhythm); a bank loaded keeps its own Density and octaves:

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
| Arpeggio | Arpeggiator | 16 | Every step, in the **Arp** mode's order (Up, Down…); its notes: **1-3-5** (default: the key's chord — following the Chord Prog moves it onto each chord as it plays), **+7** (with its 7th), **Scale** (every note of the scale, as before) |

2. Set **Scale** and **Key** — all generated notes are constrained to the scale. Available scales: Major, Minor, Harmonic Minor, Pentatonic Major, Pentatonic Minor, Blues, Dorian, Phrygian, Lydian, Mixolydian, Locrian, Whole Tone, Hungarian Minor, Chromatic.

3. Set **Base Octave** and **Range** (±3 octaves span).

4. Adjust **Density** (0–100 %) — how many of the available steps are activated.

5. Pick the **Rhythm** — *which* steps play (melodic mode; saved with the bank):
   - **Wgt** (Weighted, default): the strong steps first — the bar's 1, then the half bar, the beats, the 8ths, the 16ths — plus the style's accents. **Sync** (0–100) moves the weight to the weak steps: **0** = on the beats, **30–60** = groove (the bar's 1 stays, the rest syncopates), **100** = off the beat. With Sync under 50 and Density at least 25 %, the 1 is always played.
   - **Eucl** (Euclid): Density's onsets spread as evenly as possible over the steps (`k/n` shown: 4/16 = four on the floor, 3/8 = tresillo, 5/16…); **Rot** turns the pattern a step at a time.
   - **Rnd** (Random): any step, every one as likely (the generator before).

   And the **Melody** — the notes (melodic mode; saved with the bank):
   - **Line** (default): a **motif** — half a bar at 16 steps, a bar at 32+ — whose rhythm and notes repeat, the last block (and every other one) **varied** in its last notes (A A′, A A′ A A″). The line moves **mostly by step**; a leap is followed by a step back the other way; it keeps to the middle of the range; the **tonic chord's notes (1-3-5) fall on the strong steps** and the phrase **ends on the tonic**. A low range (top octave 3 or below) plays as a **bass**: on the root more, octave jumps allowed. Following the Chord Prog (Follow: Degree) moves those notes onto each chord's as it plays.
   - **Classic**: a random note of the scale on each step, in a random octave of the range (the generator before).

6. Set **Vary** (next to Generate; right-click: MIDI Learn `seq_vary`) — the share of the pattern Generate replaces: **100** = a new pattern (default), **25** = a quarter of it, the rest kept, so the phrase changes a little at a time (a Turing Machine's lock). Positions are counted within the motif, so its repeats change together. The Rig's **Shift + GEN** on the Seq row (**Mutate**) uses Vary, or 25 % when Vary is at 100.

7. Click **Generate**. A new pattern fills the grid immediately and playback starts if the transport is already running.

> Enable **Chords** mode and set **Max Polyphony** (1–4) before generating to get multi-note steps. The generator builds chord voicings from the selected scale.

---

### 5.4 — Editing Steps Manually

**Activate / deactivate a step:** Click any dim step cell to toggle it on; click an active (lit) cell to turn it off.

**Select a step for editing:** Click the step number at the top of the cell. The **Step Editor** row appears below the grid showing:

<img src="../../help/guides/sycore-sequencer-steps-ui.png"/>

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

**Generated values:** Generate writes P1 / P2 on every step it makes, in every mode (melodic, chords, Arpeggio): the instrument preset's value for that CC, moved at random by **RND%** — positive up to that share of the way to 127, negative down to that share of the way to 0 (RND 0 = the preset's value on every step). RND% is also in the Play View.

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

### 5.8 Chain Mode

Chain mode lets you sequence up to 8 pattern slots in order for continuous playback.

Enable chain mode by clicking the **Chain** toggle in the transport bar. When active, a chain editor row appears below the transport bar showing 8 clickable slots.

| Action | Result |
|--------|--------|
| **Click a slot** | Cycles through `null → A → B → C → D → E → F → null` |
| **Right-click a slot** | Clears the slot to null |
| **Clear all button** | Empties all 8 slots |

While chain mode is active and the sequencer is playing, each slot is played for one bar before advancing to the next filled slot. Empty slots are skipped. A blue highlight on the slot indicates the currently playing position.

Chain configuration (slots and autofill settings) is saved and restored with presets.

---

### 6.0 — Exporting as MIDI

Click the **⬇ MIDI** export button in the toolbar. SY.CORE generates a standard `.mid` file (Format 0, 480 PPQ) containing:

- All active steps with their note(s), velocity, and gate duration
- Tie extensions applied to note lengths
- Global transpose baked into the note pitches
- A tempo meta event matching the current BPM

The file is named `S1_Sequence_[SoundName].mid` and downloads immediately. Import it into any DAW to continue editing or to layer it with other tracks.

---

### 6.1 — Sequencer Workflow Recipes

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
*SY.CORE LABS · Sequencer Pro v2.5*
