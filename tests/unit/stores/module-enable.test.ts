import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigStore } from '@/stores/useConfigStore'
import { useUiStore } from '@/stores/useUiStore'

describe('module enable/disable (AdminPanel Toolbar Settings -> configStore.toolbarConfig)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('isModuleEnabled defaults to true for an id with no toolbarConfig entry', () => {
    const configStore = useConfigStore()
    expect(configStore.isModuleEnabled('drum-machine')).toBe(true)
  })

  it('isModuleEnabled respects an explicit enabled:false entry', () => {
    const configStore = useConfigStore()
    configStore.toolbarConfig.push({ id: 'drum-machine', label: 'Drum Machine', icon: 'Drum', enabled: false })
    expect(configStore.isModuleEnabled('drum-machine')).toBe(false)
  })

  it('isModuleEnabled respects an explicit enabled:true entry', () => {
    const configStore = useConfigStore()
    configStore.toolbarConfig.push({ id: 'drum-machine', label: 'Drum Machine', icon: 'Drum', enabled: true })
    expect(configStore.isModuleEnabled('drum-machine')).toBe(true)
  })

  it('uiStore.openPanel is a no-op for a disabled module', () => {
    const configStore = useConfigStore()
    const uiStore = useUiStore()
    configStore.toolbarConfig.push({ id: 'drum-machine', label: 'Drum Machine', icon: 'Drum', enabled: false })

    uiStore.openPanel('drum-machine')
    expect(uiStore.isDrumMachineOpen).toBe(false)
  })

  it('uiStore.togglePanel cannot open a disabled module, but can still close an already-open one', () => {
    const configStore = useConfigStore()
    const uiStore = useUiStore()

    // Open while enabled
    uiStore.togglePanel('drum-machine')
    expect(uiStore.isDrumMachineOpen).toBe(true)

    // Admin disables it mid-session
    configStore.toolbarConfig.push({ id: 'drum-machine', label: 'Drum Machine', icon: 'Drum', enabled: false })

    // Toggling now must close it (allowed), not re-open it
    uiStore.togglePanel('drum-machine')
    expect(uiStore.isDrumMachineOpen).toBe(false)

    // And it must stay closed — toggling again must not reopen it
    uiStore.togglePanel('drum-machine')
    expect(uiStore.isDrumMachineOpen).toBe(false)
  })

  it('uiStore.closePanel always works regardless of enabled state', () => {
    const configStore = useConfigStore()
    const uiStore = useUiStore()
    uiStore.openPanel('drum-machine')
    configStore.toolbarConfig.push({ id: 'drum-machine', label: 'Drum Machine', icon: 'Drum', enabled: false })
    uiStore.closePanel('drum-machine')
    expect(uiStore.isDrumMachineOpen).toBe(false)
  })
})

describe('configStore.setModuleEnabled (used by ModuleManagerPanel.vue)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('updates enabled on an existing toolbarConfig entry', async () => {
    const configStore = useConfigStore()
    configStore.toolbarConfig.push({ id: 'sampler', label: 'Sampler', icon: 'Music2', enabled: true })

    await configStore.setModuleEnabled('sampler', false)

    expect(configStore.toolbarConfig.filter(b => b.id === 'sampler')).toHaveLength(1)
    expect(configStore.isModuleEnabled('sampler')).toBe(false)
  })

  it('creates a new toolbarConfig entry when none exists yet', async () => {
    const configStore = useConfigStore()
    expect(configStore.toolbarConfig.find(b => b.id === 'midi-monitor')).toBeUndefined()

    await configStore.setModuleEnabled('midi-monitor', false, { label: 'MIDI Monitor' })

    const entry = configStore.toolbarConfig.find(b => b.id === 'midi-monitor')
    expect(entry).toBeTruthy()
    expect(entry.enabled).toBe(false)
    expect(entry.label).toBe('MIDI Monitor')
    expect(configStore.isModuleEnabled('midi-monitor')).toBe(false)
  })

  it('persists across a fresh store instance (round-trips through the DB layer)', async () => {
    const configStore = useConfigStore()
    await configStore.setModuleEnabled('drum-machine', false, { label: 'Drum Machine' })

    // Simulate a page reload: fresh pinia + fresh store, reload from persisted state.
    setActivePinia(createPinia())
    const reloaded = useConfigStore()
    await reloaded.init()

    expect(reloaded.isModuleEnabled('drum-machine')).toBe(false)
  })

  it('forces fab:"main" when enabling, so AppFooter/MainMenuDial show it without a separate AdminPanel trip', async () => {
    const configStore = useConfigStore()
    // Simulates a module seeded with fab:'settings' (e.g. sampler, device-program-change,
    // live-performance-pad in useConfigStore.init()'s migrations) — previously, enabling
    // it here left fab untouched, so it only ever showed in SideBar's gear menu.
    configStore.toolbarConfig.push({ id: 'sampler', label: 'Sampler', icon: 'Music2', enabled: false, fab: 'settings' })

    await configStore.setModuleEnabled('sampler', true)

    const entry = configStore.toolbarConfig.find(b => b.id === 'sampler')
    expect(entry.enabled).toBe(true)
    expect(entry.fab).toBe('main')
  })

  it('does not touch fab when disabling (irrelevant — enabled:false hides it everywhere regardless)', async () => {
    const configStore = useConfigStore()
    configStore.toolbarConfig.push({ id: 'sampler', label: 'Sampler', icon: 'Music2', enabled: true, fab: 'settings' })

    await configStore.setModuleEnabled('sampler', false)

    const entry = configStore.toolbarConfig.find(b => b.id === 'sampler')
    expect(entry.enabled).toBe(false)
    expect(entry.fab).toBe('settings')
  })

  it('a brand-new entry created by enabling gets fab:"main" too', async () => {
    const configStore = useConfigStore()
    await configStore.setModuleEnabled('midi-monitor', true, { label: 'MIDI Monitor' })
    const entry = configStore.toolbarConfig.find(b => b.id === 'midi-monitor')
    expect(entry.fab).toBe('main')
  })
})
