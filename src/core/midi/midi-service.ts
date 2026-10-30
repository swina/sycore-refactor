/**
 * midi-service.ts — MidiService Facade
 *
 * Thin facade that delegates to focused sub-modules:
 *   - midi-broadcast:  pure encoding/decoding helpers
 *   - midi-monitor:    ring buffer for the MIDI monitor panel
 *   - midi-transport:  clock generation + incoming BPM detection
 *   - midi-smart-latch: note latching state machine
 *   - midi-routing:    routing matrix, broadcast mode, output routing
 *
 * All public methods/properties from the original MidiService.ts are
 * preserved so consumers need only update their import path.
 */

import { userKey } from '@/lib/userKey';
import type {
  DeviceRegistration,
  RoutingConfig,
  SplitConfig,
  MidiMessageType,
  MidiMonitorEntry,
  InputRouteFilter,
} from '@/types/midi'
import { cableOutChannels } from '@/types/midi';
import { MidiSource } from '@/types/midi';
import { MidiMonitor } from './midi-monitor';
import { MidiTransport } from './midi-transport';
import { SmartLatch } from './midi-smart-latch';
import { MidiRouter, ThruNoteTracker } from './midi-routing';
import { decodeRaw, decodeOut, applyVelocityCurve, noteStatusByte } from './midi-broadcast';

export type { DeviceRegistration, RoutingConfig, SplitConfig, MidiMessageType, MidiMonitorEntry };
export { MidiSource };

function _parseSysExString(input: string): number[] | null {
  const s = input.trim();
  let tokens: string[];
  if (/0x/i.test(s)) {
    tokens = s.split(/[\s,]+/).filter(Boolean);
    const b = tokens.map(t => parseInt(t, 16));
    return b.some(isNaN) ? null : b;
  }
  if (s.includes(',') && !/[a-fA-F]/.test(s)) {
    const b = s.split(',').map(t => Number(t.trim()));
    return b.some(isNaN) ? null : b;
  }
  tokens = s.split(/\s+/).filter(Boolean);
  const b = tokens.map(t => parseInt(t, 16));
  return b.some(isNaN) ? null : b;
}

export class MidiService {
  // ── Core references ──────────────────────────────────────────────────────
  private midiAccess: MIDIAccess | null = null;
  private routingConfig: RoutingConfig | null = null;
  private globalChannel = 0;
  private splitConfig: SplitConfig | null = null;
  // Note-range filters for hardware/virtual device→device Thru connections
  // (MIDI Flow's "MIDI Controller → Instrument" cables) — keyed by
  // `${sourceDeviceName}→${destDeviceName}`. Kept separate from useMidiStore's
  // inputRouting, which apps use for their own fail-open input gating, so a
  // device→device filter can never accidentally affect app routing.
  private outputRouteFilters: Record<string, InputRouteFilter> = {};

  // Sub-module instances (created in constructor)
  readonly monitor: MidiMonitor;
  readonly transport: MidiTransport;
  readonly latch: SmartLatch;
  readonly router: MidiRouter;

  // ── Listener arrays (kept in the facade because they're the public API) ──
  private onCCListeners: ((cc: number, val: number, chan: number, inputId?: string) => void)[] = [];
  private onNoteListeners: ((type: 'on' | 'off', note: number, velocity: number, chan: number, inputId?: string) => void)[] = [];
  private onPitchBendListeners: ((val: number, chan: number, inputId?: string) => void)[] = [];
  private onStateChangeListeners: ((event: Event) => void)[] = [];
  private globalNoteOnListeners: ((note: number, velocity: number) => void)[] = [];
  private onTransportListeners: ((type: 'start' | 'stop' | 'clock') => void)[] = [];
  private onRawListeners: ((event: MIDIMessageEvent) => void)[] = [];

  // Self-loop detection: an input that keeps receiving what this app just sent
  // (Windows MIDI Services loopback pairs "X (A)"/"X (B)", loopMIDI…) is the
  // far end of one of our own outputs. Its name differs from the output's, so
  // isBlockedLoopbackInput() can't catch it; left open it feeds our own notes
  // and clock back into the Arpeggiator/sequencers/Thru — a feedback storm.
  // A flagged input keeps working for anything played on it: only echoes of our
  // sends (note-offs included) and real-time clock/transport are dropped, since
  // a keyboard with soft-thru can echo too. Inputs registered as an input in
  // MIDI Flow are never flagged.
  private static readonly ECHO_WINDOW_MS = 20;
  private static readonly LOOPBACK_MIN_ECHOES = 8;
  private _echoStats = new Map<string, { echo: number; other: number }>();
  private _loopbackInputs = new Map<string, string>(); // input id → name (echoes our output)
  private ingressFilter: ((event: MIDIMessageEvent) => boolean) | null = null;

  // ── Echo / ingress suppression ───────────────────────────────────────────
  private lastSentMessages = new Map<string, { data: string; time: number }>();
  private globalSentHashes = new Map<string, number>();
  // sendRawToDeviceByName() problems already reported, keyed by device name —
  // it runs per message (every pitch-bend/CC step to a virtual instrument),
  // so warning each time floods the console and stalls the main thread while
  // the device stays missing. Cleared once a send to that device succeeds.
  private _warnedSendIssues = new Set<string>();
  // Device→virtual-instrument Thru notes, so note-offs follow their note-on
  // (see ThruNoteTracker).
  private virtualThruNotes = new ThruNoteTracker();
  private ingressCount = 0;
  private lastIngressReset = Date.now();
  private isThruThrottled = false;

  // ── SysEx ────────────────────────────────────────────────────────────────
  private sysexEnabled = false;

  // ── Virtual output registry ──────────────────────────────────────────────
  private virtualOutputs = new Map<string, (data: number[]) => void>();
  // Real hardware port each virtual instrument is bound to (its Output port
  // setting) — tracked separately since the registered sendFn closure is
  // opaque. Used to detect the physical-loop case: an instrument's own bound
  // output port also being the input device that's being Thru-routed to it
  // (common when a keyboard's own Local Control/MIDI Thru echoes its output
  // back into its input) — see routeMessageToVirtualOutputs.
  private virtualOutputPorts = new Map<string, string>();

  // Ports currently mid-reset by the statechange handler below (its own
  // close()+open() cycle, not reconnectInput()), keyed by normalized name —
  // see setupStateChangeHandler's comment for why this guard exists.
  private _resettingInputs = new Set<string>();
  // Last time each port finished a statechange-triggered reset, keyed by
  // normalized name — a short cooldown on top of the in-flight guard, for
  // browsers whose event timing doesn't line up neatly with the in-flight
  // window alone.
  private _lastInputResetAt = new Map<string, number>();

  // ── Periodic device polling ──────────────────────────────────────────────
  // Some Web MIDI implementations (especially on Windows) do not reliably
  // fire onstatechange when a device is connected or disconnected after the
  // initial requestMIDIAccess(). The poll catches those missed transitions by
  // comparing the current port list against a cached snapshot every 2 s.
  private _devicePollTimer: ReturnType<typeof setInterval> | null = null;
  private _lastKnownOutputNames = new Set<string>();
  private _lastKnownInputNames = new Set<string>();

  private _startDevicePoll(): void {
    this._stopDevicePoll();
    // Snapshot the initial list so the first poll is a no-op.
    this._syncLastKnown();
    this._devicePollTimer = setInterval(() => this._checkDeviceChanges(), 2000);
  }

  private _stopDevicePoll(): void {
    if (this._devicePollTimer !== null) {
      clearInterval(this._devicePollTimer);
      this._devicePollTimer = null;
    }
  }

  private _syncLastKnown(): void {
    this._lastKnownOutputNames.clear();
    this._lastKnownInputNames.clear();
    if (this.midiAccess) {
      for (const p of this.midiAccess.outputs.values()) {
        this._lastKnownOutputNames.add(this.normPort(p.name ?? ''));
      }
      for (const p of this.midiAccess.inputs.values()) {
        this._lastKnownInputNames.add(this.normPort(p.name ?? ''));
      }
    }
  }

  private _checkDeviceChanges(): void {
    if (!this.midiAccess) return;
    const currentOutputs = new Set<string>();
    const currentInputs = new Set<string>();
    for (const p of this.midiAccess.outputs.values()) {
      currentOutputs.add(this.normPort(p.name ?? ''));
    }
    for (const p of this.midiAccess.inputs.values()) {
      currentInputs.add(this.normPort(p.name ?? ''));
    }

    const outputsChanged =
      currentOutputs.size !== this._lastKnownOutputNames.size ||
      ![...currentOutputs].every(n => this._lastKnownOutputNames.has(n));
    const inputsChanged =
      currentInputs.size !== this._lastKnownInputNames.size ||
      ![...currentInputs].every(n => this._lastKnownInputNames.has(n));

    if (!outputsChanged && !inputsChanged) return;

    console.log(`[MIDI] Device poll detected change — outputs ${outputsChanged ? 'changed' : 'same'}, inputs ${inputsChanged ? 'changed' : 'same'}`);

    // For any newly appeared input, run the close+open+reattach cycle to
    // clear the stale-port state that otherwise requires a physical replug.
    this._resetNewInputs(currentInputs);

    // Update cached snapshot.
    this._syncLastKnown();

    // Notify store (triggers refreshDevices).
    const fakeEvent = new Event('statechange');
    this.onStateChangeListeners.forEach(l => l(fakeEvent));
  }

