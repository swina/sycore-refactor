import { db, getDoc, setDoc, doc } from '@/lib/idb'

export interface VelocityConfig {
  active: boolean
  targetParameter: string
  amount: number
  curve: string
}

export interface MappingPreset {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  mappings: Record<string, any>   // key → mapping entry (Device:CH:CC or NRPN:MSB:LSB format)
  appMappings: any[]              // AppMidiMapping[]
  velocityConfig: VelocityConfig
}

const IDB_COLLECTION = 'system'
const IDB_DOC_ID = 'midiMappingPresets'
const AUTOSAVE_ID = '__autosave__'

function generateId(): string {
  return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export async function loadMappingPresets(): Promise<MappingPreset[]> {
  try {
    const snap = await getDoc(doc(db, IDB_COLLECTION, IDB_DOC_ID))
    if (snap.exists()) {
      const data = snap.data()
      return Array.isArray(data?.presets) ? data.presets : []
    }
  } catch (e) {
    console.error('[MappingPresets] Failed to load presets', e)
  }
  return []
}

export async function persistMappingPresets(presets: MappingPreset[]): Promise<void> {
  try {
    await setDoc(doc(db, IDB_COLLECTION, IDB_DOC_ID), { presets })
  } catch (e) {
    console.error('[MappingPresets] Failed to persist presets', e)
  }
}

export function createPreset(
  name: string,
  partial: Partial<MappingPreset> = {}
): MappingPreset {
  const now = Date.now()
  return {
    id: generateId(),
    name,
    createdAt: now,
    updatedAt: now,
    mappings: {},
    appMappings: [],
    velocityConfig: { active: false, targetParameter: 'cutoff', amount: 0, curve: 'linear' },
    ...partial,
  }
}

export function createAutosavePreset(partial: Partial<MappingPreset> = {}): MappingPreset {
  return createPreset('Auto-save', { ...partial, id: AUTOSAVE_ID })
}

export { AUTOSAVE_ID }
