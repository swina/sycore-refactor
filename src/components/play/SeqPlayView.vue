<script setup>
// The Sequencer's play view (Performance): its banks and the pattern on one row (each active step's
// note), the step sounding lit; Steps, Time and Direction can be set here — Style and Oct in the panel's header (right-click: MIDI Learn,
// same targets as the edit panel: seq_steps, seq_time, seq_direction), and Generate with its settings
// (Style, Oct / Range, Arp notes, Density, Melody, Rhythm with Sync / Rot, Vary, P1 / P2 RND% — the edit panel's, saved
// per bank; P1 / P2's CC is chosen in EDIT).
// Otherwise the Rig plays it.
import { computed, ref, watch } from 'vue'
import { useSeqLaneStore } from '@/stores/useStepSequencerStore'
import { SEQ_LANE_CFG, learnName, learnLabel } from '@/lib/seq-lanes'
import { useLiveMapStore } from '@/stores/useLiveMapStore'
import { useUiStore } from '@/stores/useUiStore'
import { useSeqDeviceParamsStore } from '@/stores/useSeqDeviceParamsStore'
import { seqSnapshot, rigReports, rigArmed } from '@/lib/rig-live'
import { useSequencerEngine, NOTE_NAMES, SCALES, OWN_GEN_STYLES } from '@/core/engines/sequencer'
import { transposeDiatonic } from '@/lib/seq-gen/harmony'
import { ARP_MODES } from '@/lib/arp-patterns'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import PlaySlots from './PlaySlots.vue'
import SeqMapModal from '@/components/SeqMapModal.vue'
import PlayChain from './PlayChain.vue'
import { VEL_CLASS, velLevel } from '@/lib/play-colors'
import { seqPlayView } from '@/lib/seq-play-view'

// the lane shown (lib/seq-lanes.ts; the panel mounts this per lane)
const props = defineProps({ lane: { type: String, default: 'main' } })
const lane = SEQ_LANE_CFG[props.lane] ? props.lane : 'main'
const isMain = lane === 'main'
const L = (name) => learnName(lane, name)
const LL = (label) => learnLabel(lane, label)
const seqStore = useSeqLaneStore(lane)
// P1 / P2 → Map · Live Instruments: sending (green) or why not (amber); a click opens the routes
const liveMap = useLiveMapStore()
const seqMapOpen = ref(false)
const devParams = useSeqDeviceParamsStore()
const {
  steps, gridCurrentStep, isPlaying, numSteps, tempoMultiplier, sequenceDirection, TEMPO_MULTIPLIERS, SEQ_DIRECTIONS,
  selectedStyle, chordsEnabled, genDensity, rhythmMode, syncopation, euclidRotation, melodyMode, varyAmount, arpNotes, arpModeForGen,
  param1CC, param2CC, param1Variation, param2Variation,
  generateSequence, regenerateParams, updateStep, selectedKey, selectedScale, progKey,
} = useSequencerEngine(lane)
// Key: CP — Gen writes in the key of the Chord Prog's chords (detected; shown before the click)
const uiStore = useUiStore()
const cpKey = computed(() => (uiStore.seqGenKeyFromProg ? progKey() : null))
// P1 / P2 rows: the refs themselves (in the template a top-level ref is unwrapped to its number, and
// `p.v.value = …` from the slider then failed — the sliders never moved)
const P_ROWS = [{ n: 1, cc: param1CC, v: param1Variation }, { n: 2, cc: param2CC, v: param2Variation }]
const seg = (on) => ['px-1.5 font-bold', on ? 'bg-amber-600 text-black' : 'text-neutral-500 hover:text-neutral-300']
const isArp = computed(() => selectedStyle.value === 'Arpeggio')
const ownGen = computed(() => OWN_GEN_STYLES.includes(selectedStyle.value))
const melodic = computed(() => !ownGen.value && !chordsEnabled.value)
const { openMenu } = useMidiContextMenu()
const toggleStep = (i) => updateStep(i, { active: !steps.value[i]?.active })
const stepClass = (s, i) => isPlaying.value && gridCurrentStep.value === i ? 'bg-amber-400 border-amber-200 text-black'
  : s.active && s.notes?.length ? VEL_CLASS[velLevel(s.velocity ?? 100)]
  : s.active ? 'bg-neutral-900 border-neutral-700 text-neutral-200'
  : 'bg-neutral-950 border-neutral-900 text-neutral-700'
