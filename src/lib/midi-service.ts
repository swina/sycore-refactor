/**
 * MIDI Service per gestire l'accesso WebMIDI e l'invio di messaggi CC
 */

export class MidiService {
  private midiAccess: MIDIAccess | null = null;
  private output: MIDIOutput | null = null;
  private keyboardInput: MIDIInput | null = null;
  private controlInput: MIDIInput | null = null;

  // Stored IDs so we can re-attach after device reconnect
  private keyboardInputId: string | null = null;
  private controlInputId: string | null = null;

  private onCCListeners: ((cc: number, val: number, chan: number) => void)[] = [];
  private onNoteListeners: ((type: 'on' | 'off', note: number, velocity: number, chan: number) => void)[] = [];
  private onPitchBendListeners: ((val: number, chan: number) => void)[] = [];
  private onStateChangeListeners: ((event: Event) => void)[] = [];

  private clockInterval: number | null = null;
  private currentBpm: number = 120;
  private isPlayingClock: boolean = false;

  async init(): Promise<boolean> {
    if (!navigator.requestMIDIAccess) {
      console.error("WebMIDI is not supported in this browser.");
      return false;
    }

    try {
      try {
        this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });
      } catch (e) {
        console.warn("Failed to get SysEx access, falling back to normal MIDI.");
        this.midiAccess = await navigator.requestMIDIAccess();
      }

      this.midiAccess.onstatechange = (event) => {
        const port = (event as MIDIConnectionEvent).port;
        // Re-attach listeners to reconnected inputs
        if (port.type === 'input' && port.state === 'connected') {
          const input = port as MIDIInput;
          if (this.keyboardInputId === input.id) {
            this.keyboardInput = input;
            this.keyboardInput.onmidimessage = this.handleMessage.bind(this);
          }
          if (this.controlInputId === input.id && this.controlInputId !== this.keyboardInputId) {
            this.controlInput = input;
            this.controlInput.onmidimessage = this.handleMessage.bind(this);
          }
        }
        this.onStateChangeListeners.forEach(l => l(event));
      };

