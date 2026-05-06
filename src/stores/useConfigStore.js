import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db, getDoc, setDoc, doc } from '@/lib/idb'
import { DEFAULT_ROLES_CONFIG } from '@/lib/roles'

export const useConfigStore = defineStore('config', () => {
  const rolesConfig  = ref({ ...DEFAULT_ROLES_CONFIG })
  const appSoundTypes = ref([])
  const soundTypeBg  = ref({})
  const midiConfig   = ref([])   // MidiController[] from admin panel
  const categories   = ref([])   // ControlCategory[] { id, name, color, order }
  const appVersion   = ref('')
  const appEngine    = ref('')
  const appName      = ref('SY.CORE')
  const appSubtitle  = ref('for ROLAND S-1 Tweak Synth')
  const osTarget     = ref('')
  const toolbarConfig = ref([])  // Array of toolbar button configs
  const toolbarIconSize = ref(6)

  async function init() {
    try {
      // Load roles config
      const rolesSnap = await getDoc(doc(db, 'system', 'roles_config'))
      if (rolesSnap.exists()) rolesConfig.value = rolesSnap.data()

      // Load MIDI controller config
      const ctrlSnap = await getDoc(doc(db, 'system', 'midi_config'))
      if (ctrlSnap.exists() && Array.isArray(ctrlSnap.data().controllers)) {
        midiConfig.value = ctrlSnap.data().controllers
      }

      // Load categories config
      const catSnap = await getDoc(doc(db, 'system', 'categories_config'))
      if (catSnap.exists() && Array.isArray(catSnap.data().list)) {
        categories.value = catSnap.data().list.sort((a, b) => (a.order || 0) - (b.order || 0))
      } else {
        categories.value = [
          { id: 'LFO',        name: 'LFO',        color: '#794b20', order: 1 },
          { id: 'OSCILLATOR', name: 'OSCILLATOR',  color: '#26924a', order: 2 },
          { id: 'ENV',        name: 'ENV',         color: '#4dcfef', order: 3 },
          { id: 'FILTER',     name: 'FILTER',      color: '#be7c09', order: 4 },
          { id: 'EFX',        name: 'EFX',         color: '#d50bc4', order: 5 },
          { id: 'POLY',       name: 'POLY',        color: '#a30041', order: 6 },
          { id: 'ADVANCED',   name: 'ADVANCED',    color: '#b4b87a', order: 7 },
          { id: 'DYNAMIC',    name: 'DYNAMIC',     color: '#293a7f', order: 8 },
        ]
      }

      // Load sound types
      const typesSnap = await getDoc(doc(db, 'system', 'sound_types_config'))
      if (typesSnap.exists() && Array.isArray(typesSnap.data().list)) {
        appSoundTypes.value = typesSnap.data().list
      }

      // Load background images per sound type
      const bgSnap = await getDoc(doc(db, 'system', 'sound_type_bg'))
      if (bgSnap.exists()) {
        const data = bgSnap.data()
        soundTypeBg.value = Object.fromEntries(
          Object.entries(data).filter(([key]) => key !== 'updatedAt')
        )
      }

      // Load app metadata and toolbar config
      const appSnap = await getDoc(doc(db, 'system', 'app_settings'))
      if (appSnap.exists()) {
        const appData = appSnap.data()
        appVersion.value = appData.appVersion || ''
        appEngine.value  = appData.appEngine  || ''
        appName.value = appData.appName || 'SY.CORE'
        appSubtitle.value = appData.appSubtitle || 'for ROLAND S-1 Tweak Synth'
        osTarget.value = appData.osTarget || ''
        if (Array.isArray(appData.toolbar)) {
          toolbarConfig.value = appData.toolbar
        }
        if (appData.toolbarIconSize) {
          toolbarIconSize.value = appData.toolbarIconSize
        }
      }
    } catch (e) {
      console.error('Config load error', e)
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
      updatedAt: new Date().toISOString(),
    })
  }

  return {
    rolesConfig, appSoundTypes,
    soundTypeBg, midiConfig, categories, appVersion, appEngine,
    appName, appSubtitle, osTarget, toolbarConfig, toolbarIconSize,
    init,
    saveRolesConfig, saveMidiConfig,
    saveSoundTypes, saveSoundTypeBg, saveAppSettings,
  }
})
