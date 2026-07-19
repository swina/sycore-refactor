<script setup>
import { computed } from 'vue'
import { Gamepad2, Music, Layers, Cable, Cpu, Circle, Plus, Trash2, RefreshCw, Unlink, Wand2, Network, Radio } from 'lucide-vue-next'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import { useDeviceRegistry } from '@/composables/useDeviceRegistry'
import { midiService } from '@/core/midi/midi-service'
import { useMidiStore } from '@/stores/useMidiStore'
import { useUiStore } from '@/stores/useUiStore'

const { devices, setDeviceType, removeDevice, clearOffline } = useDeviceRegistry()
const midiStore = useMidiStore()
const uiStore   = useUiStore()

const { panelStyle, onDragStart, bringToFront, toggleMinimize, maximize, onResizeStart } = useDraggableResizable({
  storageKey:    'SYCORE_POS_MIDI_DEVICES',
  initialWidth:  540,
  initialHeight: 540,
  minWidth:      420,
  minHeight:     380,
  zIndex:        120,
  minimizeLabel: 'MIDI Devices',
})

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

function promptAddVirtualInstrument() {
  const name = window.prompt('Virtual instrument name:')
  if (!name || !name.trim()) return
  // Show port selector
  const ports = midiStore.outputs.map(o => o.name)
  let port = ''
  if (ports.length > 0) {
    const portMsg = 'Available MIDI outputs:\n' + ports.map((p, i) => `  ${i + 1}. ${p}`).join('\n') + '\n\nEnter the number of the port this virtual instrument listens on (or leave blank for none):'
    const answer = window.prompt(portMsg)
    if (answer) {
      const idx = parseInt(answer) - 1
      if (idx >= 0 && idx < ports.length) port = ports[idx]
    }
  }
  midiStore.addVirtualInstrument(name.trim(), port)
}

