import { useAuthStore } from '@/stores/useAuthStore'
import { userKey } from '@/lib/userKey'
import { usePresetStore } from '@/stores/usePresetStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useArpStore } from '@/stores/useArpStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useUiStore } from '@/stores/useUiStore'
import { db, collection, getDocs, clearCollectionRange, setDoc, doc } from '@/lib/idb'
import { loadControllerPresets, persistControllerPresets } from '@/lib/midi-controller-presets'
import { loadMixerConfigs, persistMixerConfigs } from '@/lib/audio-mixer-configs'

/**
 * session-manager.js
 * Handles full user data backup and restore, oriented towards musicians as "Sessions".
 */

// Raw localStorage-keyed state with no store setter safe to call from
// outside a live app context (MIDI Flow's routing config/matrix/keyboard
// split/virtual instruments/saved canvases, Chord Prog's slots & chain,
// the Audio Mixer's channel-slot assignments). Round-tripped as opaque JSON
// blobs and applied via localStorage + a page reload, the same pattern
// MidiSettingsPanel.vue's own config export/import already uses for this
// exact class of nested MIDI state.
const RAW_KEYS = {
  midiRoutingConfig:      'SYCORE_ADVANCED_MIDI_ROUTING',
  midiRoutingMatrix:      'S1_MIDI_ROUTING',
  midiInputRouting:       'SYCORE_INPUT_ROUTING',
  midiOutputRouteFilters: 'SYCORE_OUTPUT_ROUTE_FILTERS',
  midiKeyboardSplit:      'SYCORE_KEYBOARD_SPLIT',
  midiVirtualInstruments: 'S1_VIRTUAL_INSTRUMENTS',
  midiFlowConfigs:        'SYCORE_MIDI_FLOW_CONFIGS',
  midiFlowLastConfig:     'SYCORE_MIDI_FLOW_LAST_CONFIG',
  chordProgSlots:         'SYCORE_CHORD_PROG_SLOTS',
  chordProgChain:         'SYCORE_CHORD_PROG_CHAIN',
  mixerChannelSlots:      'S1_MIX_CHANNEL_SLOTS',
}

function readRawState() {
  const out = {}
  for (const [field, key] of Object.entries(RAW_KEYS)) {
    const raw = localStorage.getItem(userKey(key))
    if (raw === null) continue
    try { out[field] = JSON.parse(raw) } catch { /* skip malformed entry */ }
  }
  return out
}

function writeRawState(raw) {
  if (!raw) return
  for (const [field, key] of Object.entries(RAW_KEYS)) {
    if (raw[field] === undefined) continue
    localStorage.setItem(userKey(key), JSON.stringify(raw[field]))
  }
}

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

    // 1b. Chord Progression Sequencer's saved library — a separate
    // Firestore-like sub-collection, not touched by the presets query above.
    const chordColRef = collection(db, 'users', uid, 'chord_progressions')
    const chordSnapshot = await getDocs(chordColRef)
    const chordProgressions = chordSnapshot.docs.map(d => ({ ...d.data(), id: d.id }))

    // 1c. MIDI Controller Designer presets and Audio Mixer configs — each a
    // single IDB doc under users/{uid}/system/*, read via their own lib.
    const midiControllerPresets = await loadControllerPresets()
    const audioMixerConfigs = await loadMixerConfigs()

    // 2. Aggregate session data
    const sessionData = {
      app: 'SY.CORE',
      version: '1.1',
      timestamp: new Date().toISOString(),
      metadata: {
        userName: authStore.profile?.email || authStore.user.email,
        presetCount: presets.length,
        osTarget: uiStore.osTarget || 'ROLAND S-1'
      },
      data: {
        presets: presets,
        chordProgressions: chordProgressions,
        midiControllerPresets: midiControllerPresets,
        audioMixerConfigs: audioMixerConfigs,
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
        },
        // Opaque blob: MIDI Flow routing config/matrix/input routing/output
        // filters/keyboard split/virtual instruments/saved named canvas
        // configs, Chord Prog's 8 slots (A-H) + chain, Audio Mixer's
        // channel-slot assignments.
        raw: readRawState(),
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

    // 2b. Restore Chord Progression Sequencer's saved library (Snapshot mode,
    // same wipe-then-restore approach as presets — separate sub-collection).
    if (Array.isArray(data.chordProgressions)) {
      console.log(`[SessionManager] Restoring ${data.chordProgressions.length} chord progressions...`)
      await clearCollectionRange('user_chord_progressions', uid)
      for (const p of data.chordProgressions) {
        const pRef = doc(db, 'users', uid, 'chord_progressions', p.id)
        await setDoc(pRef, p)
      }
    }

    // 2c. Restore MIDI Controller Designer presets and Audio Mixer configs
    // (each a single IDB doc — a plain overwrite, no range-clear needed).
    if (Array.isArray(data.midiControllerPresets)) {
      await persistControllerPresets(data.midiControllerPresets)
    }
    if (Array.isArray(data.audioMixerConfigs)) {
      await persistMixerConfigs(data.audioMixerConfigs)
    }

    // 3. Restore MIDI Mappings (localStorage)
    if (data.midiMappings) {
      mappingStore.midiMappings = data.midiMappings
      localStorage.setItem(userKey('midiMappings'), JSON.stringify(data.midiMappings))
    }

    // 4. Restore App MIDI Mappings (IDB)
    if (Array.isArray(data.appMidiMappings)) {
      await mappingStore.saveAppMidiMappings(data.appMidiMappings)
    }

    // 5. Restore Component Stores
    if (data.arpSettings) {
      arpStore.arpEnabled = data.arpSettings.arpEnabled
      arpStore.arpMode = data.arpSettings.arpMode
      if (data.arpSettings.arpBpm) midiStore.setGlobalBpm(data.arpSettings.arpBpm)
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

    // 7. Restore MIDI Flow routing (config/matrix/input routing/output
    // filters/keyboard split/virtual instruments/saved canvases), Chord
    // Prog's slots & chain, and the Audio Mixer's channel-slot assignments.
    // These have no live setter safe to call from here, so they're written
    // straight to localStorage and only take effect after the reload below —
    // same approach as MidiSettingsPanel.vue's own config import.
    writeRawState(data.raw)

    console.log('[SessionManager] Session restored successfully')
    const result = { count: data.presets?.length || 0 }
    if (data.raw) {
      // A reload is required for the MIDI Flow/Chord Prog/Mixer state above
      // to actually take effect (it was only written to localStorage, not
      // into the live stores this session already initialized from).
      setTimeout(() => window.location.reload(), 1500)
    }
    return result
  } catch (error) {
    console.error('[SessionManager] Import failed:', error)
    throw error
  }
}
