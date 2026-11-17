<script setup>
// The Sequencer's play view (Performance): its banks and the pattern on one row (each active step's
// note), the step sounding lit; Steps, Time and Direction can be set here (right-click: MIDI Learn,
// same targets as the edit panel: seq_steps, seq_time, seq_direction), and Generate with its settings
// (Style, Oct / Range, Arp notes, Density, Melody, Rhythm with Sync / Rot, Vary, P1 / P2 RND% — the edit panel's, saved
// per bank; P1 / P2's CC is chosen in EDIT).
// Otherwise the Rig plays it.
import { computed, ref } from 'vue'
import { useStepSequencerStore } from '@/stores/useStepSequencerStore'
import { useLiveMapStore } from '@/stores/useLiveMapStore'
import { useUiStore } from '@/stores/useUiStore'
import { seqSnapshot, rigReports, rigArmed } from '@/lib/rig-live'
import { useSequencerEngine, NOTE_NAMES, STYLES } from '@/core/engines/sequencer'
import { ARP_MODES } from '@/lib/arp-patterns'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import PlaySlots from './PlaySlots.vue'
import SeqMapModal from '@/components/SeqMapModal.vue'
import PlayChain from './PlayChain.vue'
import { VEL_CLASS, velLevel } from '@/lib/play-colors'

const seqStore = useStepSequencerStore()
// P1 / P2 → Map · Live Instruments: sending (green) or why not (amber); a click opens the routes
const liveMap = useLiveMapStore()
const seqMapOpen = ref(false)
const {
  steps, gridCurrentStep, isPlaying, numSteps, tempoMultiplier, sequenceDirection, TEMPO_MULTIPLIERS, SEQ_DIRECTIONS,
  selectedStyle, chordsEnabled, genDensity, rhythmMode, syncopation, euclidRotation, melodyMode, varyAmount, arpNotes, arpModeForGen,
  param1CC, param2CC, param1Variation, param2Variation, selectedOctave, octaveRange,
  generateSequence, regenerateParams, updateStep, selectedKey, selectedScale, progKey,
} = useSequencerEngine()
// Key: CP — Gen writes in the key of the Chord Prog's chords (detected; shown before the click)
const uiStore = useUiStore()
const cpKey = computed(() => (uiStore.seqGenKeyFromProg ? progKey() : null))
// P1 / P2 rows: the refs themselves (in the template a top-level ref is unwrapped to its number, and
// `p.v.value = …` from the slider then failed — the sliders never moved)
const P_ROWS = [{ n: 1, cc: param1CC, v: param1Variation }, { n: 2, cc: param2CC, v: param2Variation }]
const seg = (on) => ['px-1.5 font-bold', on ? 'bg-amber-600 text-black' : 'text-neutral-500 hover:text-neutral-300']
const isArp = computed(() => selectedStyle.value === 'Arpeggio')
const melodic = computed(() => !isArp.value && !chordsEnabled.value)
const { openMenu } = useMidiContextMenu()
const toggleStep = (i) => updateStep(i, { active: !steps.value[i]?.active })
const stepClass = (s, i) => isPlaying.value && gridCurrentStep.value === i ? 'bg-amber-400 border-amber-200 text-black'
  : s.active && s.notes?.length ? VEL_CLASS[velLevel(s.velocity ?? 100)]
  : s.active ? 'bg-neutral-900 border-neutral-700 text-neutral-200'
  : 'bg-neutral-950 border-neutral-900 text-neutral-700'
const stepTitle = (s, i) => `Step ${i + 1}: ${s.active ? 'on' : 'off'}${s.active && s.notes?.length ? ` · velocity ${s.velocity ?? 100}` : ''} — click: ${s.active ? 'off' : 'on'}`
const DIR_ICON = { up: '↑', down: '↓', 'up-down': '↕', random: 'R' }
const snap = computed(() => seqSnapshot(seqStore.banks, seqStore.activeBankIndex, rigReports.seqPlaying, rigReports.queued.seq ?? rigArmed.seq))
const chainEntries = computed(() => seqStore.chain.map(i => (i !== null && i >= 0 ? 'ABCDEFGH'[i] : null)))
const label = (s) => {
  if (!s?.notes?.length) return ''
  const n = Math.min(...s.notes)
  return NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1) + (s.notes.length > 1 ? `+${s.notes.length - 1}` : '')
}
</script>

