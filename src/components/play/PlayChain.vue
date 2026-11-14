<script setup>
// A player's chain in a play view, shown while its Chain mode is on: the chain's entries in order
// (a letter, or · for an empty one), the one playing lit red (the Rig's Chain pads' colour).
// `entries`: letters or null; `current`: the position playing (-1 = none); `hint`: shown when empty.
import { computed } from 'vue'
const props = defineProps({
  entries: { type: Array, required: true },
  current: { type: Number, default: -1 },
  trimEmpty: { type: Boolean, default: true },   // drop the empty entries after the last one set
})
const shown = computed(() => {
  if (!props.trimEmpty) return props.entries
  let n = props.entries.length
  while (n > 0 && props.entries[n - 1] == null) n--
  return props.entries.slice(0, n)
})
</script>

<template>
  <div class="flex items-center gap-1.5 min-w-0">
    <span class="shrink-0 text-[9px] font-black uppercase tracking-widest text-red-400/80">Chain</span>
    <div v-if="shown.length" class="flex-1 flex flex-wrap gap-1 min-w-0">
      <div v-for="(e, i) in shown" :key="i"
           class="w-6 h-6 rounded border flex items-center justify-center text-[11px] font-black font-mono"
           :class="i === current ? 'bg-red-600 border-red-400 text-white'
             : e != null ? 'bg-red-950/60 border-red-900/70 text-red-200/80' : 'bg-neutral-950 border-neutral-900 text-neutral-600'">
        {{ e ?? '·' }}
      </div>
    </div>
    <span v-else class="text-[10px] text-neutral-500">no chain set (set it in the panel's EDIT)</span>
  </div>
</template>
