<script setup>
import ResizeHandles from '@/components/ui/ResizeHandles.vue'
// Now / Next (Performance): the Chord Prog's chord sounding and the one after it, with their
// lengths ('1/1' = a bar…), and a bar filling over the chord sounding. As the SY.CORE Rig device
// in Live shows it (lib/chord-next.ts rigChord; past the end, a queued slot's first chord is next).
import { computed } from 'vue'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import { useChordProgStore, DURATION_LABELS } from '@/stores/useChordProgStore'
import { rigChord } from '@/lib/chord-next'
import { rigReports, rigArmed } from '@/lib/rig-live'

defineEmits(['close'])
const { panelStyle, onDragStart, onResizeStart, isMinimized, bringToFront } = useDraggableResizable({
  storageKey: 'SYCORE_POS_CHORD_NOW',
  minimizeLabel: 'Now / Next',
  initialWidth: 540,
  initialHeight: 44,
  minWidth: 240,
  minHeight: 36,
  zIndex: 160,
  panelId: 'chord-now',
})

const store = useChordProgStore()
const queuedSlot = () => {
  const q = rigReports.queued.chord ?? rigArmed.chord
  return q !== null && q !== undefined && q !== store.playingSlotIndex ? store.slots[q] ?? null : null
}
const chord = computed(() => store.isPlaying ? rigChord(
  { name: store.playingChordName, duration: store.playingChordDuration, ms: store.playingChordMs, bars: store.playingChordBars, seq: store.playingChordSeq },
  store.nextChord, queuedSlot(), DURATION_LABELS,
) : null)
</script>

<template>
  <div class="bg-neutral-950 border border-white/10 rounded-xl shadow-2xl flex flex-col justify-center overflow-hidden relative touch-none cursor-grab active:cursor-grabbing select-none"
       :style="panelStyle" v-show="!isMinimized" @mousedown.capture="bringToFront" @pointerdown="onDragStart">
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
    <ResizeHandles :start="onResizeStart" />
  </div>
</template>

<style scoped>
.chord-now-fill { animation-name: chord-now-grow; animation-timing-function: linear; animation-fill-mode: forwards; }
@keyframes chord-now-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
</style>
