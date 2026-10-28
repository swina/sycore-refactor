<script setup>
// FM-1 emulator (github.com/joakimeriksson/fm1-emu, MIT) embedded as an iframe — a first
// evaluation step to check latency and MIDI behaviour before a native AudioWorklet integration.
// The emulator page owns its audio (own AudioContext, not routed through SY.CORE's mixer) and
// reads MIDI itself via Web MIDI: pick the input inside the device panel. To play it from
// SY.CORE apps (sequencer, arp, chord prog) route them to a virtual MIDI port (e.g. loopMIDI)
// and select that port as the emulator's input.
import { ref, watch, onUnmounted } from 'vue'
import { Cpu, RefreshCw, ExternalLink } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import { FM1_FIRMWARES, FM1_DEFAULT_FIRMWARE, FM1_EMU_URL, fm1EmbedUrl } from '@/lib/fm1-firmwares'

const STORAGE_FW = 'SYCORE_FM1_FIRMWARE'

const emit = defineEmits(['close'])
const uiStore = useUiStore()

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
  storageKey: 'SYCORE_POS_FM1_EMULATOR',
  minimizeLabel: 'FM-1 Emulator',
  initialWidth: 760,
  initialHeight: 640,
  minWidth: 420,
  minHeight: 400,
  zIndex: 160,
  panelId: 'fm1-emulator',
})

function readFirmware() {
  try {
    const id = localStorage.getItem(STORAGE_FW)
    if (id && FM1_FIRMWARES.some(f => f.id === id)) return id
  } catch {}
  return FM1_DEFAULT_FIRMWARE
}

const firmware = ref(readFirmware())
// bumping the key remounts the iframe: a clean reboot of the emulator
const reloadKey = ref(0)

watch(firmware, (id) => {
  try { localStorage.setItem(STORAGE_FW, id) } catch {}
})

// While dragging/resizing, the iframe would swallow the mouse events once the
// pointer crosses it: disable its pointer events until the button is released.
const interacting = ref(false)
function endInteract() { interacting.value = false }
function startDrag(e) { interacting.value = true; onDragStart(e) }
function startResize(e, dir) { interacting.value = true; onResizeStart(e, dir) }
window.addEventListener('mouseup', endInteract)
onUnmounted(() => window.removeEventListener('mouseup', endInteract))
</script>

<template>
  <div class="bg-neutral-950 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden relative" :style="panelStyle" v-show="!isMinimized" @mousedown.capture="bringToFront">
    <!-- Header -->
    <div class="flex items-center justify-between gap-3 px-4 py-2 bg-gradient-to-b from-white/5 to-transparent shrink-0 cursor-grab active:cursor-grabbing select-none" @mousedown="startDrag">
      <div class="flex items-center gap-3 min-w-0">
        <div class="p-1.5 bg-cyan-500/20 rounded-lg border border-cyan-500/20">
          <Cpu class="w-4 h-4 text-cyan-400" />
        </div>
        <h2 class="text-sm font-black text-white tracking-[0.1em] uppercase whitespace-nowrap">FM-1 Emulator</h2>
        <span class="bg-amber-400/70 text-[8px] rounded font-mono px-2 text-black">BETA</span>
      </div>

      <div class="flex items-center gap-2" @mousedown.stop>
        <select
          v-model="firmware"
          class="bg-neutral-900 border border-white/10 rounded px-2 py-1 text-[11px] text-white font-mono max-w-[180px]"
          title="Firmware"
        >
          <option v-for="f in FM1_FIRMWARES" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
        <button class="p-1.5 rounded hover:bg-white/10 text-neutral-400 hover:text-white" title="Reboot emulator" @click="reloadKey++">
          <RefreshCw class="w-3.5 h-3.5" />
        </button>
        <a :href="FM1_EMU_URL" target="_blank" rel="noopener" class="p-1.5 rounded hover:bg-white/10 text-neutral-400 hover:text-white" title="Open full emulator page">
          <ExternalLink class="w-3.5 h-3.5" />
        </a>
        <MacOsButtons @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize" />
      </div>
    </div>

    <div class="px-4 pb-2 text-[10px] text-neutral-500 shrink-0">
      Click the device to start audio. Select the MIDI input inside the emulator — to play it from SY.CORE apps, route them to a virtual MIDI port (e.g. loopMIDI) and pick that port there. Audio does not pass through the SY.CORE mixer.
    </div>

    <iframe
      :key="`${firmware}-${reloadKey}`"
      :src="fm1EmbedUrl(firmware)"
      class="flex-1 w-full border-0 bg-black"
      :class="{ 'pointer-events-none': interacting }"
      allow="midi; autoplay"
      title="FM-1 Emulator"
    />

    <div @mousedown.stop="e => startResize(e, 'se')" class="absolute bottom-1 right-1 w-3 h-3 cursor-se-resize z-50 opacity-40 hover:opacity-80" style="background:radial-gradient(circle,#aaa 1px,transparent 1px) 0 0/3px 3px" />
  </div>
</template>
