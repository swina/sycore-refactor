<script setup>
import ResizeHandles from '@/components/ui/ResizeHandles.vue'
// Rig Controls (Performance): the Rig Controller's controls in their own column — Transport / Clock,
// Performance, Safety, Controller template and Play. The Rig panel teleports them here
// (lib/rig-controls-host.ts) while it is open in its play view; it keeps their state and actions.
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import { usePlayView } from '@/composables/usePlayView'
import { useUiStore } from '@/stores/useUiStore'
import { rigControlsHost } from '@/lib/rig-controls-host'

defineEmits(['close'])
const uiStore = useUiStore()
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
const { play: rigPlay } = usePlayView('rig-controller')
const shown = computed(() => uiStore.isRigControllerOpen && rigPlay.value)

const body = ref(null)
onMounted(() => { rigControlsHost.value = body.value })
onUnmounted(() => { if (rigControlsHost.value === body.value) rigControlsHost.value = null })
</script>

<template>
  <div class="bg-neutral-950 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden relative" :style="panelStyle" v-show="!isMinimized" @mousedown.capture="bringToFront">
    <div class="shrink-0 h-3 touch-none cursor-grab active:cursor-grabbing bg-white/[0.03] hover:bg-white/[0.07]" title="Rig Controls — drag to move" @pointerdown="onDragStart" />
    <div v-if="!shown" class="p-3 text-[10px] text-neutral-500">
      {{ uiStore.isRigControllerOpen ? 'Rig Controller in EDIT: its controls are in its panel.' : 'Open the Rig Controller: its controls show here.' }}
    </div>
    <div ref="body" class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-2 pb-2 pt-0.5" />
    <ResizeHandles :start="onResizeStart" />
  </div>
</template>
