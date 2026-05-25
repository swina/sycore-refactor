/**
 * MIDI Service per gestire l'accesso WebMIDI e l'invio di messaggi CC
 */

export interface DeviceRegistration {
  name: string;
  inEnabled: boolean;
  inChannel: number; // -1 for OMNI
  outEnabled: boolean;
  outChannel: number; // -1 for pass-through
  clock: boolean;
  transport: boolean;
  notes: boolean;
  cc: boolean;
  pc: boolean;
  isMulti: boolean;
  smartLatch: boolean;
  midiThru: boolean;                               // receive THRU'd messages
  velocityMin: number;                             // 0–127 gate low bound
  velocityMax: number;                             // 0–127 gate high bound
  velocityMap: 'linear' | 'log' | 'exp' | 'fixed';
  receiveSyncIn: boolean;                          // accept clock/transport from this input
}

export interface RoutingConfig {
  registrations: Record<string, DeviceRegistration>;
  globalThruEnabled: boolean;
  thruFilters: { notes: boolean; cc: boolean };
}

export interface SplitConfig {
  enabled: boolean;
  splitNote: number;      // notes below this go to lowDevice
  lowDevice: string;
  highDevice: string;
  lowTranspose: number;   // semitones
  highTranspose: number;
}

export type MidiMessageType =
  | 'noteon' | 'noteoff' | 'cc' | 'pc' | 'pitchbend'
  | 'clock' | 'start' | 'stop' | 'sysex' | 'other'

export interface MidiMonitorEntry {
  id: number
  timestamp: number
  direction: 'in' | 'out'
  device: string         // IN: input device name; OUT: MidiSource tag
  channel: number        // 1–16 for voice messages, 0 for system
  type: MidiMessageType
  data: number[]
  decoded: string
}

export enum MidiSource {
  SEQUENCER = 'SEQUENCER',
  KEYBOARD = 'KEYBOARD',
  ARP = 'ARP',
  UI = 'UI',
  TRANSPORT = 'TRANSPORT'
}

const MIDI_ROUTING_KEY = 'S1_MIDI_ROUTING'
const MIDI_BROADCAST_KEY = 'S1_MIDI_BROADCAST'

// Global System Logger for debugging and hardware status
if (typeof window !== 'undefined') {
  (window as any).SY_LOG = (msg: string) => {
    console.log(`[SY.CORE] ${msg}`);
    window.dispatchEvent(new CustomEvent('app-system-log', { detail: msg }));
  };
}

export class MidiService {
  private midiAccess: MIDIAccess | null = null;
  private routingConfig: RoutingConfig | null = null;
  private broadcastMode: boolean = true;

  // Multi-Output Routing Matrix
  private routingMatrix: Map<string, Set<string>> = new Map([
    [MidiSource.SEQUENCER, new Set()],
    [MidiSource.KEYBOARD, new Set()],
    [MidiSource.ARP, new Set()],
    [MidiSource.UI, new Set()],
    [MidiSource.TRANSPORT, new Set()],
  ]);

  private onCCListeners: ((cc: number, val: number, chan: number, inputId?: string) => void)[] = [];
  private onNoteListeners: ((type: 'on' | 'off', note: number, velocity: number, chan: number, inputId?: string) => void)[] = [];
  private onPitchBendListeners: ((val: number, chan: number, inputId?: string) => void)[] = [];
  private onStateChangeListeners: ((event: Event) => void)[] = [];
  private globalNoteOnListeners: ((note: number, velocity: number) => void)[] = [];
  private onTransportListeners: ((type: 'start' | 'stop' | 'clock') => void)[] = [];
  private onRawListeners: ((event: MIDIMessageEvent) => void)[] = [];
  private ingressFilter: ((event: MIDIMessageEvent) => boolean) | null = null;

  // Smart Latch
  public isSmartLatchActive = false;
  public isSequencerPlaying = false;
  private smartLatchMaxNotes: number = 4;
  private smartLatchReplace: boolean = true;
  private smartLatchFadeTime: number = 0;
  private latchedNotesByOutput: Map<string, { inputId: string, channel: number, note: number, velocity: number }[]> = new Map();

  private clockInterval: any = null;
  private clockExpectedTime: number = 0;
  private currentBpm: number = 120;
  private isPlayingClock: boolean = false;
  private _nextClockScheduleTime: number = 0;
  // @ts-ignore - pulse count for potential future sync features
  private clockPulseCount: number = 0;

  private lastSentMessages = new Map<string, { data: string, time: number }>();
  private globalSentHashes = new Map<string, number>(); // Global echo suppression
  private ingressCount = 0;
  private lastIngressReset = Date.now();
  private isThruThrottled = false;
  private globalChannel: number = 0;
  private splitConfig: SplitConfig | null = null;

  // Monitor log — plain array (not reactive), max 500 entries
  private _monitorSeq = 0;
  private _monitorBuffer: MidiMonitorEntry[] = [];
  private _monitorListeners: ((entry: MidiMonitorEntry) => void)[] = [];