<template>
  <div class="flex flex-col gap-3 p-3 min-h-0">
    <PlaySlots :snap="snap" />
    <PlayChain v-if="seqStore.chainEnabled" :entries="chainEntries" :current="isPlaying ? (seqStore.playingChainIndex ?? -1) : -1" />
    <div class="flex flex-wrap items-center gap-3 text-[10px] font-mono">
      <div class="flex items-center gap-1.5" title="Steps (right-click: MIDI Learn)"
           @contextmenu.prevent="openMenu($event, { name: 'seq_steps', label: 'Sequencer: Steps' })">
        <span class="text-neutral-500 uppercase">Steps</span>
        <input v-model.number="numSteps" type="range" min="2" max="64"
               class="w-20 h-1 accent-amber-500 bg-neutral-800 rounded-lg appearance-none cursor-pointer" />
        <span class="w-5 text-right font-bold text-amber-400">{{ numSteps }}</span>
      </div>
      <div class="flex items-center gap-1.5" title="Time: steps per beat (right-click: MIDI Learn)"
           @contextmenu.prevent="openMenu($event, { name: 'seq_time', label: 'Sequencer: Time' })">
        <span class="text-neutral-500 uppercase">Time</span>
        <select v-model="tempoMultiplier"
                class="bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 font-bold text-amber-400 outline-none cursor-pointer [color-scheme:dark]">
          <option v-for="opt in TEMPO_MULTIPLIERS" :key="opt.label" :value="opt">{{ opt.label }}</option>
        </select>
      </div>
      <div class="flex items-center gap-1.5" title="Direction (right-click: MIDI Learn)"
           @contextmenu.prevent="openMenu($event, { name: 'seq_direction', label: 'Sequencer: Direction' })">
        <span class="text-neutral-500 uppercase">Dir</span>
        <div class="flex items-center gap-0.5 rounded bg-black/40 border border-neutral-800 p-0.5">
          <button v-for="dir in SEQ_DIRECTIONS" :key="dir" :title="`Direction: ${dir}`" @click="sequenceDirection = dir"
                  class="px-1.5 rounded font-bold"
                  :class="sequenceDirection === dir ? 'bg-amber-600 text-black' : 'text-neutral-500 hover:text-neutral-300'">{{ DIR_ICON[dir] }}</button>
        </div>
      </div>
    </div>
    <!-- Generate and its settings (the edit panel's, saved per bank) -->
    <div class="flex flex-wrap items-center gap-3 text-[10px] font-mono">
      <button title="Generate: a new pattern by these settings (Vary: the share replaced) — the bank before is kept as a session take"
              class="px-2 py-0.5 rounded bg-amber-500 text-black font-black uppercase hover:bg-amber-300"
              @click="generateSequence">Gen</button>
      <div class="flex items-center gap-1.5"
           :title="`Key — CP: Gen writes in the key of the Chord Prog's chords (detected from the slot, or the chain when on${cpKey ? ': ' + cpKey.label : ''}) · Own: the Sequencer's key (${selectedKey} ${selectedScale})`">
        <span class="text-neutral-500 uppercase">Key</span>
        <div class="flex rounded bg-black/40 border border-neutral-800 p-0.5">
          <button :class="seg(uiStore.seqGenKeyFromProg)" @click="uiStore.seqGenKeyFromProg = true">CP</button>
          <button :class="seg(!uiStore.seqGenKeyFromProg)" @click="uiStore.seqGenKeyFromProg = false">Own</button>
        </div>
        <span class="font-bold text-amber-400">{{ uiStore.seqGenKeyFromProg ? (cpKey ? cpKey.label : '—') : `${selectedKey} ${selectedScale}` }}</span>
      </div>
      <div class="flex items-center gap-1.5" title="Style: what Generate writes (it sets Density and octaves)">
        <span class="text-neutral-500 uppercase">Style</span>
        <select v-model="selectedStyle"
                class="bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 font-bold text-amber-400 outline-none cursor-pointer [color-scheme:dark]">
          <option v-for="st in Object.keys(STYLES)" :key="st" :value="st">{{ st }}</option>
        </select>
      </div>
      <div class="flex items-center gap-1.5" title="Octave: where Generate writes the pattern · Range: the octaves it spans from there (− below, + above)">
        <span class="text-neutral-500 uppercase">Oct</span>
        <select v-model="selectedOctave"
                class="bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 font-bold text-amber-400 outline-none cursor-pointer [color-scheme:dark]">
          <option v-for="o in [0, 1, 2, 3, 4, 5, 6, 7, 8]" :key="o" :value="o">{{ o }}</option>
        </select>
        <select v-model="octaveRange"
                class="bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 font-bold text-amber-400 outline-none cursor-pointer [color-scheme:dark]">
          <option v-for="r in [-3, -2, -1, 0, 1, 2, 3]" :key="r" :value="r">{{ r >= 0 ? '+' + r : r }}</option>
        </select>
      </div>
      <template v-if="isArp">
        <div class="flex items-center gap-1.5" title="Arpeggio: its order, and its notes — 1-3-5 / +7: the key's chord (moved onto each chord when following the Chord Prog) · Scale: every note of the scale">
          <span class="text-neutral-500 uppercase">Arp</span>
          <select v-model="arpModeForGen"
                  class="bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 font-bold text-amber-400 outline-none cursor-pointer [color-scheme:dark]">
            <option v-for="m in ARP_MODES" :key="m" :value="m">{{ m }}</option>
          </select>
          <div class="flex rounded bg-black/40 border border-neutral-800 p-0.5">
            <button v-for="m in [['chord', '1-3-5'], ['chord7', '+7'], ['scale', 'Scl']]" :key="m[0]" :class="seg(arpNotes === m[0])" @click="arpNotes = m[0]">{{ m[1] }}</button>
          </div>
        </div>
      </template>
      <div v-else class="flex items-center gap-1.5" title="Density: the share of steps Generate fills">
        <span class="text-neutral-500 uppercase">Dens</span>
        <input v-model.number="genDensity" type="range" min="0" max="100"
               class="w-16 h-1 accent-amber-500 bg-neutral-800 rounded-lg appearance-none cursor-pointer" />
        <span class="w-7 text-right font-bold text-amber-400">{{ genDensity }}%</span>
      </div>
      <div v-if="melodic" class="flex items-center gap-1.5" title="Melody — Line: a motif repeated with a variant, mostly by step, the tonic chord on the strong steps · Classic: a random note of the scale on each step">
        <span class="text-neutral-500 uppercase">Mel</span>
        <div class="flex rounded bg-black/40 border border-neutral-800 p-0.5">
          <button v-for="m in [['line', 'Line'], ['classic', 'Cls']]" :key="m[0]" :class="seg(melodyMode === m[0])" @click="melodyMode = m[0]">{{ m[1] }}</button>
        </div>
      </div>
      <div v-if="melodic" class="flex items-center gap-1.5" title="Rhythm — Weighted: the strong steps first, Sync moves them to the weak steps · Euclid: Density's onsets spread evenly, Rot turns them · Random: any step">
        <span class="text-neutral-500 uppercase">Rhy</span>
        <div class="flex rounded bg-black/40 border border-neutral-800 p-0.5">
          <button v-for="m in [['weighted', 'Wgt'], ['euclid', 'Eucl'], ['random', 'Rnd']]" :key="m[0]" :class="seg(rhythmMode === m[0])" @click="rhythmMode = m[0]">{{ m[1] }}</button>
        </div>
        <template v-if="rhythmMode === 'weighted'">
          <span class="text-neutral-500 uppercase">Sync</span>
          <input v-model.number="syncopation" type="range" min="0" max="100"
                 class="w-12 h-1 accent-amber-500 bg-neutral-800 rounded-lg appearance-none cursor-pointer" />
          <span class="w-5 text-right font-bold text-amber-400">{{ syncopation }}</span>
        </template>
        <template v-else-if="rhythmMode === 'euclid'">
          <span class="text-neutral-500 uppercase">Rot</span>
          <button class="w-4 rounded bg-neutral-800 text-neutral-300" @click="euclidRotation = euclidRotation - 1">−</button>
          <span class="w-4 text-center font-bold text-amber-400">{{ euclidRotation }}</span>
          <button class="w-4 rounded bg-neutral-800 text-neutral-300" @click="euclidRotation = euclidRotation + 1">+</button>
        </template>
      </div>
      <div class="flex items-center gap-1.5" title="Vary: the share of the pattern Generate replaces (100 = all new); the Rig's Shift + GEN uses it (right-click: MIDI Learn)"
           @contextmenu.prevent="openMenu($event, { name: 'seq_vary', label: 'Sequencer: Vary' })">
        <span class="text-neutral-500 uppercase">Vary</span>
        <input v-model.number="varyAmount" type="range" min="0" max="100" step="5"
               class="w-12 h-1 accent-amber-500 bg-neutral-800 rounded-lg appearance-none cursor-pointer" />
        <span class="w-7 text-right font-bold text-amber-400">{{ varyAmount }}%</span>
      </div>
      <div v-for="p in P_ROWS" :key="p.n"
           class="flex items-center gap-1.5"
           :title="`P${p.n} (CC ${p.cc.value}, chosen in EDIT): Generate takes the preset's value, moved at random by RND% — + up toward 127, − down toward 0`">
        <span class="text-neutral-500 uppercase">P{{ p.n }}</span>
        <input v-model.number="p.v.value" type="range" min="-100" max="100"
               class="w-12 h-1 accent-amber-500 bg-neutral-800 rounded-lg appearance-none cursor-pointer" />
        <span class="w-7 text-right font-bold text-amber-400">{{ p.v.value > 0 ? '+' : '' }}{{ p.v.value }}</span>
        <button type="button" class="px-1 rounded border border-amber-500/50 text-amber-400 font-bold hover:bg-amber-500/10"
                :title="`Regenerate P${p.n} only — the notes and the rhythm stay`" @click.stop="regenerateParams(`p${p.n}`)">↻</button>
      </div>
      <button v-if="liveMap.seqParamsBlock !== 'off'" type="button" class="px-1.5 rounded border font-bold" @click="seqMapOpen = true"
            :class="liveMap.seqParamsBlock ? 'border-amber-500/60 text-amber-400' : 'border-emerald-500/50 text-emerald-300'"
            :title="liveMap.seqParamsHint || `P1 / P2 → Map slots: ${liveMap.seqRoutes.length} track(s) — click to edit`">
        → MAP{{ liveMap.seqParamsBlock ? ' ⚠' : '' }}
      </button>
      <SeqMapModal v-if="seqMapOpen" @close="seqMapOpen = false" />
      <span v-if="liveMap.seqParamsHint" class="basis-full text-amber-400">{{ liveMap.seqParamsHint }}</span>
    </div>
    <!-- the pattern: a click turns a step on / off (its notes kept); the background is its velocity -->
    <div class="grid gap-1 content-start" :style="{ gridTemplateColumns: `repeat(${Math.min(steps.length, 16)}, minmax(0, 1fr))` }">
      <button v-for="(s, i) in steps" :key="i" type="button"
           class="h-6 rounded border flex items-center justify-center text-[10px] font-mono font-bold truncate cursor-pointer hover:brightness-125"
           :class="stepClass(s, i)" :title="stepTitle(s, i)" @click="toggleStep(i)">
        {{ label(s) }}
      </button>
    </div>
  </div>
</template>
