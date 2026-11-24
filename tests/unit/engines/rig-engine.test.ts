import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Tone.js without an AudioContext (the Drum Machine / Chord Prog engines the Rig drives import it).
vi.mock('tone', () => {
  const transport = {
    bpm: { value: 120 }, swing: 0, ticks: 0, position: '0:0:0', state: 'stopped',
    scheduleRepeat: () => 1, clear: () => {}, toTicks: () => 48, nextSubdivision: () => 0, start: () => {}, stop: () => {},
  }
  return { getTransport: () => transport, start: () => Promise.resolve(), now: () => 0, getContext: () => ({ currentTime: 0 }) }
})
vi.mock('@/lib/drum-engine', () => {
  const noop = () => {}
  return new Proxy({}, { get: (_t, k) => (k === 'loadSample' ? async () => {} : k === 'then' ? undefined : noop) })
})
vi.mock('@/composables/useFreesoundCache', () => ({
  useFreesoundCache: () => ({ resolveUrl: async () => null, cacheFileBlob: async () => '' }),
}))

import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useRigEngine, _resetRigEngine } from '@/core/engines/rig'
import { _resetDrumMachineEngine } from '@/core/engines/drum-machine'
import { songCommand, songRun, rigLaneMutes, exampleSong } from '@/lib/songs'

const flush = async () => { for (let i = 0; i < 5; i++) { await nextTick(); await Promise.resolve() } }

// The Rig's logic without its panel (Four contexts C2): the Session Browser's commands reach it.
describe('Rig engine — no panel mounted', () => {
  beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); songRun.value = null; songCommand.value = null })
  afterEach(() => { _resetRigEngine(); _resetDrumMachineEngine(); vi.restoreAllMocks() })

  it('is one instance for the app', () => {
    expect(useRigEngine()).toBe(useRigEngine())
  })

  it("takes the Session Browser's Mute / Solo and reports them back (kept: no panel to close)", async () => {
    const rig = useRigEngine()
    songCommand.value = { cmd: 'mute', lane: 'drum' }
    await flush()
    expect(songCommand.value).toBeNull()
    expect(rig.s.apps.find((a: any) => a.id === 'drum').muted).toBe(true)
    expect(rigLaneMutes.value.drum).toEqual({ muted: true, solo: false })
    songCommand.value = { cmd: 'solo', lane: 'chord' }
    await flush()
    expect(rigLaneMutes.value.chord).toEqual({ muted: false, solo: true })
  })

  it('a command sent before the engine exists is taken when it starts', async () => {
    songCommand.value = { cmd: 'mute', lane: 'seq' }
    const rig = useRigEngine()
    await flush()
    expect(rig.s.apps.find((a: any) => a.id === 'seq').muted).toBe(true)
  })

  it('SIM mode: a song does not play (LIVE only), the display says so', async () => {
    localStorage.setItem('SYCORE_RIG_MODE', 'sim')
    const rig = useRigEngine()
    songCommand.value = { cmd: 'play', index: 0 }
    await flush()
    expect(songRun.value).toBeNull()
    expect(rig.s.display).toMatch(/LIVE mode/)
  })

  it('LIVE: Play from the Session Browser starts the song with no panel; Stop before its bar 1 calls it off', async () => {
    const rig = useRigEngine()
    const song = exampleSong()
    rig.songLib.songs.push(song)
    rig.songLib.currentId = song.id
    songCommand.value = { cmd: 'play', index: 0 }
    await flush()
    expect(songRun.value?.songId).toBe(song.id)
    songCommand.value = { cmd: 'stop' }
    await flush()
    expect(songRun.value).toBeNull()
  })

  it('Stop song with nothing playing does nothing', async () => {
    useRigEngine()
    songCommand.value = { cmd: 'stop' }
    await flush()
    expect(songRun.value).toBeNull()
  })

  it('dropping the engine clears the mutes it reported', async () => {
    useRigEngine()
    songCommand.value = { cmd: 'mute', lane: 'drum' }
    await flush()
    _resetRigEngine()
    expect(rigLaneMutes.value).toEqual({})
  })
})
