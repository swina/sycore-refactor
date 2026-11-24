import { describe, it, expect } from 'vitest'
import { soundDevicesOf, editorFor } from '@/lib/sound-design'

describe('Sound Design devices', () => {
  it('the sound devices on the canvas: no controllers, no apps, each once', () => {
    const nodes = [
      { name: 'Launchpad Mini', type: 'controller' },
      { name: 'Chord Prog', sourceId: 'CHORD_PROG' },
      { name: 'S-1', type: 'instrument-single' },
      { name: 'Emulator X3', type: 'instrument-multi' },
      { name: 'MF Leads', type: 'virtual' },
      { name: 'S-1', type: 'instrument-single' },
    ]
    const list = soundDevicesOf(nodes, {}, [{ name: 'MF Leads', midiOutputPort: 'Arturia MicroFreak' }])
    expect(list.map(d => [d.name, d.type, d.editor])).toEqual([
      ['S-1', 'instrument-single', 'sound-engine'],
      ['Emulator X3', 'instrument-multi', 'virtual-device'],
      ['MF Leads', 'virtual', 'microfreak-editor'], // through the MicroFreak's port
    ])
    expect(list[2].port).toBe('Arturia MicroFreak')
  })

  it('the editor: by the template too; S-1 not matched inside another name', () => {
    expect(editorFor('My Synth', { 'My Synth': { pcTemplate: 'roland-s1' } })).toBe('sound-engine')
    expect(editorFor('Synth B', { 'Synth B': { pcTemplate: 'mfprojz' } })).toBe('microfreak-editor')
    expect(editorFor('ROLAND S-1 MIDI', {})).toBe('sound-engine')
    expect(editorFor('JDS-10', {})).toBe('virtual-device')
    expect(editorFor('Emulator X3', {})).toBe('virtual-device')
  })
})
