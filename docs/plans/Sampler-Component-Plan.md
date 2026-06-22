# Micro-Sampling & Resampling 
- From line and USB-C inputs. Sample Import
- resample your own loops with effects applied.Lo-Fi 

# Sound Shaping 
Allows you to select different sample rates (44.1, 22.05, 14.7, or 11.025 kHz) for that gritty, vintage-style crunch.Granular Engine: Go beyond standard playback by dividing samples into "grains" to create ethereal textures, time-stretching, or pitch-shifted effects.

# Powerful Sequencing
A 64-step sequencer that includes micro-timing, probability, sub-steps, and motion recording (which lets you automate parameter tweaks per step).Hands-On Performance 

# FX 
Includes built-in effects like Delay, Reverb, Vinyl Simulator, Scatter, and Filters to spice up your live performances.Massive 

# Sound Storage
8 banks per pattern, with 6 standard sound pads and 1 granular pad per bank, giving you access to up to 48 samples per pattern.

# Sampler Component Plan

## Context
The project plan at `F:\sycore\docs\plans\Sampler-Component-Plan.md` defines a hardware-sampler-style panel: micro-sampling from line/USB-C, lo-fi sample rate reduction, granular engine, 64-step sequencer with micro-timing/probability/motion recording, built-in FX (Delay, Reverb, Vinyl Sim, Scatter, Filter), and 8 banks × 7 pads = 56 sample slots per pattern.

This integrates into the existing sycore Vue/Vite app using the same patterns already proven in `DrumMachine`, `LoopMachine`, and `LivePerformancePad`.

---

## Data Models

### Pad (7 per bank: 6 standard + 1 granular)
```js
{
  id: 'sampler_B3_pad2',        // bank + pad index
  label: '',
  url: '',                      // blob URL from IDB (via useFreesoundCache)
  author: '',
  duration: 0,
  bpm: null,
  volume: 0.85,
  pan: 0,
  pitch: 0,                     // semitones offset
  startPoint: 0,                // 0–1 normalised
  endPoint: 1,
  loopMode: false,
  filterFreq: 20000,
  reverbSend: 0,
  delaySend: 0,
  sampleRate: 44100,            // 44100 | 22050 | 14700 | 11025 (lo-fi)
  // Granular pad only:
  grainSize: 0.1,               // seconds
  grainOverlap: 0.5,
  grainPosition: 0.5,           // 0–1 read position in sample
  grainPitch: 0,
}
```

### Sequencer Step (64 per track, 7 tracks per bank)
```js
{
  active: false,
  velocity: 100,
  accent: false,
  probability: 1.0,             // 0–1
  microTiming: 0,               // –0.5 to +0.5 steps
  pitchOffset: 0,               // semitones
  automation: {},               // { paramName: value } — motion recording
}
```

### Bank (8 banks: A–H)
```js
{
  pads: Array(7),               // 6 standard + 1 granular
  steps: Array(7).fill(Array(64).fill(defaultStep)),
}
```

### Pattern
```js
{
  id: 'pattern_TIMESTAMP',
  name: 'Pattern 1',
  bpm: 120,
  stepCount: 16,                // 16 | 32 | 64
  activeBank: 'A',
  banks: { A: bank, B: bank, ... H: bank },
}
```

---

## Audio Engine Architecture

Reuse `drum-engine.js` graph pattern per pad:

```
BufferSource (decoded sample, trimmed start/end)
  → sampleRateNode (offline-rendered lo-fi downsampling)
  → pitchShift (playbackRate or AudioWorklet)
  → padGain
  → filter (BiquadFilter lowpass)
  → panner (StereoPanner)
  → masterGain
  → compressor
  → destination
  → reverbSend → Convolver (synthetic IR, reuse drum-engine._makeReverbIR)
  → delaySend  → DelayNode + feedback loop
  → vinylSend  → wow/flutter + noise layer
```

Granular pad: schedule overlapping `AudioBufferSourceNode` grains via `ctx.currentTime` offsets inside a `setInterval` or `AudioWorklet`.

Lo-fi sample rate reduction: use `OfflineAudioContext` at target rate to render a downsampled buffer, cache the result in IDB alongside the original.

---

## File Structure

| File | Purpose |
|------|---------|
| `src/components/SamplerPanel.vue` | Main UI — pad grid, bank selector, step sequencer, FX panel |
| `src/stores/useSamplerStore.js` | Pinia store — patterns, banks, playback state, motion recording |
| `src/lib/sampler-engine.js` | Web Audio graph per pad, granular scheduler, FX nodes |

---

## Integration Points (existing files to modify)

### `src/stores/useUiStore.js`
- Add `const isSamplerOpen = ref(false)`
- Add to `MODAL_CYCLE_REGISTRY`, `MODAL_REFS`, `closeAll()`
- Export from return statement

