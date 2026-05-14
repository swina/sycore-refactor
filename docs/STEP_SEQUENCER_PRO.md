# SY.CORE // Step Sequencer Pro

The **Step Sequencer Pro** is a powerful algorithmic composition and MIDI sequencing engine integrated into SY.CORE. It allows you to create complex patterns, chord progressions, and automations quickly and intuitively, with a particular focus on live performance and creative generation.

---

## 1. Intelligent Generation (Algorithmic Engine)
At the heart of the sequencer is its style- and scale-based generation engine, which allows you to create musical patterns instantly.

- **Style-Based Generation**: Generates sequences optimized for specific genres:
  - *Electronic*: House, Techno, Acid, Minimal, Industrial, Drum&Bass.
  - *Groove*: Funk, HipHop, Latin, Reggae.
  - *Atmospheric*: Jazz, Ambient.
- **Scale & Key Engine**: Forces all generated notes within a selected musical scale (Major, Minor, Pentatonic, Dorian, Phrygian, Lydian, Mixolydian, etc.) and in a specific key.
- **Chord Progression Generator**: When enabled, the sequencer automatically generates harmonic progressions consistent with the selected style, managing polyphony (up to 4 voices).

## 2. Sequencer Architecture
- **16th Note Resolution**: Each pattern can extend up to 64 steps.
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

---
*SY.CORE LABS · Step Sequencer Pro v2.5*
