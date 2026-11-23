import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { captureEngines, applyEngines } from '@/lib/engine-snapshot'
import { captureInto, switchMaterial, dropMaterial, needsSwitch, songMaterial } from '@/lib/song-material'
import { newSong, parseLibrary, type SongLibrary } from '@/lib/songs'
import { useChordProgStore } from '@/stores/useChordProgStore'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { useSeqLaneStore } from '@/stores/useStepSequencerStore'

const chordNumSteps = () => useChordProgStore().slots[2].numSteps
const setChord = (n: number) => { const cp = useChordProgStore(); cp.slots[2] = { ...cp.slots[2], numSteps: n } }
const bassSteps = () => useSeqLaneStore('bass').banks[1].numSteps
const setBass = (n: number) => { const st = useSeqLaneStore('bass'); st.banks[1] = { ...st.banks[1], numSteps: n } }

describe('engine snapshot', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

  it('takes the three engines and puts them back', () => {
    setChord(4); setBass(32)
    const dm = useDrumMachineStore()
    dm.swing = 30
    const snap = captureEngines()
    setChord(12); setBass(16); dm.swing = 0
    applyEngines(snap)
    expect(chordNumSteps()).toBe(4)
    expect(bassSteps()).toBe(32)
    expect(dm.swing).toBe(30)
  })
})

describe('song material (SG4)', () => {
  let lib: SongLibrary
  beforeEach(() => {
    setActivePinia(createPinia()); localStorage.clear()
    songMaterial.byKey = {}
    lib = parseLibrary(null)
  })

  it('a song with its own material swaps with the session, each keeps its changes', async () => {
    const a = lib.songs[0]
    const b = newSong('B'); lib.songs.push(b)
    setChord(4)
    await captureInto(lib, b) // B starts from the apps: 4
    expect(lib.loadedId).toBe(b.id)
    setChord(6)               // edited while B is in the apps
    expect(needsSwitch(lib, a)).toBe(true)
    await switchMaterial(lib, a) // A uses the session's slots: 4 (as captured)
    expect(chordNumSteps()).toBe(4)
    expect(lib.loadedId).toBeNull()
    await switchMaterial(lib, b) // B with its change
    expect(chordNumSteps()).toBe(6)
  })

  it('dropping the material of the song loaded brings the session back', async () => {
    const b = newSong('B'); lib.songs.push(b)
    setChord(4)
    await captureInto(lib, b)
    setChord(9)
    await dropMaterial(lib, b)
    expect(b.own).toBe(false)
    expect(lib.loadedId).toBeNull()
    expect(chordNumSteps()).toBe(4)
    expect(songMaterial.byKey[b.id]).toBeUndefined()
  })
})
