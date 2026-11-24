<script setup>
import { ref, computed, provide } from 'vue'
import ResizeHandles from '@/components/ui/ResizeHandles.vue'
import PlayEditToggle from '@/components/ui/PlayEditToggle.vue'
import RigControlSections from '@/components/RigControlSections.vue'
import ChordNowDisplay from '@/components/ChordNowDisplay.vue'
import RigSongsView from '@/components/RigSongsView.vue'
import { materialPending } from '@/core/sessions'
import { rigControlsHost, RIG_CONTROLS_CTX } from '@/lib/rig-controls-host'
import { usePlayView } from '@/composables/usePlayView'
import { PLAY_LED_CLASS } from '@/lib/play-colors'
import { FADE_BARS } from '@/lib/rig-fades'
import { rigSlotParam } from '@/lib/rig-actions'
import { Grid3X3, Play, Square } from 'lucide-vue-next'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import { SLOT_LABELS, SECTION_COUNT, SPLIT_COUNT, TRIGGER_SYNC_OPTIONS, slotState, slotProgress, setTrackOption, toggleSolo, toggleLaneMute, selectSplit, lpGridNote, lpSideNote } from '@/lib/rig-controller'
import { isLiveRow, RIG_ARP_MODES, intensityMode, rigFollowPlay, rigLaneRows, rowLane, liveAppSource, arpeggiatorRow } from '@/lib/rig-live'
import { midiService } from '@/core/midi/midi-service'
import { roleId } from '@/lib/rig-midimix'
import { toggleLabel, toggleShortLabel, RIG_TOGGLE_SLOTS } from '@/lib/rig-toggle'
import { djFilter, djFilterCc } from '@/lib/dj-filter'
import { clipSummary } from '@/lib/rig-captures'
import { countIn } from '@/lib/count-in'
import { useRigEngine } from '@/core/engines/rig'
// Rig Controller — the view: its logic and state are the Rig engine's (core/engines/rig.js),
// which keeps playing (songs, pads, controllers) with this panel closed.

const {
  uiStore,
  s,
  focusApp,
  flowConfig,
  FLOW_CONFIGS,
  mode,
  live,
  drumStore,
  captures,
  onCapt,
  onCapturePadClick,
  captSetName,
  captSetPick,
  onSaveSet,
  onLoadSet,
  onDeleteSet,
  playOn,
  setLaneRow,
  knobLabel,
  knobValue,
  knobTitle,
  songLib,
  songRun,
  densityMenu,
  muteScopes,
  appCables,
  toggleScope,
  clearScope,
  intensityModes,
  setIntensityMode,
  mixer,
  fadeSettings,
  fade,
  fadesOpen,
  chValue,
  fadeLanes,
  chFadeOf,
  resetAllVolumes,
  velocityReadout,
  togglePlay,
  tap,
  tempoRound,
  tempoStep,
  tempoDrag,
  holding,
  holdStart,
  holdEnd,
  doPanic,
  doInt,
  onSlotDown,
  syncSettings,
  padState,
  onSlotUp,
  onGenerate,
  onRowFill,
  onFill,
  onSection,
  repeaterOn,
  repeaterOff,
  toggleSeqFree,
  toggleShift,
  muteLane,
  toggleGenMode,
  focused,
  setFocus,
  anySolo,
  cycleSync,
  learnMenu,
  learnedRing,
  tplLeds,
  tplDevice,
  tplMsg,
  refreshInputs,
  mappedDevices,
  tplDevices,
  tplCount,
  exportTemplate,
  importTemplate,
  clearTemplate,
  isRigApp,
  OPTION_GROUPS,
  optHint,
  SYNC_SHORT,
  rowBadge,
  queueOrder,
  lanePageOffset,
  chainOn,
  toggleChain,
  songFilled,
  songLanesOn,
  songChains,
  songChordCounts,
  songNameKeys,
  songIdle,
  songOwn,
  songCapture,
  playSong,
  stopSong,
  holdSong,
  jumpSong,
  SLOT_CLASS,
  LED_CLASS,
  btn,
  btnIdle,
  btnOn,
  fillClass,
  lpTop,
  lpPad,
  lpSide,
  lpTopDown,
  lpTopUp,
  toggleFollowPlay,
  toggleAutoFill,
  autoFillEvery,
  cycleAutoFillEvery,
  lpPadDown,
  lpPadUp,
  lpSideDown,
  lpSideUp,
  keyText,
  onKeyShift,
  onKeyMode,
  lpOutput,
  lpRig,
  mixPage,
  mixStrips,
  mixOutput,
  mixRig,
  mixMap,
  mixLastOut,
  mixLastIn,
  MIX_LEARN_ROWS,
  MIX_MASTER_ROLES,
  mixLearn,
  mixLearnRole,
  mixRoleLabel,
  mixRoleLearned,
  mixMapReset,
  toggleBindings,
  learningToggle,
  TOGGLE_SLOT_LABEL,
  clearToggle,
  syncButton,
  view,
} = useRigEngine()

const emit = defineEmits(['close'])
const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
  storageKey: 'SYCORE_POS_RIG_CONTROLLER',
  minimizeLabel: 'Rig Controller',
  initialWidth: 1040,
  initialHeight: 660,
  minWidth: 760,
  minHeight: 480,
  zIndex: 160,
  panelId: 'rig-controller',
})

