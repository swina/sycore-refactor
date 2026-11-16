<script setup>
/**
 * LiveMapSection — SY.CORE Map (P12): the instrument the SY.CORE Map device in Live drives (Follow or a
 * track), its 16 slots with their values, pickup, the Rack's Macro Variations. In the Live Map panel
 * and (compact) in the DECK. Right-click a control: MIDI Learn — map_slot_<n> (encoder n drives slot n
 * of whatever instrument is in focus), map_track_prev / next / follow, map_track (knob), variations.
 * The encoders work with this view closed too (useLiveMapStore).
 * The track / FOLLOW / Pickup / view controls: LiveMapControls (here, or in the panel's header).
 * On the screen (mouse, touch): drag a slot up / down, or switch to vertical sliders (a finger on a
 * slider sets the value there) or to Live-style encoders (drag up / down) — the choice remembered per user.
 */
import { computed } from 'vue'
import LiveMapControls from '@/components/LiveMapControls.vue'
import { useLiveMapStore } from '@/stores/useLiveMapStore'
import { useLinkStore } from '@/stores/useLinkStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { mapSlotParam, MAP_VARIATION_BUTTONS } from '@/lib/live-map'

const props = defineProps({
  /** the DECK's summary: smaller, no hints */
  compact: { type: Boolean, default: false },
  /** the "Map · Live instruments" title (off when the panel's header already says it) */
  title: { type: Boolean, default: true },
  /** the hint line under the slots */
  hints: { type: Boolean, default: true },
  /** the track / FOLLOW / Pickup / view controls (off when the panel's header carries them) */
  controls: { type: Boolean, default: true },
})

// Slots as tiles, vertical sliders or Live-style encoders (map.view, switched in LiveMapControls);
// the DECK's summary: tiles only.
const shown = computed(() => (props.compact ? 'tiles' : map.view))
const showSliders = computed(() => shown.value === 'sliders')
const showKnobs = computed(() => shown.value === 'knobs')
const fills = computed(() => showSliders.value || showKnobs.value)

