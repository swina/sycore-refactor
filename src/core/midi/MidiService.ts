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
}

export interface RoutingConfig {
  registrations: Record<string, DeviceRegistration>;
  globalThruEnabled: boolean;
  thruFilters: { notes: boolean; cc: boolean };
}

export enum MidiSource {
  SEQUENCER = 'SEQUENCER',
  KEYBOARD = 'KEYBOARD',
  ARP = 'ARP',
  UI = 'UI'
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
  private broadcastMode: boolean = false;

  // Multi-Output Routing Matrix
  private routingMatrix: Map<MidiSource, Set<string>> = new Map([
    [MidiSource.SEQUENCER, new Set()],
    [MidiSource.KEYBOARD, new Set()],
    [MidiSource.ARP, new Set()],
    [MidiSource.UI, new Set()],
  ]);

  private onCCListeners: ((cc: number, val: number, chan: number, inputId?: string) => void)[] = [];
  private onNoteListeners: ((type: 'on' | 'off', note: number, velocity: number, chan: number, inputId?: string) => void)[] = [];
  private onPitchBendListeners: ((val: number, chan: number, inputId?: string) => void)[] = [];
  private onStateChangeListeners: ((event: Event) => void)[] = [];
  private globalNoteOnListeners: ((note: number, velocity: number) => void)[] = [];
  private onTransportListeners: ((type: 'start' | 'stop' | 'clock') => void)[] = [];
  private onRawListeners: ((event: MIDIMessageEvent) => void)[] = [];
  private ingressFilter: ((event: MIDIMessageEvent) => boolean) | null = null;

  private clockInterval: number | null = null;
  private currentBpm: number = 120;
  private isPlayingClock: boolean = false;
  // @ts-ignore - pulse count for potential future sync features
  private clockPulseCount: number = 0;

  private lastSentMessages = new Map<string, { data: string, time: number }>();
  private globalSentHashes = new Map<string, number>(); // Global echo suppression
  private ingressCount = 0;
  private lastIngressReset = Date.now();
  private isThruThrottled = false;
  private globalChannel: number = 0;

