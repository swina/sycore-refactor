import { getDoc, setDoc, doc, db } from '@/lib/idb'
import { auth } from '@/lib/auth'

export type ControlType = 'pad-switch' | 'pad-momentary' | 'slider' | 'encoder'

export interface ControlAssignment {
  type: 'midi-action' | 'app-param'
  action?: string
  paramName?: string
  label: string
}

export interface ControlItem {
  id: string
  type: ControlType
  x: number
  y: number
  w: number
  h: number
  label: string
  color: string
  midiMapping?: string
  ccNumber?: number
  noteNumber?: number
  channel?: number
  value?: number
  assignment?: ControlAssignment
}

export interface ControllerPreset {
  id: string
  name: string
  createdAt: number
  updatedAt?: number
  assignedDevice: string
  controls: ControlItem[]
}

const IDB_DOC = 'midiControllerPresets'
export const AUTOSAVE_CONTROLLER_ID = '__autosave__'

function userDoc() {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Not authenticated')
  return doc(db, 'users', uid, 'system', IDB_DOC)
}

export async function loadControllerPresets(): Promise<ControllerPreset[]> {
  try {
    const snap = await getDoc(userDoc())
    if (!snap.exists()) return []
    const data = snap.data()
    return Array.isArray(data?.presets) ? data.presets : []
  } catch {
    return []
  }
}

export async function persistControllerPresets(presets: ControllerPreset[]): Promise<void> {
  await setDoc(userDoc(), { presets })
}

export function createControllerPreset(
  name: string,
  partial: Partial<ControllerPreset> = {}
): ControllerPreset {
  return {
    id: Math.random().toString(36).slice(2, 11),
    name,
    createdAt: Date.now(),
    assignedDevice: '',
    controls: [],
    ...partial,
  }
}

export function createControl(
  type: ControlType,
  x: number,
  y: number,
  partial: Partial<ControlItem> = {}
): ControlItem {
  const defaults: Record<ControlType, Partial<ControlItem>> = {
    'pad-switch':    { w: 64, h: 64, label: 'Pad', color: '#7c3aed' },
    'pad-momentary': { w: 64, h: 64, label: 'Pad', color: '#0891b2' },
    'slider':        { w: 40, h: 120, label: 'Slider', color: '#059669' },
    'encoder':       { w: 60, h: 60, label: 'Enc', color: '#d97706' },
  }
  return {
    id: Math.random().toString(36).slice(2, 11),
    type,
    x,
    y,
    label: defaults[type].label!,
    color: defaults[type].color!,
    w: defaults[type].w!,
    h: defaults[type].h!,
    value: 0,
    ...partial,
  }
}
