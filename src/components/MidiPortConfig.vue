<script setup>
import { Usb, Music, X } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'

const midiStore = useMidiStore()
const emit = defineEmits(['close'])

// Deduplicate by name but keep the full device object so we can use .id as option value
const uniqueDevices = (devices) => {
  const seen = new Set()
  return devices.filter(d => {
    if (seen.has(d.name)) return false
    seen.add(d.name)
    return true
  })
}
</script>

<template>
  <div class="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <Transition name="sy-modal" appear>
      <div class="bg-neutral-950 border border-synth-neon/30 glow-neon rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">

        <!-- Header -->
        <div class="p-4 border-b border-neutral-900 flex justify-between items-center bg-neutral-900/50">
          <h2 class="text-sm font-black uppercase tracking-widest flex items-center gap-2">
            <Usb class="w-4 h-4 text-synth-neon" /> MIDI Routing
          </h2>
          <button @click="emit('close')" class="p-1 text-neutral-400 hover:text-white transition-colors">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="p-6 flex flex-col gap-6">
          <!-- No device warning -->
          <div
            v-if="!midiStore.selectedDevice || !midiStore.outputs.some(o => o.id === midiStore.selectedDevice)"
            class="bg-red-900/20 border border-red-500/50 rounded-lg p-4 flex flex-col items-center text-center gap-2"
          >
            <span class="text-red-500 font-black uppercase tracking-widest text-sm">NO S-1 CONNECTED</span>
            <span class="text-red-400/80 text-xs font-mono">Connect your S-1 or check the cables</span>
            <span class="text-neutral-400 text-[10px] font-mono mt-1">After connection, set your S-1 as Hardware OUT</span>
          </div>

          <!-- Output select -->
          <div class="flex flex-col gap-2">
            <div class="group flex items-center bg-neutral-900/80 border border-neutral-800 rounded-lg px-4 py-3 hover:border-synth-neon/50 transition-colors">
              <div class="flex flex-col w-full">
                <span class="text-[9px] font-bold text-neutral-500 uppercase tracking-widest leading-none mb-1">Hardware Out (S1)</span>
                <div class="flex items-center gap-2 w-full">
                  <Usb class="w-4 h-4 text-neutral-400 group-hover:text-synth-neon transition-colors flex-shrink-0" />
                  <select
                    :value="midiStore.selectedDevice"
                    @change="midiStore.setOutput($event.target.value)"
                    class="bg-transparent text-xs font-mono font-bold focus:outline-none cursor-pointer uppercase w-full border-none"
                  >
                    <option value="" disabled class="bg-neutral-950">Select Hardware</option>
                    <option v-for="device in uniqueDevices(midiStore.outputs)" :key="device.id" :value="device.id" class="bg-neutral-950">
                      {{ device.name || 'Unknown' }}
                    </option>
                    <option v-if="midiStore.outputs.length === 0" value="" disabled class="bg-neutral-950">No Device</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Input select -->
            <div class="group flex items-center bg-neutral-900/80 border border-neutral-800 rounded-lg px-4 py-3 hover:border-synth-neon/50 transition-colors">
              <div class="flex flex-col w-full">
                <span class="text-[9px] font-bold text-neutral-500 uppercase tracking-widest leading-none mb-1">MIDI Input (Keys)</span>
                <div class="flex items-center gap-2 w-full">
                  <Music class="w-4 h-4 text-neutral-400 group-hover:text-synth-neon transition-colors flex-shrink-0" />
                  <select
                    :value="midiStore.selectedInputDevice"
                    @change="midiStore.setKeyboardInput($event.target.value)"
                    class="bg-transparent text-xs font-mono font-bold focus:outline-none cursor-pointer uppercase w-full border-none"
                  >
                    <option value="" disabled class="bg-neutral-950">Select Input</option>
                    <option v-for="device in uniqueDevices(midiStore.inputs)" :key="device.id" :value="device.id" class="bg-neutral-950">
                      {{ device.name || 'Unknown' }}
                    </option>
                    <option v-if="midiStore.inputs.length === 0" value="" disabled class="bg-neutral-950">No Input</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- Channel selectors -->
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col bg-neutral-900/80 border border-neutral-800 rounded-lg p-3 hover:border-synth-neon/50 transition-colors">
              <span class="text-[9px] font-bold text-neutral-500 uppercase tracking-widest leading-none mb-2">OUT CH</span>
              <input
                type="number" min="1" max="16"
                :value="midiStore.midiChannel"
                @change="midiStore.setMidiChannel(parseInt($event.target.value))"
                class="bg-transparent text-xl font-mono font-black focus:outline-none text-synth-neon outline-none w-full"
              />
            </div>
            <div class="flex flex-col bg-neutral-900/80 border border-neutral-800 rounded-lg p-3 hover:border-synth-neon/50 transition-colors">
              <span class="text-[9px] font-bold text-neutral-500 uppercase tracking-widest leading-none mb-2">IN CH</span>
              <select
                :value="midiStore.midiInputChannel"
                @change="midiStore.setMidiInputChannel(parseInt($event.target.value))"
                class="bg-transparent text-xl font-mono font-black focus:outline-none text-synth-neon outline-none"
              >
                <option :value="-1" class="bg-neutral-950 text-sm">OMNI</option>
                <option v-for="i in 16" :key="i" :value="i - 1" class="bg-neutral-950 text-sm">{{ i }}</option>
              </select>
            </div>
          </div>
        </div>

      </div>
    </Transition>
  </div>
</template>