// Performance (play view): the Launchpad layout filling the panel, in the play views' amber scheme
// (dark: filled · blinking: queued / armed · full: playing), labels on; the mode bar folded (clock,
// tempo and position are in the toolbar). EDIT: the views as usual.
const { play } = usePlayView('rig-controller')
const shownView = computed(() => play.value ? 'launchpad' : view.value)
const ledClass = (c) => (play.value ? PLAY_LED_CLASS : LED_CLASS)[c]
const showLabels = ref(true)
// Knob drag: vertical mouse movement changes the value (0–127)
function knobDrag(e, knob) {
  const startY = e.clientY
  const start = knob.get()
  const move = ev => knob.set(Math.max(0, Math.min(127, Math.round(start + (startY - ev.clientY) * 0.8))))
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
const knobAngle = v => -135 + (v / 127) * 270
const arcPath = v => {
  const a = (knobAngle(v) - 90) * Math.PI / 180
  const a0 = (-135 - 90) * Math.PI / 180
  const r = 15, cx = 18, cy = 18
  const large = (v / 127) * 270 > 180 ? 1 : 0
  return `M${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`
}

// The controls' sections (RigControlSections): here in the Rig layout, and in the Rig Controls panel
// (Performance), teleported there while it is open.
provide(RIG_CONTROLS_CTX, {
  s, live, focused, btn, btnIdle, btnOn, tap, cycleSync, SYNC_SHORT, syncButton, fadesOpen, isRigApp, learnMenu, tplDevice, refreshInputs, tplDevices, mappedDevices, tplLeds, tplCount, exportTemplate, importTemplate, clearTemplate, tplMsg, onFill, repeaterOn, repeaterOff, toggleSeqFree, chainOn, toggleChain, setFocus, learnedRing, onKeyShift, tempoStep, tempoDrag, tempoRound, drumStore, fillClass, toggleAutoFill, autoFillEvery, cycleAutoFillEvery, rigFollowPlay, toggleFollowPlay, keyText, onKeyMode, knobLabel, knobTitle, knobValue, densityMenu, toggleGenMode, holding, holdStart, holdEnd, doPanic, doInt, toggleShift,
})
</script>

<template>
  <div class="bg-neutral-950 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden relative" :style="panelStyle" v-show="!isMinimized" @mousedown.capture="bringToFront">
    <!-- Header -->
    <div class="flex items-center justify-between gap-3 px-4 py-2 bg-gradient-to-b from-white/5 to-transparent shrink-0 touch-none cursor-grab active:cursor-grabbing select-none" @pointerdown="onDragStart">
      <div class="flex items-center gap-3">
        <div class="p-1.5 bg-amber-500/20 rounded-lg border border-amber-500/20">
          <Grid3X3 class="w-4 h-4 text-amber-400" />
        </div>
        <h2 class="text-sm font-black text-white tracking-[0.1em] uppercase">Rig Controller</h2>
        <span @mousedown.stop><PlayEditToggle panel-id="rig-controller" /></span>
        <span v-if="live && !play" class="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-bold uppercase tracking-wider text-emerald-300" title="Chord, Drum, Seq, Bass and Arp rows drive the real apps; the other controls are still simulated">Live · all rows connected</span>
        <span v-else-if="!live" class="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[9px] font-bold uppercase tracking-wider text-amber-300">Simulation · no MIDI</span>
      </div>
      <div class="flex items-center gap-2" @mousedown.stop>
        <div v-if="!play" class="flex rounded-md border border-white/10 overflow-hidden">
          <button v-for="v in [['rig', 'Rig layout'], ['songs', 'Songs'], ['launchpad', 'Launchpad Mini MK1'], ['midimix', 'AKAI MIDImix']]" :key="v[0]"
                  class="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                  :class="view === v[0] ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-white hover:bg-white/5'"
                  @click="view = v[0]">{{ v[1] }}</button>
        </div>
        <MacOsButtons @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize" />
      </div>
    </div>

    <!-- Mode bar: LIVE (real apps and clock) or SIM (simulated Live) -->
    <div v-if="!play" class="flex items-center gap-3 px-4 py-1.5 border-y border-white/5 bg-white/[0.02] text-[10px] text-neutral-400 shrink-0">
      <div class="flex rounded border border-white/10 overflow-hidden">
        <button v-for="m in [['live', 'Live'], ['sim', 'Sim']]" :key="m[0]" class="px-2 py-0.5 font-bold uppercase"
                :class="mode === m[0] ? (m[0] === 'live' ? 'bg-emerald-500/80 text-black' : 'bg-amber-500/70 text-black') : 'text-neutral-400 hover:text-white'"
                :title="m[0] === 'live' ? 'Drive the real Chord Prog, Drum Machine and Sequencer, on the real clock' : 'A simulated rig and clock: try the track options'"
                @click="mode = m[0]">{{ m[1] }}</button>
      </div>
      <button class="px-2 py-0.5 rounded border font-bold uppercase"
              :class="lpRig ? (lpOutput ? 'bg-emerald-500/80 border-emerald-300 text-black' : 'bg-amber-500/40 border-amber-300 text-amber-50') : 'border-white/15 text-neutral-300 hover:bg-white/10'"
              :title="lpRig ? (lpOutput ? `Rig mode on ${lpOutput.name}: its buttons drive the rig, its LEDs show it. Off: its usual mappings come back` : 'Rig mode on, no Launchpad found') : 'Use the Launchpad Mini MK1 as the rig controller (its usual mappings are paused meanwhile)'"
              @click="lpRig = !lpRig">Launchpad {{ lpRig ? (lpOutput ? 'Rig ●' : 'Rig · not found') : 'Rig off' }}</button>
      <button class="px-2 py-0.5 rounded border font-bold uppercase"
              :class="mixRig ? (mixOutput ? 'bg-emerald-500/80 border-emerald-300 text-black' : 'bg-amber-500/40 border-amber-300 text-amber-50') : 'border-white/15 text-neutral-300 hover:bg-white/10'"
              :title="mixRig ? (mixOutput ? `Rig mode on ${mixOutput.name}: its pots, faders and buttons drive the rig (pickup), its LEDs show it. Off: its usual mappings come back` : 'Rig mode on, no MIDImix found') : 'Use the AKAI MIDImix as the rig mixer (its usual mappings are paused meanwhile)'"
              @click="mixRig = !mixRig">MIDImix {{ mixRig ? (mixOutput ? 'Rig ●' : 'Rig · not found') : 'Rig off' }}</button>
      <span class="flex items-center gap-1">
        <span class="uppercase tracking-widest text-neutral-500" title="Hardware buttons that switch Rig mode: All = both controllers (the ones that were on), LP = the Launchpad only, Mix = the MIDImix only">Rig keys</span>
        <template v-for="slot in RIG_TOGGLE_SLOTS" :key="slot">
          <button class="px-1.5 py-0.5 rounded border font-bold"
                  :class="learningToggle === slot ? 'bg-amber-500 border-amber-300 text-black animate-pulse' : toggleBindings[slot] ? 'border-emerald-400/50 text-emerald-300 hover:bg-white/10' : 'border-white/15 text-neutral-400 hover:bg-white/10'"
                  :title="`${{ all: 'Both controllers', lp: 'Launchpad only', mix: 'MIDImix only' }[slot]} · ${toggleBindings[slot] ? toggleLabel(toggleBindings[slot]) + ' · click to learn again' : 'click, then press a button'}`"
                  @click="learningToggle = learningToggle === slot ? null : slot">{{ TOGGLE_SLOT_LABEL[slot] }} {{ learningToggle === slot ? '…' : toggleShortLabel(toggleBindings[slot]) }}</button>
          <button v-if="toggleBindings[slot] && learningToggle !== slot" class="px-0.5 text-neutral-500 hover:text-white" :title="`Forget the ${TOGGLE_SLOT_LABEL[slot]} Rig key`" @click="clearToggle(slot)">✕</button>
        </template>
      </span>
      <span class="uppercase tracking-widest text-neutral-500">{{ live ? s.clock.source : 'Simulated Live' }}</span>
      <button class="flex items-center gap-1 px-2 py-0.5 rounded border font-bold uppercase"
              :class="s.clock.running ? 'bg-emerald-500/80 border-emerald-300 text-black' : 'border-white/15 text-neutral-200 hover:bg-white/10'"
              @click="togglePlay">
        <component :is="s.clock.running ? Square : Play" class="w-3 h-3" /> {{ s.clock.running ? 'Stop' : 'Play' }}
      </button>
      <label v-if="!live" class="flex items-center gap-1">BPM
        <input v-model.number="s.clock.bpm" type="number" min="40" max="240" step="0.5" class="w-16 bg-black/40 border border-white/10 rounded px-1 py-0.5 text-white font-mono" />
      </label>
      <span v-else class="font-mono text-white">{{ s.clock.bpm.toFixed(1) }} BPM</span>
      <span class="font-mono text-white">{{ s.clock.bar }}.{{ s.clock.beat }}.{{ (s.clock.step % 4) + 1 }}</span>
      <span v-if="live" class="ml-auto truncate">Pads: Latch on the track's Trigger sync, on Live's grid. Live stopped: a pad arms its slot, it starts on Live's Play; Live's Stop stops all. Seq switches at the end of its pattern. Drum and Bass: independent parts of the Drum Machine. Arp: pads pick its mode.</span>
      <span v-else class="ml-auto truncate">The controller only shows SY.CORE's state; each track's options decide how and when its slots start.</span>
    </div>

    <div :class="['flex-1 text-xs min-h-0', play ? 'overflow-hidden p-3 flex flex-col gap-2' : 'overflow-auto p-4']">
      <!-- ═══════════ RIG LAYOUT ═══════════ -->
      <div v-if="shownView === 'rig'" class="grid gap-3" style="grid-template-columns: 220px minmax(420px, 1fr) 230px">
        <!-- Left column -->
        <div class="space-y-3">
          <RigControlSections only="transport" />

          <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Sections (Song)</h3>
            <div class="grid grid-cols-4 gap-1.5">
              <button v-for="i in SECTION_COUNT" :key="i"
                      :class="[btn, s.section === i - 1 ? btnOn : s.queuedSection === i - 1 ? 'bg-amber-400/50 border-amber-300 text-white animate-pulse' : btnIdle]"
                      @contextmenu="learnMenu($event, `rig_section_${i}`, `Section ${i}`)"
                      @click="onSection(i - 1)">{{ i }}</button>
            </div>
          </section>

          <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2" title="Row S in Captures mode (S·CAP): Capt records, a pad plays its capture. Sets: the 8 pads saved under a name">Captures (Live Perf)</h3>
            <div class="grid grid-cols-4 gap-1.5 mb-2">
              <button v-for="i in 8" :key="i"
                      :class="[btn, captures.state.recording && captures.state.selected === i - 1 ? 'bg-red-500/50 border-red-300 text-white animate-pulse'
                        : captures.state.play[i - 1] === 'playing' ? btnOn
                        : captures.state.play[i - 1] !== 'idle' ? 'bg-amber-400/50 border-amber-300 text-white animate-pulse'
                        : captures.state.clips[i - 1] ? 'bg-amber-500/20 border-amber-400/50 text-amber-100'
                        : captures.state.selected === i - 1 ? 'bg-red-500/20 border-red-400/50 text-red-100' : btnIdle]"
                      :title="`S${i}: ${clipSummary(captures.state.clips[i - 1])} · Shift-click: clear`"
                      @click="onCapturePadClick($event, i - 1)">{{ i }}</button>
            </div>
            <button :class="[btn, 'w-full mb-2', captures.state.recording ? 'bg-red-500/60 border-red-300 text-white animate-pulse' : btnIdle]" @click="onCapt">
              {{ captures.state.recording ? 'Capt ● stop' : 'Capt' }}</button>
            <div class="flex gap-1 mb-1">
              <input v-model="captSetName" placeholder="Set name" class="flex-1 min-w-0 bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white" @keydown.enter="onSaveSet" />
              <button :class="[btn, btnIdle, 'px-2']" title="Save the 8 pads as a set (same name: updated)" @click="onSaveSet">Save</button>
            </div>
            <div class="flex gap-1">
              <select v-model="captSetPick" class="flex-1 min-w-0 bg-black/40 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white">
                <option value="">{{ captures.state.sets.length ? 'Sets…' : 'No sets saved' }}</option>
                <option v-for="st in captures.state.sets" :key="st.name" :value="st.name">{{ st.name }}{{ st.name === captures.state.setName ? ' ●' : '' }}</option>
              </select>
              <button :class="[btn, btnIdle, 'px-2']" :disabled="!captSetPick" title="Load onto the pads (the pads' clips before are kept in Session takes › Capt)" @click="onLoadSet">Load</button>
              <button :class="[btn, btnIdle, 'px-2']" :disabled="!captSetPick" title="Delete the set" @click="onDeleteSet">✕</button>
            </div>
          </section>

          <RigControlSections only="template" />

          <!-- Flow, splits and lane mutes: not connected to the apps yet — SIM only -->
          <section v-if="!live" class="p-3 rounded-lg bg-white/[0.03] border border-white/10 space-y-2">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Rig</h3>
            <select v-model="flowConfig" class="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-white" @change="s.display = `Flow: ${flowConfig}`">
              <option v-for="c in FLOW_CONFIGS" :key="c">{{ c }}</option>
            </select>
            <div class="grid grid-cols-4 gap-1.5">
              <button v-for="i in SPLIT_COUNT" :key="i" :class="[btn, s.split === i - 1 ? btnOn : btnIdle]" @click="selectSplit(s, i - 1)">Sp {{ i }}</button>
            </div>
            <div class="flex items-center justify-between text-[10px] text-neutral-500">
              <span>Lane mute {{ lanePageOffset + 1 }}–{{ lanePageOffset + 8 }}</span><span v-if="s.shift" class="text-amber-300">⇧</span>
            </div>
            <div class="grid grid-cols-8 gap-1">
              <button v-for="i in 8" :key="i" class="h-6 rounded border text-[9px] font-bold"
                      :class="s.laneMutes[i - 1 + lanePageOffset] ? 'bg-red-600 border-red-400 text-white' : 'bg-white/[0.04] border-white/10 text-neutral-400'"
                      @click="toggleLaneMute(s, i - 1 + lanePageOffset)">{{ i + lanePageOffset }}</button>
            </div>
          </section>
        </div>

        <!-- Center: slot grid + display -->
        <div class="space-y-3">
          <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Slot grid (A–H)</h3>
            <div class="space-y-1.5">
              <div v-for="a in s.apps" :key="a.id" class="flex items-center gap-1.5" :class="a.muted || (anySolo && !a.solo) || (live && !isLiveRow(a.id)) ? 'opacity-40' : ''"
                   :title="live && !isLiveRow(a.id) ? `${a.label}: not connected yet (SIM only)` : ''">
                <button class="w-16 text-left leading-tight" :title="'Track options: ' + rowBadge(a)" @click="focusApp = a.id">
                  <span class="block text-[11px] font-bold" :class="focusApp === a.id ? 'text-amber-300' : 'text-neutral-300'">{{ a.label }}</span>
                  <span class="block text-[8px] font-mono text-neutral-500 truncate">{{ rowBadge(a) }}</span>
                </button>
                <button v-for="(l, i) in SLOT_LABELS" :key="l"
                        class="relative w-9 h-9 rounded-md border text-[11px] font-black transition-colors overflow-hidden"
                        :class="[SLOT_CLASS[padState(a, i)], isRigApp(a.id) ? learnedRing(rigSlotParam(a.id, i)) : '']"
                        :title="`${a.label} ${l}${live && arpeggiatorRow(a.id) ? ` (${RIG_ARP_MODES[i]})` : ''}: ${slotState(a, i)} · ${a.lengths[i]} bar${a.lengths[i] > 1 ? 's' : ''}${isRigApp(a.id) ? ' · right-click: MIDI Learn' : ''}`"
                        @contextmenu="isRigApp(a.id) && learnMenu($event, rigSlotParam(a.id, i), `${a.label} slot ${l}`)"
                        @pointerdown="onSlotDown(a.id, i)" @pointerup="onSlotUp(a.id, i)" @pointerleave="a.held !== null && onSlotUp(a.id, i)">
                  {{ l }}
                  <span v-if="a.filled[i] && a.lengths[i] > 1" class="absolute top-0 right-0.5 text-[7px] font-bold opacity-70">{{ a.lengths[i] }}</span>
                  <span v-if="queueOrder(a, i)" class="absolute top-0 left-0.5 text-[7px] font-bold">#{{ queueOrder(a, i) }}</span>
                  <span v-if="a.cursor === i && a.opts.press === 'holdMotion'" class="absolute inset-0 rounded-md ring-2 ring-sky-400 pointer-events-none" />
                  <span v-if="a.playing === i" class="absolute left-0 bottom-0 h-1 bg-black/50" :style="{ width: `${slotProgress(a, i) * 100}%` }" />
                </button>
                <button :class="[btn, a.muted ? 'bg-red-600 border-red-400 text-white' : btnIdle, 'ml-1', isRigApp(a.id) ? learnedRing(`rig_mute_${a.id}`) : '']" @click="muteLane(a.id)"
                        @contextmenu="isRigApp(a.id) && learnMenu($event, `rig_mute_${a.id}`, `${a.label} Mute`)">M</button>
                <button :class="[btn, a.solo ? 'bg-sky-500 border-sky-300 text-black' : btnIdle, isRigApp(a.id) ? learnedRing(`rig_solo_${a.id}`) : '']" @click="toggleSolo(s, a.id)"
                        :title="`${a.label} Solo: only the soloed row plays${isRigApp(a.id) ? ' · right-click: MIDI Learn' : ''}`"
                        @contextmenu="isRigApp(a.id) && learnMenu($event, `rig_solo_${a.id}`, `${a.label} Solo`)">S</button>
                <button :class="[btn, btnIdle, isRigApp(a.id) ? learnedRing(`rig_gen_${a.id}`) : '']" @click="onGenerate(a.id)"
                        @contextmenu="isRigApp(a.id) && learnMenu($event, `rig_gen_${a.id}`, `${a.label} GEN`)">Gen</button>
                <button :class="[btn, a.id === 'drum' ? fillClass : btnIdle, live && a.id !== 'drum' ? 'opacity-40' : '']"
                        :title="a.id === 'drum' ? 'Fill (on the next bar)' : live ? 'Fill: Drum Machine only' : 'Fill'"
                        @contextmenu="learnMenu($event, 'rig_fill', 'Fill')"
                        @click="onRowFill(a.id)">Fill</button>
              </div>
            </div>
            <div class="flex gap-3 mt-3 text-[10px] text-neutral-500">
              <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-white/10" />empty</span>
              <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-amber-500/40" />filled</span>
              <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-amber-400 animate-pulse" />queued</span>
              <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-emerald-500" />playing</span>
              <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm ring-2 ring-sky-400" />next press (Hold &amp; motion)</span>
              <span>2 = slot length in bars · #n = queue order</span>
            </div>
          </section>

          <!-- SY.CORE Map (P12): encoders → the instrument in focus in Live — its own panel (and the DECK) -->
          <button v-if="live" class="w-full p-2 rounded-lg bg-white/[0.03] border border-white/10 text-left text-[10px] text-neutral-400 hover:text-white hover:bg-white/[0.06]"
                  @click="uiStore.openPanel('live-map')">
            <span class="font-bold uppercase tracking-widest text-neutral-300">Map · Live instruments ↗</span>
            <span class="ml-2">encoders on the instrument in focus in Live (also in the DECK)</span>
          </button>

          <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Track options · <span class="text-amber-300">{{ focused.label }}</span></h3>
              <div class="flex gap-1">
                <button v-for="a in s.apps" :key="a.id" class="px-1.5 py-0.5 rounded text-[9px] font-bold"
                        :class="focusApp === a.id ? 'bg-amber-500/30 text-amber-200' : 'text-neutral-500 hover:text-neutral-200'"
                        @click="focusApp = a.id">{{ a.label }}</button>
              </div>
            </div>
            <!-- Trigger sync for the whole rig: each lane's or Global; Start only -->
            <div class="flex flex-wrap items-center gap-2 mb-2 pb-2 border-b border-white/5 text-[10px]" data-rig-sync-settings>
              <span class="text-neutral-400">Trigger sync</span>
              <div class="flex rounded border border-white/10 overflow-hidden">
                <button v-for="o in [['lane', 'Per lane'], ['global', 'Global']]" :key="o[0]"
                        class="px-1.5 py-0.5 text-[9px] font-bold"
                        :class="syncSettings.scope === o[0] ? 'bg-amber-500/30 text-amber-200' : 'text-neutral-400 hover:text-white'"
                        :title="o[0] === 'global' ? 'One Trigger sync for every lane (the Launchpad\'s Sync button changes it)' : 'Each lane its own Trigger sync (Track options)'"
                        @click="syncSettings.scope = o[0]">{{ o[1] }}</button>
              </div>
              <select v-if="syncSettings.scope === 'global'" v-model="syncSettings.global"
                      class="bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-white text-[10px]">
                <option v-for="o in TRIGGER_SYNC_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>

            </div>
            <div class="mb-2 pb-2 border-b border-white/5 text-[10px] flex items-center gap-2">
              <span class="text-neutral-400">Fades</span>
              <button class="px-2 py-0.5 rounded border border-amber-500/40 text-amber-200 text-[9px] font-black uppercase tracking-wider hover:bg-amber-500/15" @click="fadesOpen = true">Fade In / Fade Out…</button>
            </div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-2">
              <label v-for="g in OPTION_GROUPS" :key="g.key" class="block">
                <span class="text-[10px] text-neutral-400">{{ g.title }}</span>
                <select :value="focused.opts[g.key]" class="w-full mt-0.5 bg-black/40 border border-white/10 rounded px-1.5 py-1 text-white disabled:opacity-40"
                        :disabled="g.key === 'triggerSync' && syncSettings.scope === 'global'"
                        :title="g.key === 'triggerSync' && syncSettings.scope === 'global' ? 'Global Trigger sync in force (above)' : ''"
                        @change="setTrackOption(s, focused.id, g.key, $event.target.value)">
                  <option v-for="o in g.options" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
                <span class="block mt-0.5 text-[9px] text-neutral-500 leading-snug">{{ optHint(g.key, focused.opts[g.key]) }}</span>
              </label>
            </div>
            <!-- Mute / Solo scope (LIVE, real apps): the whole app or some of its MIDI Flow cables -->
            <!-- Bass / Arp: the Sequencer's lane (default) or, as before the lanes, the Drum Machine's bassline / the Arpeggiator -->
            <div v-if="focused.id === 'bass' || focused.id === 'arp'" class="mt-3 pt-2 border-t border-white/5" data-rig-lane-row>
              <span class="text-[10px] text-neutral-400">The row plays</span>
              <div class="flex flex-wrap gap-1 mt-1">
                <button v-for="o in [[true, focused.id === 'bass' ? 'Seq Bass lane' : 'Seq Arp lane'], [false, focused.id === 'bass' ? 'Drum Machine bassline' : 'Arpeggiator']]" :key="String(o[0])"
                        class="px-1.5 py-0.5 rounded border text-[9px] font-bold"
                        :class="rigLaneRows[focused.id] === o[0] ? 'bg-amber-500/30 border-amber-400/50 text-amber-200' : 'border-white/10 text-neutral-400 hover:text-white'"
                        :title="o[0] ? `The Sequencer's ${focused.id === 'bass' ? 'Bass' : 'Arp'} lane: banks A–H as slots, at the end of the pattern; Density, Mute / Solo, Intensity, GEN on the lane` : (focused.id === 'bass' ? 'The Drum Machine\'s bassline (as before the lanes)' : 'The Arpeggiator: pads = modes, Density = octave, Intensity = rate (as before the lanes)')"
                        @click="setLaneRow(focused.id, o[0])">{{ o[1] }}</button>
              </div>
            </div>
            <div v-if="live && isLiveRow(focused.id)" class="mt-3 pt-2 border-t border-white/5">
              <span class="text-[10px] text-neutral-400">Mute / Solo / Intensity act on</span>
              <div v-if="focused.id === 'bass' && !rowLane('bass')" class="mt-1 text-[9px] text-neutral-500">the Drum Machine's bassline only (Drum, on the whole app: its drums only). Its pads turn the bassline on from a sequence or off, the drums go on. CC 7 needs the bassline's own MIDI channel.</div>
              <div v-else class="flex flex-wrap gap-1 mt-1">
                <button class="px-1.5 py-0.5 rounded border text-[9px] font-bold"
                        :class="!(muteScopes[focused.id] ?? []).length ? 'bg-amber-500/30 border-amber-400/50 text-amber-200' : 'border-white/10 text-neutral-400 hover:text-white'"
                        title="Mute/Solo and Intensity act on the whole app, on every device it's cabled to" @click="clearScope(focused.id)">Whole app</button>
                <button v-for="dev in appCables(focused.id)" :key="dev" class="px-1.5 py-0.5 rounded border text-[9px]"
                        :class="(muteScopes[focused.id] ?? []).includes(dev) ? 'bg-amber-500/30 border-amber-400/50 text-amber-200' : 'border-white/10 text-neutral-400 hover:text-white'"
                        :title="`Mute/Solo and Intensity act only on the cable ${focused.label} → ${dev}${midiService.getCableTargets(liveAppSource(focused.id)).includes(dev) ? '' : ' (not cabled in MIDI Flow now)'}`"
                        @click="toggleScope(focused.id, dev)">→ {{ dev }}</button>
                <span v-if="!appCables(focused.id).length" class="text-[9px] text-neutral-600">no cables in MIDI Flow</span>
              </div>
              <div v-if="!arpeggiatorRow(focused.id)" class="flex items-center gap-1 mt-2">
                <span class="text-[10px] text-neutral-400">Intensity sends</span>
                <button v-for="m in [['cc7', 'CC 7 (volume)'], ['velocity', 'Velocity'], ['both', 'Both']]" :key="m[0]" class="px-1.5 py-0.5 rounded border text-[9px]"
                        :class="intensityMode(intensityModes, focused.id) === m[0] ? 'bg-amber-500/30 border-amber-400/50 text-amber-200' : 'border-white/10 text-neutral-400 hover:text-white'"
                        :title="{ cc7: 'CC 7 = Intensity × Global, on the app\'s channel: MIDI-map it in Live to the track volume (any instrument)', velocity: 'Note-on velocity scaled by Intensity × Global (the instrument must respond to velocity)', both: 'CC 7 and velocity' }[m[0]]"
                        @click="setIntensityMode(focused.id, m[0])">{{ m[1] }}</button>
              </div>
              <div v-if="arpeggiatorRow(focused.id)" class="mt-1 text-[9px] text-neutral-500">Arp: Mute / Solo only — its Density is the octave range, its Intensity the rate.</div>
              <div v-else class="mt-1 font-mono text-[9px]" :class="focused.intensity * s.globalIntensity < 127 * 127 ? 'text-amber-300' : 'text-neutral-500'">{{ velocityReadout(focused) }}</div>
            </div>
          </section>

          <section class="p-3 rounded-lg bg-black border border-emerald-500/20 font-mono">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1 font-sans">Display</h3>
            <div class="text-emerald-300 text-sm truncate">{{ s.display }}</div>
            <div class="text-[10px] text-neutral-500 mt-1">
              Generate: {{ s.generateMode === 'ai' ? 'AI' : 'built-in' }} · Key {{ keyText }} · Flow: {{ flowConfig }} · Split {{ s.split + 1 }}
            </div>
          </section>
        </div>

        <!-- Right column -->
        <div class="space-y-3">
          <RigControlSections only="performance" />
          <!-- (no Safety box: Panic is in the footer and on the Launchpad, EXT/INT and Shift on the Launchpad) -->
        </div>
      </div>

      <!-- ═══════════ LAUNCHPAD MINI MK1 ═══════════ -->
      <!-- ═══════════ SONGS (Session > Songs) ═══════════ -->
      <RigSongsView v-else-if="shownView === 'songs'" :lib="songLib" :run="songRun" :filled="songFilled" :lanes-on="songLanesOn"
                    :live="live" :chains="songChains" :idle="songIdle" :material-pending="materialPending" :channels="fadeLanes" :chord-counts="songChordCounts" :name-keys="songNameKeys"
                    @play="playSong" @stop="stopSong" @hold="holdSong" @jump="jumpSong" @own="songOwn" @capture="songCapture" />
      <div v-else-if="shownView === 'launchpad'" :class="play ? 'flex-1 min-h-0 flex justify-center' : 'flex gap-6 items-start'">
        <div :class="play ? 'h-full aspect-square max-w-full select-none [container-type:size]' : 'p-4 rounded-2xl bg-neutral-900 border border-white/10 shadow-inner select-none'">
          <div class="grid gap-1.5" :class="play ? 'h-full' : ''"
               :style="play ? 'grid-template-columns: repeat(9, minmax(0, 1fr)); grid-template-rows: repeat(9, minmax(0, 1fr))' : 'grid-template-columns: repeat(9, 2.6rem)'">
            <!-- top round buttons -->
            <button v-for="(t, i) in lpTop" :key="'t' + i"
                    :class="['mx-auto rounded-full border font-sans font-semibold tracking-tight leading-tight', play ? 'w-4/5 h-4/5 my-auto text-[clamp(9px,2.1cqmin,15px)]' : 'w-9 h-9 text-[9px]', ledClass(t.color)]" :title="t.title ? `${t.id} · ${t.title}` : `${t.id} · ${t.label}`"
                    @pointerdown="lpTopDown(i)" @pointerup="lpTopUp(i)" @pointerleave="lpTopUp(i)">{{ showLabels || play ? t.label : '' }}</button>
            <span />
            <!-- 8 rows: 8 pads + 1 side button -->
            <template v-for="row in 8" :key="'r' + row">
              <button v-for="col in 8" :key="'p' + row + col"
                      :class="['rounded-md border font-sans font-semibold tracking-tight leading-tight', play ? 'w-full h-full text-[clamp(10px,2.6cqmin,18px)]' : 'w-10 h-10 text-[10px]', ledClass(lpPad(row - 1, col - 1).color)]"
                      :title="`Note ${lpGridNote(row - 1, col - 1)} · ${lpPad(row - 1, col - 1).label}`"
                      @pointerdown="lpPadDown(row - 1, col - 1)" @pointerup="lpPadUp(row - 1, col - 1)" @pointerleave="lpPadUp(row - 1, col - 1)">{{ showLabels || play ? lpPad(row - 1, col - 1).short : '' }}</button>
              <button :class="['m-auto rounded-full border font-sans font-semibold tracking-tight leading-tight', play ? 'w-4/5 h-4/5 text-[clamp(9px,2.1cqmin,15px)]' : 'w-9 h-9 text-[9px]', ledClass(lpSide(row - 1).color)]"
                      :title="`Note ${lpSideNote(row - 1)} · ${lpSide(row - 1).label}`"
                      @pointerdown="lpSideDown(row - 1)" @pointerup="lpSideUp(row - 1)" @pointerleave="lpSideUp(row - 1)">{{ showLabels || play ? lpSide(row - 1).short : '' }}</button>
            </template>
          </div>
        </div>
        <div v-if="!play" class="space-y-3 max-w-xs">
          <label class="flex items-center gap-2 text-neutral-300"><input v-model="showLabels" type="checkbox" class="accent-amber-400" /> Show labels (the real pads have none)</label>
          <label class="flex items-center gap-2 text-neutral-300" title="The CC the DJ Filter (side, row 6) sends while held: your device's cutoff">DJ Filter CC
            <input :value="djFilter.cc" type="number" min="0" max="127" class="w-16 bg-black border border-white/10 rounded px-1.5 py-0.5 text-neutral-200" @change="djFilter.cc = djFilterCc($event.target.value); $event.target.value = djFilter.cc" /></label>
          <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10 space-y-1 text-neutral-300">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Map</h3>
            <div>Rows 1–5 · Drum, Chord, Seq, Bass, Arp × slots A–H (Arp: modes)</div>
            <div>Row 6 · Fill · Auto Fill · Now/Bar · Repeat (hold) · Latch · Drum Chain · Chord Chain · Seq Chain (dark red off · red blinking on)</div>
            <div>Row 7 · Sections 1–8 — or Captures 1–8 (side S·SEC / S·CAP)</div>
            <div>Row 8 · Latch 1–8: the Chord Prog stays on chord 1–8 (green; blinking until the chord sounding ends) — press again: the progression goes on</div>
            <div>Side · Generate Drum, Chord, Seq, Bass, Arp (Shift: Mute; Mutate: the panel's Shift + GEN) · DJ Filter (hold: CC {{ djFilter.cc }} cutoff closes, release: opens) · Capt (record a capture) · Row S: Sections / Captures</div>
            <div>Top · Beat/Tap · EXT/INT (hold) · Shift · Gen AI · Sync (cycles the focused track's Trigger sync) · Rig · — · Panic (hold)</div>
            <div class="text-[10px] text-neutral-500">Slot pads follow each track's Press mode: hold modes react on release too.</div>
          </section>
          <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10 space-y-1.5">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">LED colors (MK1: red / green / amber)</h3>
            <div v-for="c in [['off', 'Empty'], ['amber', 'Filled'], ['amberFlash', 'Queued for the next bar'], ['green', 'Playing / on'], ['red', 'Mute · Panic · INT']]" :key="c[0]" class="flex items-center gap-2 text-neutral-300">
              <span class="w-4 h-4 rounded border" :class="LED_CLASS[c[0]]" />{{ c[1] }}
            </div>
            <div class="text-[10px] text-neutral-500 pt-1">Hover a pad for its MIDI note (XY layout: 16·row + col; top row CC 104–111).</div>
          </section>
          <div class="p-2 rounded bg-black border border-emerald-500/20 font-mono text-emerald-300 truncate">{{ s.display }}</div>
        </div>
      </div>

      <!-- ═══════════ AKAI MIDIMIX ═══════════ -->
      <div v-else class="space-y-3">
        <div class="flex items-center gap-2 text-neutral-400">
          <span class="uppercase tracking-widest text-[10px] text-neutral-500">Page</span>
          <span class="px-2 py-0.5 rounded bg-white/10 text-white font-bold">{{ mixPage === 'app' ? 'App' : `Lane ${lanePageOffset + 1}–${lanePageOffset + 8}` }}</span>
          <span class="text-[10px]">Pots and faders are absolute: SY.CORE applies pickup (the value changes once the control reaches it).</span>
          <button class="ml-auto px-2 py-0.5 rounded border text-[10px] font-bold"
                  :class="mixLearn ? 'bg-amber-500 border-amber-300 text-black' : 'border-white/15 text-neutral-300 hover:bg-white/10'"
                  title="Learn the MIDImix's map (a MIDImix reprogrammed with the Akai editor, e.g. buttons sending CCs): pick a control, then move or press it"
                  @click="mixLearn = !mixLearn">{{ mixLearn ? 'Learning… done' : 'Learn map' }}</button>
          <button v-if="Object.keys(mixMap).length" class="px-2 py-0.5 rounded border border-white/15 text-[10px] text-neutral-300 hover:bg-white/10"
                  title="Forget the learned controls: back to the factory map" @click="mixMapReset">Factory map</button>
          <span class="font-mono text-[10px] text-amber-200/80" title="The last LED messages the rig sent to the MIDImix">LED out: {{ mixLastOut || '—' }}</span>
          <span class="font-mono text-[10px]" :class="mixLastIn ? 'text-sky-300' : 'text-neutral-600'" title="The last message from the MIDImix and how the rig read it">MIDImix in: {{ mixLastIn || '—' }}</span>
        </div>
        <!-- Learn map: every control of the MIDImix, with the message it sends -->
        <div v-if="mixLearn" class="p-3 rounded-2xl bg-neutral-900 border border-amber-500/30 select-none w-fit space-y-2">
          <div class="text-[10px] text-amber-200">Pick a control (the next one is picked after each), then move or press it on the MIDImix. Set the buttons to <b>momentary</b> in the Akai editor. Highlighted: learned; grey: factory.</div>
          <div class="flex gap-2">
            <div v-for="strip in 8" :key="strip" class="flex flex-col gap-1 w-20">
              <div class="text-[9px] text-center text-neutral-400 font-bold">Strip {{ strip }}</div>
              <button v-for="r in MIX_LEARN_ROWS" :key="r[0] + r[1]"
                      class="px-1 py-0.5 rounded border text-[8px] leading-tight text-left"
                      :class="mixLearnRole === roleId({ kind: r[0], strip: strip - 1, row: r[1] ?? undefined }) ? 'bg-amber-500 border-amber-300 text-black animate-pulse'
                        : mixRoleLearned(roleId({ kind: r[0], strip: strip - 1, row: r[1] ?? undefined })) ? 'border-emerald-400/50 text-emerald-200' : 'border-white/10 text-neutral-500'"
                      @click="mixLearnRole = roleId({ kind: r[0], strip: strip - 1, row: r[1] ?? undefined })">
                <b>{{ r[2] }}</b><br>{{ mixRoleLabel(roleId({ kind: r[0], strip: strip - 1, row: r[1] ?? undefined })) }}
              </button>
            </div>
            <div class="flex flex-col gap-1 w-20">
              <div class="text-[9px] text-center text-neutral-400 font-bold">Master</div>
              <button v-for="r in MIX_MASTER_ROLES" :key="r[0]"
                      class="px-1 py-0.5 rounded border text-[8px] leading-tight text-left"
                      :class="mixLearnRole === r[0] ? 'bg-amber-500 border-amber-300 text-black animate-pulse' : mixRoleLearned(r[0]) ? 'border-emerald-400/50 text-emerald-200' : 'border-white/10 text-neutral-500'"
                      @click="mixLearnRole = r[0]">
                <b>{{ r[1] }}</b><br>{{ mixRoleLabel(r[0]) }}
              </button>
            </div>
          </div>
        </div>
        <div v-else class="flex gap-3 p-4 rounded-2xl bg-neutral-900 border border-white/10 select-none w-fit">
          <div v-for="(st, i) in mixStrips" :key="i" class="w-20 flex flex-col items-center gap-2 p-2 rounded-lg bg-black/30 border border-white/5">
            <div class="text-[10px] font-bold text-neutral-200 truncate w-full text-center">{{ st.title }}</div>
            <div v-for="k in st.knobs" :key="k.label" class="flex flex-col items-center cursor-ns-resize" @pointerdown.prevent="knobDrag($event, k)">
              <svg viewBox="0 0 36 36" class="w-9 h-9">
                <circle cx="18" cy="18" r="15" fill="#171717" stroke="#404040" stroke-width="2" />
                <path :d="arcPath(k.get())" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" />
                <line x1="18" y1="18" x2="18" y2="7" stroke="#e5e5e5" stroke-width="2" stroke-linecap="round" :transform="`rotate(${knobAngle(k.get())} 18 18)`" />
              </svg>
              <span class="text-[8px] text-neutral-500">{{ k.label }} {{ k.get() }}</span>
            </div>
            <template v-if="st.mute">
              <button class="w-full py-1 rounded border text-[9px] font-bold flex items-center justify-center gap-1"
                      :class="st.mute.on ? 'bg-amber-500 border-amber-300 text-black' : 'bg-white/[0.04] border-white/10 text-neutral-400'"
                      @click="st.mute.press()">{{ st.mute.label }}</button>
              <button class="w-full py-1 rounded border text-[9px] font-bold"
                      :class="st.rec.on ? 'bg-red-600 border-red-400 text-white' : 'bg-white/[0.04] border-white/10 text-neutral-400'"
                      @click="st.rec.press()">{{ st.rec.label }}</button>
            </template>
            <template v-if="st.fader">
              <input type="range" min="0" max="127" :value="st.fader.get()" class="h-28 accent-amber-400" style="writing-mode: vertical-lr; direction: rtl"
                     @input="st.fader.set(Number($event.target.value))" />
              <span class="text-[8px] text-neutral-500">{{ st.fader.label }} {{ st.fader.get() }}</span>
            </template>
          </div>
          <!-- master section -->
          <div class="w-24 flex flex-col items-center gap-2 p-2 rounded-lg bg-black/30 border border-white/5">
            <div class="text-[10px] font-bold text-neutral-200">Master</div>
            <div class="flex gap-1 w-full">
              <button class="flex-1 py-1 rounded border text-[9px] font-bold" :class="mixPage === 'app' ? 'bg-white/15 border-white/30 text-white' : 'bg-white/[0.04] border-white/10 text-neutral-400'" @click="mixPage = 'app'">◀ Bank</button>
              <button class="flex-1 py-1 rounded border text-[9px] font-bold" :class="mixPage === 'lane' ? 'bg-white/15 border-white/30 text-white' : 'bg-white/[0.04] border-white/10 text-neutral-400'" @click="mixPage = 'lane'">Bank ▶</button>
            </div>
            <button class="w-full py-1 rounded border text-[9px] font-bold" :class="s.shift ? 'bg-amber-500 border-amber-300 text-black' : 'bg-white/[0.04] border-white/10 text-neutral-400'" @click="toggleShift">Solo = Shift</button>
            <input v-model.number="s.globalIntensity" @contextmenu="learnMenu($event, 'rig_global', 'Global intensity')" title="Right-click: MIDI Learn" type="range" min="0" max="127" class="h-28 accent-amber-400 mt-auto" style="writing-mode: vertical-lr; direction: rtl" />
            <span class="text-[8px] text-neutral-500">Global {{ s.globalIntensity }}</span>
          </div>
        </div>
        <div class="p-2 rounded bg-black border border-emerald-500/20 font-mono text-emerald-300 truncate w-fit min-w-[24rem]">{{ s.display }}</div>
      </div>
      <div v-if="play" class="shrink-0 px-2 py-1 rounded bg-black border border-amber-900/40 font-mono text-[11px] text-amber-200/80 truncate">{{ s.display }}</div>
    </div>

    <ResizeHandles :start="onResizeStart" />

    <!-- Fades (Fade In on the global Start, Fade Out ending on the global Stop): per MIDI channel -->
    <Teleport to="body">
      <div v-if="fadesOpen" class="fixed inset-0 z-[3000] flex items-center justify-center bg-black/60" @pointerdown.self="fadesOpen = false" data-rig-fades-modal>
        <div class="w-[760px] max-w-[calc(100vw-32px)] max-h-[85vh] flex flex-col bg-neutral-900 border border-amber-500/30 rounded-xl shadow-2xl">
          <div class="flex items-center gap-2 px-4 py-3 border-b border-neutral-800">
            <span class="text-[11px] font-black uppercase tracking-widest text-amber-300">Fade In / Fade Out</span>
            <span class="text-[9px] text-neutral-500 flex-1">In: from the Play · Out: ends on the Stop (end of the next bar) · in bars</span>
            <button class="px-2 py-1 rounded border border-red-500/50 text-red-300 text-[9px] font-black uppercase tracking-wider hover:bg-red-500/20"
                    title="Every channel's CC 7 and the master to 0 now: the next Play fades in from silence" @click="resetAllVolumes">Reset all volumes</button>
            <button class="text-neutral-500 hover:text-white text-sm" @click="fadesOpen = false">✕</button>
          </div>
          <div class="overflow-y-auto custom-scrollbar p-4 flex flex-col gap-3 text-[10px]">
            <div class="grid grid-cols-[1fr_9rem_1fr_9rem] gap-x-2 items-center text-[9px] text-neutral-500 px-1">
              <span /><span>In</span><span>Max</span><span>Out</span>
            </div>
            <!-- Master (the audio mixer) and the Drum Machine's own sounds -->
            <div class="flex flex-col gap-1 rounded-lg border border-neutral-800 p-2">
              <template v-for="k in ['master', 'drum']" :key="k">
                <div class="grid grid-cols-[1fr_9rem_1fr_9rem] gap-x-2 items-center">
                  <span class="font-bold" :class="fade[k] < 1 ? 'text-amber-300' : 'text-neutral-200'">{{ k === 'master' ? 'Master (audio mixer)' : 'Drum (its own sounds)' }}</span>
                  <span class="flex rounded border border-white/10 overflow-hidden">
                    <button v-for="b in FADE_BARS" :key="b" type="button"
                            class="flex-1 min-w-[1.6rem] py-1.5 text-[10px] font-bold"
                            :class="fadeSettings[k].in === b ? (b === 0 ? 'bg-neutral-700 text-white' : 'bg-amber-500 text-black') : 'text-neutral-400 hover:bg-white/10'"
                            @click="fadeSettings[k].in = b">{{ b === 0 ? 'Off' : b === 0.5 ? '½' : b }}</button>
                  </span>
                  <span class="flex items-center gap-1.5">
                    <input type="range" min="0" max="127" v-model.number="fadeSettings[k].max" class="flex-1 accent-amber-500" />
                    <span class="w-6 text-right font-mono text-neutral-300">{{ fadeSettings[k].max }}</span>
                  </span>
                  <span class="flex rounded border border-white/10 overflow-hidden">
                    <button v-for="b in FADE_BARS" :key="b" type="button"
                            class="flex-1 min-w-[1.6rem] py-1.5 text-[10px] font-bold"
                            :class="fadeSettings[k].out === b ? (b === 0 ? 'bg-neutral-700 text-white' : 'bg-amber-500 text-black') : 'text-neutral-400 hover:bg-white/10'"
                            @click="fadeSettings[k].out = b">{{ b === 0 ? 'Off' : b === 0.5 ? '½' : b }}</button>
                  </span>
                </div>
              </template>
            </div>
            <!-- each lane: the MIDI channels it reaches (CC 7 to each) -->
            <div v-for="l in fadeLanes" :key="l.id" class="flex flex-col gap-1 rounded-lg border border-neutral-800 p-2">
              <span class="text-[9px] font-black uppercase tracking-widest text-sky-300">{{ l.label }}</span>
              <span v-if="!l.rows.length" class="text-[9px] text-neutral-600">No MIDI channel: cable it in MIDI Flow</span>
              <div v-for="r in l.rows" :key="r.key" class="grid grid-cols-[1fr_9rem_1fr_9rem] gap-x-2 items-center">
                <span class="min-w-0">
                  <span class="block truncate text-neutral-200" :title="r.device">{{ r.device }} · ch {{ r.ch + 1 }}</span>
                  <span class="block h-1 rounded bg-neutral-800 overflow-hidden mt-0.5" :title="chValue[r.key] != null ? `CC 7 now: ${chValue[r.key]}` : 'Not sent yet'">
                    <span class="block h-full bg-amber-400" :style="{ width: ((chValue[r.key] ?? chFadeOf(r.key).max) / 127 * 100) + '%' }" />
                  </span>
                </span>
                <span class="flex rounded border border-white/10 overflow-hidden">
                    <button v-for="b in FADE_BARS" :key="b" type="button"
                            class="flex-1 min-w-[1.6rem] py-1.5 text-[10px] font-bold"
                            :class="chFadeOf(r.key).in === b ? (b === 0 ? 'bg-neutral-700 text-white' : 'bg-amber-500 text-black') : 'text-neutral-400 hover:bg-white/10'"
                            @click="chFadeOf(r.key).in = b">{{ b === 0 ? 'Off' : b === 0.5 ? '½' : b }}</button>
                  </span>
                <span class="flex items-center gap-1.5">
                  <input type="range" min="0" max="127" v-model.number="chFadeOf(r.key).max" class="flex-1 accent-amber-500" />
                  <span class="w-6 text-right font-mono text-neutral-300">{{ chFadeOf(r.key).max }}</span>
                </span>
                <span class="flex rounded border border-white/10 overflow-hidden">
                    <button v-for="b in FADE_BARS" :key="b" type="button"
                            class="flex-1 min-w-[1.6rem] py-1.5 text-[10px] font-bold"
                            :class="chFadeOf(r.key).out === b ? (b === 0 ? 'bg-neutral-700 text-white' : 'bg-amber-500 text-black') : 'text-neutral-400 hover:bg-white/10'"
                            @click="chFadeOf(r.key).out = b">{{ b === 0 ? 'Off' : b === 0.5 ? '½' : b }}</button>
                  </span>
              </div>
            </div>
            <p class="text-[9px] text-neutral-500 leading-snug">
              A channel with an In goes from 0 to its Max at the Play; with an Out, to 0 on the Stop, and stays there until the next Play.
              Off on both: its CC 7 isn't touched.
            </p>
          </div>
        </div>
      </div>
    </Teleport>
    <!-- Performance: the controls in the Rig Controls panel (lib/rig-controls-host.ts) -->
    <Teleport v-if="play && rigControlsHost" :to="rigControlsHost">
      <div class="flex flex-col gap-2 text-xs min-h-0 h-full">
        <RigControlSections only="transport" />
        <RigControlSections only="performance" />
        <!-- no Controller template here: set up in EDIT (the Rig layout), not while performing -->
        <!-- Now / Next (the Chord Prog's chords) right above Play -->
        <ChordNowDisplay stacked class="mt-auto" />
        <button class="shrink-0 h-14 flex items-center justify-center gap-2 rounded-lg border text-sm font-black uppercase tracking-widest select-none"
                :class="[playOn ? 'bg-emerald-500/80 border-emerald-300 text-black' : 'bg-neutral-800 border-white/15 text-neutral-200 hover:bg-neutral-700', learnedRing('rig_play')]"
                :title="(live && s.clock.source === 'EXT' ? 'Play / Stop Ableton Live (SY.CORE Link)' : 'Play / Stop the clock') + ' — right-click: MIDI Learn'"
                @click="togglePlay" @contextmenu="learnMenu($event, 'rig_play', 'Play / Stop')">
          <component :is="playOn ? Square : Play" class="w-5 h-5" /> {{ countIn.active ? `Count ${countIn.left}` : playOn ? 'Stop' : 'Play' }}
        </button>
      </div>
    </Teleport>
  </div>
</template>
