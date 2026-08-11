<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Play, Square, Settings, AlertTriangle, RefreshCcwDot } from 'lucide-vue-next'
import { useGlobalTransportControls } from '@/composables/useGlobalTransportControls'
import { useSyncStore } from '@/stores/useSyncStore'
import { useArpStore } from '@/stores/useArpStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'

const { transportManager, playAll, stopAll } = useGlobalTransportControls()
const syncStore = useSyncStore()   // still needed here for the sync-checkbox template bindings below
const arpStore = useArpStore()
const midiStore = useMidiStore()
const { openMenu } = useMidiContextMenu()

const showSyncPanel = ref(false)
const position = ref('001:1:1')

let rafId = null

function updatePosition() {
  // Always reschedule, even while stopped — this loop is what notices
  // isRunning flipping true later. Gating the reschedule on isRunning meant
  // the very first call (at mount, before playback starts) saw isRunning
  // false and let the loop die forever, so the position never updated once
  // playback actually began.
  if (transportManager.isRunning.value) {
    const p = transportManager.getBarPosition()
    position.value = `${String(p.bar).padStart(3, '0')}:${p.beat}:${p.sixteenth}`
  } else {
    position.value = '001:1:1'
  }
  rafId = requestAnimationFrame(updatePosition)
}

onMounted(() => {
  rafId = requestAnimationFrame(updatePosition)
  window.addEventListener('transport-play-all', _onTransportPlayAll)
  window.addEventListener('transport-stop-all', _onTransportStopAll)
})

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
  window.removeEventListener('transport-play-all', _onTransportPlayAll)
  window.removeEventListener('transport-stop-all', _onTransportStopAll)
})

function handleBpmChange(e) {
  const v = parseInt(e.target.value)
  if (!isNaN(v) && v >= 20 && v <= 300) {
    midiStore.setGlobalBpm(v)
  }
}

const _onTransportPlayAll = () => { playAll() }
const _onTransportStopAll = () => { stopAll() }
</script>

<template>
  <div class="flex items-center gap-3">
    <!-- Play All / Stop All -->
    <button
      @click="transportManager.isRunning.value ? stopAll() : playAll()"
      @contextmenu.prevent="openMenu($event, { name: 'transport-play-all', label: transportManager.isRunning.value ? 'Stop All' : 'Play All' })"
      class="flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all active:scale-95"
      :class="transportManager.isRunning.value
        ? 'text-red-400 border-red-500/40 bg-red-500/10 hover:bg-red-500/20'
        : 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20'"
    >
      <component :is="transportManager.isRunning.value ? Square : Play" class="w-3 h-3 fill-current" />
      <span>{{ transportManager.isRunning.value ? 'Stop All' : 'Play All' }}</span>
    </button>

    <!-- Sync config gear -->
    <div class="relative">
      <button
        @click="showSyncPanel = !showSyncPanel"
        :class="['p-1.5 rounded transition-colors', showSyncPanel ? 'text-synth-neon bg-synth-neon/10' : 'text-synth-neon']"
        class="hover:bg-synth-neon/30 rounded-full"
        title="Sync apps to transport"
      >
        <RefreshCcwDot class="w-5 h-5" />
      </button>

      <!-- Dropdown panel -->
      <Transition name="sy-modal">
        <div
          v-if="showSyncPanel"
          class="absolute bottom-full right-0 mb-2 w-72 bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl p-4 z-[961]"
        >
          <p class="text-[8px] font-bold uppercase tracking-widest text-neutral-500 mb-3">Sync Apps to Transport</p>

          <div class="space-y-2">
            <label class="flex items-center justify-between cursor-pointer group">
              <span class="text-[10px] font-mono text-neutral-300 group-hover:text-white transition-colors">Step Sequencer</span>
              <input type="checkbox" v-model="syncStore.syncSequencerToTransport" class="accent-synth-neon" />
            </label>
            <label class="flex items-center justify-between cursor-pointer group">
              <span class="text-[10px] font-mono text-neutral-300 group-hover:text-white transition-colors">Sequencer</span>
              <input type="checkbox" v-model="syncStore.syncSequencer2ToTransport" class="accent-synth-neon" />
            </label>
            <label class="flex items-center justify-between cursor-pointer group">
              <span class="text-[10px] font-mono text-neutral-300 group-hover:text-white transition-colors">Chord Prog</span>
              <input type="checkbox" v-model="syncStore.syncChordProgToTransport" class="accent-synth-neon" />
            </label>
            <label class="flex items-center justify-between cursor-pointer group">
              <span class="text-[10px] font-mono text-neutral-300 group-hover:text-white transition-colors">Drum Machine</span>
              <input type="checkbox" v-model="syncStore.syncDrumMachineToTransport" class="accent-synth-neon" />
            </label>
            <label class="flex items-center justify-between cursor-pointer group">
              <span class="text-[10px] font-mono text-neutral-300 group-hover:text-white transition-colors">Backing Track (Playlist)</span>
              <input type="checkbox" v-model="syncStore.syncBackingTrackToTransport" class="accent-synth-neon" />
            </label>
            <label class="flex items-center justify-between cursor-pointer group">
              <span class="text-[10px] font-mono text-neutral-300 group-hover:text-white transition-colors">Arm Record (Audio Capture)</span>
              <input type="checkbox" v-model="syncStore.syncRecordToTransport" class="accent-synth-neon" />
            </label>
          </div>

          <p class="text-[7px] text-neutral-600 mt-3 leading-relaxed">
            Synced apps start at the next bar boundary when the transport is already running.
          </p>
        </div>
      </Transition>
    </div>

    <!-- Position -->
    <span class="text-[10px] font-mono text-neutral-400 tabular-nums w-16 text-center">
      {{ position }}
    </span>

    <!-- BPM -->
    <div class="flex items-center gap-1">
      <span class="text-[8px] text-neutral-600">BPM</span>
      <input
        type="number" min="20" max="300"
        :value="arpStore.arpBpm"
        @change="handleBpmChange"
        class="w-14 bg-black border border-neutral-800 rounded px-1 py-0.5 text-center text-synth-neon text-[12px] focus:outline-none focus:border-synth-neon transition-colors"
      />
    </div>

    
  </div>
</template>