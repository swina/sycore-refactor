# Replicate Audio Looper Timeline in Audio Capture Component

This plan details the changes to be made to `AudioCapture.vue` to add a reference bar timeline similar to the one in `AudioLooper.vue`, allowing either manual play/pause or automatic synchronization with play/record status.

## User Review Required

> [!IMPORTANT]
> - The new timeline will support choosing cycle/measure counts (1, 2, 4, 8, or 16 bars) and automatic calculation of time using the global `midiStore.currentBpm`.
> - **Modes**:
>   - **Sync Mode**: The timeline starts automatically when the audio capture starts recording or playing, resetting to 0 when stopped.
>   - **Manual Mode**: The timeline runs independently using a dedicated play/stop button.

## Proposed Changes

### Components

#### [MODIFY] [AudioCapture.vue](file:///f:/Projects/sy.core/sy.core-app/src/components/AudioCapture.vue)

1. **Import `useMidiStore`**:
   Import `useMidiStore` and define `midiStore = useMidiStore()` to access `currentBpm`.

2. **Add Reactive State**:
   Define `timelineMeasures`, `timelineMode`, `timelineProgress`, and `timelineActive`. Persist measures and mode choices in `localStorage`.

3. **Timeline Animation Loop**:
   Implement a `requestAnimationFrame`-based loop `startTimelineLoop` and `stopTimelineLoop` to calculate timeline progress smoothly based on the BPM:
   $$\text{totalSeconds} = \text{timelineMeasures} \times 4 \times \frac{60}{\text{bpm}}$$
   $$\text{progress} = \frac{(\text{performance.now()} - \text{startTime}) \pmod{\text{totalSeconds}}}{\text{totalSeconds}} \times 100$$

4. **Synchronization Logic**:
   Watch `isRecording` and `isPlaying` to start/stop the timeline when in `"synced"` mode.

5. **Layout Updates**:
   Wrap the canvas container in a flex column layout and insert the timeline reference strip (incorporating bar divisions and the progress bar) right above the canvas.

## Verification Plan

### Manual Verification
- Open the Audio Capture panel.
- Select **Sync** mode, start recording/play, and verify the timeline sweeps in sync with BPM.
- Select **Manual** mode, click the play button, and verify the timeline sweeps independently.
- Change the number of bars (e.g., from 4 to 8) and verify the timeline length scales correctly.
