/**
 * external-clock.ts — follow an external MIDI clock master (e.g. Ableton Live
 * on a virtual port such as "SYC CTRL"). Pure state machine: no Web MIDI, no
 * Tone.js, no timers. The caller feeds it real-time bytes with their arrival
 * time and polls `checkTimeout()`; it emits events that the app layer turns
 * into transport actions (start the synced apps, retune and re-phase the
 * Tone.js transport, stop, clock-loss fallback).
 *
 * Messages handled:
 *   0xFA Start     — play from song position 0
 *   0xFB Continue  — play from the last Song Position Pointer
 *   0xFC Stop
 *   0xF2 SPP       — position in MIDI beats (16ths = 6 clocks)
 *   0xF8 Clock     — 24 per quarter note
 *
 * Apps start on a bar line: after Start the downbeat is the first clock;
 * after Continue from mid-bar the start is held back until the external
 * position reaches the next bar line, so every app begins on a downbeat that
 * is the same downbeat in Live.
 */

export const PPQN = 24;
export const CLOCKS_PER_SIXTEENTH = 6;
export const CLOCKS_PER_BAR = 96; // 4/4
/** Tone.js default resolution (ticks per quarter note). */
export const TONE_PPQ = 192;

export type ClockLossBehavior = 'stop' | 'continue';

export type ExternalClockEvent =
  /** Start the synced apps now. `sixteenth` is the external song position (bar line). */
  | { type: 'start'; sixteenth: number; bpm: number; t: number }
  | { type: 'stop' }
  /** Smoothed tempo update (evaluated on every beat). */
  | { type: 'tempo'; bpm: number }
  /** Beat reached while running. `t` is the beat clock's time from the
   *  least-squares fit (less jitter than its own arrival time); `sixteenth`
   *  is the song position of that beat. A system-clock step grid re-anchors on it. */
  | { type: 'beat'; sixteenth: number; t: number; bpm: number }
  /** Bar line reached while running — the moment to apply the phase lock. */
  | { type: 'bar'; bar: number; clocksSinceStart: number; bpm: number; t: number }
  /** Song position changed (SPP or Start). */
  | { type: 'position'; sixteenth: number }
  /** Clock stopped arriving while playing. */
  | { type: 'clockLost'; behavior: ClockLossBehavior; lastBpm: number };

export type ExternalClockState = 'stopped' | 'waiting-bar' | 'playing' | 'lost';

export interface ExternalClockOptions {
  lossBehavior?: ClockLossBehavior;
  /** Minimum silence before the clock is declared lost, in ms. */
  minLossTimeoutMs?: number;
  /** Check interval above which a check is skipped as a main-thread stall, in ms. */
  maxCheckGapMs?: number;
}

export class ExternalClockFollower {
  private _state: ExternalClockState = 'stopped';
  /** External song position in MIDI clocks (SPP × 6 + clocks received). */
  private songClock = 0;
  /** Clocks received since the apps were started (for the phase lock). */
  private clocksSinceStart = 0;
  /** Arrival times of the most recent clocks (up to one bar + 1). */
  private ring: number[] = [];
  private lastClockAt = -Infinity;
  private lastCheckAt = -Infinity;
  private stallGraceUntil = -Infinity;
  /** Time of the newest clock from the last tempo fit. */
  private fittedLastClockAt = -Infinity;
  private _bpm = 0;
  private listeners: ((e: ExternalClockEvent) => void)[] = [];
  lossBehavior: ClockLossBehavior;
  minLossTimeoutMs: number;
  /** A timeout check later than this after the previous one is a main-thread stall. */
  maxCheckGapMs: number;
  /** After a stalled check, no clock loss is declared for this long, in ms. */
  stallGraceMs = 300;

  constructor(opts: ExternalClockOptions = {}) {
    this.lossBehavior = opts.lossBehavior ?? 'stop';
    this.minLossTimeoutMs = opts.minLossTimeoutMs ?? 500;
    this.maxCheckGapMs = opts.maxCheckGapMs ?? 250;
  }