  private _resetNewInputs(currentInputs: Set<string>): void {
    if (!this.midiAccess) return;
    for (const input of this.midiAccess.inputs.values()) {
      const key = this.normPort(input.name ?? '');
      if (!currentInputs.has(key)) continue;
      if (this._lastKnownInputNames.has(key)) continue;
      if (this.isBlockedLoopbackInput(input.name ?? '')) continue;
      const lastReset = this._lastInputResetAt.get(key) ?? 0;
      if (this._resettingInputs.has(key) || Date.now() - lastReset < 500) continue;
      this._resettingInputs.add(key);
      console.log(`[MIDI] Poll-resetting new input: ${input.name}`);
      input.removeEventListener('midimessage', this.handleIngressBound);
      input.addEventListener('midimessage', this.handleIngressBound);
      this._resettingInputs.delete(key);
      this._lastInputResetAt.set(key, Date.now());
    }
  }

  // Normalise a MIDI port name for comparison — strips common OS prefixes
  // that differ between platforms/drivers for the same physical port.
  private normPort(s: string): string {
    return s.toLowerCase().replace(/^(1-|2-|midi\s+|usb\s+)/i, '').trim();
  }

  // An input that must stay closed because it's the other end of a loopback
  // cable (LoopBe1, loopMIDI…) a virtual instrument sends into — opening
  // both sides trips the driver's "MIDI Feedback" mute. A matching name
  // alone isn't proof: Windows MIDI Services gives a hardware device's
  // input and output ports the same name, so a virtual instrument bound to
  // e.g. the Worlde's output would otherwise block the Worlde's input from
  // ever being opened at startup (only a replug, via the statechange
  // handler, got it working). A port the user registered as an input in
  // MIDI Flow is a real input, never treated as a loopback.
  private isBlockedLoopbackInput(name: string): boolean {
    const key = this.normPort(name ?? '');
    if (!key) return false;
    const boundToVirtual = Array.from(this.virtualOutputPorts.values())
      .some(p => !!p && this.normPort(p) === key);
    if (!boundToVirtual) return false;
    const regs = this.routingConfig?.registrations ?? {};
    const wiredAsInput = Object.values(regs)
      .some(r => !!r?.inEnabled && this.normPort(r.name ?? '') === key);
    return !wiredAsInput;
  }

  registerVirtualOutput(name: string, sendFn: (data: number[]) => void, portName?: string): void {
    this.virtualOutputs.set(name, sendFn);
    if (portName) {
      this.virtualOutputPorts.set(name, portName);
      // Immediately close the input side of this loopback port if it was
      // already opened — prevents LoopBe1-style "MIDI Feedback" detection
      // that triggers when both sides of the same virtual cable are open.
      this._detachInputByPortName(portName);
    } else {
      this.virtualOutputPorts.delete(name);
    }
  }

  private _detachInputByPortName(portName: string): void {
    if (!this.midiAccess) return;
    const target = this.normPort(portName);
    this.midiAccess.inputs.forEach(input => {
      if (this.normPort(input.name) === target && this.isBlockedLoopbackInput(input.name)) {
        input.removeEventListener('midimessage', this.handleIngressBound);
        input.close();
      }
    });
  }

  // Reopens a specific MIDI input by name, re-attaching the
  // ingress listener. Fixes the stale-connection issue that appears after a
  // page reload where the port shows as "connected" but events stop arriving.
  async reconnectInput(portName: string): Promise<void> {
    if (!this.midiAccess) return;
    const target = this.normPort(portName);
    for (const input of Array.from(this.midiAccess.inputs.values())) {
      if (this.normPort(input.name) !== target) continue;
      if (this.isBlockedLoopbackInput(input.name)) return; // never reopen a loopback output side
      input.removeEventListener('midimessage', this.handleIngressBound);
      // open() only — same as reScanInputs(): a close()+open() cycle
      // corrupts some USB MIDI drivers (Worlde, etc.) until a replug.
      try { await input.open(); } catch (e) {
        console.warn(`[MIDI] Failed to open input "${input.name}":`, e);
      }
      input.addEventListener('midimessage', this.handleIngressBound);
      console.log(`[MIDI] Reconnected input: ${input.name}`);
      break;
    }
  }

  unregisterVirtualOutput(name: string): void {
    this.virtualOutputs.delete(name);
    this.virtualOutputPorts.delete(name);
  }

  getVirtualOutputNames(): string[] {
    return Array.from(this.virtualOutputs.keys());
  }

  /**
   * Channel-less dispatch targets among registered virtual instruments
   * (Clock/Start/Stop/Continue carry no channel), deduped by bound physical
   * output port. Several virtual instruments can legitimately share one
   * port — e.g. two logical instruments split across MIDI channels over a
   * single LoopBe cable — and sending once per virtual *name* in that case
   * puts duplicate copies of the same message on the same physical wire,
   * which corrupts a receiving device's tempo detection. Sends once per
   * distinct port (or once per instrument that has no bound port at all)
   * as long as at least one instrument sharing it has `configField` enabled.
   */
  private dedupedVirtualTargets(configField: 'clock' | 'transport'): string[] {
    const groups = new Map<string, string[]>();
    this.virtualOutputs.forEach((_fn, name) => {
      const boundPort = this.virtualOutputPorts.get(name);
      const key = boundPort ? this.normPort(boundPort) : `__unbound__:${name}`;
      const group = groups.get(key);
      if (group) group.push(name);
      else groups.set(key, [name]);
    });
    const targets: string[] = [];
    groups.forEach(names => {
      const anyEnabled = names.some(n => {
        const c = this.routingConfig?.registrations[n];
        return c?.outEnabled && c?.[configField];
      });
      if (anyEnabled) targets.push(names[0]);
    });
    return targets;
  }

  getVirtualClockTargets(): string[] {
    return this.dedupedVirtualTargets('clock');
  }

  getVirtualTransportTargets(): string[] {
    return this.dedupedVirtualTargets('transport');
  }

  /** Log an outbound raw message to the MIDI monitor (skip Clock to avoid flooding). */
  logOutbound(deviceName: string, data: number[]): void {
    if (data[0] === 0xF8) return;
    const { type: mType, channel: mCh, decoded: mDecoded } = decodeRaw(data);
    this.monitor.append({
      id: ++this._monitorSeq,
      timestamp: Date.now(),
      direction: 'out',
      device: deviceName,
      channel: mCh,
      type: mType,
      data: Array.from(data),
      decoded: `[${deviceName}] ${mDecoded}`,
    });
  }

  /** Send raw bytes to a virtual output by name */
  private sendToVirtualOutput(name: string, data: number[]): void {
    const fn = this.virtualOutputs.get(name);
    if (!fn) return;

    // Log to monitor — skip Clock (0xF8) same as broadcast() does for real
    // outputs, since at 24 ticks/quarter-note this would otherwise blow
    // through the 500-entry ring buffer in a couple of seconds and evict
    // everything else.
    this.logOutbound(name, data);

    fn(data);
    this.globalSentHashes.set(data.join(','), Date.now());
  }

