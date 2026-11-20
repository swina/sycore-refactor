<script setup>
// The Chord Prog's whole-progression mode: AUTO = as written (each step's Mode in EDIT, else the
// slot's Chord / Arp — Chord by default), CHORD / ARP = every step so. Non-destructive: the steps'
// own Modes come back with AUTO.
import { useChordProgStore, PROG_MODES } from '@/stores/useChordProgStore'

const store = useChordProgStore()
const LABEL = { auto: 'Auto', chord: 'Chord', arp: 'Arp' }
const TITLE = {
  auto: "AUTO: as written — each step's Mode (EDIT), else the slot's Chord / Arp",
  chord: 'CHORD: the whole progression as chords',
  arp: 'ARP: the whole progression arpeggiated',
}
</script>

<template>
  <div class="flex items-center rounded overflow-hidden border border-neutral-700 font-mono uppercase tracking-wider text-[10px] font-bold"
       @pointerdown.stop @mousedown.stop>
    <button v-for="m in PROG_MODES" :key="m" type="button" :title="TITLE[m]"
            :class="['px-1.5 py-0.5 transition-colors', store.progMode === m ? 'bg-purple-700 text-white' : 'bg-neutral-900 text-neutral-400 hover:text-white']"
            @click.stop="store.progMode = m">{{ LABEL[m] }}</button>
  </div>
</template>
