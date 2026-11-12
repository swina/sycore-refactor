<script setup>
/**
 * LiveMapSection — SY.CORE Map (P12): the instrument the SY.CORE Map device in Live drives (Follow or a
 * track), its 16 slots with their values, pickup, the Rack's Macro Variations. In the Live Map panel
 * and (compact) in the DECK. Right-click a control: MIDI Learn — map_slot_<n> (encoder n drives slot n
 * of whatever instrument is in focus), map_track_prev / next / follow, map_track (knob), variations.
 * The encoders work with this view closed too (useLiveMapStore).
 * On the screen (mouse, touch): drag a slot up / down, or switch to vertical sliders (a finger on a
 * slider sets the value there) — the choice remembered per user.
 */
import { computed, ref, watch } from 'vue'
import { userKey } from '@/lib/userKey'
import { useLiveMapStore } from '@/stores/useLiveMapStore'
import { useLinkStore } from '@/stores/useLinkStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { mapSlotParam, MAP_VARIATION_BUTTONS, MAP_TRACK_KNOB } from '@/lib/live-map'

const props = defineProps({
  /** the DECK's summary: smaller, no hints */
  compact: { type: Boolean, default: false },
  /** the "Map · Live instruments" title (off when the panel's header already says it) */
  title: { type: Boolean, default: true },
  /** the hint line under the slots */
  hints: { type: Boolean, default: true },
})

// Slots as tiles (standard) or vertical sliders (touch screens); not in the DECK's summary.
const LS_SLIDERS = 'SYCORE_LIVE_MAP_SLIDERS'
const sliders = ref((() => { try { return localStorage.getItem(userKey(LS_SLIDERS)) === '1' } catch { return false } })())
watch(sliders, v => { try { localStorage.setItem(userKey(LS_SLIDERS), v ? '1' : '0') } catch {} })
const showSliders = computed(() => sliders.value && !props.compact)
const slots = computed(() => info.value?.slots ?? Array(16).fill(null))

// One send per frame while a slot moves (a pointer stream can run at 120+ events a second).
let pending = null
let raf = 0
function setSlot(i, v) {
  pending = [i, v]
  if (raf) return
  raf = requestAnimationFrame(() => { raf = 0; if (pending) map.touch(...pending); pending = null })
}
// Standard tiles: drag up / down from the value (a full move = 200 px).
function tileDrag(e, i) {
  if (e.button !== 0 || !slots.value[i]) return
  const el = e.currentTarget
  el.setPointerCapture?.(e.pointerId)
  const y0 = e.clientY
  const v0 = map.values[i] ?? 0
  const move = ev => setSlot(i, v0 + (y0 - ev.clientY) / 200)
  const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up) }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
}
// Sliders: the value where the pointer is on the track (bottom 0, top 1), and follows it.
function sliderDrag(e, i) {
  if (e.button !== 0 || !slots.value[i]) return
  const el = e.currentTarget
  el.setPointerCapture?.(e.pointerId)
  const r = el.getBoundingClientRect()
  const at = ev => setSlot(i, 1 - (ev.clientY - r.top) / r.height)
  at(e)
  const up = () => { el.removeEventListener('pointermove', at); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up) }
  el.addEventListener('pointermove', at)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
}

const mappingStore = useMappingStore()
const { openMenu } = useMidiContextMenu()
function learnMenu(ev, name, label) {
  ev.preventDefault()
  openMenu(ev, { name, label })
}
const learnedRing = name => (mappingStore.mappedParams.has(name) ? 'ring-1 ring-amber-500/70' : '')

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
  return i.mode === 'auto' ? `Auto · ${i.device.cls}` : i.mode === 'macros' ? 'Rack Macros' : i.mode === 'mixed' ? `${macros} Macros + ${i.device.cls}` : i.mode === 'table' ? i.device.cls : `No table · ${i.device.cls}`
})
const targetValue = computed({
  get: () => (map.target === 'follow' ? 'follow' : String(map.target)),
  set: v => map.setTarget(v === 'follow' ? 'follow' : Number(v)),
})
// Macro Variations of the Rack in focus: up to 8 buttons (more: ◀ ▶ reach them)
const vars = computed(() => info.value?.variations ?? null)
const varButtons = computed(() => Array.from({ length: Math.min(MAP_VARIATION_BUTTONS, vars.value?.count ?? 0) }, (_, i) => i))
const btn = 'px-2 py-0.5 rounded border text-[10px] font-bold'
const following = computed(() => map.target === 'follow')
function confirmDelete() {
  const v = vars.value
  if (v && v.selected >= 0 && window.confirm(`Delete variation ${v.selected + 1} of ${info.value?.device?.rack ?? 'this Rack'}? (Live's Undo brings it back)`)) map.variation('delete')
}
const slotTitle = (i, s) => `Slot ${i + 1}${s ? ` · ${s.name}${s.param !== s.name ? ` (${s.param})` : ''}` : ' · empty'} · right-click: MIDI Learn`
</script>

