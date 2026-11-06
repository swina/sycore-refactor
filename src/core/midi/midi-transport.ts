/**
 * midi-transport.ts — MIDI Clock generation, transport start/stop,
 * and incoming BPM detection.
 */

import type { RoutingConfig } from '@/types/midi';

export interface TransportContext {
  getMidiAccess: () => any | null;
  getRoutingConfig: () => RoutingConfig | null;
  // Deduped, already-clock/transport-flag-filtered virtual output names to
  // dispatch to. Deduped because several virtual instruments can share the
  // same bound physical/loopback port (e.g. two logical instruments split
  // by MIDI channel over one LoopBe cable) — Clock/Start/Stop/Continue carry
  // no channel, so sending once per virtual *name* would put duplicate
  // copies on the same physical wire and corrupt tempo detection downstream.
  getVirtualClockTargets: () => string[];
  getVirtualTransportTargets: () => string[];
  sendToVirtualOutput: (name: string, data: number[]) => void;
  /** Outputs that must not get our clock / Start / Stop: while following an
   *  external clock, the source port's loopback peer would echo them back into
   *  the source and double the clock it measures. */
  isSyncOutputBlocked?: (outputName: string) => boolean;
}

export class MidiTransport {
  private clockInterval: any = null;
  // Separate recurring pump for virtual outputs — see startClock() for why
  // this can't just reuse the hardware scheduler's per-pass batch.
  private virtualClockInterval: any = null;
  private isPlaying = false;
  private currentBpm = 120;
  private _nextClockScheduleTime = 0;
  private _nextVirtualClockTime = 0;
  // @ts-ignore — pulse count for potential future sync features
  private clockPulseCount = 0;

  // Incoming clock BPM detection
  private _incomingClockRing: number[] = [];
  private _smoothedIncomingBpm = 0;
  private _clockBpmListeners: ((bpm: number) => void)[] = [];

  private ctx: TransportContext;

  constructor(ctx: TransportContext) {
    this.ctx = ctx;
  }

  get isPlayingClock(): boolean {
    return this.isPlaying;
  }

  get bpm(): number {
    return this.currentBpm;
  }

  setBpm(bpm: number): void {
    this.currentBpm = bpm;
    if (this.clockInterval) this.startClock();
  }

  /** Following an external clock: no clock of our own; the source's clock is
   *  forwarded instead (forwardRealTime). */
  private following = false;

  get isFollowingExternal(): boolean { return this.following; }

  setFollowingExternal(on: boolean): void {
    this.following = on;
    if (on) this.stopClock();
  }

  /**
   * Forward a real-time message of the external clock source (Clock, Start,
   * Continue, Stop, Song Position) to the outputs that take clock / transport,
   * so devices synced to SY.CORE follow the master's exact tempo instead of a
   * clock generated here at the rounded BPM.
   */
  forwardRealTime(data: ArrayLike<number>): void {
    const status = data[0];
    const isClock = status === 0xF8;
    const field: 'clock' | 'transport' = isClock ? 'clock' : 'transport';
    const msg = Array.from(data as ArrayLike<number>);
    const access = this.ctx.getMidiAccess();
    if (access) {
      access.outputs.forEach((outPort: any) => {
        const config = this.ctx.getRoutingConfig()?.registrations[outPort.name];
        if (!config?.outEnabled || !config?.[field]) return;
        if (this.ctx.isSyncOutputBlocked?.(outPort.name)) return;
        try { outPort.send(msg); } catch {}
      });
    }
    const targets = isClock ? this.ctx.getVirtualClockTargets() : this.ctx.getVirtualTransportTargets();
    targets.forEach(name => this.ctx.sendToVirtualOutput(name, msg));
  }

  startClock(): void {
    this.stopClock();
    if (this.following) return;
    if (!this.currentBpm || this.currentBpm < 1) return;
    this.isPlaying = true;
    this._nextClockScheduleTime = performance.now();
    this._nextVirtualClockTime = performance.now();

    const scheduler = () => {
      if (!this.isPlaying) return;
      const intervalMs = 60000 / (this.currentBpm * 24);
      const until = performance.now() + 100;

      while (this._nextClockScheduleTime < until) {
        const t = this._nextClockScheduleTime;
        const access = this.ctx.getMidiAccess();
        if (access) {
          access.outputs.forEach((outPort: any) => {
            const config = this.ctx.getRoutingConfig()?.registrations[outPort.name];
            if (config?.outEnabled && config?.clock && !this.ctx.isSyncOutputBlocked?.(outPort.name)) {
              try { outPort.send([0xF8], t); } catch {}
            }
          });
        }
        this._nextClockScheduleTime += intervalMs;
      }

      this.clockInterval = window.setTimeout(scheduler, 50);
    };

    scheduler();

    // Virtual instruments (arpeggiated/tempo-synced patches, tempo-locked
    // FX) need the same clock ticks a real output gets, but virtual sends
    // are plain synchronous JS callbacks with no Web MIDI scheduled-send —
    // there's no browser-native mechanism to hand it a future timestamp and
    // have it fire precisely on its own. A single recurring pump here (one
    // timer, checked frequently) rather than pre-scheduling one setTimeout
    // per tick keeps this robust under load: a swarm of individually
    // scheduled per-tick timers was observed to get delayed/dropped when
    // the main thread was busy (heavy MIDI/audio traffic), producing a
    // wildly wrong apparent tempo downstream instead of just a little jitter.
    const pumpVirtual = () => {
      if (!this.isPlaying) return;
      const intervalMs = 60000 / (this.currentBpm * 24);
      const now = performance.now();
      const targets = this.ctx.getVirtualClockTargets();
      while (this._nextVirtualClockTime <= now) {
        targets.forEach(name => this.ctx.sendToVirtualOutput(name, [0xF8]));
        this._nextVirtualClockTime += intervalMs;
      }
      this.virtualClockInterval = window.setTimeout(pumpVirtual, 10);
    };

    pumpVirtual();
  }

