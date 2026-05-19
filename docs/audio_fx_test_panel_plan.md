# Implementation Plan: Experimental Audio FX Test Panel

We will create a simple experimental panel to capture input from a selected audio device, apply Gain/Limiter and Compressor effects via Tone.js, and monitor the results to evaluate potential issues like latency and feedback.

## 1. Store and State Configuration
We will add `isAudioFxTestOpen` in `src/stores/useUiStore.js` to manage the panel's open/closed state.

```javascript
// useUiStore.js
const isAudioFxTestOpen = ref(false)

// inside closeAll()
isAudioFxTestOpen.value = false
```

## 2. Audio Processing Chain (Tone.js)
We will build a simple processing pipeline using Tone.js:
- **Tone.UserMedia**: Captures input from the selected device.
- **Tone.Compressor**: Real-time compression with adjustable Threshold, Ratio, Attack, and Release.
- **Tone.Volume**: Gain control (adjusts output volume in decibels).
- **Tone.Limiter**: Set to `-1dB` to prevent digital clipping/clash.
- **Tone.Meter**: Measures output levels for visual feedback.
- **Tone.Destination**: Outputs the processed signal.

## 3. Creating the Component (`AudioFxTestPanel.vue`)
We will create a new component `src/components/AudioFxTestPanel.vue` containing:
- **Device Selection**: List of inputs from `navigator.mediaDevices.enumerateDevices()`.
- **Monitor Toggle**: Starts/stops the `Tone.UserMedia` stream.
- **Visual Level Bar**: Displays output level in real time using requestAnimationFrame.
- **Sliders/Controls**:
  - **Volume/Gain**: `-60dB` to `+12dB`.
  - **Limiter**: Toggle to bypass/engage the limiter.
  - **Compressor Threshold**: `-60dB` to `0dB`.
  - **Compressor Ratio**: `1` to `20`.
  - **Compressor Attack**: `1ms` to `100ms`.
  - **Compressor Release**: `10ms` to `1000ms`.

## 4. Integration in `SynthApp.vue`
We will:
- Import `AudioFxTestPanel` and declare it in `<Teleport to="body">`.
- Add a new button in the footer (next to the BPM input or the MIDI transport controls) to toggle the FX Test Panel:
  ```html
  <!-- Audio FX Test Toggle -->
  <button 
    @click="uiStore.isAudioFxTestOpen = !uiStore.isAudioFxTestOpen"
    :class="['px-2 py-1 rounded-md text-[10px] font-bold uppercase flex items-center gap-1.5 transition-colors', 
      uiStore.isAudioFxTestOpen ? 'bg-synth-neon/20 text-synth-neon border border-synth-neon/50' : 'bg-neutral-900/50 border border-neutral-800 text-neutral-400 hover:text-synth-neon']"
  >
    <SlidersHorizontal class="w-3 h-3" />
    FX TEST
  </button>
  ```
