import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { db, getDoc, setDoc, doc } from '@/lib/idb'
import { DEFAULT_ROLES_CONFIG } from '@/lib/roles'
import systemSeed from '@/data/system_config.json'

export const useConfigStore = defineStore('config', () => {
  const rolesConfig = ref({ ...DEFAULT_ROLES_CONFIG })
  const appSoundTypes = ref([])
  const soundTypeBg = ref({})
  const midiConfig = ref([])   // MidiController[] from admin panel
  const categories = ref([])   // ControlCategory[] { id, name, color, order }
  const appVersion = ref('')
  const appEngine = ref('')
  const appName = ref('SY.CORE')
  const appSubtitle = ref('for ROLAND S-1 Tweak Synth')
  const osTarget = ref('')
  const toolbarConfig = ref([])  // Array of toolbar button configs
  const toolbarIconSize = ref(6)
  const syncMidiTransportFromLivePad = ref(true)
  const enablePartSelector = ref(true)

  // Combined app settings for convenience
  const appSettings = computed(() => ({
    appVersion: appVersion.value,
    appEngine: appEngine.value,
    appName: appName.value,
    appSubtitle: appSubtitle.value,
    osTarget: osTarget.value,
    toolbarIconSize: toolbarIconSize.value,
    syncMidiTransportFromLivePad: syncMidiTransportFromLivePad.value,
    enablePartSelector: enablePartSelector.value
  }))

  async function init() {
    try {
      console.log('[ConfigStore] Initializing...')

      // 1. Defensive seeding for empty DB
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

      // 2. Load all system configs into memory
      // Roles
      const rolesSnap = await getDoc(doc(db, 'system', 'roles_config'))
      if (rolesSnap.exists()) rolesConfig.value = rolesSnap.data()

      // Sound Types
      const typesSnap = await getDoc(doc(db, 'system', 'sound_types_config'))
      if (typesSnap.exists() && Array.isArray(typesSnap.data().list)) {
        appSoundTypes.value = typesSnap.data().list
      }

      // Sound Type BGs
      const bgSnap = await getDoc(doc(db, 'system', 'sound_type_bg'))
      if (bgSnap.exists()) {
        const data = bgSnap.data()
        soundTypeBg.value = Object.fromEntries(
          Object.entries(data).filter(([key]) => key !== 'updatedAt')
        )
      }

      // MIDI Config
      const midiSnap = await getDoc(doc(db, 'system', 'midi_config'))
      if (midiSnap.exists() && Array.isArray(midiSnap.data().controllers)) {
        midiConfig.value = midiSnap.data().controllers
      }

      // Categories
      const catSnap = await getDoc(doc(db, 'system', 'categories_config'))
      if (catSnap.exists() && Array.isArray(catSnap.data().list)) {
        categories.value = catSnap.data().list.sort((a, b) => (a.order || 0) - (b.order || 0))
      }

      // App Settings & Toolbar
      const appSnap = await getDoc(doc(db, 'system', 'app_settings'))
      if (appSnap.exists()) {
        const appData = appSnap.data()
        appVersion.value = appData.appVersion || ''
        appEngine.value = appData.appEngine || ''
        appName.value = appData.appName || 'SY.CORE'
        appSubtitle.value = appData.appSubtitle || 'for ROLAND S-1 Tweak Synth'
        osTarget.value = appData.osTarget || ''
        if (Array.isArray(appData.toolbar)) {
          toolbarConfig.value = appData.toolbar

          // Migration: Ensure 'session' button exists for existing DBs
          if (!toolbarConfig.value.find(b => b.id === 'session')) {
            console.log('[ConfigStore] Migration: Adding session button to toolbar')
            toolbarConfig.value.push({
              id: 'session',
              label: 'Session',
              icon: 'Save',
              enabled: true,
              fab: 'settings',
              toolbar: 'main'
            })
            // Self-persist the migration
            setDoc(doc(db, 'system', 'app_settings'), {
              ...appData,
              toolbar: toolbarConfig.value,
              updatedAt: new Date().toISOString()
            }).catch(err => console.error('[ConfigStore] Migration save failed', err))
          }

          // Migration: Ensure 'looper' button exists
          if (!toolbarConfig.value.find(b => b.id === 'looper')) {
            console.log('[ConfigStore] Migration: Adding looper button to toolbar')
            toolbarConfig.value.push({
              id: 'looper',
              label: 'Looper',
              icon: 'RotateCw',
              enabled: true,
              toolbar: 'main'
            })
            // Self-persist the migration
            setDoc(doc(db, 'system', 'app_settings'), {
              ...appData,
              toolbar: toolbarConfig.value,
              updatedAt: new Date().toISOString()
            }).catch(err => console.error('[ConfigStore] Migration save failed', err))
          }
          // Migration: Rename experimental/advancedmidi to midi_matrix
          const legacyIdx = toolbarConfig.value.findIndex(b => b.id === 'experimental' || b.id === 'advancedmidi')
          if (legacyIdx !== -1) {
            console.log(`[ConfigStore] Migration: Renaming ${toolbarConfig.value[legacyIdx].id} to midi_matrix`)
            toolbarConfig.value[legacyIdx].id = 'midi_matrix'
            toolbarConfig.value[legacyIdx].label = 'MIDI Matrix'
            toolbarConfig.value[legacyIdx].icon = 'Network'
            toolbarConfig.value[legacyIdx].fab = 'settings'
            // Self-persist
            setDoc(doc(db, 'system', 'app_settings'), {
              ...appData,
              toolbar: toolbarConfig.value,
              updatedAt: new Date().toISOString()
            }).catch(err => console.error('[ConfigStore] Migration rename failed', err))
          } else if (!toolbarConfig.value.find(b => b.id === 'midi_matrix')) {
            console.log('[ConfigStore] Migration: Adding midi_matrix button to toolbar')
            toolbarConfig.value.push({
              id: 'midi_matrix',
              label: 'MIDI Matrix',
              icon: 'Network',
              enabled: true,
              fab: 'settings',
              toolbar: 'main'
            })
            // Self-persist
            setDoc(doc(db, 'system', 'app_settings'), {
              ...appData,
              toolbar: toolbarConfig.value,
              updatedAt: new Date().toISOString()
            }).catch(err => console.error('[ConfigStore] Migration add failed', err))
          }

          // Migration: Add device-program-change button
          if (!toolbarConfig.value.find(b => b.id === 'device-program-change')) {
            console.log('[ConfigStore] Migration: Adding device-program-change button to toolbar')
            toolbarConfig.value.push({
              id: 'device-program-change',
              label: 'Device Program Change',
              icon: 'Disc3',
              enabled: false,
              fab: 'settings',
              toolbar: 'main'
            })
            setDoc(doc(db, 'system', 'app_settings'), {
              ...appData,
              toolbar: toolbarConfig.value,
              updatedAt: new Date().toISOString()
            }).catch(err => console.error('[ConfigStore] Migration device-program-change failed', err))
          }

          // Migration: Add guides button
          if (!toolbarConfig.value.find(b => b.id === 'guides')) {
            console.log('[ConfigStore] Migration: Adding guides button to toolbar')
            toolbarConfig.value.push({
              id: 'guides',
              label: 'Guides',
              icon: 'BookOpen',
              enabled: true,
              fab: 'main',
              toolbar: 'main'
            })
            setDoc(doc(db, 'system', 'app_settings'), {
              ...appData,
              toolbar: toolbarConfig.value,
              updatedAt: new Date().toISOString()
            }).catch(err => console.error('[ConfigStore] Migration guides failed', err))
          }

          // Migration: Add live-performance-pad button
          if (!toolbarConfig.value.find(b => b.id === 'live-performance-pad')) {
            console.log('[ConfigStore] Migration: Adding live-performance-pad button to toolbar')
            toolbarConfig.value.push({
              id: 'live-performance-pad',
              label: 'Live Performance',
              icon: 'Layers',
              enabled: false,
              fab: 'settings',
              toolbar: 'main'
            })
            setDoc(doc(db, 'system', 'app_settings'), {
              ...appData,
              toolbar: toolbarConfig.value,
              updatedAt: new Date().toISOString()
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

  async function saveRolesConfig(config) {
    rolesConfig.value = config
    await setDoc(doc(db, 'system', 'roles_config'), { ...config, updatedAt: new Date().toISOString() })
  }

  async function saveMidiConfig(controllers) {
    midiConfig.value = controllers
    await setDoc(doc(db, 'system', 'midi_config'), { controllers, updatedAt: new Date().toISOString() })
  }

  async function saveSoundTypes(types) {
    appSoundTypes.value = types
    await setDoc(doc(db, 'system', 'sound_types_config'), { list: types, updatedAt: new Date().toISOString() })
  }

  async function saveSoundTypeBg(bg) {
    soundTypeBg.value = bg
    await setDoc(doc(db, 'system', 'sound_type_bg'), { ...bg, updatedAt: new Date().toISOString() })
  }

  async function saveAppSettings() {
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
  }
})
