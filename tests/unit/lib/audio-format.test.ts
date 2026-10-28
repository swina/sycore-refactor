import { describe, it, expect } from 'vitest'
import { formatFromName, formatFromUrl, trackFormat } from '@/lib/audio-format'

describe('formatFromName', () => {
  it('reads known extensions case-insensitively', () => {
    expect(formatFromName('Song.MP3')).toBe('mp3')
    expect(formatFromName('loop.flac')).toBe('flac')
    expect(formatFromName('x.oga')).toBe('ogg')
    expect(formatFromName('x.aif')).toBe('aiff')
  })
  it('returns null for unknown or missing extensions', () => {
    expect(formatFromName('readme.txt')).toBeNull()
    expect(formatFromName('noext')).toBeNull()
    expect(formatFromName('')).toBeNull()
  })
})

describe('formatFromUrl', () => {
  it('maps data URL MIME types', () => {
    expect(formatFromUrl('data:audio/mpeg;base64,AAA')).toBe('mp3')
    expect(formatFromUrl('data:audio/x-wav;base64,AAA')).toBe('wav')
    expect(formatFromUrl('data:audio/flac;base64,AAA')).toBe('flac')
    expect(formatFromUrl('data:audio/ogg;base64,AAA')).toBe('ogg')
    expect(formatFromUrl('data:audio/x-m4a;base64,AAA')).toBe('m4a')
    expect(formatFromUrl('data:application/octet-stream;base64,AAA')).toBeNull()
  })
  it('uses the URL path extension, ignoring query and hash', () => {
    expect(formatFromUrl('https://cdn.freesound.org/previews/1/123-hq.mp3?x=1')).toBe('mp3')
    expect(formatFromUrl('https://example.com/a%20b.wav#t=3')).toBe('wav')
    expect(formatFromUrl('https://example.com/stream')).toBeNull()
  })
  it('returns null for blob URLs', () => {
    expect(formatFromUrl('blob:http://localhost/abc')).toBeNull()
  })
})

describe('trackFormat', () => {
  it('prefers the stored format field', () => {
    expect(trackFormat({ format: 'flac', url: 'data:application/octet-stream;base64,AAA' })).toBe('flac')
    expect(trackFormat({ url: 'https://x.com/a.ogg' })).toBe('ogg')
  })
})
