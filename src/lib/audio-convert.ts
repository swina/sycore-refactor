// In-browser audio conversion for library imports (any decodable format → MP3 / WAV).
import { Mp3Encoder } from '@breezystack/lamejs'
import { audioBufferToWav, decodeAudioFile } from '@/lib/decode-audio'

export type ConvertTarget = 'none' | 'mp3-320' | 'mp3-192' | 'mp3-128' | 'wav'

export const CONVERT_OPTIONS: { value: ConvertTarget; label: string }[] = [
  { value: 'none',    label: 'None (keep original)' },
  { value: 'mp3-320', label: 'MP3 · 320 kbps' },
  { value: 'mp3-192', label: 'MP3 · 192 kbps' },
  { value: 'mp3-128', label: 'MP3 · 128 kbps' },
  { value: 'wav',     label: 'WAV · 16-bit PCM' },
]

/** Minimal AudioBuffer shape the encoders need (lets tests pass plain objects). */
export interface PcmSource {
  numberOfChannels: number
  sampleRate: number
  length: number
  getChannelData(channel: number): Float32Array
}

// lamejs only supports MPEG sample rates up to 48 kHz
const MP3_MAX_RATE = 48000

const toInt16 = (f32: Float32Array) => {
  const i16 = new Int16Array(f32.length)
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]))
    i16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
  }
  return i16
}

/** Encode PCM to MP3. Mono stays mono; 2+ channels use the first two. Yields to the UI between chunks. */
export async function encodeMp3(buf: PcmSource, kbps = 192): Promise<Blob> {
  const channels = buf.numberOfChannels > 1 ? 2 : 1
  const left  = toInt16(buf.getChannelData(0))
  const right = channels === 2 ? toInt16(buf.getChannelData(1)) : left
  const enc = new Mp3Encoder(channels, buf.sampleRate, kbps)
  const parts: ArrayBuffer[] = []
  const toAB = (u: Int8Array | Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
  const BLOCK = 1152
  const YIELD_EVERY = BLOCK * 400 // ~10 s of audio at 44.1 kHz
  for (let i = 0; i < left.length; i += BLOCK) {
    const l = left.subarray(i, i + BLOCK)
    const out = channels === 1 ? enc.encodeBuffer(l) : enc.encodeBuffer(l, right.subarray(i, i + BLOCK))
    if (out.length > 0) parts.push(toAB(out))
    if (i > 0 && i % YIELD_EVERY === 0) await new Promise(r => setTimeout(r, 0))
  }
  const tail = enc.flush()
  if (tail.length > 0) parts.push(toAB(tail))
  return new Blob(parts, { type: 'audio/mpeg' })
}

async function resample(buf: AudioBuffer, rate: number): Promise<AudioBuffer> {
  const length = Math.ceil(buf.duration * rate)
  const ctx = new OfflineAudioContext(buf.numberOfChannels, length, rate)
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  src.start()
  return ctx.startRendering()
}

/** Target file extension for a conversion, or null for 'none'. */
export function convertTargetFormat(target: ConvertTarget): 'mp3' | 'wav' | null {
  if (target === 'wav') return 'wav'
  if (target.startsWith('mp3')) return 'mp3'
  return null
}

/** Convert an audio file. Returns null for 'none' (caller keeps the original file). */
export async function convertAudioFile(file: Blob, target: ConvertTarget): Promise<Blob | null> {
  const format = convertTargetFormat(target)
  if (!format) return null
  let decoded = await decodeAudioFile(await file.arrayBuffer())
  if (format === 'wav') return audioBufferToWav(decoded)
  if (decoded.sampleRate > MP3_MAX_RATE) decoded = await resample(decoded, 44100)
  return encodeMp3(decoded, Number(target.split('-')[1]))
}