### `src/stores/useConfigStore.js`
- Add toolbar migration block (same pattern as live-performance-pad, ~line 203):
  ```js
  if (!toolbarConfig.value.find(b => b.id === 'sampler')) { ... push + setDoc }
  ```

### `src/views/SynthApp.vue`
- Import `SamplerPanel`
- Add entry in `toolbarButtonMap` (~line 139)
- Add `<SamplerPanel v-show="uiStore.isSamplerOpen" ... />` in template

---

## Key Reuse

| What | Where |
|------|-------|
| `useDraggableResizable` composable | Window drag/resize, same as LoopMachine |
| `useFreesoundCache` (resolveUrl, cacheFileBlob) | All blob storage and URL resolution |
| `userKey()` from `@/lib/userKey` | All localStorage keys |
| `idbCachePut/Get/Delete` from `@/lib/idb` | Raw blob persistence |
| `drum-engine.js` → `_makeReverbIR`, delay/filter patterns | FX nodes |
| `useBpmDetector.js` → `detectBpmFromUrl` | Auto BPM on sample import |
| `FreesoundBrowser.vue` `loop-pad-assign` event | Import sounds from Freesound into pads |
| `AudioCapture.vue` `getUserMedia` + device picker | Line/USB-C recording input |
| `StepSequencer.vue` step grid UI pattern | 64-step grid rendering |
| `DrumMachine` A–F bank switching | Bank A–H switching pattern |

---

## Implementation Phases

### Phase 1 — Shell & State
- `SamplerPanel.vue` skeleton (draggable window, bank A–H tabs, 7-pad grid placeholder)
- `useSamplerStore.js` with pattern/bank/step data model, localStorage persistence via `userKey`
- Register panel in `useUiStore`, `useConfigStore`, `SynthApp.vue`

### Phase 2 — Sample Import & One-Shot Playback
- File picker → decode via `ctx.decodeAudioData` → cache in IDB via `cacheFileBlob`
- `getUserMedia` device picker for line/USB-C recording (reuse AudioCapture.vue pattern)
- FreesoundBrowser `loop-pad-assign`-style event to load sounds into sampler pads
- One-shot playback via `AudioBufferSourceNode` (no looping yet)

### Phase 3 — Sample Engine & FX
- `sampler-engine.js`: full per-pad graph (gain, filter, pan, reverb/delay sends)
- Lo-fi: offline downsampling to 22050/14700/11025 Hz via `OfflineAudioContext`
- Start/end point trimming on `AudioBufferSourceNode.offset` + `duration`
- Vinyl Simulator: slow LFO on playback rate (wow/flutter) + noise `AudioBufferSource`
- Scatter: randomised slice stutter via scheduled `AudioBufferSourceNode` grains

### Phase 4 — Step Sequencer
- 64-step grid per bank (7 rows × 64 columns), renderable at 16/32/64 step counts
- Scheduling via `Tone.js Transport` (already used in DrumMachine) or raw `AudioContext` clock
- Micro-timing: apply `step.microTiming * stepDuration` offset to scheduled time
- Probability: `Math.random() > step.probability` skips trigger
- Motion recording: on arm, write current pad param values into `step.automation` each tick

### Phase 5 — Granular Engine
- Granular pad (7th slot per bank): overlapping `AudioBufferSourceNode` grains
- Parameters: grainSize, grainOverlap, grainPosition, grainPitch
- Scheduler: `setInterval` at `grainSize * (1 - grainOverlap) * 1000 ms` spawns new grain
- Each grain: slice buffer at `grainPosition ± jitter`, apply Hann envelope gain, schedule at `ctx.currentTime`

---

## Verification

1. **Panel opens**: Click Sampler toolbar button → panel appears, draggable/resizable
2. **Sample import**: File picker → load WAV/MP3 → waveform thumbnail shows on pad
3. **Line input**: Select USB audio interface from device picker → record 2s → assign to pad
4. **Playback**: Click pad → sound plays with correct start/end, volume, pan
5. **Lo-fi**: Set sample rate to 11025 Hz → noticeably degraded, gritty output
6. **Sequencer**: Program 16-step pattern → press play → pads fire in sequence at set BPM
7. **Probability**: Set step probability 0.5 → step fires ~50% of runs
8. **Micro-timing**: Set positive micro-timing on step 2 → audibly late vs. grid
9. **Motion recording**: Arm recording, turn filter knob while sequencer plays → replay shows knob moving
10. **FX**: Reverb send > 0 → wet tail audible; Delay → rhythmic echoes; Scatter → stutter
11. **Bank switching**: Load different samples in banks A and B → live-switch between banks
12. **Granular**: Switch pad 7 to granular mode → adjust grainPosition → textural time-stretch
13. **Per-user isolation**: Log in as user B → sampler state is independent of user A
