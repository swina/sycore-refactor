<script setup>
// Drum Machine Export A–H dialog: confirm (which patterns, where the WAVs come from) → exporting
// (the part being rendered / recorded) → done (Download) or error. State held by DrumMachine.vue
// (exportPatterns flow); this only shows it and emits the user's choices.
import { computed } from 'vue'
import { Download, Loader2, X, AlertTriangle, CheckCircle2, Radio } from 'lucide-vue-next'

const props = defineProps({
  // { phase: 'confirm'|'running'|'done'|'error', midiOutOnly, input: { label, loopback } | null,
  //   playing, patterns: string[], bpm, step, done, total, fileName, silent: string[], error }
  state: { type: Object, default: null },
})
const emit = defineEmits(['confirm', 'cancel', 'download', 'close'])

const s = computed(() => props.state)
const pct = computed(() => s.value?.total ? Math.round((s.value.done / s.value.total) * 100) : 0)
const canConfirm = computed(() => s.value?.patterns?.length && !(s.value.midiOutOnly && s.value.playing))
</script>

<template>
  <Teleport to="body">
    <div v-if="s" class="fixed inset-0 z-[400] flex items-center justify-center bg-black/60" @mousedown.self="s.phase !== 'running' && emit(s.phase === 'confirm' ? 'cancel' : 'close')">
      <div class="w-[420px] max-w-[92vw] bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl p-5 flex flex-col gap-4 text-neutral-300">
        <div class="flex items-center gap-2">
          <Download class="w-4 h-4 text-emerald-400" />
          <h3 class="text-sm font-bold text-neutral-100 flex-1">Export A–H</h3>
          <button v-if="s.phase !== 'running'" class="text-neutral-500 hover:text-neutral-200" @click="emit(s.phase === 'confirm' ? 'cancel' : 'close')"><X class="w-4 h-4" /></button>
        </div>

        <!-- confirm -->
        <template v-if="s.phase === 'confirm'">
          <p class="text-xs">
            <template v-if="s.patterns.length">Patterns <span class="font-mono text-amber-300">{{ s.patterns.join(' ') }}</span>, each as its bar and its Fill bar, MIDI + WAV, at {{ s.bpm }} BPM, in one zip.</template>
            <template v-else>No pattern to export: A–H are empty.</template>
          </p>
          <div v-if="s.midiOutOnly" class="rounded-lg border p-3 text-xs flex flex-col gap-1.5"
            :class="s.input?.loopback ? 'border-emerald-700/60 bg-emerald-950/30' : 'border-amber-700/60 bg-amber-950/30'">
            <div class="flex items-center gap-1.5 font-bold" :class="s.input?.loopback ? 'text-emerald-300' : 'text-amber-300'">
              <Radio class="w-3.5 h-3.5" /> MIDI OUT ONLY: WAVs recorded live
            </div>
            <p>The WAVs are recorded in real time from Audio Capture's input while each bar is sent to the instruments: activate a <b>Loopback</b> input in Audio Capture to export the instruments' sound.</p>
            <p v-if="s.input?.loopback" class="text-emerald-300">Input: <span class="font-mono">{{ s.input.label }}</span></p>
            <p v-else class="text-amber-300 flex gap-1"><AlertTriangle class="w-3.5 h-3.5 shrink-0 mt-0.5" />No Loopback input found: recording from <span class="font-mono">{{ s.input?.label || 'the default input' }}</span>.</p>
            <p class="text-neutral-500">About {{ s.patterns.length * 2 }} bars + {{ s.patterns.length * 2 }} s; keep the instruments on.</p>
            <p v-if="s.playing" class="text-red-400">Stop the Drum Machine first.</p>
          </div>
          <p v-else class="text-xs text-neutral-500">WAVs rendered from the Drum Machine's samples (dry mix, nothing plays).</p>
          <div class="flex justify-end gap-2">
            <button class="px-3 py-1.5 rounded-lg border border-neutral-700 text-xs hover:border-neutral-500" @click="emit('cancel')">Cancel</button>
            <button class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 disabled:opacity-40" :disabled="!canConfirm" @click="emit('confirm')">Export</button>
          </div>
        </template>

        <!-- running -->
        <template v-else-if="s.phase === 'running'">
          <div class="flex items-center gap-3">
            <Loader2 class="w-6 h-6 text-amber-400 animate-spin" />
            <div class="flex-1">
              <p class="text-xs">Exporting… <span class="font-mono text-amber-300">{{ s.step }}</span></p>
              <p v-if="s.midiOutOnly" class="text-[10px] text-neutral-500">Recording live: don't play other sounds.</p>
            </div>
            <span class="text-[10px] font-mono text-neutral-500">{{ s.done }}/{{ s.total }}</span>
          </div>
          <div class="h-1.5 rounded-full bg-neutral-800 overflow-hidden"><div class="h-full bg-amber-400 transition-all" :style="{ width: pct + '%' }" /></div>
        </template>

        <!-- done -->
        <template v-else-if="s.phase === 'done'">
          <p class="text-xs flex items-center gap-1.5"><CheckCircle2 class="w-4 h-4 text-emerald-400" />Export complete: <span class="font-mono text-neutral-100">{{ s.fileName }}</span></p>
          <p v-if="s.silent?.length" class="text-xs text-amber-300 flex gap-1"><AlertTriangle class="w-3.5 h-3.5 shrink-0 mt-0.5" />No samples found for pattern {{ s.silent.join(', ') }}: those WAVs are silent (the MIDI files are fine).</p>
          <div class="flex justify-end gap-2">
            <button class="px-3 py-1.5 rounded-lg border border-neutral-700 text-xs hover:border-neutral-500" @click="emit('close')">Close</button>
            <button class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 flex items-center gap-1" @click="emit('download')"><Download class="w-3.5 h-3.5" />Download</button>
          </div>
        </template>

        <!-- error -->
        <template v-else>
          <p class="text-xs text-red-400 flex gap-1"><AlertTriangle class="w-3.5 h-3.5 shrink-0 mt-0.5" />Export failed: {{ s.error }}</p>
          <div class="flex justify-end"><button class="px-3 py-1.5 rounded-lg border border-neutral-700 text-xs hover:border-neutral-500" @click="emit('close')">Close</button></div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
