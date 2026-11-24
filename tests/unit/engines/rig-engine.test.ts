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
import { songCommand, songRun, songPaused, songPreview, rigLaneMutes, exampleSong } from '@/lib/songs'

const flush = async () => { for (let i = 0; i < 5; i++) { await nextTick(); await Promise.resolve() } }

// The Rig's logic without its panel (Four contexts C2): the Session Browser's commands reach it.
describe('Rig engine — no panel mounted', () => {
  beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); songRun.value = null; songCommand.value = null; songPaused.value = null; songPreview.value = null })
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

  it('Panic: the song ends and every lane is stopped at once (Chord, Drum, Seq)', async () => {
    const rig = useRigEngine()
    const song = exampleSong()
    rig.songLib.songs.push(song)
    rig.songLib.currentId = song.id
    songCommand.value = { cmd: 'play', index: 0 }
    await flush()
    expect(songRun.value).not.toBeNull()
    const seen: string[] = []
    const orig = window.dispatchEvent.bind(window)
    vi.spyOn(window, 'dispatchEvent').mockImplementation((e: Event) => { seen.push(e.type); return orig(e) })
    rig.doPanic()
    expect(songRun.value).toBeNull()
    expect(seen).toEqual(expect.arrayContaining(['cp-stop', 'dm-play-stop']))
    expect(rig.s.display).toMatch(/PANIC/)
  })

  it('Play with the song open in Session and nothing armed: the song starts, armed for that Play', async () => {
    const rig = useRigEngine()
    const song = exampleSong()
    rig.songLib.songs.push(song)
    rig.songLib.currentId = song.id
    rig.togglePlay()
    await flush()
    expect(songRun.value?.songId).toBe(song.id)
    expect(songRun.value?.index).toBe(0)
    expect(songRun.value?.waitPlay).toBe(true) // its bars count from the Play, not before
  })

  it('Play after a Pause goes on from its section; with nothing paused (a Stop) it starts from the first', async () => {
    const rig = useRigEngine()
    const song = exampleSong()
    rig.songLib.songs.push(song)
    rig.songLib.currentId = song.id
    songPaused.value = { songId: song.id, index: 2 }
    rig.togglePlay()
    await flush()
    expect(songRun.value?.index).toBe(2)
    expect(songPaused.value).toBeNull()
    rig.doPanic()
    rig.togglePlay()
    await flush()
    expect(songRun.value?.index).toBe(0)
  })

  it('Preview: a clip on its own, the song not running; with the song playing it is refused', async () => {
    const rig = useRigEngine()
    const song = exampleSong()
    rig.songLib.songs.push(song)
    rig.songLib.currentId = song.id
    songCommand.value = { cmd: 'preview', index: 2, lane: 'drum', start: 1 }
    await flush()
    expect(songPreview.value).toMatchObject({ songId: song.id, index: 2, lane: 'drum', start: 1 })
    expect(songRun.value).toBeNull()
    expect(rig.s.display).toMatch(/Preview: Drum C/)
    songCommand.value = { cmd: 'previewStop' } // Preview turned off: the clip stops
    await flush()
    expect(songPreview.value).toBeNull()
    expect(rig.s.display).toMatch(/Preview: stopped/)
    songCommand.value = { cmd: 'play', index: 0 }
    await flush()
    songCommand.value = { cmd: 'preview', index: 2, lane: 'drum', start: 1 }
    await flush()
    expect(songPreview.value).toBeNull()
    expect(rig.s.display).toMatch(/song is playing/)
  })

  it('Pause with no song playing says so', () => {
    const rig = useRigEngine()
    rig.pauseSong()
    expect(rig.s.display).toMatch(/no song playing/)
  })

  it('Play with a slot armed by hand: no song, the usual Play', async () => {
    const rig = useRigEngine()
    const song = exampleSong()
    rig.songLib.songs.push(song)
    rig.songLib.currentId = song.id
    const { rigArmed } = await import('@/lib/rig-live')
    rigArmed.drum = 2
    rig.togglePlay()
    await flush()
    expect(songRun.value).toBeNull()
    rigArmed.drum = null
  })

  it("Launchpad top row: pad 5 is Song, pad 7 is Play / Stop", () => {
    const rig = useRigEngine()
    expect(rig.lpTop.value[4].label).toBe('Song')
    expect(rig.lpTop.value[6].label).toBe('Play')
    expect(rig.lpTop.value[7].label).toBe('Panic')
  })

  it("Launchpad Song page: the bottom row shows the song's sections, Shift the songs; a song pressed stopped opens it", async () => {
    const rig = useRigEngine()
    const a = exampleSong(), b = { ...exampleSong(), id: 'song-b', name: 'Second' }
    rig.songLib.songs.push(a, b)
    rig.songLib.currentId = a.id
    expect(rig.lpPad(7, 0).short).toMatch(/^L1/) // Latch 1–8 by default
    rig.lpTopDown(4)
    expect(rig.songPage.value).toBe(true)
    expect(rig.lpPad(7, 0).label).toMatch(/Intro/)
    expect(rig.lpPad(7, 7).color).toBe('off') // six sections
    rig.toggleShift()
    const n = rig.songLib.songs.length
    expect(rig.lpPad(7, n - 1).label).toMatch(/Second/)
    rig.lpPadDown(7, n - 1)
    expect(rig.songLib.currentId).toBe('song-b')
    expect(songRun.value).toBeNull()
    rig.toggleShift()
    rig.lpTopDown(4)
    expect(rig.songPage.value).toBe(false)
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