<template>
  <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10 space-y-2" :class="showSliders ? 'h-full flex flex-col' : ''">
    <div class="flex items-center justify-between gap-2">
      <h3 v-if="!compact && title" class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Map · Live instruments</h3>
      <div class="flex items-center gap-1">
        <!-- the track: ◀ ▶ and FOLLOW as buttons, the menu as a knob (right-click: MIDI Learn) -->
        <button :class="[btn, 'border-white/10 text-neutral-300', learnedRing('map_track_prev')]" title="Previous track · right-click: MIDI Learn"
                @click="map.trackStep(-1)" @contextmenu="learnMenu($event, 'map_track_prev', 'Map Track ◀')">◀</button>
        <select v-model="targetValue" class="bg-neutral-900 border border-white/10 rounded text-[10px] text-neutral-300 px-1 py-0.5 max-w-40"
                :class="learnedRing(MAP_TRACK_KNOB)"
                title="The track whose instrument the encoders drive · right-click: MIDI Learn a knob that picks the track"
                @contextmenu="learnMenu($event, MAP_TRACK_KNOB, 'Map Track (knob)')">
          <option value="follow">Follow selected track</option>
          <option v-for="t in map.instrumentTracks" :key="t.index" :value="String(t.index)">{{ t.name }} · {{ t.instrument }}</option>
        </select>
        <button :class="[btn, 'border-white/10 text-neutral-300', learnedRing('map_track_next')]" title="Next track · right-click: MIDI Learn"
                @click="map.trackStep(1)" @contextmenu="learnMenu($event, 'map_track_next', 'Map Track ▶')">▶</button>
        <button :class="[btn, following ? 'bg-emerald-500 border-emerald-300 text-black' : 'border-white/10 text-neutral-400', learnedRing('map_track_follow')]"
                title="Follow Live's selected track (off: stay on this track) · right-click: MIDI Learn"
                @click="map.toggleFollow()" @contextmenu="learnMenu($event, 'map_track_follow', 'Map Follow selected track')">FOLLOW</button>
        <label class="flex items-center gap-1 text-[10px] text-neutral-400" title="Absolute knobs take over only once they reach the parameter's value (no jumps)">
          <input v-model="map.pickup" type="checkbox" class="accent-emerald-500"> Pickup
        </label>
        <button v-if="!compact" :class="[btn, sliders ? 'bg-emerald-500 border-emerald-300 text-black' : 'border-white/10 text-neutral-400']"
                title="The slots as vertical sliders (touch screens) or as tiles (drag up / down)"
                @click="sliders = !sliders">{{ sliders ? 'SLIDERS' : 'TILES' }}</button>
      </div>
    </div>
    <div class="flex items-center justify-between text-[11px]">
      <span class="font-bold truncate" :class="info?.device ? 'text-neutral-200' : 'text-neutral-500'">{{ head }}</span>
      <span class="text-[10px] font-mono shrink-0 ml-2" :class="info?.mode === 'none' ? 'text-amber-400' : 'text-neutral-500'">{{ tag }}</span>
    </div>
    <div v-if="!showSliders" class="grid grid-cols-8 gap-1">
      <button v-for="(s, i) in slots" :key="i"
              class="relative rounded border border-white/10 bg-white/[0.04] px-1 pt-0.5 text-left overflow-hidden touch-none"
              :class="[compact ? 'h-10' : 'h-12', learnedRing(mapSlotParam(i)), s ? '' : 'opacity-40']"
              :title="slotTitle(i, s)"
              @pointerdown="tileDrag($event, i)"
              @contextmenu="learnMenu($event, mapSlotParam(i), `Map slot ${i + 1}`)">
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
    <!-- vertical sliders: two rows of eight, filling the panel -->
    <div v-else class="flex-1 min-h-0 grid grid-cols-8 grid-rows-2 gap-1">
      <div v-for="(s, i) in slots" :key="i" class="min-h-0 flex flex-col items-stretch rounded border border-white/10 bg-white/[0.03] px-1 py-0.5"
           :class="[learnedRing(mapSlotParam(i)), s ? '' : 'opacity-40']" :title="slotTitle(i, s)"
           @contextmenu="learnMenu($event, mapSlotParam(i), `Map slot ${i + 1}`)">
        <span class="text-[9px] leading-tight text-neutral-300 truncate"><b class="text-neutral-600">{{ i + 1 }}</b> {{ s?.name ?? '—' }}</span>
        <div class="relative flex-1 min-h-6 my-0.5 mx-auto w-full max-w-10 rounded bg-white/10 touch-none cursor-ns-resize"
             @pointerdown="sliderDrag($event, i)">
          <div class="absolute left-0 right-0 bottom-0 rounded bg-emerald-500/80" :style="{ height: `${(map.values[i] ?? 0) * 100}%` }" />
          <div v-if="map.pickup && !map.pick[i].caught && map.pick[i].knob !== null"
               class="absolute left-0 right-0 h-0.5 bg-amber-400" :style="{ bottom: `${map.pick[i].knob * 100}%` }" />
        </div>
        <span class="text-center text-[9px] font-mono text-neutral-500">{{ s && map.values[i] !== null ? Math.round(map.values[i] * 100) : '' }}</span>
      </div>
    </div>
    <!-- Macro Variations (Racks): recall, ◀ ▶, randomize; right-click: MIDI Learn -->
    <div v-if="vars" class="flex items-center gap-1 flex-wrap">
      <span class="text-[10px] text-neutral-500 mr-1">Variations</span>
      <template v-if="vars.count">
        <button :class="[btn, 'border-white/10 text-neutral-300', learnedRing('map_var_prev')]" title="Previous variation · right-click: MIDI Learn"
                @click="map.variation('prev')" @contextmenu="learnMenu($event, 'map_var_prev', 'Map Variation ◀')">◀</button>
        <button v-for="i in varButtons" :key="i"
                :class="[btn, vars.selected === i ? 'bg-emerald-500 border-emerald-300 text-black' : 'border-white/10 text-neutral-300', learnedRing(`map_var_${i + 1}`)]"
                :title="`Recall variation ${i + 1} · right-click: MIDI Learn`"
                @click="map.variation(i)" @contextmenu="learnMenu($event, `map_var_${i + 1}`, `Map Variation ${i + 1}`)">{{ i + 1 }}</button>
        <button :class="[btn, 'border-white/10 text-neutral-300', learnedRing('map_var_next')]" title="Next variation · right-click: MIDI Learn"
                @click="map.variation('next')" @contextmenu="learnMenu($event, 'map_var_next', 'Map Variation ▶')">▶</button>
        <span class="text-[10px] font-mono text-neutral-500 ml-1">{{ vars.selected >= 0 ? vars.selected + 1 : '–' }}/{{ vars.count }}</span>
      </template>
      <span v-else class="text-[10px] text-neutral-600">none stored in this Rack</span>
      <!-- store the Macros as they are now (a new variation) / delete the selected one -->
      <button :class="[btn, 'border-emerald-500/40 text-emerald-300', learnedRing('map_var_store')]" title="Store the Macros as a new variation · right-click: MIDI Learn"
              @click="map.variation('store')" @contextmenu="learnMenu($event, 'map_var_store', 'Map Store variation')">＋ Store</button>
      <button v-if="vars.count && vars.selected >= 0" :class="[btn, 'border-white/10 text-neutral-400 hover:text-rose-300', learnedRing('map_var_delete')]"
              :title="`Delete variation ${vars.selected + 1} (Live's Undo brings it back) · right-click: MIDI Learn`"
              @click="confirmDelete" @contextmenu="learnMenu($event, 'map_var_delete', 'Map Delete variation')">Delete</button>
      <button :class="[btn, 'ml-auto border-white/10 text-neutral-300', learnedRing('map_randomize')]" title="Randomize the Rack's Macros · right-click: MIDI Learn"
              @click="map.randomize()" @contextmenu="learnMenu($event, 'map_randomize', 'Map Randomize Macros')">Rand</button>
    </div>
    <p v-if="!compact && hints" class="text-[9px] text-neutral-500">Right-click a slot to MIDI-learn an encoder: encoder <i>n</i> drives slot <i>n</i> of the instrument in focus. Amber mark: the knob waiting to reach the value (pickup).</p>
  </section>
</template>
