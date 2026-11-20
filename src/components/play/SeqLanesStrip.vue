<script setup>
// The Sequencer's three lanes at a glance (lib/seq-lanes.ts), over its play view: each lane's name (a
// click shows it in the panel), its bank, Play / Stop, M (mute: it plays on silent), its MIDI channel
// (G = the global one, with MIDI Flow's remaps; 1–16 = that channel as is), S (SYNC: a start waits for the
// next bar — ▶ blinks while it waits; off: now), SCL / CHD (Fit: by degree in the scale, or then onto the
// Chord Prog's chord — seq-gen/harmony.ts fitToChord), ♪ (SOUND: the bank shown takes the preset now on the lane's
// channel, sent again when that bank starts — Shift-click: forget it; its name below: Program Change ON / OFF for the lane) and its first 16 steps with the one sounding lit.
// Right-click: MIDI Learn (play, mute).
import { computed, ref } from 'vue'
import { useSequencerEngine } from '@/core/engines/sequencer'
import { useSeqLaneStore } from '@/stores/useStepSequencerStore'
import { SEQ_LANES, SEQ_LANE_CFG, seqActiveLane, learnName, learnLabel } from '@/lib/seq-lanes'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'

const { openMenu } = useMidiContextMenu()
const COLOR = {
  main: { on: 'bg-amber-400', text: 'text-amber-300', ring: 'border-amber-500/60 bg-amber-500/10' },
  bass: { on: 'bg-purple-400', text: 'text-purple-300', ring: 'border-purple-500/60 bg-purple-500/10' },
  arp: { on: 'bg-cyan-400', text: 'text-cyan-300', ring: 'border-cyan-500/60 bg-cyan-500/10' },
}
const CHANNELS = [0, ...Array.from({ length: 16 }, (_, i) => i + 1)]
const rows = SEQ_LANES.map(lane => ({ lane, cfg: SEQ_LANE_CFG[lane], eng: useSequencerEngine(lane), store: useSeqLaneStore(lane), c: COLOR[lane] }))
const cells = (r) => r.eng.steps.value.slice(0, Math.min(16, r.eng.numSteps.value))
const bank = (r) => 'ABCDEFGH'[r.store.activeBankIndex] ?? ''
const togglePlay = (r) => window.dispatchEvent(new CustomEvent(r.cfg.toggle, { detail: { play: !r.eng.isPlaying.value, user: true } }))
const active = computed(() => seqActiveLane.value)
const soundNote = ref({})
function pickSound(r, e) {
  if (e.shiftKey) { r.eng.clearBankSound(); soundNote.value = { ...soundNote.value, [r.lane]: '' }; return }
  const snd = r.eng.assignBankSound()
  soundNote.value = { ...soundNote.value, [r.lane]: snd ? '' : 'no preset on its channel' }
}
const soundTitle = (r) => {
  const b = bank(r)
  const lbl = r.eng.bankSoundLabel.value
  const note = soundNote.value[r.lane]
  return `${r.cfg.label} ${b}: ${lbl ? `sound ${lbl} — ${r.eng.laneSoundOn.value ? `sent when ${b} starts` : 'Program Change OFF (click its name: on)'}` : 'no sound'}${note ? ` (${note})` : ''} · click: take the preset now on the lane's MIDI channel (MIDI Flow's Program Change) · Shift-click: forget it`
}
</script>

