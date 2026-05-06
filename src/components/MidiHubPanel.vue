<script setup>
import { ref, onMounted } from 'vue'
import { X, Usb, Music, Settings2, Radio } from 'lucide-vue-next'
import { midiService } from '@/core/midi/MidiService'
import { useMidiStore } from '@/stores/useMidiStore'

const emit = defineEmits(['close'])
const midiStore = useMidiStore()

const selectedInputs = ref([])
const thruOutput     = ref('')
const notesOnly      = ref(true)

onMounted(() => {
  selectedInputs.value = midiService.getExperimentalInputs()
  thruOutput.value     = midiService.getExperimentalThruOutputId() || ''
  notesOnly.value      = midiService.getExperimentalNotesOnly()
})

function toggleInput(id) {
  if (selectedInputs.value.includes(id)) {
    midiService.removeExperimentalInput(id)
    selectedInputs.value = selectedInputs.value.filter(i => i !== id)
  } else {
    midiService.addExperimentalInput(id)
    selectedInputs.value = [...selectedInputs.value, id]
  }
}

function setThruOutput(id) {
  thruOutput.value = id
  midiService.setExperimentalThruOutput(id || null)
}

function setNotesOnly(val) {
  notesOnly.value = val
  midiService.setExperimentalNotesOnly(val)
}

// Deduplicate outputs by id (matches React source behaviour)
function uniqueOutputs() {
  const seen = new Set()
  return midiStore.outputs.filter(o => {
    if (seen.has(o.id)) return false
    seen.add(o.id)
    return true
  })
}
</script>

<template>
  <div class="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <Transition name="hub" appear>
      <div class="bg-neutral-950 border border-emerald-500/40 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl shadow-emerald-900/20">

        <!-- Header -->
        <div class="p-4 border-b border-neutral-900 flex items-center justify-between bg-emerald-900/20">
          <h2 class="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-emerald-400">
            <Settings2 class="w-4 h-4" />
            MIDI HUB
          </h2>
          <button
            @click="emit('close')"
            class="p-1 text-neutral-400 hover:text-white transition-colors rounded"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="p-6 flex flex-col gap-5">

          <!-- Warning banner -->
          <div class="bg-emerald-950/30 border border-emerald-900/50 p-4 rounded-lg">
            <p class="text-[10px] font-mono text-emerald-400 uppercase tracking-widest mb-2">
              Experimental Feature
            </p>
            <p class="text-[10px] text-neutral-400 leading-relaxed font-mono">
              Allow multiple MIDI inputs simultaneously and route them directly to a THRU output.
              Inputs selected here will override their standard configuration if duplicated.
            </p>
          </div>

          <!-- Multi MIDI IN -->
          <div class="bg-neutral-900/80 border border-neutral-800 rounded-lg p-4">
            <h3 class="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Music class="w-3 h-3" /> Multi MIDI IN
            </h3>

            <div class="flex flex-col gap-2 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
              <label
                v-for="input in midiStore.inputs"
                :key="input.id"
                class="flex items-center gap-3 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  :checked="selectedInputs.includes(input.id)"
                  @change="toggleInput(input.id)"
                  class="accent-emerald-500 w-3 h-3 shrink-0"
                />
                <span class="text-xs font-mono text-neutral-300 group-hover:text-emerald-400 transition-colors truncate">
                  {{ input.name || 'Unknown Device' }}
                </span>
                <span
                  v-if="selectedInputs.includes(input.id)"
                  class="ml-auto shrink-0"
                >
                  <Radio class="w-3 h-3 text-emerald-400 animate-pulse" />
                </span>
              </label>

              <span
                v-if="!midiStore.inputs.length"
                class="text-xs text-neutral-600 font-mono italic"
              >
                No input devices available.
              </span>
            </div>
          </div>

          <!-- MIDI THRU Output -->
          <div class="bg-neutral-900/80 border border-neutral-800 rounded-lg p-4">
            <h3 class="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Usb class="w-3 h-3" /> MIDI THRU Output
            </h3>

            <select
              :value="thruOutput"
              @change="setThruOutput($event.target.value)"
              class="w-full bg-black/50 border border-neutral-800 rounded px-3 py-2 text-xs font-mono text-emerald-400 focus:outline-none focus:border-emerald-500/70 transition-colors mb-3 cursor-pointer"
            >
              <option value="">-- NO THRU OUTPUT --</option>
              <option
                v-for="output in uniqueOutputs()"
                :key="output.id"
                :value="output.id"
              >
                {{ output.name || 'Unknown' }}
              </option>
            </select>

            <label class="flex items-center gap-3 cursor-pointer group pt-3 border-t border-neutral-800">
              <input
                type="checkbox"
                :checked="notesOnly"
                @change="setNotesOnly($event.target.checked)"
                class="accent-emerald-500 w-3 h-3 shrink-0"
              />
              <span class="text-[10px] font-mono text-neutral-400 group-hover:text-emerald-400 transition-colors uppercase tracking-widest">
                Filter: Notes On/Off Only
              </span>
            </label>
          </div>

          <!-- Active routing status -->
          <div
            v-if="selectedInputs.length > 0"
            class="flex items-center gap-2 px-3 py-2 bg-emerald-950/20 border border-emerald-900/40 rounded-lg"
          >
            <Radio class="w-3 h-3 text-emerald-400 animate-pulse shrink-0" />
            <span class="text-[10px] font-mono text-emerald-400 uppercase tracking-widest">
              {{ selectedInputs.length }} input{{ selectedInputs.length > 1 ? 's' : '' }} active
              <template v-if="thruOutput"> → THRU routing enabled</template>
            </span>
          </div>

        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.hub-enter-active,
.hub-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.hub-enter-from,
.hub-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>
