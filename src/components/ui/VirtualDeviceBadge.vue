<script setup>
// Toolbar: the Virtual Device's current channel (▼▲ to change it) and current preset.
// Replaces the old "Multi Device: MIDI Channel" selector. No MIDI Learn here: channel and
// preset are already learnable on the Virtual Device itself.
import { computed } from 'vue'
import { SlidersHorizontal, ChevronUp, ChevronDown } from 'lucide-vue-next'
import { useVirtualDeviceStore } from '@/stores/useVirtualDeviceStore'
import { useUiStore } from '@/stores/useUiStore'
import { bankProgramLabel } from '@/lib/virtual-device'

const vd = useVirtualDeviceStore()
const uiStore = useUiStore()

const device  = computed(() => vd.activeDevice)
const channel = computed(() => device.value ? vd.channel(device.value) : 0)
const preset  = computed(() => device.value ? vd.presetState(device.value, channel.value) : null)
const title   = computed(() => `Virtual Device · ${device.value} · CH ${channel.value + 1} · ${preset.value?.soundName ?? 'No preset'} (${bankProgramLabel(preset.value)})`)

function open() { uiStore.openPanel('virtual-device') }
</script>

<template>
  <div v-if="device" class="flex items-center gap-1.5 bg-neutral-900/60 border border-neutral-800 rounded-full px-2 py-1 hover:border-emerald-500/30 transition-all max-w-[220px]" :title="title">
    <button class="text-emerald-500 hover:text-emerald-300 transition-colors" title="Open the Virtual Device" @click="open">
      <SlidersHorizontal class="w-3 h-3" />
    </button>
    <button class="text-neutral-600 hover:text-white transition-colors" title="Virtual Device: previous channel" @click="vd.stepChannel(device, -1)">
      <ChevronDown class="w-3 h-3" />
    </button>
    <span class="text-[11px] font-mono font-bold text-emerald-400 tabular-nums">{{ String(channel + 1).padStart(2, '0') }}</span>
    <button class="text-neutral-600 hover:text-white transition-colors" title="Virtual Device: next channel" @click="vd.stepChannel(device, 1)">
      <ChevronUp class="w-3 h-3" />
    </button>
    <span class="pl-1.5 border-l border-neutral-800 text-[11px] font-mono truncate" :class="preset?.soundName ? 'text-neutral-200' : 'text-neutral-600'">
      {{ preset?.soundName ?? 'No preset' }}
    </span>
  </div>
</template>
