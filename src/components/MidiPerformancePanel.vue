<script setup>
import { computed, ref, onMounted } from 'vue'
import { X, Network, Music, Keyboard, ListMusic, Zap, Radio, Globe, Layers, Usb, Cable, Lock, Check } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { midiService, MidiSource } from '@/core/midi/MidiService'

const emit = defineEmits(['close'])
const midiStore = useMidiStore()

const coreSources = [
  { id: MidiSource.TRANSPORT, label: 'Transport / Clock', icon: Zap, color: 'text-red-400' },
  { id: MidiSource.SEQUENCER, label: 'Sequencer', icon: ListMusic, color: 'text-amber-400' },
  { id: MidiSource.ARP,       label: 'Arpeggiator', icon: Music,     color: 'text-emerald-400' },
  { id: MidiSource.KEYBOARD,  label: 'Keyboard',    icon: Keyboard,  color: 'text-sky-400' },
  { id: MidiSource.UI,        label: 'UI / Preview', icon: Layers,    color: 'text-purple-400' },
]

const sources = computed(() => {
  const dynamicSources = Object.values(midiStore.routingConfig?.registrations || {})
    .filter(reg => reg.inEnabled)
    .map(reg => ({
      // We use the device name as the source ID for physical inputs
      id: reg.name,
      label: reg.name,
      icon: Cable,
      color: 'text-neutral-400',
      isInOut: reg.inEnabled && reg.outEnabled
    }))
    .sort((a, b) => {
      // Sort "MIDI IN only" before "MIDI IN + MIDI OUT"
      if (!a.isInOut && b.isInOut) return -1
      if (a.isInOut && !b.isInOut) return 1
      return a.label.localeCompare(b.label)
    })
  return [...coreSources, ...dynamicSources]
})

function isRouted(source, outputName) {
  return midiStore.routingMatrix[source]?.includes(outputName)
}

const experimentalThruOutputId = ref('')

onMounted(() => {
  experimentalThruOutputId.value = midiService.getExperimentalThruOutputId?.() || ''
})

const outputs = computed(() => {
  const seen = new Set()
  const unique = midiStore.outputs.filter(o => {
    if (seen.has(o.id)) return false
    
    // Only include registered devices WITH outEnabled: true
    const reg = midiStore.routingConfig?.registrations?.[o.name]
    if (!reg || !reg.outEnabled) return false

    seen.add(o.id)
    return true
  })

  return unique.sort((a, b) => {
    const aActive = a.id === experimentalThruOutputId.value
    const bActive = b.id === experimentalThruOutputId.value

    if (aActive && !bActive) return -1
    if (!aActive && bActive) return 1
    return a.name.localeCompare(b.name)
  })
})

function toggleRouting(source, outputName) {
  midiStore.toggleRouting(source, outputName)
}

function toggleBroadcast() {
  midiStore.toggleBroadcastMode()
}

const viewMode = ref('grid')

function getActiveOutputsFor(sourceId) {
  return outputs.value.filter(o => isRouted(sourceId, o.name))
}

const sourcesWithActiveRoutes = computed(() => {
  return sources.value.filter(src => getActiveOutputsFor(src.id).length > 0)
})

const activeOutputs = computed(() => {
  return outputs.value.filter(o => {
    return sourcesWithActiveRoutes.value.some(src => isRouted(src.id, o.name))
  })
})

</script>

