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
import KnobDial from '@/components/ui/KnobDial.vue'
import ChordNowPanel from '@/components/ChordNowPanel.vue'
import ChordNowDisplay from '@/components/ChordNowDisplay.vue'
import { useChordProgStore } from '@/stores/useChordProgStore'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { SLOT_CLASS_PURPLE } from '@/lib/play-colors'
import { rigArmed, rigLaneRows } from '@/lib/rig-live'
import { useSequencerEngine } from '@/core/engines/sequencer'
import { velLevel } from '@/lib/play-colors'
import SeqViewSelect from '@/components/play/SeqViewSelect.vue'
import { reloadSeqPlayView } from '@/lib/seq-play-view'

// Performance play views: display only, each in its app's EDIT color (Drum / Chord Prog purple, Sequencer amber).
describe('play views', () => {
  beforeEach(() => { localStorage.clear(); reloadSeqPlayView(); setActivePinia(createPinia()) })

  it('Chord Prog: slots A–H and the chords; the chord sounding in full purple', () => {
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
    expect(f7.classes()).toContain('bg-purple-400')
    // slot A: playing (full purple)
    const a = w.findAll('div').find(d => d.text() === 'A')!
    for (const c of SLOT_CLASS_PURPLE.playing.split(' ')) expect(a.classes()).toContain(c)
  })

  it('Drum Machine: every track of the sequence, its active steps lit', () => {
    const store = useDrumMachineStore()
    store.currentPattern[0].steps[0] = { ...store.currentPattern[0].steps[0], active: true }
    const w = mount(DrumPlayView)
    expect(w.text()).toContain(store.currentPattern[0].label)
    expect(w.findAll('.bg-purple-600\\/80').length).toBeGreaterThan(0)
  })

  it('Drum Machine: with a bassline in use the last three pads are BASS 1–3 (amber); else all drums', () => {
    rigLaneRows.bass = false // the Bass row on the Drum Machine's bassline (as before the lanes)
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

  it('Now / Next stacked (Rig Controls, above Play): Now over Next, the fill bar', () => {
    const store = useChordProgStore()
    store.isPlaying = true
    store.playingChordName = 'Bb'
    store.playingChordDuration = '1m'
    store.playingChordMs = 2000
    store.nextChord = { name: 'Ebm', duration: '1m', wraps: false }
    const w = mount(ChordNowDisplay, { props: { stacked: true } })
    expect(w.text()).toMatch(/Now\s*Bb\s*1\/1\s*Next\s*Ebm/)
    expect(w.find('.chord-now-fill').attributes('style')).toContain('2000ms')
  })

  it('velocity levels: <70 low, 70–104 mid, ≥105 high', () => {
    expect([0, 69, 70, 104, 105, 127].map(velLevel)).toEqual(['low', 'low', 'mid', 'mid', 'high', 'high'])
  })

  it('Sequencer: its banks and the pattern on one row', () => {
    const w = mount(SeqPlayView)
    expect(w.text()).toContain('H')
  })

  it('Sequencer: steps coloured by velocity (low green, mid orange, high red); a click turns one on / off', async () => {
    const w = mount(SeqPlayView)
    const eng = useSequencerEngine()
    eng.updateStep(0, { active: true, notes: [60], velocity: 40 })
    eng.updateStep(1, { active: true, notes: [62], velocity: 90 })
    eng.updateStep(2, { active: true, notes: [64], velocity: 120 })
    await w.vm.$nextTick()
    const cells = () => w.findAll('button[title^="Step "]')
    expect(cells()[0].classes()).toContain('bg-emerald-500/25')
    expect(cells()[1].classes()).toContain('bg-orange-500/30')
    expect(cells()[2].classes()).toContain('bg-red-500/30')
    expect(cells()[0].classes()).toContain('h-6')
    await cells()[0].trigger('click')
    expect(eng.steps.value[0].active).toBe(false)
    expect(eng.steps.value[0].notes).toEqual([60]) // the notes kept
    await cells()[0].trigger('click')
    expect(eng.steps.value[0].active).toBe(true)
  })

  it('Sequencer lanes (View): 4 / 8 / 16 set Steps, other lengths by the slider (max 16); bars at their pitch, note under it, velocity meter, M mutes, a drag moves the note', async () => {
    const w = mount(SeqPlayView)
    const sel = mount(SeqViewSelect)
    const eng = useSequencerEngine()
    eng.numSteps.value = 32
    await w.vm.$nextTick()
    const view = (label: string) => sel.findAll('[data-view-opt]').find(b => b.text() === label)!
    await view('8').trigger('click')
    expect(eng.numSteps.value).toBe(8)
    eng.updateStep(0, { active: true, notes: [60], velocity: 100 })
    eng.updateStep(1, { active: true, notes: [72], velocity: 100 })
    await w.vm.$nextTick()
    const cells = () => w.findAll('[data-lane-step]')
    expect(cells()).toHaveLength(8)
    const top = (i: number) => (cells()[i].find('span').element as HTMLElement).style.top
    expect(top(0)).toBe('85%') // lowest note at the bottom
    expect(top(1)).toBe('15%') // highest at the top
    expect(w.findAll('[data-lane-note]')[0].text()).toBe('C4')
    // drag step 0 (C4) up two degrees of C Major → E4
    eng.selectedKey.value = 'C'; eng.selectedScale.value = 'Major'
    await cells()[0].trigger('pointerdown', { clientY: 100, pointerId: 1 })
    await cells()[0].trigger('pointermove', { clientY: 84, pointerId: 1 })
    await cells()[0].trigger('pointerup', { pointerId: 1 })
    expect(eng.steps.value[0].notes).toEqual([64])
    expect(w.findAll('[data-lane-note]')[0].text()).toBe('E4')
    // velocity: a click at a quarter of the meter
    const vel = w.findAll('[data-lane-vel]')[0]
    ;(vel.element as HTMLElement).getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 10, right: 100, bottom: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    await vel.trigger('pointerdown', { clientX: 25, pointerId: 2 })
    await vel.trigger('pointerup', { pointerId: 2 })
    expect(eng.steps.value[0].velocity).toBe(32)
    const mute = () => w.findAll('[data-step-mute]')
    await mute()[0].trigger('click')
    expect(eng.steps.value[0].active).toBe(false)
    expect(eng.steps.value[0].notes).toEqual([64])
    await view('16').trigger('click')
    expect(eng.numSteps.value).toBe(16)
    expect(cells()).toHaveLength(16)
    expect(w.find('input[type="range"][min="2"]').attributes('max')).toBe('16')
    eng.numSteps.value = 6
    await w.vm.$nextTick()
    expect(cells()).toHaveLength(6)
    expect(sel.findAll('[data-view-opt]').some(b => b.classes().includes('bg-amber-600'))).toBe(false)
    expect(sel.findAll('[data-view-opt]').map(b => b.text())).toEqual(['Notes', '4', '8', '16'])
    await view('Notes').trigger('click')
    expect(cells()).toHaveLength(0)
  })

  it('Sequencer: Berlin School — Gen fills every step, short notes; Density / Melody / Rhythm hidden', async () => {
    const w = mount(SeqPlayView)
    const eng = useSequencerEngine()
    eng.selectedStyle.value = 'Berlin School'
    eng.numSteps.value = 16
    await w.vm.$nextTick()
    expect(w.text()).not.toContain('Dens')
    expect(w.text()).not.toContain('Rhy')
    eng.generateSequence()
    await w.vm.$nextTick()
    expect(eng.steps.value).toHaveLength(16)
    expect(eng.steps.value.every((s: any) => s.active && s.notes.length === 1)).toBe(true)
    expect(eng.steps.value.every((s: any) => s.gate <= 50)).toBe(true)
  })

  it('Sequencer: Vary / P1 / P2 dials move, also while playing; ↻ regenerates P1 alone', async () => {
    const w = mount(SeqPlayView)
    const eng = useSequencerEngine()
    eng.isPlaying.value = true
    await w.vm.$nextTick()
    const dial = (k: string) => w.find(`[data-seq-knob="${k}"]`).findComponent(KnobDial)
    dial('p1').vm.$emit('update:modelValue', 80)
    dial('p2').vm.$emit('update:modelValue', -40)
    dial('vary').vm.$emit('update:modelValue', 35)
    await w.vm.$nextTick()
    expect(eng.varyAmount.value).toBe(35)
    expect(eng.param1Variation.value).toBe(80)
    expect(eng.param2Variation.value).toBe(-40)
    expect(w.text()).toContain('+80')
    const p2 = eng.steps.value.map((s: any) => s.param2Value)
    await w.find('button[title^="Regenerate P1"]').trigger('click')
    expect(eng.steps.value.map((s: any) => s.param2Value)).toEqual(p2)
    eng.isPlaying.value = false
  })

  it('Chain on: the chain strip, the position playing in red; off: none', () => {
    const store = useChordProgStore()
    store.chain = [0, 2, 1, ...Array(13).fill(-1)]
    const off = mount(ChordProgPlayView)
    expect(off.text()).not.toContain('Chain')
    store.chainEnabled = true
    store.isPlaying = true
    store.playingChainPos = 1
    const w = mount(ChordProgPlayView)
    expect(w.text()).toContain('Chain')
    const cells = w.findAll('[data-chain-entry]')
    expect(cells.map(c => c.text())).toEqual(['A', 'C', 'B'])
    expect(cells[1].classes()).toContain('bg-red-600')
  })

  it('Drum Machine: the chain from its panel, empty entries as ·', () => {
    useDrumMachineStore().chainEnabled = true
    const w = mount(DrumPlayView, { props: { chain: ['A', null, 'B', null], chainPos: -1 } })
    const cells = w.findAll('[data-chain-entry]')
    expect(cells.map(c => c.text())).toEqual(['A', '·', 'B', '·'])
  })
})
