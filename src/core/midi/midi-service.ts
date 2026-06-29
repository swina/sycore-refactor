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
} from '@/types/midi';
import { MidiSource } from '@/types/midi';
import { MidiMonitor } from './midi-monitor';
import { MidiTransport } from './midi-transport';
import { SmartLatch } from './midi-smart-latch';
import { MidiRouter } from './midi-routing';
import { decodeRaw, decodeOut, applyVelocityCurve, noteStatusByte } from './midi-broadcast';

export type { DeviceRegistration, RoutingConfig, SplitConfig, MidiMessageType, MidiMonitorEntry };
export { MidiSource };

export class MidiService {
  // ── Core references ──────────────────────────────────────────────────────
  private midiAccess: MIDIAccess | null = null;
  private routingConfig: RoutingConfig | null = null;
  private globalChannel = 0;
  private splitConfig: SplitConfig | null = null;

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
  private ingressFilter: ((event: MIDIMessageEvent) => boolean) | null = null;

  // ── Echo / ingress suppression ───────────────────────────────────────────
  private lastSentMessages = new Map<string, { data: string; time: number }>();
  private globalSentHashes = new Map<string, number>();
  private ingressCount = 0;
  private lastIngressReset = Date.now();
  private isThruThrottled = false;

  // ── SysEx ────────────────────────────────────────────────────────────────
  private sysexEnabled = false;

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
    const onSent = (bytes: string, now: number) => {
      this.globalSentHashes.set(bytes, now);
    };

    this.monitor = new MidiMonitor();
    this.transport = new MidiTransport({ getMidiAccess, getRoutingConfig });
    this.latch = new SmartLatch({ getMidiAccess, getRoutingConfig, getGlobalChannel });
    this.router = new MidiRouter({
      getMidiAccess,
      getRoutingConfig,
      getGlobalChannel,
      getSmartLatch: () => this.latch,
      getSequencerPlaying,
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
      this.reScanInputs();
      this.router.load();
      this.router.loadBroadcastMode();
      return true;
    } catch (e: any) {
      console.error('[MIDI] Critical failure accessing MIDI devices:', e);
      if ((window as any).SY_LOG) (window as any).SY_LOG(`[MIDI] Access Failed: ${e.message}`);
      return false;
    }
  }

  // ── SysEx ────────────────────────────────────────────────────────────────

  isSysExEnabled(): boolean { return this.sysexEnabled; }

