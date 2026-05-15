<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { X, Gamepad2, Radio, CircleDashed, CheckCircle2, AlertTriangle, Trash2, FolderTree, ChevronUp } from 'lucide-vue-next'
import { APP_ACTION_LABELS, CONTINUOUS_ACTIONS, MIDI_ACTION_GROUPS } from '@/lib/app-midi-actions'
import { S1_CC_MAP } from '@/constants/s1-config'
import { useMidiStore } from '@/stores/useMidiStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useMidiFeedback } from '@/composables/useMidiFeedback'

const emit = defineEmits(['close'])

const midiStore    = useMidiStore()
const mappingStore = useMappingStore()
const { testFeedback } = useMidiFeedback()

const learnDevice     = ref('')
const learnChannel    = ref(-1)
const isLearning      = ref(false)
const detectedCC      = ref(null)
const detectedNote    = ref(null)
const detectedChannel = ref(null)
const detectedValue   = ref(null)
const triggerMode     = ref('any')
const exactValue      = ref(127)
const selectedCategory = ref('')
const selectedAction   = ref('')
const collapsedCategories = ref(new Set(Object.keys(MIDI_ACTION_GROUPS)))

const categories = Object.keys(MIDI_ACTION_GROUPS)

const filteredActions = computed(() => {
  if (!selectedCategory.value) return []
  return MIDI_ACTION_GROUPS[selectedCategory.value].map(action => ({
    value: action,
    label: APP_ACTION_LABELS[action]
  }))
})

watch(selectedCategory, (newCat) => {
  if (newCat) {
    const currentActions = MIDI_ACTION_GROUPS[newCat]
    if (!currentActions.includes(selectedAction.value)) {
      selectedAction.value = ''
    }
  }
})
const fbOn            = ref(127)
const fbOff           = ref(0)
const hasFeedback     = ref(false)
const consume         = ref(true)

const learnListenerRef = ref(null)
const learnInputRef    = ref(null)

const s1Entries     = Object.entries(S1_CC_MAP)
const channels16    = Array.from({ length: 16 }, (_, i) => i)

const conflict = computed(() =>
  detectedCC.value !== null ? (S1_CC_MAP[detectedCC.value] ?? null) : null
)

const isContinuousSelected = computed(() =>
  selectedAction.value !== '' && CONTINUOUS_ACTIONS.has(selectedAction.value)
)

const groupedMappings = computed(() => {
  const groups = {}
  
  // Initialize groups
  Object.keys(MIDI_ACTION_GROUPS).forEach(cat => {
    groups[cat] = []
  })
  
  // Distribute mappings
  mappingStore.appMidiMappings.forEach(m => {
    const category = Object.keys(MIDI_ACTION_GROUPS).find(cat => 
      MIDI_ACTION_GROUPS[cat].includes(m.action)
    ) || 'Other'
    
    if (!groups[category]) groups[category] = []
    groups[category].push(m)
  })
  
  // Return only non-empty groups
  return Object.fromEntries(
    Object.entries(groups).filter(([_, ms]) => ms.length > 0)
  )
})

function toggleCategory(cat) {
  if (collapsedCategories.value.has(cat)) {
    collapsedCategories.value.delete(cat)
  } else {
    collapsedCategories.value.add(cat)
  }
}

onMounted(() => {
  categories.forEach(cat => collapsedCategories.value.add(cat))
})

function cancelLearn() {
  if (learnListenerRef.value && learnInputRef.value) {
    learnInputRef.value.removeEventListener('midimessage', learnListenerRef.value)
    learnListenerRef.value = null
    learnInputRef.value    = null
  }
  isLearning.value      = false
  detectedCC.value      = null
  detectedNote.value    = null
  detectedChannel.value = null
  detectedValue.value   = null
}

