import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMidiStore } from '@/stores/useMidiStore'
import { midiService } from '@/core/midi/midi-service'

describe('useMidiStore panel outputs (FM-1 Emulator)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('registers a routable output-only device while the panel is open', () => {
    const midiStore = useMidiStore()
    midiStore.registerPanelOutput('FM-1 Emulator', () => {})

    expect(midiStore.panelOutputs).toContain('FM-1 Emulator')
    expect(midiService.getVirtualOutputNames()).toContain('FM-1 Emulator')
    const reg = midiStore.routingConfig.registrations['FM-1 Emulator']
    expect(reg.outEnabled).toBe(true)
    expect(reg.inEnabled).toBe(false)
  })

  it('unregistering drops the output but keeps the routing registration', () => {
    const midiStore = useMidiStore()
    midiStore.registerPanelOutput('FM-1 Emulator', () => {})
    midiStore.unregisterPanelOutput('FM-1 Emulator')

    expect(midiStore.panelOutputs).not.toContain('FM-1 Emulator')
    expect(midiService.getVirtualOutputNames()).not.toContain('FM-1 Emulator')
    expect(midiStore.routingConfig.registrations['FM-1 Emulator']).toBeTruthy()
  })

  it('reopening does not reset registration flags the user changed', () => {
    const midiStore = useMidiStore()
    midiStore.registerPanelOutput('FM-1 Emulator', () => {})
    midiStore.updateRegistration('FM-1 Emulator', 'clock', false)
    midiStore.unregisterPanelOutput('FM-1 Emulator')
    midiStore.registerPanelOutput('FM-1 Emulator', () => {})

    expect(midiStore.routingConfig.registrations['FM-1 Emulator'].clock).toBe(false)
    expect(midiStore.panelOutputs).toEqual(['FM-1 Emulator'])
  })

  it('remembers which panel owns the output', () => {
    const midiStore = useMidiStore()
    midiStore.registerPanelOutput('FM-1 Emulator', () => {}, 'fm1-emulator')

    expect(midiStore.panelOutputPanels['FM-1 Emulator']).toBe('fm1-emulator')
  })
})