  get state(): ExternalClockState { return this._state; }
  get bpm(): number { return this._bpm; }
  get positionSixteenths(): number { return Math.floor(this.songClock / CLOCKS_PER_SIXTEENTH); }

  /** "bar.beat.sixteenth", 1-based, like Live's position display. */
  get positionLabel(): string {
    const s = this.positionSixteenths;
    return `${Math.floor(s / 16) + 1}.${Math.floor((s % 16) / 4) + 1}.${(s % 4) + 1}`;
  }

  on(cb: (e: ExternalClockEvent) => void): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter(l => l !== cb); };
  }

  private emit(e: ExternalClockEvent): void {
    this.listeners.forEach(l => l(e));
  }

  /** Feed one incoming MIDI message. `t` is its arrival time in ms. */
  handleMessage(data: ArrayLike<number>, t: number): void {
    const status = data[0];
    switch (status) {
      case 0xF8: this.onClock(t); break;
      case 0xFA: this.onStart(); break;
      case 0xFB: this.onContinue(); break;
      case 0xFC: this.onStop(); break;
      case 0xF2:
        if (data.length >= 3) this.onSongPosition(((data[2] & 0x7f) << 7) | (data[1] & 0x7f));
        break;
    }
  }

  /** Call periodically (e.g. every 50–100 ms). Detects clock loss while running.
   *
   *  A check that itself runs late means the main thread was blocked (e.g. an
   *  app loading its samples on Play): the clocks that arrived meanwhile are
   *  still queued, not missing, so that check is skipped. Declaring the clock
   *  lost there sent the rig to INT right after Live's Play. */
  checkTimeout(now: number): void {
    const sinceLastCheck = now - this.lastCheckAt;
    this.lastCheckAt = now;
    if (this._state !== 'playing' && this._state !== 'waiting-bar') return;
    // After a stall the timer's own queued checks run back to back, ahead of
    // the MIDI messages still queued behind them: the second one looked "on
    // time" and saw a silence that wasn't there (first Play after a reload,
    // with the apps loading their samples). Wait out a grace period first.
    if (sinceLastCheck > this.maxCheckGapMs) { this.stallGraceUntil = now + this.stallGraceMs; return; }
    if (now < this.stallGraceUntil) return;
    if (now - this.lastClockAt <= this.lossTimeoutMs()) return;
    const lastBpm = this._bpm;
    this._state = this.lossBehavior === 'continue' ? 'lost' : 'stopped';
    this.ring = [];
    this.emit({ type: 'clockLost', behavior: this.lossBehavior, lastBpm });
    if (this.lossBehavior === 'stop') this.emit({ type: 'stop' });
  }

  /** Silence that counts as a lost clock: eight clock periods, never below the minimum. */
  lossTimeoutMs(): number {
    const period = this._bpm > 0 ? 60000 / (this._bpm * PPQN) : 0;
    return Math.max(this.minLossTimeoutMs, period * 8);
  }

  reset(): void {
    this._state = 'stopped';
    this.songClock = 0;
    this.clocksSinceStart = 0;
    this.ring = [];
    this.lastClockAt = -Infinity;
  }

  // ── Handlers ────────────────────────────────────────────────────────────

  private onStart(): void {
    this.songClock = 0;
    this.emit({ type: 'position', sixteenth: 0 });
    this.beginPlayback();
  }

  private onContinue(): void {
    if (this._state === 'playing' || this._state === 'waiting-bar') return;
    this.beginPlayback();
  }

  /** Arm playback: the apps start on the clock that lands on the next bar line
   *  (right away when the position already sits on one — per the MIDI spec the
   *  downbeat is the first clock after Start/Continue, not the Start byte). */
  private beginPlayback(): void {
    this.clocksSinceStart = 0;
    this._state = 'waiting-bar';
  }

  private onStop(): void {
    const wasRunning = this._state !== 'stopped';
    this._state = 'stopped';
    this.ring = [];
    if (wasRunning) this.emit({ type: 'stop' });
  }

  private onSongPosition(sixteenths: number): void {
    // SPP while playing is a jump (rare from Live; it sends Stop first).
    this.songClock = sixteenths * CLOCKS_PER_SIXTEENTH;
    this.emit({ type: 'position', sixteenth: sixteenths });
  }

  private onClock(t: number): void {
    // A long gap means the previous tempo window is stale.
    if (this.ring.length > 0 && t - this.ring[this.ring.length - 1] > 2000) this.ring = [];
    this.ring.push(t);
    if (this.ring.length > CLOCKS_PER_BAR + 1) this.ring.shift();
    this.lastClockAt = t;

    if (this._state === 'stopped' || this._state === 'lost') {
      // Clock without transport (some masters send it all the time): tempo only.
      this.updateTempoOnBeat(this.ring.length - 1);
      return;
    }

    // The clock that completes a position: the downbeat it lands on is
    // songClock *before* incrementing (a Start's first clock is position 0).
    const landing = this.songClock;
    this.songClock++;

    if (this._state === 'waiting-bar') {
      if (landing % CLOCKS_PER_BAR === 0) {
        this._state = 'playing';
        this.clocksSinceStart = 0;
        this.emit({ type: 'start', sixteenth: landing / CLOCKS_PER_SIXTEENTH, bpm: this._bpm, t });
      } else {
        this.updateTempoOnBeat(landing);
        return;
      }
    }

    if (this.clocksSinceStart > 0 && landing % CLOCKS_PER_BAR === 0) {
      this.updateTempo();
      this.emit({ type: 'bar', bar: landing / CLOCKS_PER_BAR, clocksSinceStart: this.clocksSinceStart, bpm: this._bpm, t });
    } else {
      this.updateTempoOnBeat(landing);
    }
    if (landing % PPQN === 0 && this._bpm > 0) {
      const fitted = this.fittedLastClockAt;
      // Trust the fit only when it agrees with the arrival (no gap/reset in the window).
      const beatT = Math.abs(fitted - t) < 60000 / (this._bpm * PPQN) ? fitted : t;
      this.emit({ type: 'beat', sixteenth: landing / CLOCKS_PER_SIXTEENTH, t: beatT, bpm: this._bpm });
    }
    this.clocksSinceStart++;
  }

  private updateTempoOnBeat(clock: number): void {
    if (clock % PPQN === 0) this.updateTempo();
  }

  /** Tempo from the clocks in the window (up to one bar). A least-squares fit
   *  of arrival time against clock index uses every clock, so per-tick jitter
   *  averages out instead of riding on the two end points. */
  private updateTempo(): void {
    const n = this.ring.length;
    if (n < 7) return;
    const t0 = this.ring[0];
    const meanX = (n - 1) / 2;
    let meanY = 0;
    for (let i = 0; i < n; i++) meanY += this.ring[i] - t0;
    meanY /= n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      const dx = i - meanX;
      num += dx * (this.ring[i] - t0 - meanY);
      den += dx * dx;
    }
    const avg = num / den;
    if (!(avg > 0)) return;
    this.fittedLastClockAt = t0 + meanY + avg * (n - 1 - meanX);
    const bpm = 60000 / (avg * PPQN);
    if (bpm < 20 || bpm > 400) return;
    this._bpm = bpm;
    this.emit({ type: 'tempo', bpm });
  }
}

