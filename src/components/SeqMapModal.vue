<script setup>
// Sequencer P1 / P2 → Map · Live Instruments: a route per track in Live — the track, then the Map slot of
// its instrument that P1 and P2 move (useLiveMapStore.seqRoutes). The slot names are asked from Live for
// each row's track (bridge 1.8: on open and on a track picked) and kept; "n" alone until they come.
// Below, the devices the Sequencer is cabled to in MIDI Flow: per device, the CC of its CC table (or
// its model's) that P1 / P2 send instead of the Sequencer's CC, or off (useSeqDeviceParamsStore).
import { computed, onMounted } from 'vue'
import ModalShell from '@/components/ui/ModalShell.vue'
import { useLiveMapStore } from '@/stores/useLiveMapStore'
import { linkClient } from '@/stores/useLinkStore'
import { useSeqDeviceParamsStore } from '@/stores/useSeqDeviceParamsStore'
import { useStepSequencerStore } from '@/stores/useStepSequencerStore'
import { PARAM_OFF } from '@/lib/seq-device-params'

const emit = defineEmits(['close'])
const liveMap = useLiveMapStore()

const trackName = i => {
  const t = liveMap.tracks.find(x => x.index === i)
  return t ? `${i + 1} · ${t.name}` : `${i + 1}`
}
/** The tracks a row can pick: instrument tracks not routed by another row, plus its own. */
const trackOpts = row => {
  const used = new Set(liveMap.seqRoutes.filter(r => r !== row).map(r => r.track))
  const opts = liveMap.instrumentTracks.filter(t => !used.has(t.index)).map(t => ({ value: t.index, label: `${t.index + 1} · ${t.name}` }))
  if (!opts.some(o => o.value === row.track)) opts.unshift({ value: row.track, label: trackName(row.track) })
  return opts
}
const slotOpts = track => Array.from({ length: 16 }, (_, i) => {
  const names = liveMap.slotNames[track]
  const n = names?.[i]
  return { value: i, label: `${i + 1}${n ? ` · ${n}` : names ? ' · —' : ''}` }
})
onMounted(() => liveMap.requestSlotNames(liveMap.seqRoutes.map(r => r.track)))
function setTrack(row, v) {
  row.track = Number(v)
  liveMap.requestSlotNames([row.track])
}
const setSlot = (row, key, v) => { row[key] = v === '' ? null : Number(v) }
const canAdd = computed(() => liveMap.instrumentTracks.some(t => !liveMap.seqRoutes.some(r => r.track === t.index)))
const focus = computed(() => liveMap.info?.track?.index)
// ── MIDI Flow devices ──
const devParams = useSeqDeviceParamsStore()
// the active bank's P1 / P2 CC (the engine writes its working copy into it)
const seqStore = useStepSequencerStore()
const param1CC = computed(() => seqStore.activeBank?.param1CC ?? null)
const param2CC = computed(() => seqStore.activeBank?.param2CC ?? null)
const seqCc = k => (k === 'p1' ? param1CC.value : param2CC.value)
/** '' = the Sequencer's CC, 'off', or a CC of the device's table (its current one kept if not listed). */
const devValue = (d, k) => {
  const v = devParams.routes[d]?.[k]
  return v === undefined || v === null ? '' : v === PARAM_OFF ? 'off' : String(v)
}
const devOpts = (d, k) => {
  const table = devParams.tableOf(d)
  const opts = table.map(r => ({ value: String(r.cc), label: `CC ${r.cc}${r.name ? ` · ${r.name}` : ''}` }))
  const cur = devParams.routes[d]?.[k]
  if (cur != null && cur >= 0 && !table.some(r => r.cc === cur)) opts.unshift({ value: String(cur), label: `CC ${cur}` })
  return opts
}
const setDev = (d, k, v) => devParams.setRoute(d, k === 'p1' ? 1 : 2, v === '' ? null : v === 'off' ? PARAM_OFF : Number(v))
const sel = 'bg-neutral-950 border border-neutral-800 text-emerald-300 rounded px-1.5 py-1 text-xs font-mono outline-none cursor-pointer [color-scheme:dark] w-full'
const selDev = sel.replace('text-emerald-300', 'text-sky-300')
</script>