function startLearn() {
  if (!learnDevice.value) return
  const input = midiStore.inputs.find(i => (i.name ?? i.id) === learnDevice.value)
  if (!input) return

  detectedCC.value      = null
  detectedNote.value    = null
  detectedChannel.value = null
  detectedValue.value   = null
  isLearning.value      = true

  const capturedChannel = learnChannel.value

  const handler = (e) => {
    const data = e.data
    if (!data || data.length < 3) return
    const status = data[0]
    const type   = status & 0xF0
    
    if (type !== 0xB0 && type !== 0x90) return
    
    const chan = status & 0x0F
    const cc   = type === 0xB0 ? data[1] : null
    const note = type === 0x90 ? data[1] : null
    const val  = data[2]
    
    if (capturedChannel !== -1 && chan !== capturedChannel) return

    input.removeEventListener('midimessage', handler)
    learnListenerRef.value = null
    learnInputRef.value    = null
    isLearning.value       = false
    
    detectedCC.value       = cc
    detectedNote.value     = note
    detectedChannel.value  = chan
    detectedValue.value    = val
    
    const isSwitch = val === 0 || val === 127
    triggerMode.value = isSwitch ? 'exact' : 'any'
    exactValue.value  = val
  }

  learnListenerRef.value = handler
  learnInputRef.value    = input
  input.addEventListener('midimessage', handler)
}

function handleConfirm() {
  if ((detectedCC.value === null && detectedNote.value === null) || !selectedAction.value || !learnDevice.value) return
  if (conflict.value) return

  const isContinuous  = CONTINUOUS_ACTIONS.has(selectedAction.value)
  const mappingValue  = isContinuous ? -1 : (triggerMode.value === 'exact' ? exactValue.value : -1)

  const newMapping = {
    id:      `${learnDevice.value}:${detectedCC.value ?? 'NOTE' + detectedNote.value}:${detectedChannel.value ?? -1}:${Date.now()}`,
    device:  learnDevice.value,
    cc:      detectedCC.value ?? undefined,
    note:    detectedNote.value ?? undefined,
    channel: detectedChannel.value ?? -1,
    value:   mappingValue,
    action:  selectedAction.value,
    feedbackOn:  hasFeedback.value ? fbOn.value : undefined,
    feedbackOff: hasFeedback.value ? fbOff.value : undefined,
    consume:     consume.value,
  }
  mappingStore.saveAppMidiMappings([...mappingStore.appMidiMappings, newMapping])
  detectedCC.value      = null
  detectedNote.value    = null
  detectedChannel.value = null
  detectedValue.value   = null
  selectedAction.value  = ''
  triggerMode.value     = 'any'
}

function handleRemove(id) {
  mappingStore.saveAppMidiMappings(mappingStore.appMidiMappings.filter(m => m.id !== id))
}

function valueLabel(m) {
  if (CONTINUOUS_ACTIONS.has(m.action)) return 'range'
  if (m.note !== undefined) return 'Note On'
  return m.value === -1 ? 'val > 63' : `val = ${m.value}`
}

function onExactInput(e) {
  triggerMode.value = 'exact'
  exactValue.value  = Math.max(0, Math.min(127, parseInt(e.target.value) || 0))
}

onUnmounted(() => cancelLearn())
</script>

