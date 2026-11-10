<script setup>
/**
 * LiveMapSection — SY.CORE Map (P12) in the Rig Controller: the instrument the SY.CORE Map device in
 * Live drives (Follow or a track), its 16 slots with their values, and pickup. Right-click a slot:
 * MIDI Learn (map_slot_<n>) — encoder n then drives slot n of whatever instrument is in focus.
 * The encoders work with this panel closed too (useLiveMapStore).
 */
import { computed } from 'vue'
import { useLiveMapStore } from '@/stores/useLiveMapStore'
import { useLinkStore } from '@/stores/useLinkStore'
import { mapSlotParam } from '@/lib/live-map'

const props = defineProps({
  /** (ev, paramName, label) → the panel's MIDI Learn menu */
  learnMenu: { type: Function, required: true },
  /** paramName → the ring class of a learned control */
  learnedRing: { type: Function, required: true },
})

const map = useLiveMapStore()
const link = useLinkStore()

const info = computed(() => map.info)
const head = computed(() => {
  const i = info.value
  if (!link.connected) return 'SY.CORE Link not connected'
  if (!i) return 'Add the SY.CORE Map device (sycore-map.amxd) to the Live set'
  if (!i.device) return 'No instrument on the selected track'
  return `${i.track?.name ?? ''} › ${i.device.rack ? i.device.rack + ' › ' : ''}${i.device.name}`
})
const tag = computed(() => {
  const i = info.value
  if (!i?.device) return ''
  const macros = i.slots.filter(s => s && /^Macro \d+$/.test(s.param)).length
  return i.mode === 'macros' ? 'Rack Macros' : i.mode === 'mixed' ? `${macros} Macros + ${i.device.cls}` : i.mode === 'table' ? i.device.cls : `No table · ${i.device.cls}`
})
const targetValue = computed({
  get: () => (map.target === 'follow' ? 'follow' : String(map.target)),
  set: v => map.setTarget(v === 'follow' ? 'follow' : Number(v)),
})
const slotTitle = (i, s) => `Slot ${i + 1}${s ? ` · ${s.name}${s.param !== s.name ? ` (${s.param})` : ''}` : ' · empty'} · right-click: MIDI Learn`
</script>

<template>
  <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10 space-y-2">
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Map · Live instruments</h3>
      <div class="flex items-center gap-2">
        <select v-model="targetValue" class="bg-neutral-900 border border-white/10 rounded text-[10px] text-neutral-300 px-1 py-0.5"
                title="The track whose instrument the encoders drive">
          <option value="follow">Follow selected track</option>
          <option v-for="t in map.tracks" :key="t.index" :value="String(t.index)">{{ t.name }}</option>
        </select>
        <label class="flex items-center gap-1 text-[10px] text-neutral-400" title="Absolute knobs take over only once they reach the parameter's value (no jumps)">
          <input v-model="map.pickup" type="checkbox" class="accent-emerald-500"> Pickup
        </label>
      </div>
    </div>
    <div class="flex items-center justify-between text-[11px]">
      <span class="font-bold truncate" :class="info?.device ? 'text-neutral-200' : 'text-neutral-500'">{{ head }}</span>
      <span class="text-[10px] font-mono shrink-0 ml-2" :class="info?.mode === 'none' ? 'text-amber-400' : 'text-neutral-500'">{{ tag }}</span>
    </div>
    <div class="grid grid-cols-8 gap-1">
      <button v-for="(s, i) in (info?.slots ?? Array(16).fill(null))" :key="i"
              class="relative h-12 rounded border border-white/10 bg-white/[0.04] px-1 pt-0.5 text-left overflow-hidden"
              :class="[props.learnedRing(mapSlotParam(i)), s ? '' : 'opacity-40']"
              :title="slotTitle(i, s)"
              @contextmenu="props.learnMenu($event, mapSlotParam(i), `Map slot ${i + 1}`)">
        <span class="block text-[8px] font-bold text-neutral-600">{{ i + 1 }}</span>
        <span class="block text-[9px] leading-tight text-neutral-300 line-clamp-2">{{ s?.name ?? '—' }}</span>
        <!-- the parameter's value; the knob's position while it waits to pick the value up -->
        <span v-if="s" class="absolute left-1 right-1 bottom-1 h-1 rounded bg-white/10">
          <span class="absolute left-0 top-0 h-1 rounded bg-emerald-400" :style="{ width: `${(map.values[i] ?? 0) * 100}%` }" />
          <span v-if="map.pickup && !map.pick[i].caught && map.pick[i].knob !== null"
                class="absolute -top-0.5 w-0.5 h-2 bg-amber-400" :style="{ left: `${map.pick[i].knob * 100}%` }" />
        </span>
      </button>
    </div>
    <p class="text-[9px] text-neutral-500">Right-click a slot to MIDI-learn an encoder: encoder <i>n</i> drives slot <i>n</i> of the instrument in focus. Amber mark: the knob waiting to reach the value (pickup).</p>
  </section>
</template>
