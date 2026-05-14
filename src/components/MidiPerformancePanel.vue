<script setup>
import { computed } from 'vue'
import { X, Network, Music, Keyboard, ListMusic, Zap, Radio, Globe, Layers } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { MidiSource } from '@/core/midi/MidiService'

const emit = defineEmits(['close'])
const midiStore = useMidiStore()

const sources = [
  { id: MidiSource.SEQUENCER, label: 'Sequencer', icon: ListMusic, color: 'text-amber-400' },
  { id: MidiSource.ARP,       label: 'Arpeggiator', icon: Music,     color: 'text-emerald-400' },
  { id: MidiSource.KEYBOARD,  label: 'Keyboard',    icon: Keyboard,  color: 'text-sky-400' },
  { id: MidiSource.UI,        label: 'UI / Preview', icon: Layers,    color: 'text-purple-400' },
]

const outputs = computed(() => {
  const seen = new Set()
  return midiStore.outputs.filter(o => {
    if (seen.has(o.id)) return false
    seen.add(o.id)
    return true
  })
})

function isRouted(source, outputId) {
  return midiStore.routingMatrix[source]?.has(outputId)
}

function toggleRouting(source, outputId) {
  midiStore.toggleRouting(source, outputId)
}

function toggleBroadcast() {
  midiStore.toggleBroadcastMode()
}
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
          <button @click="emit('close')" class="p-2 text-neutral-500 hover:text-white transition-colors bg-neutral-900 rounded-xl">
            <X class="w-6 h-6" />
          </button>
        </div>

        <div class="flex-1 overflow-auto custom-scrollbar p-6 space-y-8">
          
          <!-- Broadcast Mode Section -->
          <div class="flex items-center justify-between bg-neutral-900/40 border border-neutral-800 p-6 rounded-2xl group transition-all hover:border-synth-neon/20">
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

          <!-- Routing Matrix -->
          <div :class="['space-y-4 transition-all duration-500', midiStore.broadcastMode ? 'opacity-30 grayscale pointer-events-none scale-[0.98]' : 'opacity-100']">
            <h3 class="text-[10px] font-black text-neutral-500 uppercase tracking-[0.3em] ml-2 mb-4">Routing Matrix</h3>
            
            <div class="grid grid-cols-[160px_1fr] gap-4">
              <!-- Left spacer for header -->
              <div />
              
              <!-- Output Headers -->
              <div class="flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
                <div v-for="output in outputs" :key="output.id" class="min-w-[120px] flex flex-col items-center gap-2">
                  <div class="p-2 bg-neutral-900 rounded-lg border border-neutral-800 w-full text-center">
                    <span class="text-[9px] font-bold text-neutral-400 uppercase tracking-tighter truncate block w-full px-1">
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
                <div class="flex items-center gap-3 bg-neutral-900/60 p-4 rounded-2xl border border-neutral-800/50">
                  <component :is="source.icon" :class="['w-5 h-5', source.color]" />
                  <span class="text-xs font-black uppercase tracking-wider text-neutral-300">{{ source.label }}</span>
                </div>

                <!-- Checkboxes -->
                <div class="flex gap-4 items-center">
                  <div v-for="output in outputs" :key="output.id" class="min-w-[120px] flex justify-center">
                    <button 
                      @click="toggleRouting(source.id, output.id)"
                      :class="['w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all duration-200', 
                        isRouted(source.id, output.id) 
                          ? 'bg-synth-neon/10 border-synth-neon shadow-[0_0_15px_rgba(0,255,204,0.2)]' 
                          : 'bg-neutral-900 border-neutral-800 hover:border-neutral-600']"
                    >
                      <Radio v-if="isRouted(source.id, output.id)" class="w-5 h-5 text-synth-neon animate-pulse" />
                      <div v-else class="w-1.5 h-1.5 rounded-full bg-neutral-800" />
                    </button>
                  </div>
                </div>
              </template>
            </div>
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