  /**
   * Thru-routes a raw incoming hardware message to registered virtual
   * outputs — the counterpart to MidiRouter.routeMessageToOutputs, which
   * only ever loops MIDIAccess's real outputs and can't reach a virtual
   * instrument at all. Lives here (not in MidiRouter) since virtualOutputs
   * is private to this class. Mirrors broadcast()'s outChannels fanout so a
   * multi-timbral virtual instrument gets duplicated onto every selected
   * channel from hardware input the same way it already does from an app's
   * generated notes.
   */
  private routeMessageToVirtualOutputs(data: Uint8Array, inputName: string, now: number): void {
    if (this.virtualOutputs.size === 0) return;
    const status = data[0];
    const isNote = (status & 0xf0) === 0x90 || (status & 0xf0) === 0x80;
    const isCC = (status & 0xf0) === 0xb0;
    const targetsFromMatrix = inputName ? this.router.matrix.get(inputName) : null;
    const isNoteOn = (status & 0xf0) === 0x90 && data[2] > 0;
    const isNoteOff = (status & 0xf0) === 0x80 || ((status & 0xf0) === 0x90 && data[2] === 0);
    const inChannel = status & 0x0f;

    // A note-off goes straight to every virtual output its note-on reached,
    // on the same channel, bypassing all the gates below.
    const tracked = isNoteOff ? this.virtualThruNotes.take(inputName, inChannel, data[1]) : undefined;
    tracked?.forEach((chs, virtName) => {
      if (!this.virtualOutputs.has(virtName)) return;
      chs.forEach(ch => this.sendToVirtualOutput(virtName, [(status & 0xf0) | ch, data[1], data[2] ?? 0]));
    });

    this.virtualOutputs.forEach((_, virtName) => {
      if (tracked?.has(virtName)) return;
      const outConfig = this.routingConfig?.registrations[virtName];
      if (!outConfig || !outConfig.outEnabled) return;
      if (outConfig.midiThru === false) return;

      const isRoutedByMatrix = targetsFromMatrix ? targetsFromMatrix.has(virtName) : false;
      const hasMappings = !!targetsFromMatrix && targetsFromMatrix.size > 0;
      const isRouted = hasMappings ? isRoutedByMatrix : (isRoutedByMatrix || this.router.getBroadcastMode());
      if (!isRouted) return;

      // Don't Thru-routing back to a virtual device that's also used as an
      // input (controller), unless explicitly matrix-routed — prevents MIDI
      // feedback loops.
      if (!isRoutedByMatrix && outConfig.inEnabled) return;

      // Physical-loop guard: if this instrument's own bound Output port is
      // the same device we're currently routing FROM, forwarding here would
      // send straight back out to that same device — many keyboards/synths
      // echo their own output back into their input (Local Control/MIDI
      // Thru), so this closes the loop into a runaway repeat. Matches
      // MidiRouter.routeMessageToOutputs' equivalent same-device guard.
      const boundPort = this.virtualOutputPorts.get(virtName);
      if (boundPort) {
        const normIn  = inputName.toLowerCase().replace(/^(1-|2-|midi\s+|usb\s+)/i, '').trim();
        const normOut = boundPort.toLowerCase().replace(/^(1-|2-|midi\s+|usb\s+)/i, '').trim();
        if (normIn && normOut && normIn === normOut) return;
      }

      if (isNote && !outConfig.notes) return;
      if (isCC && !outConfig.cc) return;
      if (status === 0xF8 && !outConfig.clock) return;
      if ((status === 0xFA || status === 0xFC) && !outConfig.transport) return;

      // Note-range filter — MIDI Flow's per-cable "keyboard split" for
      // device→device connections (Controller → virtual Instrument). Only
      // gates note-ONS: note-offs must always pass through so a note that
      // reached this output via another route can still be silenced.
      // (looked up for every message: the cable's OUT ch remaps all of them, not only note-ons)
      const filter = this.getOutputRouteFilter(inputName, virtName);
      if (isNoteOn && filter) {
        const note = data[1];
        const lo = filter.lowNote ?? 0;
        const hi = filter.highNote ?? 127;
        if (note < lo || note > hi) return;
      }

      // Channel filter — per-cable MIDI channel gate for multi-part
      // instruments. When set, only messages on the listed channels pass
      // through this Thru connection. (Note-offs exempt, same reason.)
      if (isNote && !isNoteOff && filter?.channels && filter.channels.length > 0 && status < 0xF0) {
        const msgChannel = status & 0x0f;
        if (!filter.channels.includes(msgChannel)) return;
      }

      if (status >= 0xF0) {
        // System/realtime messages carry no channel nibble — send as-is.
        this.sendToVirtualOutput(virtName, Array.from(data));
        return;
      }

      // The cable's own OUT ch wins; then outChannels (multi-timbral fanout)
      // over the single outChannel remap, exactly like broadcast()'s
      // app-generated-note path.
      const cableChs = cableOutChannels(filter);
      const channels = cableChs.length > 0
        ? cableChs
        : (outConfig.outChannels && outConfig.outChannels.length > 0)
          ? outConfig.outChannels
          : [outConfig.outChannel !== -1 ? outConfig.outChannel : (status & 0x0f)];

      const virtDevice = { id: virtName, name: virtName };
      const applyLatch = (isNoteOn || isNoteOff) &&
        (!!outConfig.latchEnabled || (this.latch.isActive && outConfig.smartLatch));

      channels.forEach(ch => {
        if (applyLatch) {
          const forward = isNoteOn
            ? this.latch.handleNoteOn(virtDevice, outConfig, data[1], data[2], ch, '', now)
            : this.latch.handleNoteOff(virtDevice, data[1], ch);
          if (!forward) return;
        }
        const newStatus = (status & 0xf0) | (ch % 16);
        const bytes = data.length >= 2 ? [newStatus, ...Array.from(data.slice(1))] : [newStatus];
        this.sendToVirtualOutput(virtName, bytes);
        if (isNoteOn && !applyLatch) this.virtualThruNotes.noteOn(inputName, inChannel, data[1], virtName, ch);
      });
    });
  }

  // ── Public state flags ───────────────────────────────────────────────────
  isSmartLatchActive = false;
  isSequencerPlaying = false;

  // ── Monitor state (delegated to MidiMonitor) ─────────────────────────────
  private _monitorSeq = 0;