      return true;
    } catch (e) {
      console.error("Failed to access MIDI devices:", e);
      return false;
    }
  }

  getOutputs(): MIDIOutput[] {
    if (!this.midiAccess) return [];
    return Array.from(this.midiAccess.outputs.values());
  }

  getInputs(): MIDIInput[] {
    if (!this.midiAccess) return [];
    return Array.from(this.midiAccess.inputs.values());
  }

  setOutput(id: string) {
    if (!this.midiAccess) return;
    this.output = this.midiAccess.outputs.get(id) || null;
  }

  private onRawListeners: ((event: MIDIMessageEvent) => void)[] = [];

  // Experimental Multiple Input / Thru
  private experimentalInputs: Map<string, MIDIInput> = new Map();
  private experimentalThruOutput: MIDIOutput | null = null;
  private experimentalNotesOnly: boolean = true;
  private experimentalThruOutputId: string | null = null;

  addExperimentalInput(id: string) {
    if (!this.midiAccess) return;
    const input = this.midiAccess.inputs.get(id);
    if (input) {
      input.onmidimessage = this.handleExperimentalMessage.bind(this);
      this.experimentalInputs.set(id, input);
    }
  }

  removeExperimentalInput(id: string) {
    const input = this.experimentalInputs.get(id);
    if (input) {
      input.onmidimessage = null;
      this.experimentalInputs.delete(id);
    }
  }

  getExperimentalInputs(): string[] {
    return Array.from(this.experimentalInputs.keys());
  }

  setExperimentalThruOutput(id: string | null) {
    this.experimentalThruOutputId = id;
    if (!this.midiAccess) return;
    if (id) {
      this.experimentalThruOutput = this.midiAccess.outputs.get(id) || null;
    } else {
      this.experimentalThruOutput = null;
    }
  }

  getExperimentalThruOutputId(): string | null {
    return this.experimentalThruOutputId;
  }

  setExperimentalNotesOnly(notesOnly: boolean) {
    this.experimentalNotesOnly = notesOnly;
  }

  getExperimentalNotesOnly(): boolean {
    return this.experimentalNotesOnly;
  }

  private handleExperimentalMessage(event: MIDIMessageEvent) {
    // 1. Pass to normal message handler so the app gets it
    this.handleMessage(event);

    // 2. MIDI THRU Logic
    if (this.experimentalThruOutput && event.data && event.data.length > 0) {
      const status = event.data[0];
      const type = status & 0xf0;

      if (this.experimentalNotesOnly) {
         if (type === 0x90 || type === 0x80) { // Note On / Note Off
            this.experimentalThruOutput.send(event.data);
         }
      } else {
         this.experimentalThruOutput.send(event.data);
      }
    }
  }

  private handleMessage(event: MIDIMessageEvent) {
    this.onRawListeners.forEach(l => l(event));

    if (!event.data || event.data.length === 0) return;

    const status = event.data[0];

    // Ignore Real-Time Messages (0xF8 - 0xFF) to prevent flooding logs
    if (status >= 0xF8) return;

    const type = status & 0xf0;
    const channel = status & 0x0f;

    if (type === 0xb0) { // Control Change
      if (event.data.length < 3) return;
      const data1 = event.data[1];
      const data2 = event.data[2];
      this.onCCListeners.forEach(l => l(data1, data2, channel));
    } else if (type === 0x90) { // Note On
      if (event.data.length < 3) return;
      this.onNoteListeners.forEach(l => l('on', event.data[1], event.data[2], channel));
    } else if (type === 0x80) { // Note Off
      if (event.data.length < 3) return;
      this.onNoteListeners.forEach(l => l('off', event.data[1], event.data[2], channel));
    } else if (type === 0xe0) { // Pitch Bend
      if (event.data.length < 3) return;
      const value = (event.data[2] << 7) | event.data[1];
      this.onPitchBendListeners.forEach(l => l(value, channel));
    }
  }

  setControlInput(id: string) {
    if (!this.midiAccess) return;

    if (this.controlInput && this.controlInput !== this.keyboardInput) {
      this.controlInput.onmidimessage = null;
    }

    this.controlInputId = id;
    this.controlInput = this.midiAccess.inputs.get(id) || null;
    if (this.controlInput) {
      this.controlInput.onmidimessage = this.handleMessage.bind(this);
    }
  }

  setKeyboardInput(id: string) {
    if (!this.midiAccess) return;

    if (this.keyboardInput && this.keyboardInput !== this.controlInput) {
      this.keyboardInput.onmidimessage = null;
    }

    this.keyboardInputId = id;
    this.keyboardInput = this.midiAccess.inputs.get(id) || null;
    if (this.keyboardInput) {
      this.keyboardInput.onmidimessage = this.handleMessage.bind(this);
    }
  }

  addRawListener(callback: (event: MIDIMessageEvent) => void) {
    this.onRawListeners.push(callback);
    return () => {
      this.onRawListeners = this.onRawListeners.filter(l => l !== callback);
    };
  }

  addCCListener(callback: (cc: number, val: number, chan: number) => void) {
    this.onCCListeners.push(callback);
    return () => {
      this.onCCListeners = this.onCCListeners.filter(l => l !== callback);
    };
  }

  addNoteListener(callback: (type: 'on' | 'off', note: number, velocity: number, chan: number) => void) {
    this.onNoteListeners.push(callback);
    return () => {
      this.onNoteListeners = this.onNoteListeners.filter(l => l !== callback);
    };
  }

  addPitchBendListener(callback: (val: number, chan: number) => void) {
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

  sendCC(cc: number, value: number, channel: number = 0) {
    if (!this.output) return;

    // Status byte for CC on channel n: 0xB0 + channel
    const statusByte = 0xb0 + (channel % 16);
    this.output.send([statusByte, cc, value]);
  }

  sendNoteOn(note: number, velocity: number = 100, channel: number = 0) {
    if (!this.output) return;
    const statusByte = 0x90 + (channel % 16);
    this.output.send([statusByte, note, velocity]);
  }

  sendNoteOff(note: number, velocity: number = 0, channel: number = 0) {
    if (!this.output) return;
    const statusByte = 0x80 + (channel % 16);
    this.output.send([statusByte, note, velocity]);
  }

  allNotesOff(channel: number = 0) {
    if (!this.output) return;
    const statusByte = 0xb0 + (channel % 16);
    this.output.send([statusByte, 123, 0]);
    this.output.send([statusByte, 120, 0]);
    this.output.send([statusByte, 64, 0]);
  }

  sendPitchBend(value: number, channel: number = 0) {
    if (!this.output) return;
    // Value is 0-16383. Split into 7-bit LSB and MSB.
    const lsb = value & 0x7F;
    const msb = (value >> 7) & 0x7F;
    const statusByte = 0xE0 + (channel % 16);
    this.output.send([statusByte, lsb, msb]);
  }

  /**
   * Send an NRPN message. nrpnLsb is the parameter number (same as the CC number
   * it replaces). value is the 0-127 CC value, scaled to 0-255 for full NRPN resolution.
   * Sequence: CC99=0 (MSB), CC98=nrpnLsb (LSB), CC6=valueMsb, CC38=valueLsb
   */
  sendNRPN(nrpnLsb: number, value: number, channel: number = 0) {
    if (!this.output) return;
    const nrpnValue = Math.round(Math.min(255, Math.max(0, value)) * 2); // 0-127 → 0-254
    const valueMsb = (nrpnValue >> 7) & 0x7f;
    const valueLsb = nrpnValue & 0x7f;
    const status = 0xb0 + (channel % 16);
    this.output.send([status, 99, 0]);         // NRPN MSB = 0
    this.output.send([status, 98, nrpnLsb]);   // NRPN LSB = parameter
    this.output.send([status, 6, valueMsb]);   // Data Entry MSB
    this.output.send([status, 38, valueLsb]);  // Data Entry LSB
  }

  sendAllCCs(ccMap: Record<number, number>, channel: number = 0, nrpnCCs?: Set<number>) {
    if (!this.output) return;

    Object.entries(ccMap).forEach(([cc, val]) => {
      const ccNum = parseInt(cc);
      if (nrpnCCs?.has(ccNum)) {
        this.sendNRPN(ccNum, val, channel);
      } else {
        this.sendCC(ccNum, val, channel);
      }
    });
  }

  // MIDI Clock functions
  setBpm(bpm: number) {
    this.currentBpm = bpm;
    // If running, restart the interval with new tempo
    if (this.clockInterval !== null) {
      this.startClock();
    }
  }

  startClock() {
    this.stopClock();
    const intervalMs = 60000 / (this.currentBpm * 24);

    this.clockInterval = window.setInterval(() => {
      if (this.output) {
        this.output.send([0xF8]); // MIDI Timing Clock
      }
    }, intervalMs);
  }

  stopClock() {
    if (this.clockInterval !== null) {
      window.clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
  }

  sendStart() {
    if (this.output) this.output.send([0xFA]); // Start
    this.startClock();
  }

  sendStop() {
    if (this.output) this.output.send([0xFC]); // Stop
    this.stopClock();
  }
}

export const midiService = new MidiService();
