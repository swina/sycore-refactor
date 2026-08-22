import { getDoc, setDoc, doc, db } from '@/lib/idb'
import { auth } from '@/lib/auth'
import { userKey } from '@/lib/userKey'

/**
 * Per-device patch state for a single channel — mirrors PcChannelState
 * (see types/midi.ts) plus the user-facing bank name.
 */
export interface PerformanceSetChannel {
  program: number | null;
  bank: string | null;
  soundName: string | null;
  category: string | null;
  msb: number;
  lsb: number;
}

/** One device's channel/patch association inside a performance set. */
export interface PerformanceSetDevice {
  deviceName: string;
  pcChannel: number;
  pcBank: string;
  pcProgram: number;
  pcMsb: number;
  pcLsb: number;
  /** Full per-channel patch map — every active channel, not just pcChannel. */
  pcChannels: Record<number, PerformanceSetChannel>;
  isUiDevice: boolean;
  lastPresetId: string | null;
  lastPresetName: string | null;
}

export interface PerformanceSet {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
  midiChannel: number;
  devices: PerformanceSetDevice[];
}

const IDB_DOC_ID = 'midiPerformanceSets'
export const LS_PC_SETS = 'SYCORE_PC_PERFORMANCE_SETS'

function userDoc() {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Not authenticated')
  return doc(db, 'users', uid, 'system', IDB_DOC_ID)
}

export async function loadPerformanceSets(): Promise<PerformanceSet[]> {
  try {
    const snap = await getDoc(userDoc())
    if (snap.exists()) {
      const data = snap.data()
      return Array.isArray(data?.sets) ? data.sets : []
    }
  } catch (e) {
    console.error('[PerformanceSets] Failed to load sets', e)
  }
  return []
}

export async function persistPerformanceSets(sets: PerformanceSet[], soloSets?: SoloPerformanceSet[]): Promise<void> {
  try {
    await setDoc(userDoc(), { sets, soloSets: soloSets ?? [] })
  } catch (e) {
    console.error('[PerformanceSets] Failed to persist sets', e)
  }
}

/**
 * One-time migration from the legacy localStorage key. Sets were previously
 * stored at userKey('SYCORE_PC_PERFORMANCE_SETS'); the first load after this
 * change moves them into the per-user IndexedDB doc and clears the old key.
 * The legacy key is only removed once the IndexedDB write succeeded.
 */
export async function migrateLegacyPerformanceSets(): Promise<void> {
  try {
    const raw = localStorage.getItem(userKey(LS_PC_SETS))
    if (!raw) return
    let legacy: PerformanceSet[] = []
    try { legacy = JSON.parse(raw) } catch { legacy = [] }
    if (!Array.isArray(legacy) || legacy.length === 0) return
    const existing = await loadPerformanceSets()
    const merged = [...legacy, ...existing]
    // Write directly (not persistPerformanceSets) so a failed write here
    // throws and the legacy localStorage key is kept for a later retry.
    await setDoc(userDoc(), { sets: merged })
    localStorage.removeItem(userKey(LS_PC_SETS))
  } catch (e) {
    console.error('[PerformanceSets] Failed to migrate legacy sets', e)
  }
}

/** A single-instrument patch snapshot for Solo Performance Slots. */
export interface SoloPerformanceSet {
  id: string;
  name: string;
  deviceName: string;
  pcChannel: number;
  pcProgram: number;
  pcMsb: number;
  pcLsb: number;
  pcTemplate: string;
  soundName: string;
  createdAt: string;
}

/** Load solo performance sets from IndexedDB. */
export async function loadSoloSets(): Promise<SoloPerformanceSet[]> {
  try {
    const snap = await getDoc(userDoc())
    if (snap.exists()) {
      const data = snap.data()
      return Array.isArray(data?.soloSets) ? data.soloSets : []
    }
  } catch (e) {
    console.error('[SoloSets] Failed to load solo sets', e)
  }
  return []
}

/** Persist solo performance sets to IndexedDB (merged alongside main sets). */
export async function persistSoloSets(soloSets: SoloPerformanceSet[]): Promise<void> {
  try {
    // Read existing doc first to preserve the `sets` field
    const snap = await getDoc(userDoc())
    const existing = snap.exists() ? snap.data() : {}
    await setDoc(userDoc(), { ...existing, soloSets })
  } catch (e) {
    console.error('[SoloSets] Failed to persist solo sets', e)
  }
}

export const LS_SOLO_SLOTS = 'SYCORE_SOLO_SLOTS'
