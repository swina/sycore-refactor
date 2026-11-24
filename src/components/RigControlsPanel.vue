<script setup>
import ResizeHandles from '@/components/ui/ResizeHandles.vue'
import RigControlSections from '@/components/RigControlSections.vue'
import ChordNowDisplay from '@/components/ChordNowDisplay.vue'
// Rig Controls (Performance): the Rig Controller's controls in their own column — Transport / Clock,
// Performance, Now / Next and Play. Their state and actions are the Rig engine's (core/engines/rig.js):
// they work with the Rig panel closed.
import { Play, Square } from 'lucide-vue-next'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import { useRigEngine } from '@/core/engines/rig'
import { countIn } from '@/lib/count-in'

defineEmits(['close'])
const { panelStyle, onDragStart, onResizeStart, isMinimized, bringToFront } = useDraggableResizable({
  storageKey: 'SYCORE_POS_RIG_CONTROLS',
  minimizeLabel: 'Rig Controls',
  initialWidth: 180,
  initialHeight: 600,
  minWidth: 160,
  minHeight: 300,
  zIndex: 160,
  panelId: 'rig-controls',
})
const { s, live, playOn, togglePlay, learnedRing, learnMenu } = useRigEngine()
</script>

<template>
  <div class="bg-neutral-950 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden relative" :style="panelStyle" v-show="!isMinimized" @mousedown.capture="bringToFront">
    <div class="shrink-0 h-3 touch-none cursor-grab active:cursor-grabbing bg-white/[0.03] hover:bg-white/[0.07]" title="Rig Controls — drag to move" @pointerdown="onDragStart" />
    <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-2 pb-2 pt-0.5">
      <div class="flex flex-col gap-2 text-xs min-h-0 h-full">
        <RigControlSections only="transport" />
        <RigControlSections only="performance" />
        <!-- no Controller template here: set up in EDIT (the Rig layout), not while performing -->
        <!-- Now / Next (the Chord Prog's chords) right above Play -->
        <ChordNowDisplay stacked class="mt-auto" />
        <button class="shrink-0 h-14 flex items-center justify-center gap-2 rounded-lg border text-sm font-black uppercase tracking-widest select-none"
                :class="[playOn ? 'bg-emerald-500/80 border-emerald-300 text-black' : 'bg-neutral-800 border-white/15 text-neutral-200 hover:bg-neutral-700', learnedRing('rig_play')]"
                :title="(live && s.clock.source === 'EXT' ? 'Play / Stop Ableton Live (SY.CORE Link)' : 'Play / Stop the clock') + ' — right-click: MIDI Learn'"
                @click="togglePlay" @contextmenu="learnMenu($event, 'rig_play', 'Play / Stop')">
          <component :is="playOn ? Square : Play" class="w-5 h-5" /> {{ countIn.active ? `Count ${countIn.left}` : playOn ? 'Stop' : 'Play' }}
        </button>
      </div>
    </div>
    <ResizeHandles :start="onResizeStart" />
  </div>
</template>