function onVirtualPortChange(name, port) {
  const v = midiStore.virtualInstruments.find(x => x.name === name)
  if (!v) return
  midiStore.updateVirtualInstrument(name, { midiOutputPort: port })
  // Re-register the handler with the new port
  midiService.unregisterVirtualOutput(name)
  midiService.registerVirtualOutput(name, (data) => {
    if (port) {
      midiService.sendRawToDeviceByName(port, data)
    }
  })
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
  <div
    class="fixed select-none"
    :style="panelStyle"
    @mousedown="bringToFront"
  >
    <div @mousedown.stop="e => onResizeStart(e, 'n')"  class="absolute top-0    left-3 right-3 h-1   cursor-n-resize  z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 's')"  class="absolute bottom-0 left-3 right-3 h-1   cursor-s-resize  z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'e')"  class="absolute top-3 bottom-3 right-0  w-1   cursor-e-resize  z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'w')"  class="absolute top-3 bottom-3 left-0   w-1   cursor-w-resize  z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'ne')" class="absolute top-0    right-0  w-3 h-3 cursor-ne-resize z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'nw')" class="absolute top-0    left-0   w-3 h-3 cursor-nw-resize z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'sw')" class="absolute bottom-0 left-0   w-3 h-3 cursor-sw-resize z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'se')" class="absolute bottom-1 right-1  w-3 h-3 cursor-se-resize z-50 opacity-40 hover:opacity-80" style="background:radial-gradient(circle,#aaa 1px,transparent 1px) 0 0/3px 3px" />
    <div class="h-full flex flex-col bg-neutral-950 border border-synth-neon/30 rounded-2xl overflow-hidden shadow-2xl">

      <!-- Header -->
      <div
        class="flex items-center justify-between px-4 py-3 bg-neutral-900/60 border-b border-neutral-800 cursor-grab active:cursor-grabbing"
        @mousedown.stop="onDragStart"
      >
        <span class="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-synth-neon">
          <Network class="w-4 h-4" /> MIDI DEVICES
        </span>
        <div class="flex items-center gap-2">
          <span class="text-[10px] font-mono text-neutral-500">
            {{ devices.filter(d => d.online).length }} online · {{ devices.length }} known
          </span>
        </div>
        <MacOsButtons @close="uiStore.isMidiDevicesOpen = false" @minimize="toggleMinimize" @maximize="maximize" />
      </div>

      <!-- Toolbar -->
      <div class="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-black/20 shrink-0">
        <div class="flex gap-2">
          <!-- <button @click="uiStore.isMidiWizardOpen = true"
            class="text-[10px] flex items-center gap-1 px-2 py-1 rounded border border-synth-neon/40 text-synth-neon/70 hover:text-synth-neon hover:border-synth-neon transition-colors"
          >
            <Wand2 class="w-3 h-3" /> Setup Wizard
          </button> -->
          <button @click="uiStore.isMidiFlowOpen = true"
            title="Connect your devices"
            class="text-[12px] flex items-center gap-1 px-2 py-1 rounded border border-synth-neon/40 text-synth-neon hover:text-synth-neon hover:border-synth-neon transition-colors"
          >
            <Cable class="w-3 h-3" /> Flow
          </button>
        </div>
        <div class="flex gap-2">
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
            <div :class="['w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-black/40', typeColor(d.type)]">
              <component :is="typeIcon(d.type)" class="w-4 h-4" />
            </div>

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

        <!-- ── Virtual Instruments ── -->
        <div class="border-t border-neutral-800 pt-3 mt-1">
          <div class="flex items-center justify-between px-1 mb-2">
            <span class="text-[10px] font-bold uppercase tracking-widest text-amber-400/70 flex items-center gap-1.5">
              <Radio class="w-3 h-3" /> Virtual Instruments
            </span>
            <span class="text-[9px] font-mono text-neutral-600">{{ midiStore.virtualInstruments.length }}</span>
          </div>

          <div v-if="midiStore.virtualInstruments.length === 0" class="text-[10px] text-neutral-700 font-mono italic px-1 mb-2">
            No virtual instruments. Add one to route MIDI to a standalone app.
          </div>

          <div
            v-for="v in midiStore.virtualInstruments"
            :key="v.name"
            class="rounded-xl border border-amber-500/20 bg-neutral-900/60 p-4 flex flex-col gap-3 mb-2"
          >
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-amber-500/10 text-amber-400">
                <Radio class="w-4 h-4" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-amber-200 truncate">{{ v.name }}</p>
                <div class="flex items-center gap-2 mt-0.5">
                  <span class="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-amber-400">
                    <Circle class="w-1.5 h-1.5 fill-current" />
                    Virtual
                  </span>
                  <span class="text-[9px] text-neutral-600 font-mono">CH{{ v.channel + 1 }}</span>
                  <span class="text-[9px] text-neutral-600 font-mono">PC{{ v.program + 1 }}</span>
                </div>
                <!-- MIDI output port selector -->
                <div class="flex items-center gap-1.5 mt-1.5">
                  <span class="text-[8px] font-mono text-neutral-600 uppercase tracking-wider">Output port</span>
                  <select
                    :value="v.midiOutputPort"
                    @change="onVirtualPortChange(v.name, $event.target.value)"
                    class="flex-1 min-w-0 bg-black/60 border border-neutral-700 rounded text-[9px] font-mono text-neutral-300 px-1.5 py-0.5 outline-none focus:border-amber-500/40"
                  >
                    <option value="" class="bg-black">— None —</option>
                    <option v-for="p in midiStore.outputs" :key="p.name" :value="p.name" class="bg-black">{{ p.name }}</option>
                  </select>
                </div>
              </div>
              <button
                @click="midiStore.removeVirtualInstrument(v.name)"
                title="Remove virtual instrument"
                class="flex items-center gap-1 text-[9px] font-mono px-2 py-1 rounded border border-rose-900/40 text-rose-500/70 hover:text-rose-400 hover:border-rose-700 hover:bg-rose-900/20 transition-colors"
              >
                <Trash2 class="w-3 h-3" /> Remove
              </button>
            </div>
          </div>

          <button
            @click="promptAddVirtualInstrument"
            class="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-neutral-700 text-neutral-500 hover:text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all text-[10px] font-bold uppercase tracking-wider"
          >
            <Plus class="w-3.5 h-3.5" />
            Add Virtual Instrument
          </button>
        </div>

      </div>
    </div>
  </div>
</template>
