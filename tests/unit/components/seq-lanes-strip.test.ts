import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
vi.mock('tone', () => {
  const transport = { bpm: { value: 120 }, ticks: 0, position: '0:0:0', state: 'stopped', scheduleRepeat: () => 1, clear: () => {}, start: () => {}, stop: () => {} }
  return { getTransport: () => transport, start: () => Promise.resolve(), now: () => 0, getContext: () => ({ currentTime: 0 }) }
})
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import SeqLanesStrip from '@/components/play/SeqLanesStrip.vue'
import SeqPlayView from '@/components/play/SeqPlayView.vue'
import { useSequencerEngine, _resetSequencerEngine } from '@/core/engines/sequencer'
import { useSeqLaneStore } from '@/stores/useStepSequencerStore'
import { seqActiveLane, reloadSeqActiveLane } from '@/lib/seq-lanes'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'

describe('Sequencer lanes strip (Main / Bass / Arp)', () => {
  beforeEach(() => { localStorage.clear(); reloadSeqActiveLane(); setActivePinia(createPinia()) })
  afterEach(() => { _resetSequencerEngine() })

  it('three lanes: a click on a name shows it; bank letter; Play, M and the channel per lane', async () => {
    const w = mount(SeqLanesStrip)
    const lanes = w.findAll('[data-seq-lane]')
    expect(lanes.map(l => l.attributes('data-seq-lane'))).toEqual(['main', 'bass', 'arp'])
    expect(seqActiveLane.value).toBe('main')
    const bass = w.find('[data-seq-lane="bass"]')
    await bass.find('[data-lane-pick]').trigger('click')
    expect(seqActiveLane.value).toBe('bass')
    expect(localStorage.getItem('SYCORE_SEQ_ACTIVE_LANE')).toBe('bass')

    useSequencerEngine('bass').selectBank(2)
    await nextTick()
    expect(bass.text()).toContain('C')

    await bass.find('[data-lane-mute]').trigger('click')
    expect(useSeqLaneStore('bass').muted).toBe(true)
    expect(useSeqLaneStore('main').muted).toBe(false)

    await bass.find('[data-lane-ch]').setValue('5')
    expect(useSeqLaneStore('bass').midiChannel).toBe(5)
    expect(useSeqLaneStore('arp').midiChannel).toBe(0)

    const toggles: string[] = []
    const h = (e: Event) => toggles.push((e as CustomEvent).type)
    window.addEventListener('toggle-seq-bass', h)
    await bass.find('[data-lane-play]').trigger('click')
    window.removeEventListener('toggle-seq-bass', h)
    expect(toggles).toEqual(['toggle-seq-bass'])
  })

  it('MIDI Learn names per lane: the strip\'s M and Play; the play view\'s Steps', async () => {
    const { control } = useMidiContextMenu()
    const w = mount(SeqLanesStrip)
    await w.find('[data-seq-lane="arp"] [data-lane-mute]').trigger('contextmenu')
    expect(control.value).toEqual({ name: 'seqarp_mute', label: 'Seq Arp: Mute' })
    await w.find('[data-seq-lane="main"] [data-lane-play]').trigger('contextmenu')
    expect(control.value).toEqual({ name: 'seq_play', label: 'Sequencer: Play' })
    const pv = mount(SeqPlayView, { props: { lane: 'bass' } })
    for (const el of pv.findAll('div')) {
      await el.trigger('contextmenu')
      if (control.value?.name === 'seqbass_steps') break
    }
    expect(control.value).toEqual({ name: 'seqbass_steps', label: 'Seq Bass: Steps' })
  })

  it('the play view edits its lane only', async () => {
    const pv = mount(SeqPlayView, { props: { lane: 'bass' } })
    const bass = useSequencerEngine('bass')
    const main = useSequencerEngine('main')
    bass.updateStep(0, { active: true, notes: [36], velocity: 100 })
    main.updateStep(0, { active: false, notes: [72] })
    await nextTick()
    const cells = () => pv.findAll('button[title^="Step "]')
    await cells()[0].trigger('click')
    expect(bass.steps.value[0].active).toBe(false)
    expect(main.steps.value[0].active).toBe(false)
    await cells()[0].trigger('click')
    expect(bass.steps.value[0].active).toBe(true)
    expect(main.steps.value[0].active).toBe(false)
  })
})