// ── Loopback peers ──────────────────────────────────────────────────────────

/** Port name without a trailing loopback side: "SYC CTRL B", "SYC CTRL (B)",
 *  "SYC CTRL-B" → "syc ctrl". Windows MIDI Services loopbacks come in A/B pairs. */
function loopbackBase(name: string): string {
  // The side letter must stand alone (" B", "-B", "(B)"), so "KeyLab" keeps its "b".
  return name.trim().replace(/(?:[\s\-_]+[(\[]?|[(\[])\s*[ab]\s*[)\]]?$/i, '').trim().toLowerCase();
}

/**
 * True for an output that would echo back into the clock source `sourcePort`:
 * the port itself (loopMIDI, IAC: one name both ways) or its loopback peer
 * (Windows MIDI Services: "SYC CTRL A" ↔ "SYC CTRL B"). While following that
 * source, SY.CORE must not send it clock or Start/Stop.
 */
export function isClockSourceEcho(sourcePort: string, outputName: string): boolean {
  if (outputName === sourcePort) return true;
  const base = loopbackBase(sourcePort);
  return base.length > 0 && base !== sourcePort.trim().toLowerCase() && loopbackBase(outputName) === base;
}

// ── Phase lock ──────────────────────────────────────────────────────────────

export interface PhaseLockResult {
  /** Tempo to set on the follower transport for the next bar. */
  bpm: number;
  /** Phase error in beats (positive = follower ahead of the master). */
  errorBeats: number;
  /** When set, jump the follower transport to this tick instead of nudging. */
  resyncTicks: number | null;
}

export interface PhaseLockOptions {
  tonePpq?: number;
  beatsPerBar?: number;
  /** Largest tempo nudge, as a fraction (0.03 = ±3%). */
  maxNudge?: number;
  /** Error (in beats) above which the follower jumps instead of nudging. */
  resyncBeats?: number;
  /** Integral gain: removes the residual error of a follower clock that runs
   *  steadily fast or slow (audio clock vs. MIDI timestamps). */
  integralGain?: number;
}

/**
 * Per-bar phase lock (PI controller). At a bar line of the master, compare
 * where the follower transport is (`followerTicks`, Tone.js ticks since the
 * apps started) with where it should be (`clocksSinceStart` master clocks).
 * The error is closed over the next bar by nudging the tempo (at most
 * ±`maxNudge`), so per-tick jitter never moves the follower; an error above
 * `resyncBeats` (e.g. after a main-thread stall) jumps the follower instead.
 */
export class PhaseLock {
  private integral = 0;
  private readonly ppq: number;
  private readonly beatsPerBar: number;
  private readonly maxNudge: number;
  private readonly resyncBeats: number;
  private readonly ki: number;

  constructor(opts: PhaseLockOptions = {}) {
    this.ppq = opts.tonePpq ?? TONE_PPQ;
    this.beatsPerBar = opts.beatsPerBar ?? 4;
    this.maxNudge = opts.maxNudge ?? 0.03;
    this.resyncBeats = opts.resyncBeats ?? 0.5;
    this.ki = opts.integralGain ?? 0.5;
  }

  reset(): void { this.integral = 0; }

  update(masterBpm: number, clocksSinceStart: number, followerTicks: number): PhaseLockResult {
    const expectedTicks = clocksSinceStart * (this.ppq / PPQN);
    const errorBeats = (followerTicks - expectedTicks) / this.ppq;

    if (Math.abs(errorBeats) > this.resyncBeats) {
      this.integral = 0;
      return { bpm: masterBpm, errorBeats, resyncTicks: Math.round(expectedTicks) };
    }
    this.integral += errorBeats;
    // Bound the integral to what the nudge can express (anti-windup).
    const maxI = (this.maxNudge * this.beatsPerBar) / this.ki;
    this.integral = Math.max(-maxI, Math.min(maxI, this.integral));
    // Follower ahead by e beats → it must play (beatsPerBar - e) beats in the
    // time the master plays beatsPerBar.
    const correction = errorBeats + this.ki * this.integral;
    const factor = Math.min(1 + this.maxNudge, Math.max(1 - this.maxNudge,
      (this.beatsPerBar - correction) / this.beatsPerBar));
    return { bpm: masterBpm * factor, errorBeats, resyncTicks: null };
  }
}

/** Stateless single-step phase lock (no integral term). */
export function computePhaseLock(
  masterBpm: number, clocksSinceStart: number, followerTicks: number, opts: PhaseLockOptions = {},
): PhaseLockResult {
  return new PhaseLock({ ...opts, integralGain: opts.integralGain ?? 0 }).update(masterBpm, clocksSinceStart, followerTicks);
}
