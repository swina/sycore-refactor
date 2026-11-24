import { describe, it, expect, beforeEach } from 'vitest'
import { flowAppsOn } from '@/composables/useAudioMixerChannels'
import { songChannels } from '@/lib/songs'
import { rigLaneRows } from '@/lib/rig-live'

// A mixer channel named after the apps MIDI Flow sends on it (the Rig's lanes' channels)
describe('mixer channels: the MIDI Flow apps on a device channel', () => {
  beforeEach(() => {
    rigLaneRows.arp = true
    songChannels.value = [
      { id: 'chord', label: 'Chord', rows: [{ key: 'x3|0', device: 'Emulator X3', ch: 0 }, { key: 'x3|1', device: 'Emulator X3', ch: 1 }] },
      { id: 'arp', label: 'Arp', rows: [{ key: 'x3|3', device: 'Emulator X3', ch: 3 }] },
      { id: 'seq', label: 'Seq', rows: [{ key: 'x3|3', device: 'Emulator X3', ch: 3 }] },
    ]
  })
  it('CH 4 → Seq Arp (and the Sequencer on it too)', () => {
    expect(flowAppsOn('Emulator X3', 3)).toEqual(['Seq Arp', 'Seq'])
    expect(flowAppsOn('Emulator X3', 1)).toEqual(['Chords'])
  })
  it('a channel no app is sent on: none (the strip keeps CH n)', () => {
    expect(flowAppsOn('Emulator X3', 9)).toEqual([])
    expect(flowAppsOn('Other', 0)).toEqual([])
  })
})
