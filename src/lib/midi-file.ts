export interface CapturedNote {
  pitch:     number;   // 0–127
  velocity:  number;   // 1–127
  channel:   number;   // 0–15
  startTime: number;   // Date.now() ms when note-on fired
  duration:  number;   // ms (0 while note is still held)
}

// ── Parsed MIDI file types ──────────────────────────────────────

export interface MidiImportNote {
  noteNumber: number;
  velocity:   number;
  startTick:  number;
  duration:   number;     // in ticks
}

export interface MidiImportTrack {
  name:  string;
  notes: MidiImportNote[];
}

export interface MidiImportResult {
  tracks:       MidiImportTrack[];
  bpm:          number;
  ticksPerBeat: number;
}

// ── Parse a standard MIDI file (.mid) ───────────────────────────
// Extracts note events grouped by track, with track names and BPM.
// Only chord/notes events are included — CC, pitch bend, etc. are discarded.

import { parseMidi } from 'midi-file'

export function parseMidiFile(data: Uint8Array): MidiImportResult {
  const midiData = parseMidi(data)

  let bpm = 120
  const ticksPerBeat = midiData.header.ticksPerBeat ?? 480

  const tracks: MidiImportTrack[] = midiData.tracks.map((events, _trackIdx) => {
    let trackName = `Track ${_trackIdx + 1}`
    const rawNotes: { noteNumber: number; velocity: number; startTick: number; channel: number }[] = []
    const noteOnMap = new Map<string, { startTick: number; velocity: number }>()
    let absoluteTick = 0

    for (const ev of events) {
      absoluteTick += ev.deltaTime

      if ((ev as any).meta) {
        if ((ev as any).type === 'trackName') {
          trackName = (ev as any).text ?? trackName
        }
        if ((ev as any).type === 'setTempo') {
          bpm = Math.round(60_000_000 / (ev as any).microsecondsPerBeat)
        }
        continue
      }

      if (ev.type === 'noteOn' && ev.velocity > 0) {
        const key = `${ev.noteNumber}-${ev.channel}`
        noteOnMap.set(key, { startTick: absoluteTick, velocity: ev.velocity })
      } else if (ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) {
        const key = `${ev.noteNumber}-${ev.channel}`
        const on = noteOnMap.get(key)
        if (on) {
          noteOnMap.delete(key)
          rawNotes.push({
            noteNumber: ev.noteNumber,
            velocity: on.velocity,
            startTick: on.startTick,
            channel: ev.channel,
          })
        }
      }
    }

    // Build chord groups: notes that start on the same tick
    const tickGroups = new Map<number, MidiImportNote[]>()
    for (const n of rawNotes) {
      if (!tickGroups.has(n.startTick)) tickGroups.set(n.startTick, [])
      tickGroups.get(n.startTick)!.push({
        noteNumber: n.noteNumber,
        velocity: n.velocity,
        startTick: n.startTick,
        duration: n.startTick,
      })
    }

    const notes: MidiImportNote[] = []
    for (const [tick, group] of tickGroups) {
      for (const n of group) {
        notes.push(n)
      }
    }
    notes.sort((a, b) => a.startTick - b.startTick)

    return { name: trackName, notes }
  })

  return { tracks, bpm, ticksPerBeat }
}

// ── MIDI variable-length encoding ───────────────────────────────
function varLen(n: number): number[] {
  if (n < 0x80) return [n];
  const out: number[] = [n & 0x7F];
  n >>>= 7;
  while (n) { out.unshift((n & 0x7F) | 0x80); n >>>= 7; }
  return out;
}

