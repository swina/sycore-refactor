<script setup>
// The progressions of the Chord Prog's Source (a key file, a genre, Modal Chords): browse them, hear
// their chords, and put one in the slot — in the Generate style (USE) or as written (AS IS).
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { X, Search } from 'lucide-vue-next'
import { NOTE_NAMES } from '@/lib/chord-key'
import { modalRoot } from '@/lib/chord-gen-style'

const props = defineProps({
  title: { type: String, default: '' },
  names: { type: Array, default: () => [] },
  data: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false },
  /** Modal Chords: the root chosen (null = any) — the list starts on it */
  root: { type: Number, default: null },
  styleName: { type: String, default: '' },
  numSteps: { type: Number, default: 8 },
})
const emit = defineEmits(['close', 'preview', 'use', 'load'])

const query = ref('')
const onRoot = ref(props.root != null)
watch(() => props.root, r => { onRoot.value = r != null })
const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return props.names.filter(n =>
    (!onRoot.value || props.root == null || modalRoot(n) === props.root) &&
    (!q || n.toLowerCase().includes(q)))
})
const picked = ref('')
watch(shown, list => { if (!list.includes(picked.value)) picked.value = list[0] ?? '' }, { immediate: true })
const chords = computed(() => props.data[picked.value] ?? [])

function onKey(e) {
  if (e.key === 'Escape') { emit('close'); return }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  const i = shown.value.indexOf(picked.value)
  const j = Math.max(0, Math.min(shown.value.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))
  if (shown.value[j]) { picked.value = shown.value[j]; e.preventDefault() }
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

const btn = 'px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
</script>

<template>
  <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
       data-prog-browser @click.self="emit('close')" @pointerdown.stop @mousedown.stop>
    <div class="bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl flex flex-col overflow-hidden w-full max-w-[760px] h-[80vh]">
      <!-- Header -->
      <div class="flex items-center gap-2 px-4 py-3 border-b border-neutral-800 shrink-0">
        <span class="text-[13px] font-mono text-neutral-400 uppercase tracking-wider">Progressions</span>
        <span class="text-[10px] font-mono text-purple-300 bg-purple-900/30 border border-purple-800/50 rounded px-1.5 py-0.5 truncate">{{ title }}</span>
        <span class="text-[10px] font-mono text-neutral-600">{{ shown.length }} / {{ names.length }}</span>
        <div class="flex-1" />
        <button type="button" class="text-neutral-600 hover:text-neutral-300 transition-colors" title="Close (Esc)" @click="emit('close')">
          <X class="w-4 h-4" />
        </button>
      </div>
      <!-- Filters -->
      <div class="flex items-center gap-2 px-4 py-2 border-b border-neutral-800 shrink-0">
        <div class="flex items-center gap-1 flex-1 min-w-0 bg-neutral-900 border border-neutral-800 rounded px-2 py-1">
          <Search class="w-3 h-3 text-neutral-600 shrink-0" />
          <input v-model="query" type="text" placeholder="Search (name, mood…)" data-prog-search
                 class="flex-1 min-w-0 bg-transparent text-[11px] font-mono text-neutral-200 outline-none" />
        </div>
        <button v-if="root != null" type="button" data-prog-onroot
                :class="[btn, onRoot ? 'bg-purple-800 text-purple-100' : 'border border-neutral-700 text-neutral-500 hover:text-white']"
                :title="`Only the progressions on ${NOTE_NAMES[root]} (the Root chosen)`"
                @click="onRoot = !onRoot">On {{ NOTE_NAMES[root] }}</button>
      </div>
      <!-- Body: the list · the chords -->
      <div class="flex flex-1 min-h-0">
        <div class="flex-1 min-w-0 overflow-y-auto custom-scrollbar border-r border-neutral-800">
          <button v-for="n in shown" :key="n" type="button" data-prog-item
                  :class="['w-full text-left font-mono px-3 py-1 text-[11px] truncate transition-colors',
                    picked === n ? 'bg-purple-900/40 text-purple-200 font-bold' : 'text-neutral-400 hover:text-white hover:bg-neutral-800/40']"
                  @click="picked = n" @dblclick="emit('use', n)">{{ n }}</button>
          <div v-if="loading" class="px-3 py-4 text-[10px] text-neutral-600 text-center">Loading…</div>
          <div v-else-if="!shown.length" class="px-3 py-4 text-[10px] text-neutral-600 text-center">No progressions</div>
        </div>
        <div class="w-60 shrink-0 flex flex-col min-h-0">
          <div class="px-3 py-1.5 border-b border-neutral-800 text-[9px] font-bold uppercase tracking-widest text-neutral-500">
            Chords <span class="normal-case font-normal text-neutral-600">· click: hear it</span>
          </div>
          <div class="flex-1 overflow-y-auto custom-scrollbar">
            <button v-for="(c, i) in chords" :key="i" type="button" data-prog-chord
                    class="w-full text-left px-3 py-1 flex items-center justify-between gap-2 text-neutral-300 hover:text-white hover:bg-purple-900/30 transition-colors"
                    @click="emit('preview', c)">
              <span class="font-mono text-[12px] truncate">{{ c.chordName }}</span>
              <span class="text-neutral-600 font-mono text-[8px] shrink-0">{{ c.notes.length }}n</span>
            </button>
          </div>
        </div>
      </div>
      <!-- Footer -->
      <div class="flex items-center gap-2 px-4 py-2.5 border-t border-neutral-800 shrink-0">
        <span class="text-[10px] font-mono text-neutral-500 truncate flex-1">{{ picked || '—' }}</span>
        <button type="button" data-prog-load :disabled="!picked" :class="[btn, 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200']"
                :title="`Into the slot as written: its chords over the ${numSteps} steps, the steps' lengths kept`"
                @click="emit('load', picked)">As is</button>
        <button type="button" data-prog-use :disabled="!picked" :class="[btn, 'bg-purple-700 hover:bg-purple-600 text-white']"
                :title="`Into the slot in the ${styleName} style (lengths, gate, velocity, voicing) — as Generate does, with this progression (double-click: the same)`"
                @click="emit('use', picked)">Use · {{ styleName }}</button>
      </div>
    </div>
  </div>
</template>
