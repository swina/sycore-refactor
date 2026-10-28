<script setup>
// MIDI Learn chip for a button-type control (CC button or note).
// Idle → "MIDI" button; learning → pulsing prompt + cancel;
// mapped → binding badge + TGL/MOM switch (CC only) + remove.
import { computed } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps({
  map:       { type: Object, default: null },  // { type, number, channel, device, mode? } | null
  learning:  { type: Boolean, default: false },
  icon:      { type: [Object, Function], required: true },
  learnHint: { type: String, default: '' },    // tooltip of the idle button
  mappedHint:{ type: String, default: '' },    // tooltip of the binding badge
  compact:   { type: Boolean, default: false }, // hide device name in the badge
})
defineEmits(['learn', 'cancel', 'clear', 'toggle-mode'])

const label = computed(() => {
  const m = props.map
  if (!m) return ''
  const base = `${m.type === 'cc' ? 'CC' : 'NOTE'}${m.number} CH${m.channel + 1}`
  return !props.compact && m.device ? `${base} · ${m.device}` : base
})
const badgeTitle = computed(() =>
  [props.mappedHint, props.map?.device].filter(Boolean).join(' — ')
)
</script>

<template>
  <div class="flex items-center gap-1">
    <template v-if="learning">
      <div class="flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-500/15 border border-orange-500/40 text-orange-400 text-[8px] font-black uppercase tracking-widest animate-pulse whitespace-nowrap">
        <component :is="icon" class="w-2.5 h-2.5" />Press &amp; release a button…
      </div>
      <button @click="$emit('cancel')" class="p-1 text-neutral-600 hover:text-neutral-400 transition-colors rounded">
        <X class="w-3 h-3" />
      </button>
    </template>
    <template v-else-if="map">
      <div
        :title="badgeTitle"
        class="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[8px] font-black font-mono uppercase tracking-widest whitespace-nowrap"
      >
        <component :is="icon" class="w-2.5 h-2.5" />{{ label }}
      </div>
      <button
        v-if="map.type === 'cc'"
        @click="$emit('toggle-mode')"
        :title="map.mode === 'toggle' ? 'Toggle button: every press (127 or 0) fires — click to switch to momentary' : 'Momentary button: press (value > 0) fires, release ignored — click to switch to toggle'"
        class="px-1.5 py-1 rounded-lg bg-black/40 border border-neutral-800 text-neutral-500 hover:text-amber-400 hover:border-amber-500/30 transition-all text-[8px] font-black font-mono uppercase tracking-widest"
      >
        {{ map.mode === 'toggle' ? 'TGL' : 'MOM' }}
      </button>
      <button @click="$emit('clear')" title="Remove MIDI mapping" class="p-1 text-neutral-600 hover:text-red-400 transition-colors rounded">
        <X class="w-3 h-3" />
      </button>
    </template>
    <button
      v-else
      @click="$emit('learn')"
      :title="learnHint"
      class="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/40 border border-neutral-800 text-neutral-600 hover:text-amber-400 hover:border-amber-500/30 hover:bg-amber-500/10 transition-all text-[8px] font-black uppercase tracking-widest"
    >
      <component :is="icon" class="w-2.5 h-2.5" />MIDI
    </button>
  </div>
</template>
