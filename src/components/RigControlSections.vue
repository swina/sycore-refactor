<script setup>
// The Rig Controller's controls (Transport / Clock, Performance, Safety, Controller template), one
// section per `only`. The state and actions are the Rig engine's (core/engines/rig.js): shown in the
// Rig panel's layout and in the Rig Controls panel (Performance), either open without the other.
import { ref } from 'vue'
import { undo } from '@/lib/rig-controller'
import { rigFollowPlay } from '@/lib/rig-live'
import { useRigEngine } from '@/core/engines/rig'
import { useUiStore } from '@/stores/useUiStore'
import { useSessionTakesStore } from '@/stores/useSessionTakesStore'

defineProps({ only: { type: String, required: true } }) // transport | template | performance | safety
const {
  s, live, focused, btn, btnIdle, btnOn, tap, cycleSync, SYNC_SHORT, syncButton, fadesOpen, isRigApp, learnMenu,
  tplDevice, refreshInputs, tplDevices, mappedDevices, tplLeds, tplCount, exportTemplate, importTemplate, clearTemplate, tplMsg,
  onFill, repeaterOn, repeaterOff, toggleSeqFree, chainOn, toggleChain, setFocus, learnedRing, onKeyShift, tempoStep, tempoDrag, tempoRound, drumStore, fillClass, toggleAutoFill, autoFillEvery, cycleAutoFillEvery, toggleFollowPlay, keyText, onKeyMode,
  knobLabel, knobTitle, knobValue, densityMenu, toggleGenMode, holding, holdStart, holdEnd, doPanic, doInt, toggleShift,
} = useRigEngine()
const tplFile = ref(null)
// the knobs' app buttons: short names (they fit the column)
const KNOB_APP_SHORT = { drum: 'DR', chord: 'CHR', seq: 'SEQ', bass: 'BAS', arp: 'ARP' }
const uiStore = useUiStore()
const takes = useSessionTakesStore()
</script>

