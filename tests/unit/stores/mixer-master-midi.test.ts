import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAudioMixerStore } from '@/stores/useAudioMixerStore'
import { midiService } from '@/core/midi/midi-service'

// The Audio Mixer's Master on the MIDI channels (no Live): CC 7 × √Master, sent at most every 50 ms,
// only the values that changed, not on the Rig's channels.
describe('Master on the MIDI channels', () => {
  beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); vi.useFakeTimers() })

  it("a strip's CC 7 follows Master (√: the GM curve), throttled; the Rig's channels left to the Rig", () => {
    const mixer = useAudioMixerStore()
    const send = vi.spyOn(midiService, 'sendRawCC').mockImplementation(() => {})
    mixer.assignChannelSlot(0, { type: 'instrumentCh', id: 'X3:3' })
    mixer.assignChannelSlot(1, { type: 'instrumentCh', id: 'X3:4' })
    mixer.setVirtualChannelVol('X3', 3, 1)
    mixer.setVirtualChannelVol('X3', 4, 1)
    mixer.setRigChannelOwner((d, ch) => d === 'X3' && ch === 4)
    send.mockClear()
    mixer.setMasterVol(0.25) // −12 dB: CC × 0.5
    vi.advanceTimersByTime(60)
    expect(send).toHaveBeenCalledWith('X3', 7, 64, 3)
    expect(send).not.toHaveBeenCalledWith('X3', 7, expect.anything(), 4)
    send.mockClear()
    mixer.setMasterVol(0.25) // the same: nothing sent again
    vi.advanceTimersByTime(60)
    expect(send).not.toHaveBeenCalled()
    mixer.masterOnLive = true // Live's Master: the CC 7 left alone
    expect(mixer.midiMaster()).toBe(1)
    send.mockRestore(); vi.useRealTimers()
  })
})