const stepTitle = (s, i) => `Step ${i + 1}: ${s.active ? 'on' : 'off'}${s.active && s.notes?.length ? ` · velocity ${s.velocity ?? 100}` : ''} — click: ${s.active ? 'off' : 'on'}`
const DIR_ICON = { up: '↑', down: '↓', 'up-down': '↕', random: 'R' }
// the Rig's reports are the Main lane's (Bass / Arp: their own playing state, nothing queued)
const snap = computed(() => isMain
  ? seqSnapshot(seqStore.banks, seqStore.activeBankIndex, rigReports.seqPlaying, rigReports.queued.seq ?? rigArmed.seq)
  : seqSnapshot(seqStore.banks, seqStore.activeBankIndex, isPlaying.value, null))
const chainEntries = computed(() => seqStore.chain.map(i => (i !== null && i >= 0 ? 'ABCDEFGH'[i] : null)))
// Step view (seq-play-view.ts; the selector, SeqViewSelect, sits in the panel's header) — 'notes': every
// step with its note name · 'lanes': one row of up to 16 cells, each note a bar at its pitch, the note's
// name and the step's velocity under it. In lanes the pattern is at most 16 steps (the STEPS slider stops
// there; a longer one is cut to 16 on entering).
const stepView = seqPlayView
const lanes = computed(() => stepView.value === 'lanes')
const stepsMax = computed(() => (lanes.value ? 16 : 64))
watch([stepView, numSteps], () => { if (lanes.value && numSteps.value > 16) numSteps.value = 16 }, { immediate: true })
const laneSteps = computed(() => steps.value.slice(0, 16).map((s, i) => ({ s, i })))
// the pitch range of the whole pattern (not of the page: bars don't jump when paging)
// (held while a bar is dragged, so the bars don't move under the pointer)
const livePitchRange = computed(() => {
  const all = steps.value.flatMap(s => s.notes ?? [])
  return all.length ? [Math.min(...all), Math.max(...all)] : [60, 60]
})
const pitchRange = computed(() => drag.value?.range ?? livePitchRange.value)
const barTop = (n) => {
  const [lo, hi] = pitchRange.value
  const pct = hi === lo ? 50 - (n - lo) * 5 : 85 - ((n - lo) / (hi - lo)) * 70
  return `${Math.max(4, Math.min(96, pct))}%`
}
// Drag a step up / down: its notes move by degrees of the Sequencer's key (Gen's key, also with Key: CP), one per DRAG_PX
const DRAG_PX = 8
const drag = ref(null)
const keyPc = () => Math.max(0, NOTE_NAMES.indexOf(selectedKey.value))
function onLaneDown(e, i) {
  const s = steps.value[i]
  if (!s?.notes?.length) return
  e.currentTarget?.setPointerCapture?.(e.pointerId)
  drag.value = { i, y: e.clientY, notes: [...s.notes], shift: 0, range: [...livePitchRange.value] }
}
function onLaneMove(e) {
  const d = drag.value
  if (!d) return
  const shift = Math.round((d.y - e.clientY) / DRAG_PX)
  if (shift === d.shift) return
  d.shift = shift
  const scale = SCALES[selectedScale.value] ?? SCALES['Major']
  const notes = d.notes.map(n => Math.max(0, Math.min(127, transposeDiatonic(n, shift, keyPc(), scale))))
  updateStep(d.i, { notes })
}
const onLaneUp = () => { drag.value = null }
// Velocity: the meter under each step — click / drag across it (left 1, right 127)
const velDrag = ref(null)
function setVelFrom(e, i) {
  const r = e.currentTarget.getBoundingClientRect()
  const f = r.width ? (e.clientX - r.left) / r.width : 0
  updateStep(i, { velocity: Math.max(1, Math.min(127, Math.round(f * 127))) })
}
function onVelDown(e, i) { e.currentTarget?.setPointerCapture?.(e.pointerId); velDrag.value = i; setVelFrom(e, i) }
function onVelMove(e, i) { if (velDrag.value === i) setVelFrom(e, i) }
const onVelUp = () => { velDrag.value = null }
const VEL_FILL = { low: 'bg-emerald-500', mid: 'bg-orange-500', high: 'bg-red-500' }
const noteName = (n) => NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1)
const BAR_OPACITY = { low: 0.55, mid: 0.8, high: 1 }
const laneCellClass = (s, i) => isPlaying.value && gridCurrentStep.value === i ? 'bg-amber-500/40 border-amber-300/70'
  : s.active ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-950 border-neutral-900'
