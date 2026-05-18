import { useAuthStore } from '@/stores/useAuthStore'
import { usePresetStore } from '@/stores/usePresetStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useArpStore } from '@/stores/useArpStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useUiStore } from '@/stores/useUiStore'
import { db, collection, getDocs, clearCollectionRange, setDoc, doc } from '@/lib/idb'

/**
 * session-manager.js
 * Handles full user data backup and restore, oriented towards musicians as "Sessions".
 */

export async function exportSession() {
  const authStore = useAuthStore()
  const mappingStore = useMappingStore()
  const arpStore = useArpStore()
  const midiStore = useMidiStore()
  const uiStore = useUiStore()

  if (!authStore.user) {
    console.error('[SessionManager] User not logged in, cannot export session')
    return
  }

  const uid = authStore.user.uid

  try {
    // 1. Fetch all presets from IDB for the current user
    const colRef = collection(db, 'users', uid, 'presets')
    const snapshot = await getDocs(colRef)
    const presets = snapshot.docs.map(d => ({ ...d.data(), id: d.id }))

    // 2. Aggregate session data
    const sessionData = {
      app: 'SY.CORE',
      version: '1.0',
      timestamp: new Date().toISOString(),
      metadata: {
        userName: authStore.profile?.email || authStore.user.email,
        presetCount: presets.length,
        osTarget: uiStore.osTarget || 'ROLAND S-1'
      },
      data: {
        presets: presets,
        midiMappings: mappingStore.midiMappings,
        appMidiMappings: mappingStore.appMidiMappings,
        arpSettings: {
          arpEnabled: arpStore.arpEnabled,
          arpMode: arpStore.arpMode,
          arpBpm: arpStore.arpBpm,
          arpSubdivision: arpStore.arpSubdivision,
          arpHold: arpStore.arpHold
        },
        midiSettings: {
          midiChannel: midiStore.midiChannel,
          midiInputChannel: midiStore.midiInputChannel,
          sendClock: midiStore.sendClock
        },
        uiSettings: {
          globalModCC: uiStore.globalModCC,
          globalTranspose: uiStore.globalTranspose,
          toolbarIconSize: uiStore.toolbarIconSize,
          activeVisualizerCategory: uiStore.activeVisualizerCategory,
          seqCurrentConfig: uiStore.seqCurrentConfig
        }
      }
    }

    // 3. Create and trigger download
    const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const fileName = `SYCORE_Session_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    console.log(`[SessionManager] Exported ${presets.length} presets to ${fileName}`)
  } catch (error) {
    console.error('[SessionManager] Export failed:', error)
    throw error
  }
}

export async function importSession(jsonContent) {
  const authStore = useAuthStore()
  const presetStore = usePresetStore()
  const mappingStore = useMappingStore()
  const arpStore = useArpStore()
  const midiStore = useMidiStore()
  const uiStore = useUiStore()

  if (!authStore.user) throw new Error('AUTH_REQUIRED')
  
  let session
  try {
    session = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent
  } catch (e) {
    throw new Error('INVALID_JSON')
  }

  if (!session || !session.data) throw new Error('INVALID_SESSION_FORMAT')

  const uid = authStore.user.uid
  const { data } = session

  try {
    // 1. Wipe current presets for this user (Snapshot mode)
    console.log(`[SessionManager] Wiping current presets for ${uid}...`)
    await clearCollectionRange('user_presets', uid)

    // 2. Restore presets to IDB
    if (Array.isArray(data.presets)) {
      console.log(`[SessionManager] Restoring ${data.presets.length} presets...`)
      for (const p of data.presets) {
        const pRef = doc(db, 'users', uid, 'presets', p.id)
        await setDoc(pRef, p)
      }
    }

    // 3. Restore MIDI Mappings (localStorage)
    if (data.midiMappings) {
      mappingStore.midiMappings = data.midiMappings
      localStorage.setItem('midiMappings', JSON.stringify(data.midiMappings))
    }

    // 4. Restore App MIDI Mappings (IDB)
    if (Array.isArray(data.appMidiMappings)) {
      await mappingStore.saveAppMidiMappings(data.appMidiMappings)
    }

    // 5. Restore Component Stores
    if (data.arpSettings) {
      arpStore.arpEnabled = data.arpSettings.arpEnabled
      arpStore.arpMode = data.arpSettings.arpMode
      arpStore.arpBpm = data.arpSettings.arpBpm
      arpStore.arpSubdivision = data.arpSettings.arpSubdivision
      arpStore.arpHold = data.arpSettings.arpHold
    }

    if (data.midiSettings) {
      midiStore.setMidiChannel(data.midiSettings.midiChannel || 1)
      midiStore.setMidiInputChannel(data.midiSettings.midiInputChannel || -1)
      if (data.midiSettings.sendClock !== undefined) {
        midiStore.setSendClock(data.midiSettings.sendClock)
      }
    }

    if (data.uiSettings) {
      uiStore.globalModCC = data.uiSettings.globalModCC ?? 1
      uiStore.globalTranspose = data.uiSettings.globalTranspose ?? 0
      uiStore.toolbarIconSize = data.uiSettings.toolbarIconSize ?? 'md'
      if (data.uiSettings.activeVisualizerCategory) {
        uiStore.activeVisualizerCategory = data.uiSettings.activeVisualizerCategory
      }
      if (data.uiSettings.seqCurrentConfig) {
        uiStore.seqCurrentConfig = data.uiSettings.seqCurrentConfig
      }
    }

    // 6. Force reload the preset history
    await presetStore.loadHistory(uid)
    
    console.log('[SessionManager] Session restored successfully')
    return { count: data.presets?.length || 0 }
  } catch (error) {
    console.error('[SessionManager] Import failed:', error)
    throw error
  }
}
