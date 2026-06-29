/**
 * midi-transport.ts — MIDI Clock generation, transport start/stop,
 * and incoming BPM detection.
 */

import type { RoutingConfig } from '@/types/midi';

export interface TransportContext {
  getMidiAccess: () => any | null;
  getRoutingConfig: () => RoutingConfig | null;
}

export class MidiTransport {
  private clockInterval: any = null;
  private isPlaying = false;
  private currentBpm = 120;
  private _nextClockScheduleTime = 0;
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

  startClock(): void {
    this.stopClock();
    if (!this.currentBpm || this.currentBpm < 1) return;
    this.isPlaying = true;
    this._nextClockScheduleTime = performance.now();

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
            if (config?.outEnabled && config?.clock) {
              try { outPort.send([0xF8], t); } catch {}
            }
          });
        }
        this._nextClockScheduleTime += intervalMs;
      }

      this.clockInterval = window.setTimeout(scheduler, 50);
    };

    scheduler();
  }

  stopClock(): void {
    if (this.clockInterval !== null) {
      window.clearTimeout(this.clockInterval);
      this.clockInterval = null;
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
    if (!access) return;
    access.outputs.forEach((outPort: any) => {
      const config = this.ctx.getRoutingConfig()?.registrations[outPort.name];
      if (!config?.outEnabled || !config?.transport) return;
      outPort.send([status]);
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