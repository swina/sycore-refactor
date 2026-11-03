import { describe, it, expect } from 'vitest'
import { isLoopbackAudioInput, dmMidiOutOnlyActive, captureInputDeviceId } from '@/lib/capture-input'

describe('capture-input', () => {
  it('finds the Loopback input by name', () => {
    expect(isLoopbackAudioInput({ label: 'Loopback Audio (Virtual)' })).toBe(true)
    expect(isLoopbackAudioInput({ label: 'CABLE Output (VB-Audio)' })).toBe(false)
    expect(isLoopbackAudioInput({ label: '' })).toBe(false)
    expect(isLoopbackAudioInput(null)).toBe(false)
  })
  it('MIDI OUT ONLY counts only when wired to a virtual instrument', () => {
    const vis = [{ name: 'MicroFreak' }]
    expect(dmMidiOutOnlyActive(true, ['MicroFreak'], vis)).toBe(true)
    expect(dmMidiOutOnlyActive(false, ['MicroFreak'], vis)).toBe(false)
    expect(dmMidiOutOnlyActive(true, ['FM-1 Emulator'], vis)).toBe(false)
    expect(dmMidiOutOnlyActive(true, undefined, vis)).toBe(false)
  })
  it('records from the Loopback while MIDI OUT ONLY, else the picked input', () => {
    const devs = [{ deviceId: 'a', label: 'Mic' }, { deviceId: 'lb', label: 'Loopback Audio' }]
    expect(captureInputDeviceId(devs, 'a', true)).toBe('lb')
    expect(captureInputDeviceId(devs, 'a', false)).toBe('a')
    expect(captureInputDeviceId([{ deviceId: 'a', label: 'Mic' }], 'a', true)).toBe('a')
    expect(captureInputDeviceId([], '', true)).toBe('default')
  })
})
