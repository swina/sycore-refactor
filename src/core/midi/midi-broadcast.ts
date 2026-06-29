/**
 * midi-broadcast.ts — Pure MIDI encoding/decoding utilities.
 *
 * Zero state, no side-effects. Used by the facade and all sub-modules.
 */

import type { MidiMessageType } from '@/types/midi';

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

/** Convert a MIDI note number to its note-name string (e.g. 60 → 'C3') */
export function noteName(n: number): string {
  return NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);
}

/** Decode an incoming raw MIDI byte array into a human-readable entry */
export function decodeRaw(
  data: Uint8Array | number[]
): { type: MidiMessageType; channel: number; decoded: string } {
  const status = data[0];
  const msgType = status & 0xf0;
  const ch = status & 0x0f;

  if (status === 0xF8) return { type: 'clock', channel: 0, decoded: 'Clock' };
  if (status === 0xFA) return { type: 'start', channel: 0, decoded: 'Transport START' };
  if (status === 0xFC) return { type: 'stop', channel: 0, decoded: 'Transport STOP' };
  if (status === 0xF0) {
    const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    const preview = hex.length > 48 ? hex.substring(0, 48) + '…' : hex;
    return { type: 'sysex', channel: 0, decoded: `SysEx [${data.length}B]: ${preview}` };
  }

  switch (msgType) {
    case 0x90: {
      const vel = data[2], note = data[1];
      return vel > 0
        ? { type: 'noteon', channel: ch + 1, decoded: `Note ON  ${noteName(note)} (${note}) vel=${vel} ch=${ch + 1}` }
        : { type: 'noteoff', channel: ch + 1, decoded: `Note OFF ${noteName(note)} (${note}) ch=${ch + 1}` };
    }
    case 0x80:
      return { type: 'noteoff', channel: ch + 1, decoded: `Note OFF ${noteName(data[1])} (${data[1]}) ch=${ch + 1}` };
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

/** Decode an outgoing message parameters into a human-readable entry */
export function decodeOut(
  type: string, data: any, channel: number
): { type: MidiMessageType; decoded: string } {
  const ch = channel + 1;
  switch (type) {
    case 'noteon':     return { type: 'noteon',    decoded: `Note ON  ${noteName(data.note)} (${data.note}) vel=${data.velocity} ch=${ch}` };
    case 'noteoff':    return { type: 'noteoff',   decoded: `Note OFF ${noteName(data.note)} (${data.note}) ch=${ch}` };
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

/** Apply velocity curve transformation */
export function applyVelocityCurve(velocity: number, map: string): number {
  if (map === 'fixed') return 64;
  let x = velocity / 127;
  if (map === 'exp') x = x * x;
  else if (map === 'log') x = Math.sqrt(x);
  return Math.max(1, Math.min(127, Math.round(x * 127)));
}

/** Encode a note status byte from type + channel */
export function noteStatusByte(type: 'noteon' | 'noteoff', channel: number): number {
  return (type === 'noteon' ? 0x90 : 0x80) | (channel & 0x0F);
}