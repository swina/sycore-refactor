/**
 * step-scheduler.ts — a 16th-note step grid on the system clock
 * (performance.now() ms), for apps that play MIDI only.
 *
 * Today every app counts time on the Tone.js transport, which runs on the
 * *audio* clock: when the audio thread is overloaded (measured: 85% of real
 * time with the FM-1 Emulator open, 45% with the window in the background)
 * the MIDI notes slow down with it, though they need no audio at all. This
 * grid runs on the system clock instead; notes are computed `lookaheadMs`
 * ahead and sent with a timestamp, so the browser's MIDI layer puts them out
 * on time even when the page stutters.
 *
 *   INT  — the grid follows a tempo (setTempo), from a start time.
 *   EXT  — the grid is re-anchored on every beat of the external master
 *          (anchorTo), so it sits on Live's clock with no phase lock to drift.
 *
 * Pure: the caller drives it with tick(now), e.g. from a Worker timer
 * (createWorkerTicker below), and gets onStep(step, timeMs, late) calls.
 */

export interface StepSchedulerOptions {
  /** How far ahead steps are handed out, in ms. */
  lookaheadMs?: number;
  /** A step found later than this (a stalled page) is passed as `late`:
   *  the app advances without sounding it, instead of a burst of old notes. */
  lateToleranceMs?: number;
}

export type StepCallback = (step: number, timeMs: number, late: boolean) => void;

export class StepScheduler {
  private running = false;
  /** Next step to hand out (0 = the first step after start). */
  private nextStep = 0;
  /** Grid: step `anchorStep` is at `anchorMs`, one step lasts `stepMs`. */
  private anchorStep = 0;
  private anchorMs = 0;
  private stepMs = 125; // a 16th at 120 BPM
  /** Step length in beats (quarter notes): 0.25 = a 16th. */
  private beatsPerStep = 0.25;
  private readonly lookaheadMs: number;
  private readonly lateToleranceMs: number;

  constructor(private onStep: StepCallback, opts: StepSchedulerOptions = {}) {
    this.lookaheadMs = opts.lookaheadMs ?? 100;
    this.lateToleranceMs = opts.lateToleranceMs ?? 60;
  }

  get isRunning(): boolean { return this.running; }
  get bpm(): number { return (60000 * this.beatsPerStep) / this.stepMs; }
  get stepBeats(): number { return this.beatsPerStep; }
  get upcomingStep(): number { return this.nextStep; }

  /** Start with step 0 at `startMs`; a step lasts `beatsPerStep` beats (0.25 = a 16th). */
  start(startMs: number, bpm: number, beatsPerStep = 0.25): void {
    this.running = true;
    this.nextStep = 0;
    this.anchorStep = 0;
    this.anchorMs = startMs;
    this.beatsPerStep = beatsPerStep > 0 ? beatsPerStep : 0.25;
    this.stepMs = stepMsOf(bpm, this.beatsPerStep);
    this.stepBase = { step: 0, sixteenth: 0 };
  }

  stop(): void { this.running = false; }

  timeOf(step: number): number {
    return this.anchorMs + (step - this.anchorStep) * this.stepMs;
  }

  /** New tempo from the next step on (INT): the grid bends at that step, no jump. */
  setTempo(bpm: number): void {
    const ms = stepMsOf(bpm, this.beatsPerStep);
    if (!(ms > 0) || ms === this.stepMs) return;
    this.bendAtNextStep();
    this.stepMs = ms;
  }

  /** New step length from the next step on (e.g. the Sequencer's Time 1/16 → 1/8). */
  setStepBeats(beatsPerStep: number): void {
    if (!(beatsPerStep > 0) || beatsPerStep === this.beatsPerStep) return;
    const bpm = this.bpm;
    this.bendAtNextStep();
    // From here on, sixteenths map to steps of the new length.
    this.stepBase = {
      step: this.nextStep,
      sixteenth: this.stepBase.sixteenth + (this.nextStep - this.stepBase.step) * this.beatsPerStep * 4,
    };
    this.beatsPerStep = beatsPerStep;
    this.stepMs = stepMsOf(bpm, beatsPerStep);
  }

  private bendAtNextStep(): void {
    this.anchorMs = this.timeOf(this.nextStep);
    this.anchorStep = this.nextStep;
  }

  /** Re-anchor on the master (EXT): song sixteenth `sixteenth` (counted from
   *  the app's step 0) is at `timeMs`, tempo `bpm`. Steps already handed out
   *  stay as they are; the following ones move. */
  anchorTo(sixteenth: number, timeMs: number, bpm: number): void {
    const ms = stepMsOf(bpm, this.beatsPerStep);
    if (ms > 0) this.stepMs = ms;
    // Steps are counted from the last bend (setStepBeats), in step lengths.
    this.anchorStep = this.stepOfSixteenth(sixteenth);
    this.anchorMs = timeMs;
  }

  /** Step index of a song sixteenth since start, with the step lengths used so far. */
  private stepBase = { step: 0, sixteenth: 0 };
  private stepOfSixteenth(sixteenth: number): number {
    return this.stepBase.step + (sixteenth - this.stepBase.sixteenth) / (this.beatsPerStep * 4);
  }

  /** Hand out every step due before now + lookahead. */
  tick(now: number): void {
    if (!this.running) return;
    const until = now + this.lookaheadMs;
    // Bounded: a long stall never loops for ever.
    for (let guard = 0; guard < 256 && this.running; guard++) {
      const t = this.timeOf(this.nextStep);
      if (t >= until) break;
      const late = t < now - this.lateToleranceMs;
      const step = this.nextStep++;
      this.onStep(step, t, late);
    }
  }
}

function stepMsOf(bpm: number, beatsPerStep = 0.25): number {
  return bpm > 0 ? (60000 / bpm) * beatsPerStep : 0;
}

// ── Chase ───────────────────────────────────────────────────────────────────

/**
 * A note handed out late (see StepScheduler's `late`): skipped when it's short,
 * but a long one (a chord lasting a bar) whose end is still ahead sounds now
 * for what is left of it, like a DAW's "chase". On time: as is. Null: skip.
 */
export function chaseNote(onMs: number, durMs: number, now: number, late: boolean, minLeftMs = 80): { onMs: number; durMs: number } | null {
  if (!late) return { onMs, durMs };
  const left = onMs + durMs - now;
  return left > minLeftMs ? { onMs: now, durMs: left } : null;
}

// ── Worker ticker ───────────────────────────────────────────────────────────

/**
 * A timer that runs in a dedicated Worker: unlike the page's own timers it is
 * not throttled when the window is in the background. Inline (Blob URL), so
 * it needs no bundler setup. Falls back to setInterval where there are no
 * Workers (tests, old browsers).
 */
export function createWorkerTicker(onTick: () => void, intervalMs = 10): () => void {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    const id = setInterval(onTick, intervalMs);
    return () => clearInterval(id);
  }
  const src = `let id=null;onmessage=e=>{if(e.data==='stop'){clearInterval(id);close();return}id=setInterval(()=>postMessage(0),${intervalMs})}`;
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  const worker = new Worker(url);
  worker.onmessage = () => onTick();
  worker.postMessage('start');
  return () => {
    try { worker.postMessage('stop'); } catch {}
    worker.terminate();
    URL.revokeObjectURL(url);
  };
}
