// Sequencer P1 / P2 → MIDI Flow devices (lib/seq-device-params.ts): the CC of each cabled device's
// table that P1 / P2 move. Per user, for every bank.
import { defineStore } from 'pinia'
import { computed, reactive, watch } from 'vue'
import { userKey } from '@/lib/userKey'
import { useMidiStore } from '@/stores/useMidiStore'
import { MidiSource } from '@/core/midi/midi-service'
import { deviceCcTable, hasDeviceRoutes, type DeviceParamCc, type DeviceParamRoutes } from '@/lib/seq-device-params'

const LS_KEY = 'SYCORE_SEQ_DEVICE_PARAMS'
const ccOf = (v: unknown): DeviceParamCc => (Number.isInteger(v) && (v as number) >= -1 && (v as number) <= 127 ? (v as number) : null)

export const useSeqDeviceParamsStore = defineStore('seqDeviceParams', () => {
  const midiStore = useMidiStore()
  const routes = reactive<DeviceParamRoutes>((() => {
    try {
      const o = JSON.parse(localStorage.getItem(userKey(LS_KEY)) || '{}')
      const out: DeviceParamRoutes = {}
      if (o && typeof o === 'object') for (const [d, r] of Object.entries<any>(o)) out[d] = { p1: ccOf(r?.p1), p2: ccOf(r?.p2) }
      return out
    } catch { return {} }
  })())
  watch(routes, v => { try { localStorage.setItem(userKey(LS_KEY), JSON.stringify(v)) } catch {} }, { deep: true })

  /** The devices the Sequencer is cabled to in MIDI Flow. */
  const cabled = computed<string[]>(() => midiStore.routingMatrix?.[MidiSource.SEQUENCER2] ?? [])
  const tableOf = (device: string) => deviceCcTable(device, midiStore.virtualInstruments, midiStore.routingConfig?.registrations as any)
  function setRoute(device: string, which: 1 | 2, cc: DeviceParamCc) {
    const r = routes[device] ?? (routes[device] = { p1: null, p2: null })
    if (which === 1) r.p1 = cc; else r.p2 = cc
    if ((r.p1 ?? null) === null && (r.p2 ?? null) === null) delete routes[device]
  }
  /** The cabled devices with a route of their own. */
  const count = computed(() => cabled.value.filter(d => (routes[d]?.p1 ?? null) !== null || (routes[d]?.p2 ?? null) !== null).length)
  const active = computed(() => hasDeviceRoutes(cabled.value, routes))
  return { routes, cabled, tableOf, setRoute, count, active }
})
