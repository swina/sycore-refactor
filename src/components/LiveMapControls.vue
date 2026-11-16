<script setup>
/**
 * LiveMapControls — SY.CORE Map (P12): the track the encoders drive (◀ menu ▶, FOLLOW), Pickup and the
 * slots' view (TILES / SLIDERS / KNOBS). In the Live Map panel's header, or in LiveMapSection (DECK).
 * Right-click a control: MIDI Learn — map_track_prev / next / follow, map_track (knob).
 * Pointer / mouse down stop here, so a header doesn't take a click on a control for a drag.
 */
import { computed } from 'vue'
import { useLiveMapStore } from '@/stores/useLiveMapStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { MAP_TRACK_KNOB } from '@/lib/live-map'

defineProps({
  /** the TILES / SLIDERS / KNOBS switch (not in the DECK's summary: tiles only) */
  viewSwitch: { type: Boolean, default: true },
})

const map = useLiveMapStore()
const mappingStore = useMappingStore()
const { openMenu } = useMidiContextMenu()
function learnMenu(ev, name, label) {
  ev.preventDefault()
  openMenu(ev, { name, label })
}
const learnedRing = name => (mappingStore.mappedParams.has(name) ? 'ring-1 ring-amber-500/70' : '')
const btn = 'px-2 py-0.5 rounded border text-[10px] font-bold'
const following = computed(() => map.target === 'follow')
const targetValue = computed({
  get: () => (map.target === 'follow' ? 'follow' : String(map.target)),
  set: v => map.setTarget(v === 'follow' ? 'follow' : Number(v)),
})
</script>

<template>
  <div class="flex items-center gap-1 cursor-default" @pointerdown.stop @mousedown.stop>
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
    <button v-if="viewSwitch" :class="[btn, map.view !== 'tiles' ? 'bg-emerald-500 border-emerald-300 text-black' : 'border-white/10 text-neutral-400']"
            title="The slots as tiles (drag up / down), vertical sliders (touch screens) or Live-style encoders (drag up / down) · click: next view"
            @click="map.nextView()">{{ map.view.toUpperCase() }}</button>
  </div>
</template>
