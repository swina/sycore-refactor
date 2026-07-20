import { defineStore } from 'pinia'
import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import { db, getDoc, setDoc, doc } from '@/lib/idb'
import { DEFAULT_ROLES_CONFIG, type RolesConfig, type RoleConfig } from '@/lib/roles'
import systemSeed from '@/data/system_config.json'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolbarButton {
  id: string
  label: string
  icon: string
  enabled: boolean
  fab?: string
  toolbar?: string
}

export interface ControlCategory {
  id: string
  name: string
  color: string
  order: number
}

export interface MidiController {
  id?: string
  name: string
  type?: string
  [key: string]: any
}

export interface AppSettings {
  appVersion: string
  appEngine: string
  appName: string
  appSubtitle: string
  osTarget: string
  toolbarIconSize: number
  syncMidiTransportFromLivePad: boolean
  enablePartSelector: boolean
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useConfigStore = defineStore('config', () => {
  const rolesConfig: Ref<RolesConfig> = ref({ ...DEFAULT_ROLES_CONFIG })
  const appSoundTypes: Ref<any[]> = ref([])
  const soundTypeBg: Ref<Record<string, any>> = ref({})
  const midiConfig: Ref<MidiController[]> = ref([])
  const categories: Ref<ControlCategory[]> = ref([])
  const appVersion: Ref<string> = ref('')
  const appEngine: Ref<string> = ref('')
  const appName: Ref<string> = ref('SY.CORE')
  const appSubtitle: Ref<string> = ref('for ROLAND S-1 Tweak Synth')
  const osTarget: Ref<string> = ref('')
  const toolbarConfig: Ref<ToolbarButton[]> = ref([])
  const toolbarIconSize: Ref<number> = ref(6)
  const syncMidiTransportFromLivePad: Ref<boolean> = ref(true)
  const enablePartSelector: Ref<boolean> = ref(true)

  const appSettings: ComputedRef<AppSettings> = computed(() => ({
    appVersion: appVersion.value,
    appEngine: appEngine.value,
    appName: appName.value,
    appSubtitle: appSubtitle.value,
    osTarget: osTarget.value,
    toolbarIconSize: toolbarIconSize.value,
    syncMidiTransportFromLivePad: syncMidiTransportFromLivePad.value,
    enablePartSelector: enablePartSelector.value,
  }))

  async function init(): Promise<void> {
    try {
      console.log('[ConfigStore] Initializing...')

      const settingsRef = doc(db, 'system', 'app_settings')
      const settingsSnap = await getDoc(settingsRef)

      if (!settingsSnap.exists()) {
        console.warn('[ConfigStore] Empty DB detected. Seeding system config...')
        if (Array.isArray(systemSeed)) {
          for (const item of systemSeed) {
            if (item.key && item.value) {
              await setDoc(doc(db, 'system', item.key), item.value)
            }
          }
          console.log('[ConfigStore] System seeding complete')
        }
      }

      // Roles
      const rolesSnap = await getDoc(doc(db, 'system', 'roles_config'))
      if (rolesSnap.exists()) rolesConfig.value = rolesSnap.data() as RolesConfig

      // Sound Types
      const typesSnap = await getDoc(doc(db, 'system', 'sound_types_config'))
      if (typesSnap.exists() && Array.isArray((typesSnap.data() as any).list)) {
        appSoundTypes.value = (typesSnap.data() as any).list
      }

      // Sound Type BGs
      const bgSnap = await getDoc(doc(db, 'system', 'sound_type_bg'))
      if (bgSnap.exists()) {
        const data = bgSnap.data() as Record<string, any>
        soundTypeBg.value = Object.fromEntries(
          Object.entries(data).filter(([key]) => key !== 'updatedAt')
        )
      }

      // MIDI Config
      const midiSnap = await getDoc(doc(db, 'system', 'midi_config'))
      if (midiSnap.exists() && Array.isArray((midiSnap.data() as any).controllers)) {
        midiConfig.value = (midiSnap.data() as any).controllers
      }

      // Categories
      const catSnap = await getDoc(doc(db, 'system', 'categories_config'))
      if (catSnap.exists() && Array.isArray((catSnap.data() as any).list)) {
        categories.value = (catSnap.data() as any).list.sort(
          (a: any, b: any) => (a.order || 0) - (b.order || 0)
        )
      }

      // App Settings & Toolbar
      const appSnap = await getDoc(doc(db, 'system', 'app_settings'))
      if (appSnap.exists()) {
        const appData = appSnap.data() as Record<string, any>
        appVersion.value = appData.appVersion || ''
        appEngine.value = appData.appEngine || ''
        appName.value = appData.appName || 'SY.CORE'
        appSubtitle.value = appData.appSubtitle || 'for ROLAND S-1 Tweak Synth'
        osTarget.value = appData.osTarget || ''
        if (Array.isArray(appData.toolbar)) {
          toolbarConfig.value = appData.toolbar

          // Migration: Ensure 'session' button exists
          if (!toolbarConfig.value.find((b: ToolbarButton) => b.id === 'session')) {
            console.log('[ConfigStore] Migration: Adding session button to toolbar')
            toolbarConfig.value.push({
              id: 'session', label: 'Session', icon: 'Save',
              enabled: true, fab: 'settings', toolbar: 'main',
            })
            setDoc(doc(db, 'system', 'app_settings'), {
              ...appData, toolbar: toolbarConfig.value, updatedAt: new Date().toISOString(),
            }).catch(err => console.error('[ConfigStore] Migration save failed', err))
          }

          // Migration: Ensure 'looper' button exists
          if (!toolbarConfig.value.find((b: ToolbarButton) => b.id === 'looper')) {
            console.log('[ConfigStore] Migration: Adding looper button to toolbar')
            toolbarConfig.value.push({
              id: 'looper', label: 'Looper', icon: 'RotateCw',
              enabled: true, toolbar: 'main',
            })
            setDoc(doc(db, 'system', 'app_settings'), {
              ...appData, toolbar: toolbarConfig.value, updatedAt: new Date().toISOString(),
            }).catch(err => console.error('[ConfigStore] Migration save failed', err))
          }

          // Migration: Rename experimental/advancedmidi → midi_matrix
          const legacyIdx = toolbarConfig.value.findIndex(
            (b: ToolbarButton) => b.id === 'experimental' || b.id === 'advancedmidi'
          )
          if (legacyIdx !== -1) {
            console.log(`[ConfigStore] Migration: Renaming ${toolbarConfig.value[legacyIdx].id} to midi_matrix`)
            toolbarConfig.value[legacyIdx].id = 'midi_matrix'
            toolbarConfig.value[legacyIdx].label = 'MIDI Matrix'
            toolbarConfig.value[legacyIdx].icon = 'Network'
            toolbarConfig.value[legacyIdx].fab = 'settings'
            setDoc(doc(db, 'system', 'app_settings'), {
              ...appData, toolbar: toolbarConfig.value, updatedAt: new Date().toISOString(),
            }).catch(err => console.error('[ConfigStore] Migration rename failed', err))
          } else if (!toolbarConfig.value.find((b: ToolbarButton) => b.id === 'midi_matrix')) {
            console.log('[ConfigStore] Migration: Adding midi_matrix button to toolbar')
            toolbarConfig.value.push({
              id: 'midi_matrix', label: 'MIDI Matrix', icon: 'Network',
              enabled: true, fab: 'settings', toolbar: 'main',
            })
            setDoc(doc(db, 'system', 'app_settings'), {
              ...appData, toolbar: toolbarConfig.value, updatedAt: new Date().toISOString(),
            }).catch(err => console.error('[ConfigStore] Migration add failed', err))
          }

          // Migration: Add device-program-change button
          if (!toolbarConfig.value.find((b: ToolbarButton) => b.id === 'device-program-change')) {
            console.log('[ConfigStore] Migration: Adding device-program-change button to toolbar')
            toolbarConfig.value.push({
              id: 'device-program-change', label: 'Device Program Change', icon: 'Disc3',
              enabled: false, fab: 'settings', toolbar: 'main',
            })
            setDoc(doc(db, 'system', 'app_settings'), {
              ...appData, toolbar: toolbarConfig.value, updatedAt: new Date().toISOString(),
            }).catch(err => console.error('[ConfigStore] Migration device-program-change failed', err))
          }

          // Migration: Add guides button
          if (!toolbarConfig.value.find((b: ToolbarButton) => b.id === 'guides')) {
            console.log('[ConfigStore] Migration: Adding guides button to toolbar')
            toolbarConfig.value.push({
              id: 'guides', label: 'Guides', icon: 'BookOpen',
              enabled: true, fab: 'main', toolbar: 'main',
            })
            setDoc(doc(db, 'system', 'app_settings'), {
              ...appData, toolbar: toolbarConfig.value, updatedAt: new Date().toISOString(),
            }).catch(err => console.error('[ConfigStore] Migration guides failed', err))
          }

          // Migration: Add sampler button
          if (!toolbarConfig.value.find((b: ToolbarButton) => b.id === 'sampler')) {
            console.log('[ConfigStore] Migration: Adding sampler button to toolbar')
            toolbarConfig.value.push({
              id: 'sampler', label: 'Sampler', icon: 'Music2',
              enabled: false, fab: 'settings', toolbar: 'main',
            })
            setDoc(doc(db, 'system', 'app_settings'), {
              ...appData, toolbar: toolbarConfig.value, updatedAt: new Date().toISOString(),
            }).catch(err => console.error('[ConfigStore] Migration sampler failed', err))
          }

          // Migration: Add live-performance-pad button
          if (!toolbarConfig.value.find((b: ToolbarButton) => b.id === 'live-performance-pad')) {
            console.log('[ConfigStore] Migration: Adding live-performance-pad button to toolbar')
            toolbarConfig.value.push({
              id: 'live-performance-pad', label: 'Live Performance', icon: 'Layers',
              enabled: false, fab: 'settings', toolbar: 'main',
            })
            setDoc(doc(db, 'system', 'app_settings'), {
              ...appData, toolbar: toolbarConfig.value, updatedAt: new Date().toISOString(),
            }).catch(err => console.error('[ConfigStore] Migration live-performance-pad failed', err))
          }
        }
        if (appData.toolbarIconSize) {
          toolbarIconSize.value = appData.toolbarIconSize
        }
        syncMidiTransportFromLivePad.value = appData.syncMidiTransportFromLivePad ?? true
        enablePartSelector.value = appData.enablePartSelector ?? true
      }

      console.log('[ConfigStore] Initialization complete')
    } catch (e) {
      console.error('[ConfigStore] Initialization failed', e)
    }
  }

  async function saveRolesConfig(config: RolesConfig): Promise<void> {
    rolesConfig.value = config
    await setDoc(doc(db, 'system', 'roles_config'), { ...config, updatedAt: new Date().toISOString() })
  }

  async function saveMidiConfig(controllers: MidiController[]): Promise<void> {
    midiConfig.value = controllers
    await setDoc(doc(db, 'system', 'midi_config'), { controllers, updatedAt: new Date().toISOString() })
  }

  async function saveSoundTypes(types: any[]): Promise<void> {
    appSoundTypes.value = types
    await setDoc(doc(db, 'system', 'sound_types_config'), { list: types, updatedAt: new Date().toISOString() })
  }

  async function saveSoundTypeBg(bg: Record<string, any>): Promise<void> {
    soundTypeBg.value = bg
    await setDoc(doc(db, 'system', 'sound_type_bg'), { ...bg, updatedAt: new Date().toISOString() })
  }

  /**
   * Whether a module/toolbar-button id is enabled per the admin-configured
   * toolbarConfig (see AdminPanel.vue's "Toolbar Settings" section). Missing
   * ids default to enabled — an id only becomes disabled once an admin
   * explicitly removes it via the toolbar picker (which sets enabled:false
   * rather than deleting the entry). See docs/plans/modular-panel-system.md.
   */
  function isModuleEnabled(id: string): boolean {
    const entry = toolbarConfig.value.find(b => b.id === id)
    return entry?.enabled ?? true
  }

  /**
   * Sets a module's enabled state and persists it immediately (unlike
   * AdminPanel.vue's "Toolbar Settings" section, which stages edits to a
   * local copy until "Sync Configuration" is clicked). Used by
   * ModuleManagerPanel.vue, where each toggle is a standalone action.
   * Writes to the same app_settings.toolbar doc, so both admin surfaces
   * share one persisted source of truth.
   *
   * Enabling always sets fab:'main' too, so the module is guaranteed to
   * show up in AppFooter/MainMenuDial's main menu without a separate trip
   * to AdminPanel's Toolbar Settings to fix its FAB placement — this
   * matters for modules that were previously seeded with fab:'settings'
   * (e.g. device-program-change, sampler, live-performance-pad in
   * useConfigStore.init()'s migrations), which would otherwise only ever
   * appear in SideBar's gear menu even once "enabled".
   */
  async function setModuleEnabled(id: string, enabled: boolean, meta?: { label?: string; icon?: string }): Promise<void> {
    const entry = toolbarConfig.value.find(b => b.id === id)
    if (entry) {
      entry.enabled = enabled
      if (enabled) entry.fab = 'main'
    } else {
      toolbarConfig.value.push({
        id, enabled,
        label: meta?.label || id,
        icon: meta?.icon || 'HelpCircle',
        fab: enabled ? 'main' : undefined,
      })
    }
    await saveAppSettings()
  }

  async function saveAppSettings(): Promise<void> {
    await setDoc(doc(db, 'system', 'app_settings'), {
      appVersion: appVersion.value,
      appEngine: appEngine.value,
      appName: appName.value,
      appSubtitle: appSubtitle.value,
      osTarget: osTarget.value,
      toolbar: toolbarConfig.value,
      toolbarIconSize: toolbarIconSize.value,
      syncMidiTransportFromLivePad: syncMidiTransportFromLivePad.value,
      enablePartSelector: enablePartSelector.value,
      updatedAt: new Date().toISOString(),
    })
  }

  return {
    rolesConfig, appSoundTypes,
    soundTypeBg, midiConfig, categories, appVersion, appEngine,
    appName, appSubtitle, osTarget, toolbarConfig, toolbarIconSize,
    syncMidiTransportFromLivePad, enablePartSelector, appSettings,
    init,
    saveRolesConfig, saveMidiConfig,
    saveSoundTypes, saveSoundTypeBg, saveAppSettings,
    isModuleEnabled, setModuleEnabled,
  }
})