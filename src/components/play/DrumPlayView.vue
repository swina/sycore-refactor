<script setup>
// The Drum Machine's play view (Performance): its sequences, a beat bar (one segment per beat,
// lined up with the four groups of steps) and every pad of the sequence — no playhead over them.
// With a bassline in use on the Rig (its part playing, or a Bass slot armed with Live stopped) the
// bassline's source pads (the last three) show its voices instead, as BASS 1–3 in purple (their
// sequence: the Rig's bass part's own, else the drums'). Display only — the Rig plays it.
// Re-renders once per beat (the bar), and on edits.
import { computed } from 'vue'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { drumSnapshot, rigReports, rigArmed, bassInUse } from '@/lib/rig-live'
import { drumPosition } from '@/lib/drum-position'
import PlaySlots from './PlaySlots.vue'

const drumStore = useDrumMachineStore()
const snap = computed(() => drumSnapshot(drumStore.sequences, undefined, drumStore.activeSequence, drumStore.isPlaying && drumStore.drumsOn, rigReports.queued.drum ?? rigArmed.drum))
const beat = computed(() => drumStore.isPlaying ? drumPosition.value.beat : 0)
const DRUM_ON = 'bg-amber-700/80 border-amber-600/60'
const BASS_ON = 'bg-purple-600/80 border-purple-400/60'
const rows = computed(() => {
  const bass = bassInUse(drumStore, rigArmed.bass ?? null)
    ? drumStore.basslineSequences[drumStore.basslineSequence ?? drumStore.activeSequence] ?? []
    : []
  return drumStore.currentPattern.map((t, ti) => {
    const vi = bass.length ? drumStore.basslineSourceSlots.indexOf(ti) : -1
    return vi >= 0 && bass[vi]
      ? { ...bass[vi], label: `Bass ${vi + 1}`, bass: true, on: BASS_ON }
      : { ...t, bass: false, on: DRUM_ON }
  })
})
</script>

<template>
  <div class="flex flex-col gap-2 p-3 min-h-0">
    <PlaySlots :snap="snap" />
    <div class="flex flex-col gap-1 min-h-0">
      <div class="flex items-center gap-2">
        <div class="shrink-0 w-20" />
        <div class="flex-1 flex gap-2">
          <div v-for="b in 4" :key="b" class="flex-1 h-1.5 rounded-full"
               :class="beat === b ? 'bg-amber-400' : 'bg-neutral-800'" />
        </div>
      </div>
      <div v-for="(t, ti) in rows" :key="ti" class="flex items-center gap-2">
        <div class="shrink-0 w-20 text-[10px] font-bold truncate" :class="t.bass ? 'text-purple-300 uppercase' : 'text-neutral-400'">{{ t.label }}</div>
        <div class="flex-1 flex gap-2">
          <div v-for="g in 4" :key="g" class="flex-1 grid grid-cols-4 gap-1">
            <div v-for="l in 4" :key="l" class="h-4 rounded-sm border"
                 :class="(g - 1) * 4 + (l - 1) >= (t.length ?? 16) ? 'bg-transparent border-transparent'
                   : t.steps[(g - 1) * 4 + (l - 1)]?.active
                     ? (t.steps[(g - 1) * 4 + (l - 1)].accent ? (t.bass ? 'bg-purple-400 border-purple-200' : 'bg-amber-400 border-amber-300') : t.on)
                     : 'bg-neutral-900 border-neutral-800'" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