<template>
  <template v-if="only === 'transport'">
    <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10">
      <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Transport / Clock</h3>
      <div class="flex items-center justify-between">
        <span class="px-2 py-0.5 rounded text-[10px] font-black" :class="s.clock.source === 'EXT' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'">{{ s.clock.source }}</span>
        <!-- the tempo knob: drag up / down (EXT over SY.CORE Link: Live's tempo) · right-click: MIDI Learn -->
        <span class="font-mono text-2xl text-white touch-none cursor-ns-resize select-none rounded px-0.5 hover:bg-white/5" :class="learnedRing('rig_tempo')"
              title="Tempo: drag up / down (0.1 BPM per 2 px) · right-click: MIDI Learn a knob (0.5 BPM per step, no jumps)"
              @pointerdown="tempoDrag" @contextmenu="learnMenu($event, 'rig_tempo', 'Rig Tempo (knob)')">{{ s.clock.bpm.toFixed(1) }}</span>
      </div>
      <div class="flex gap-1.5 mt-2">
        <button :class="[btn, btnIdle, 'flex-1', learnedRing('rig_tempo_down')]" title="Tempo − 1 BPM (Shift: 0.1) · right-click: MIDI Learn"
                @click="tempoStep(-1)" @contextmenu="learnMenu($event, 'rig_tempo_down', 'Rig Tempo −')">−</button>
        <button :class="[btn, btnIdle, 'flex-1', learnedRing('rig_tempo_round')]" title="Round the tempo to a whole BPM · right-click: MIDI Learn"
                @click="tempoRound" @contextmenu="learnMenu($event, 'rig_tempo_round', 'Rig Tempo round')">Round</button>
        <button :class="[btn, btnIdle, 'flex-1', learnedRing('rig_tempo_up')]" title="Tempo + 1 BPM (Shift: 0.1) · right-click: MIDI Learn"
                @click="tempoStep(1)" @contextmenu="learnMenu($event, 'rig_tempo_up', 'Rig Tempo +')">+</button>
      </div>
      <div class="flex items-center justify-between mt-2">
        <span class="font-mono text-neutral-300">{{ s.clock.bar }}.{{ s.clock.beat }}</span>
        <div class="flex gap-1">
          <span v-for="b in 4" :key="b" class="w-2.5 h-2.5 rounded-full"
                :class="s.clock.running && s.clock.beat === b ? (b === 1 ? 'bg-emerald-400' : 'bg-amber-400') : 'bg-neutral-700'" />
        </div>
      </div>
      <div class="flex gap-1.5 mt-2">
        <button :class="[btn, btnIdle, 'flex-1', learnedRing('rig_tap')]" title="Tap the tempo (EXT over SY.CORE Link: Live's) · right-click: MIDI Learn"
                @click="tap" @contextmenu="learnMenu($event, 'rig_tap', 'Rig Tap tempo')">Tap</button>
        <button :class="[btn, 'flex-1 min-w-0 whitespace-nowrap truncate', btnIdle]" :title="syncButton.title" @click="cycleSync"
                @contextmenu="isRigApp(focused.id) && learnMenu($event, `rig_sync_${focused.id}`, `${focused.label} Trigger sync`)">Sync {{ syncButton.text }}</button>
      </div>
      <button :class="[btn, 'w-full mt-1.5', btnIdle]" title="Fade In on the Play, Fade Out on the Stop — per MIDI channel" @click="fadesOpen = true">Fade In / Fade Out</button>
      <!-- Live's Play starts the armed slots — off to listen back to a take in Live (lib/rig-live.ts rigFollowPlay) -->
      <button :class="[btn, 'w-full mt-1.5', rigFollowPlay ? btnIdle : 'bg-red-600/30 border-red-500/60 text-red-200']"
              title="On: Live's Play starts the armed slots · Off: Live's Play starts nothing (to listen back to a take) — the clock stays locked, pads still start their slots"
              @click="toggleFollowPlay">Live Play: {{ rigFollowPlay ? 'starts slots' : 'off (listen back)' }}</button>
    </section>
  </template>
  <template v-else-if="only === 'template'">
    <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10 space-y-2">
      <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500"
          title="A controller's rig controls (learned with right-click › MIDI Learn) as a JSON file: export it, import it on another computer, or import a ready template">Controller template</h3>
      <select v-model="tplDevice" @focus="refreshInputs" class="w-full bg-black/40 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white">
        <option v-if="!tplDevices.length" value="">No MIDI controller</option>
        <option v-for="d in tplDevices" :key="d" :value="d">{{ d }}{{ mappedDevices.find(x => x.device === d) ? ` · ${mappedDevices.find(x => x.device === d).count} rig controls` : '' }}{{ tplLeds[d]?.name ? ` · ${tplLeds[d].name}` : '' }}</option>
      </select>
      <div class="flex gap-1">
        <button :class="[btn, 'flex-1', btnIdle]" :disabled="!tplCount" @click="exportTemplate">Export</button>
        <button :class="[btn, 'flex-1', btnIdle]" @click="tplFile?.click()">Import</button>
        <button :class="[btn, btnIdle]" :disabled="!tplCount" title="Forget this controller's rig controls" @click="clearTemplate">✕</button>
        <input ref="tplFile" type="file" accept=".json,application/json" class="hidden" @change="importTemplate" />
      </div>
      <div v-if="tplMsg" class="text-[10px] text-neutral-400 break-words">{{ tplMsg }}</div>
    </section>
  </template>
  <template v-else-if="only === 'performance'">
    <section class="p-3 rounded-lg bg-white/[0.03] border border-white/10 space-y-2">
      <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Performance</h3>
      <div class="grid grid-cols-2 gap-1.5">
        <div class="col-span-2 flex gap-1">
          <button :class="[btn, 'flex-1', fillClass]" @click="onFill">Fill</button>
          <!-- the Drum Machine's Autofill (a fill every N bars) -->
          <button :class="[btn, drumStore.autofillEnabled ? btnOn : btnIdle]" title="Auto Fill: the Drum Machine's Autofill on / off (a fill every N bars: the button next to it)"
                  @click="toggleAutoFill">Auto</button>
          <!-- Auto Fill's bar: on every 4th / 8th / 12th / 16th bar (click: the next) -->
          <button data-autofill-every :class="[btn, drumStore.autofillEnabled ? btnOn : btnIdle]"
                  :title="`Auto Fill on bar ${autoFillEvery} (every ${autoFillEvery} bars, the whole bar) · click: 4 → 8 → 12 → 16`"
                  @click="cycleAutoFillEvery">{{ autoFillEvery }}</button>
          <!-- the Drum Machine's Fill: now (to the end of this bar) or the whole next bar -->
          <button :class="[btn, drumStore.fillWhen === 'bar' ? btnOn : btnIdle]" title="Fill: Now = at once, to the end of this bar · Bar = armed, the whole next bar"
                  @click="drumStore.fillWhen = drumStore.fillWhen === 'bar' ? 'now' : 'bar'">{{ drumStore.fillWhen === 'bar' ? 'Bar' : 'Now' }}</button>
        </div>
        <button :class="[btn, s.repeater ? btnOn : btnIdle]" title="The Drum Machine's Repeat while held (its ÷2 / ÷3 / ÷4)" @pointerdown="repeaterOn" @pointerup="repeaterOff" @pointerleave="repeaterOff">Repeat (hold)</button>
        <button :class="[btn, uiStore.seqDecoupled ? btnOn : btnIdle, learnedRing('rig_seq_free')]"
                title="Seq Free: the Sequencer decoupled from the Chord Prog for now — its chords no longer move, start, stop or switch its bank; off = it follows the held chord again (right-click: MIDI Learn)"
                @click="toggleSeqFree" @contextmenu="learnMenu($event, 'rig_seq_free', 'Seq Free')">Seq Free</button>
        <!-- the apps' Chain mode: dark red off · red blinking on; taken at the end of the bar / slot / pattern -->
        <div class="col-span-2 flex gap-1">
          <button v-for="c in [['drum', 'Drum'], ['chord', 'Chord'], ['seq', 'Seq']]" :key="c[0]"
                  :class="[btn, 'flex-1', chainOn(c[0]) ? 'bg-red-600 border-red-400 text-white animate-pulse' : 'bg-red-950/60 border-red-900/70 text-red-300/80 hover:bg-red-900/50', learnedRing('rig_chain_' + c[0])]"
                  :title="c[1] + ' Chain on / off — from the end of its ' + (c[0] === 'drum' ? 'bar' : c[0] === 'chord' ? 'slot' : 'pattern') + ' (right-click: MIDI Learn)'"
                  @click="toggleChain(c[0])" @contextmenu="learnMenu($event, 'rig_chain_' + c[0], c[1] + ' Chain')">{{ c[1] }} Chain</button>
        </div>
      </div>
      <div class="flex items-center justify-between">
        <button :class="[btn, btnIdle, learnedRing('rig_key_down')]" @click="onKeyShift(-1)" @contextmenu="learnMenu($event, 'rig_key_down', 'Key −')">◀</button>
        <span class="font-mono text-white">Key {{ keyText }}</span>
        <button v-if="live" :class="[btn, btnIdle]" title="Major / minor on the same tonic" @click="onKeyMode" @contextmenu="learnMenu($event, 'rig_key_mode', 'Key Maj/Min')">Maj/Min</button>
        <button :class="[btn, btnIdle, learnedRing('rig_key_up')]" @click="onKeyShift(1)" @contextmenu="learnMenu($event, 'rig_key_up', 'Key +')">▶</button>
      </div>
      <!-- the app the knobs act on: picked here (or by a press on one of its pads) -->
      <div class="flex items-center gap-2">
        <span class="text-[10px] uppercase tracking-widest text-neutral-500">Knobs →</span>
        <span class="text-base font-black text-amber-300">{{ focused.label }}</span>
      </div>
      <div class="grid grid-cols-5 gap-1">
        <button v-for="a in s.apps" :key="a.id" :title="`Knobs on ${a.label}`"
                :class="[btn, 'px-0', focused.id === a.id ? 'bg-amber-500 border-amber-300 text-black' : btnIdle]"
                @click="setFocus(a.id)">{{ KNOB_APP_SHORT[a.id] ?? a.label }}</button>
      </div>
      <div v-for="k in [['Density', 'density'], ['Swing', 'swing'], ['Gate', 'gate'], ['Intensity', 'intensity']]" :key="k[1]" class="flex items-center gap-2">
        <span class="w-14 text-[10px] text-neutral-400">{{ knobLabel(k) }}</span>
        <input v-model.number="focused[k[1]]" type="range" min="0" max="127" class="flex-1 accent-amber-400"
               :title="knobTitle(k[1])"
               @contextmenu="k[1] === 'density' && live && ['drum', 'seq', 'arp'].includes(focused.id) ? ($event.preventDefault(), densityMenu($event, focused)) : k[1] === 'intensity' && isRigApp(focused.id) ? learnMenu($event, `rig_intensity_${focused.id}`, `${knobLabel(k) === 'Rate' ? 'Arp Rate' : `${focused.label} Intensity`}`) : null" />
        <span class="w-9 text-right font-mono text-neutral-300">{{ knobValue(k[1]) }}</span>
      </div>
      <div class="flex gap-1.5">
        <button :class="[btn, 'flex-1', s.generateMode === 'ai' ? btnOn : btnIdle]" @click="toggleGenMode">Generate: {{ s.generateMode === 'ai' ? 'AI' : 'built-in' }}</button>
        <!-- the session takes: what each Generate wrote over and made (SessionTakesPanel) -->
        <button :class="[btn, uiStore.isSessionTakesOpen ? btnOn : btnIdle]" title="Session: the slots each Generate wrote over and what it made — load them back"
                @click="uiStore.togglePanel('session-takes')">Session <span class="font-mono opacity-60">{{ takes.takes.length }}</span></button>
      </div>
    </section>
  </template>
  <template v-else-if="only === 'safety'">
    <section class="p-3 rounded-lg bg-red-950/20 border border-red-500/20 space-y-1.5">
      <h3 class="text-[10px] font-bold uppercase tracking-widest text-red-300/70">Safety</h3>
      <button :class="[btn, 'w-full relative overflow-hidden', holding.panic ? 'bg-red-500 border-red-300 text-white' : 'bg-red-600/30 border-red-500/50 text-red-200']"
              @pointerdown="holdStart('panic', doPanic)" @pointerup="holdEnd('panic')" @pointerleave="holdEnd('panic')">Panic (hold)</button>
      <button :class="[btn, 'w-full', holding.int ? 'bg-amber-500 border-amber-300 text-black' : btnIdle]"
              @pointerdown="holdStart('int', doInt)" @pointerup="holdEnd('int')" @pointerleave="holdEnd('int')">{{ s.clock.source === 'EXT' ? '→ INT' : '→ EXT' }} (hold)</button>
      <div class="grid grid-cols-2 gap-1.5">
        <button :class="[btn, btnIdle]" @click="undo(s)">Undo</button>
        <button :class="[btn, s.shift ? btnOn : btnIdle]" @click="toggleShift">Shift</button>
      </div>
    </section>
  </template>
</template>