  async enableSysEx(): Promise<boolean> {
    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });
      this.sysexEnabled = true;
      this.setupStateChangeHandler();
      this.reScanInputs();
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

  reScanInputs(): void {
    if (!this.midiAccess) return;
    const inputs = Array.from(this.midiAccess.inputs.values());
    inputs.forEach(input => {
      input.open();
      input.removeEventListener('midimessage', this.handleIngressBound);
      input.addEventListener('midimessage', this.handleIngressBound);
    });
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

  setGlobalChannel(channel: number): void {
    this.globalChannel = channel;
  }

  setIngressFilter(fn: ((event: MIDIMessageEvent) => boolean) | null): void {
    this.ingressFilter = fn;
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

  sendNoteOn(note: number, velocity = 100, channel = 0, source: MidiSource = MidiSource.UI, skipDeviceId: string | null = null): void {
    if (source === MidiSource.KEYBOARD && this.splitConfig?.enabled) {
      this.sendNoteSplit('noteon', note, velocity, channel);
      return;
    }
    this.broadcast('noteon', { note, velocity }, channel, source, skipDeviceId);
  }

  sendNoteOff(note: number, velocity = 0, channel = 0, source: MidiSource = MidiSource.UI, skipDeviceId: string | null = null): void {
    if (source === MidiSource.KEYBOARD && this.splitConfig?.enabled) {
      this.sendNoteSplit('noteoff', note, velocity, channel);
      return;
    }
    this.broadcast('noteoff', { note, velocity }, channel, source, skipDeviceId);
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
    if (!this.midiAccess) return;
    const status = 0xB0 | (channel & 0xF);
    this.midiAccess.outputs.forEach((out: any) => {
      if (out.name === portName) {
        try { out.send([status, cc & 0x7F, value & 0x7F]); } catch {}
      }
    });
  }

  allNotesOff(channel = 0): void {
    this.broadcast('allnotesoff', {}, channel, MidiSource.UI);
    this.sendCC(120, 0, channel, MidiSource.UI);
    this.sendCC(64, 0, channel, MidiSource.UI);
  }

  panic(): void {
    if (this.midiAccess) {
      console.log('[MIDI] PANIC! Sending All Notes Off to all devices and channels.');
      Array.from(this.midiAccess.outputs.values()).forEach((out: any) => {
        for (let ch = 0; ch < 16; ch++) {
          try {
            out.send([0xb0 + ch, 123, 0]);
            out.send([0xb0 + ch, 120, 0]);
            out.send([0xb0 + ch, 64, 0]);
          } catch {}
        }
      });
    }
  }

  sendRawToDevice(deviceId: string, data: number[]): void {
    const out = this.midiAccess?.outputs.get(deviceId);
    if (out) {
      try { out.send(data); } catch {}
    }
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
  ): void {
    if (!this.midiAccess) return;

    if (this.isSequencerPlaying && (type === 'noteon' || type === 'noteoff') && source === MidiSource.KEYBOARD) {
      return;
    }

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
    const skipDeviceName = skipDeviceId ? this.midiAccess.inputs.get(skipDeviceId)?.name : null;
    const targetsFromMatrix = this.router.matrix.get(source) || new Set();
    const hasMappings = targetsFromMatrix.size > 0;

    this.midiAccess.outputs.forEach((outPort: any) => {
      const isMatrixMatch = targetsFromMatrix.has(outPort.name);
      const isBroadcastTarget = this.router.getBroadcastMode() && (source !== MidiSource.SEQUENCER) && !hasMappings;
      if (!isMatrixMatch && !isBroadcastTarget) return;

      const config = this.routingConfig?.registrations[outPort.name];
      if (!config || !config.outEnabled) return;
      if (outPort.id === skipDeviceId || outPort.name === skipDeviceName) return;

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

    // Send to all targets
    targetDeviceIds.forEach(id => {
      const out = this.midiAccess?.outputs.get(id);
      if (!out) return;

      let targetChannel = channel;
      const config = this.routingConfig?.registrations[out.name];
      if (config) {
        if (config.isMulti) {
          targetChannel = channel;
        } else if (config.outChannel !== -1) {
          targetChannel = config.outChannel;
        }
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
        this.globalSentHashes.set(fullMsg.join(','), Date.now());
        out.send(fullMsg);
      }
    });
  }

  private setupStateChangeHandler(): void {
    if (!this.midiAccess) return;
    this.midiAccess.onstatechange = (event) => {
      const port = (event as MIDIConnectionEvent).port;
      if (port.type === 'input' && port.state === 'connected') {
        const input = port as MIDIInput;
        input.open();
        input.removeEventListener('midimessage', this.handleIngressBound);
        input.addEventListener('midimessage', this.handleIngressBound);
        console.log(`[MIDI] New device connected: ${port.name}`);
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

    // Input device routing config
    const inputDevice = this.midiAccess?.inputs.get(inputId);
    const inConfig = inputDevice ? this.routingConfig?.registrations[inputDevice.name] : null;

    // Channel filter
    if (this.routingConfig && status < 0xF0) {
      const msgChannel = status & 0x0f;
      if (inConfig && inConfig.inChannel !== -1 && inConfig.inChannel !== msgChannel) return;
    }

    // Velocity gating and curve transform
    let processedData: number[] | Uint8Array = event.data;
    const isNoteOn = (status & 0xf0) === 0x90;
    const isNoteOff = (status & 0xf0) === 0x80;
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

    // Echo suppression
    const rawHash = event.data.join(',');
    const globalSentTime = this.globalSentHashes.get(rawHash);
    if (globalSentTime && now - globalSentTime < 300) return;
    const recent = this.lastSentMessages.get(inputId);
    if (recent && recent.data === `${inputId}:${rawHash}` && now - recent.time < 50) return;

    // Global Thru routing
    if (this.routingConfig && this.routingConfig.globalThruEnabled) {
      const type = status & 0xf0;
      const isNote = type === 0x90 || type === 0x80;
      const isCC = type === 0xb0;
      const isSystem = status >= 0xF8;
      const thru = this.routingConfig.thruFilters || { notes: true, cc: true };
      const passGlobal = (isNote && thru.notes !== false) ||
        (isCC && thru.cc !== false) ||
        (isSystem) ||
        (!isNote && !isCC && !isSystem);
      if (passGlobal) {
        this.router.routeMessageToOutputs(processedData as Uint8Array, inputId, now);
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
        this.onNoteListeners.forEach(l => l(type === 0x90 ? 'on' : 'off', note, velocity, channel, inputId));
        if (type === 0x90) this.globalNoteOnListeners.forEach(l => l(note, velocity));
      } else if (type === 0xb0) {
        this.onCCListeners.forEach(l => l(event.data[1], event.data[2], channel, inputId));
      } else if (type === 0xe0) {
        const val = (event.data[2] << 7) | event.data[1];
        this.onPitchBendListeners.forEach(l => l(val, channel, inputId));
      }
    }
  }

  private handleIngressBound = this.handleIngress.bind(this);

  private sendDirectToOutputByName(
    deviceName: string,
    type: 'noteon' | 'noteoff',
    note: number,
    velocity: number,
    channel: number,
  ): void {
    if (!this.midiAccess) return;
    const now = Date.now();
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