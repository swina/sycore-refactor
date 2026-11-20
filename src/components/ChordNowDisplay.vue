<script setup>
// Now / Next: the Chord Prog's chord sounding and the one after it, with their lengths ('1/1' = a
// bar…), and a bar filling over the chord sounding. As the SY.CORE Rig device in Live shows it
// (lib/chord-next.ts rigChord; past the end, a queued slot's first chord is next).
// Stopped, a chord played on its own (controller, panel) is Now.
// `stacked`: Now over Next (the Rig Controls column in Performance, above Play); else on one row.
import { computed } from 'vue'
import { useChordProgStore, DURATION_LABELS } from '@/stores/useChordProgStore'
import { rigChord } from '@/lib/chord-next'
import { rigReports, rigArmed } from '@/lib/rig-live'

defineProps({ stacked: { type: Boolean, default: false } })
const store = useChordProgStore()
const queuedSlot = () => {
  const q = rigReports.queued.chord ?? rigArmed.chord
  return q !== null && q !== undefined && q !== store.playingSlotIndex ? store.slots[q] ?? null : null
}
// stopped, a chord played on its own (a controller's MIDI Learn, a click in the panel): Now shows it, no Next
const held = computed(() => {
  if (!store.playingChordName) return null
  const st = store.steps[store.currentStep]
  return { now: store.playingChordName, dur: st ? (DURATION_LABELS[st.duration] ?? '') : '', next: '', nextDur: '', ms: 0, seq: 0 }
})
const chord = computed(() => store.isPlaying ? rigChord(
  { name: store.playingChordName, duration: store.playingChordDuration, ms: store.playingChordMs, bars: store.playingChordBars, seq: store.playingChordSeq },
  store.nextChord, queuedSlot(), DURATION_LABELS,
) : held.value)
</script>

<template>
  <div v-if="stacked" class="relative shrink-0 rounded-lg bg-black border border-white/10 overflow-hidden px-2 pt-1.5 pb-2.5 space-y-0.5">
    <div class="flex items-baseline gap-1.5 min-w-0">
      <span class="w-9 shrink-0 text-[9px] font-bold uppercase tracking-widest text-neutral-500">Now</span>
      <span class="flex-1 min-w-0 font-mono text-lg font-black text-emerald-400 truncate">{{ chord?.now || '—' }}</span>
      <span class="shrink-0 font-mono text-[10px] text-neutral-400">{{ chord?.dur }}</span>
    </div>
    <div class="flex items-baseline gap-1.5 min-w-0">
      <span class="w-9 shrink-0 text-[9px] font-bold uppercase tracking-widest text-neutral-500">Next</span>
      <span class="flex-1 min-w-0 font-mono text-lg font-black text-amber-300 truncate">{{ chord?.next || '—' }}</span>
      <span class="shrink-0 font-mono text-[10px] text-neutral-400">{{ chord?.nextDur }}</span>
    </div>
    <div class="absolute left-0 right-0 bottom-0 h-1 bg-neutral-900">
      <div v-if="chord?.now && chord.ms > 0" :key="chord.seq" class="h-full bg-emerald-500 origin-left chord-now-fill" :style="{ animationDuration: `${chord.ms}ms` }" />
    </div>
  </div>
  <template v-else>
    <div class="flex items-baseline gap-2 px-3 min-w-0">
      <span class="text-[11px] font-bold uppercase tracking-widest text-neutral-500">Now</span>
      <span class="font-mono text-xl font-black text-emerald-400 truncate">{{ chord?.now || '—' }}</span>
      <span class="font-mono text-[11px] text-neutral-400">{{ chord?.dur }}</span>
      <span class="ml-6 text-[11px] font-bold uppercase tracking-widest text-neutral-500">Next</span>
      <span class="font-mono text-xl font-black text-amber-300 truncate">{{ chord?.next || '—' }}</span>
      <span class="font-mono text-[11px] text-neutral-400">{{ chord?.nextDur }}</span>
    </div>
    <!-- the chord's length: a CSS animation (transitions are off in Performance), restarted per chord -->
    <div class="absolute left-0 right-0 bottom-0 h-1 bg-neutral-900">
      <div v-if="chord?.now && chord.ms > 0" :key="chord.seq" class="h-full bg-emerald-500 origin-left chord-now-fill" :style="{ animationDuration: `${chord.ms}ms` }" />
    </div>
  </template>
</template>

<style scoped>
.chord-now-fill { animation-name: chord-now-grow; animation-timing-function: linear; animation-fill-mode: forwards; }
@keyframes chord-now-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
</style>