  // Incoming clock BPM detection — ring buffer of up to 24 pulse timestamps
  private _incomingClockRing: number[] = [];
  private _smoothedIncomingBpm: number = 0;
  private _clockBpmListeners: ((bpm: number) => void)[] = [];

  // SysEx — requires re-requesting MIDI access with { sysex: true }
  private sysexEnabled = false;

  private static NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

  private broadcast(
    type: 'noteon' | 'noteoff' | 'cc' | 'pc' | 'pitchbend' | 'clock' | 'start' | 'stop' | 'allnotesoff',
    data: any,
    channel: number = 0,
    source: MidiSource = MidiSource.UI,
    skipDeviceId: string | null = null
  ) {
    if (!this.midiAccess) return;

    if (this.isSequencerPlaying && (type === 'noteon' || type === 'noteoff') && source === MidiSource.KEYBOARD) {
      return;
    }

    // Log outgoing message to monitor (one entry per broadcast call)
    if (type !== 'clock') {  // clock floods at 48+/sec — skip from monitor
      const { type: mType, decoded } = this._decodeOut(type, data, channel);
      this._appendMonitor({
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

    // Use a Set of IDs to avoid duplicate sends if multiple name matches occur
    const targetDeviceIds = new Set<string>();
    const skipDeviceName = skipDeviceId ? this.midiAccess.inputs.get(skipDeviceId)?.name : null;

    const targetsFromMatrix = this.routingMatrix.get(source) || new Set();
    const hasMappings = targetsFromMatrix.size > 0;

    this.midiAccess.outputs.forEach(outPort => {
      // 1. Matrix Match
      const isMatrixMatch = targetsFromMatrix.has(outPort.name);

      // 2. Broadcast Mode Match
      // Sequencer source should never broadcast, it must strictly follow performance mapping.
      // Other sources only broadcast if they don't have explicit performance mapping.
      const isBroadcastTarget = this.broadcastMode && (source !== MidiSource.SEQUENCER) && !hasMappings;

      if (!isMatrixMatch && !isBroadcastTarget) return;

      // 3. General MIDI Registry Matrix configuration check
      const config = this.routingConfig?.registrations[outPort.name];

      // The output device must be registered and enabled for output in the general MIDI matrix
      if (!config || !config.outEnabled) return;
      if (outPort.id === skipDeviceId || outPort.name === skipDeviceName) return;

      let shouldAdd = true;
      switch (type) {
        case 'noteon':
        case 'noteoff':
        case 'allnotesoff': shouldAdd = config.notes; break;
        case 'cc': shouldAdd = config.cc; break;
        case 'pc': shouldAdd = config.pc; break;
        case 'pitchbend': shouldAdd = true; break;
        case 'clock': shouldAdd = config.clock; break;
        case 'start':
        case 'stop': shouldAdd = config.transport; break;
      }

      if (shouldAdd) targetDeviceIds.add(outPort.id);
    });

    // Send to all unique targets
    targetDeviceIds.forEach(id => {
      const out = this.midiAccess?.outputs.get(id);
      if (!out) return;

      // Determine channel from name-based config
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

  get isReady(): boolean {
    return this.midiAccess !== null;
  }

  async init(): Promise<boolean> {
    if (this.midiAccess) return true;

    if (!navigator.requestMIDIAccess) {
      console.error("WebMIDI is not supported in this browser.");
      return false;
    }

    try {
      if ((window as any).SY_LOG) (window as any).SY_LOG("[MIDI] Requesting Access...");
      this.midiAccess = await navigator.requestMIDIAccess();
      if ((window as any).SY_LOG) (window as any).SY_LOG("[MIDI] Access Granted.");

      console.log("[MIDI] Access granted. Setting up onstatechange listener.");
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

      this.reScanInputs();
      this.loadRoutingMatrix();
      this.loadBroadcastMode();

      console.log("[MIDI] Service fully initialized and inputs attached.");
      return true;
    } catch (e) {
      console.error("[MIDI] Critical failure accessing MIDI devices:", e);
      if ((window as any).SY_LOG) (window as any).SY_LOG(`[MIDI] Access Failed: ${e.message}`);
      return false;
    }
  }

  public isSysExEnabled(): boolean { return this.sysexEnabled; }

  public async enableSysEx(): Promise<boolean> {
    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });
      this.sysexEnabled = true;
      this.reScanInputs();
      if ((window as any).SY_LOG) (window as any).SY_LOG('[MIDI] SysEx access granted.');
      return true;
    } catch (e: any) {
      if ((window as any).SY_LOG) (window as any).SY_LOG(`[MIDI] SysEx access denied: ${e?.message ?? e}`);
      return false;
    }
  }

  public disableSysEx(): void {
    this.sysexEnabled = false;
    if ((window as any).SY_LOG) (window as any).SY_LOG('[MIDI] SysEx disabled.');
  }

  reScanInputs() {
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

  setRoutingConfig(config: RoutingConfig) {
    this.routingConfig = config;
  }

  setGlobalChannel(channel: number) {
    this.globalChannel = channel;
  }

  getInputs(): MIDIInput[] {
    if (!this.midiAccess) return [];
    return Array.from(this.midiAccess.inputs.values());
  }

  setIngressFilter(fn: ((event: MIDIMessageEvent) => boolean) | null) {
    this.ingressFilter = fn;
  }

  // --- Smart Latch ---
  public setSmartLatchConfig(maxNotes: number, replace: boolean, fadeTime: number = 0) {
    this.smartLatchMaxNotes = maxNotes;
    this.smartLatchReplace = replace;
    this.smartLatchFadeTime = fadeTime;
    if ((window as any).SY_LOG) (window as any).SY_LOG(`[MIDI] Smart Latch Config: Max=${maxNotes}, Replace=${replace}, Fade=${fadeTime}ms`);
  }

  public async setSmartLatchActive(active: boolean) {
    if (this.isSmartLatchActive === active) return;
    this.isSmartLatchActive = active;
    if ((window as any).SY_LOG) (window as any).SY_LOG(`[MIDI] Smart Latch: ${active ? 'ENABLED' : 'DISABLED'}`);

    if (!active) {
      if (this.smartLatchFadeTime > 0) {
        await this.startFadeOut();
      } else {
        this.clearLatchedNotes();
      }
    }
  }

  private async startFadeOut() {
    const fadeMs = this.smartLatchFadeTime;
    const steps = 12;
    const interval = Math.max(20, fadeMs / steps);

    const outputChannels = new Map<string, Set<number>>();
    this.latchedNotesByOutput.forEach((notes, outId) => {
      const channels = new Set<number>();
      const outDevice = this.midiAccess?.outputs.get(outId);
      const outConfig = outDevice ? this.routingConfig?.registrations[outDevice.name] : null;

      notes.forEach(n => {
        let targetCh = -1;
        if (outConfig) {
          if (outConfig.isMulti) targetCh = this.globalChannel;
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
        const outDevice = this.midiAccess?.outputs.get(outId);
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
      const outDevice = this.midiAccess?.outputs.get(outId);
      if (outDevice) {
        channels.forEach(ch => {
          outDevice.send([0xB0 | (ch & 0x0f), 11, 127]);
        });
      }
    });
  }

  private clearLatchedNotes() {
    const now = Date.now();
    for (const [outId, notes] of this.latchedNotesByOutput.entries()) {
      const outDevice = this.midiAccess?.outputs.get(outId);
      if (outDevice) {
        const outConfig = this.routingConfig?.registrations[outDevice.name];
        if (outConfig) {
          notes.forEach(n => this.sendDirectNoteOff(outDevice, n, outConfig, now));

          const channels = new Set<number>();
          notes.forEach(n => {
            let targetCh = -1;
            if (outConfig.isMulti) targetCh = this.globalChannel;
            else if (outConfig.outChannel !== -1) targetCh = outConfig.outChannel;
            channels.add(targetCh !== -1 ? targetCh : n.channel);
          });

          channels.forEach(ch => {
            const statusCh = ch % 16;
            const messages = [
              [0xb0 + statusCh, 123, 0], // All Notes Off
              [0xb0 + statusCh, 64, 0]   // Sustain Off
            ];
            messages.forEach(msg => {
              this.globalSentHashes.set(msg.join(','), now);
              try { outDevice.send(msg); } catch (e) { }
            });
          });
        }
      }
    }
    this.latchedNotesByOutput.clear();
  }

  private sendDirectNoteOff(outDevice: any, n: { inputId: string, channel: number, note: number }, outConfig: any, now: number) {
    let targetCh = -1;
    if (outConfig.isMulti) targetCh = this.globalChannel;
    else if (outConfig.outChannel !== -1) targetCh = outConfig.outChannel;

    const finalCh = targetCh !== -1 ? targetCh : n.channel;
    const bytes = new Uint8Array([0x80 | (finalCh & 0x0f), n.note, 0]);
    try {
      this.lastSentMessages.set(outDevice.id, { data: bytes.join(','), time: now });
      this.globalSentHashes.set(bytes.join(','), now);
      outDevice.send(bytes);
    } catch (e) { }
  }
  // -------------------

  // --- Multi-Routing Actions ---

  private saveRoutingMatrix() {
    const data: Record<string, string[]> = {}
    this.routingMatrix.forEach((targets, source) => {
      data[source] = Array.from(targets)
    })
    localStorage.setItem(MIDI_ROUTING_KEY, JSON.stringify(data))
  }

  private loadRoutingMatrix() {
    try {
      const raw = localStorage.getItem(MIDI_ROUTING_KEY)
      if (!raw) return
      const data = JSON.parse(raw)
      Object.entries(data).forEach(([source, targets]) => {
        if (Array.isArray(targets)) {
          this.routingMatrix.set(source, new Set(targets as string[]))
        }
      })
    } catch (e) {
      console.error('Failed to load MIDI routing matrix', e)
    }
  }

  public setRouting(source: string, outputNames: string[]) {
    this.routingMatrix.set(source, new Set(outputNames))
    this.saveRoutingMatrix()
  }

  public toggleRouting(source: string, outputName: string) {
    const targets = this.routingMatrix.get(source) || new Set()
    if (targets.has(outputName)) {
      targets.delete(outputName)
    } else {
      targets.add(outputName)
    }
    this.routingMatrix.set(source, targets)
    this.saveRoutingMatrix()
  }

  public toggleBroadcastMode() {
    this.broadcastMode = !this.broadcastMode
    localStorage.setItem(MIDI_BROADCAST_KEY, JSON.stringify(this.broadcastMode))
  }

  private loadBroadcastMode() {
    const raw = localStorage.getItem(MIDI_BROADCAST_KEY)
    if (raw) this.broadcastMode = JSON.parse(raw) === true
  }

  getRouting(source: string): string[] {
    return Array.from(this.routingMatrix.get(source) || []);
  }

  setBroadcastMode(enabled: boolean) {
    this.broadcastMode = enabled;
  }

  getBroadcastMode(): boolean {
    return this.broadcastMode;
  }

  private handleIngress(event: MIDIMessageEvent) {
    if (!event.data || event.data.length === 0) return;
    const input = event.target as MIDIInput;
    const inputId = input?.id;
    const status = event.data[0];
    const now = Date.now();

    this.onRawListeners.forEach(l => l(event));

    if (this.ingressFilter && this.ingressFilter(event)) return;

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
      for (const [hash, time] of this.globalSentHashes.entries()) {
        if (time < threshold) this.globalSentHashes.delete(hash);
      }
    }

    if (this.isThruThrottled) return;

    // Block SysEx unless explicitly enabled (WebMIDI won't deliver it anyway without { sysex: true })
    if (status === 0xF0 && !this.sysexEnabled) return;

    // Hoist input-device lookup so it is available for all downstream checks
    const inputDevice = this.midiAccess?.inputs.get(inputId);
    const inConfig = inputDevice ? this.routingConfig?.registrations[inputDevice.name] : null;

    if (this.routingConfig) {
      if (status < 0xF0) {
        const msgChannel = status & 0x0f;
        if (inConfig && inConfig.inChannel !== -1 && inConfig.inChannel !== msgChannel) return;
      }
    }

    // Velocity gating and curve transform for incoming Note On messages
    let processedData: number[] | Uint8Array = event.data;
    const isNoteOn = (status & 0xf0) === 0x90;
    const isNoteOff = (status & 0xf0) === 0x80;
    if ((isNoteOn || isNoteOff) && event.data.length >= 3 && inConfig) {
      const rawVelocity = event.data[2];
      if (isNoteOn && rawVelocity > 0) {
        const min = inConfig.velocityMin ?? 0;
        const max = inConfig.velocityMax ?? 127;
        if (rawVelocity < min || rawVelocity > max) return;
        const mapped = this.applyVelocityCurve(rawVelocity, inConfig.velocityMap ?? 'linear');
        if (mapped !== rawVelocity) {
          const copy = new Uint8Array(event.data);
          copy[2] = mapped;
          processedData = copy;
        }
      }
    }

    // Echo suppression uses raw bytes (echoed message matches what was sent)
    const rawHash = event.data.join(',');
    const globalSentTime = this.globalSentHashes.get(rawHash);
    if (globalSentTime && now - globalSentTime < 300) return;

    const recent = this.lastSentMessages.get(inputId);
    if (recent && recent.data === `${inputId}:${rawHash}` && now - recent.time < 50) return;

    // Log to monitor (after echo suppression, before routing)
    {
      const deviceName = inputDevice?.name ?? 'Unknown';
      const { type: mType, channel: mCh, decoded } = this._decodeRaw(processedData as Uint8Array);
      this._appendMonitor({
        id: ++this._monitorSeq,
        timestamp: now,
        direction: 'in',
        device: deviceName,
        channel: mCh,
        type: mType,
        data: Array.from(processedData as Uint8Array),
        decoded,
      });
    }

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
        this.routeMessageToOutputs(processedData as Uint8Array, inputId, now);
      }
    }

    // receiveSyncIn: gate clock and transport from this input device
    const syncBlocked = inConfig && inConfig.receiveSyncIn === false;

    if (status === 0xFA) { if (!syncBlocked) this.onTransportListeners.forEach(l => l('start')); }
    else if (status === 0xFC) {
      if (!syncBlocked) this.onTransportListeners.forEach(l => l('stop'));
      // Reset ring buffer on transport stop so stale pulses don't corrupt next BPM reading
      this._incomingClockRing = [];
    }
    else if (status === 0xF8) {
      if (!syncBlocked) this.onTransportListeners.forEach(l => l('clock'));
      // Incoming BPM detection via ring buffer
      const ts = performance.now();
      // Reset if last pulse was more than 2 s ago (clock stopped and restarted)
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
        }
      }
    }
    else if (status < 0xF0) {
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

  private routeMessageToOutputs(data: Uint8Array, inputId: string, now: number) {
    if (!this.midiAccess) return;
    const status = data[0];
    const msgHash = data.join(',');
    const inputDevice = this.midiAccess.inputs.get(inputId);
    const inputName = inputDevice?.name || "";
    const targetsFromMatrix = inputName ? this.routingMatrix.get(inputName) : null;
    const isNote = (status & 0xf0) === 0x90 || (status & 0xf0) === 0x80;
    const isCC = (status & 0xf0) === 0xb0;

    this.midiAccess.outputs.forEach(outDevice => {
      const outConfig = this.routingConfig?.registrations[outDevice.name];
      const inConfig = inputDevice ? this.routingConfig?.registrations[inputDevice.name] : null;

      // Both input and output devices must be registered and enabled in the general MIDI matrix
      if (!outConfig || !outConfig.outEnabled || outDevice.id === inputId) return;
      // Per-device MIDI Thru gate (undefined treated as true for backward compat)
      if (outConfig.midiThru === false) return;
      if (!inConfig || !inConfig.inEnabled) return;

      // If the sequencer is playing, block notes only if the target is also the sequencer's target
      // This prevents double-triggering/audible notes on the sequencer's synth during transposition,
      // while allowing independent keyboards to play other mapped synthesizers normally.
      if (this.isSequencerPlaying && isNote) {
        const sequencerTargets = this.routingMatrix.get(MidiSource.SEQUENCER);
        if (sequencerTargets && sequencerTargets.has(outDevice.name)) {
          return;
        }
      }

      // MIDI Performance Matrix routing:
      // If a mapping exists in the performance matrix, use it strictly.
      // Otherwise, only fallback to broadcastMode if no mapping is specified.
      const isRoutedByMatrix = targetsFromMatrix ? targetsFromMatrix.has(outDevice.name) : false;
      const hasMappings = targetsFromMatrix && targetsFromMatrix.size > 0;
      const isRouted = hasMappings ? isRoutedByMatrix : (isRoutedByMatrix || this.broadcastMode);

      if (!isRouted) return;

      // Loop prevention check:
      // Prevent routing feedback loops if the normalized input and output names match,
      // EXCEPT when the user explicitly mapped them in the MIDI Performance Matrix.
      const normIn = inputName.toLowerCase().replace(/^(1-|2-|midi\s+|usb\s+)/i, '').trim();
      const normOut = outDevice.name.toLowerCase().replace(/^(1-|2-|midi\s+|usb\s+)/i, '').trim();
      if (normIn && normOut && normIn === normOut && !isRoutedByMatrix) return;

      if (isNote && !outConfig.notes) return;
      if (isCC && !outConfig.cc) return;
      if (status === 0xF8 && !outConfig.clock) return;
      if ((status === 0xFA || status === 0xFC) && !outConfig.transport) return;

      let bytes = data;
      let shouldForward = true;

      const isNoteOn = (status & 0xf0) === 0x90 && data[2] > 0;
      const isNoteOff = (status & 0xf0) === 0x80 || ((status & 0xf0) === 0x90 && data[2] === 0);

      if (this.isSmartLatchActive && (isNoteOn || isNoteOff)) {
        if (!outConfig.smartLatch) {
          if (isNoteOn && (window as any).SY_LOG) (window as any).SY_LOG(`[MIDI] Latch active but skipped for ${outDevice.name} (Device Lock is OFF)`);
        } else {
          const channel = status & 0x0f;
          const note = data[1];
          const velocity = data[2];

          let latched = this.latchedNotesByOutput.get(outDevice.id);
          if (!latched) {
            latched = [];
            this.latchedNotesByOutput.set(outDevice.id, latched);
          }

          if (isNoteOn) {
            const existingIdx = latched.findIndex(n => n.note === note && n.channel === channel);
            if (existingIdx !== -1) latched.splice(existingIdx, 1);

            latched.push({ inputId, channel, note, velocity });

            if (latched.length > this.smartLatchMaxNotes) {
              if (this.smartLatchReplace) {
                const oldest = latched.shift();
                if (oldest) {
                  if ((window as any).SY_LOG) (window as any).SY_LOG(`[MIDI] Latch FIFO: Replacing note ${oldest.note} with ${note}`);
                  this.sendDirectNoteOff(outDevice, oldest, outConfig, now);
                }
              } else {
                latched.pop();
                shouldForward = false;
                if ((window as any).SY_LOG) (window as any).SY_LOG(`[MIDI] Latch BLOCKED: Limit reached (${this.smartLatchMaxNotes}) and Replace is OFF`);
              }
            } else {
              if ((window as any).SY_LOG) (window as any).SY_LOG(`[MIDI] Latch: Holding note ${note} on ${outDevice.name}`);
            }
          } else if (isNoteOff) {
            const isLatched = latched.some(n => n.note === note && n.channel === channel);
            if (isLatched) {
              shouldForward = false; // Block release
            }
          }
        }
      }

      if (!shouldForward) return;

      try {
        this.lastSentMessages.set(outDevice.id, { data: msgHash, time: now });
        if (status < 0xF0) {
          let targetCh = -1;
          if (outConfig.isMulti) targetCh = this.globalChannel;
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
        this.globalSentHashes.set(bytes.join(','), now);
        outDevice.send(bytes);
      } catch (e) { }
    });
  }

  // ── Monitor public API ─────────────────────────────────────────────────────

  public addMonitorListener(cb: (entry: MidiMonitorEntry) => void): () => void {
    this._monitorListeners.push(cb);
    return () => { this._monitorListeners = this._monitorListeners.filter(l => l !== cb); };
  }

  public getMonitorBuffer(): MidiMonitorEntry[] {
    return this._monitorBuffer;
  }

  public clearMonitorBuffer(): void {
    this._monitorBuffer = [];
  }

  // ── Incoming clock BPM public API ──────────────────────────────────────────

  public addClockBpmListener(cb: (bpm: number) => void): () => void {
    this._clockBpmListeners.push(cb);
    return () => { this._clockBpmListeners = this._clockBpmListeners.filter(l => l !== cb); };
  }

  public getIncomingBpm(): number {
    return this._smoothedIncomingBpm;
  }

  // ── Monitor internals ──────────────────────────────────────────────────────

  private _noteName(n: number): string {
    return MidiService.NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);
  }

  private _decodeRaw(data: Uint8Array | number[]): { type: MidiMessageType; channel: number; decoded: string } {
    const status = data[0];
    const msgType = status & 0xf0;
    const ch = status & 0x0f;

    if (status === 0xF8) return { type: 'clock', channel: 0, decoded: 'Clock' };
    if (status === 0xFA) return { type: 'start', channel: 0, decoded: 'Transport START' };
    if (status === 0xFC) return { type: 'stop', channel: 0, decoded: 'Transport STOP' };
    if (status === 0xF0) {
      const hex = Array.from(data as Uint8Array).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      const preview = hex.length > 48 ? hex.substring(0, 48) + '…' : hex;
      return { type: 'sysex', channel: 0, decoded: `SysEx [${data.length}B]: ${preview}` };
    }

    switch (msgType) {
      case 0x90: {
        const vel = data[2], note = data[1];
        return vel > 0
          ? { type: 'noteon', channel: ch + 1, decoded: `Note ON  ${this._noteName(note)} (${note}) vel=${vel} ch=${ch + 1}` }
          : { type: 'noteoff', channel: ch + 1, decoded: `Note OFF ${this._noteName(note)} (${note}) ch=${ch + 1}` };
      }
      case 0x80:
        return { type: 'noteoff', channel: ch + 1, decoded: `Note OFF ${this._noteName(data[1])} (${data[1]}) ch=${ch + 1}` };
      case 0xb0:
        return { type: 'cc', channel: ch + 1, decoded: `CC ${data[1]} = ${data[2]} ch=${ch + 1}` };
      case 0xc0:
        return { type: 'pc', channel: ch + 1, decoded: `PC ${data[1] + 1} ch=${ch + 1}` };
      case 0xe0: {
        const pb = ((data[2] << 7) | data[1]) - 8192;
        return { type: 'pitchbend', channel: ch + 1, decoded: `Pitch Bend ${pb >= 0 ? '+' : ''}${pb} ch=${ch + 1}` };
      }
      default:
        return { type: 'other', channel: 0, decoded: `0x${status.toString(16).toUpperCase()}` };
    }
  }

  private _decodeOut(
    type: string, data: any, channel: number
  ): { type: MidiMessageType; decoded: string } {
    const ch = channel + 1;
    switch (type) {
      case 'noteon':     return { type: 'noteon',    decoded: `Note ON  ${this._noteName(data.note)} (${data.note}) vel=${data.velocity} ch=${ch}` };
      case 'noteoff':    return { type: 'noteoff',   decoded: `Note OFF ${this._noteName(data.note)} (${data.note}) ch=${ch}` };
      case 'cc':         return { type: 'cc',        decoded: `CC ${data.cc} = ${data.value} ch=${ch}` };
      case 'pc':         return { type: 'pc',        decoded: `PC ${data.program + 1} ch=${ch}` };
      case 'pitchbend':  return { type: 'pitchbend', decoded: `Pitch Bend ch=${ch}` };
      case 'clock':      return { type: 'clock',     decoded: 'Clock' };
      case 'start':      return { type: 'start',     decoded: 'Transport START' };
      case 'stop':       return { type: 'stop',      decoded: 'Transport STOP' };
      case 'allnotesoff':return { type: 'cc',        decoded: `All Notes OFF ch=${ch}` };
      default:           return { type: 'other',     decoded: type };
    }
  }

  private _appendMonitor(entry: MidiMonitorEntry): void {
    if (this._monitorBuffer.length >= 500) this._monitorBuffer.shift();
    this._monitorBuffer.push(entry);
    this._monitorListeners.forEach(l => l(entry));
  }

  // ── Split config ───────────────────────────────────────────────────────────

  public setSplitConfig(config: SplitConfig | null): void {
    this.splitConfig = config;
    if ((window as any).SY_LOG) (window as any).SY_LOG(
      config?.enabled
        ? `[MIDI] Keyboard Split ON at note ${config.splitNote} (${config.lowDevice} / ${config.highDevice})`
        : '[MIDI] Keyboard Split OFF'
    );
  }

  private applyVelocityCurve(velocity: number, map: string): number {
    if (map === 'fixed') return 64;
    let x = velocity / 127;
    if (map === 'exp') x = x * x;
    else if (map === 'log') x = Math.sqrt(x);
    return Math.max(1, Math.min(127, Math.round(x * 127)));
  }

  private sendDirectToOutputByName(
    deviceName: string,
    type: 'noteon' | 'noteoff',
    note: number,
    velocity: number,
    channel: number
  ): void {
    if (!this.midiAccess) return;
    const now = Date.now();
    this.midiAccess.outputs.forEach(out => {
      if (out.name !== deviceName) return;
      const config = this.routingConfig?.registrations[out.name];
      let targetCh = channel;
      if (config && !config.isMulti && config.outChannel !== -1) targetCh = config.outChannel;
      const statusCh = targetCh % 16;
      const status = type === 'noteon' ? 0x90 + statusCh : 0x80 + statusCh;
      const msg = [status, note & 0x7f, velocity & 0x7f];
      this.globalSentHashes.set(msg.join(','), now);
      try { out.send(msg); } catch (e) { }
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

  private handleIngressBound = this.handleIngress.bind(this);

  addRawListener(callback: (event: MIDIMessageEvent) => void) {
    this.onRawListeners.push(callback);
    return () => {
      this.onRawListeners = this.onRawListeners.filter(l => l !== callback);
    };
  }

  addGlobalNoteOnListener(callback: (note: number, velocity: number) => void) {
    this.globalNoteOnListeners.push(callback);
    return () => {
      this.globalNoteOnListeners = this.globalNoteOnListeners.filter(l => l !== callback);
    };
  }

  addCCListener(callback: (cc: number, val: number, chan: number, inputId?: string) => void) {
    this.onCCListeners.push(callback);
    return () => {
      this.onCCListeners = this.onCCListeners.filter(l => l !== callback);
    };
  }

  addNoteListener(callback: (type: 'on' | 'off', note: number, velocity: number, chan: number, inputId?: string) => void) {
    this.onNoteListeners.push(callback);
    return () => {
      this.onNoteListeners = this.onNoteListeners.filter(l => l !== callback);
    };
  }

  addPitchBendListener(callback: (val: number, chan: number, inputId?: string) => void) {
    this.onPitchBendListeners.push(callback);
    return () => {
      this.onPitchBendListeners = this.onPitchBendListeners.filter(l => l !== callback);
    };
  }

  addStateChangeListener(callback: (event: Event) => void) {
    this.onStateChangeListeners.push(callback);
    return () => {
      this.onStateChangeListeners = this.onStateChangeListeners.filter(l => l !== callback);
    };
  }

  addTransportListener(callback: (type: 'start' | 'stop' | 'clock') => void) {
    this.onTransportListeners.push(callback);
    return () => {
      this.onTransportListeners = this.onTransportListeners.filter(l => l !== callback);
    };
  }

  sendCC(cc: number, value: number, channel: number = 0, source: MidiSource = MidiSource.UI, skipDeviceId: string | null = null) {
    this.broadcast('cc', { cc, value }, channel, source, skipDeviceId);
  }

  sendProgramChange(program: number, channel: number = 0, source: MidiSource = MidiSource.UI) {
    this.broadcast('pc', { program }, channel, source);
  }

  sendNoteOn(note: number, velocity: number = 100, channel: number = 0, source: MidiSource = MidiSource.UI, skipDeviceId: string | null = null) {
    if (source === MidiSource.KEYBOARD && this.splitConfig?.enabled) {
      this.sendNoteSplit('noteon', note, velocity, channel);
      return;
    }
    this.broadcast('noteon', { note, velocity }, channel, source, skipDeviceId);
  }

  sendNoteOff(note: number, velocity: number = 0, channel: number = 0, source: MidiSource = MidiSource.UI, skipDeviceId: string | null = null) {
    if (source === MidiSource.KEYBOARD && this.splitConfig?.enabled) {
      this.sendNoteSplit('noteoff', note, velocity, channel);
      return;
    }
    this.broadcast('noteoff', { note, velocity }, channel, source, skipDeviceId);
  }

  /** Send a raw note directly to a specific output (or all outputs) bypassing routing matrix. */
  sendRawNote(outputId: string | null, type: 'noteon' | 'noteoff', note: number, velocity: number, channel: number): void {
    if (!this.midiAccess) return;
    const status = (type === 'noteon' ? 0x90 : 0x80) | (channel & 0xF);
    const msg = [status, note & 0x7F, velocity & 0x7F];
    const targets = outputId
      ? [this.midiAccess.outputs.get(outputId)].filter(Boolean) as MIDIOutput[]
      : Array.from(this.midiAccess.outputs.values());
    targets.forEach(out => { try { out.send(msg); } catch (e) {} });
  }

  allNotesOff(channel: number = 0) {
    this.broadcast('allnotesoff', {}, channel, MidiSource.UI);
    this.sendCC(120, 0, channel, MidiSource.UI);
    this.sendCC(64, 0, channel, MidiSource.UI);
  }

  panic() {
    if (this.midiAccess) {
      console.log("[MIDI] PANIC! Sending All Notes Off to all devices and channels.");
      const allOutputs = Array.from(this.midiAccess.outputs.values());
      allOutputs.forEach(out => {
        for (let ch = 0; ch < 16; ch++) {
          try {
            out.send([0xb0 + ch, 123, 0]);
            out.send([0xb0 + ch, 120, 0]);
            out.send([0xb0 + ch, 64, 0]);
          } catch (e) { }
        }
      });
    }
  }

  sendRawToDevice(deviceId: string, data: number[]) {
    const out = this.midiAccess?.outputs.get(deviceId);
    if (out) {
      try { out.send(data); } catch (e) { }
    }
  }

  cleanupDevice(deviceId: string) {
    const out = this.midiAccess?.outputs.get(deviceId);
    if (out) {
      const config = this.routingConfig?.registrations[out.name];
      const targetCh = (config && config.outChannel !== -1) ? config.outChannel : this.globalChannel;
      const statusCh = targetCh % 16;
      const messages = [
        [0xb0 + statusCh, 123, 0],
        [0xb0 + statusCh, 64, 0]
      ];
      messages.forEach(msg => {
        this.globalSentHashes.set(msg.join(','), Date.now());
        try { out.send(msg); } catch (e) { }
      });
    }
  }

  sendPitchBend(value: number, channel: number = 0, source: MidiSource = MidiSource.UI, skipDeviceId: string | null = null) {
    const lsb = value & 0x7F;
    const msb = (value >> 7) & 0x7F;
    this.broadcast('pitchbend', { lsb, msb }, channel, source, skipDeviceId);
  }

  sendNRPN(nrpnLsb: number, value: number, channel: number = 0, source: MidiSource = MidiSource.UI) {
    const statusCh = channel % 16;
    if (this.routingConfig) {
      const targetsFromMatrix = this.routingMatrix.get(source) || new Set();

      Object.entries(this.routingConfig.registrations).forEach(([name, config]) => {
        if (config.outEnabled && config.cc) {
          const allOutputs = Array.from(this.midiAccess?.outputs.values() || []);
          const ports = allOutputs.filter(p => {
            return p.name === name && (this.broadcastMode || targetsFromMatrix.has(p.name));
          });

          ports.forEach(out => {
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

  sendAllCCs(ccMap: Record<number, number>, channel: number = 0, nrpnCCs: number[] = [], source: MidiSource = MidiSource.UI) {
    Object.entries(ccMap).forEach(([cc, val]) => {
      const ccNum = parseInt(cc);
      if (nrpnCCs.includes(ccNum)) {
        this.sendNRPN(ccNum, val, channel, source);
      } else {
        this.sendCC(ccNum, val, channel, source);
      }
    });
  }

  setBpm(bpm: number) {
    this.currentBpm = bpm;
    if (this.clockInterval) this.startClock();
  }

  startClock() {
    this.stopClock();
    if (!this.currentBpm || this.currentBpm < 1) return;
    this.isPlayingClock = true;

    // Lookahead scheduler: pre-schedule pulses 100ms ahead using WebMIDI timestamps
    // so clock messages fire on time even when the JS thread is busy (e.g. preset changes).
    this._nextClockScheduleTime = performance.now();

    const scheduler = () => {
      if (!this.isPlayingClock) return;
      const intervalMs = 60000 / (this.currentBpm * 24);
      const until = performance.now() + 100;

      while (this._nextClockScheduleTime < until) {
        const t = this._nextClockScheduleTime;
        if (this.midiAccess) {
          this.midiAccess.outputs.forEach(outPort => {
            const config = this.routingConfig?.registrations[outPort.name];
            if (config?.outEnabled && config?.clock) {
              try { outPort.send([0xF8], t); } catch (e) {}
            }
          });
        }
        this._nextClockScheduleTime += intervalMs;
      }

      this.clockInterval = window.setTimeout(scheduler, 50);
    };

    scheduler();
  }

  stopClock() {
    if (this.clockInterval !== null) {
      window.clearTimeout(this.clockInterval);
      this.clockInterval = null;
    }
    this.isPlayingClock = false;
    // Cancel any pre-scheduled clock pulses still in the hardware output queue
    if (this.midiAccess) {
      this.midiAccess.outputs.forEach(outPort => {
        try { outPort.clear?.(); } catch (e) {}
      });
    }
  }

  sendStart() {
    this.broadcast('stop', {}, 0, MidiSource.TRANSPORT);
    setTimeout(() => {
      this.broadcast('start', {}, 0, MidiSource.TRANSPORT);
      this.startClock();
    }, 10);
  }

  sendStop() {
    this.stopClock();
    this.broadcast('stop', {}, 0, MidiSource.TRANSPORT);
  }
}

export const midiService = new MidiService();