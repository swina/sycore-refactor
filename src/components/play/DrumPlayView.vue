<script setup>
// The Drum Machine's play view (Performance): its sequences, a beat bar (one segment per beat,
// lined up with the four groups of steps) and every pad of the sequence — no playhead over them.
// With a bassline in use on the Rig (its part playing, or a Bass slot armed with Live stopped) the
// bassline's source pads (the last three) show its voices instead, as BASS 1–3 in purple (their
// sequence: the Rig's bass part's own, else the drums'). The pads edit as in the panel (emitted to
// DrumMachine.vue): click a step on / off, right-click its menu (velocity, accent, ratchet, tie); on
// the bass rows also the wheel (note) and double-click (note from MIDI); the label previews the pad.
// Re-renders once per beat (the bar), and on edits. Under the pads: the performance row (DrumPerformRow).
import { computed } from 'vue'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { drumSnapshot, rigReports, rigArmed, bassInUse } from '@/lib/rig-live'
import { drumPosition } from '@/lib/drum-position'
import PlaySlots from './PlaySlots.vue'
import PlayChain from './PlayChain.vue'
import DrumPerformRow from './DrumPerformRow.vue'

const drumStore = useDrumMachineStore()
// the chain (from DrumMachine.vue, the engine's: letters or null — an empty entry plays on the one
// before) and its position playing
const chainEntries = computed(() => props.chain ?? [])
const snap = computed(() => drumSnapshot(drumStore.sequences, undefined, drumStore.activeSequence, drumStore.isPlaying && drumStore.drumsOn, rigReports.queued.drum ?? rigArmed.drum))
const beat = computed(() => drumStore.isPlaying ? drumPosition.value.beat : 0)
// as the EDIT view: drum steps purple (accent yellow), bassline amber
const DRUM_ON = 'bg-purple-600/80 border-purple-400/60'
const BASS_ON = 'bg-amber-600/50 border-amber-400/60'
const props = defineProps({ capture: { type: Number, default: -1 }, chain: { type: Array, default: null }, chainPos: { type: Number, default: -1 } }) // bass step awaiting a MIDI note (voice * 16 + step)
const emit = defineEmits(['preview', 'step-toggle', 'step-context', 'bass-toggle', 'bass-context', 'bass-wheel', 'bass-capture'])
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const noteName = n => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`
const rows = computed(() => {
  const bassSeq = drumStore.basslineSequence ?? drumStore.activeSequence
  const bass = bassInUse(drumStore, rigArmed.bass ?? null) ? drumStore.basslineSequences[bassSeq] ?? [] : []
  return drumStore.currentPattern.map((t, ti) => {
    const vi = bass.length ? drumStore.basslineSourceSlots.indexOf(ti) : -1
    return vi >= 0 && bass[vi]
      ? { ...bass[vi], ti, vi, seq: bassSeq, label: `Bass ${vi + 1}`, bass: true, on: BASS_ON }
      : { ...t, ti, bass: false, on: DRUM_ON }
  })
})
const inLen = (t, i) => i < (t.length ?? 16)
const cellTitle = (t, i) => {
  const st = t.steps[i]
  if (!st?.active) return `Step ${i + 1}`
  return `Step ${i + 1}${t.bass ? ' · ' + noteName(st.note ?? 36) : ''} · vel ${st.velocity}${st.accent ? ' · accent' : ''}${st.ratchet > 1 ? ' · ×' + st.ratchet : ''}${st.tie > 0 ? ' · T' + st.tie : ''}`
}
function onClick(t, i) {
  if (!inLen(t, i)) return
  if (t.bass) emit('bass-toggle', t.vi, i, t.seq); else emit('step-toggle', t.ti, i)
}
function onContext(t, i, e) {
  e.preventDefault()
  if (!inLen(t, i)) return
  if (t.bass) emit('bass-context', t.vi, i, e, t.seq); else emit('step-context', t.ti, i, e)
}
function onWheel(t, i, e) {
  if (t.bass && inLen(t, i)) { e.preventDefault(); emit('bass-wheel', t.vi, i, e, t.seq) }
}
function onDbl(t, i) {
  if (t.bass && inLen(t, i)) emit('bass-capture', t.vi, i, t.seq)
}
</script>

<template>
  <div class="flex flex-col gap-2 p-3 min-h-0">
    <!-- Chain mode on: the slots narrow, the chain on their right -->
    <div class="flex items-center gap-3 min-w-0">
      <PlaySlots accent="purple" :snap="snap" :compact="drumStore.chainEnabled" :class="drumStore.chainEnabled ? '' : 'flex-1'" />
      <PlayChain v-if="drumStore.chainEnabled" class="flex-1" :entries="chainEntries" :trim-empty="false" :current="drumStore.isPlaying ? props.chainPos : -1" />
    </div>
    <div class="flex flex-col gap-1 min-h-0">
      <div class="flex items-center gap-2">
        <div class="shrink-0 w-20" />
        <div class="flex-1 flex gap-2">
          <div v-for="b in 4" :key="b" class="flex-1 h-1.5 rounded-full"
               :class="beat === b ? 'bg-purple-400' : 'bg-neutral-800'" />
        </div>
      </div>
      <div v-for="(t, ti) in rows" :key="ti" class="flex items-center gap-2">
        <button class="shrink-0 w-20 text-left text-[10px] font-bold truncate hover:text-white focus:outline-none"
                :class="t.bass ? 'text-amber-300 uppercase' : 'text-neutral-400'" title="Preview"
                @click.stop="emit('preview', t.ti)">{{ t.label }}</button>
        <div class="flex-1 flex gap-2">
          <div v-for="g in 4" :key="g" class="flex-1 grid grid-cols-4 gap-1">
            <button v-for="l in 4" :key="l" class="relative h-4 rounded-sm border focus:outline-none"
                 :class="(g - 1) * 4 + (l - 1) >= (t.length ?? 16) ? 'bg-transparent border-transparent cursor-default'
                   : t.steps[(g - 1) * 4 + (l - 1)]?.active
                     ? (t.steps[(g - 1) * 4 + (l - 1)].accent ? (t.bass ? 'bg-amber-400 border-amber-200' : 'bg-yellow-400 border-yellow-300') : t.on)
                     : 'bg-neutral-900 border-neutral-800 hover:bg-neutral-800'"
                 :title="inLen(t, (g - 1) * 4 + (l - 1)) ? cellTitle(t, (g - 1) * 4 + (l - 1)) : undefined"
                 @click.stop="onClick(t, (g - 1) * 4 + (l - 1))"
                 @contextmenu="onContext(t, (g - 1) * 4 + (l - 1), $event)"
                 @wheel="onWheel(t, (g - 1) * 4 + (l - 1), $event)"
                 @dblclick.stop="onDbl(t, (g - 1) * 4 + (l - 1))">
              <span v-if="t.bass && props.capture === t.vi * 16 + (g - 1) * 4 + (l - 1)"
                    class="absolute inset-0 rounded-sm bg-orange-500/60 animate-pulse" />
              <span v-if="t.steps[(g - 1) * 4 + (l - 1)]?.active && inLen(t, (g - 1) * 4 + (l - 1)) && (t.steps[(g - 1) * 4 + (l - 1)].ratchet > 1 || t.steps[(g - 1) * 4 + (l - 1)].tie > 0)"
                    class="absolute top-0 right-0 w-1 h-1 rounded-full bg-white/80" />
            </button>
          </div>
        </div>
      </div>
    </div>
    <!-- performance controls (MIDI OUT first): Drum CC 1–4, Dyn, Density, Humanize, Swing -->
    <DrumPerformRow class="pt-1 border-t border-neutral-900" />
  </div>
</template>
