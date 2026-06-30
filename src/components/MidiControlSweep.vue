<template>
  <div class="flex flex-col h-full bg-neutral-950 text-neutral-300 text-[10px]">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 bg-neutral-900 border-b border-neutral-800 shrink-0">
      <div class="flex items-center gap-2">
        <Radio class="w-3.5 h-3.5 text-cyan-400" />
        <span class="text-[11px] font-black uppercase tracking-[0.2em] text-white">Sweep</span>
      </div>
      <button @click="$emit('close')" class="p-0.5 text-neutral-500 hover:text-white">
        <X class="w-3 h-3" />
      </button>
    </div>

    <!-- Device selector -->
    <div class="flex items-center gap-2 px-3 py-2 border-b border-neutral-800 shrink-0">
      <span class="text-[9px] uppercase tracking-widest text-neutral-500 font-bold shrink-0">Device</span>
      <select
        v-model="deviceName"
        :disabled="isSweeping"
        class="flex-1 bg-neutral-800 border border-neutral-700 rounded text-[10px] text-neutral-300 px-2 py-1 focus:outline-none focus:border-cyan-500 min-w-0"
      >
        <option value="">— Select device —</option>
        <option v-for="d in midiStore.inputs" :key="d.id" :value="d.name">{{ d.name }}</option>
      </select>
      <button
        @click="isSweeping ? stop() : start()"
        :disabled="!deviceName"
        :class="[
          'px-3 py-1 rounded text-[9px] font-black uppercase tracking-wider border transition-colors shrink-0',
          isSweeping
            ? 'bg-red-500/20 border-red-500/60 text-red-400 hover:bg-red-500/30'
            : 'bg-cyan-500/20 border-cyan-500/60 text-cyan-400 hover:bg-cyan-500/30'
        ]"
      >
        {{ isSweeping ? 'Stop' : 'Sweep' }}
      </button>
    </div>

    <!-- Status / discovered count -->
    <div v-if="isSweeping" class="flex items-center gap-2 px-3 py-1.5 bg-cyan-950/30 border-b border-cyan-800/30 shrink-0">
      <Loader class="w-3 h-3 text-cyan-400 animate-spin" />
      <span class="text-[9px] text-cyan-400 font-bold uppercase tracking-wider">
        Sweeping — move controls on {{ deviceName }}...
      </span>
      <span class="text-[9px] text-cyan-600 font-mono ml-auto">{{ discovered.length }} found</span>
    </div>

    <!-- Discovered controls list -->
    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <div v-if="discovered.length === 0 && !isSweeping" class="flex flex-col items-center justify-center h-full text-neutral-600 gap-1">
        <Radio class="w-6 h-6" />
        <span class="text-[9px] italic">Select a device and start sweeping</span>
      </div>

      <div v-for="(entry, i) in discovered" :key="entry.id" class="flex items-center gap-2 px-3 py-1.5 border-b border-neutral-800/50 hover:bg-neutral-900/50">
        <span class="text-[8px] text-neutral-600 font-mono w-5 shrink-0">{{ i + 1 }}</span>

        <!-- Control type icon -->
        <span
          class="shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-black"
          :class="typeClass(entry)"
        >{{ typeIcon(entry) }}</span>

        <!-- Label -->
        <input
          v-model="entry.label"
          class="flex-1 bg-transparent border-b border-transparent hover:border-neutral-700 focus:border-cyan-500 text-[10px] text-white px-1 py-0.5 outline-none min-w-0"
          placeholder="Label"
        />

        <!-- MIDI info -->
        <span class="text-[8px] text-neutral-500 font-mono shrink-0">
          <template v-if="entry.ccNumber != null">CC{{ entry.ccNumber }}</template>
          <template v-else-if="entry.noteNumber != null">Note{{ entry.noteNumber }}</template>
          <template v-else>Pitch</template>
          · CH{{ entry.channel }}
        </span>

        <!-- Type override -->
        <select
          v-model="entry.type"
          class="bg-neutral-800 border border-neutral-700 rounded text-[8px] text-neutral-300 px-1 py-0.5 focus:outline-none focus:border-cyan-500 w-16 shrink-0"
        >
          <option value="pad-switch">Switch</option>
          <option value="pad-momentary">Moment</option>
          <option value="slider">Slider</option>
          <option value="encoder">Enc</option>
        </select>

        <!-- Add button -->
        <button
          @click="addToCanvas(entry)"
          class="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border border-emerald-600/50 text-emerald-400 hover:bg-emerald-500/20 transition-colors shrink-0"
          title="Add to canvas"
        >
          +Add
        </button>

        <!-- Value count -->
        <span class="text-[7px] text-neutral-600 font-mono w-6 text-right shrink-0">{{ entry.count }}x</span>
      </div>
    </div>

    <!-- Batch add bar -->
    <div v-if="discovered.length > 0 && !isSweeping" class="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-t border-neutral-800 shrink-0">
      <input
        v-model.number="batchOffsetX"
        type="number" min="0" max="2000" step="10"
        class="bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 text-[9px] text-white w-12 focus:outline-none focus:border-cyan-500"
        placeholder="X"
      />
      <input
        v-model.number="batchOffsetY"
        type="number" min="0" max="2000" step="10"
        class="bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 text-[9px] text-white w-12 focus:outline-none focus:border-cyan-500"
        placeholder="Y"
      />
      <button
        @click="addAllToCanvas"
        class="flex-1 py-1 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 border border-emerald-500/60 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
      >
        Add All ({{ discovered.length }})
      </button>
      <button @click="clear" class="px-2 py-1 text-[8px] text-neutral-500 hover:text-red-400 transition-colors uppercase tracking-wider font-bold">
        Clear
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { X, Radio, Loader } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { useMidiSweep } from '@/composables/useMidiSweep'