const barClass = (s, i) => isPlaying.value && gridCurrentStep.value === i ? 'bg-amber-50 shadow-[0_0_6px_rgba(255,236,180,0.8)]'
  : s.active ? 'bg-amber-400' : 'bg-neutral-700'
const bankLetter = computed(() => 'ABCDEFGH'[seqStore.activeBankIndex] ?? '')
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
           @contextmenu.prevent="openMenu($event, { name: L('steps'), label: LL('Steps') })">
        <span class="text-neutral-500 uppercase">Steps</span>
        <input v-model.number="numSteps" type="range" min="2" :max="stepsMax"
               class="w-20 h-1 accent-amber-500 bg-neutral-800 rounded-lg appearance-none cursor-pointer" />
        <span class="w-5 text-right font-bold text-amber-400">{{ numSteps }}</span>
      </div>
      <div class="flex items-center gap-1.5" title="Time: steps per beat (right-click: MIDI Learn)"
           @contextmenu.prevent="openMenu($event, { name: L('time'), label: LL('Time') })">
        <span class="text-neutral-500 uppercase">Time</span>
        <select v-model="tempoMultiplier"
                class="bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 font-bold text-amber-400 outline-none cursor-pointer [color-scheme:dark]">
          <option v-for="opt in TEMPO_MULTIPLIERS" :key="opt.label" :value="opt">{{ opt.label }}</option>
        </select>
      </div>
      <div class="flex items-center gap-1.5" title="Direction (right-click: MIDI Learn)"
           @contextmenu.prevent="openMenu($event, { name: L('direction'), label: LL('Direction') })">
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
      <div v-else-if="!ownGen" class="flex items-center gap-1.5" title="Density: the share of steps Generate fills">
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
           @contextmenu.prevent="openMenu($event, { name: L('vary'), label: LL('Vary') })">
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
      <button v-if="isMain" type="button" class="px-1.5 rounded border font-bold" @click="seqMapOpen = true"
            :class="liveMap.seqParamsBlock && liveMap.seqParamsBlock !== 'off' ? 'border-amber-500/60 text-amber-400' : liveMap.seqParamsBlock !== 'off' || devParams.count ? 'border-emerald-500/50 text-emerald-300' : 'border-neutral-800 text-neutral-400 hover:text-white'"
            :title="liveMap.seqParamsHint || `P1 / P2 → Map slots: ${liveMap.seqRoutes.length} track(s) · MIDI Flow devices with their own CC: ${devParams.count} — click to edit`">
        → MAP{{ devParams.count ? ` · ${devParams.count} dev` : '' }}{{ liveMap.seqParamsBlock && liveMap.seqParamsBlock !== 'off' ? ' ⚠' : '' }}
      </button>
      <SeqMapModal v-if="seqMapOpen" @close="seqMapOpen = false" />
    </div>
    <!-- lanes: one cell per step, each note a bar at its pitch; under it the note, the velocity meter, M (mute) -->
    <div v-if="lanes" class="flex items-start gap-1">
      <span class="w-4 shrink-0 h-14 flex items-center justify-center text-[11px] font-mono font-bold text-amber-500/80">{{ bankLetter }}</span>
      <div class="flex-1 grid gap-1" :style="{ gridTemplateColumns: `repeat(${laneSteps.length || 1}, minmax(0, 1fr))` }">
        <div v-for="c in laneSteps" :key="c.i" class="flex flex-col gap-0.5 min-w-0">
          <div data-lane-step
               class="relative h-14 rounded border touch-none select-none"
               :class="[laneCellClass(c.s, c.i), c.s.notes?.length ? 'cursor-ns-resize hover:brightness-125' : '']"
               :title="`Step ${c.i + 1}${c.s.notes?.length ? `: ${label(c.s)} — drag up / down to change the note (by the key's degrees)` : ': no note'}`"
               @pointerdown="onLaneDown($event, c.i)" @pointermove="onLaneMove" @pointerup="onLaneUp" @pointercancel="onLaneUp">
            <span v-for="(n, k) in (c.s.notes ?? [])" :key="k"
                  class="absolute left-[12%] right-[12%] h-[3px] -translate-y-1/2 rounded-full pointer-events-none"
                  :class="barClass(c.s, c.i)"
                  :style="{ top: barTop(n), opacity: c.s.active ? BAR_OPACITY[velLevel(c.s.velocity ?? 100)] : 1 }" />
          </div>
          <span data-lane-note class="h-3 text-center text-[9px] font-mono font-bold leading-3 truncate"
                :class="c.s.active ? 'text-amber-300' : 'text-neutral-600'"
                :title="(c.s.notes ?? []).map(noteName).join(' ')">{{ label(c.s) || '·' }}</span>
          <div data-lane-vel
               class="relative h-2.5 rounded-sm bg-neutral-900 border border-neutral-800 overflow-hidden cursor-ew-resize touch-none"
               :title="`Step ${c.i + 1}: velocity ${c.s.velocity ?? 100} — click / drag across to set`"
               @pointerdown="onVelDown($event, c.i)" @pointermove="onVelMove($event, c.i)" @pointerup="onVelUp" @pointercancel="onVelUp">
            <div class="absolute inset-y-0 left-0 pointer-events-none" :class="[VEL_FILL[velLevel(c.s.velocity ?? 100)], c.s.active ? '' : 'opacity-40']"
                 :style="{ width: `${((c.s.velocity ?? 100) / 127) * 100}%` }" />
          </div>
          <button type="button" data-lane-mute
                  class="h-3.5 rounded text-[8px] font-mono font-bold leading-none border"
                  :class="c.s.active ? 'border-neutral-800 text-neutral-500 hover:text-neutral-200' : 'bg-neutral-700 border-neutral-600 text-neutral-200'"
                  :title="`Step ${c.i + 1}: ${c.s.active ? 'on — click: mute' : 'muted — click: unmute'}`" @click="toggleStep(c.i)">M</button>
        </div>
      </div>
    </div>
    <!-- the pattern: a click turns a step on / off (its notes kept); the background is its velocity -->
    <div v-else class="grid gap-1 content-start" :style="{ gridTemplateColumns: `repeat(${Math.min(steps.length, 16)}, minmax(0, 1fr))` }">
      <button v-for="(s, i) in steps" :key="i" type="button"
           class="h-6 rounded border flex items-center justify-center text-[10px] font-mono font-bold truncate cursor-pointer hover:brightness-125"
           :class="stepClass(s, i)" :title="stepTitle(s, i)" @click="toggleStep(i)">
        {{ label(s) }}
      </button>
    </div>
  </div>
</template>
