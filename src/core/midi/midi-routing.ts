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

    access.outputs.forEach((outDevice: any) => {
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

      // Loop prevention
      const normIn = inputName.toLowerCase().replace(/^(1-|2-|midi\s+|usb\s+)/i, '').trim();
      const normOut = outDevice.name.toLowerCase().replace(/^(1-|2-|midi\s+|usb\s+)/i, '').trim();
      if (normIn && normOut && normIn === normOut && !isRoutedByMatrix) return;

      if (isNote && !outConfig.notes) return;
      if (isCC && !outConfig.cc) return;
      if (status === 0xF8 && !outConfig.clock) return;
      if ((status === 0xFA || status === 0xFC) && !outConfig.transport) return;

      // Note-range filter — MIDI Flow's per-cable "keyboard split" for
      // device→device connections (Controller → Instrument).
      if (isNote) {
        const filter = this.ctx.getOutputRouteFilter(inputName, outDevice.name);
        if (filter) {
          const note = data[1];
          const lo = filter.lowNote ?? 0;
          const hi = filter.highNote ?? 127;
          if (note < lo || note > hi) return;
        }
      }

      let bytes = data;
      let shouldForward = true;

      const isNoteOn = (status & 0xf0) === 0x90 && data[2] > 0;
      const isNoteOff = (status & 0xf0) === 0x80 || ((status & 0xf0) === 0x90 && data[2] === 0);

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
      } catch {}
    });
  }
}