import { describe, it, expect } from 'vitest'
import { noteName, decodeRaw, applyVelocityCurve, noteStatusByte } from '@/core/midi/midi-broadcast'

describe('noteName', () => {
  it('returns correct note names', () => {
    expect(noteName(60)).toBe('C4')
    expect(noteName(69)).toBe('A4')
    expect(noteName(0)).toBe('C-1')
    expect(noteName(127)).toBe('G9')
  })
})

describe('decodeRaw', () => {
  it('decodes a note-on message', () => {
    const result = decodeRaw([0x90, 60, 100])
    expect(result.type).toBe('noteon')
    expect(result.channel).toBe(1)
    expect(result.decoded).toContain('C4')
    expect(result.decoded).toContain('vel=100')
  })

  it('decodes a CC message', () => {
    const result = decodeRaw([0xB0, 7, 64])
    expect(result.type).toBe('cc')
    expect(result.channel).toBe(1)
    expect(result.decoded).toContain('CC 7')
  })

  it('decodes a clock message', () => {
    const result = decodeRaw([0xF8])
    expect(result.type).toBe('clock')
    expect(result.decoded).toBe('Clock')
  })
})

describe('applyVelocityCurve', () => {
  it('passes through linear unchanged', () => {
    expect(applyVelocityCurve(64, 'linear')).toBe(64)
  })

  it('returns fixed value for fixed curve', () => {
    expect(applyVelocityCurve(127, 'fixed')).toBe(64)
  })

  it('compresses low velocities for exp curve', () => {
    const result = applyVelocityCurve(64, 'exp')
    expect(result).toBeLessThan(64)
  })
})

describe('noteStatusByte', () => {
  it('encodes note-on correctly', () => {
    expect(noteStatusByte('noteon', 0)).toBe(0x90)
    expect(noteStatusByte('noteon', 9)).toBe(0x99)
  })

  it('encodes note-off correctly', () => {
    expect(noteStatusByte('noteoff', 0)).toBe(0x80)
  })
})