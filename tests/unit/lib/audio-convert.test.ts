import { describe, it, expect } from 'vitest'
import { encodeMp3, convertTargetFormat, convertAudioFile } from '@/lib/audio-convert'
import type { PcmSource } from '@/lib/audio-convert'

function sine(channels: number, seconds = 0.5, sampleRate = 44100): PcmSource {
  const length = Math.round(seconds * sampleRate)
  const data = Array.from({ length: channels }, () => {
    const ch = new Float32Array(length)
    for (let i = 0; i < length; i++) ch[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5
    return ch
  })
  return { numberOfChannels: channels, sampleRate, length, getChannelData: c => data[c] }
}

async function bytes(blob: Blob) {
  return new Uint8Array(await blob.arrayBuffer())
}

describe('encodeMp3', () => {
  it('produces an MPEG audio stream (frame sync) for stereo input', async () => {
    const blob = await encodeMp3(sine(2), 192)
    expect(blob.type).toBe('audio/mpeg')
    const b = await bytes(blob)
    expect(b.length).toBeGreaterThan(1000)
    expect(b[0]).toBe(0xFF)
    expect(b[1] & 0xE0).toBe(0xE0)
  })

  it('encodes mono and uses only the first two channels of multichannel input', async () => {
    expect((await bytes(await encodeMp3(sine(1), 128))).length).toBeGreaterThan(0)
    expect((await bytes(await encodeMp3(sine(6), 128))).length).toBeGreaterThan(0)
  })

  it('higher bitrate gives a bigger file', async () => {
    const src = sine(2, 1)
    const lo = (await encodeMp3(src, 128)).size
    const hi = (await encodeMp3(src, 320)).size
    expect(hi).toBeGreaterThan(lo)
  })
})

describe('convertTargetFormat', () => {
  it('maps targets to formats', () => {
    expect(convertTargetFormat('none')).toBeNull()
    expect(convertTargetFormat('wav')).toBe('wav')
    expect(convertTargetFormat('mp3-320')).toBe('mp3')
  })
})

describe('convertAudioFile', () => {
  it("returns null for 'none' without decoding", async () => {
    expect(await convertAudioFile(new Blob(['x']), 'none')).toBeNull()
  })
})
