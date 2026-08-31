<template>
  <div v-show="uiStore.isLiveInputOpen && !isMinimized" :style="panelStyle"
    class="fixed flex flex-col bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl"
    @mousedown.capture="bringToFront"
  >
    <!-- Title bar -->
    <div
      class="flex items-center justify-between px-3 py-1 bg-neutral-900 border-b border-neutral-800 cursor-move select-none shrink-0"
      @mousedown.self="onDragStart"
    >
      <div class="flex items-center gap-2">
        <Mic class="w-3.5 h-3.5 text-violet-400 pointer-events-none" />
        <span class="text-[11px] font-black uppercase tracking-[0.2em] text-white pointer-events-none">Live Input</span>
        <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest pointer-events-none">{{ liveInputStore.isOpen ? liveInputStore.deviceLabel || 'connected' : 'closed' }}</span>
      </div>
      <div class="flex items-center gap-1">
        <MacOsButtons @close="uiStore.isLiveInputOpen = false" @minimize="toggleMinimize" @maximize="maximize" />
      </div>
    </div>

    <template v-if="!isMinimized">
      <div class="flex-1 overflow-auto p-3 flex flex-col gap-3">

        <!-- Device + enable/disable -->
        <div class="flex items-center gap-2 p-2 bg-neutral-900 rounded">
          <select v-model="selectedDeviceId"
            class="flex-1 min-w-0 bg-black border border-neutral-700 rounded text-[11px] font-mono text-neutral-300 px-2 py-1.5 focus:outline-none focus:border-violet-500/50"
          >
            <option :value="null">Default input</option>
            <option v-for="d in liveInputStore.devices" :key="d.deviceId" :value="d.deviceId">{{ d.label }}</option>
          </select>
          <button
            @click="toggleOpen"
            :disabled="opening"
            :class="[
              'px-3 py-1.5 rounded border text-[10px] font-black uppercase tracking-widest transition-colors shrink-0',
              liveInputStore.isOpen
                ? 'bg-red-600 border-red-500 text-white hover:bg-red-500'
                : 'bg-violet-600 border-violet-500 text-white hover:bg-violet-500',
              opening ? 'opacity-50 cursor-wait' : ''
            ]"
          >{{ opening ? 'Opening…' : (liveInputStore.isOpen ? 'Disable' : 'Enable') }}</button>
        </div>

        <p v-if="liveInputStore.error" class="text-[10px] font-mono text-red-400 px-1">{{ liveInputStore.error }}</p>

        <!-- Level meter -->
        <div class="p-2 bg-neutral-900 rounded">
          <div class="flex items-center justify-between mb-1">
            <span class="text-[9px] font-mono uppercase tracking-widest text-neutral-500">Input Level</span>
            <span class="text-[9px] font-mono text-neutral-500">{{ liveInputStore.isOpen ? 'monitoring' : 'idle' }}</span>
          </div>
          <div class="h-2 rounded bg-black overflow-hidden">
            <div class="h-full transition-[width] duration-75"
              :class="meterLevel > 0.9 ? 'bg-red-500' : meterLevel > 0.7 ? 'bg-amber-400' : 'bg-emerald-500'"
              :style="{ width: `${Math.min(100, meterLevel * 100)}%` }"
            />
          </div>
        </div>

        <!-- Controls -->
        <div class="flex items-start gap-2 flex-nowrap">
          <div class="flex flex-col items-center gap-2 p-2 bg-neutral-900 rounded">
            <span class="text-[11px] text-violet-500 font-mono uppercase tracking-widest">Level</span>
            <div class="grid grid-cols-2 gap-x-6 gap-y-2">
              <KnobDial :modelValue="liveInputStore.config.level" :min="0" :max="1.5" :step="0.01" :defaultVal="0.85" label="Level" :format="fmtPct" @change="v => liveInputStore.setLevel(v)" />
              <KnobDial :modelValue="liveInputStore.config.pan"   :min="-1" :max="1" :step="0.01" :defaultVal="0" label="Pan" :format="fmtPan" @change="v => liveInputStore.setPan(v)" />
            </div>
          </div>

          <div class="flex flex-col items-center gap-2 p-2 bg-neutral-900 rounded">
            <span class="text-[11px] text-violet-500 font-mono uppercase tracking-widest">Filter</span>
            <div class="grid grid-cols-2 gap-x-6 gap-y-2">
              <KnobDial :modelValue="liveInputStore.config.filterFreq" :min="80" :max="20000" :step="10" :defaultVal="20000" label="Freq" :format="fmtHz" @change="v => liveInputStore.setFilterFreq(v)" />
              <KnobDial :modelValue="liveInputStore.config.filterResonance" :min="0" :max="127" :step="1" :defaultVal="0" label="Reso" :format="fmtInt" @change="v => liveInputStore.setFilterResonance(v)" />
            </div>
            <select :value="liveInputStore.config.filterType" @change="e => liveInputStore.setFilterType(e.target.value)"
              class="bg-black border border-neutral-700 rounded px-1 py-0.5 text-[11px] font-mono text-white outline-none focus:border-violet-500 w-full"
              title="Filter type">
              <option value="lowpass">Lowpass</option>
              <option value="highpass">Highpass</option>
              <option value="bandpass">Bandpass</option>
              <option value="lowshelf">Low Shelf</option>
              <option value="highshelf">High Shelf</option>
              <option value="notch">Notch</option>
              <option value="allpass">All-pass</option>
              <option value="peaking">Peaking</option>
            </select>
          </div>
        </div>

        <p class="text-[9px] font-mono text-neutral-600 px-1 leading-relaxed">
          Plug in a class-compliant USB audio interface, pick it above, and click Enable — the browser will ask for
          permission once. FX chain and Modulation Matrix routing for this channel aren't exposed here yet; they're
          reachable via the live-input store/engine directly. See docs/plans/Sycore-DSP-Integration-Feasibility.md.
        </p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { Mic } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { useLiveInputStore } from '@/stores/useLiveInputStore'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import KnobDial from '@/components/ui/KnobDial.vue'

