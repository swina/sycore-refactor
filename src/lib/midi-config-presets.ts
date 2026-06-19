import { getDoc, setDoc, doc, db } from '@/lib/idb'
import { auth } from '@/lib/auth'

export interface SmartLatchConfig {
  active: boolean
  maxNotes: number
  replaceMode: boolean
  fadeTime: number
}

export interface MidiConfigSnapshot {
  id: string
  name: string
  createdAt: number
  updatedAt?: number
  routingMatrix: Record<string, string[]>
  registrations: Record<string, any>
  broadcastMode: boolean
  smartLatch: SmartLatchConfig
  activeMappingPresetId: string | null
  splitConfig: any
  midiChannel: number
  midiInputChannel: number
  sendClock: boolean
  syncMidiTransport: boolean
  syncSequencerTransport: boolean
}

const IDB_DOC = 'midiConfigPresets'
export const AUTOSAVE_CONFIG_ID = '__autosave__'

function userDoc() {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Not authenticated')
  return doc(db, 'users', uid, 'system', IDB_DOC)
}

export async function loadConfigPresets(): Promise<MidiConfigSnapshot[]> {
  try {
    const snap = await getDoc(userDoc())
    if (!snap.exists()) return []
    const data = snap.data()
    return Array.isArray(data?.presets) ? data.presets : []
  } catch {
    return []
  }
}

export async function persistConfigPresets(presets: MidiConfigSnapshot[]): Promise<void> {
  await setDoc(userDoc(), { presets })
}

export function createConfigPreset(
  name: string,
  partial: Partial<MidiConfigSnapshot> = {}
): MidiConfigSnapshot {
  return {
    id: Math.random().toString(36).slice(2, 11),
    name,
    createdAt: Date.now(),
    routingMatrix: {},
    registrations: {},
    broadcastMode: false,
    smartLatch: { active: false, maxNotes: 4, replaceMode: true, fadeTime: 0 },
    activeMappingPresetId: null,
    splitConfig: {
      enabled: false, splitNote: 60,
      lowDevice: '', highDevice: '',
      lowTranspose: 0, highTranspose: 0,
    },
    midiChannel: 1,
    midiInputChannel: -1,
    sendClock: false,
    syncMidiTransport: false,
    syncSequencerTransport: false,
    ...partial,
  }
}