<template>
  <div class="fixed inset-0 z-[170] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
    <div class="bg-neutral-900 border border-violet-500/30 rounded-2xl p-6 max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl">

      <!-- Header -->
      <div class="flex justify-between items-center mb-4 border-b border-neutral-800 pb-4 shrink-0">
        <h2 class="text-xl font-black text-white tracking-widest uppercase flex items-center gap-2">
          <Gamepad2 class="w-6 h-6 text-violet-400" />
          MIDI ACTIONS
        </h2>
        <button @click="emit('close')" class="text-neutral-500 hover:text-rose-500 transition-colors p-2">
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-5">

        <!-- Add Mapping -->
        <div class="bg-neutral-800/50 rounded-xl p-4 space-y-3">
          <p class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Add New Mapping</p>

          <!-- Device selector -->
          <div>
            <label class="block text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1">MIDI Input Device</label>
            <select
              v-model="learnDevice"
              class="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-neutral-300 font-mono text-sm focus:border-violet-400 outline-none"
            >
              <option value="">— select device —</option>
              <option v-for="d in midiStore.inputs" :key="d.id" :value="d.name ?? d.id">
                {{ d.name ?? `Device ${d.id.slice(0, 8)}` }}
              </option>
            </select>
            <p v-if="midiStore.inputs.length === 0" class="text-[10px] font-mono text-neutral-600 mt-1">
              No MIDI input devices detected.
            </p>
          </div>

          <!-- Channel filter -->
          <div>
            <label class="block text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1">Channel Filter</label>
            <select
              v-model.number="learnChannel"
              class="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-neutral-300 font-mono text-sm focus:border-violet-400 outline-none"
            >
              <option :value="-1">Any Channel (OMNI)</option>
              <option v-for="i in channels16" :key="i" :value="i">Channel {{ i + 1 }}</option>
            </select>
          </div>

          <!-- Learning state -->
          <div v-if="isLearning"
            class="bg-violet-500/10 border border-violet-500/30 rounded-xl p-5 text-center flex flex-col items-center animate-pulse"
          >
            <CircleDashed class="w-8 h-8 text-violet-400 mb-2 animate-spin" />
            <p class="font-bold text-violet-400 tracking-widest uppercase text-xs mb-1">Learning…</p>
            <p class="text-neutral-400 text-[10px] uppercase">Move a controller on your device</p>
            <button @click="cancelLearn" class="mt-3 text-xs text-neutral-500 hover:text-white underline">Cancel</button>
          </div>

          <!-- CC/Note detected -->
          <div v-else-if="detectedCC !== null || detectedNote !== null"
            class="bg-neutral-700/40 border border-neutral-600 rounded-xl p-4 space-y-3"
          >
            <!-- Detected info -->
            <div class="flex items-center justify-center gap-4 text-center">
              <div v-if="detectedCC !== null">
                <p class="text-neutral-500 text-[9px] uppercase mb-0.5">CC#</p>
                <p class="text-2xl font-black text-violet-400">{{ detectedCC }}</p>
              </div>
              <div v-else-if="detectedNote !== null">
                <p class="text-neutral-500 text-[9px] uppercase mb-0.5">NOTE#</p>
                <p class="text-2xl font-black text-amber-400">{{ detectedNote }}</p>
              </div>
              <div v-if="detectedChannel !== null">
                <p class="text-neutral-500 text-[9px] uppercase mb-0.5">Channel</p>
                <p class="text-2xl font-black text-neutral-300">{{ detectedChannel + 1 }}</p>
              </div>
              <div v-if="detectedValue !== null">
                <p class="text-neutral-500 text-[9px] uppercase mb-0.5">Value</p>
                <p class="text-2xl font-black text-neutral-300">{{ detectedValue }}</p>
              </div>
            </div>

            <!-- Conflict warning -->
            <div v-if="conflict" class="bg-red-900/30 border border-red-500/40 rounded-lg p-3 flex gap-2 items-start">
              <AlertTriangle class="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p class="text-red-400 text-xs font-bold">S-1 CC# Conflict</p>
                <p class="text-neutral-400 text-[10px] mt-0.5">
                  CC#{{ detectedCC }} is assigned to the S-1 parameter
                  <strong class="text-neutral-200">{{ conflict }}</strong>.
                  Reconfigure your MIDI device to use a different CC#.
                </p>
              </div>
            </div>

            <template v-else>
              <!-- Trigger value -->
              <div>
                <label class="block text-neutral-400 text-[10px] uppercase mb-2">
                  Trigger on Value
                  <span v-if="isContinuousSelected" class="ml-2 text-violet-400/60 normal-case">(ignored for continuous)</span>
                </label>
                <div class="flex gap-2">
                  <button
                    @click="triggerMode = 'any'"
                    :class="[
                      'flex-1 py-2 rounded-lg text-[10px] font-black uppercase border transition-colors',
                      triggerMode === 'any'
                        ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-600'
                    ]"
                  >
                    Any &gt; 63
                  </button>
                  <button
                    @click="triggerMode = 'exact'"
                    :class="[
                      'flex-1 py-2 px-3 rounded-lg text-[10px] font-black uppercase border transition-colors flex items-center justify-center gap-2',
                      triggerMode === 'exact'
                        ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-600'
                    ]"
                  >
                    Exact =
                    <input
                      type="number"
                      min="0"
                      max="127"
                      :value="exactValue"
                      @click.stop="triggerMode = 'exact'"
                      @input="onExactInput"
                      class="w-10 bg-black border border-neutral-600 rounded px-1 py-0.5 text-center text-violet-300 font-mono text-[10px] focus:outline-none focus:border-violet-400"
                    />
                  </button>
                </div>
              </div>

              <!-- Category selector -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label class="block text-neutral-400 text-[10px] uppercase mb-2">Category</label>
                  <select
                    v-model="selectedCategory"
                    class="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-neutral-300 font-mono text-xs focus:border-violet-400 outline-none"
                  >
                    <option value="" disabled>Select category…</option>
                    <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
                  </select>
                </div>

                <!-- Action selector -->
                <div>
                  <label class="block text-neutral-400 text-[10px] uppercase mb-2">Action</label>
                  <select
                    v-model="selectedAction"
                    :disabled="!selectedCategory"
                    class="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-neutral-300 font-mono text-xs focus:border-violet-400 outline-none disabled:opacity-50"
                  >
                    <option value="" disabled>{{ selectedCategory ? 'Select action…' : 'Pick category first' }}</option>
                    <option v-for="act in filteredActions" :key="act.value" :value="act.value">{{ act.label }}</option>
                  </select>
                </div>
              </div>
              <p v-if="isContinuousSelected" class="text-[10px] font-mono text-violet-400/70 mt-1">
                Continuous — CC value (0–127) maps to the full parameter range
              </p>

              <!-- Consumption toggle -->
              <div class="bg-neutral-900/50 rounded-lg p-3 border border-neutral-700/50">
                <label class="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" v-model="consume" class="w-4 h-4 accent-violet-500 rounded" />
                  <div>
                    <p class="text-[10px] font-black uppercase text-neutral-300 group-hover:text-white transition-colors">Consume MIDI Message</p>
                    <p class="text-[9px] text-neutral-500 leading-tight mt-0.5">Prevent this Note/CC from being heard or passed to other devices.</p>
                  </div>
                </label>
              </div>

              <!-- LED Feedback Config -->
              <div class="border-t border-neutral-700 pt-3 mt-1">
                <div class="flex items-center justify-between mb-2">
                  <label class="text-neutral-400 text-[10px] uppercase cursor-pointer flex items-center gap-2">
                    <input type="checkbox" v-model="hasFeedback" class="accent-violet-500" />
                    Enable LED Feedback
                  </label>
                  <span v-if="hasFeedback" class="text-[9px] font-mono text-neutral-500 uppercase tracking-tighter">Velocity / Value</span>
                </div>
                
                <div v-if="hasFeedback" class="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1">
                  <div class="bg-black/40 rounded-lg p-2 border border-neutral-700/50">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[9px] text-green-500 font-black uppercase">ON</span>
                      <input
                        type="number" min="0" max="127" v-model.number="fbOn"
                        class="w-12 bg-neutral-900 border border-neutral-700 rounded px-1.5 py-1 text-center text-xs font-mono text-white focus:border-green-500 outline-none"
                      />
                    </div>
                  </div>
                  <div class="bg-black/40 rounded-lg p-2 border border-neutral-700/50">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[9px] text-red-500 font-black uppercase">OFF</span>
                      <input
                        type="number" min="0" max="127" v-model.number="fbOff"
                        class="w-12 bg-neutral-900 border border-neutral-700 rounded px-1.5 py-1 text-center text-xs font-mono text-white focus:border-red-500 outline-none"
                      />
                    </div>
                  </div>
                </div>
                <p v-if="hasFeedback" class="text-[9px] text-neutral-500 mt-2 italic">
                   Send back value to {{ detectedNote !== null ? 'Note' : 'CC' }} on state change.
                </p>
                <button
                  v-if="hasFeedback"
                  @click="testFeedback({ device: learnDevice, note: detectedNote, cc: detectedCC, channel: learnChannel, feedbackOn: fbOn, feedbackOff: fbOff })"
                  class="mt-2 w-full bg-neutral-800 border border-neutral-700 rounded-lg py-1.5 text-[9px] font-black uppercase text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors"
                >
                  Test LED Pulse
                </button>
              </div>
            </template>

            <!-- Confirm / cancel row -->
            <div class="flex gap-2">
              <button
                @click="cancelLearn"
                class="flex-1 py-2.5 text-neutral-400 uppercase tracking-widest font-black text-[10px] bg-neutral-800 rounded-lg hover:bg-neutral-700 border border-neutral-700"
              >
                {{ conflict ? 'Try Again' : 'Cancel' }}
              </button>
              <button
                v-if="!conflict"
                @click="handleConfirm"
                :disabled="!selectedAction"
                class="flex-1 py-2.5 text-black uppercase tracking-widest font-black text-[10px] bg-violet-400 rounded-lg hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <CheckCircle2 class="w-4 h-4" />
                Confirm
              </button>
            </div>
          </div>

          <!-- Idle: MIDI Learn button -->
          <button
            v-else
            @click="startLearn"
            :disabled="!learnDevice"
            class="w-full bg-violet-500 text-white rounded-lg py-3.5 font-black tracking-widest uppercase text-xs flex items-center justify-center gap-2 hover:bg-violet-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-500/20"
          >
            <Radio class="w-4 h-4" />
            MIDI LEARN
          </button>
        </div>

        <!-- Configured mappings table -->
        <div>
          <h3 class="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-3 border-b border-neutral-800 pb-2">
            Configured App Mappings
          </h3>
          <p
            v-if="mappingStore.appMidiMappings.length === 0"
            class="text-neutral-600 text-xs italic text-center py-4 rounded-lg bg-neutral-900 border border-neutral-800 border-dashed"
          >
            No app actions mapped yet.
          </p>
          <div v-else class="space-y-4">
            <div v-for="(mappings, category) in groupedMappings" :key="category" class="space-y-2">
              <!-- Category Header (Collapsible) -->
              <button 
                @click="toggleCategory(category)"
                class="w-full flex items-center justify-between gap-2 px-2 py-1 hover:bg-white/5 rounded-lg transition-colors group/cat"
              >
                <div class="flex items-center gap-2">
                  <FolderTree :class="['w-3.5 h-3.5 transition-colors', collapsedCategories.has(category) ? 'text-neutral-600' : 'text-violet-400']" />
                  <span :class="['text-[10px] font-black uppercase tracking-widest transition-colors', collapsedCategories.has(category) ? 'text-neutral-500' : 'text-neutral-200']">
                    {{ category }}
                  </span>
                  <span class="text-[9px] font-mono text-neutral-600 bg-neutral-800 px-1.5 rounded-full">
                    {{ mappings.length }}
                  </span>
                </div>
                <ChevronUp :class="['w-3 h-3 text-neutral-600 group-hover/cat:text-neutral-400 transition-transform', collapsedCategories.has(category) ? 'rotate-180' : '']" />
              </button>

              <!-- Mappings in Category (Collapsible Content) -->
              <div v-if="!collapsedCategories.has(category)" class="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                <div
                  v-for="m in mappings"
                  :key="m.id"
                  :class="[
                    'flex items-center justify-between rounded-lg p-3 border',
                    S1_CC_MAP[m.cc] ? 'bg-red-900/10 border-red-500/30' : 'bg-neutral-900 border-neutral-800'
                  ]"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <div class="shrink-0 text-center">
                      <span v-if="m.cc !== undefined" class="bg-black border border-neutral-800 text-violet-400 font-mono text-[10px] px-2 py-1 rounded block">
                        CC#{{ m.cc }}
                      </span>
                      <span v-else-if="m.note !== undefined" class="bg-black border border-neutral-800 text-amber-400 font-mono text-[10px] px-2 py-1 rounded block">
                        NOTE#{{ m.note }}
                      </span>
                      <span class="text-neutral-600 font-mono text-[9px] block mt-0.5">{{ valueLabel(m) }}</span>
                    </div>
                    <div class="min-w-0">
                      <p class="text-neutral-300 font-bold uppercase tracking-wide text-[10px] truncate">
                        {{ APP_ACTION_LABELS[m.action] }}
                      </p>
                      <p class="text-neutral-500 font-mono text-[10px] bg-neutral-950/50 px-1.5 py-0.5 rounded border border-neutral-800/50 w-fit mt-1">
                        {{ m.device }} <span class="mx-1 text-neutral-700">|</span> {{ m.channel === -1 ? 'OMNI' : `CH${m.channel + 1}` }}
                      </p>
                      <div v-if="m.feedbackOn !== undefined || m.consume" class="flex flex-wrap gap-2 mt-1">
                        <span v-if="m.consume" class="text-[8px] bg-violet-500/10 text-violet-400 border border-violet-500/20 px-1 rounded uppercase font-black">CONSUME</span>
                        <span v-if="m.feedbackOn !== undefined" class="text-[8px] bg-green-500/10 text-green-400 border border-green-500/20 px-1 rounded uppercase font-black">LED ON: {{ m.feedbackOn }}</span>
                        <span v-if="m.feedbackOn !== undefined" class="text-[8px] bg-red-500/10 text-red-400 border border-red-500/20 px-1 rounded uppercase font-black">LED OFF: {{ m.feedbackOff }}</span>
                        <button
                          v-if="m.feedbackOn !== undefined"
                          @click="testFeedback(m)"
                          class="text-[8px] text-violet-400 hover:text-violet-300 underline font-black uppercase"
                        >
                          Test
                        </button>
                      </div>
                    </div>
                    <span v-if="S1_CC_MAP[m.cc]" :title="`Conflicts with S-1 ${S1_CC_MAP[m.cc]}`" class="shrink-0">
                      <AlertTriangle class="w-3.5 h-3.5 text-red-400" />
                    </span>
                  </div>
                  <button
                    @click="handleRemove(m.id)"
                    class="text-neutral-500 hover:text-rose-500 p-1 shrink-0"
                    title="Remove mapping"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- S-1 CC# Reference -->
        <details class="group">
          <summary class="text-[10px] font-black text-neutral-500 uppercase tracking-widest cursor-pointer hover:text-neutral-300 border-b border-neutral-800 pb-2 mb-3 select-none list-none flex items-center justify-between">
            S-1 CC# Reference — avoid these CC#s
            <span class="group-open:rotate-180 transition-transform inline-block text-xs">▾</span>
          </summary>
          <div class="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto pr-1">
            <div v-for="[cc, name] in s1Entries" :key="cc" class="flex items-center gap-2 bg-neutral-900 rounded px-2 py-1">
              <span class="text-orange-400 font-mono text-[9px] w-9 shrink-0">CC#{{ cc }}</span>
              <span class="text-neutral-400 text-[9px] font-mono truncate">{{ name }}</span>
            </div>
          </div>
        </details>

      </div>
    </div>
  </div>
</template>
