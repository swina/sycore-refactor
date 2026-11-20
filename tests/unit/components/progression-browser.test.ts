import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProgressionBrowserModal from '@/components/play/ProgressionBrowserModal.vue'

const data = {
  'A Peaceful': [{ chordName: 'Am', notes: [57, 60, 64] }, { chordName: 'F', notes: [53, 57, 60] }],
  'A Dark': [{ chordName: 'Am', notes: [57, 60, 64] }],
  'C Joyful': [{ chordName: 'C', notes: [60, 64, 67] }],
}
const props = { title: 'Modal Chords', names: Object.keys(data), data, styleName: 'Pop' }

describe('ProgressionBrowserModal', () => {
  it('lists the progressions, the first picked with its chords', () => {
    const w = mount(ProgressionBrowserModal, { props })
    expect(w.findAll('[data-prog-item]')).toHaveLength(3)
    expect(w.findAll('[data-prog-chord]').map(c => c.text())).toEqual(['Am3n', 'F3n'])
  })
  it('Modal Chords root: only on it, toggled off shows all', async () => {
    const w = mount(ProgressionBrowserModal, { props: { ...props, root: 0 } })
    expect(w.findAll('[data-prog-item]').map(b => b.text())).toEqual(['C Joyful'])
    await w.find('[data-prog-onroot]').trigger('click')
    expect(w.findAll('[data-prog-item]')).toHaveLength(3)
  })
  it('search filters', async () => {
    const w = mount(ProgressionBrowserModal, { props })
    await w.find('[data-prog-search]').setValue('dark')
    expect(w.findAll('[data-prog-item]').map(b => b.text())).toEqual(['A Dark'])
  })
  it('preview a chord, USE / AS IS the picked one', async () => {
    const w = mount(ProgressionBrowserModal, { props })
    await w.findAll('[data-prog-item]')[1].trigger('click')
    await w.find('[data-prog-chord]').trigger('click')
    expect(w.emitted('preview')![0][0]).toEqual(data['A Dark'][0])
    await w.find('[data-prog-use]').trigger('click')
    await w.find('[data-prog-load]').trigger('click')
    expect(w.emitted('use')![0]).toEqual(['A Dark'])
    expect(w.emitted('load')![0]).toEqual(['A Dark'])
  })
})
