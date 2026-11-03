// Drum Machine export while MIDI OUT ONLY: the Drum Machine has no sound of its own (it plays
// external instruments), so each WAV is recorded in real time from Audio Capture's input (the
// Loopback while MIDI OUT ONLY, else the picked input — lib/capture-input.ts): the bar's notes
// are sent as timestamped MIDI and the input is captured on the same AudioContext clock, then
// cut to exactly the bar (from the first note's time, after the input's reported latency).
import type { DrumExportEvent } from '@/lib/drum-export'

export interface CapturedBlock { time: number, channels: Float32Array[] }

/**
 * Cuts `seconds` of audio starting at context time `start` out of captured blocks (each block
 * starts at its `time`). Missing audio is left silent. Returns one Float32Array per channel.
 */
export function sliceCaptured(blocks: CapturedBlock[], start: number, seconds: number,
  sampleRate: number, channels = 2): Float32Array[] {
  const len = Math.max(1, Math.round(seconds * sampleRate))
  const out = Array.from({ length: channels }, () => new Float32Array(len))
  for (const b of blocks) {
    const n = b.channels[0]?.length ?? 0
    const off = Math.round((b.time - start) * sampleRate)   // block's first sample in the output
    if (off >= len || off + n <= 0) continue
    for (let c = 0; c < channels; c++) {
      const src = b.channels[Math.min(c, b.channels.length - 1)]
      const from = Math.max(0, -off), to = Math.min(n, len - off)
      out[c].set(src.subarray(from, to), off + from)
    }
  }
  return out
}

export interface RecordPartOptions {
  ctx: AudioContext
  /** A source node for the input (MediaStreamAudioSourceNode), on `ctx`. */
  input: AudioNode
  /** Input latency in seconds (track settings), skipped at the start of the cut. */
  inputLatency?: number
  bpm: number
  barSeconds: number
  /** Sends one note at context time `time` (seconds) for `duration` seconds. */
  sendNote: (e: DrumExportEvent, time: number) => void
  /** Silence waited after the bar before returning, so a tail doesn't spill into the next part. */
  tailSeconds?: number
  leadIn?: number
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

// AudioWorklet recorder: each render quantum's input, stamped with the context frame it starts at
// (sample-accurate on the context clock the MIDI notes are scheduled on). Posted in ~0.1 s batches.
const RECORDER_JS = `
class SycoreBarRecorder extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; this.t = -1; this.n = 0 }
  process(inputs) {
    const inp = inputs[0]
    if (inp && inp.length) {
      if (this.t < 0) this.t = currentFrame
      this.buf.push(inp.map(c => c.slice()))
      this.n += inp[0].length
      if (this.n >= 4096) this.flush()
    }
    return true
  }
  flush() {
    if (!this.buf.length) return
    const chans = Math.max(...this.buf.map(b => b.length))
    const out = Array.from({ length: chans }, (_, c) => {
      const a = new Float32Array(this.n); let o = 0
      for (const b of this.buf) { const s = b[Math.min(c, b.length - 1)]; a.set(s, o); o += s.length }
      return a
    })
    this.port.postMessage({ frame: this.t, channels: out }, out.map(a => a.buffer))
    this.buf = []; this.t = -1; this.n = 0
  }
}
registerProcessor('sycore-bar-recorder', SycoreBarRecorder)
`
const loaded = new WeakSet<BaseAudioContext>()
async function ensureRecorder(ctx: AudioContext) {
  if (loaded.has(ctx)) return
  const url = URL.createObjectURL(new Blob([RECORDER_JS], { type: 'application/javascript' }))
  try { await ctx.audioWorklet.addModule(url) } finally { URL.revokeObjectURL(url) }
  loaded.add(ctx)
}

/** Plays one bar's events as MIDI and records the input meanwhile; returns the bar as an AudioBuffer. */
export async function recordPart(events: DrumExportEvent[], o: RecordPartOptions): Promise<AudioBuffer> {
  const { ctx, input, barSeconds } = o
  const latency = Math.max(0, o.inputLatency ?? 0)
  await ensureRecorder(ctx)
  const blocks: CapturedBlock[] = []
  const node = new AudioWorkletNode(ctx, 'sycore-bar-recorder', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] })
  node.port.onmessage = (ev) => blocks.push({ time: ev.data.frame / ctx.sampleRate, channels: ev.data.channels })
  const mute = ctx.createGain()
  mute.gain.value = 0
  input.connect(node)
  node.connect(mute)
  mute.connect(ctx.destination)   // keeps the node pulled
  try {
    const start = ctx.currentTime + (o.leadIn ?? 0.4)
    for (const e of events) o.sendNote(e, start + e.time)
    const end = start + barSeconds + latency
    await wait(Math.max(0, (end - ctx.currentTime) * 1000) + 250)   // + a batch or two
    const data = sliceCaptured(blocks, start + latency, barSeconds, ctx.sampleRate, 2)
    const buf = ctx.createBuffer(2, data[0].length, ctx.sampleRate)
    data.forEach((d, c) => buf.copyToChannel(d, c))
    if (o.tailSeconds) await wait(o.tailSeconds * 1000)
    return buf
  } finally {
    node.port.onmessage = null
    try { input.disconnect(node) } catch { /* already */ }
    node.disconnect(); mute.disconnect()
  }
}

/** Opens an audio input (no processing), with its reported latency in seconds. */
export async function openCaptureInput(ctx: AudioContext, deviceId: string) {
  const audio: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId && deviceId !== 'default' ? { ...audio, deviceId: { exact: deviceId } } : audio })
  } catch (e) {
    if (!deviceId || deviceId === 'default') throw e
    stream = await navigator.mediaDevices.getUserMedia({ audio })
  }
  const track = stream.getAudioTracks()[0]
  const settings: any = track?.getSettings?.() ?? {}
  return {
    source: ctx.createMediaStreamSource(stream),
    latency: typeof settings.latency === 'number' ? settings.latency : 0,
    label: track?.label ?? '',
    close: () => stream.getTracks().forEach(t => t.stop()),
  }
}
