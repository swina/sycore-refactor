# High-Precision Self-Correcting MIDI Clock

To resolve the timing drift reported by the user (where the sequencer/device slows down after a few measures), we have analyzed the clock generation:
1. **The Integer Millisecond Limitation:** `window.setInterval` only accepts integer milliseconds. At 110 BPM, the required pulse interval is `22.727` ms. The browser rounds this to `22` ms or `23` ms.
2. **Timing Drift Accumulation:** This rounding introduces an error of up to `0.727` ms *per pulse*. Because there are 24 pulses per quarter note (96 per bar), this accumulates to over **104 ms of drift in just 4 measures**, causing slaved hardware devices to drastically slow down and fall out of phase.
3. **The Solution:** We will replace `window.setInterval` with a **high-precision, self-correcting `window.setTimeout` loop**. By tracking the absolute timeline using floating-point time (`performance.now()`), any rounding error introduced in one step is automatically compensated for in the very next step. Accumulative drift will remain at virtually zero.

## Implemented Changes

### [MidiService.ts](file:///f:/Projects/sy.core/sy.core-app/src/core/midi/MidiService.ts)

- Replace properties on line 76:
  ```typescript
  private clockInterval: any = null;
  private clockExpectedTime: number = 0;
  ```

- Refactor `startClock` and `stopClock` to use the self-correcting timeline loop:
  ```typescript
  startClock() {
    this.stopClock();
    if (!this.currentBpm || this.currentBpm < 1) return;
    this.isPlayingClock = true;
    const intervalMs = 60000 / (this.currentBpm * 24);

    const sendPulse = () => {
      this.broadcast('clock', {}, 0, MidiSource.TRANSPORT);
    };

    sendPulse();
    
    this.clockExpectedTime = performance.now() + intervalMs;
    
    const tick = () => {
      if (!this.isPlayingClock) return;
      
      sendPulse();
      
      const now = performance.now();
      const drift = now - this.clockExpectedTime;
      
      this.clockExpectedTime += intervalMs;
      const nextDelay = Math.max(0, intervalMs - drift);
      this.clockInterval = window.setTimeout(tick, nextDelay);
    };
    
    this.clockInterval = window.setTimeout(tick, intervalMs);
  }

  stopClock() {
    if (this.clockInterval !== null) {
      window.clearTimeout(this.clockInterval);
      this.clockInterval = null;
    }
    this.isPlayingClock = false;
  }
  ```

## Verification Plan

- Ensure the TypeScript code compiles cleanly.
- Verify that the MIDI clock remains perfectly synchronized with no drift or slowdown over long periods.
