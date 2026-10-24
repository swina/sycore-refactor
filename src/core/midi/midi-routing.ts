/**
 * midi-routing.ts — MIDI Routing Matrix, broadcast mode,
 * and output-device message routing.
 */

import { userKey } from '@/lib/userKey';
import type { RoutingConfig, MidiSource, InputRouteFilter } from '@/types/midi';
import type { SmartLatch } from './midi-smart-latch';

const MIDI_ROUTING_KEY = 'S1_MIDI_ROUTING';
const MIDI_BROADCAST_KEY = 'S1_MIDI_BROADCAST';

export interface RoutingContext {
  getMidiAccess: () => any | null;
  getRoutingConfig: () => RoutingConfig | null;
  getGlobalChannel: () => number;
  getSmartLatch: () => SmartLatch;
  getSequencerPlaying: () => boolean;
  /** Note-range filter for a device→device Thru cable, if one is set
   * (MIDI Flow's "MIDI Controller → Instrument" connections). */
  getOutputRouteFilter: (sourceKey: string, destKey: string) => InputRouteFilter | undefined;
  /** Called when a message byte array is sent (for echo suppression) */
  onSent: (bytes: string, now: number) => void;
}

/**
 * Remembers where each Thru note-on was actually sent (destination +
 * output channel) so its note-off can follow it there, regardless of what
 * changed in between — a cable filter, the sequencer-playing block, a
 * Multi-CH global channel switch, a re-wired MIDI Flow. Without this, any
 * gate that drops the note-off but not the note-on leaves a stuck note.
 * Latched notes are not tracked — SmartLatch owns their note-offs.
 */
export class ThruNoteTracker {
  // `${source}|${inChannel}|${note}` → destination → output channels
  private active = new Map<string, Map<string, Set<number>>>();

  noteOn(source: string, inChannel: number, note: number, dest: string, outChannel: number): void {
    const key = `${source}|${inChannel}|${note}`;
    let dests = this.active.get(key);
    if (!dests) { dests = new Map(); this.active.set(key, dests); }
    let chs = dests.get(dest);
    if (!chs) { chs = new Set(); dests.set(dest, chs); }
    chs.add(outChannel & 0x0f);
  }

  /** Returns (and forgets) every destination/channel the note was sent to. */
  take(source: string, inChannel: number, note: number): Map<string, Set<number>> | undefined {
    const key = `${source}|${inChannel}|${note}`;
    const dests = this.active.get(key);
    this.active.delete(key);
    return dests;
  }

  clear(): void {
    this.active.clear();
  }
}

export class MidiRouter {
  private routingMatrix = new Map<string, Set<string>>([
    ['SEQUENCER', new Set()],
    ['CHORD_PROG', new Set()],
    ['KEYBOARD', new Set()],
    ['ARP', new Set()],
    ['UI', new Set()],
    ['TRANSPORT', new Set()],
  ]);

  private broadcastMode = true;
  private ctx: RoutingContext;
  private thruNotes = new ThruNoteTracker();

  constructor(ctx: RoutingContext) {
    this.ctx = ctx;
  }

