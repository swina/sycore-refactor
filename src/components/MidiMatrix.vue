<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { X, Usb, Activity, Zap, Cpu, Bell, Power, ArrowRightLeft, Music, Plus, Trash2, ShieldCheck, Settings, Layers, Sliders } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useUiStore } from '@/stores/useUiStore'
import { midiService } from '@/core/midi/MidiService'

const emit = defineEmits(['close'])
const midiStore = useMidiStore()
const configStore = useConfigStore()
const uiStore = useUiStore()
const viewMode = ref('matrix') // 'matrix' | 'flow'

const showAddMenu = ref(false)
const searchQuery = ref('')

// Filtered list of hardware for the "Add Device" menu
const availableHardware = computed(() => {
  const allAvailable = [
    ...midiStore.inputs.map(i => i.name),
    ...midiStore.outputs.map(o => o.name)
  ]
  const unique = Array.from(new Set(allAvailable))
  // Filter out those already registered
  return unique.filter(name => !midiStore.routingConfig.registrations[name])
})

const filteredHardware = computed(() => {
  if (!searchQuery.value) return availableHardware.value
  return availableHardware.value.filter(h => h.toLowerCase().includes(searchQuery.value.toLowerCase()))
})

const registrations = computed(() => {
  return Object.values(midiStore.routingConfig.registrations).sort((a, b) => {
    const aOnline = isOnline(a.name)
    const bOnline = isOnline(b.name)
    return bOnline - aOnline || a.name.localeCompare(b.name)
  })
})

function isOnline(name) {
  return midiStore.inputs.some(i => i.name === name) || midiStore.outputs.some(o => o.name === name)
}

function handleAdd(name) {
  midiStore.addRegistration(name)
  showAddMenu.value = false
  searchQuery.value = ''
}

function toggleSetting(name, field) {
  const val = !midiStore.routingConfig.registrations[name][field]
  
  // If disabling output, send cleanup
  if (field === 'outEnabled' && val === false) {
    const ports = midiStore.outputs.filter(o => o.name === name)
    ports.forEach(port => midiService.cleanupDevice(port.id))
  }
  
  midiStore.updateRegistration(name, field, val)
}

const activeOutputsCount = computed(() => 
  registrations.value.filter(r => r.outEnabled && isOnline(r.name)).length
)
const activeInputsCount = computed(() => 
  registrations.value.filter(r => r.inEnabled && isOnline(r.name)).length
)

// FLOW VIEW COMPUTEDS
const selectedOutputNames = computed(() => 
  registrations.value.filter(r => r.outEnabled && isOnline(r.name)).map(r => r.name)
)

const selectedInputNames = computed(() => 
  registrations.value.filter(r => r.inEnabled && isOnline(r.name)).map(r => r.name)
)

// Click outside logic for Add Menu
const addMenuRef = ref(null)
const addBtnRef = ref(null)

const handleClickOutside = (e) => {
  if (showAddMenu.value && 
      addMenuRef.value && !addMenuRef.value.contains(e.target) &&
      addBtnRef.value && !addBtnRef.value.contains(e.target)) {
    showAddMenu.value = false
  }
}

import { onUnmounted } from 'vue'
onMounted(() => {
  window.addEventListener('mousedown', handleClickOutside)
})
onUnmounted(() => {
  window.removeEventListener('mousedown', handleClickOutside)
})

watch(() => midiStore.routingConfig.registrations, (newRegs) => {
  // Sync service whenever registrations change
  midiService.setRoutingConfig(JSON.parse(JSON.stringify(midiStore.routingConfig)))
}, { deep: true })

async function toggleAppSetting(field) {
  configStore[field] = !configStore[field]
  await configStore.saveAppSettings()
}

function openProgramChangeHeader() {
  uiStore.midiActionsActiveTab = 'program'
  uiStore.midiActionsSelectedDevice = ''
  uiStore.isMidiActionsOpen = true
}

