<script setup>
import { ref, reactive, computed } from 'vue'
import { Wand2, X, ChevronRight, ChevronLeft, Plus, Trash2, Check } from 'lucide-vue-next'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import { useMidiStore } from '@/stores/useMidiStore'
import { useUiStore } from '@/stores/useUiStore'

const midiStore = useMidiStore()
const uiStore   = useUiStore()

const { panelStyle, onDragStart, bringToFront } = useDraggableResizable({
  storageKey:    'SYCORE_POS_MIDI_WIZARD',
  initialWidth:  480,
  initialHeight: 500,
  minWidth:      400,
  minHeight:     380,
  zIndex:        120,
  minimizeLabel: 'MIDI Wizard',
})

// ── Dedup devices by name (same as MidiPortConfig) ──
const uniqueInputs  = computed(() => {
  const seen = new Set()
  return midiStore.inputs.filter(d => { if (seen.has(d.name)) return false; seen.add(d.name); return true })
})
const uniqueOutputs = computed(() => {
  const seen = new Set()
  return midiStore.outputs.filter(d => { if (seen.has(d.name)) return false; seen.add(d.name); return true })
})

function deviceName(list, id) {
  return list.find(d => d.id === id)?.name ?? ''
}

// ── Wizard state ──
const step        = ref(1)
const controllers = ref([])   // committed controller blocks

function freshOutput() {
  return { deviceId: '', channel: -1, sync: true, transport: true, notes: true, cc: true, pc: true }
}
function freshDraft() {
  return reactive({ inputDeviceId: '', inputChannel: -1, outputs: [freshOutput()] })
}
const draft = ref(freshDraft())

// ── Navigation ──
const canStep1Next = computed(() => !!draft.value.inputDeviceId)
const canStep2Next = computed(() => draft.value.outputs.every(o => !!o.deviceId))

function addOutput() { draft.value.outputs.push(freshOutput()) }
function removeOutput(i) { if (draft.value.outputs.length > 1) draft.value.outputs.splice(i, 1) }

function commitController() {
  controllers.value.push({
    inputDeviceId: draft.value.inputDeviceId,
    inputChannel:  draft.value.inputChannel,
    outputs:       draft.value.outputs.map(o => ({ ...o })),
  })
  step.value = 4
}

function addAnother() {
  draft.value = freshDraft()
  step.value  = 1
}

function finish() {
  for (const ctrl of controllers.value) {
    const inName = deviceName(midiStore.inputs, ctrl.inputDeviceId)
    if (!inName) continue
    midiStore.addRegistration(inName)
    midiStore.updateRegistration(inName, 'inEnabled', true)
    midiStore.updateRegistration(inName, 'inChannel', ctrl.inputChannel)

    for (const out of ctrl.outputs) {
      const outName = deviceName(midiStore.outputs, out.deviceId)
      if (!outName) continue
      midiStore.addRegistration(outName)
      midiStore.updateRegistration(outName, 'outEnabled',  true)
      midiStore.updateRegistration(outName, 'outChannel',  out.channel)
      midiStore.updateRegistration(outName, 'clock',       out.sync)
      midiStore.updateRegistration(outName, 'transport',   out.transport)
      midiStore.updateRegistration(outName, 'notes',       out.notes)
      midiStore.updateRegistration(outName, 'cc',          out.cc)
      midiStore.updateRegistration(outName, 'pc',          out.pc)
    }
  }
  uiStore.isMidiWizardOpen = false
}

const STEPS = ['Input', 'Outputs', 'Routing', 'Done']

const ROUTE_FLAGS = [
  { key: 'sync',      label: 'SYNC',      field: 'clock'     },
  { key: 'transport', label: 'TRANSPORT', field: 'transport' },
  { key: 'notes',     label: 'NOTE',      field: 'notes'     },
  { key: 'cc',        label: 'CC',        field: 'cc'        },
  { key: 'pc',        label: 'PC',        field: 'pc'        },
]
</script>