  get matrix(): Map<string, Set<string>> {
    return this.routingMatrix;
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  save(): void {
    const data: Record<string, string[]> = {};
    this.routingMatrix.forEach((targets, source) => {
      data[source] = Array.from(targets);
    });
    localStorage.setItem(userKey(MIDI_ROUTING_KEY), JSON.stringify(data));
  }

  load(): void {
    try {
      const raw = localStorage.getItem(userKey(MIDI_ROUTING_KEY));
      if (!raw) return;
      const data = JSON.parse(raw);
      Object.entries(data).forEach(([source, targets]) => {
        if (Array.isArray(targets)) {
          this.routingMatrix.set(source, new Set(targets as string[]));
        }
      });
    } catch (e) {
      console.error('Failed to load MIDI routing matrix', e);
    }
  }

  // ── Matrix manipulation ──────────────────────────────────────────────────

  setRouting(source: string, outputNames: string[]): void {
    this.routingMatrix.set(source, new Set(outputNames));
    this.save();
  }

  toggleRouting(source: string, outputName: string): void {
    const targets = this.routingMatrix.get(source) || new Set();
    if (targets.has(outputName)) {
      targets.delete(outputName);
    } else {
      targets.add(outputName);
    }
    this.routingMatrix.set(source, targets);
    this.save();
  }

  getRouting(source: string): string[] {
    return Array.from(this.routingMatrix.get(source) || []);
  }

  // ── Broadcast mode ───────────────────────────────────────────────────────

  setBroadcastMode(enabled: boolean): void {
    this.broadcastMode = enabled;
  }

  /** Forget all tracked Thru notes (after a panic / all-notes-off). */
  clearThruNotes(): void {
    this.thruNotes.clear();
  }

  getBroadcastMode(): boolean {
    return this.broadcastMode;
  }

  toggleBroadcastMode(): void {
    this.broadcastMode = !this.broadcastMode;
    localStorage.setItem(userKey(MIDI_BROADCAST_KEY), JSON.stringify(this.broadcastMode));
  }

  loadBroadcastMode(): void {
    const raw = localStorage.getItem(userKey(MIDI_BROADCAST_KEY));
    if (raw) this.broadcastMode = JSON.parse(raw) === true;
  }

  // ── Message routing (Thru) ───────────────────────────────────────────────

  /**
   * Route an incoming message to output devices based on routing matrix,
   * per-device config, broadcast mode, and smart latch.
   *
   * Used by the ingress handler for MIDI Thru.
   */
  routeMessageToOutputs(data: Uint8Array, inputId: string, now: number): void {
    const access = this.ctx.getMidiAccess();
    if (!access) return;

    const status = data[0];
    const inputDevice = access.inputs.get(inputId);
    const inputName = inputDevice?.name || '';
    const targetsFromMatrix = inputName ? this.routingMatrix.get(inputName) : null;
    const isNote = (status & 0xf0) === 0x90 || (status & 0xf0) === 0x80;
    const isCC = (status & 0xf0) === 0xb0;
    const isNoteOn = (status & 0xf0) === 0x90 && data[2] > 0;
    const isNoteOff = (status & 0xf0) === 0x80 || ((status & 0xf0) === 0x90 && data[2] === 0);
    const inChannel = status & 0x0f;

    // A note-off goes straight to every output its note-on reached, on the
    // same channel, bypassing all the gates below.
    const tracked = isNoteOff ? this.thruNotes.take(inputId, inChannel, data[1]) : undefined;
    tracked?.forEach((chs, outId) => {
      const out = access.outputs.get(outId);
      if (!out) return;
      chs.forEach(ch => {
        const bytes = new Uint8Array([(status & 0xf0) | ch, data[1], data[2] ?? 0]);
        try {
          this.ctx.onSent(bytes.join(','), now);
          out.send(bytes);
        } catch {}
      });
    });

    access.outputs.forEach((outDevice: any) => {
      if (tracked?.has(outDevice.id)) return;
      const config = this.ctx.getRoutingConfig();
      const outConfig = config?.registrations[outDevice.name];
      const inConfig = inputDevice ? config?.registrations[inputDevice.name] : null;

      if (!outConfig || !outConfig.outEnabled || outDevice.id === inputId) return;
      if (outConfig.midiThru === false) return;
      if (!inConfig || !inConfig.inEnabled) return;

      // Block notes if sequencer is playing and target is the sequencer's target
      if (this.ctx.getSequencerPlaying() && isNote) {
        const seqTargets = this.routingMatrix.get('SEQUENCER');
        if (seqTargets && seqTargets.has(outDevice.name)) return;
      }

      // Matrix routing vs broadcast fallback
      const isRoutedByMatrix = targetsFromMatrix ? targetsFromMatrix.has(outDevice.name) : false;
      const hasMappings = targetsFromMatrix && targetsFromMatrix.size > 0;
      const isRouted = hasMappings ? isRoutedByMatrix : (isRoutedByMatrix || this.broadcastMode);
      if (!isRouted) return;

      // Don't Thru-routing back to a device that's also used as an input
      // (controller), unless explicitly matrix-routed — prevents MIDI
      // feedback loops where the controller echoes the message back on
      // a different port ID than the one it came in on.
      if (!isRoutedByMatrix && outConfig.inEnabled) return;

      // Loop prevention
      const normIn = inputName.toLowerCase().replace(/^(1-|2-|midi\s+|usb\s+)/i, '').trim();
      const normOut = outDevice.name.toLowerCase().replace(/^(1-|2-|midi\s+|usb\s+)/i, '').trim();
      if (normIn && normOut && normIn === normOut && !isRoutedByMatrix) return;

      if (isNote && !outConfig.notes) return;
      if (isCC && !outConfig.cc) return;
      if (status === 0xF8 && !outConfig.clock) return;
      if ((status === 0xFA || status === 0xFC) && !outConfig.transport) return;

      // Note-range filter — MIDI Flow's per-cable "keyboard split" for
      // device→device connections (Controller → Instrument). Only gates
      // note-ONS: a note-off can only silence a note, never start one, so it
      // must always reach the output even when the note arrived there via
      // another route (e.g. broadcast) and only the off lands on this cable —
      // otherwise the receiving synth is left with a stuck note.
      const filter = isNoteOn ? this.ctx.getOutputRouteFilter(inputName, outDevice.name) : undefined;
      if (isNoteOn && filter) {
        const note = data[1];
        const lo = filter.lowNote ?? 0;
        const hi = filter.highNote ?? 127;
        if (note < lo || note > hi) return;
      }

      // Channel filter — per-cable MIDI channel gate for multi-part
      // instruments. When set, only messages on the listed channels pass
      // through this Thru connection. (Note-offs exempt for the same reason
      // as the range filter above.)
      if (isNote && !isNoteOff && filter?.channels && filter.channels.length > 0 && status < 0xF0) {
        const msgChannel = status & 0x0f;
        if (!filter.channels.includes(msgChannel)) return;
      }

      let bytes = data;
      let shouldForward = true;

      // Smart Latch — triggers for global latch (when device opts in) OR per-device latch
      const latch = this.ctx.getSmartLatch();
      const applyLatch = (latch.isActive && outConfig.smartLatch) || !!outConfig.latchEnabled;
      if (applyLatch && (isNoteOn || isNoteOff)) {
        const channel = status & 0x0f;
        const note = data[1];
        const velocity = data[2];

        if (isNoteOn) {
          shouldForward = latch.handleNoteOn(outDevice, outConfig, note, velocity, channel, inputId, now);
        } else if (isNoteOff) {
          shouldForward = latch.handleNoteOff(outDevice, note, channel);
        }
      } else if (latch.isActive && (isNoteOn || isNoteOff) && !outConfig.smartLatch && !outConfig.latchEnabled) {
        if (isNoteOn && (window as any).SY_LOG)
          (window as any).SY_LOG(`[MIDI] Latch active but skipped for ${outDevice.name} (Device Lock is OFF)`);
      }

      if (!shouldForward) return;

      // Channel remapping
      try {
        if (status < 0xF0) {
          let targetCh = -1;
          if (outConfig.isMulti) targetCh = this.ctx.getGlobalChannel();
          else if (outConfig.outChannel !== -1) targetCh = outConfig.outChannel;
          if (targetCh !== -1) {
            const newStatus = (status & 0xf0) | (targetCh & 0x0f);
            if (data.length === 2) {
              bytes = new Uint8Array([newStatus, data[1]]);
            } else if (data.length === 3) {
              bytes = new Uint8Array([newStatus, data[1], data[2]]);
            } else {
              bytes = new Uint8Array([newStatus, ...data.slice(1)]);
            }
          }
        }
        this.ctx.onSent(bytes.join(','), now);
        outDevice.send(bytes);
        if (isNoteOn && !applyLatch) {
          this.thruNotes.noteOn(inputId, inChannel, data[1], outDevice.id, bytes[0] & 0x0f);
        }
      } catch {}
    });
  }
}