// Encoders as in Live: a 270° arc (7:30 to 4:30), the value arc from its start, or from 12 o'clock for
// bipolar parameters (pan, detune, fine, transpose…), and a needle to the value.
const KNOB_SWEEP = 270
const KNOB_R = 15
const knobAngle = v => -KNOB_SWEEP / 2 + Math.max(0, Math.min(1, v ?? 0)) * KNOB_SWEEP
const knobPt = (a, r = KNOB_R) => {
  const t = (a * Math.PI) / 180
  return [20 + r * Math.sin(t), 20 - r * Math.cos(t)]
}
function knobArc(a1, a2) {
  if (Math.abs(a2 - a1) < 0.01) return ''
  const [lo, hi] = a1 < a2 ? [a1, a2] : [a2, a1]
  const [x1, y1] = knobPt(lo)
  const [x2, y2] = knobPt(hi)
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${KNOB_R} ${KNOB_R} 0 ${hi - lo > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}
const BIPOLAR = /\bpan\b|balance|detune|\bfine\b|transp|semi|spread/i
const isBipolar = s => !!s && BIPOLAR.test(`${s.name} ${s.param}`)
const KNOB_TRACK = knobArc(-KNOB_SWEEP / 2, KNOB_SWEEP / 2)
const knobValueArc = (s, v) => knobArc(isBipolar(s) ? 0 : -KNOB_SWEEP / 2, knobAngle(v))
const knobNeedle = v => {
  const a = knobAngle(v)
  const [x1, y1] = knobPt(a, 6)
  const [x2, y2] = knobPt(a, KNOB_R - 1)
  return { x1, y1, x2, y2 }
}
const knobMark = v => {
  const a = knobAngle(v)
  const [x1, y1] = knobPt(a, KNOB_R - 3.5)
  const [x2, y2] = knobPt(a, KNOB_R + 3.5)
  return { x1, y1, x2, y2 }
}
const knobText = (s, v) => {
  if (!s || v === null || v === undefined) return ''
  return isBipolar(s) ? String(Math.round((v - 0.5) * 100)) : String(Math.round(v * 100))
}
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
// The track in focus: its number in Live (1-based) in the amber box, its name large (not in the DECK)
const trackNo = computed(() => (info.value?.track && Number.isInteger(info.value.track.index) ? info.value.track.index + 1 : null))
const deviceLine = computed(() => {
  const d = info.value?.device
  return d ? `${d.rack ? d.rack + ' › ' : ''}${d.name}` : ''
})
const tag = computed(() => {
  const i = info.value
  if (!i?.device) return ''
  const macros = i.slots.filter(s => s && /^Macro \d+$/.test(s.param)).length
  return i.mode === 'auto' ? `Auto · ${i.device.cls}` : i.mode === 'macros' ? 'Rack Macros' : i.mode === 'mixed' ? `${macros} Macros + ${i.device.cls}` : i.mode === 'table' ? i.device.cls : `No table · ${i.device.cls}`
})
// Macro Variations of the Rack in focus: up to 8 buttons (more: ◀ ▶ reach them)
const vars = computed(() => info.value?.variations ?? null)
const varButtons = computed(() => Array.from({ length: Math.min(MAP_VARIATION_BUTTONS, vars.value?.count ?? 0) }, (_, i) => i))
const btn = 'px-2 py-0.5 rounded border text-[10px] font-bold'
function confirmDelete() {
  const v = vars.value
  if (v && v.selected >= 0 && window.confirm(`Delete variation ${v.selected + 1} of ${info.value?.device?.rack ?? 'this Rack'}? (Live's Undo brings it back)`)) map.variation('delete')
}
const slotTitle = (i, s) => `Slot ${i + 1}${s ? ` · ${s.name}${s.param !== s.name ? ` (${s.param})` : ''}` : ' · empty'} · right-click: MIDI Learn`
</script>

<template>
  <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10 space-y-2" :class="fills ? 'h-full flex flex-col' : ''">
    <!-- the controls (unless the panel's header has them), the track and its instrument; the track's
         number in Live top right -->
    <div class="flex items-start gap-2">
      <div class="flex-1 min-w-0 space-y-2">
        <div v-if="(!compact && title) || controls" class="flex items-center gap-2">
          <h3 v-if="!compact && title" class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Map · Live instruments</h3>
          <LiveMapControls v-if="controls" :view-switch="!compact" />
        </div>
        <!-- the track's name large, the instrument after it -->
        <div v-if="!compact && info?.device" class="flex items-center justify-between gap-2">
          <div class="min-w-0 flex items-baseline gap-2 truncate">
            <span class="text-lg font-black text-white leading-tight">{{ info.track?.name ?? '' }}</span>
            <span class="text-sm font-bold text-emerald-300 leading-tight truncate">› {{ deviceLine }}</span>
          </div>
          <span class="text-[10px] font-mono shrink-0" :class="info?.mode === 'none' ? 'text-amber-400' : 'text-neutral-500'">{{ tag }}</span>
        </div>
        <div v-else class="flex items-center justify-between text-[11px]">
          <span class="font-bold truncate" :class="info?.device ? 'text-neutral-200' : 'text-neutral-500'">{{ head }}</span>
          <span class="text-[10px] font-mono shrink-0 ml-2" :class="info?.mode === 'none' ? 'text-amber-400' : 'text-neutral-500'">{{ tag }}</span>
        </div>
      </div>
      <div v-if="!compact" class="shrink-0 min-w-12 h-10 px-2 rounded-md flex flex-col items-center justify-center border"
           :class="trackNo ? 'bg-amber-500 border-amber-300 text-black' : 'bg-neutral-900 border-white/10 text-neutral-600'"
           :title="trackNo ? `Live track ${trackNo}` : 'No track'">
        <span class="text-[8px] font-bold uppercase leading-none tracking-widest opacity-70">Track</span>
        <span class="text-xl font-black font-mono leading-none">{{ trackNo ?? '–' }}</span>
      </div>
    </div>
    <div v-if="!fills" class="grid grid-cols-8 gap-1">
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
    <div v-else-if="showSliders" class="flex-1 min-h-0 grid grid-cols-8 grid-rows-2 gap-1">
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
    <!-- encoders as in Live: two rows of eight, filling the panel; drag up / down -->
    <div v-else class="flex-1 min-h-0 grid grid-cols-8 grid-rows-2 gap-1">
      <div v-for="(s, i) in slots" :key="i" class="min-h-0 flex flex-col items-center rounded border border-white/10 bg-white/[0.03] px-1 py-0.5"
           :class="[learnedRing(mapSlotParam(i)), s ? '' : 'opacity-40']" :title="slotTitle(i, s)"
           @contextmenu="learnMenu($event, mapSlotParam(i), `Map slot ${i + 1}`)">
        <span class="self-stretch text-center text-[9px] leading-tight text-neutral-300 truncate"><b class="text-neutral-600">{{ i + 1 }}</b> {{ s?.name ?? '—' }}</span>
        <svg viewBox="0 0 40 40" class="flex-1 min-h-6 w-full touch-none cursor-ns-resize" preserveAspectRatio="xMidYMid meet"
             @pointerdown="tileDrag($event, i)">
          <path :d="KNOB_TRACK" fill="none" stroke="currentColor" class="text-white/15" stroke-width="3" stroke-linecap="butt" />
          <path v-if="s" :d="knobValueArc(s, map.values[i])" fill="none" stroke="currentColor" class="text-emerald-400" stroke-width="3" stroke-linecap="butt" />
          <line v-if="s" v-bind="knobNeedle(map.values[i])" stroke="currentColor" class="text-neutral-200" stroke-width="2" stroke-linecap="round" />
          <line v-if="s && map.pickup && !map.pick[i].caught && map.pick[i].knob !== null" v-bind="knobMark(map.pick[i].knob)"
                stroke="currentColor" class="text-amber-400" stroke-width="1.5" />
        </svg>
        <span class="text-center text-[9px] font-mono text-neutral-500">{{ knobText(s, map.values[i]) }}</span>
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
