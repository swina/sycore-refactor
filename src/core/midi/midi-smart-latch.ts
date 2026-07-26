/**
 * midi-smart-latch.ts — Smart Latch state machine.
 *
 * Manages which notes are latched per output device and handles
 * fade-out and cleanup when the latch is deactivated.
 */

import type { LatchedNote } from '@/types/midi';

export interface LatchContext {
  /** Current MIDIAccess (may be null before init) */
  getMidiAccess: () => any | null;
  /** Current routing config */
  getRoutingConfig: () => any | null;
  /** Current global channel */
  getGlobalChannel: () => number;
}

export class SmartLatch {
  isActive = false;
  private maxNotes = 4;
  private replace = true;
  private fadeTime = 0;
  private latchedNotesByOutput = new Map<string, LatchedNote[]>();
  private ctx: LatchContext;

  constructor(ctx: LatchContext) {
    this.ctx = ctx;
  }

  setConfig(maxNotes: number, replace: boolean, fadeTime: number = 0): void {
    this.maxNotes = maxNotes;
    this.replace = replace;
    this.fadeTime = fadeTime;
    if ((window as any).SY_LOG) (window as any).SY_LOG(`[MIDI] Smart Latch Config: Max=${maxNotes}, Replace=${replace}, Fade=${fadeTime}ms`);
  }

  /** Returns true if this note-on should be forwarded (not blocked) */
  handleNoteOn(
    outDevice: any,
    outConfig: any,
    note: number,
    velocity: number,
    channel: number,
    inputId: string,
    now: number
  ): boolean {
    const maxNotes = outConfig?.latchMaxNotes ?? this.maxNotes;
    const replace  = outConfig?.latchReplace != null ? outConfig.latchReplace : this.replace;

    let latched = this.latchedNotesByOutput.get(outDevice.id);
    if (!latched) {
      latched = [];
      this.latchedNotesByOutput.set(outDevice.id, latched);
    }

    const existingIdx = latched.findIndex(n => n.note === note && n.channel === channel);
    if (existingIdx !== -1) latched.splice(existingIdx, 1);
    latched.push({ inputId, channel, note, velocity });

    if (latched.length > maxNotes) {
      if (replace) {
        const oldest = latched.shift();
        if (oldest) {
          if ((window as any).SY_LOG) (window as any).SY_LOG(`[MIDI] Latch FIFO: Replacing note ${oldest.note} with ${note}`);
          this.sendDirectNoteOff(outDevice, oldest, outConfig);
        }
      } else {
        latched.pop();
        if ((window as any).SY_LOG) (window as any).SY_LOG(`[MIDI] Latch BLOCKED: Limit reached (${maxNotes}) and Replace is OFF`);
        return false; // block
      }
    } else {
      if ((window as any).SY_LOG) (window as any).SY_LOG(`[MIDI] Latch: Holding note ${note} on ${outDevice.name}`);
    }
    return true;
  }

  /** Returns true if this note-off should be forwarded (i.e. not blocked by latch) */
  handleNoteOff(outDevice: any, note: number, channel: number): boolean {
    const latched = this.latchedNotesByOutput.get(outDevice.id);
    if (!latched) return true;
    const isLatched = latched.some(n => n.note === note && n.channel === channel);
    return !isLatched; // block release if latched
  }

  async setActive(active: boolean): Promise<void> {
    if (this.isActive === active) return;
    this.isActive = active;
    if ((window as any).SY_LOG) (window as any).SY_LOG(`[MIDI] Smart Latch: ${active ? 'ENABLED' : 'DISABLED'}`);

    if (!active) {
      if (this.fadeTime > 0) {
        await this.startFadeOut();
      } else {
        this.clearLatchedNotes();
      }
    }
  }

  /** Get latched notes for a specific output */
  getLatchedNotes(outId: string): LatchedNote[] {
    return this.latchedNotesByOutput.get(outId) || [];
  }

