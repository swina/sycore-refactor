<script setup>
import PanelHeader from '@/components/ui/PanelHeader.vue'
// Sound Devices (Sound Design's left pane): the sound devices cabled in MIDI Flow — hardware instruments and
// virtual instruments, not the controllers — each with its image (uploaded in MIDI Devices) or its type's icon.
// A click opens its editor in the middle pane (lib/sound-design.ts: S-1 → Sound Engine, MicroFreak → MicroFreak
// Editor, any other → Virtual Device) and takes Multi Sound (banks, presets) to it.
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import ResizeHandles from '@/components/ui/ResizeHandles.vue'
import { Music } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { useUiStore } from '@/stores/useUiStore'
import { useMidiFlowConfigsStore } from '@/stores/useMidiFlowConfigsStore'
import { useVirtualDeviceStore } from '@/stores/useVirtualDeviceStore'
import { useWorkspaceStore } from '@/stores/useWorkspaceStore'
import { useDeviceImages } from '@/composables/useDeviceImages'
import { typeMeta } from '@/lib/device-type-meta'
import { soundDevicesOf, soundDesignDevice, soundDesignPort } from '@/lib/sound-design'
import { dispatch } from '@/types/events'

const emit = defineEmits(['close'])
const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
  storageKey: 'SYCORE_POS_SOUND_DEVICES',
  minimizeLabel: 'Sound Devices',
  initialWidth: 280,
  initialHeight: 560,
  minWidth: 200,
  minHeight: 200,
  zIndex: 120,
  panelId: 'sound-devices',
})

const midiStore = useMidiStore()
const uiStore = useUiStore()
const vd = useVirtualDeviceStore()
const ws = useWorkspaceStore()
const { liveNodes } = storeToRefs(useMidiFlowConfigsStore())
const { images } = useDeviceImages()

const devices = computed(() => soundDevicesOf(liveNodes.value ?? [], midiStore.routingConfig?.registrations ?? {}, midiStore.virtualInstruments ?? []))
const EDITOR_LABEL = { 'sound-engine': 'Sound Engine', 'microfreak-editor': 'MicroFreak Editor', 'virtual-device': 'Virtual Device' }
const online = d => midiStore.isOutputOnline?.(d.port || d.name) ?? true

// back in Sound Design: the Virtual Device on the device picked last
onMounted(() => {
  const d = devices.value.find(x => x.name === soundDesignDevice.value)
  if (d) { soundDesignPort.value = d.port || d.name; if (d.editor === 'virtual-device') vd.selectedDevice = d.name }
})

function pick(d) {
  soundDesignDevice.value = d.name
  soundDesignPort.value = d.port || d.name
  if (d.editor === 'virtual-device') vd.selectedDevice = d.name
  dispatch('device-pc-select', { deviceName: d.name })   // Multi Sound: this device
  ws.showInSlot(d.editor)
}
</script>

<template>
  <div class="bg-neutral-950 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden relative" :style="panelStyle" v-show="!isMinimized" @mousedown.capture="bringToFront">
    <PanelHeader title="Sound Devices" :icon="Music" accent="text-rose-300"
                 @pointerdown="onDragStart" @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize" />
    <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-2">
      <div v-if="!devices.length" class="p-3 text-[11px] text-neutral-500 leading-relaxed">
        No sound devices in MIDI Flow. Put your instruments (hardware or virtual) on the MIDI Flow canvas and cable them:
        they show up here.
        <button class="mt-2 block text-synth-neon hover:underline" @click="uiStore.openPanel('midi-flow')">Open MIDI Flow</button>
      </div>
      <button v-for="d in devices" :key="d.name" @click="pick(d)"
              class="flex items-center gap-3 p-2 rounded-xl border text-left transition-colors"
              :class="soundDesignDevice === d.name ? 'border-synth-neon/70 bg-synth-neon/10' : 'border-white/10 bg-white/[0.02] hover:border-white/30'"
              :title="`${d.name} — opens the ${EDITOR_LABEL[d.editor]}${d.port ? ' (through ' + d.port + ')' : ''}`">
        <div class="w-[100px] h-[100px] shrink-0 rounded-lg overflow-hidden bg-black/40 border border-white/10 flex items-center justify-center">
          <img v-if="images[d.name] || (d.port && images[d.port])" :src="images[d.name] || images[d.port]" :alt="d.name" class="w-full h-full object-cover" />
          <component v-else :is="typeMeta(d.type).icon" class="w-10 h-10" :class="typeMeta(d.type).text" />
        </div>
        <div class="min-w-0 flex flex-col gap-1">
          <span class="text-[12px] font-bold text-white leading-tight break-words">{{ d.name }}</span>
          <span class="text-[9px] font-mono uppercase tracking-wider" :class="typeMeta(d.type).text">{{ typeMeta(d.type).label }}</span>
          <span class="text-[9px] font-mono text-neutral-500">{{ EDITOR_LABEL[d.editor] }}</span>
          <span v-if="!online(d)" class="text-[9px] font-mono text-red-400/80">offline</span>
        </div>
      </button>
    </div>
    <ResizeHandles :start="onResizeStart" />
  </div>
</template>
