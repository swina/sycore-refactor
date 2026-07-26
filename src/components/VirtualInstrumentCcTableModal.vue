<script setup>
import { computed } from 'vue'
import { X, Plus, Trash2 } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'

const props = defineProps({
  instrumentName: { type: String, required: true },
})
const emit = defineEmits(['close'])

const midiStore = useMidiStore()

const instrument = computed(() =>
  midiStore.virtualInstruments.find(v => v.name === props.instrumentName)
)
const table = computed(() => instrument.value?.ccTable ?? [])

function commit(nextTable) {
  midiStore.setVirtualInstrumentCcTable(props.instrumentName, nextTable)
}

function nextFreeCc() {
  const used = new Set(table.value.map(r => r.cc))
  for (let cc = 0; cc < 128; cc++) if (!used.has(cc)) return cc
  return 0
}

function addRow() {
  commit([...table.value, { cc: nextFreeCc(), name: '' }])
}

function removeRow(idx) {
  commit(table.value.filter((_, i) => i !== idx))
}

function updateCc(idx, value) {
  const cc = Math.max(0, Math.min(127, parseInt(value, 10) || 0))
  if (table.value.some((r, i) => i !== idx && r.cc === cc)) return // no duplicate CCs
  const next = table.value.map((r, i) => i === idx ? { ...r, cc } : r)
  commit(next)
}

function updateName(idx, value) {
  const next = table.value.map((r, i) => i === idx ? { ...r, name: value } : r)
  commit(next)
}
</script>

<template>
  <div
    class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl flex flex-col overflow-hidden"
         style="width: 480px; max-height: 80vh;">

      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-[11px] font-mono text-neutral-400 uppercase tracking-wider">CC Table</span>
          <span class="text-[10px] font-mono text-amber-400 bg-amber-900/30 border border-amber-800/50 rounded px-1.5 py-0.5 truncate">
            {{ instrumentName }}
          </span>
        </div>
        <button @click="emit('close')" class="text-neutral-600 hover:text-neutral-300 transition-colors shrink-0">
          <X class="w-4 h-4" />
        </button>
      </div>

      <p class="px-4 pt-3 text-[10px] font-mono text-neutral-600 leading-relaxed shrink-0">
        Name any CC this instrument responds to. Named entries appear in the MIDI Controller Designer's
        action picker, ready to assign to a physical control.
      </p>

      <!-- Rows -->
      <div class="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-1.5">
        <div v-if="table.length === 0" class="text-[10px] text-neutral-700 font-mono italic py-2">
          No CC entries yet.
        </div>
        <div
          v-for="(row, idx) in table" :key="idx"
          class="flex items-center gap-2"
        >
          <input
            type="number" min="0" max="127"
            :value="row.cc"
            @change="updateCc(idx, $event.target.value)"
            class="w-14 bg-black/60 border border-neutral-700 rounded text-[10px] font-mono text-neutral-300 px-1.5 py-1 outline-none focus:border-amber-500/40 text-center"
          />
          <input
            type="text"
            :value="row.name"
            @input="updateName(idx, $event.target.value)"
            placeholder="Name"
            class="flex-1 min-w-0 bg-black/60 border border-neutral-700 rounded text-[10px] font-mono text-neutral-300 px-2 py-1 outline-none focus:border-amber-500/40"
          />
          <button
            @click="removeRow(idx)"
            title="Remove"
            class="text-rose-500/60 hover:text-rose-400 transition-colors shrink-0"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Footer -->
      <div class="shrink-0 border-t border-neutral-800 bg-black/40 p-3">
        <button
          @click="addRow"
          class="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-neutral-700 text-neutral-500 hover:text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all text-[10px] font-bold uppercase tracking-wider"
        >
          <Plus class="w-3.5 h-3.5" />
          Add CC
        </button>
      </div>

    </div>
  </div>
</template>
