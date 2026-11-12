import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('tone', () => {
  const transport = { bpm: { value: 120 }, ticks: 0, position: '0:0:0', state: 'stopped', scheduleRepeat: () => 1, clear: () => {}, start: () => {}, stop: () => {} }
  return { getTransport: () => transport, start: () => Promise.resolve(), now: () => 0, getContext: () => ({ currentTime: 0 }) }
})
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ChordProgPlayView from '@/components/play/ChordProgPlayView.vue'
import DrumPlayView from '@/components/play/DrumPlayView.vue'
import SeqPlayView from '@/components/play/SeqPlayView.vue'
import ChordNowPanel from '@/components/ChordNowPanel.vue'
import { useChordProgStore } from '@/stores/useChordProgStore'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { SLOT_CLASS } from '@/lib/play-colors'
import { rigArmed } from '@/lib/rig-live'

// Performance play views: display only, in the amber scheme.
describe('play views', () => {
  beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })

  it('Chord Prog: slots A–H and the chords; the chord sounding in full amber', () => {
    const store = useChordProgStore()
    store.assignChordToStep(0, 'Cm7', [60, 63, 67, 70])
    store.assignChordToStep(1, 'F7', [65, 69, 72, 75])
    store.isPlaying = true
    store.playingSlotIndex = store.activeSlotIndex
    store.currentStep = 1
    const w = mount(ChordProgPlayView)
    expect(w.text()).toContain('Cm7')
    expect(w.text()).toContain('1/4') // each chord with its length (default 4n)
    const f7 = w.findAll('div').find(d => d.text().startsWith('F7'))!
    expect(f7.classes()).toContain('bg-amber-400')
    // slot A: playing (full amber)
    const a = w.findAll('div').find(d => d.text() === 'A')!
    for (const c of SLOT_CLASS.playing.split(' ')) expect(a.classes()).toContain(c)
  })

  it('Drum Machine: every track of the sequence, its active steps lit', () => {
    const store = useDrumMachineStore()
    store.currentPattern[0].steps[0] = { ...store.currentPattern[0].steps[0], active: true }
    const w = mount(DrumPlayView)
    expect(w.text()).toContain(store.currentPattern[0].label)
    expect(w.findAll('.bg-amber-700\\/80').length).toBeGreaterThan(0)
  })

  it('Drum Machine: with a bassline in use the last three pads are BASS 1–3 (purple); else all drums', () => {
    const store = useDrumMachineStore()
    store.basslineEnabled = true
    const w0 = mount(DrumPlayView)
    expect(w0.text()).not.toContain('Bass 1') // nothing armed, stopped: drums only
    const rows = w0.findAll('.w-20').length
    rigArmed.bass = 0
    const w = mount(DrumPlayView)
    expect(w.text()).toContain('Bass 1')
    expect(w.text()).toContain('Bass 3')
    expect(w.findAll('.w-20').length).toBe(rows) // in place of the source pads, not added
    expect(w.text()).not.toContain(store.TRACK_LABELS[store.basslineSourceSlots[0]])
    rigArmed.bass = null
  })

  it('Now / Next: the chord sounding, its length, the next one', () => {
    const store = useChordProgStore()
    store.isPlaying = true
    store.playingChordName = 'Bb'
    store.playingChordDuration = '1m'
    store.playingChordMs = 2000
    store.nextChord = { name: 'Ebm', duration: '1m', wraps: false }
    const w = mount(ChordNowPanel)
    expect(w.text()).toMatch(/Now\s*Bb\s*1\/1/)
    expect(w.text()).toMatch(/Next\s*Ebm/)
    expect(w.find('.chord-now-fill').attributes('style')).toContain('2000ms')
  })

  it('Sequencer: its banks and the pattern on one row', () => {
    const w = mount(SeqPlayView)
    expect(w.text()).toContain('H')
  })
})