<template>
  <div class="grid grid-cols-3 gap-1.5 text-[10px] font-mono" data-seq-lanes>
    <div v-for="r in rows" :key="r.lane" :data-seq-lane="r.lane"
         class="flex flex-col gap-1 rounded border px-1.5 py-1 min-w-0"
         :class="active === r.lane ? r.c.ring : 'border-neutral-800 bg-neutral-950'">
      <div class="flex items-center gap-1 min-w-0">
        <button type="button" data-lane-pick class="font-black uppercase tracking-wider truncate hover:text-white"
                :class="active === r.lane ? r.c.text : 'text-neutral-500'"
                :title="`Show the ${r.cfg.label} lane`" @click="seqActiveLane = r.lane">{{ r.cfg.label }}</button>
        <span class="text-neutral-400 font-bold" :title="`${r.cfg.label}: bank ${bank(r)}`">{{ bank(r) }}</span>
        <span v-if="r.store.chainEnabled" data-lane-chain class="px-0.5 rounded bg-red-600/80 text-white text-[8px] font-black"
              :title="`${r.cfg.label}: Chain mode on (its chain in EDIT)`">CHN</span>
        <span class="flex-1" />
        <button type="button" data-lane-play class="w-5 h-5 rounded border text-[9px] leading-none"
                :class="[r.eng.isPlaying.value ? `${r.c.on} text-black border-transparent` : 'border-neutral-700 text-neutral-400 hover:text-white', r.eng.startPending.value ? 'animate-pulse' : '']"
                :title="`${r.cfg.label}: ${r.eng.isPlaying.value ? 'Stop' : 'Play'} · right-click: MIDI Learn`"
                @click="togglePlay(r)"
                @contextmenu.prevent="openMenu($event, { name: learnName(r.lane, 'play'), label: learnLabel(r.lane, 'Play') })">{{ r.eng.isPlaying.value ? '■' : '▶' }}</button>
        <button type="button" data-lane-mute class="w-5 h-5 rounded border text-[9px] font-black leading-none"
                :class="r.eng.laneMuted.value ? 'bg-red-600 border-red-400 text-white' : 'border-neutral-700 text-neutral-500 hover:text-white'"
                :title="`${r.cfg.label}: Mute (it plays on, silent) · right-click: MIDI Learn`"
                @click="r.eng.laneMuted.value = !r.eng.laneMuted.value"
                @contextmenu.prevent="openMenu($event, { name: learnName(r.lane, 'mute'), label: learnLabel(r.lane, 'Mute') })">M</button>
        <button type="button" data-lane-sync class="w-5 h-5 rounded border text-[9px] font-black leading-none"
                :class="r.eng.laneSync.value ? 'border-emerald-500/60 text-emerald-300 bg-emerald-500/10' : 'border-neutral-700 text-neutral-500 hover:text-white'"
                :title="`${r.cfg.label}: SYNC ${r.eng.laneSync.value ? 'ON — a start waits for the next bar (▶ blinks)' : 'OFF — a start plays now'} · a Rig pad keeps its Trigger sync`"
                @click="r.eng.laneSync.value = !r.eng.laneSync.value">S</button>
        <button type="button" data-lane-fit class="h-5 px-1 rounded border text-[9px] font-black leading-none"
                :class="r.eng.fitMode.value === 'chord' ? 'border-amber-500/60 text-amber-300 bg-amber-500/10' : 'border-neutral-700 text-neutral-500 hover:text-white'"
                :title="`${r.cfg.label}: Fit ${r.eng.fitMode.value === 'chord' ? 'CHORD — moved by degree, then fitted onto the Chord Prog\'s chord (beats on a chord tone, no b9 against it): borrowed chords don\'t clash' : 'SCALE — moved by degree in its scale only'} · click: ${r.eng.fitMode.value === 'chord' ? 'Scale' : 'Chord'} (Follow: Degree)`"
                @click="r.eng.fitMode.value = r.eng.fitMode.value === 'chord' ? 'scale' : 'chord'">{{ r.eng.fitMode.value === 'chord' ? 'CHD' : 'SCL' }}</button>
        <button type="button" data-lane-sound class="w-5 h-5 rounded border text-[10px] leading-none"
                :class="r.eng.bankSound.value ? (r.eng.laneSoundOn.value ? 'border-sky-500/60 text-sky-300 bg-sky-500/10' : 'border-neutral-600 text-neutral-500') : soundNote[r.lane] ? 'border-red-500/60 text-red-400' : 'border-neutral-700 text-neutral-500 hover:text-white'"
                :title="soundTitle(r)" @click="pickSound(r, $event)">♪</button>
        <select data-lane-ch :value="r.eng.laneChannel.value"
                class="bg-neutral-900 border border-neutral-700 rounded px-0.5 h-5 text-[9px] text-neutral-300 cursor-pointer [color-scheme:dark]"
                :title="`${r.cfg.label}: MIDI channel — G: the global one (MIDI Flow's remaps apply) · 1–16: sent on that channel as is`"
                @change="r.eng.laneChannel.value = Number($event.target.value)">
          <option v-for="ch in CHANNELS" :key="ch" :value="ch">{{ ch === 0 ? 'G' : ch }}</option>
        </select>
      </div>
      <button v-if="r.eng.bankSoundLabel.value" type="button" data-lane-sound-name
              class="text-left text-[9px] truncate hover:text-white"
              :class="r.eng.laneSoundOn.value ? 'text-sky-300/80' : 'text-neutral-600 line-through'"
              :title="`${r.cfg.label}: Program Change ${r.eng.laneSoundOn.value ? 'ON — the bank\'s sound is sent when it starts' : 'OFF — no Program Change sent'} · click: ${r.eng.laneSoundOn.value ? 'off' : 'on'}`"
              @click="r.eng.laneSoundOn.value = !r.eng.laneSoundOn.value">♪ {{ r.eng.bankSoundLabel.value }} <span class="font-black no-underline">{{ r.eng.laneSoundOn.value ? 'ON' : 'OFF' }}</span></button>
      <div class="flex gap-px h-1.5">
        <span v-for="(s, i) in cells(r)" :key="i" class="flex-1 rounded-[1px]"
              :class="r.eng.isPlaying.value && r.eng.gridCurrentStep.value === i ? 'bg-white'
                : s.active ? (r.eng.laneMuted.value ? 'bg-neutral-600' : r.c.on) : 'bg-neutral-800'" />
      </div>
    </div>
  </div>
</template>
