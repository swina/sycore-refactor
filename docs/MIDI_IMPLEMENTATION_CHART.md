# MIDI Implementation Chart: Roland S-1 Tweak Synth

This document summarizes the MIDI Continuous Controller (CC) mapping and implementation for the Roland S-1 integration within SY.CORE.

## 1. Primary Control Mappings

| Parameter | CC# | Range | Description | Category |
| :--- | :---: | :--- | :--- | :--- |
| **Expression/Volume** | 11 | 0 - 127 | Main Output Volume | EFX |
| **LFO Rate** | 3 | 0 - 127 | Speed of the Low Frequency Oscillator | LFO |
| **LFO Waveform** | 12 | 0 - 5 | 0:Saw, 1:Saw Rev, 2:Sine, 3:Pulse, 4:Rnd, 5:Noise | LFO |
| **LFO Mod Depth** | 17 | 0 - 127 | Intensity of LFO modulation | LFO |
| **LFO Mode** | 79 | 0 - 1 | 0: Normal, 1: Fast | LFO |
| **LFO Sync** | 106 | 0 - 1 | 0: Off, 1: On | LFO |
| **VCO LFO Depth** | 13 | 0 - 127 | LFO intensity applied to Oscillator | OSCILLATOR |
| **VCO Range** | 14 | 0 - 5 | 64', 32', 16', 8', 4', 2' | OSCILLATOR |
| **Pulse Width** | 15 | 0 - 127 | Pulse width of the Square wave | ADVANCED |
| **PWM Source** | 16 | 0 - 127 | Source for Pulse Width Modulation | ADVANCED |
| **Osc Saw Level** | 20 | 0 - 127 | Level of the Sawtooth wave | OSCILLATOR |
| **Osc Pulse Level** | 19 | 0 - 127 | Level of the Square/Pulse wave | OSCILLATOR |
| **Osc Sub Level** | 21 | 0 - 127 | Level of the Sub Oscillator | OSCILLATOR |
| **Osc Noise Level** | 23 | 0 - 127 | Level of the Noise generator | OSCILLATOR |
| **Filter Cutoff** | 74 | 0 - 127 | VCF Cutoff Frequency | FILTER |
| **Filter Resonance** | 71 | 0 - 127 | VCF Resonance (Emphasis) | FILTER |
| **Filter Env Depth** | 24 | 0 - 127 | Envelope modulation depth on Filter | FILTER |
| **Filter LFO Depth** | 25 | 0 - 127 | LFO modulation depth on Filter | LFO |
| **Env Attack** | 73 | 0 - 127 | ADSR Attack Time | ENV |
| **Env Decay** | 75 | 0 - 127 | ADSR Decay Time | ENV |
| **Env Sustain** | 30 | 0 - 127 | ADSR Sustain Level | ENV |
| **Env Release** | 72 | 0 - 127 | ADSR Release Time | ENV |
| **Amp Env Mode** | 28 | 0, 127 | 0: ENV, 127: GATE | ENV |
| **Env Trig Mode** | 29 | 0-127 | 0: GATE, 64: LFO, 127: GATE+LFO | ENV |
| **Reverb Level** | 91 | 0 - 127 | Reverb send level | EFX |
| **Reverb Type** | 89 | 0 - 127 | Selects reverb algorithm | EFX |
| **Delay Level** | 92 | 0 - 127 | Delay send level | EFX |
| **Delay Time** | 90 | 0 - 127 | Delay feedback time | EFX |
| **Chorus Mode** | 93 | 0 - 127 | Selects chorus type | EFX |
| **Poly Mode** | 80 | 0 - 3 | 0: Mono, 1: Unison, 2: Poly, 3: Chord | POLY |
| **Portamento** | 65 | 0, 127 | Portamento On/Off | POLY |
| **Porta Time** | 5 | 0 - 127 | Portamento Slide Time | POLY |
| **Porta Mode** | 31 | 0, 127 | 0: Normal, 127: Legato | POLY |
| **Key Trig** | 105 | 0 - 1 | Sequencer Key Trigger On/Off | ADVANCED |
| **Draw Mode** | 107 | 0 - 2 | 0: Off, 1: Step, 2: Slope | ADVANCED |
| **Draw Multiply** | 102 | 0 - 127 | Oscilloscope Draw Multiplier | ADVANCED |
| **Chop Overtone** | 103 | 0 - 127 | OSC Chop Overtone Intensity | DYNAMIC |
| **Chop Comb** | 104 | 0 - 127 | OSC Chop Comb Intensity | DYNAMIC |

## 2. System Settings

| Function | Type | Implementation |
| :--- | :--- | :--- |
| **System Version** | Metadata | ROLAND S-1-v1.02 Target |
| **MIDI Clock** | Receive | Supported via WebMIDI (MidiService.ts) |
| **Start/Stop** | Realtime | Supported (System Real-Time Messages) |
| **Program Change** | Control | Integrated with Sound History and Preset management |

## 3. Advanced OSC Models (Chop/Draw)

The S-1 OSC engine is extended through MIDI CCs 102-104 and 107 to control the hidden "Draw" and "Chop" parameters not available on the physical top panel but fully integrated into the SY.CORE **Dynamic** and **Advanced** panels.

## 4. Native Controller Support: Novation Launchpad Mini MK1

SY.CORE includes native drivers for the Launchpad Mini (MK1/MK2) with automatic LED feedback.

| Control Type | MIDI Note/CC | App Action | LED Feedback |
| :--- | :---: | :--- | :--- |
| **Top Row Button 1** | CC 104 | `toggle_visualizer` | Green (On/Off) |
| **Top Row Button 2** | CC 105 | `toggle_sequencer` | Green (On/Off) |
| **Top Row Button 3** | CC 106 | `toggle_arp` | Green (On/Off) |
| **Top Row Button 4** | CC 107 | `toggle_liveset` | Green (On/Off) |
| **Top Row Button 5** | CC 108 | `open_midi_matrix` | Green (On/Off) |
| **Top Row Button 6** | CC 109 | `toggle_midi_capture`| Green (On/Off) |
| **Top Row Button 7** | CC 110 | `toggle_looper` | Green (On/Off) |
| **Top Row Button 8** | CC 111 | `toggle_panel` (Expand) | Green (On/Off) |
| **Grid Pads (8x8)** | Notes 0-120 | Custom / `grid_pad_press` | Configurable |