function openProgramChangeForDevice(deviceName) {
  uiStore.midiActionsActiveTab = 'program'
  uiStore.midiActionsSelectedDevice = deviceName
  uiStore.isMidiActionsOpen = true
}
</script>

<template>
  <div class="fixed inset-0 z-[600] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
    <Transition name="hub" appear>
      <div class="bg-neutral-950 border border-emerald-500/30 rounded-3xl w-full max-w-5xl overflow-hidden shadow-[0_0_50px_rgba(16,185,129,0.1)] flex flex-col max-h-[90vh]">

        <!-- ── HEADER ── -->
        <div class="px-6 py-5 border-b border-neutral-900 flex items-center justify-between bg-gradient-to-r from-emerald-950/40 to-transparent">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Cpu class="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 class="text-sm font-black uppercase tracking-[0.2em] text-white leading-none mb-1">
                MIDI Registry Matrix
              </h2>
              <p class="text-[9px] font-mono text-emerald-500/60 uppercase tracking-widest">
                Unified Persistent Signal Routing
              </p>
            </div>
          </div>
          
          <div class="flex items-center gap-3">
            <!-- View Mode Toggle -->
            <div class="flex items-center bg-black/40 rounded-full border border-neutral-800 p-1">
              <button @click="viewMode = 'matrix'" 
                :class="['px-4 py-1.5 rounded-full text-[9px] font-black transition-all', viewMode === 'matrix' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-neutral-500 hover:text-white']">
                GRID
              </button>
              <button @click="viewMode = 'flow'" 
                :class="['px-4 py-1.5 rounded-full text-[9px] font-black transition-all', viewMode === 'flow' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-neutral-500 hover:text-white']">
                FLOW
              </button>
            </div>

            <!-- Global Actions -->
            <div class="flex items-center gap-2 pl-4 border-l border-neutral-800">
              <button @click="midiStore.panic()"
                class="px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-500 text-[9px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all group flex items-center gap-2">
                <div class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse group-hover:bg-white"></div>
                Panic
              </button>

              <button @click="midiStore.clearRegistrations()"
                class="px-4 py-1.5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-400 text-[9px] font-black uppercase tracking-widest hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 transition-all">
                Reset Matrix
              </button>

              <button @click="openProgramChangeHeader"
                class="px-4 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-400 text-[9px] font-black uppercase tracking-widest hover:bg-violet-500 hover:text-white transition-all">
                Program Change
              </button>

              <button @click="emit('close')" class="p-2 text-neutral-500 hover:text-white transition-colors rounded-full hover:bg-white/5">
                <X class="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <!-- ── MAIN CONTENT ── -->
        <div class="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          <!-- ── MATRIX GRID VIEW ── -->
          <template v-if="viewMode === 'matrix'">
            <!-- Summary Stats -->
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-2">
              <div class="bg-black/40 border border-neutral-800/60 p-4 rounded-2xl flex items-center gap-3">
                <Music class="w-4 h-4 text-blue-400" />
                <div class="flex flex-col">
                  <span class="text-[8px] font-mono text-neutral-500 uppercase tracking-widest">In Links</span>
                  <span class="text-sm font-bold text-white">{{ activeInputsCount }}</span>
                </div>
              </div>
              <div class="bg-black/40 border border-neutral-800/60 p-4 rounded-2xl flex items-center gap-3">
                <ArrowRightLeft class="w-4 h-4 text-emerald-400" />
                <div class="flex flex-col">
                  <span class="text-[8px] font-mono text-neutral-500 uppercase tracking-widest">Out Links</span>
                  <span class="text-sm font-bold text-white">{{ activeOutputsCount }}</span>
                </div>
              </div>
              <div class="bg-black/40 border border-neutral-800/60 p-4 rounded-2xl flex items-center gap-3">
                <Settings class="w-4 h-4 text-neutral-500" />
                <div class="flex flex-col">
                  <span class="text-[8px] font-mono text-neutral-500 uppercase tracking-widest">Total Reg</span>
                  <span class="text-sm font-bold text-white">{{ registrations.length }}</span>
                </div>
              </div>
              
              <!-- Add Device Section -->
              <div class="relative">
                <button ref="addBtnRef" @click="showAddMenu = !showAddMenu" 
                  class="w-full h-full bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/10 active:scale-95">
                  <Plus class="w-4 h-4" />
                  Add Device
                </button>
                
                <div v-if="showAddMenu" ref="addMenuRef"
                  class="absolute top-full right-0 left-0 mt-2 z-50 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-60 animate-in fade-in slide-in-from-top-2">
                  <div class="p-2 border-b border-neutral-800">
                    <input v-model="searchQuery" type="text" placeholder="Search hardware..." 
                      class="w-full bg-black/50 border border-neutral-800 rounded-xl px-3 py-1.5 text-[10px] text-white outline-none focus:border-emerald-500/50" />
                  </div>
                  <div class="flex-1 overflow-y-auto custom-scrollbar">
                    <div v-if="filteredHardware.length === 0" class="p-4 text-center text-[10px] text-neutral-500 font-mono italic">
                      No new hardware detected.
                    </div>
                    <button v-for="h in filteredHardware" :key="h" @click="handleAdd(h)"
                      class="w-full text-left px-4 py-2 text-[10px] text-neutral-300 hover:bg-emerald-500 hover:text-black transition-colors border-b border-neutral-800/40 last:border-0 truncate">
                      {{ h }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Matrix Table -->
            <div v-if="registrations.length > 0" class="bg-black/20 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-neutral-900/50 border-b border-neutral-800/60">
                    <th class="px-5 py-4 text-[9px] font-black text-neutral-500 uppercase tracking-widest w-1/4">Device Information</th>
                    <th class="px-4 py-4 text-[9px] font-black text-neutral-500 uppercase tracking-widest text-center">In (Midi-In)</th>
                    <th class="px-4 py-4 text-[9px] font-black text-neutral-500 uppercase tracking-widest text-center">Out (Midi-Out)</th>
                    <th class="px-2 py-4 text-[9px] font-black text-neutral-500 uppercase tracking-widest text-center">Sync</th>
                    <th class="px-2 py-4 text-[9px] font-black text-neutral-500 uppercase tracking-widest text-center">Trsp</th>
                    <th class="px-2 py-4 text-[9px] font-black text-neutral-500 uppercase tracking-widest text-center">Note</th>
                    <th class="px-2 py-4 text-[9px] font-black text-neutral-500 uppercase tracking-widest text-center">CC</th>
                    <th class="px-5 py-4 text-[9px] font-black text-neutral-500 uppercase tracking-widest text-right">Action</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-neutral-900">
                  <tr v-for="reg in registrations" :key="reg.name" 
                    :class="['group transition-all', isOnline(reg.name) ? 'hover:bg-emerald-500/5' : 'opacity-40 grayscale-[0.5] bg-black/20']">
                    
                    <!-- Device Info -->
                    <td class="px-5 py-4">
                      <div class="flex items-center gap-3">
                        <div :class="['w-8 h-8 rounded-lg border flex items-center justify-center transition-all', 
                          isOnline(reg.name) ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-neutral-800 border-neutral-700 text-neutral-600']">
                          <Usb class="w-4 h-4" />
                        </div>
                        <div class="flex flex-col min-w-0">
                          <div class="flex items-center gap-2">
                            <span class="text-[11px] font-bold text-white truncate max-w-[180px]">{{ reg.name }}</span>
                            <span v-if="!isOnline(reg.name)" class="text-[7px] font-black bg-neutral-800 text-neutral-500 px-1 rounded uppercase tracking-tighter">Offline</span>
                          </div>
                          <div v-if="configStore.enablePartSelector" class="flex items-center gap-2 mt-1">
                            <span class="text-[7px] font-mono text-neutral-500 uppercase tracking-widest">REGISTERED</span>
                            <button @click="toggleSetting(reg.name, 'isMulti')"
                              :class="['text-[7px] font-black px-1.5 py-0.5 rounded transition-all uppercase tracking-tighter border',
                                reg.isMulti ? 'bg-purple-500 text-black border-purple-400' : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:border-neutral-600']">
                              {{ reg.isMulti ? 'MULTI-TIMBRAL' : 'MONO-TIMBRAL' }}
                            </button>
                          </div>
                          <div v-else class="flex items-center gap-2 mt-1">
                            <span class="text-[7px] font-mono text-neutral-500 uppercase tracking-widest">REGISTERED</span>
                            <span class="text-[7px] font-black px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500 border border-neutral-700 uppercase tracking-tighter">MONO-TIMBRAL</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <!-- MIDI IN -->
                    <td class="px-4 py-4 text-center">
                      <div class="flex flex-col items-center gap-1.5">
                        <button @click="toggleSetting(reg.name, 'inEnabled')"
                          :class="['w-6 h-6 rounded-md flex items-center justify-center transition-all border', 
                            reg.inEnabled ? 'bg-blue-500 text-white border-blue-400' : 'bg-black text-neutral-700 border-neutral-800 hover:border-neutral-600']">
                          <Power class="w-3 h-3" />
                        </button>
                        <select v-if="reg.inEnabled"
                          :value="reg.inChannel"
                          @change="e => midiStore.updateRegistration(reg.name, 'inChannel', parseInt(e.target.value))"
                          class="bg-transparent text-blue-400 text-[9px] font-bold outline-none cursor-pointer text-center uppercase">
                          <option :value="-1">OMNI</option>
                          <option v-for="ch in 16" :key="ch" :value="ch - 1">CH:{{ ch }}</option>
                        </select>
                      </div>
                    </td>

                    <!-- MIDI OUT -->
                    <td class="px-4 py-4 text-center">
                      <div class="flex flex-col items-center gap-1.5">
                        <button @click="toggleSetting(reg.name, 'outEnabled')"
                          :class="['w-6 h-6 rounded-md flex items-center justify-center transition-all border', 
                            reg.outEnabled ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-black text-neutral-700 border-neutral-800 hover:border-neutral-600']">
                          <Power class="w-3 h-3" />
                        </button>
                        <select v-if="reg.outEnabled && (!reg.isMulti || !configStore.enablePartSelector)"
                          :value="reg.outChannel"
                          @change="e => midiStore.updateRegistration(reg.name, 'outChannel', parseInt(e.target.value))"
                          class="bg-transparent text-emerald-400 text-[9px] font-bold outline-none cursor-pointer text-center uppercase">
                          <option :value="-1">OMNI</option>
                          <option v-for="ch in 16" :key="ch" :value="ch - 1">FIXED CH {{ ch }}</option>
                        </select>
                        <div v-else-if="reg.outEnabled && reg.isMulti && configStore.enablePartSelector" class="text-[9px] font-black text-purple-400 uppercase tracking-tighter">
                          DYNAMIC PART
                        </div>
                      </div>
                    </td>

                    <!-- SYNC -->
                    <td class="px-2 py-4 text-center">
                      <button @click="toggleSetting(reg.name, 'clock')"
                        :class="['w-8 h-6 rounded-md text-[8px] font-black transition-all border uppercase tracking-tighter', 
                          reg.clock ? 'bg-amber-500/20 text-amber-500 border-amber-500/30' : 'text-neutral-700 border-transparent']">
                        SYNC
                      </button>
                    </td>

                    <!-- TRSP -->
                    <td class="px-2 py-4 text-center">
                      <button @click="toggleSetting(reg.name, 'transport')"
                        :class="['w-8 h-6 rounded-md text-[8px] font-black transition-all border uppercase tracking-tighter', 
                          reg.transport ? 'bg-violet-500/20 text-violet-400 border-violet-500/30' : 'text-neutral-700 border-transparent']">
                        TRSP
                      </button>
                    </td>

                    <!-- NOTE -->
                    <td class="px-2 py-4 text-center">
                      <button @click="toggleSetting(reg.name, 'notes')"
                        :class="['w-8 h-6 rounded-md text-[8px] font-black transition-all border uppercase tracking-tighter', 
                          reg.notes ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'text-neutral-700 border-transparent']">
                        NOTE
                      </button>
                    </td>

                    <!-- CC -->
                    <td class="px-2 py-4 text-center">
                      <button @click="toggleSetting(reg.name, 'cc')"
                        :class="['w-8 h-6 rounded-md text-[8px] font-black transition-all border uppercase tracking-tighter', 
                          reg.cc ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 'text-neutral-700 border-transparent']">
                        CC
                      </button>
                    </td>

                    <!-- ACTIONS / DELETE -->
                    <td class="px-5 py-4 text-right">
                      <div class="flex items-center justify-end gap-1.5">
                        <button v-if="reg.outEnabled" @click="openProgramChangeForDevice(reg.name)"
                          title="Program Change"
                          class="p-2 text-neutral-500 hover:text-violet-400 transition-colors rounded-lg hover:bg-violet-500/10">
                          <Sliders class="w-4 h-4" />
                        </button>
                        <button @click="midiStore.removeRegistration(reg.name)"
                          class="p-2 text-neutral-700 hover:text-red-500 transition-colors rounded-lg hover:bg-red-500/10">
                          <Trash2 class="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- EMPTY STATE -->
            <div v-else class="flex-1 flex flex-col items-center justify-center min-h-[350px] border-2 border-dashed border-neutral-800 rounded-3xl p-12 bg-black/10">
              <div class="p-6 bg-neutral-900 rounded-full mb-6">
                <Cpu class="w-12 h-12 text-neutral-700" />
              </div>
              <h3 class="text-xl font-bold text-white mb-2 uppercase tracking-widest text-[10px]">Matrix Empty</h3>
              <p class="text-neutral-500 text-[10px] max-w-xs text-center mb-8 font-mono italic">
                No MIDI devices are currently registered. Use the "Add Device" button above to populate the routing grid.
              </p>
              <button @click="showAddMenu = true" 
                class="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-emerald-500/10 active:scale-95">
                Register First Device
              </button>
            </div>

            <!-- Global Settings (Bridge) -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
               <div class="bg-neutral-900/30 border border-neutral-900 p-5 rounded-3xl flex flex-col justify-center">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <ShieldCheck class="w-4 h-4 text-emerald-400" />
                    <span class="text-[10px] font-black text-white uppercase tracking-widest">Global Thru Bridge</span>
                  </div>
                  <button @click="midiStore.routingConfig.globalThruEnabled = !midiStore.routingConfig.globalThruEnabled"
                    :class="['px-4 py-1 rounded-full text-[9px] font-black transition-all border', 
                      midiStore.routingConfig.globalThruEnabled ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-black text-neutral-600 border-neutral-800']">
                    {{ midiStore.routingConfig.globalThruEnabled ? 'ON' : 'OFF' }}
                  </button>
                </div>
                <p class="text-[9px] text-neutral-500 font-mono italic leading-relaxed">
                  Bridges incoming notes from ALL active Inputs to ALL active Outputs according to their filters.
                </p>
              </div>

              <div class="bg-neutral-900/30 border border-neutral-900 p-5 rounded-3xl flex items-center gap-4">
                <div v-if="midiStore.routingConfig.globalThruEnabled" class="flex gap-8 w-full">
                  <div class="flex flex-col gap-1">
                    <label class="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" v-model="midiStore.routingConfig.thruFilters.notes" class="accent-emerald-500" />
                      <span class="text-[9px] font-bold text-neutral-400 group-hover:text-white uppercase">Notes</span>
                    </label>
                    <span class="text-[7px] text-neutral-600 font-mono italic">Relay all note data</span>
                  </div>
                  
                  <div class="flex flex-col gap-1">
                    <label class="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" v-model="midiStore.routingConfig.thruFilters.cc" class="accent-emerald-500" />
                      <span class="text-[9px] font-bold text-neutral-400 group-hover:text-white uppercase">CC Messages</span>
                    </label>
                    <span class="text-[7px] text-neutral-600 font-mono italic">Relay all CC data</span>
                  </div>
                </div>
                <div v-else class="flex items-center justify-center w-full opacity-20">
                  <span class="text-[9px] font-black text-neutral-500 uppercase tracking-widest">Thru Bridge Offline</span>
                </div>
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
               <div class="bg-neutral-900/30 border border-neutral-900 p-5 rounded-3xl flex items-center justify-between">
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-2">
                      <Zap class="w-4 h-4 text-purple-400" />
                      <span class="text-[10px] font-black text-white uppercase tracking-widest">Live Pad Sync</span>
                    </div>
                    <p class="text-[8px] text-neutral-500 font-mono italic">Sync MIDI Start/Stop with Live Pad tracks</p>
                  </div>
                  <button @click="toggleAppSetting('syncMidiTransportFromLivePad')"
                    :class="['px-4 py-1 rounded-full text-[9px] font-black transition-all border', 
                      configStore.syncMidiTransportFromLivePad ? 'bg-purple-500 text-black border-purple-400' : 'bg-black text-neutral-600 border-neutral-800']">
                    {{ configStore.syncMidiTransportFromLivePad ? 'ENABLED' : 'DISABLED' }}
                  </button>
               </div>

               <div class="bg-neutral-900/30 border border-neutral-900 p-5 rounded-3xl flex items-center justify-between">
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-2">
                      <Layers class="w-4 h-4 text-blue-400" />
                      <span class="text-[10px] font-black text-white uppercase tracking-widest">Part Selector</span>
                    </div>
                    <p class="text-[8px] text-neutral-500 font-mono italic">Enable multi-channel PART selection UI</p>
                  </div>
                  <button @click="toggleAppSetting('enablePartSelector')"
                    :class="['px-4 py-1 rounded-full text-[9px] font-black transition-all border', 
                      configStore.enablePartSelector ? 'bg-blue-500 text-black border-blue-400' : 'bg-black text-neutral-600 border-neutral-800']">
                    {{ configStore.enablePartSelector ? 'VISIBLE' : 'HIDDEN' }}
                  </button>
               </div>
            </div>
          </template>

          <!-- ── FLOW VIEW (Graphical Visualization) ── -->
          <template v-else>
            <div class="relative min-h-[500px] flex items-center justify-between px-20 py-10 overflow-hidden bg-black/20 rounded-3xl border border-neutral-900/50">
              
              <!-- CONNECTIONS SVG -->
              <svg class="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                <!-- Connections from Core to Outputs -->
                <g v-for="(name, idx) in selectedOutputNames" :key="'conn-out-'+name">
                  <path 
                    :d="`M 480,250 C 600,250 700,${250 + (idx - (selectedOutputNames.length-1)/2) * 80} 850,${250 + (idx - (selectedOutputNames.length-1)/2) * 80}`"
                    fill="none" 
                    stroke="rgba(16,185,129,0.15)" 
                    stroke-width="2"
                    class="flow-line"
                  />
                </g>
                
                <!-- Connections from Inputs to Core -->
                <g v-for="(name, idx) in selectedInputNames" :key="'conn-in-'+name">
                  <path 
                    :d="`M 150,${250 + (idx - (selectedInputNames.length-1)/2) * 80} C 300,${250 + (idx - (selectedInputNames.length-1)/2) * 80} 400,250 480,250`"
                    fill="none" 
                    stroke="rgba(59,130,246,0.15)" 
                    stroke-width="2" 
                    class="flow-line-blue" 
                  />
                </g>
              </svg>

              <div class="flex flex-col gap-6 z-10 w-48">
                <div v-for="name in selectedInputNames" :key="'flow-in-'+name"
                  class="h-16 bg-neutral-900 border border-blue-500/20 p-4 rounded-2xl flex items-center gap-3 shadow-2xl shrink-0 border-l-4 border-l-blue-500/50">
                  <div class="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                    <Music class="w-4 h-4 text-blue-400" />
                  </div>
                  <div class="flex flex-col min-w-0 flex-1">
                    <div class="flex items-center justify-between">
                      <span class="text-[10px] font-bold text-white truncate max-w-[100px]">{{ name }}</span>
                      <span class="text-[8px] font-black text-blue-400 uppercase opacity-60">
                        {{ midiStore.routingConfig.registrations[name]?.inChannel === -1 ? 'OMNI' : `CH:${midiStore.routingConfig.registrations[name]?.inChannel + 1}` }}
                      </span>
                    </div>
                    <!-- Status Indicators -->
                    <div class="flex items-center gap-1 mt-1">
                      <div v-if="midiStore.routingConfig.registrations[name]?.notes" class="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.5)]" title="Notes"></div>
                      <div v-if="midiStore.routingConfig.registrations[name]?.cc" class="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_5px_rgba(244,63,94,0.5)]" title="CC"></div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- CORE (Center) -->
              <div class="relative z-20 flex flex-col items-center justify-center">
                <div class="w-32 h-32 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_80px_rgba(16,185,129,0.3)] border-[8px] border-neutral-950 group relative">
                  <div class="absolute inset-0 rounded-full animate-ping bg-emerald-500 opacity-10"></div>
                  <Cpu class="w-14 h-14 text-black animate-pulse" />
                </div>
                <div class="mt-6 bg-emerald-500/10 border border-emerald-500/30 px-6 py-2 rounded-full backdrop-blur-md shadow-lg shadow-emerald-500/5">
                  <span class="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em]">ENGINE CORE</span>
                </div>
              </div>

              <div class="flex flex-col gap-6 z-10 w-48">
                <div v-for="name in selectedOutputNames" :key="'flow-out-'+name"
                  class="h-16 bg-neutral-900 border border-emerald-500/20 p-4 rounded-2xl flex items-center gap-3 shadow-2xl shrink-0 border-r-4 border-r-emerald-500/50">
                  <div class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                    <Usb class="w-4 h-4 text-emerald-400" />
                  </div>
                  <div class="flex flex-col min-w-0 flex-1">
                    <div class="flex items-center justify-between">
                      <span class="text-[10px] font-bold text-white truncate max-w-[100px]">{{ name }}</span>
                      <span class="text-[8px] font-black text-emerald-400 uppercase opacity-60">
                        {{ midiStore.routingConfig.registrations[name]?.outChannel === -1 ? 'THRU' : `CH:${midiStore.routingConfig.registrations[name]?.outChannel + 1}` }}
                      </span>
                    </div>
                    <!-- Status Indicators -->
                    <div class="flex items-center gap-1 mt-1">
                      <div v-if="midiStore.routingConfig.registrations[name]?.clock" class="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.5)]" title="Sync"></div>
                      <div v-if="midiStore.routingConfig.registrations[name]?.transport" class="w-1.5 h-1.5 rounded-full bg-violet-500 shadow-[0_0_5px_rgba(139,92,246,0.5)]" title="Transport"></div>
                      <div v-if="midiStore.routingConfig.registrations[name]?.notes" class="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.5)]" title="Notes"></div>
                      <div v-if="midiStore.routingConfig.registrations[name]?.cc" class="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_5px_rgba(244,63,94,0.5)]" title="CC"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>

        </div>

        <!-- Footer -->
        <div class="px-6 py-4 bg-black/40 border-t border-neutral-900 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <span class="text-[9px] font-mono text-emerald-500 uppercase tracking-widest">System Synchronized</span>
          </div>
          <p class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">SY.CORE MATRIX ENGINE · RELEASE 2.1</p>
        </div>

      </div>
    </Transition>
  </div>
</template>

<style scoped>
.hub-enter-active,
.hub-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.hub-enter-from,
.hub-leave-to {
  opacity: 0;
  transform: translateY(30px) scale(0.95);
}

@keyframes dash {
  to {
    stroke-dashoffset: -20;
  }
}
.flow-line {
  stroke-dasharray: 4;
  animation: dash 1s linear infinite;
}
.flow-line-blue {
  stroke-dasharray: 4;
  animation: dash 1.5s linear infinite reverse;
}
</style>
