import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMidiStore } from '@/stores/useMidiStore'

// A panel output (FM-1 Emulator) has no real port and isn't a virtual
// instrument: it's online while its panel is open. The Program Change panel
// showed it "Offline" though its messages went out.
describe('useMidiStore.isOutputOnline', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('an open panel output is online, a closed one is not', () => {
    const midiStore = useMidiStore()
    expect(midiStore.isOutputOnline('FM-1 Emulator')).toBe(false)
    midiStore.registerPanelOutput('FM-1 Emulator', () => {}, 'fm1')
    expect(midiStore.isOutputOnline('FM-1 Emulator')).toBe(true)
    midiStore.unregisterPanelOutput('FM-1 Emulator')
    expect(midiStore.isOutputOnline('FM-1 Emulator')).toBe(false)
  })

  it('an unknown output is offline', () => {
    expect(useMidiStore().isOutputOnline('Nope')).toBe(false)
  })
})