  stopClock(): void {
    if (this.clockInterval !== null) {
      window.clearTimeout(this.clockInterval);
      this.clockInterval = null;
    }
    if (this.virtualClockInterval !== null) {
      window.clearTimeout(this.virtualClockInterval);
      this.virtualClockInterval = null;
    }
    this.isPlaying = false;
    const access = this.ctx.getMidiAccess();
    if (access) {
      access.outputs.forEach((outPort: any) => {
        try { outPort.clear?.(); } catch {}
      });
    }
  }

  /** Direct transport send — bypasses routing matrix/broadcastMode */
  private sendTransportDirect(status: 0xFA | 0xFB | 0xFC): void {
    const access = this.ctx.getMidiAccess();
    if (access) {
      access.outputs.forEach((outPort: any) => {
        const config = this.ctx.getRoutingConfig()?.registrations[outPort.name];
        if (!config?.outEnabled || !config?.transport) return;
        if (this.ctx.isSyncOutputBlocked?.(outPort.name)) return;
        outPort.send([status]);
      });
    }
    this.ctx.getVirtualTransportTargets().forEach(name => {
      this.ctx.sendToVirtualOutput(name, [status]);
    });
  }

  sendStart(): void {
    this.sendTransportDirect(0xFC); // STOP first — resets device position
    setTimeout(() => {
      this.sendTransportDirect(0xFA); // START
      this.startClock();
    }, 10);
  }

  sendStop(): void {
    this.stopClock();
    this.sendTransportDirect(0xFC); // STOP
  }

  sendContinue(): void {
    this.sendTransportDirect(0xFB); // CONTINUE
  }

  // ── Incoming clock BPM detection ─────────────────────────────────────────

  /** Handle an incoming real-time message for BPM detection. Returns the smoothed BPM if updated, or null. */
  handleIncomingRealTime(status: number, syncBlocked: boolean, transportListeners: ((type: 'start' | 'stop' | 'clock') => void)[]): number | null {
    if (status === 0xFA) {
      if (!syncBlocked) transportListeners.forEach(l => l('start'));
    } else if (status === 0xFC) {
      if (!syncBlocked) transportListeners.forEach(l => l('stop'));
      this._incomingClockRing = [];
    } else if (status === 0xF8) {
      if (!syncBlocked) transportListeners.forEach(l => l('clock'));
      const ts = performance.now();
      if (this._incomingClockRing.length > 0 &&
          ts - this._incomingClockRing[this._incomingClockRing.length - 1] > 2000) {
        this._incomingClockRing = [];
      }
      this._incomingClockRing.push(ts);
      if (this._incomingClockRing.length > 24) this._incomingClockRing.shift();
      if (this._incomingClockRing.length >= 4) {
        const n = this._incomingClockRing.length;
        const elapsed = this._incomingClockRing[n - 1] - this._incomingClockRing[0];
        const avgIntervalMs = elapsed / (n - 1);
        const rawBpm = 60000 / (avgIntervalMs * 24);
        if (rawBpm > 20 && rawBpm < 350) {
          const alpha = 0.1;
          this._smoothedIncomingBpm = this._smoothedIncomingBpm === 0
            ? rawBpm
            : alpha * rawBpm + (1 - alpha) * this._smoothedIncomingBpm;
          this._clockBpmListeners.forEach(l => l(this._smoothedIncomingBpm));
          return this._smoothedIncomingBpm;
        }
      }
    }
    return null;
  }

  addClockBpmListener(cb: (bpm: number) => void): () => void {
    this._clockBpmListeners.push(cb);
    return () => { this._clockBpmListeners = this._clockBpmListeners.filter(l => l !== cb); };
  }

  getIncomingBpm(): number {
    return this._smoothedIncomingBpm;
  }
}