// ── Build standard MIDI file (format 0) ─────────────────────────
export function buildMidiFile(notes: CapturedNote[], bpm = 120): Uint8Array {
  if (!notes.length) return new Uint8Array(0);
  const tpb   = 480;
  const uspb  = Math.round(60_000_000 / bpm);
  const msPt  = (uspb / 1000) / tpb;

  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);
  const t0     = sorted[0].startTime;

  const evs: { tick: number; b: number[] }[] = [];
  for (const n of sorted) {
    const st = Math.round((n.startTime - t0) / msPt);
    const et = Math.round((n.startTime - t0 + Math.max(n.duration, 50)) / msPt);
    evs.push({ tick: st, b: [0x90 | (n.channel & 0xF), n.pitch & 0x7F, n.velocity & 0x7F] });
    evs.push({ tick: et, b: [0x80 | (n.channel & 0xF), n.pitch & 0x7F, 0] });
  }
  evs.sort((a, b) => a.tick - b.tick);

  const tr: number[] = [];
  // Tempo meta event
  tr.push(...varLen(0), 0xFF, 0x51, 0x03,
    (uspb >> 16) & 0xFF, (uspb >> 8) & 0xFF, uspb & 0xFF);
  let prev = 0;
  for (const ev of evs) {
    tr.push(...varLen(ev.tick - prev), ...ev.b);
    prev = ev.tick;
  }
  tr.push(...varLen(0), 0xFF, 0x2F, 0x00);

  const tl = tr.length;
  return new Uint8Array([
    0x4D,0x54,0x68,0x64, 0,0,0,6, 0,0, 0,1,
    (tpb >> 8) & 0xFF, tpb & 0xFF,
    0x4D,0x54,0x72,0x6B,
    (tl>>24)&0xFF, (tl>>16)&0xFF, (tl>>8)&0xFF, tl&0xFF,
    ...tr,
  ]);
}

// ── PCM WAV encoder ─────────────────────────────────────────────
function audioBufferToWav(buf: AudioBuffer): Blob {
  const nc  = buf.numberOfChannels;
  const sr  = buf.sampleRate;
  const len = buf.length;
  const dl  = len * nc * 2;
  const ab  = new ArrayBuffer(44 + dl);
  const v   = new DataView(ab);
  const ws  = (o: number, s: string) =>
    s.split('').forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));

  ws(0,'RIFF'); v.setUint32(4, 36+dl, true); ws(8,'WAVE'); ws(12,'fmt ');
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,nc,true);
  v.setUint32(24,sr,true); v.setUint32(28,sr*nc*2,true);
  v.setUint16(32,nc*2,true); v.setUint16(34,16,true);
  ws(36,'data'); v.setUint32(40,dl,true);

  const chs = Array.from({ length: nc }, (_, i) => buf.getChannelData(i));
  let off = 44;
  for (let i = 0; i < len; i++)
    for (let c = 0; c < nc; c++) {
      v.setInt16(off, Math.max(-1, Math.min(1, chs[c][i])) * 0x7FFF, true);
      off += 2;
    }
  return new Blob([ab], { type: 'audio/wav' });
}

// ── Render notes to WAV via OfflineAudioContext ─────────────────
export async function renderNotesToWav(notes: CapturedNote[], bpm = 120): Promise<Blob> {
  if (!notes.length) throw new Error('No notes to render');
  const t0     = Math.min(...notes.map(n => n.startTime));
  const tEnd   = Math.max(...notes.map(n => n.startTime + Math.max(n.duration, 100)));
  const durSec = (tEnd - t0) / 1000 + 1.2;
  const sr     = 44100;
  const octx   = new OfflineAudioContext(2, Math.ceil(durSec * sr), sr);

  const master = octx.createGain();
  master.gain.value = 0.45;
  master.connect(octx.destination);

  for (const note of notes) {
    const s    = (note.startTime - t0) / 1000;
    const d    = Math.max(note.duration, 50) / 1000;
    const freq = 440 * Math.pow(2, (note.pitch - 69) / 12);
    const amp  = (note.velocity / 127) * 0.28;

    const osc  = octx.createOscillator();
    const env  = octx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.connect(env); env.connect(master);

    env.gain.setValueAtTime(0, s);
    env.gain.linearRampToValueAtTime(amp, s + 0.005);
    env.gain.setValueAtTime(amp, s + d - 0.02);
    env.gain.linearRampToValueAtTime(0, s + d);
    osc.start(s); osc.stop(s + d + 0.05);
  }

  return audioBufferToWav(await octx.startRendering());
}

// ── Download helper ─────────────────────────────────────────────
export function downloadBlob(data: Blob | Uint8Array, filename: string) {
  const blob = data instanceof Uint8Array
    ? new Blob([data], { type: 'audio/midi' })
    : data;
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