  constructor() {
    // Build context objects for sub-modules (inject the facade's state)
    const getMidiAccess = () => this.midiAccess;
    const getRoutingConfig = () => this.routingConfig;
    const getGlobalChannel = () => this.globalChannel;
    const getSequencerPlaying = () => this.isSequencerPlaying;
    const getOutputRouteFilter = (sourceKey: string, destKey: string) => this.getOutputRouteFilter(sourceKey, destKey);
    const onSent = (bytes: string, now: number) => {
      this.globalSentHashes.set(bytes, now);
    };

    const getVirtualClockTargets = () => this.getVirtualClockTargets();
    const getVirtualTransportTargets = () => this.getVirtualTransportTargets();
    const sendToVirtualOutput = (name: string, data: number[]) => this.sendToVirtualOutput(name, data);

    this.monitor = new MidiMonitor();
    this.transport = new MidiTransport({ getMidiAccess, getRoutingConfig, getVirtualClockTargets, getVirtualTransportTargets, sendToVirtualOutput });
    this.latch = new SmartLatch({ getMidiAccess, getRoutingConfig, getGlobalChannel });
    this.router = new MidiRouter({
      getMidiAccess,
      getRoutingConfig,
      getGlobalChannel,
      getSmartLatch: () => this.latch,
      getSequencerPlaying,
      getOutputRouteFilter,
      onSent,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API (preserved from original MidiService.ts)
  // ══════════════════════════════════════════════════════════════════════════

  get isReady(): boolean {
    return this.midiAccess !== null;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async init(): Promise<boolean> {
    if (this.midiAccess) return true;
    if (!navigator.requestMIDIAccess) {
      console.error('WebMIDI is not supported in this browser.');
      return false;
    }
    try {
      if ((window as any).SY_LOG) (window as any).SY_LOG('[MIDI] Requesting Access...');
      this.midiAccess = await navigator.requestMIDIAccess();
      if ((window as any).SY_LOG) (window as any).SY_LOG('[MIDI] Access Granted.');
      this.setupStateChangeHandler();
      await this.reScanInputs();
      this._startDevicePoll();
      this.router.load();
      this.router.loadBroadcastMode();
      return true;
    } catch (e: any) {
      console.error('[MIDI] Critical failure accessing MIDI devices:', e);
      if ((window as any).SY_LOG) (window as any).SY_LOG(`[MIDI] Access Failed: ${e.message}`);
      return false;
    }
  }

  // ── Lifecycle cleanup ─────────────────────────────────────────────────────

  dispose(): void {
    this._stopDevicePoll();
  }

  // ── SysEx ────────────────────────────────────────────────────────────────

  isSysExEnabled(): boolean { return this.sysexEnabled; }

  async sendSysEx(deviceName: string, hexString: string): Promise<{ ok: boolean; error?: string; sent?: number }> {
    const allBytes = _parseSysExString(hexString);
    if (!allBytes) {
      const msg = 'Invalid SysEx — could not parse string';
      console.warn('[MidiService]', msg);
      return { ok: false, error: msg };
    }
    // Split into individual F0…F7 messages (supports multi-message dumps)
    const messages: number[][] = [];
    let cur: number[] = [];
    for (const b of allBytes) {
      cur.push(b);
      if (b === 0xF7) { if (cur[0] === 0xF0) messages.push(cur); cur = []; }
    }
    if (messages.length === 0) {
      const msg = 'No valid SysEx messages found (must start F0, end F7)';
      console.warn('[MidiService]', msg);
      return { ok: false, error: msg };
    }
    if (!this.sysexEnabled) {
      const granted = await this.enableSysEx();
      if (!granted) return { ok: false, error: 'SysEx permission denied by browser' };
    }
    if (!this.midiAccess) return { ok: false, error: 'No MIDI access' };
    const out = Array.from(this.midiAccess.outputs.values()).find((p: any) => p.name === deviceName);
    if (!out) {
      const available = Array.from(this.midiAccess.outputs.values()).map((p: any) => p.name).join(', ') || '(none)';
      console.warn(`[MidiService] SysEx: output "${deviceName}" not found. Available: ${available}`);
      return { ok: false, error: `Output "${deviceName}" not found` };
    }
    let sent = 0;
    for (const msg of messages) {
      try {
        out.send(msg);
        sent++;
        if (messages.length > 1) await new Promise(r => setTimeout(r, 20));
      } catch (e: any) {
        console.error('[MidiService] SysEx send failed:', e?.message ?? e);
        return { ok: false, error: e?.message ?? 'Send failed', sent };
      }
    }
    console.log(`[MidiService] SysEx → "${deviceName}": ${sent} message(s) sent`);
    return { ok: true, sent };
  }

  async enableSysEx(): Promise<boolean> {
    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });
      this.sysexEnabled = true;
      this.setupStateChangeHandler();
      await this.reScanInputs();
      this.onStateChangeListeners.forEach(l => l(new Event('reinit')));
      if ((window as any).SY_LOG) (window as any).SY_LOG('[MIDI] SysEx access granted.');
      return true;
    } catch (e: any) {
      if ((window as any).SY_LOG) (window as any).SY_LOG(`[MIDI] SysEx access denied: ${e?.message ?? e}`);
      return false;
    }
  }

  disableSysEx(): void {
    this.sysexEnabled = false;
    if ((window as any).SY_LOG) (window as any).SY_LOG('[MIDI] SysEx disabled.');
  }

  // ── Device management ────────────────────────────────────────────────────

  async reScanInputs(): Promise<void> {
    if (!this.midiAccess) return;
    // Ports used as virtual-instrument outputs must never be opened as inputs —
    // loopback drivers (LoopBe1, loopMIDI, etc.) detect the simultaneous
    // open and mute themselves with a "MIDI Feedback" error.
    const inputs = Array.from(this.midiAccess.inputs.values())
      .filter(input => !this.isBlockedLoopbackInput(input.name));
    for (const input of inputs) {
      input.removeEventListener('midimessage', this.handleIngressBound);
      try {
        // open() alone on an already-open port is a spec no-op, but on
        // Chromium it actually re-establishes the internal stream that
        // goes stale after a page reload — without the destructive
        // close()+open() cycle that corrupts some USB MIDI devices
        // (Worlde, etc.) and requires a physical unplug/replug to fix.
        await input.open();
      } catch (e) {
        console.warn(`[MIDI] Failed to open input "${input.name}" on startup:`, e);
      }
      input.removeEventListener('midimessage', this.handleIngressBound);
      input.addEventListener('midimessage', this.handleIngressBound);
    }
    console.log(`[MIDI] Attached to ${inputs.length} inputs: ${inputs.map(i => i.name).join(', ')}`);
  }

  getOutputs(): MIDIOutput[] {
    if (!this.midiAccess) return [];
    return Array.from(this.midiAccess.outputs.values());
  }

  getInputs(): MIDIInput[] {
    if (!this.midiAccess) return [];
    return Array.from(this.midiAccess.inputs.values());
  }

  // ── Config ───────────────────────────────────────────────────────────────

  setRoutingConfig(config: RoutingConfig): void {
    this.routingConfig = config;
  }

  /** Release all notes held by per-device latch for a specific device (called when latch is disabled). */
  clearLatchForDevice(deviceName: string): void {
    // Virtual instrument path — key in latchedNotesByOutput is the virtName
    if (this.virtualOutputs.has(deviceName)) {
      const notes = this.latch.getLatchedNotes(deviceName);
      if (!notes.length) { this.latch.clearNotesByKey(deviceName); return; }
      const outConfig = this.routingConfig?.registrations[deviceName];
      const channels = new Set<number>();
      notes.forEach(n => {
        const ch = (outConfig?.outChannel !== undefined && outConfig.outChannel !== -1)
          ? outConfig.outChannel : n.channel;
        channels.add(ch);
        this.sendToVirtualOutput(deviceName, [0x80 | (ch & 0x0f), n.note, 0]);
      });
      channels.forEach(ch => {
        const s = ch % 16;
        this.sendToVirtualOutput(deviceName, [0xb0 + s, 123, 0]);
        this.sendToVirtualOutput(deviceName, [0xb0 + s, 64, 0]);
      });
      this.latch.clearNotesByKey(deviceName);
      return;
    }
    // Hardware path — key in latchedNotesByOutput is the Web MIDI port ID
    if (!this.midiAccess) return;
    for (const out of Array.from(this.midiAccess.outputs.values())) {
      if (out.name === deviceName) {
        this.latch.clearLatchedNotes(out.id);
        return;
      }
    }
  }

  setOutputRouteFilters(filters: Record<string, InputRouteFilter>): void {
    this.outputRouteFilters = filters;
  }

  private getOutputRouteFilter(sourceKey: string, destKey: string): InputRouteFilter | undefined {
    return this.outputRouteFilters[`${sourceKey}→${destKey}`];
  }

  setGlobalChannel(channel: number): void {
    this.globalChannel = channel;
  }

  setIngressFilter(fn: ((event: MIDIMessageEvent) => boolean) | null): void {
    this.ingressFilter = fn;
  }

  // Controls the app consumes (e.g. a Virtual Device dial learned with MIDI Learn): such a CC or
  // note still reaches the CC/note listeners, but Thru doesn't forward it — otherwise it would also
  // reach the device through the controller's MIDI Flow cable, on every channel of that cable.
  private thruExclude: ((deviceName: string, channel: number, kind: 'cc' | 'note', number: number) => boolean) | null = null;

  setThruExclude(fn: ((deviceName: string, channel: number, kind: 'cc' | 'note', number: number) => boolean) | null): void {
    this.thruExclude = fn;
  }

  // ── Smart Latch (delegates to sub-module) ────────────────────────────────

  setSmartLatchConfig(maxNotes: number, replace: boolean, fadeTime = 0): void {
    this.latch.setConfig(maxNotes, replace, fadeTime);
  }

  async setSmartLatchActive(active: boolean): Promise<void> {
    this.isSmartLatchActive = active;
    await this.latch.setActive(active);
  }

  // ── Split config ─────────────────────────────────────────────────────────

  setSplitConfig(config: SplitConfig | null): void {
    this.splitConfig = config;
    if ((window as any).SY_LOG) (window as any).SY_LOG(
      config?.enabled
        ? `[MIDI] Keyboard Split ON at note ${config.splitNote} (${config.lowDevice} / ${config.highDevice})`
        : '[MIDI] Keyboard Split OFF'
    );
  }

  // ── Routing matrix (delegates to sub-module) ─────────────────────────────

  setRouting(source: string, outputNames: string[]): void {
    this.router.setRouting(source, outputNames);
  }

  toggleRouting(source: string, outputName: string): void {
    this.router.toggleRouting(source, outputName);
  }

  getRouting(source: string): string[] {
    return this.router.getRouting(source);
  }

  setBroadcastMode(enabled: boolean): void {
    this.router.setBroadcastMode(enabled);
  }

  getBroadcastMode(): boolean {
    return this.router.getBroadcastMode();
  }

  toggleBroadcastMode(): void {
    this.router.toggleBroadcastMode();
  }

  // ── Listener registration (kept in facade) ───────────────────────────────

  /** Names of inputs detected as loopbacks of our own outputs (diagnostics). */
  getLoopbackInputNames(): string[] {
    return Array.from(this._loopbackInputs.values());
  }

  addRawListener(callback: (event: MIDIMessageEvent) => void): () => void {
    this.onRawListeners.push(callback);
    return () => { this.onRawListeners = this.onRawListeners.filter(l => l !== callback); };
  }

  addGlobalNoteOnListener(callback: (note: number, velocity: number) => void): () => void {
    this.globalNoteOnListeners.push(callback);
    return () => { this.globalNoteOnListeners = this.globalNoteOnListeners.filter(l => l !== callback); };
  }

  addCCListener(callback: (cc: number, val: number, chan: number, inputId?: string) => void): () => void {
    this.onCCListeners.push(callback);
    return () => { this.onCCListeners = this.onCCListeners.filter(l => l !== callback); };
  }

  addNoteListener(callback: (type: 'on' | 'off', note: number, velocity: number, chan: number, inputId?: string) => void): () => void {
    this.onNoteListeners.push(callback);
    return () => { this.onNoteListeners = this.onNoteListeners.filter(l => l !== callback); };
  }

  addPitchBendListener(callback: (val: number, chan: number, inputId?: string) => void): () => void {
    this.onPitchBendListeners.push(callback);
    return () => { this.onPitchBendListeners = this.onPitchBendListeners.filter(l => l !== callback); };
  }

  addStateChangeListener(callback: (event: Event) => void): () => void {
    this.onStateChangeListeners.push(callback);
    return () => { this.onStateChangeListeners = this.onStateChangeListeners.filter(l => l !== callback); };
  }

  addTransportListener(callback: (type: 'start' | 'stop' | 'clock') => void): () => void {
    this.onTransportListeners.push(callback);
    return () => { this.onTransportListeners = this.onTransportListeners.filter(l => l !== callback); };
  }

  // ── Monitor API (delegates to sub-module) ───────────────────────────────

  addMonitorListener(cb: (entry: MidiMonitorEntry) => void): () => void {
    return this.monitor.addListener(cb);
  }

  getMonitorBuffer(): MidiMonitorEntry[] {
    return this.monitor.getBuffer();
  }

  clearMonitorBuffer(): void {
    this.monitor.clear();
  }

  // ── Incoming clock BPM API (delegates to sub-module) ─────────────────────

  /** Whether the outgoing MIDI clock is currently running (diagnostics). */
  get isClockRunning(): boolean {
    return this.transport.isPlayingClock;
  }

  addClockBpmListener(cb: (bpm: number) => void): () => void {
    return this.transport.addClockBpmListener(cb);
  }

  getIncomingBpm(): number {
    return this.transport.getIncomingBpm();
  }

  // ── High-level message send ──────────────────────────────────────────────

  sendCC(cc: number, value: number, channel = 0, source: MidiSource = MidiSource.UI, skipDeviceId: string | null = null): void {
    this.broadcast('cc', { cc, value }, channel, source, skipDeviceId);
  }

  sendProgramChange(program: number, channel = 0, source: MidiSource = MidiSource.UI): void {
    this.broadcast('pc', { program }, channel, source);
  }

  /**
   * `at` (optional): when the note should sound, in performance.now() ms. Real MIDI
   * outputs get a timestamped send (scheduled by the browser, immune to main-thread
   * stalls); virtual outputs and latched outputs, which can't take a timestamp, are
   * delivered by a timer at that time.
   */
  sendNoteOn(note: number, velocity = 100, channel = 0, source: MidiSource = MidiSource.UI, skipDeviceId: string | null = null, at?: number): void {
    if (source === MidiSource.KEYBOARD && this.splitConfig?.enabled) {
      this.sendNoteSplit('noteon', note, velocity, channel);
      return;
    }
    this.broadcast('noteon', { note, velocity }, channel, source, skipDeviceId, at);
  }

  sendNoteOff(note: number, velocity = 0, channel = 0, source: MidiSource = MidiSource.UI, skipDeviceId: string | null = null, at?: number): void {
    if (source === MidiSource.KEYBOARD && this.splitConfig?.enabled) {
      this.sendNoteSplit('noteoff', note, velocity, channel);
      return;
    }
    this.broadcast('noteoff', { note, velocity }, channel, source, skipDeviceId, at);
  }

  sendPitchBend(value: number, channel = 0, source: MidiSource = MidiSource.UI, skipDeviceId: string | null = null): void {
    const lsb = value & 0x7F;
    const msb = (value >> 7) & 0x7F;
    this.broadcast('pitchbend', { lsb, msb }, channel, source, skipDeviceId);
  }

  sendRawNote(outputId: string | null, type: 'noteon' | 'noteoff', note: number, velocity: number, channel: number): void {
    if (!this.midiAccess) return;
    const status = noteStatusByte(type, channel);
    const msg = [status, note & 0x7F, velocity & 0x7F];
    const targets = outputId
      ? [this.midiAccess.outputs.get(outputId)].filter(Boolean) as MIDIOutput[]
      : Array.from(this.midiAccess.outputs.values());
    targets.forEach(out => { try { out.send(msg); } catch {} });
  }

  sendRawCC(portName: string, cc: number, value: number, channel = 0): void {
    const status = 0xB0 | (channel & 0xF);
    const msg = [status, cc & 0x7F, value & 0x7F];
    // Try real MIDI output
    if (this.midiAccess) {
      this.midiAccess.outputs.forEach((out: any) => {
        if (out.name === portName) {
          try { out.send(msg); } catch {}
        }
      });
    }
    // Try virtual output
    this.sendToVirtualOutput(portName, msg);
  }

  allNotesOff(channel = 0): void {
    this.broadcast('allnotesoff', {}, channel, MidiSource.UI);
    this.sendCC(120, 0, channel, MidiSource.UI);
    this.sendCC(64, 0, channel, MidiSource.UI);
  }

  panic(): void {
    console.log('[MIDI] PANIC! Sending All Notes Off to all devices and channels.');
    this.router.clearThruNotes();
    this.virtualThruNotes.clear();
    const panicMsg = (ch: number) => [0xb0 + ch, 123, 0];
    const resetMsg = (ch: number) => [0xb0 + ch, 120, 0];
    const sustainMsg = (ch: number) => [0xb0 + ch, 64, 0];

    if (this.midiAccess) {
      Array.from(this.midiAccess.outputs.values()).forEach((out: any) => {
        for (let ch = 0; ch < 16; ch++) {
          try {
            out.send(panicMsg(ch));
            out.send(resetMsg(ch));
            out.send(sustainMsg(ch));
          } catch {}
        }
      });
    }

    // Also panic virtual outputs
    this.virtualOutputs.forEach((_, virtName) => {
      for (let ch = 0; ch < 16; ch++) {
        this.sendToVirtualOutput(virtName, panicMsg(ch));
        this.sendToVirtualOutput(virtName, resetMsg(ch));
        this.sendToVirtualOutput(virtName, sustainMsg(ch));
      }
    });
  }

  sendRawToDevice(deviceId: string, data: number[]): void {
    const out = this.midiAccess?.outputs.get(deviceId);
    if (out) {
      try { out.send(data); } catch {}
    }
  }

  /**
   * Silences one channel on a named output (real or virtual) — used when a
   * channel is dropped from a multi-timbral instrument's outChannels list,
   * so any note still sounding there doesn't get orphaned (we'd otherwise
   * never talk to that channel again — the routing fanout recomputes
   * target channels from the *current* outChannels on every send, so a
   * later Note Off for a note that started before the channel was removed
   * never reaches it either).
   *
   * Sends literal Note Off for every note 0-127 in addition to the CC-based
   * All Notes Off/Reset/Sustain Off, since many MIDI-to-CV/Gate interfaces
   * (Eurorack-style hardware in particular) only respond to explicit
   * Note On/Off pairs and silently ignore channel-mode CCs like CC123.
   */
  resetChannel(outputName: string, channel: number): void {
    const ch = channel % 16;
    for (let note = 0; note < 128; note++) {
      this.sendRawToDeviceByName(outputName, [0x80 + ch, note, 0]);
    }
    [[0xb0 + ch, 123, 0], [0xb0 + ch, 120, 0], [0xb0 + ch, 64, 0]].forEach(msg => {
      this.sendRawToDeviceByName(outputName, msg);
    });
  }

  private _warnSendIssueOnce(key: string, warn: () => void): void {
    if (this._warnedSendIssues.has(key)) return;
    this._warnedSendIssues.add(key);
    warn();
  }

  private _clearSendIssues(deviceName: string): void {
    if (this._warnedSendIssues.size === 0) return;
    for (const key of this._warnedSendIssues) {
      if (key === deviceName || key.startsWith(`${deviceName}→`)) this._warnedSendIssues.delete(key);
    }
  }

  sendRawToDeviceByName(deviceName: string, data: number[]): void {
    if (!this.midiAccess) {
      this.sendToVirtualOutput(deviceName, data);
      return;
    }

    // 1. Check the routing matrix: the device may be mapped to an output
    //    port whose name differs from the registration name (e.g. a device
    //    named "BassStation" routed to output "AG06/AG03-1").  If routing
    //    exists, send to every routed port.
    const routedPorts = this.router.getRouting(deviceName);
    if (routedPorts.length > 0) {
      let sent = false;
      for (const portName of routedPorts) {
        const out = Array.from(this.midiAccess.outputs.values()).find((p: any) => p.name === portName);
        if (out) {
          try {
            out.send(data);
            this.logOutbound(deviceName, data);
            sent = true;
          } catch (e) {
            this._warnSendIssueOnce(`${deviceName}→${portName}`,
              () => console.warn(`[MIDI] sendRawToDeviceByName routed "${deviceName}"→"${portName}": send failed.`, e));
          }
        }
      }
      if (sent) { this._clearSendIssues(deviceName); return; }
    }

    // 2. Fallback: try to find a physical output with the same name
    const out = Array.from(this.midiAccess.outputs.values()).find((p: any) => p.name === deviceName);
    if (out) {
      try {
        out.send(data);
        this.logOutbound(deviceName, data);
        this._clearSendIssues(deviceName);
        return;
      } catch (e) {
        this._warnSendIssueOnce(deviceName,
          () => console.warn(`[MIDI] sendRawToDeviceByName "${deviceName}": send failed, falling back to virtual. (Not repeated until it recovers.)`, e));
      }
    } else if (!this.virtualOutputs?.has(deviceName)) {
      this._warnSendIssueOnce(deviceName, () => {
        const available = Array.from(this.midiAccess!.outputs.values()).map((p: any) => p.name).join(', ') || '(none)';
        console.warn(`[MIDI] sendRawToDeviceByName: no route nor output named "${deviceName}". Available: ${available} (Not repeated until it reconnects.)`);
      });
    }

    // 3. Try virtual output
    this.sendToVirtualOutput(deviceName, data);
  }

  /**
   * Re-sends every registered device's last-known Program Change (bank
   * MSB/LSB + program) on its own pcChannel — the same wire format
   * MidiDeviceProgramChangePanel.vue's sendCatalogSound()/sendManual() send
   * and recordChannelState() records into pcChannels. Called once on app
   * startup (see useMidiInit.js) so hardware synths recall whatever patch
   * was selected before the restart, since most devices don't remember that
   * themselves across a fresh MIDI session.
   */
  resendAllProgramChanges(): void {
    if (!this.routingConfig) return;
    let sent = 0;
    Object.values(this.routingConfig.registrations).forEach(reg => {
      // Only devices actually cabled in MIDI Flow — a leftover registration
      // (device removed from the canvas, unplugged gear) shouldn't get PCs.
      if (!this.isRoutedInFlow(reg.name)) return;
      const channels = { ...(reg.pcChannels ?? {}) };
      // Fall back to the registration's own active-channel fields when
      // pcChannels is empty (e.g. nothing clicked since the config loaded) —
      // same channel selection the panel's sendCatalogSound() uses.
      if (Object.keys(channels).length === 0 && reg.pcProgram != null) {
        channels[Math.max(0, reg.pcChannel ?? 0)] = {
          program: reg.pcProgram,
          msb: reg.pcMsb ?? 0,
          lsb: reg.pcLsb ?? 0,
        };
      }
      Object.entries(channels).forEach(([chStr, info]) => {
        if (!info || info.program == null) return;
        const ch = Math.max(0, parseInt(chStr, 10) || 0);
        const msb = info.msb ?? 0;
        const lsb = info.lsb ?? 0;
        if (reg.pcTemplate === 'emulatorx3') {
          // Emulator X3 wire format — see sendCatalogSound(): CC64=0 fixed,
          // CC32=bank, no CC0.
          this.sendRawToDeviceByName(reg.name, [0xB0 | ch, 64, 0]);
          this.sendRawToDeviceByName(reg.name, [0xB0 | ch, 32, lsb]);
        } else {
          this.sendRawToDeviceByName(reg.name, [0xB0 | ch, 0, msb]);
          this.sendRawToDeviceByName(reg.name, [0xB0 | ch, 32, lsb]);
        }
        this.sendRawToDeviceByName(reg.name, [0xC0 | ch, info.program]);
        sent++;
      });
    });
    if ((window as any).SY_LOG) (window as any).SY_LOG(`[MIDI] Re-sent ${sent} Program Change message(s) to registered devices.`);
  }

  /** True when `deviceName` is the destination of at least one MIDI Flow
   *  cable (any source → this device in the routing matrix). */
  isRoutedInFlow(deviceName: string): boolean {
    for (const targets of this.router.matrix.values()) {
      if (targets.has(deviceName)) return true;
    }
    return false;
  }

  cleanupDevice(deviceId: string): void {
    const out = this.midiAccess?.outputs.get(deviceId);
    if (out) {
      const config = this.routingConfig?.registrations[out.name];
      const targetCh = (config && config.outChannel !== -1) ? config.outChannel : this.globalChannel;
      const statusCh = targetCh % 16;
      [[0xb0 + statusCh, 123, 0], [0xb0 + statusCh, 64, 0]].forEach(msg => {
        this.globalSentHashes.set(msg.join(','), Date.now());
        try { out.send(msg); } catch {}
      });
    }
  }

  // ── NRPN ─────────────────────────────────────────────────────────────────

  sendNRPN(nrpnLsb: number, value: number, channel = 0, source: MidiSource = MidiSource.UI): void {
    const statusCh = channel % 16;
    if (this.routingConfig) {
      const targetsFromMatrix = this.router.matrix.get(source) || new Set();
      Object.entries(this.routingConfig.registrations).forEach(([name, config]) => {
        if (config.outEnabled && config.cc) {
          const allOutputs = Array.from(this.midiAccess?.outputs.values() || []);
          const ports = allOutputs.filter((p: any) =>
            p.name === name && (this.router.getBroadcastMode() || targetsFromMatrix.has(p.name))
          );
          ports.forEach((out: any) => {
            let ch = statusCh;
            if (config.outChannel !== -1) ch = config.outChannel % 16;
            out.send([0xb0 + ch, 99, 0]);
            out.send([0xb0 + ch, 98, nrpnLsb]);
            out.send([0xb0 + ch, 6, value]);
          });

          // Also send to virtual output with same name
          const isVirtual = this.virtualOutputs.has(name);
          const isMatrixMatch = targetsFromMatrix.has(name);
          if (isVirtual && (this.router.getBroadcastMode() || isMatrixMatch)) {
            let ch = statusCh;
            if (config.outChannel !== -1) ch = config.outChannel % 16;
            this.sendToVirtualOutput(name, [0xb0 + ch, 99, 0]);
            this.sendToVirtualOutput(name, [0xb0 + ch, 98, nrpnLsb]);
            this.sendToVirtualOutput(name, [0xb0 + ch, 6, value]);
          }
        }
      });
    }
  }

  sendAllCCs(ccMap: Record<number, number>, channel = 0, nrpnCCs: number[] = [], source: MidiSource = MidiSource.UI): void {
    Object.entries(ccMap).forEach(([cc, val]) => {
      const ccNum = parseInt(cc);
      if (nrpnCCs.includes(ccNum)) {
        this.sendNRPN(ccNum, val, channel, source);
      } else {
        this.sendCC(ccNum, val, channel, source);
      }
    });
  }

  // ── Transport (delegates to sub-module) ──────────────────────────────────

  setBpm(bpm: number): void {
    this.transport.setBpm(bpm);
  }

  startClock(): void {
    this.transport.startClock();
  }

  stopClock(): void {
    this.transport.stopClock();
  }

  sendStart(): void {
    this.transport.sendStart();
  }

  sendStop(): void {
    this.transport.sendStop();
  }

  sendContinue(): void {
    this.transport.sendContinue();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNALS (private)
  // ══════════════════════════════════════════════════════════════════════════

  private broadcast(
    type: 'noteon' | 'noteoff' | 'cc' | 'pc' | 'pitchbend' | 'clock' | 'start' | 'stop' | 'allnotesoff',
    data: any,
    channel = 0,
    source: MidiSource = MidiSource.UI,
    skipDeviceId: string | null = null,
    at?: number,
  ): void {
    if (!this.midiAccess) return;

    if (this.isSequencerPlaying && (type === 'noteon' || type === 'noteoff') && source === MidiSource.KEYBOARD) {
      return;
    }

    // Scheduled send (see sendNoteOn): ms until `at`, or 0 = send now.
    const deferMs = at != null ? at - performance.now() : 0;
    const scheduled = deferMs > 1;

    // Log to monitor (skip clock to avoid flooding)
    if (type !== 'clock') {
      const { type: mType, decoded } = decodeOut(type, data, channel);
      this.monitor.append({
        id: ++this._monitorSeq,
        timestamp: Date.now(),
        direction: 'out',
        device: source,
        channel: channel + 1,
        type: mType,
        data: [],
        decoded,
      });
    }

    // Collect target device IDs
    const targetDeviceIds = new Set<string>();
    const virtualTargets = new Set<string>();
    const skipDeviceName = skipDeviceId ? this.midiAccess.inputs.get(skipDeviceId)?.name : null;
    const targetsFromMatrix = this.router.matrix.get(source) || new Set();
    const hasMappings = targetsFromMatrix.size > 0;

    // Normalize matrix names for case-insensitive / whitespace-tolerant matching
    const normalizedMatrix = new Set(Array.from(targetsFromMatrix).map(n => n.toLowerCase().trim()));

    if (hasMappings) {
      const syLog = (window as any).SY_LOG;
      if (typeof syLog === 'function') {
        const actualNames = Array.from(this.midiAccess.outputs.values()).map(o => o.name);
        syLog(
          `[MIDI] Matrix targets for ${source}: [${Array.from(targetsFromMatrix).join(', ')}] ` +
          `— available outputs: [${actualNames.join(', ')}]`
        );
      }
    }

    // Both step-sequencer sources (SEQUENCER, and its piano-roll-style
    // sibling SEQUENCER2) are excluded from broadcast-mode's implicit
    // fail-open fan-out — unlike other apps, a sequencer looping unattended
    // shouldn't start firing notes at every enabled output just because
    // nothing's been explicitly cabled yet in MIDI FLOW. Either source still
    // reaches outputs normally via an explicit routing-matrix mapping.
    this.midiAccess.outputs.forEach((outPort: any) => {
      const isMatrixMatch = targetsFromMatrix.has(outPort.name) || normalizedMatrix.has(outPort.name.toLowerCase().trim());
      const isBroadcastTarget = this.router.getBroadcastMode() && (source !== MidiSource.SEQUENCER) && (source !== MidiSource.SEQUENCER2) && !hasMappings;
      if (!isMatrixMatch && !isBroadcastTarget) return;

      const config = this.routingConfig?.registrations[outPort.name];
      if (!config || !config.outEnabled) return;
      if (outPort.id === skipDeviceId || outPort.name === skipDeviceName) return;
      // Don't send app-generated messages to devices that are also used as
      // inputs (controllers), unless explicitly matrix-routed — prevents
      // MIDI feedback loops where the controller echoes the message back.
      if (!isMatrixMatch && config.inEnabled) return;

      let shouldAdd = true;
      switch (type) {
        case 'noteon': case 'noteoff': case 'allnotesoff': shouldAdd = config.notes; break;
        case 'cc': shouldAdd = config.cc; break;
        case 'pc': shouldAdd = config.pc; break;
        case 'pitchbend': shouldAdd = true; break;
        case 'clock': shouldAdd = config.clock; break;
        case 'start': case 'stop': shouldAdd = config.transport; break;
      }
      if (shouldAdd) targetDeviceIds.add(outPort.id);
    });

    // Also check virtual outputs against the routing matrix — same
    // SEQUENCER/SEQUENCER2 broadcast exclusion as above.
    this.virtualOutputs.forEach((_, virtName) => {
      const isMatrixMatch = targetsFromMatrix.has(virtName) || normalizedMatrix.has(virtName.toLowerCase().trim());
      const isBroadcastTarget = this.router.getBroadcastMode() && (source !== MidiSource.SEQUENCER) && (source !== MidiSource.SEQUENCER2) && !hasMappings;
      if (!isMatrixMatch && !isBroadcastTarget) return;
      virtualTargets.add(virtName);
    });

    // Send to real MIDI outputs
    targetDeviceIds.forEach(id => {
      const out = this.midiAccess?.outputs.get(id);
      if (!out) return;

      const config = this.routingConfig?.registrations[out.name];

      // Note-range + channel filter for app→device cables (MIDI Flow) —
      // same outputRouteFilters map used by device→device Thru and
      // device→virtual-instrument Thru, but keyed by the app's MidiSource
      // (e.g. "SEQUENCER→Launchkey MK4 49 MIDI").
      const outputFilter = this.getOutputRouteFilter(source as string, out.name);
      if (outputFilter) {
        if ((type === 'noteon' || type === 'noteoff') &&
            (outputFilter.lowNote != null || outputFilter.highNote != null)) {
          const lo = outputFilter.lowNote ?? 0;
          const hi = outputFilter.highNote ?? 127;
          if (data.note < lo || data.note > hi) return;
        }
      }

      // outChannels (multi-timbral fanout) takes precedence over the single
      // outChannel remap when set — duplicates the message onto every
      // listed channel instead of picking just one.
      let channels: number[];
      const cableChs = cableOutChannels(outputFilter);
      if (cableChs.length > 0) {
        channels = cableChs;   // the cable's own OUT channels win
      } else if (config?.outChannels && config.outChannels.length > 0) {
        channels = config.outChannels;
      } else if (config?.isMulti) {
        channels = [channel];
      } else if (config && config.outChannel !== -1) {
        channels = [config.outChannel];
      } else {
        channels = [channel];
      }

      const applyLatch = config?.latchEnabled || (this.latch.isActive && config?.smartLatch);
      channels.forEach(targetChannel => {
        // Channel filter gates on the output channel (after remapping), not
        // the source channel — so selecting CH 2 on the cable means "send to
        // this device on CH 2" regardless of what channel the app emits on.
        if (outputFilter?.channels && outputFilter.channels.length > 0) {
          if (!outputFilter.channels.includes(targetChannel & 0x0f)) return;
        }
        const statusCh = targetChannel % 16;
        let status = 0;
        let bytes: number[] = [];

        switch (type) {
          case 'noteon': status = 0x90 + statusCh; bytes = [data.note, data.velocity]; break;
          case 'noteoff': status = 0x80 + statusCh; bytes = [data.note, data.velocity]; break;
          case 'cc': status = 0xb0 + statusCh; bytes = [data.cc, data.value]; break;
          case 'pc': status = 0xc0 + statusCh; bytes = [data.program]; break;
          case 'pitchbend': status = 0xe0 + statusCh; bytes = [data.lsb, data.msb]; break;
          case 'allnotesoff': status = 0xb0 + statusCh; bytes = [123, 0]; break;
          case 'clock': status = 0xF8; break;
          case 'start': status = 0xFA; break;
          case 'stop': status = 0xFC; break;
        }

        if (status > 0) {
          const fullMsg = [status, ...bytes];
          const latched = applyLatch && (type === 'noteon' || type === 'noteoff');
          const deliver = () => {
            if (latched) {
              const forward = type === 'noteon'
                ? this.latch.handleNoteOn(out, config, data.note, data.velocity, targetChannel, '', Date.now())
                : this.latch.handleNoteOff(out, data.note, targetChannel);
              if (!forward) return;
            }
            this.globalSentHashes.set(fullMsg.join(','), Date.now());
            out.send(fullMsg);
          };
          if (!scheduled) deliver();
          // the latch decides (and may send releases) at play time — keep it on a timer
          else if (latched) setTimeout(deliver, deferMs);
          else {
            // echo matching uses the time it will actually leave
            this.globalSentHashes.set(fullMsg.join(','), Date.now() + deferMs);
            out.send(fullMsg, at);
          }
        }
      });
    });

    // Send to virtual outputs
    // Determine which virtual outputs match the same routing criteria
    virtualTargets.forEach(virtName => {
      const config = this.routingConfig?.registrations[virtName];
      if (!config || !config.outEnabled) return;

          // Note-range + channel filter for app→virtual-instrument cables (MIDI Flow)
          const outputFilter = this.getOutputRouteFilter(source as string, virtName);
          if (outputFilter) {
            if ((type === 'noteon' || type === 'noteoff') &&
                (outputFilter.lowNote != null || outputFilter.highNote != null)) {
              const lo = outputFilter.lowNote ?? 0;
              const hi = outputFilter.highNote ?? 127;
              if (data.note < lo || data.note > hi) return;
            }
          }

      let shouldAdd = true;
      switch (type) {
        case 'noteon': case 'noteoff': case 'allnotesoff': shouldAdd = config.notes; break;
        case 'cc': shouldAdd = config.cc; break;
        case 'pc': shouldAdd = config.pc; break;
        case 'pitchbend': shouldAdd = true; break;
        case 'clock': shouldAdd = config.clock; break;
        case 'start': case 'stop': shouldAdd = config.transport; break;
      }
      if (!shouldAdd) return;

      const cableChs = cableOutChannels(outputFilter);   // the cable's own OUT channels win
      const channels = cableChs.length > 0
        ? cableChs
        : (config.outChannels && config.outChannels.length > 0)
          ? config.outChannels
          : [config.outChannel !== -1 ? config.outChannel : channel];

      const virtDevice = { id: virtName, name: virtName };
      const virtApplyLatch = config.latchEnabled || (this.latch.isActive && config.smartLatch);
      channels.forEach(targetChannel => {
        // Channel filter gates on the output channel (after remapping)
        if (outputFilter?.channels && outputFilter.channels.length > 0) {
          if (!outputFilter.channels.includes(targetChannel & 0x0f)) return;
        }
        const statusCh = targetChannel % 16;
        let status = 0;
        let bytes: number[] = [];

        switch (type) {
          case 'noteon': status = 0x90 + statusCh; bytes = [data.note, data.velocity]; break;
          case 'noteoff': status = 0x80 + statusCh; bytes = [data.note, data.velocity]; break;
          case 'cc': status = 0xb0 + statusCh; bytes = [data.cc, data.value]; break;
          case 'pc': status = 0xc0 + statusCh; bytes = [data.program]; break;
          case 'pitchbend': status = 0xe0 + statusCh; bytes = [data.lsb, data.msb]; break;
          case 'allnotesoff': status = 0xb0 + statusCh; bytes = [123, 0]; break;
          case 'clock': status = 0xF8; break;
          case 'start': status = 0xFA; break;
          case 'stop': status = 0xFC; break;
        }

        if (status > 0) {
          const deliver = () => {
            if (virtApplyLatch && (type === 'noteon' || type === 'noteoff')) {
              const forward = type === 'noteon'
                ? this.latch.handleNoteOn(virtDevice, config, data.note, data.velocity, targetChannel, '', Date.now())
                : this.latch.handleNoteOff(virtDevice, data.note, targetChannel);
              if (!forward) return;
            }
            this.sendToVirtualOutput(virtName, [status, ...bytes]);
          };
          // virtual instruments are plain JS callbacks: no timestamp, so a timer
          if (scheduled) setTimeout(deliver, deferMs);
          else deliver();
        }
      });
    });
  }

  private setupStateChangeHandler(): void {
    if (!this.midiAccess) return;
    this.midiAccess.onstatechange = (event) => {
      const port = (event as MIDIConnectionEvent).port;
      if (port && port.name) {
        const key = this.normPort(port.name);
        if (port.state === 'connected') {
          // Ensure the poll cache stays in sync so the next poll doesn't
          // redundantly re-detect the same device and spam logs/listeners.
          if (port.type === 'output') this._lastKnownOutputNames.add(key);
          else if (port.type === 'input') this._lastKnownInputNames.add(key);
        } else if (port.state === 'disconnected') {
          if (port.type === 'output') this._lastKnownOutputNames.delete(key);
          else if (port.type === 'input') this._lastKnownInputNames.delete(key);
        }

        if (port.type === 'input' && port.state === 'connected' && port.name) {
        // Just re-attach the midimessage listener — close()+open() cycles
        // corrupt the driver-level connection for some USB MIDI devices
        // (Worlde, etc.), causing them to show as "connected" but never
        // fire midimessage events.  The browser already opens the port
        // when it reports state='connected', so only the listener needs
        // to be wired up.  Guarded against re-entrancy.
          const input = port as MIDIInput;
          const name = input.name ?? '';
          const key = this.normPort(name);
          const lastReset = this._lastInputResetAt.get(key) ?? 0;
          if (!this._resettingInputs.has(key) && Date.now() - lastReset > 500) {
            this._resettingInputs.add(key);
            console.log(`[MIDI] Device (re)connected: ${name}`);
            input.removeEventListener('midimessage', this.handleIngressBound);
            input.addEventListener('midimessage', this.handleIngressBound);
            this._resettingInputs.delete(key);
            this._lastInputResetAt.set(key, Date.now());
          }
        }
      }
      this.onStateChangeListeners.forEach(l => l(event));
    };
  }

  private handleIngress(event: MIDIMessageEvent): void {
    if (!event.data || event.data.length === 0) return;
    const input = event.target as MIDIInput;
    const inputId = input?.id;
    const status = event.data[0];
    const now = Date.now();

    // Fire raw listeners
    this.onRawListeners.forEach(l => l(event));

    // Log to monitor (before ingress filter so controller-consumed msgs are visible)
    {
      const inputDevice = this.midiAccess?.inputs.get(inputId);
      const { type: mType, channel: mCh, decoded } = decodeRaw(event.data as Uint8Array);
      this.monitor.append({
        id: ++this._monitorSeq,
        timestamp: now,
        direction: 'in',
        device: inputDevice?.name ?? 'Unknown',
        channel: mCh,
        type: mType,
        data: Array.from(event.data as Uint8Array),
        decoded,
      });
    }

    const inputDevice = this.midiAccess?.inputs.get(inputId);
    const inConfig = inputDevice ? this.routingConfig?.registrations[inputDevice.name] : null;
    const wiredAsInput = !!inConfig?.inEnabled;

    // Loopback of our own output (see _loopbackInputs): its clock/transport is
    // our own coming back — drop it before BPM detection and transport listeners.
    const isLoopback = !wiredAsInput && this._loopbackInputs.has(inputId);
    if (isLoopback && status >= 0xF8) return;

    // Ingress filter
    if (this.ingressFilter && this.ingressFilter(event)) return;

    // Ingress rate limiting
    this.ingressCount++;
    if (now - this.lastIngressReset > 1000) {
      if (this.ingressCount > 1500) {
        console.error(`[MIDI] High ingress rate: ${this.ingressCount} msg/s. Throttling Thru relay.`);
        this.isThruThrottled = true;
        setTimeout(() => { this.isThruThrottled = false; }, 3000);
      }
      this.ingressCount = 0;
      this.lastIngressReset = now;
      const threshold = now - 2000;
      for (const [hash, time] of this.globalSentHashes) {
        if (time < threshold) this.globalSentHashes.delete(hash);
      }
    }

    if (this.isThruThrottled) return;

    // Block SysEx unless explicitly enabled
    if (status === 0xF0 && !this.sysexEnabled) return;

    // Channel filter
    if (this.routingConfig && status < 0xF0) {
      const msgChannel = status & 0x0f;
      if (inConfig && inConfig.inChannel !== -1 && inConfig.inChannel !== msgChannel) return;
    }

    // Velocity gating and curve transform
    let processedData: number[] | Uint8Array = event.data;
    const isNoteOn = (status & 0xf0) === 0x90;
    const isNoteOff = (status & 0xf0) === 0x80 || ((status & 0xf0) === 0x90 && event.data[2] === 0);
    if ((isNoteOn || isNoteOff) && event.data.length >= 3 && inConfig) {
      const rawVelocity = event.data[2];
      if (isNoteOn && rawVelocity > 0) {
        const min = inConfig.velocityMin ?? 0;
        const max = inConfig.velocityMax ?? 127;
        if (rawVelocity < min || rawVelocity > max) return;
        const mapped = applyVelocityCurve(rawVelocity, inConfig.velocityMap ?? 'linear');
        if (mapped !== rawVelocity) {
          const copy = new Uint8Array(event.data);
          copy[2] = mapped;
          processedData = copy;
        }
      }
    }

    // Echo suppression — guards against a virtual/hardware MIDI loopback cable
    // re-triggering itself, not against a musician genuinely repeating a
    // note. A real loopback echo arrives within single-digit ms; 300ms was
    // wide enough to also swallow a deliberately fast repeated note (trills,
    // drum-style rolls, fast runs hitting the same pitch+velocity twice) —
    // the dropped half of that on/off pair is exactly what leaves a stuck
    // note on the receiving synth. 20ms comfortably covers real echo
    // latency while sitting below realistic repeated-note timing.
    //
    // Compared against when the message *arrived* (event.timeStamp), not when
    // this handler runs: under main-thread load an echo is processed well past
    // the window, slipped through, and fed the loop it was meant to stop.
    const rawHash = event.data.join(',');
    const globalSentTime = this.globalSentHashes.get(rawHash);
    const arrivedAt = this.arrivalTime(event, now);
    const isEcho = !!globalSentTime && arrivedAt - globalSentTime >= -1 && arrivedAt - globalSentTime < MidiService.ECHO_WINDOW_MS;
    if (!wiredAsInput && status < 0xF0 && !isNoteOff) this.trackEcho(inputId, inputDevice?.name ?? '', isEcho);
    // Never suppress incoming note-offs based on global sent hashes — the app
    // may have generated a note-off for the same note+channel (panic, UI, etc.)
    // and the controller's real note-off must not be mistaken for a loopback.
    // On a detected loopback input it is our own note-off coming back, though.
    if (isEcho && (!isNoteOff || isLoopback)) return;
    const recent = this.lastSentMessages.get(inputId);
    if (recent && recent.data === `${inputId}:${rawHash}` && now - recent.time < 50) return;

    // Global Thru routing
    if (this.routingConfig && this.routingConfig.globalThruEnabled) {
      const type = status & 0xf0;
      const isNote = type === 0x90 || type === 0x80;
      const isCC = type === 0xb0;
      // Clock/Start/Continue/Stop (0xF8-0xFF) — blocked from Thru by default
      // (blockIncomingClockThru !== false) so a device sending its own clock
      // can't fight the app's internally generated clock on other outputs.
      // Still processed above for the incoming-BPM display regardless.
      const isSystem = status >= 0xF8;
      const blockClockThru = this.routingConfig.blockIncomingClockThru !== false;
      const isSystemThru = isSystem && !blockClockThru;
      const thru = this.routingConfig.thruFilters || { notes: true, cc: true };
      const passGlobal = (isNote && thru.notes !== false) ||
        (isCC && thru.cc !== false) ||
        (isSystemThru) ||
        (!isNote && !isCC && !isSystem);
      const consumed = (isCC || isNote) && !!this.thruExclude?.(
        inputDevice?.name ?? '', status & 0x0f, isCC ? 'cc' : 'note', (processedData as Uint8Array)[1]);
      if (passGlobal && !consumed) {
        this.router.routeMessageToOutputs(processedData as Uint8Array, inputId, now);
        this.routeMessageToVirtualOutputs(processedData as Uint8Array, inputDevice?.name || '', now);
      }
    }

    // Real-time messages (clock / transport)
    const syncBlocked = inConfig && inConfig.receiveSyncIn === false;
    this.transport.handleIncomingRealTime(status, !!syncBlocked, this.onTransportListeners);

    // Voice messages
    if (status < 0xF0) {
      const type = status & 0xf0;
      const channel = status & 0x0f;
      if (type === 0x90 || type === 0x80) {
        const note = (processedData as any)[1];
        const velocity = (processedData as any)[2];
        // A Note On with velocity 0 is the standard MIDI running-status
        // encoding for Note Off (lets a device keep reusing the 0x90 status
        // byte instead of alternating to 0x80) — common on real controllers,
        // especially during fast passages where running status kicks in.
        // Treating it as a literal 'on' left every consumer here (Arp,
        // Virtual Keyboard, sequencers, SmartLatch, etc.) seeing a note that
        // never gets its matching 'off', i.e. a stuck note.
        const isNoteOn = type === 0x90 && velocity > 0;
        this.onNoteListeners.forEach(l => l(isNoteOn ? 'on' : 'off', note, velocity, channel, inputId));
        if (isNoteOn) this.globalNoteOnListeners.forEach(l => l(note, velocity));
      } else if (type === 0xb0) {
        this.onCCListeners.forEach(l => l(event.data[1], event.data[2], channel, inputId));
      } else if (type === 0xe0) {
        const val = (event.data[2] << 7) | event.data[1];
        this.onPitchBendListeners.forEach(l => l(val, channel, inputId));
      }
    }
  }

  private handleIngressBound = this.handleIngress.bind(this);

  /** Epoch ms when the browser received the message; `fallback` if the timestamp is unusable. */
  private arrivalTime(event: MIDIMessageEvent, fallback: number): number {
    const ts = event.timeStamp;
    if (!(ts > 0) || typeof performance === 'undefined') return fallback;
    const t = performance.timeOrigin + ts;
    // a timestamp from another clock base would land far off — ignore it
    return t <= fallback + 5 && t > fallback - 5000 ? t : fallback;
  }

  /** Count echoes of our own sends per (non-wired) input; mute it once it's clearly a loopback. */
  private trackEcho(inputId: string, name: string, isEcho: boolean): void {
    if (this._loopbackInputs.has(inputId)) return;
    let st = this._echoStats.get(inputId);
    if (!st) { st = { echo: 0, other: 0 }; this._echoStats.set(inputId, st); }
    if (isEcho) st.echo++; else st.other++;
    if (st.echo >= MidiService.LOOPBACK_MIN_ECHOES && st.echo >= st.other * 4) {
      this._loopbackInputs.set(inputId, name);
      console.warn(`[MIDI] Input "${name}" receives this app's own output (loopback) — its echoes and clock are now ignored. Register it as an input in MIDI Flow to opt out.`);
    }
  }

  private sendDirectToOutputByName(
    deviceName: string,
    type: 'noteon' | 'noteoff',
    note: number,
    velocity: number,
    channel: number,
  ): void {
    const now = Date.now();

    // Try real MIDI output
    if (this.midiAccess) {
      this.midiAccess.outputs.forEach((out: any) => {
        if (out.name !== deviceName) return;
        const config = this.routingConfig?.registrations[out.name];
        let targetCh = channel;
        if (config && !config.isMulti && config.outChannel !== -1) targetCh = config.outChannel;
        const statusCh = targetCh % 16;
        const status = (type === 'noteon' ? 0x90 : 0x80) + statusCh;
        const msg = [status, note & 0x7f, velocity & 0x7f];
        this.globalSentHashes.set(msg.join(','), now);
        try { out.send(msg); } catch {}
      });
    }

    // Try virtual output
    if (this.virtualOutputs.has(deviceName)) {
      const config = this.routingConfig?.registrations[deviceName];
      let targetCh = channel;
      if (config && !config.isMulti && config.outChannel !== -1) targetCh = config.outChannel;
      const statusCh = targetCh % 16;
      const status = (type === 'noteon' ? 0x90 : 0x80) + statusCh;
      const msg = [status, note & 0x7f, velocity & 0x7f];
      this.sendToVirtualOutput(deviceName, msg);
    }
  }

  private sendNoteSplit(type: 'noteon' | 'noteoff', note: number, velocity: number, channel: number): void {
    const split = this.splitConfig!;
    const isLow = note < split.splitNote;
    const deviceName = isLow ? split.lowDevice : split.highDevice;
    const semitones = isLow ? split.lowTranspose : split.highTranspose;
    const transposedNote = Math.max(0, Math.min(127, note + semitones));
    this.sendDirectToOutputByName(deviceName, type, transposedNote, velocity, channel);
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────
export const midiService = new MidiService();