const midiStore = useMidiStore()
const emit = defineEmits(['add', 'close'])

const deviceName = ref('')
const batchOffsetX = ref(10)
const batchOffsetY = ref(10)

const {
  isSweeping,
  discovered,
  startSweep,
  stopSweep,
  createControlItem,
  clear: clearSweep,
} = useMidiSweep()

const isSweepingRef = isSweeping

function start() {
  startSweep(deviceName.value)
}

function stop() {
  stopSweep()
}

function addToCanvas(entry) {
  const ctrl = createControlItem(entry, batchOffsetX.value, batchOffsetY.value)
  batchOffsetY.value += 10
  emit('add', ctrl)
}

function addAllToCanvas() {
  let x = batchOffsetX.value
  let y = batchOffsetY.value
  const cols = 4
  for (const entry of discovered.value) {
    const ctrl = createControlItem(entry, x, y)
    emit('add', ctrl)
    if ((discovered.value.indexOf(entry) + 1) % cols === 0) {
      x = batchOffsetX.value
      y += 80
    } else {
      x += 80
    }
  }
}

function clear() {
  clearSweep()
  deviceName.value = ''
}

function typeClass(entry) {
  if (entry.ccNumber != null) {
    if (entry.type === 'pad-switch' || entry.type === 'pad-momentary') return 'bg-violet-900/60 text-violet-300'
    if (entry.type === 'slider') return 'bg-emerald-900/60 text-emerald-300'
    return 'bg-amber-900/60 text-amber-300'
  }
  if (entry.noteNumber != null) return 'bg-rose-900/60 text-rose-300'
  return 'bg-sky-900/60 text-sky-300'
}

function typeIcon(entry) {
  if (entry.ccNumber != null) {
    if (entry.type === 'pad-switch' || entry.type === 'pad-momentary') return 'BTN'
    if (entry.type === 'slider') return 'SL'
    return 'EN'
  }
  if (entry.noteNumber != null) return 'PD'
  return 'PB'
}
</script>