  private broadcast(
    type: 'noteon' | 'noteoff' | 'cc' | 'pc' | 'pitchbend' | 'clock' | 'start' | 'stop' | 'allnotesoff',
    data: any,
    channel: number = 0,
    source: MidiSource = MidiSource.UI,
    skipDeviceId: string | null = null
  ) {
    if (!this.midiAccess) return;

    // Use a Set of IDs to avoid duplicate sends if multiple name matches occur
    const targetDeviceIds = new Set<string>();
    const skipDeviceName = skipDeviceId ? this.midiAccess.inputs.get(skipDeviceId)?.name : null;

    const targetsFromMatrix = this.routingMatrix.get(source) || new Set();

    this.midiAccess.outputs.forEach(outPort => {
      // 1. Matrix Match (Highest Priority - Bypass legacy outEnabled if explicitly selected)
      const isMatrixMatch = targetsFromMatrix.has(outPort.id);
      
      // 2. Broadcast Mode Match
      const isBroadcastTarget = this.broadcastMode;

      if (!isMatrixMatch && !isBroadcastTarget) return;

      // 3. Legacy Filters (Only applied to Broadcast or if config exists)
      const config = this.routingConfig?.registrations[outPort.name];
      
      // If it's a matrix match, we allow it even without config, 
      // but we still respect the notes/cc filters IF a config exists.
      if (isBroadcastTarget && (!config || !config.outEnabled)) return;
      if (outPort.id === skipDeviceId || outPort.name === skipDeviceName) return;

      let shouldAdd = true; // Default to true for matrix matches without config
      if (config) {
        switch (type) {
          case 'noteon':
          case 'noteoff':
          case 'allnotesoff': shouldAdd = config.notes; break;
          case 'cc':        shouldAdd = config.cc; break;
          case 'pc':        shouldAdd = config.pc; break;
          case 'pitchbend': shouldAdd = true; break; 
          case 'clock':     shouldAdd = config.clock; break;
          case 'start':
          case 'stop':      shouldAdd = config.transport; break;
        }
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
        case 'noteon':      status = 0x90 + statusCh; bytes = [data.note, data.velocity]; break;
        case 'noteoff':     status = 0x80 + statusCh; bytes = [data.note, data.velocity]; break;
        case 'cc':          status = 0xb0 + statusCh; bytes = [data.cc, data.value]; break;
        case 'pc':          status = 0xc0 + statusCh; bytes = [data.program]; break;
        case 'pitchbend':   status = 0xe0 + statusCh; bytes = [data.lsb, data.msb]; break;
        case 'allnotesoff': status = 0xb0 + statusCh; bytes = [123, 0]; break;
        case 'clock':       status = 0xF8; break;
        case 'start':       status = 0xFA; break;
        case 'stop':        status = 0xFC; break;
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
          this.routingMatrix.set(source as MidiSource, new Set(targets as string[]))
        }
      })
    } catch (e) {
      console.error('Failed to load MIDI routing matrix', e)
    }
  }

  public setRouting(source: MidiSource, outputIds: string[]) {
    this.routingMatrix.set(source, new Set(outputIds))
    this.saveRoutingMatrix()
  }

  public toggleRouting(source: MidiSource, outputId: string) {
    const targets = this.routingMatrix.get(source) || new Set()
    if (targets.has(outputId)) {
      targets.delete(outputId)
    } else {
      targets.add(outputId)
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

  getRouting(source: MidiSource): string[] {
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

    if (this.routingConfig) {
      const inputDevice = this.midiAccess?.inputs.get(inputId);
      const config = inputDevice ? this.routingConfig.registrations[inputDevice.name] : null;
      if (status < 0xF0) {
        const msgChannel = status & 0x0f;
        if (config && config.inChannel !== -1 && config.inChannel !== msgChannel) return;
      }
    }

    const msgHash = event.data.join(',');
    const globalSentTime = this.globalSentHashes.get(msgHash);
    if (globalSentTime && now - globalSentTime < 300) return;

    const recent = this.lastSentMessages.get(inputId);
    if (recent && recent.data === `${inputId}:${msgHash}` && now - recent.time < 50) return;

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
        const inputDevice = this.midiAccess?.inputs.get(inputId);
        const inputName = inputDevice?.name || "";

        this.midiAccess.outputs.forEach(outDevice => {
          const outConfig = this.routingConfig?.registrations[outDevice.name];
          const inConfig = inputDevice ? this.routingConfig?.registrations[inputDevice.name] : null;

          if (!outConfig || !outConfig.outEnabled || outDevice.id === inputId) return;
          if (inConfig && !inConfig.inEnabled) return; 

          const normIn = inputName.toLowerCase().replace(/^(1-|2-|midi\s+|usb\s+)/i, '').trim();
          const normOut = outDevice.name.toLowerCase().replace(/^(1-|2-|midi\s+|usb\s+)/i, '').trim();
          if (normIn && normOut && normIn === normOut) return;

          if (isNote && !outConfig.notes) return;
          if (isCC && !outConfig.cc) return;
          if (status === 0xF8 && !outConfig.clock) return;
          if ((status === 0xFA || status === 0xFC) && !outConfig.transport) return;

          try {
            this.lastSentMessages.set(outDevice.id, { data: msgHash, time: now });
            let bytes = event.data;
            if (status < 0xF0) {
              let targetCh = -1;
              if (outConfig.isMulti) targetCh = this.globalChannel;
              else if (outConfig.outChannel !== -1) targetCh = outConfig.outChannel;
              if (targetCh !== -1) {
                const newStatus = (status & 0xf0) | (targetCh & 0x0f);
                bytes = new Uint8Array([newStatus, event.data[1], event.data[2]]);
              }
            }
            this.globalSentHashes.set(bytes.join(','), now);
            outDevice.send(bytes);
          } catch (e) {}
        });
      }
    }
    
    if (status === 0xFA) this.onTransportListeners.forEach(l => l('start'));
    else if (status === 0xFC) this.onTransportListeners.forEach(l => l('stop'));
    else if (status === 0xF8) this.onTransportListeners.forEach(l => l('clock'));
    else if (status < 0xF0) {
      const type = status & 0xf0;
      const channel = status & 0x0f;
      if (type === 0x90 || type === 0x80) {
        const note = event.data[1];
        const velocity = event.data[2];
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
    this.broadcast('noteon', { note, velocity }, channel, source, skipDeviceId);
  }

  sendNoteOff(note: number, velocity: number = 0, channel: number = 0, source: MidiSource = MidiSource.UI, skipDeviceId: string | null = null) {
    this.broadcast('noteoff', { note, velocity }, channel, source, skipDeviceId);
  }

  allNotesOff(channel: number = 0) {
    this.broadcast('allnotesoff', {}, channel, MidiSource.UI);
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
          } catch (e) {}
        }
      });
    }
  }

  sendRawToDevice(deviceId: string, data: number[]) {
    const out = this.midiAccess?.outputs.get(deviceId);
    if (out) {
      try { out.send(data); } catch (e) {}
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
        try { out.send(msg); } catch (e) {}
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
             return p.name === name && (this.broadcastMode || targetsFromMatrix.has(p.id));
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
    const intervalMs = 60000 / (this.currentBpm * 24);
    const sendPulse = () => this.broadcast('clock', {}, 0, MidiSource.UI);
    sendPulse();
    this.clockInterval = window.setInterval(sendPulse, intervalMs);
  }

  stopClock() {
    if (this.clockInterval !== null) {
      window.clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
    this.isPlayingClock = false;
  }

  sendStart() {
    this.broadcast('stop', {}, 0, MidiSource.UI);
    setTimeout(() => {
      this.broadcast('start', {}, 0, MidiSource.UI);
      this.startClock();
    }, 10);
  }

  sendStop() {
    this.stopClock();
    this.broadcast('stop', {}, 0, MidiSource.UI);
  }
}

export const midiService = new MidiService();