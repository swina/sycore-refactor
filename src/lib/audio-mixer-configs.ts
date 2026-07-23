import { getDoc, setDoc, doc, db } from '@/lib/idb'
import { auth } from '@/lib/auth'
import type { ChannelSlotAssignment } from '@/stores/useAudioMixerStore'

export interface MixerConfigChannel {
  slot: ChannelSlotAssignment
  vol: number
  muted: boolean
}

export interface MixerConfig {
  id: string
  name: string
  createdAt: number
  updatedAt?: number
  channels: MixerConfigChannel[]
  masterVol: number
}

const IDB_DOC = 'audioMixerConfigs'

function userDoc() {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Not authenticated')
  return doc(db, 'users', uid, 'system', IDB_DOC)
}

export async function loadMixerConfigs(): Promise<MixerConfig[]> {
  try {
    const snap = await getDoc(userDoc())
    if (!snap.exists()) return []
    const data = snap.data()
    return Array.isArray(data?.configs) ? data.configs : []
  } catch {
    return []
  }
}

export async function persistMixerConfigs(configs: MixerConfig[]): Promise<void> {
  await setDoc(userDoc(), { configs })
}

export function createMixerConfig(
  name: string,
  partial: Partial<MixerConfig> = {}
): MixerConfig {
  return {
    id: Math.random().toString(36).slice(2, 11),
    name,
    createdAt: Date.now(),
    channels: [],
    masterVol: 1,
    ...partial,
  }
}
