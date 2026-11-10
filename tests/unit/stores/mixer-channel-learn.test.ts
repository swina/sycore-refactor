import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAudioMixerStore } from '@/stores/useAudioMixerStore'
import { applyMixerChannelParam, useAudioMixerChannels } from '@/composables/useAudioMixerChannels'
import { useMidiStore } from '@/stores/useMidiStore'
import { midiService } from '@/core/midi/midi-service'

describe('MIDI Learn on mixer channel N (mix_ch<N>_vol / _mute)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('a MIDI instrument channel (X3 ch 3): CC 7 on that channel of that device', () => {
    const mixer = useAudioMixerStore()
    const send = vi.spyOn(midiService, 'sendRawCC').mockImplementation(() => {})
    mixer.assignChannelSlot(2, { type: 'instrumentCh', id: 'E-MU X3 MULTI:2' })
    expect(applyMixerChannelParam(2, 'vol', 127)).toBe(true)
    expect(mixer.getVirtualChannelVol('E-MU X3 MULTI', 2)).toBe(1)
    expect(send).toHaveBeenLastCalledWith('E-MU X3 MULTI', 7, 127, 2)
    applyMixerChannelParam(2, 'mute', 127)
    expect(mixer.isVirtualChannelMuted('E-MU X3 MULTI', 2)).toBe(true)
    expect(send).toHaveBeenLastCalledWith('E-MU X3 MULTI', 7, 0, 2)
    send.mockRestore()
  })

  it('a whole instrument and an app source; nothing assigned → false', () => {
    const mixer = useAudioMixerStore()
    vi.spyOn(midiService, 'sendRawCC').mockImplementation(() => {})
    mixer.assignChannelSlot(0, { type: 'instrument', id: 'ROLAND S-1' })
    applyMixerChannelParam(0, 'vol', 0)
    expect(mixer.getInstrumentVol('ROLAND S-1')).toBe(0)
    mixer.assignChannelSlot(1, { type: 'catalog', id: 'backing' })
    applyMixerChannelParam(1, 'vol', 127)
    expect(mixer.backingVol).toBe(1)
    expect(applyMixerChannelParam(5, 'vol', 64)).toBe(false)
  })

  it('a mute press from a CC under 64 (button release) does nothing', () => {
    const mixer = useAudioMixerStore()
    vi.spyOn(midiService, 'sendRawCC').mockImplementation(() => {})
    mixer.assignChannelSlot(3, { type: 'instrumentCh', id: 'E-MU X3 MULTI:3' })
    applyMixerChannelParam(3, 'mute', 0)
    expect(mixer.isVirtualChannelMuted('E-MU X3 MULTI', 3)).toBe(false)
  })

  it('a virtual instrument offers its whole fader and every channel 1–16, all assignable', () => {
    const midi = useMidiStore()
    midi.addVirtualInstrument('X3 VIRT')
    const mixer = useAudioMixerStore()
    const { availableSources, flatChannels } = useAudioMixerChannels()
    const ids = availableSources.value.filter(s => s.group === 'Virtual Instruments').map(s => s.id)
    expect(ids).toEqual(['X3 VIRT', ...Array.from({ length: 16 }, (_, ch) => `X3 VIRT:${ch}`)])
    mixer.assignChannelSlot(7, { type: 'virtual', id: 'X3 VIRT:15' })
    expect(flatChannels.value[7]?.sub).toBe('CH 16')
    expect(flatChannels.value[7]?.volParam).toBe('mix_ch8_vol')
  })
})