const uiStore = useUiStore()
const liveInputStore = useLiveInputStore()

const { panelStyle, onDragStart, isMinimized, toggleMinimize, bringToFront, maximize } =
  useDraggableResizable({
    storageKey:    'S1_LIVE_INPUT_DR',
    minimizeLabel: 'Live Input',
    openRef:       () => uiStore.isLiveInputOpen,
    initialWidth:  360,
    initialHeight: 420,
    minWidth:      320,
    minHeight:     320,
    zIndex:        200,
    panelId:       'live-input',
  })

watch(() => uiStore.isLiveInputOpen, v => { if (v) bringToFront() })

const selectedDeviceId = ref(liveInputStore.config.deviceId)
const opening = ref(false)
const meterLevel = ref(0)
let meterInterval = null

async function toggleOpen() {
  if (liveInputStore.isOpen) {
    liveInputStore.close()
    return
  }
  opening.value = true
  try {
    await liveInputStore.open(selectedDeviceId.value ?? undefined)
  } finally {
    opening.value = false
  }
}

onMounted(() => {
  liveInputStore.refreshDevices()
  meterInterval = setInterval(() => {
    meterLevel.value = liveInputStore.isOpen ? liveInputStore.getInputLevel() : 0
  }, 100)
})

onUnmounted(() => {
  if (meterInterval) clearInterval(meterInterval)
})

const fmtPct = v => `${Math.round(v * 100)}%`
const fmtPan = v => v === 0 ? 'C' : v < 0 ? `L${(-v * 100).toFixed(0)}` : `R${(v * 100).toFixed(0)}`
const fmtHz  = v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)
const fmtInt = v => v.toFixed(0)
</script>
