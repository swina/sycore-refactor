<script setup>
// The Chord Prog's Generate settings, compact (its play view's header): Source (the library),
// Root (Modal Chords) and Style — what Generate and the Rig's Chord GEN write (chord-gen-style.ts).
import { useChordProgStore } from '@/stores/useChordProgStore'
import { KEY_FILE_NAMES } from '@/composables/useProgressionLoader'
import { NOTE_NAMES } from '@/lib/chord-key'
import { CHORD_GEN_STYLE_NAMES, MODAL_KEY_INDEX } from '@/lib/chord-gen-style'
import { ListMusic } from 'lucide-vue-next'

const emit = defineEmits(['browse'])

const store = useChordProgStore()
const sel = 'bg-neutral-900 border border-neutral-700 rounded px-1.5 py-0.5 text-[10px] font-bold text-purple-200 cursor-pointer [color-scheme:dark]'
</script>

<template>
  <div class="flex items-center gap-1 min-w-0" @pointerdown.stop @mousedown.stop>
    <select v-model.number="store.selectedKey" :class="[sel, 'max-w-32']" title="Source: the library Generate (and the Rig's GEN) picks from">
      <option v-for="(name, idx) in KEY_FILE_NAMES" :key="idx" :value="idx">{{ name.replace(/^· /, 'Genre · ') }}</option>
    </select>
    <button type="button" data-prog-browse :class="[sel, 'flex items-center px-1']"
            title="The Source's progressions: hear them, put one in the slot"
            @click.stop="emit('browse')"><ListMusic class="w-3 h-3" /></button>
    <select v-if="store.selectedKey === MODAL_KEY_INDEX" :value="store.modalRoot ?? ''" :class="[sel, 'font-mono']"
            title="Root: only the Modal Chords progressions on it (Rig Key ◀ ▶ moves it)"
            @change="store.modalRoot = $event.target.value === '' ? null : Number($event.target.value)">
      <option value="">Any</option>
      <option v-for="(n, i) in NOTE_NAMES" :key="n" :value="i">{{ n }}</option>
    </select>
    <select v-model="store.genStyle" :class="[sel, 'max-w-28']" title="Style: chord lengths, voicing, moods of Generate (and the Rig's GEN)">
      <option v-for="n in CHORD_GEN_STYLE_NAMES" :key="n" :value="n">{{ n }}</option>
    </select>
  </div>
</template>