  /** Remove the latched-note entry for a specific output key without sending note-offs */
  clearNotesByKey(key: string): void {
    this.latchedNotesByOutput.delete(key);
  }

  /** Send note-off for all latched notes on all outputs */
  clearLatchedNotes(outputUpToDate?: string): void {
    const now = Date.now();
    this.latchedNotesByOutput.forEach((notes, outId) => {
      if (outputUpToDate && outId !== outputUpToDate) return;
      const outDevice = this.ctx.getMidiAccess()?.outputs.get(outId);
      if (!outDevice) return;
      const outConfig = this.ctx.getRoutingConfig()?.registrations[outDevice.name];
      if (!outConfig) return;

      notes.forEach(n => this.sendDirectNoteOff(outDevice, n, outConfig));

      // Send All Notes Off + Sustain Off for each channel
      const channels = new Set<number>();
      notes.forEach(n => {
        let targetCh = -1;
        if (outConfig.isMulti) targetCh = this.ctx.getGlobalChannel();
        else if (outConfig.outChannel !== -1) targetCh = outConfig.outChannel;
        channels.add(targetCh !== -1 ? targetCh : n.channel);
      });

      channels.forEach(ch => {
        const statusCh = ch % 16;
        [[0xb0 + statusCh, 123, 0], [0xb0 + statusCh, 64, 0]].forEach(msg => {
          try { outDevice.send(msg); } catch {}
        });
      });
    });

    if (!outputUpToDate) this.latchedNotesByOutput.clear();
    else this.latchedNotesByOutput.delete(outputUpToDate);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private sendDirectNoteOff(outDevice: any, n: LatchedNote, outConfig: any): void {
    let targetCh = -1;
    if (outConfig.isMulti) targetCh = this.ctx.getGlobalChannel();
    else if (outConfig.outChannel !== -1) targetCh = outConfig.outChannel;

    const finalCh = targetCh !== -1 ? targetCh : n.channel;
    try { outDevice.send(new Uint8Array([0x80 | (finalCh & 0x0f), n.note, 0])); } catch {}
  }

  private async startFadeOut(): Promise<void> {
    const fadeMs = this.fadeTime;
    const steps = 12;
    const interval = Math.max(20, fadeMs / steps);

    const outputChannels = new Map<string, Set<number>>();
    this.latchedNotesByOutput.forEach((notes, outId) => {
      const channels = new Set<number>();
      const outDevice = this.ctx.getMidiAccess()?.outputs.get(outId);
      const outConfig = outDevice ? this.ctx.getRoutingConfig()?.registrations[outDevice.name] : null;

      notes.forEach(n => {
        let targetCh = -1;
        if (outConfig) {
          if (outConfig.isMulti) targetCh = this.ctx.getGlobalChannel();
          else if (outConfig.outChannel !== -1) targetCh = outConfig.outChannel;
        }
        channels.add(targetCh !== -1 ? targetCh : n.channel);
      });
      outputChannels.set(outId, channels);
    });

    if (outputChannels.size === 0) return;

    for (let i = steps; i >= 0; i--) {
      const expValue = Math.floor((i / steps) * 127);
      outputChannels.forEach((channels, outId) => {
        const outDevice = this.ctx.getMidiAccess()?.outputs.get(outId);
        if (outDevice) {
          channels.forEach(ch => {
            outDevice.send([0xB0 | (ch & 0x0f), 11, expValue]);
          });
        }
      });
      if (i > 0) await new Promise(r => setTimeout(r, interval));
    }

    this.clearLatchedNotes();

    outputChannels.forEach((channels, outId) => {
      const outDevice = this.ctx.getMidiAccess()?.outputs.get(outId);
      if (outDevice) {
        channels.forEach(ch => {
          outDevice.send([0xB0 | (ch & 0x0f), 11, 127]);
        });
      }
    });
  }
}