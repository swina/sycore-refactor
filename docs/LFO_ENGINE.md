# SY.CORE Modulation Engine for Roland S-1

The SY.CORE Modulation Engine is a software-based system that extends the hardware capabilities of the Roland S-1. It provides two independent, assignable Low-Frequency Oscillators (LFOs) and a dedicated Velocity Mapping system that communicate with the hardware via high-resolution MIDI CC messages.

## 1. Dual LFO Units (LFO 1 & LFO 2)

SY.CORE provides two identical, independent LFO units. Each unit can be routed to any controllable parameter of the Roland S-1 (Cutoff, Resonance, Pulse Width, FX Send, etc.).

### Key Features
*   **Waveforms**: 
    *   **Sine**: Smooth, continuous oscillation.
    *   **Triangle**: Linear rise and fall.
    *   **Square**: Gated/Toggle modulation.
    *   **Sawtooth**: Rising ramp for rhythmic sweeps.
    *   **S&H (Sample & Hold)**: Random stepped modulation for generative textures.
*   **Oscillation Modes**:
    *   **FREE Mode**: Rate defined in Hertz (Hz), ranging from 0.01 Hz to 20 Hz.
    *   **SYNC Mode**: Rate synchronized to the application BPM, defined in musical divisions (1/4, 1/8, 1/16, etc.).
*   **Stability Protocol**: 
    *   **Auto-Centering**: Upon activation, the engine captures the current parameter value as an "offset" to ensure modulation starts from the expected state.
    *   **Staggered Restoration**: When disabled, the engine sends a high-priority MIDI stream to restore the parameter to its original value, preventing "stuck" values.

## 2. Velocity Mapping Engine

The Velocity Mapping system allows note velocity (how hard a key is pressed) to dynamically modulate synthesizer parameters in real-time.

### Features
*   **Dynamic Routing**: Map velocity to Cutoff, Resonance, Volume, or any other supported MIDI CC field.
*   **Modulation Curves**:
    *   **Linear**: Direct 1:1 relationship between velocity and modulation.
    *   **Exponential**: More sensitive at higher velocities.
    *   **Logarithmic**: More sensitive at lower velocities.
*   **Bipolar Depth**: Control whether velocity increases or decreases the target parameter value.

## 3. Integration & Persistence

*   **Preset Binding**: All modulation settings (LFO configurations and Velocity maps) are saved within the SY.CORE Preset document.
*   **A/B Variations**: Modulation states are unique to each A/B variant, allowing for radical performance comparisons.
*   **Background Processing**: The engine runs as a low-latency background service, ensuring smooth modulation even while navigating the UI.
