# Audio Capture

**Audio Capture** is a full-featured in-app audio recorder and editor. It records directly from any connected audio input, shows a live waveform during monitoring, and provides an interactive waveform editor with loop, crop, normalize, and export tools — all without leaving SY.CORE.

---

## Interface Layout

<img src="/help/guides/sycore-audio-capture.png"/>


## Core Concepts

### Three States

| State | Canvas shows | Level bar |
|-------|-------------|-----------|
| **Monitoring** | Live oscilloscope (neon green waveform) | Active |
| **Recording** | Same oscilloscope + red REC dot | Active (turns red when clipping) |
| **Playback / Edit** | Recorded waveform with loop handles | Hidden |

The component manages state through `isMonitoring`, `isRecording`, and `isPlaying` refs. All three can only be active one at a time in practice.

### Web Audio Pipeline

```
getUserMedia → MediaStreamSource → AnalyserNode → (level meter + canvas)
                                 ↓
                           MediaRecorder → chunks[] → Blob → blobURL
                                                             ↓
                                              AudioElement 1 ─┬─→ GainNode 1 ─┐
                                              AudioElement 2 ─┴─→ GainNode 2 ─┴→ destination
```

Dual audio elements (`audioRef1` / `audioRef2`) plus two gain nodes enable **crossfade looping** — when the playhead nears the loop end, the second element begins playing from the loop start while the first fades out.

---

## Features

### Recording

| Control | Behavior |
|---------|----------|
| **REC** | Starts immediately (or arms if MIDI Sync is on) |
| **STOP** | Finalizes the recording; waveform appears |
| **RESET** | Clears everything and restarts monitoring |
| **MIDI Sync** | Arms recording; fires automatically on first incoming MIDI note |

When `hasBackingTrack` prop is true, starting a recording also sends `toggle-backing-track` to start the backing track player in sync.

**MIDI learn:** Right-click the REC button to assign any CC or note via `audioCapture_record` param name.

### Auto-add to Playlist

Toggle the **PL** button in the device bar to automatically send every completed recording to the backing track playlist (dispatches `playlist-add-from-capture` with URL, label, duration, and current BPM).

### Append Mode

Toggle **Append** in the left column to accumulate recordings rather than replacing them.

| State | Behaviour |
|-------|-----------|
| **OFF** (default) | Each new recording discards the previous capture |
| **ON** | Each new recording is decoded and concatenated onto the existing capture — the result is a single merged WAV |

The merge happens via `OfflineAudioContext`: both blobs are fully decoded, their PCM frames are concatenated into a new `AudioBuffer`, and a fresh WAV is written back into memory. The waveform view, loop markers, and all export actions then operate on the merged audio.

**Use cases:** recording multiple takes without stopping the monitoring stream; capturing a live session in segments and assembling them in-app; building a rough multitrack composite without a DAW.

> The **PL** auto-add fires on the merged result, not on each segment individually.

### MIDI Trigger

Enable **MIDI SYNC** to arm the recorder. A flashing amber **Armed…** button replaces REC. The recording starts as soon as any MIDI note-on arrives. A live pulse dot shows incoming MIDI activity even when not armed.

---

## Waveform Editor

Once a recording exists, the canvas switches to waveform view with 160 amplitude peaks.

### Visual Markers

| Marker | Color | Description |
|--------|-------|-------------|
| Playhead | Neon pink | Current playback position |
| Play Start | Cyan dashed | Where playback begins |
| Loop Start | Green dashed | Start of the loop region |
| Loop End | Red dashed | End of the loop region |
| Bar lines | Yellow dashed | Beat grid derived from current BPM |

Bars inside the active loop region are drawn full-brightness; outside the region they are dimmed.

### Loop Controls

- **LOOP toggle:** Enables looping between Loop Start and Loop End.
- **Loop Start / Loop End sliders:** Set the loop window in seconds.
- **Play Start slider:** Offset where linear (non-loop) playback begins.
- **Snap to Grid:** When enabled, all handle positions are snapped to the nearest bar division calculated from the current BPM.
- **Crossfade (ms):** Duration of the crossfade between loop iterations (0 = hard cut).

### Zoom & Pan

| Control | Range | Description |
|---------|-------|-------------|
| **Zoom H** | 1× – 10× | Expands the time axis — useful for inspecting transients or aligning loop points to sample accuracy |
| **Pan** | 0–100 % | Horizontal scroll within the zoomed view; disabled and greyed out when Zoom H is at 1× |
| **Zoom V** | 1× – 10× | Amplifies the waveform vertically — reveals low-level detail in quiet recordings |
| **Crossfade** | 0 – 5 s | Controls the crossfade duration for looped playback (greyed out when Loop is OFF) |

Pan is automatically clamped so you cannot scroll past the end of the waveform — the slider maximum adjusts dynamically to `1 − 1/zoomX`.

---

## Timeline (Measure Progress)

A row of measure bars sits above the waveform canvas. Each bar sweeps left-to-right as playback or recording proceeds, driven by the current BPM from `midiStore.currentBpm`.

**Modes:**

