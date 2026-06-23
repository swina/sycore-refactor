<script setup>
import { computed } from 'vue'
import { Gamepad2, Music, Layers, Cpu, Circle, Plus, Trash2, RefreshCw, Unlink, Wand2, Network } from 'lucide-vue-next'
import { useDeviceRegistry } from '@/composables/useDeviceRegistry'
import { useMidiStore } from '@/stores/useMidiStore'
import { useUiStore } from '@/stores/useUiStore'

const { devices, setDeviceType, removeDevice, clearOffline } = useDeviceRegistry()
const midiStore = useMidiStore()
const uiStore   = useUiStore()

const DEVICE_TYPES = [
  { value: 'controller',        label: 'Controller' },
  { value: 'instrument-single', label: 'Instrument (Single)' },
  { value: 'instrument-multi',  label: 'Instrument (Multi)' },
  { value: 'audio-interface',   label: 'Audio Interface' },
]

function typeIcon(type) {
  if (type === 'controller')        return Gamepad2
  if (type === 'instrument-multi')  return Layers
  if (type === 'audio-interface')   return Cpu
  return Music
}

function typeColor(type) {
  if (type === 'controller')        return 'text-sky-400'
  if (type === 'instrument-multi')  return 'text-violet-400'
  if (type === 'audio-interface')   return 'text-amber-400'
  return 'text-emerald-400'
}

function registration(name) {
  return midiStore.routingConfig?.registrations?.[name]
}

function isRegistered(name) {
  return !!registration(name)
}

function addDevice(name) {
  midiStore.addRegistration(name)
}

function updateReg(name, field, value) {
  if (!isRegistered(name)) midiStore.addRegistration(name)
  midiStore.updateRegistration(name, field, value)
}

function toggleReg(name, field) {
  const reg = registration(name)
  if (!reg) { midiStore.addRegistration(name); return }
  updateReg(name, field, !reg[field])
}

