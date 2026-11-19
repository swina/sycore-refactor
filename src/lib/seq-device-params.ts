// Sequencer P1 / P2 → the devices it is cabled to in MIDI Flow: per device, the CC of its own table
// (MIDI Devices › CC Table, or its model's) that P1 / P2 send instead of the Sequencer's P1 / P2 CC.
//   undefined / null — the Sequencer's CC (as before) · -1 — nothing to that device · 0–127 — that CC
import type { VirtualCcMapping, VirtualRegistration } from '@/types/midi'
import { ccTemplateFor } from '@/constants/cc-templates'

export type DeviceParamCc = number | null
export interface DeviceParamRoute { p1?: DeviceParamCc; p2?: DeviceParamCc }
export type DeviceParamRoutes = Record<string, DeviceParamRoute>

export const PARAM_OFF = -1

/** The device's named CCs: its own CC table, else its model's (PC Template); [] when neither. */
export function deviceCcTable(
  device: string,
  virtualInstruments: readonly VirtualRegistration[],
  registrations: Record<string, { pcTemplate?: any } | undefined> | undefined,
): VirtualCcMapping[] {
  const own = virtualInstruments.find(v => v.name === device)?.ccTable
  if (own?.length) return own
  return ccTemplateFor(registrations?.[device]?.pcTemplate) ?? []
}

/**
 * Who gets what for P`which`: `plain` — the cabled devices that take the Sequencer's CC (no route of
 * their own), `own` — a CC per device with one. Off devices are in neither.
 */
export function paramTargets(cabled: readonly string[], routes: DeviceParamRoutes, which: 1 | 2): { plain: string[]; own: { device: string; cc: number }[] } {
  const plain: string[] = []
  const own: { device: string; cc: number }[] = []
  for (const device of cabled) {
    const r = routes[device]
    const cc = which === 1 ? r?.p1 : r?.p2
    if (cc === undefined || cc === null) plain.push(device)
    else if (cc >= 0 && cc <= 127) own.push({ device, cc })
  }
  return { plain, own }
}

/** Any cabled device with a route of its own (else P1 / P2 go out as before, to every cable). */
export function hasDeviceRoutes(cabled: readonly string[], routes: DeviceParamRoutes): boolean {
  return cabled.some(d => { const r = routes[d]; return (r?.p1 ?? null) !== null || (r?.p2 ?? null) !== null })
}