<template>
  <div class="fixed inset-0 z-[400] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
    <Transition name="performance" appear>
      <div class="bg-neutral-950 border border-synth-neon/30 rounded-3xl w-full max-w-4xl overflow-hidden shadow-[0_0_50px_rgba(0,255,204,0.15)] flex flex-col max-h-[90vh]">
        
        <!-- Header -->
        <div class="p-6 border-b border-neutral-900 flex items-center justify-between bg-synth-neon/5">
          <div class="flex items-center gap-4">
            <div class="p-3 bg-synth-neon/10 rounded-2xl">
              <Network class="w-6 h-6 text-synth-neon" />
            </div>
            <div>
              <h2 class="text-xl font-black uppercase tracking-widest text-white">MIDI Performance Grid</h2>
              <p class="text-[10px] font-mono text-neutral-500 uppercase tracking-[0.2em]">Source-Based Output Routing</p>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <!-- View Mode Switch -->
            <div class="bg-neutral-900 border border-neutral-800 rounded-lg flex p-1">
              <button 
                @click="viewMode = 'grid'" 
                :class="['px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all', viewMode === 'grid' ? 'bg-synth-neon text-black' : 'text-neutral-500 hover:text-white']"
              >
                Grid
              </button>
              <button 
                @click="viewMode = 'flow'" 
                :class="['px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all', viewMode === 'flow' ? 'bg-synth-neon text-black' : 'text-neutral-500 hover:text-white']"
              >
                Flow
              </button>
            </div>
            
            <button @click="emit('close')" class="p-2 text-neutral-500 hover:text-white transition-colors bg-neutral-900 rounded-xl">
              <X class="w-6 h-6" />
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-auto custom-scrollbar p-6 space-y-8">
          
          

          <!-- Routing Section -->
          <div :class="['space-y-4 transition-all duration-500', midiStore.broadcastMode ? 'opacity-30 grayscale pointer-events-none scale-[0.98]' : 'opacity-100']">
            
            <!-- GRID VIEW -->
            <div v-if="viewMode === 'grid'">
              <h3 class="text-[10px] font-black text-neutral-500 uppercase tracking-[0.3em] ml-2 mb-4">Routing Matrix</h3>
              
              <div class="grid grid-cols-[160px_1fr] gap-4">
              <!-- Left spacer for header -->
              <div />
              
              <!-- Output Headers -->
              <div class="flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
                <div v-for="output in outputs" :key="output.id" class="min-w-[120px] flex flex-col items-center gap-2 relative">
                  <div :class="['p-2 rounded-lg border w-full text-center relative transition-colors', experimentalThruOutputId === output.id ? 'bg-emerald-950/40 border-emerald-500/50' : 'bg-neutral-900 border-neutral-800']">
                    <div v-if="experimentalThruOutputId === output.id" class="absolute -top-2 -right-2 bg-emerald-500 text-black rounded-full p-0.5 shadow-lg shadow-emerald-900/50" title="Experimental THRU Routing Enabled">
                      <Usb class="w-3 h-3" />
                    </div>
                    
                    <button 
                      @click="midiStore.toggleDeviceLatch(output.name)"
                      :class="['absolute -top-2 -left-2 rounded-full p-1 shadow-lg transition-all', midiStore.routingConfig.registrations[output.name]?.smartLatch ? 'bg-synth-neon text-black shadow-synth-neon/50' : 'bg-neutral-800 text-neutral-500 hover:text-neutral-300']"
                      title="Toggle Smart Latch for this Device"
                    >
                      <Lock class="w-3 h-3" />
                    </button>

                    <span :class="['text-[9px] font-bold uppercase tracking-tighter truncate block w-full px-1', experimentalThruOutputId === output.id ? 'text-emerald-400' : 'text-neutral-400']">
                      {{ output.name }}
                    </span>
                  </div>
                  <div class="w-px h-4 bg-neutral-800" />
                </div>
                <div v-if="!outputs.length" class="text-xs font-mono text-neutral-600 italic py-2">
                  No MIDI output devices detected...
                </div>
              </div>

              <!-- Matrix Rows -->
              <template v-for="source in sources" :key="source.id">
                <!-- Source Label -->
                <div class="flex items-center gap-3 bg-neutral-900/60 px-4 py-2rounded-2xl border border-neutral-800/50">
                  <component :is="source.icon" :class="['w-5 h-5', source.color]" />
                  <span class="text-xs font-black uppercase tracking-wider text-neutral-300">{{ source.label }}</span>
                </div>

                <!-- Checkboxes -->
                <div class="flex gap-4 items-center">
                  <div v-for="output in outputs" :key="output.id" class="min-w-[120px] flex justify-center">
                    <button 
                      @click="toggleRouting(source.id, output.name)"
                      :class="['w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all duration-200', 
                        isRouted(source.id, output.name) 
                          ? 'bg-synth-neon/10 border-synth-neon shadow-[0_0_15px_rgba(0,255,204,0.2)]' 
                          : 'bg-neutral-900 border-neutral-800 hover:border-neutral-600']"
                    >
                      <Radio v-if="isRouted(source.id, output.name)" class="w-5 h-5 text-synth-neon animate-pulse" />
                      <div v-else class="w-1.5 h-1.5 rounded-full bg-neutral-800" />
                    </button>
                  </div>
                </div>
              </template>
              </div>
            </div>

            <!-- ── FLOW VIEW (Graphical Visualization) ── -->
            <div v-else-if="viewMode === 'flow'" class="relative min-h-[500px] flex items-center justify-between px-20 py-10 overflow-hidden bg-black/20 rounded-3xl border border-neutral-900/50">
              
              <!-- CONNECTIONS SVG -->
              <svg class="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                <template v-for="(source, sIdx) in sourcesWithActiveRoutes" :key="'svg-src-'+source.id">
                  <template v-for="out in getActiveOutputsFor(source.id)" :key="'svg-out-'+out.name">
                    <path 
                      :d="`M 250,${250 + (sIdx - (sourcesWithActiveRoutes.length-1)/2) * 80} C 400,${250 + (sIdx - (sourcesWithActiveRoutes.length-1)/2) * 80} 500,${250 + (activeOutputs.findIndex(o => o.name === out.name) - (activeOutputs.length-1)/2) * 80} 650,${250 + (activeOutputs.findIndex(o => o.name === out.name) - (activeOutputs.length-1)/2) * 80}`"
                      fill="none" 
                      stroke="rgba(0,255,204,0.15)" 
                      stroke-width="2"
                      class="flow-line"
                    />
                  </template>
                </template>
              </svg>

              <!-- SOURCES (Left) -->
              <div class="flex flex-col gap-6 z-10 w-48">
                <div v-for="source in sourcesWithActiveRoutes" :key="'flow-src-'+source.id"
                  class="h-16 bg-neutral-900 border border-synth-neon/20 p-4 rounded-2xl flex items-center gap-3 shadow-2xl shrink-0 border-l-4 border-l-synth-neon/50">
                  <div class="w-8 h-8 rounded-lg bg-synth-neon/10 flex items-center justify-center border border-synth-neon/20">
                    <component :is="source.icon" :class="['w-4 h-4', source.color]" />
                  </div>
                  <div class="flex flex-col min-w-0 flex-1">
                    <span class="text-[10px] font-bold text-white uppercase tracking-wider truncate max-w-[100px]">{{ source.label }}</span>
                  </div>
                </div>
              </div>

              <!-- OUTPUTS (Right) -->
              <div class="flex flex-col gap-6 z-10 w-48">
                <div v-for="out in activeOutputs" :key="'flow-out-'+out.name"
                  class="h-16 bg-neutral-900 border p-4 rounded-2xl flex items-center gap-3 shadow-2xl shrink-0 border-r-4 justify-end"
                  :class="experimentalThruOutputId === out.id ? 'border-emerald-500/20 border-r-emerald-500/50' : 'border-synth-neon/20 border-r-synth-neon/50'">
                  <div class="flex flex-col min-w-0 flex-1 items-end">
                    <span class="text-[10px] font-bold text-white truncate max-w-[100px]">{{ out.name }}</span>
                  </div>
                  <div class="w-8 h-8 rounded-lg flex items-center justify-center border"
                    :class="experimentalThruOutputId === out.id ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-synth-neon/10 border-synth-neon/20'">
                    <Usb v-if="experimentalThruOutputId === out.id" class="w-4 h-4 text-emerald-400" />
                    <Radio v-else class="w-4 h-4 text-synth-neon" />
                  </div>
                </div>
              </div>

              <!-- Empty State -->
              <div v-if="sourcesWithActiveRoutes.length === 0" class="absolute inset-0 flex items-center justify-center text-neutral-600 font-mono text-xs italic">
                No active routings found. Connect devices in Grid mode to see flows.
              </div>

            </div>

          </div>
          <!-- Broadcast Mode Section -->
          <div class="flex items-center justify-between bg-neutral-900/40 border border-neutral-800 p-2 rounded-2xl group transition-all hover:border-synth-neon/20">
            <div class="flex items-center gap-4">
              <div :class="['p-3 rounded-xl transition-all', midiStore.broadcastMode ? 'bg-synth-neon/20 text-synth-neon shadow-[0_0_15px_rgba(0,255,204,0.3)]' : 'bg-neutral-800 text-neutral-600']">
                <Globe class="w-6 h-6" />
              </div>
              <div>
                <h3 class="text-sm font-bold text-white uppercase tracking-wider">Broadcast Mode</h3>
                <p class="text-[10px] text-neutral-500 font-mono mt-1">Send all messages to all active devices (Overrides Grid)</p>
              </div>
            </div>
            <button 
              @click="toggleBroadcast"
              :class="['w-16 h-8 rounded-full relative transition-all duration-300', midiStore.broadcastMode ? 'bg-synth-neon' : 'bg-neutral-800']"
            >
              <div :class="['absolute top-1 bottom-1 w-6 bg-white rounded-full transition-transform duration-300', midiStore.broadcastMode ? 'translate-x-9' : 'translate-x-1']" />
            </button>
          </div>

          <!-- Smart Latch Section -->
          <div class="flex items-center justify-between bg-neutral-900/40 border border-neutral-800 p-2 rounded-2xl group transition-all hover:border-synth-neon/20">
            <div class="flex items-center gap-4">
              <div :class="['p-3 rounded-xl transition-all', midiStore.isSmartLatchActive ? 'bg-synth-neon/20 text-synth-neon shadow-[0_0_15px_rgba(0,255,204,0.3)]' : 'bg-neutral-800 text-neutral-600']">
                <Lock class="w-6 h-6" />
              </div>
              <div>
                <h3 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  Smart Latch
                  <span v-if="midiStore.isSmartLatchActive" class="px-2 py-0.5 rounded-full bg-synth-neon/20 text-synth-neon text-[9px] uppercase tracking-widest border border-synth-neon/30">Active</span>
                </h3>
                <p class="text-[10px] text-neutral-500 font-mono mt-1">Holds incoming notes (Can be toggled via CC)</p>
              </div>
            </div>
            
            <div class="flex items-center gap-6">
              <!-- Config -->
              <div class="flex flex-col gap-2 border-r border-neutral-800 pr-6">
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-mono text-neutral-500 uppercase">Max Notes:</span>
                  <input 
                    type="range" 
                    min="1" max="8" 
                    v-model.number="midiStore.smartLatchMaxNotes"
                    class="w-20 accent-synth-neon"
                  />
                  <span class="text-xs font-bold text-white w-4">{{ midiStore.smartLatchMaxNotes }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-mono text-neutral-500 uppercase">Fade Out:</span>
                  <input 
                    type="range" 
                    min="0" max="5000" step="100"
                    v-model.number="midiStore.smartLatchFadeTime"
                    class="w-20 accent-synth-neon"
                  />
                  <span class="text-xs font-bold text-white w-10 text-right">{{ midiStore.smartLatchFadeTime }}ms</span>
                </div>
                <label class="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" v-model="midiStore.smartLatchReplaceMode" class="hidden" />
                  <div :class="['w-4 h-4 rounded-sm border flex items-center justify-center transition-all', midiStore.smartLatchReplaceMode ? 'bg-synth-neon border-synth-neon' : 'border-neutral-600 bg-neutral-800 group-hover:border-neutral-500']">
                    <Check v-if="midiStore.smartLatchReplaceMode" class="w-3 h-3 text-black" />
                  </div>
                  <span class="text-[10px] font-mono text-neutral-500 uppercase group-hover:text-neutral-300 transition-colors">FIFO Replace</span>
                </label>
              </div>

              <!-- Main Toggle -->
              <button 
                @click="midiStore.toggleSmartLatch()"
                :class="['w-16 h-8 rounded-full relative transition-all duration-300 shrink-0', midiStore.isSmartLatchActive ? 'bg-synth-neon' : 'bg-neutral-800']"
              >
                <div :class="['absolute top-1 bottom-1 w-6 bg-white rounded-full transition-transform duration-300', midiStore.isSmartLatchActive ? 'translate-x-9' : 'translate-x-1']" />
              </button>
            </div>
          </div>

          <!-- Sequencer Transport Sync Section -->
          <div class="flex items-center justify-between bg-neutral-900/40 border border-neutral-800 p-2 rounded-2xl group transition-all hover:border-synth-neon/20">
            <div class="flex items-center gap-4">
              <div :class="['p-3 rounded-xl transition-all', midiStore.syncSequencerTransport ? 'bg-synth-neon/20 text-synth-neon shadow-[0_0_15px_rgba(0,255,204,0.3)]' : 'bg-neutral-800 text-neutral-600']">
                <ListMusic class="w-6 h-6" />
              </div>
              <div>
                <h3 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  Sequencer Sync
                  <span v-if="midiStore.syncSequencerTransport" class="px-2 py-0.5 rounded-full bg-synth-neon/20 text-synth-neon text-[9px] uppercase tracking-widest border border-synth-neon/30">Synced</span>
                </h3>
                <p class="text-[10px] text-neutral-500 font-mono mt-1">Sync global MIDI START/STOP with internal Sequencer playback</p>
              </div>
            </div>
            <button 
              @click="midiStore.setSyncSequencerTransport(!midiStore.syncSequencerTransport)"
              :class="['w-16 h-8 rounded-full relative transition-all duration-300 shrink-0', midiStore.syncSequencerTransport ? 'bg-synth-neon' : 'bg-neutral-800']"
            >
              <div :class="['absolute top-1 bottom-1 w-6 bg-white rounded-full transition-transform duration-300', midiStore.syncSequencerTransport ? 'translate-x-9' : 'translate-x-1']" />
            </button>
          </div>
          <!-- Bottom Legend -->
          <div class="mt-8 pt-8 border-t border-neutral-900 flex flex-wrap gap-8 justify-center opacity-60">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded bg-synth-neon/20 border border-synth-neon" />
              <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Active Route</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded bg-neutral-900 border border-neutral-800" />
              <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Disconnected</span>
            </div>
            <div class="flex items-center gap-2 text-neutral-600">
              <Zap class="w-3 h-3" />
              <span class="text-[9px] font-mono uppercase tracking-widest">Low Latency Protocol Active</span>
            </div>
          </div>

        </div>

        <!-- Status Bar -->
        <div class="p-4 bg-black border-t border-neutral-900 flex items-center justify-center gap-3">
          <div class="w-2 h-2 rounded-full bg-synth-neon animate-pulse" />
          <span class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
            Performance Matrix Live // {{ outputs.length }} Devices Available
          </span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.performance-enter-active,
.performance-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.performance-enter-from,
.performance-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.98);
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #262626;
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #404040;
}
</style>
