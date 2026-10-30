<script setup>
import { ref, computed } from 'vue'
import { X, Plus, Trash2, ChevronUp, ChevronDown, GripVertical, ArrowDownWideNarrow } from 'lucide-vue-next'
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

// ── Order: the Virtual Device panel lays its dials out (and recalls them) in table order ──
function moveRow(from, to) {
  if (to < 0 || to >= table.value.length || from === to) return
  const next = [...table.value]
  const [row] = next.splice(from, 1)
  next.splice(to, 0, row)
  commit(next)
}

function sortByCc() {
  commit([...table.value].sort((a, b) => a.cc - b.cc))
}

// drag a row by its grip onto another row
const dragFrom = ref(null)
const dragOver = ref(null)
function onDragStart(idx, e) {
  dragFrom.value = idx
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(idx))
}
function onDrop(idx) {
  if (dragFrom.value != null) moveRow(dragFrom.value, idx)
  dragFrom.value = dragOver.value = null
}
function onDragEnd() {
  dragFrom.value = dragOver.value = null
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
        action picker, ready to assign to a physical control, and as dials in the Virtual Device panel,
        in this order (drag a row by its grip, or use ▲▼).
      </p>

      <!-- Rows -->
      <div class="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-1.5">
        <div v-if="table.length === 0" class="text-[10px] text-neutral-700 font-mono italic py-2">
          No CC entries yet.
        </div>
        <div
          v-for="(row, idx) in table" :key="idx"
          class="flex items-center gap-2 rounded transition-colors"
          :class="[dragOver === idx && dragFrom !== idx ? 'bg-amber-500/10 ring-1 ring-amber-500/40' : '', dragFrom === idx ? 'opacity-40' : '']"
          @dragover.prevent="dragOver = idx"
          @dragleave="dragOver === idx && (dragOver = null)"
          @drop.prevent="onDrop(idx)"
        >
          <span
            draggable="true"
            @dragstart="onDragStart(idx, $event)"
            @dragend="onDragEnd"
            title="Drag to reorder"
            class="text-neutral-600 hover:text-neutral-300 cursor-grab active:cursor-grabbing shrink-0"
          >
            <GripVertical class="w-3.5 h-3.5" />
          </span>
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
          <div class="flex flex-col shrink-0">
            <button @click="moveRow(idx, idx - 1)" :disabled="idx === 0" title="Move up"
              class="text-neutral-500 hover:text-amber-400 disabled:opacity-20 disabled:hover:text-neutral-500 leading-none">
              <ChevronUp class="w-3 h-3" />
            </button>
            <button @click="moveRow(idx, idx + 1)" :disabled="idx === table.length - 1" title="Move down"
              class="text-neutral-500 hover:text-amber-400 disabled:opacity-20 disabled:hover:text-neutral-500 leading-none">
              <ChevronDown class="w-3 h-3" />
            </button>
          </div>
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
      <div class="shrink-0 border-t border-neutral-800 bg-black/40 p-3 flex gap-2">
        <button
          v-if="table.length > 1"
          @click="sortByCc"
          title="Sort the rows by CC number"
          class="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-700 text-neutral-500 hover:text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all text-[10px] font-bold uppercase tracking-wider shrink-0"
        >
          <ArrowDownWideNarrow class="w-3.5 h-3.5" />
          Sort by CC
        </button>
        <button
          @click="addRow"
          class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-neutral-700 text-neutral-500 hover:text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all text-[10px] font-bold uppercase tracking-wider"
        >
          <Plus class="w-3.5 h-3.5" />
          Add CC
        </button>
      </div>

    </div>
  </div>
</template>