<template>
  <ModalShell title="P1 / P2 → Map · Live Instruments · MIDI Flow devices" size="lg" z-class="z-[1100]" @close="emit('close')">
    <div class="p-4 flex flex-col gap-3 text-xs">
      <p class="text-neutral-400">
        A row per track in Live: the Sequencer's P1 / P2 move these Map slots of the track's instrument (the CC still goes out).
        <span v-if="!liveMap.mapTrack" class="text-amber-400">SY.CORE Link {{ linkClient.device?.version || '?' }} (before 1.8): only the row of the track the Map drives is sent — load SY.CORE Link and SY.CORE Map 1.8.</span>
        <span v-else class="text-emerald-400">SY.CORE Link {{ linkClient.device?.version }}: every row is sent, wherever the Map is.</span>
      </p>
      <table class="w-full border-separate border-spacing-y-1">
        <thead>
          <tr class="text-[10px] font-mono uppercase text-neutral-500 text-left">
            <th class="font-normal px-1">Target track</th>
            <th class="font-normal px-1 w-40">P1 → slot</th>
            <th class="font-normal px-1 w-40">P2 → slot</th>
            <th class="w-6" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in liveMap.seqRoutes" :key="i">
            <td class="px-1">
              <div class="flex items-center gap-1.5">
                <select :value="r.track" :class="sel" @change="setTrack(r, $event.target.value)">
                  <option v-for="o in trackOpts(r)" class="bg-neutral-950 text-emerald-300" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
                <span v-if="r.track === focus" class="shrink-0 text-[9px] font-mono text-emerald-400" title="The track the Map drives now">MAP</span>
              </div>
            </td>
            <td v-for="k in ['p1', 'p2']" :key="k" class="px-1">
              <select :value="r[k] === null ? '' : String(r[k])" :class="sel" @change="setSlot(r, k, $event.target.value)">
                <option value="" class="bg-neutral-950 text-neutral-400">off</option>
                <option v-for="o in slotOpts(r.track)" class="bg-neutral-950 text-emerald-300" :key="o.value" :value="String(o.value)">{{ o.label }}</option>
              </select>
            </td>
            <td class="text-center">
              <button type="button" class="text-neutral-500 hover:text-red-400 px-1" title="Remove the route" @click="liveMap.removeSeqRoute(i)">✕</button>
            </td>
          </tr>
          <tr v-if="!liveMap.seqRoutes.length">
            <td colspan="4" class="px-1 py-2 text-neutral-600">No routes: P1 / P2 go out as CC only.</td>
          </tr>
        </tbody>
      </table>
      <div class="flex items-center gap-3">
        <button type="button" :disabled="!canAdd"
                class="px-2 py-1 rounded border border-emerald-500/50 text-emerald-300 font-mono hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
                @click="liveMap.addSeqRoute()">+ Track</button>
        <span v-if="!liveMap.mapTrack && liveMap.seqRoutes.length" class="text-neutral-600">Slot names: only for the tracks the Map has driven (SY.CORE Link 1.8 reads every track's).</span>
        <span v-if="!liveMap.instrumentTracks.length" class="text-neutral-600">No instrument tracks from Live (SY.CORE Link + SY.CORE Map).</span>
        <span v-if="liveMap.seqParamsHint" class="text-amber-400">{{ liveMap.seqParamsHint }}</span>
      </div>

      <div class="border-t border-neutral-800 pt-3 flex flex-col gap-2">
        <p class="text-neutral-400">
          <span class="text-sky-300 font-bold">MIDI Flow devices</span> — the devices the Sequencer is cabled to: P1 / P2 send the CC of the device's
          table you pick (MIDI Devices › CC Table, or its model's) instead of the Sequencer's CC ({{ param1CC ?? '—' }} / {{ param2CC ?? '—' }}), or nothing (off).
        </p>
        <table v-if="devParams.cabled.length" class="w-full border-separate border-spacing-y-1">
          <thead>
            <tr class="text-[10px] font-mono uppercase text-neutral-500 text-left">
              <th class="font-normal px-1">Device</th>
              <th class="font-normal px-1 w-48">P1 → CC</th>
              <th class="font-normal px-1 w-48">P2 → CC</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in devParams.cabled" :key="d">
              <td class="px-1 font-mono text-sky-200 truncate" :title="d">
                {{ d }}
                <span v-if="!devParams.tableOf(d).length" class="block text-[9px] text-neutral-600">no CC table (MIDI Devices › CC Table)</span>
              </td>
              <td v-for="k in ['p1', 'p2']" :key="k" class="px-1">
                <select :value="devValue(d, k)" :class="selDev" @change="setDev(d, k, $event.target.value)">
                  <option value="" class="bg-neutral-950 text-neutral-300">Seq CC {{ seqCc(k) ?? '—' }}</option>
                  <option value="off" class="bg-neutral-950 text-neutral-400">off</option>
                  <option v-for="o in devOpts(d, k)" class="bg-neutral-950 text-sky-300" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-neutral-600">The Sequencer isn't cabled to any device in MIDI Flow.</p>
      </div>
    </div>
  </ModalShell>
</template>