const sortedDevices = computed(() =>
  [...devices.value].sort((a, b) => {
    const aReg = isRegistered(a.name) ? 0 : 1
    const bReg = isRegistered(b.name) ? 0 : 1
    if (aReg !== bReg) return aReg - bReg
    return a.name.localeCompare(b.name)
  })
)
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- Toolbar -->
    <div class="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-black/20 shrink-0">
      <span class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
        {{ devices.filter(d => d.online).length }} online · {{ devices.length }} known
      </span>
      <div class="flex gap-2">
        <button @click="uiStore.isMidiWizardOpen = true"
          class="text-[10px] flex items-center gap-1 px-2 py-1 rounded border border-synth-neon/40 text-synth-neon/70 hover:text-synth-neon hover:border-synth-neon transition-colors"
        >
          <Wand2 class="w-3 h-3" /> Setup Wizard
        </button>
        <button @click="uiStore.isMidiFlowOpen = true"
          class="text-[10px] flex items-center gap-1 px-2 py-1 rounded border border-synth-neon/40 text-synth-neon/70 hover:text-synth-neon hover:border-synth-neon transition-colors"
        >
          <Network class="w-3 h-3" /> Flow
        </button>
        <button @click="midiStore.refreshDevices()"
          class="text-[10px] flex items-center gap-1 px-2 py-1 rounded border border-neutral-700 text-neutral-400 hover:text-emerald-400 hover:border-emerald-700 transition-colors"
        >
          <RefreshCw class="w-3 h-3" /> Refresh
        </button>
        <button @click="clearOffline()"
          class="text-[10px] flex items-center gap-1 px-2 py-1 rounded border border-neutral-700 text-neutral-400 hover:text-rose-500 hover:border-rose-900 transition-colors"
        >
          <Trash2 class="w-3 h-3" /> Clear offline
        </button>
      </div>
    </div>

    <!-- Device cards -->
    <div class="flex-1 overflow-y-auto custom-scrollbar p-4 grid gap-3 auto-rows-min">

      <div v-if="devices.length === 0" class="text-center py-12 text-neutral-600 text-sm font-mono">
        No MIDI devices detected.<br/>Connect a device and click Refresh.
      </div>

      <div
        v-for="d in sortedDevices"
        :key="d.id"
        :class="[
          'rounded-xl border p-4 flex flex-col gap-3 transition-colors',
          d.online
            ? 'bg-neutral-900 border-neutral-700'
            : 'bg-neutral-950 border-neutral-800 opacity-60',
          isRegistered(d.name) ? 'ring-3 ring-cyan-300/70' : ''
        ]"
      >
        <!-- Card header -->
        <div class="flex items-center gap-3">
          <!-- Type icon -->
          <div :class="['w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-black/40', typeColor(d.type)]">
            <component :is="typeIcon(d.type)" class="w-4 h-4" />
          </div>

          <!-- Name + status -->
          <div class="flex-1 min-w-0">
            <p class="text-sm font-bold text-neutral-200 truncate" :title="d.name">{{ d.name }}</p>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider"
                :class="d.online ? 'text-emerald-400' : 'text-neutral-600'"
              >
                <Circle class="w-1.5 h-1.5 fill-current" />
                {{ d.online ? 'Online' : 'Offline' }}
              </span>
              <span class="text-[9px] text-neutral-600 font-mono">
                {{ d.hasInput ? 'IN' : '' }}{{ d.hasInput && d.hasOutput ? '/' : '' }}{{ d.hasOutput ? 'OUT' : '' }}
              </span>
              <span v-if="d.userOverride" class="text-[9px] px-1 rounded bg-amber-900/30 text-amber-500 border border-amber-900/30">custom type</span>
            </div>
          </div>

          <!-- Type override -->
          <select
            :value="d.type"
            @change="setDeviceType(d.id, $event.target.value)"
            class="text-[10px] font-mono bg-black border border-neutral-700 text-neutral-400 px-1.5 py-1 rounded
                   focus:outline-none focus:border-neutral-500 shrink-0 max-w-[130px]"
          >
            <option v-for="t in DEVICE_TYPES" :key="t.value" :value="t.value" class="bg-black">{{ t.label }}</option>
          </select>
        </div>

        <!-- Registration controls (only if registered) -->
        <template v-if="isRegistered(d.name)">
          <div class="grid grid-cols-2 gap-2 text-[10px]">
            <!-- IN channel -->
            <div class="flex items-center gap-2 bg-black/30 rounded-lg px-2 py-1.5">
              <span class="text-neutral-500 uppercase tracking-wider shrink-0 w-12">IN CH</span>
              <select
                :value="registration(d.name)?.inChannel ?? -1"
                @change="updateReg(d.name, 'inChannel', parseInt($event.target.value))"
                class="flex-1 bg-transparent text-neutral-200 font-mono focus:outline-none"
              >
                <option :value="-1" class="bg-black">OMNI</option>
                <option v-for="c in 16" :key="c" :value="c - 1" class="bg-black">{{ c }}</option>
              </select>
            </div>
            <!-- OUT channel -->
            <div class="flex items-center gap-2 bg-black/30 rounded-lg px-2 py-1.5">
              <span class="text-neutral-500 uppercase tracking-wider shrink-0 w-14">OUT CH</span>
              <select
                :value="registration(d.name)?.outChannel ?? -1"
                @change="updateReg(d.name, 'outChannel', parseInt($event.target.value))"
                class="flex-1 bg-transparent text-neutral-200 font-mono focus:outline-none"
              >
                <option :value="-1" class="bg-black">Pass</option>
                <option v-for="c in 16" :key="c" :value="c - 1" class="bg-black">{{ c }}</option>
              </select>
            </div>
          </div>

          <!-- Quick toggles + unregister -->
          <div class="flex flex-wrap gap-1.5 items-center">
            <label
              v-for="(label, field) in { notes: 'Notes', cc: 'CC', clock: 'Clock', transport: 'Transp', midiThru: 'Thru' }"
              :key="field"
              class="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider cursor-pointer select-none
                     px-2 py-1 rounded border transition-colors"
              :class="registration(d.name)?.[field]
                ? 'bg-emerald-900/20 border-emerald-700/40 text-emerald-400'
                : 'bg-neutral-800/40 border-neutral-700 text-neutral-600'"
              @click="toggleReg(d.name, field)"
            >
              <input type="checkbox" :checked="registration(d.name)?.[field]" class="sr-only" />
              {{ label }}
            </label>
            <button
              @click="midiStore.removeRegistration(d.name)"
              title="Remove from routing matrix"
              class="ml-auto flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider px-2 py-1 rounded border border-rose-900/40 text-rose-500/70 hover:text-rose-400 hover:border-rose-700 hover:bg-rose-900/20 transition-colors"
            >
              <Unlink class="w-3 h-3" /> Unregister
            </button>
          </div>
        </template>

        <!-- Not registered: show Add button -->
        <div v-else class="flex items-center justify-between">
          <span class="text-[10px] text-neutral-600 font-mono italic">Not in routing matrix</span>
          <button
            @click="addDevice(d.name)"
            class="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-emerald-700/40 text-emerald-500 hover:bg-emerald-900/20 transition-colors"
          >
            <Plus class="w-3 h-3" /> Add to routing
          </button>
        </div>

      </div>
    </div>
  </div>
</template>