<template>
  <div
    class="fixed select-none"
    :style="panelStyle"
    @mousedown="bringToFront"
  >
    <div class="h-full flex flex-col bg-neutral-950 border border-synth-neon/30 glow-neon rounded-2xl overflow-hidden shadow-2xl">

      <!-- Header -->
      <div
        class="flex items-center justify-between px-4 py-3 bg-neutral-900/60 border-b border-neutral-800 cursor-grab active:cursor-grabbing"
        @mousedown.stop="onDragStart"
      >
        <span class="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-synth-neon">
          <Wand2 class="w-4 h-4" /> MIDI WIZARD
        </span>
        <!-- Step dots -->
        <div class="flex gap-1.5">
          <div
            v-for="(s, i) in STEPS" :key="s"
            class="w-2 h-2 rounded-full transition-colors"
            :class="step === i + 1 ? 'bg-synth-neon' : 'bg-neutral-700'"
            :title="s"
          />
        </div>
        <button @click="uiStore.isMidiWizardOpen = false" class="p-1 text-neutral-400 hover:text-white transition-colors">
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

        <!-- ── STEP 1: Input device ── -->
        <template v-if="step === 1">
          <p class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Step 1 of 3 — Select Input Controller</p>

          <div class="flex flex-col gap-3">
            <label class="text-[9px] font-bold uppercase tracking-widest text-neutral-500">MIDI Input Device</label>
            <div class="bg-neutral-900/80 border border-neutral-800 hover:border-synth-neon/50 rounded-lg px-4 py-3 transition-colors">
              <select
                v-model="draft.inputDeviceId"
                class="bg-transparent text-xs font-mono font-bold focus:outline-none cursor-pointer w-full uppercase"
              >
                <option value="" disabled class="bg-neutral-950">Select Input</option>
                <option v-for="d in uniqueInputs" :key="d.id" :value="d.id" class="bg-neutral-950">{{ d.name }}</option>
                <option v-if="!uniqueInputs.length" value="" disabled class="bg-neutral-950">No inputs detected</option>
              </select>
            </div>

            <label class="text-[9px] font-bold uppercase tracking-widest text-neutral-500">Input Channel</label>
            <div class="bg-neutral-900/80 border border-neutral-800 hover:border-synth-neon/50 rounded-lg px-4 py-3 transition-colors">
              <select
                v-model.number="draft.inputChannel"
                class="bg-transparent text-xs font-mono font-bold focus:outline-none cursor-pointer w-full"
              >
                <option :value="-1" class="bg-neutral-950">OMNI</option>
                <option v-for="i in 16" :key="i" :value="i - 1" class="bg-neutral-950">Channel {{ i }}</option>
              </select>
            </div>
          </div>

          <div class="flex justify-end mt-auto">
            <button
              :disabled="!canStep1Next"
              @click="step = 2"
              class="flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-colors"
              :class="canStep1Next ? 'bg-synth-neon text-black hover:bg-synth-neon/80' : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'"
            >
              Next <ChevronRight class="w-3.5 h-3.5" />
            </button>
          </div>
        </template>

        <!-- ── STEP 2: Output devices ── -->
        <template v-else-if="step === 2">
          <p class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Step 2 of 3 — Assign Output(s)</p>

          <div class="flex flex-col gap-3">
            <div
              v-for="(out, i) in draft.outputs"
              :key="i"
              class="bg-neutral-900/60 border border-neutral-800 rounded-xl p-3 flex flex-col gap-2"
            >
              <div class="flex items-center justify-between">
                <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500">Output {{ i + 1 }}</span>
                <button
                  v-if="draft.outputs.length > 1"
                  @click="removeOutput(i)"
                  class="p-0.5 text-neutral-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
              <select
                v-model="out.deviceId"
                class="bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs font-mono font-bold focus:outline-none cursor-pointer w-full uppercase"
              >
                <option value="" disabled class="bg-neutral-950">Select Output Device</option>
                <option v-for="d in uniqueOutputs" :key="d.id" :value="d.id" class="bg-neutral-950">{{ d.name }}</option>
                <option v-if="!uniqueOutputs.length" value="" disabled class="bg-neutral-950">No outputs detected</option>
              </select>
              <select
                v-model.number="out.channel"
                class="bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none cursor-pointer w-full"
              >
                <option :value="-1" class="bg-neutral-950">OMNI</option>
                <option v-for="i in 16" :key="i" :value="i - 1" class="bg-neutral-950">Channel {{ i }}</option>
              </select>
            </div>

            <button
              @click="addOutput"
              class="flex items-center gap-1.5 text-xs font-bold text-synth-neon/70 hover:text-synth-neon transition-colors self-start"
            >
              <Plus class="w-3.5 h-3.5" /> Add Output
            </button>
          </div>

          <div class="flex justify-between mt-auto">
            <button @click="step = 1" class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-neutral-400 hover:text-white transition-colors">
              <ChevronLeft class="w-3.5 h-3.5" /> Back
            </button>
            <button
              :disabled="!canStep2Next"
              @click="step = 3"
              class="flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-colors"
              :class="canStep2Next ? 'bg-synth-neon text-black hover:bg-synth-neon/80' : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'"
            >
              Next <ChevronRight class="w-3.5 h-3.5" />
            </button>
          </div>
        </template>

        <!-- ── STEP 3: Routing flags ── -->
        <template v-else-if="step === 3">
          <p class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Step 3 of 3 — Configure Routing</p>

          <div class="flex flex-col gap-4">
            <div
              v-for="(out, i) in draft.outputs"
              :key="i"
              class="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 flex flex-col gap-3"
            >
              <span class="text-[10px] font-bold uppercase tracking-widest text-synth-neon/80 truncate">
                {{ deviceName(midiStore.outputs, out.deviceId) || 'Output ' + (i + 1) }}
              </span>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="flag in ROUTE_FLAGS"
                  :key="flag.key"
                  @click="out[flag.key] = !out[flag.key]"
                  class="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg border transition-colors"
                  :class="out[flag.key]
                    ? 'bg-synth-neon/10 border-synth-neon/60 text-synth-neon'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-500'"
                >
                  {{ flag.label }}
                </button>
              </div>
            </div>
          </div>

          <div class="flex justify-between mt-auto">
            <button @click="step = 2" class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-neutral-400 hover:text-white transition-colors">
              <ChevronLeft class="w-3.5 h-3.5" /> Back
            </button>
            <button
              @click="commitController"
              class="flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg bg-synth-neon text-black hover:bg-synth-neon/80 transition-colors"
            >
              <Check class="w-3.5 h-3.5" /> Add Controller
            </button>
          </div>
        </template>

        <!-- ── STEP 4: Summary ── -->
        <template v-else>
          <p class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Setup Summary</p>

          <div class="flex flex-col gap-3">
            <div
              v-for="(ctrl, i) in controllers"
              :key="i"
              class="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 flex flex-col gap-2"
            >
              <div class="flex items-center gap-2">
                <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500">Controller {{ i + 1 }}</span>
              </div>
              <span class="text-xs font-mono font-bold text-white truncate">
                IN: {{ deviceName(midiStore.inputs, ctrl.inputDeviceId) }}
                <span class="text-neutral-500">ch {{ ctrl.inputChannel === -1 ? 'OMNI' : ctrl.inputChannel + 1 }}</span>
              </span>
              <div v-for="(out, j) in ctrl.outputs" :key="j" class="text-xs font-mono text-neutral-400 truncate pl-2">
                → {{ deviceName(midiStore.outputs, out.deviceId) }}
                <span class="text-neutral-600">ch {{ out.channel === -1 ? 'OMNI' : out.channel + 1 }}</span>
              </div>
            </div>
          </div>

          <div class="flex justify-between mt-auto gap-2">
            <button
              @click="addAnother"
              class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-synth-neon/70 hover:text-synth-neon border border-synth-neon/30 hover:border-synth-neon/60 rounded-lg transition-colors"
            >
              <Plus class="w-3.5 h-3.5" /> Add Another
            </button>
            <button
              @click="finish"
              class="flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg bg-synth-neon text-black hover:bg-synth-neon/80 transition-colors"
            >
              <Check class="w-3.5 h-3.5" /> Finish
            </button>
          </div>
        </template>

      </div>
    </div>
  </div>
</template>