| Mode | Trigger | Progress source |
|------|---------|-----------------|
| **Sync** | Automatic when playing or recording | Locked to `currentPlaybackTime` — accurate to the playhead |
| **Manual** | User-controlled | A dedicated ▶/■ button starts and stops the sweep independently of audio transport — useful for counting bars during live monitoring |

In **Manual** mode a small Play/Stop button appears next to the mode selector. Clicking it starts or stops the bar sweep without affecting the recording or playback state.

**Bars selector:** `1 / 2 / 4 / 8 / 16` — sets the number of measures in one sweep cycle. Persisted in localStorage (`S1_CAPTURE_TIMELINE_MEASURES`).

---

## Export & Transfer

| Action | Result |
|--------|--------|
| **MP3** | Exports the selected loop region as 192kbps MP3 (via `@breezystack/lamejs`) |
| **Save (WAV / WebM)** | If the loop is cropped: exports a 16-bit WAV; otherwise the raw WebM/OGG |
| **+PL (Nx)** | Sends the cropped region to the backing track playlist (with repeat count) |
| **→ Looper (T1–T8)** | Decodes and loads the cropped region into a Looper track slot |
| **Import** | Loads any MP3/OGG/WAV file as the "recording" for editing/re-export |

### Normalization

The **NORM** button in the footer normalizes the current recording in-place. Before clicking it, two sliders in the footer let you tune the process:

| Slider | Range | Default | Effect |
|--------|-------|---------|--------|
| **CEIL** | −12 to 0 dBFS | −3.0 dBFS | Target peak level after normalization |
| **GATE** | −96 to −12 dBFS | −60 dBFS | Noise gate threshold — samples quieter than this are zeroed before peak detection |

**Processing pipeline:**
1. All samples below the GATE threshold are set to zero.
2. The loudest remaining sample across all channels is measured.
3. Every sample is scaled so that peak lands at the CEIL value.
4. The result is encoded as a new 16-bit WAV blob and replaces the original in memory — the waveform view updates immediately.

> Set CEIL to −0.1 dBFS for the loudest possible result. Use a less aggressive GATE (e.g. −80 dBFS) if the recording has intentionally quiet sections you don't want gated out.

---

## Crossfade Looping — Technical Detail

When `isLooping` is true and the active audio element reaches `loopEnd - crossfadeDur`:
1. The **inactive** element is seeked to `loopStart` and played.
2. A Web Audio `linearRampToValueAtTime` fades the active gain from 1 → 0 and the inactive from 0 → 1 over `crossfadeDur` seconds.
3. After the fade, the old active element is paused and the reference swaps.
4. `isCrossfading` flag prevents re-triggering until the swap completes.

This produces gapless looping for sample-accurate material when crossfade = 0, or smooth blended loops when crossfade > 0.

---

## MIDI Mapping

The `audioCapture_record` param name can be mapped to any CC or Note via right-click on the REC button. When triggered, it calls `handleRecordClick()` which respects the current armed/recording state:

- If idle → start (or arm if MIDI sync enabled)
- If armed → cancel arm
- If recording → stop

---

## Playback Time Counter

When a recording is loaded, the footer displays a real-time position readout:

```
00:14 / 01:23
```

The left value tracks the current playback position (MM:SS); the right value is the total recording duration. The counter updates every animation frame during playback and is always visible regardless of loop or zoom state.

---

## Device Handling

### Hot-swap while monitoring

Selecting a different device from the dropdown while the monitor is already running reconnects immediately — the stream is stopped, the Web Audio graph is torn down, and monitoring restarts on the new device without closing the panel or losing any existing recording.

### Auto-fallback to default device

If the stored device ID fails to open (device disconnected, exclusive ownership by another app, driver error), the capture panel silently retries with the system default audio input and updates `S1_CAPTURE_DEVICE` accordingly. An error message is shown only if the default also fails.

### Device list refresh

The device list updates automatically whenever a device is plugged or unplugged (`navigator.mediaDevices.devicechange` event) — no manual refresh required.

---

## Resizable Panel

The capture panel supports free-form resizing: drag any corner or edge to adjust the width and height to match your workspace. The minimum size is 920 × 620 px. The position is persisted but the size is session-only (resets to default on reopen).

---

## Tips

- **Headless recording:** Fire `capture-start-rec` with `detail.background = true` to record without opening the panel. The monitor starts automatically.
- **BPM grid alignment:** Set the BPM in your MIDI clock source before recording. The waveform grid and snap grid will align to bars automatically.
- **Looper transfer:** Record a loop, crop with Loop Start/End handles, then send to any of the 8 Looper tracks with `→ Looper`.
- **MP3 range export:** The MP3 export always respects the current Loop Start/End crop — you get only what's between the handles.
- **Building a long take with Append:** Enable Append, record a section, stop, then record again — each stop merges the new chunk onto the growing capture. Disable Append when you want to start fresh.
- **Normalize before exporting:** Run NORM after recording to bring the level up before MP3 or WAV export. The GATE slider is especially useful for recordings with noisy silence between phrases.
- **Manual timeline for count-in:** Set the timeline to Manual mode and tap ▶ a bar before hitting REC — the sweep gives you a visual count-in at the current BPM without affecting the recording.
