<script setup>
// Session > Songs (lib/songs.ts), the Rig Controller's Songs view: the songs of the session, a strip
// of the song's sections (width = bars, the lanes playing under each name), the section open below
// (its bars and, per lane, the slot A–H or silent), and the song's transport. The Rig panel plays it.
import { computed, ref, watch } from 'vue'
import { Play, Square, Pause, Plus, Copy, Trash2, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import {
  SONG_LANES, SONG_LANE_LABELS, SONG_SLOTS, SECTION_BAR_OPTIONS, MAX_SECTIONS, VOL_BAR_OPTIONS, SONG_FADE_OPTIONS, setSectionBars, setLaneClips, hasOwnClips, songVolKeys,
  newSong, newSection, exampleSong, songBars, sectionStartBar, activeLanes, barsLeft,
} from '@/lib/songs'
import { copyMaterial, dropMaterial, songMaterial } from '@/lib/song-material'
import { sessions, currentSession, copySongToSession } from '@/core/sessions'
import { slotName, slotLabel, promptSlotName } from '@/lib/slot-names'

const props = defineProps({
  lib: { type: Object, required: true },      // SongLibrary (reactive, saved by the panel)
  run: { type: Object, default: null },        // SongRun while a song plays
  filled: { type: Object, required: true },    // lane → boolean[8]: the slots with content
  lanesOn: { type: Object, required: true },   // lane → the row is connected (Bass / Arp lanes)
  live: { type: Boolean, default: false },
  chains: { type: Array, default: () => [] },  // the apps with their own chain on
  idle: { type: Boolean, default: true },      // the apps stopped: material can be switched
  materialPending: { type: Boolean, default: false }, // the song open waits for a stop to load its material
  chordCounts: { type: Array, default: () => [] },
  nameKeys: { type: Object, default: () => ({ drum: 'drum', chord: 'chord', seq: 'seq', bass: 'bass', arp: 'arp' }) }, // lane → slot-names key // the Chord Prog slots' step counts (A–H)
  channels: { type: Array, default: () => [] }, // the lanes' MIDI channels: { id, rows: [{ key, device, ch }] } (the Fade modal's)
})
const emit = defineEmits(['play', 'stop', 'hold', 'jump', 'own', 'capture'])

const song = computed(() => props.lib.songs.find(s => s.id === props.lib.currentId) ?? props.lib.songs[0])
const sel = ref(0)
watch(() => props.lib.currentId, () => { sel.value = 0 })
watch(() => song.value?.sections.length, n => { if (sel.value >= n) sel.value = Math.max(0, n - 1) })
const section = computed(() => song.value?.sections[sel.value] ?? null)
const playingHere = computed(() => props.run && props.run.songId === song.value?.id)
// While the song plays, the section open follows the one playing (a click opens another one until the next change)
watch(() => (playingHere.value ? props.run.index : null), i => { if (i !== null) sel.value = i }, { immediate: true })

// ── Songs ──
function addSong() {
  const s = newSong(`Song ${props.lib.songs.length + 1}`)
  props.lib.songs.push(s); props.lib.currentId = s.id
}
function addExample() {
  const s = exampleSong()
  props.lib.songs.push(s); props.lib.currentId = s.id
}
function duplicateSong() {
  const s = JSON.parse(JSON.stringify(song.value))
  const from = s.id
  s.id = Math.random().toString(36).slice(2, 10)
  if (s.own) copyMaterial(from, s.id)
  s.name = `${s.name} copy`
  for (const x of s.sections) x.id = Math.random().toString(36).slice(2, 10)
  props.lib.songs.push(s); props.lib.currentId = s.id
}
async function deleteSong() {
  if (props.lib.songs.length <= 1 || playingHere.value) return
  if (props.lib.loadedId === song.value.id && !props.idle) return alert("This song's material is in the apps: stop them first")
  if (!confirm(`Delete the song "${song.value.name}"${song.value.own ? ' and its material' : ''}?`)) return
  if (song.value.own) await dropMaterial(props.lib, song.value) // loaded: the session's slots come back
  const i = props.lib.songs.indexOf(song.value)
  props.lib.songs.splice(i, 1)
  props.lib.currentId = props.lib.songs[Math.max(0, i - 1)].id
}

// ── Copy to another session of the project (with its own material) ──
const otherSessions = computed(() => sessions.value.filter(x => x.id !== currentSession.value?.id))
const copyMsg = ref('')
async function copyTo(e) {
  const id = e.target.value
  e.target.value = ''
  if (!id || !song.value) return
  const name = await copySongToSession(song.value.id, id)
  const to = sessions.value.find(x => x.id === id)?.name ?? ''
  copyMsg.value = name ? `“${name}” copied to ${to}${song.value.own ? ' with its material' : " (it plays that session's slots)"}` : 'Not copied'
  setTimeout(() => { copyMsg.value = '' }, 5000)
}

// ── Sections ──
function addSection() {
  const secs = song.value.sections
  if (secs.length >= MAX_SECTIONS) return
  const from = section.value
  const s = newSection(`Section ${secs.length + 1}`, from?.bars ?? 8, from ? { ...from.lanes } : {})
  if (from) { s.vol = { ...from.vol }; s.volBars = from.volBars; s.chordSteps = from.chordSteps; s.drumDensity = from.drumDensity }
  secs.splice(sel.value + 1, 0, s)
  sel.value += secs.length > 1 ? 1 : 0
}
function duplicateSection() {
  if (!section.value || song.value.sections.length >= MAX_SECTIONS) return
  const s = newSection(section.value.name, section.value.bars, { ...section.value.lanes })
  s.vol = { ...section.value.vol }; s.volBars = section.value.volBars; s.chordSteps = section.value.chordSteps; s.drumDensity = section.value.drumDensity
  if (section.value.clips) s.clips = JSON.parse(JSON.stringify(section.value.clips))
  song.value.sections.splice(sel.value + 1, 0, s)
  sel.value += 1
}
function deleteSection() {
  if (song.value.sections.length <= 1 || playingHere.value) return
  song.value.sections.splice(sel.value, 1)
}
function moveSection(d) {
  if (playingHere.value) return
  const secs = song.value.sections, j = sel.value + d
  if (j < 0 || j >= secs.length) return
  ;[secs[sel.value], secs[j]] = [secs[j], secs[sel.value]]
  sel.value = j
}
// a slot picked here: one clip over the whole section (clips placed in the Session Browser are replaced)
const setSlot = (lane, v) => { const n = section.value.lanes[lane] === v && !hasOwnClips(section.value, lane) ? null : v; setLaneClips(section.value, lane, n === null ? [] : [{ slot: n, start: 1, len: section.value.bars }]) }

// ── Volumes per channel (% of the channel's Max in the Fade modal) ──
const laneChannels = lane => props.channels.find(c => c.id === lane)?.rows ?? []
const volKeys = computed(() => new Set(song.value ? songVolKeys(song.value) : []))
/** The section's % on a channel: set here, else 100 if the song sets it elsewhere, else null (left alone). */
const volOf = key => section.value.vol[key] ?? (volKeys.value.has(key) ? 100 : null)
const setVol = (key, v) => { section.value.vol[key] = Math.max(0, Math.min(100, Math.round(Number(v)))) }
const clearVol = key => { delete section.value.vol[key] }
const chName = r => `${r.device.replace(/\s*\(.*\)$/, '')} ch${r.ch + 1}`
const barLabel = b => (b === 0.5 ? '½' : b === 0 ? 'Cut' : String(b))

// ── Chord lane: how many chords of its slot the section loops on ──
const chordCount = computed(() => (section.value?.lanes.chord != null ? props.chordCounts[section.value.lanes.chord] ?? 0 : 0))
const stepsOver = computed(() => section.value?.chordSteps != null && chordCount.value > 0 && section.value.chordSteps >= chordCount.value)

// ── Drum lane: the Rig's Density in the section ──
const densityUsed = computed(() => song.value?.sections.some(s => s.drumDensity != null) ?? false)
const densityShown = computed(() => section.value?.drumDensity ?? (densityUsed.value ? 127 : null))

// ── Slot names (lib/slot-names.ts): `Verse-A` ──
const nameOf = (lane, v) => (v == null ? '' : slotName(props.nameKeys[lane] ?? lane, v))
const labelFor = (lane, v) => (v == null ? '–' : slotLabel(props.nameKeys[lane] ?? lane, v))
/** The strip: the lanes playing in a section, by their slot's label. */
const sectionLanes = sec => activeLanes(sec).map(l => `${SONG_LANE_LABELS[l]} ${labelFor(l, sec.lanes[l])}`).join(', ')

// ── Look ──
const isCurrent = i => playingHere.value && props.run.index === i && props.run.bar > 0
const isQueued = i => playingHere.value && (props.run.queued === i || (props.run.bar === 0 && props.run.index === i))
const progress = i => (isCurrent(i) ? Math.min(1, props.run.bar / song.value.sections[i].bars) : 0)
function blockClass(i) {
  if (isCurrent(i)) return 'border-emerald-300 bg-emerald-500/25'
  if (isQueued(i)) return 'border-amber-300 bg-amber-500/20 animate-pulse'
  return sel.value === i ? 'border-white/50 bg-white/10' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
}
const status = computed(() => {
  if (!playingHere.value) return props.run ? 'Another song is playing' : 'Stopped'
  const r = props.run, s = song.value, sec = s.sections[r.index]
  if (r.stay) return r.bar <= sec.bars ? 'Last bar · Stay: the lanes stay on, the Chord holds its last chord' : 'Stay: the lanes stay on, the Chord holds its last chord — Stop song to end'
  if (r.stopping) return 'Last bar · the lanes stop on the next bar line'
  if (r.bar === 0) return `${sec.name}: waiting for the bar line / Play`
  const next = r.queued !== null ? s.sections[r.queued].name : r.hold ? 'Hold' : s.end === 'staySection' && r.index === s.sections.length - 1 ? 'Stay on section (Stop song to end)' : null
  return `${sec.name} · bar ${r.bar}/${sec.bars} (song bar ${sectionStartBar(s, r.index) + r.bar - 1}) · ${barsLeft(r, s)} left${next ? ` · next: ${next}` : ''}`
})
const slotClass = (lane, v) => {
  const on = section.value.lanes[lane] === v
  if (on) return 'bg-emerald-500/80 border-emerald-300 text-black'
  return props.filled[lane]?.[v] ? 'border-amber-400/40 text-amber-200 hover:bg-white/10' : 'border-white/10 text-neutral-500 hover:bg-white/10'
}
// ── Material (SG4) ──
const loadedName = computed(() => props.lib.songs.find(s => s.id === props.lib.loadedId)?.name ?? null)
const hasMaterial = computed(() => !!songMaterial.byKey[song.value?.id])
const materialText = computed(() => {
  if (!song.value.own) return loadedName.value ? `The session's slots · the apps hold "${loadedName.value}" now: they come back at a stop` : "The session's slots (the apps' A–H)"
  if (props.lib.loadedId === song.value.id) return 'Its own material: in the apps now — what you change there stays in the song'
  return props.materialPending ? 'Its own material: loads into the apps at the next stop' : 'Its own material'
})
function toggleOwn() {
  if (song.value.own && !confirm(`"${song.value.name}" back to the session's slots? Its own material is deleted.`)) return
  emit('own', !song.value.own)
}
function capture() {
  if (hasMaterial.value && props.lib.loadedId !== song.value.id && !confirm(`Replace the material of "${song.value.name}" with the apps' slots as they are now?`)) return
  emit('capture')
}
const btn = 'px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-wider disabled:opacity-30'
</script>

<template>
  <div class="flex flex-col gap-3 text-neutral-300" @keydown.stop>
    <!-- Songs + transport -->
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Song</span>
      <select v-model="lib.currentId" class="bg-black/40 border border-white/10 rounded px-2 py-1 text-white">
        <option v-for="(s, i) in lib.songs" :key="s.id" :value="s.id">{{ String(i + 1).padStart(3, '0') }} · {{ s.name }}</option>
      </select>
      <input v-model="song.name" maxlength="40" class="w-40 bg-black/40 border border-white/10 rounded px-2 py-1 text-white" title="The song's name" />
      <button :class="[btn, 'border-white/15 hover:bg-white/10']" title="A new song" @click="addSong"><Plus class="w-3 h-3 inline" /> New</button>
      <button :class="[btn, 'border-white/15 hover:bg-white/10']" title="Duplicate the song" @click="duplicateSong"><Copy class="w-3 h-3 inline" /></button>
      <button :class="[btn, 'border-white/15 hover:bg-white/10']" :disabled="lib.songs.length <= 1 || playingHere" title="Delete the song" @click="deleteSong"><Trash2 class="w-3 h-3 inline" /></button>
      <button :class="[btn, 'border-white/15 hover:bg-white/10']" title="Add the example song (Nightline)" @click="addExample">+ Example</button>
      <select v-if="otherSessions.length" class="bg-black/40 border border-white/10 rounded px-1 py-1 text-[10px] text-neutral-300"
              :title="song.own ? 'Copy this song, with its own material, into another session of the project' : 'Copy this song into another session (it plays that session\'s slots A–H: give it its own material first to take its patterns along)'"
              @change="copyTo">
        <option value="">Copy to session…</option>
        <option v-for="x in otherSessions" :key="x.id" :value="x.id">{{ x.name }}</option>
      </select>
      <label class="flex items-center gap-1 text-[10px] uppercase tracking-wider text-neutral-500">End
        <select v-model="song.end" class="bg-black/40 border border-white/10 rounded px-1 py-1 text-white normal-case">
          <option value="stop">Stop</option>
          <option value="loop">Loop</option>
          <option value="stay">Stay on last bar</option>
          <option value="staySection">Stay on section</option>
        </select>
      </label>
      <label class="flex items-center gap-1 text-[10px] uppercase tracking-wider text-neutral-500"
             title="Fade Out before the lanes stop (Stop song, End Stop) — Rig: the Fade Out set in Performance · Cut: none · bars: this song's own, on every channel">Out
        <select v-model="song.fadeOut" class="bg-black/40 border border-white/10 rounded px-1 py-1 text-white normal-case">
          <option v-for="v in SONG_FADE_OPTIONS" :key="String(v)" :value="v">{{ v === 'rig' ? 'Rig (Performance)' : v === 0 ? 'Cut' : `${v === 0.5 ? '½' : v} bar${v > 1 ? 's' : ''}` }}</option>
        </select>
      </label>
      <span class="ml-auto flex items-center gap-2">
        <button v-if="!playingHere" :class="[btn, 'border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/20']" :disabled="!live"
                :title="live ? `Play the song from ${section?.name ?? 'the start'} (playing: on the next bar line; stopped: it starts the Play, with its count-in)` : 'Songs play in LIVE mode'"
                @click="emit('play', sel)"><Play class="w-3 h-3 inline" /> Play from {{ section?.name }}</button>
        <template v-else>
          <button :class="[btn, run.hold ? 'bg-amber-500/80 border-amber-300 text-black' : 'border-amber-400/50 text-amber-300 hover:bg-amber-500/20']"
                  title="Hold: the section playing loops until released" @click="emit('hold', !run.hold)"><Pause class="w-3 h-3 inline" /> Hold</button>
          <button :class="[btn, 'border-red-400/50 text-red-300 hover:bg-red-500/20']" title="Stop the song: the lanes stop on the next bar line" @click="emit('stop')"><Square class="w-3 h-3 inline" /> Stop song</button>
        </template>
      </span>
    </div>

    <div v-if="copyMsg" class="text-[10px] font-mono text-sky-300">{{ copyMsg }}</div>
    <div class="flex flex-wrap items-center gap-2 text-[10px]">
      <span class="font-bold uppercase tracking-widest text-neutral-500">Material</span>
      <button :class="[btn, song.own ? 'bg-sky-500/70 border-sky-300 text-black' : 'border-white/15 hover:bg-white/10']"
              :disabled="song.own && lib.loadedId === song.id && !idle"
              :title="song.own ? 'The song has its own slots A–H (Drum, Chord, Seq lanes), tempo and key. Click: back to the session\'s slots' : 'Give the song its own slots: the apps\' slots as they are now become its material'"
              @click="toggleOwn">{{ song.own ? 'Own material' : "Session's slots" }}</button>
      <button v-if="song.own && lib.loadedId !== song.id" :class="[btn, 'border-white/15 hover:bg-white/10']"
              :title="`The slots in the apps now (${loadedName ? `those of “${loadedName}”` : 'the session\'s'}) are copied into this song, replacing its material, and stay in the apps`" @click="capture">Take the apps' slots</button>
      <span :class="song.own ? 'text-sky-300' : 'text-neutral-500'">{{ materialText }}</span>
    </div>

    <div class="flex items-center gap-3 text-[10px] font-mono">
      <span class="text-neutral-500">{{ song.sections.length }} sections · {{ songBars(song) }} bars</span>
      <span :class="playingHere ? 'text-emerald-300' : 'text-neutral-500'">{{ status }}</span>
      <span v-if="chains.length" class="text-amber-300">{{ chains.join(', ') }} Chain on: switched off when the song plays</span>
    </div>

    <!-- The strip: each section as wide as its bars -->
    <div class="flex gap-1 w-full overflow-x-auto pb-1">
      <button v-for="(sec, i) in song.sections" :key="sec.id"
              class="relative shrink-0 min-w-[64px] h-16 rounded border px-1.5 py-1 text-left overflow-hidden transition-colors"
              :class="blockClass(i)" :style="{ flexGrow: sec.bars, flexBasis: 0 }"
              :title="`${sec.name} · ${sec.bars} bars · ${sectionLanes(sec) || 'silent'}${playingHere ? ' — double-click: go there on the next bar line' : ''}`"
              @click="sel = i" @dblclick="playingHere && emit('jump', i)">
        <div class="text-[10px] font-black uppercase tracking-wider text-white truncate">{{ sec.name }}</div>
        <div class="text-[9px] font-mono text-neutral-400">{{ sec.bars }} bars</div>
        <div class="absolute bottom-1.5 left-1.5 right-1.5 flex gap-0.5">
          <span v-for="l in SONG_LANES" :key="l" class="h-1.5 flex-1 rounded-sm"
                :class="sec.lanes[l] !== null ? 'bg-amber-300/80' : 'bg-white/10'" :title="`${SONG_LANE_LABELS[l]}: ${sec.lanes[l] !== null ? labelFor(l, sec.lanes[l]) : 'silent'}`"></span>
        </div>
        <div v-if="isCurrent(i)" class="absolute top-0 left-0 h-0.5 bg-emerald-300" :style="{ width: `${progress(i) * 100}%` }"></div>
      </button>
    </div>

    <!-- The section open -->
    <div v-if="section" class="p-3 rounded-lg bg-white/[0.03] border border-white/10 space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <input v-model="section.name" maxlength="24" class="w-36 bg-black/40 border border-white/10 rounded px-2 py-1 text-white font-bold uppercase" />
        <span class="text-[10px] uppercase tracking-wider text-neutral-500">Bars</span>
        <div class="flex rounded border border-white/10 overflow-hidden">
          <button v-for="b in SECTION_BAR_OPTIONS" :key="b" class="px-2 py-1 text-[10px] font-mono"
                  :class="section.bars === b ? 'bg-white/20 text-white' : 'text-neutral-400 hover:bg-white/10'" @click="setSectionBars(section, b)">{{ b }}</button>
        </div>
        <span class="ml-auto flex items-center gap-1">
          <button :class="[btn, 'border-white/15 hover:bg-white/10']" :disabled="sel === 0 || playingHere" title="Move left" @click="moveSection(-1)"><ChevronLeft class="w-3 h-3" /></button>
          <button :class="[btn, 'border-white/15 hover:bg-white/10']" :disabled="sel === song.sections.length - 1 || playingHere" title="Move right" @click="moveSection(1)"><ChevronRight class="w-3 h-3" /></button>
          <button :class="[btn, 'border-white/15 hover:bg-white/10']" :disabled="song.sections.length >= MAX_SECTIONS" title="Add a section after this one (same lanes)" @click="addSection"><Plus class="w-3 h-3 inline" /> Section</button>
          <button :class="[btn, 'border-white/15 hover:bg-white/10']" :disabled="song.sections.length >= MAX_SECTIONS" title="Duplicate the section" @click="duplicateSection"><Copy class="w-3 h-3 inline" /></button>
          <button :class="[btn, 'border-white/15 hover:bg-white/10']" :disabled="song.sections.length <= 1 || playingHere" title="Delete the section" @click="deleteSection"><Trash2 class="w-3 h-3 inline" /></button>
          <button v-if="playingHere" :class="[btn, 'border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/20']" title="Go to this section on the next bar line" @click="emit('jump', sel)">Go</button>
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-[10px] uppercase tracking-wider text-neutral-500" title="The volumes set below reach their level from the section's first bar line over these bars (Cut: on it)">Vol ramp</span>
        <div class="flex rounded border border-white/10 overflow-hidden">
          <button v-for="b in VOL_BAR_OPTIONS" :key="b" class="px-2 py-1 text-[10px] font-mono"
                  :class="section.volBars === b ? 'bg-white/20 text-white' : 'text-neutral-400 hover:bg-white/10'" @click="section.volBars = b">{{ barLabel(b) }}</button>
        </div>
        <span class="text-[10px] text-neutral-500">bars · volume per channel: % of its Max (Fade modal), sent as CC 7</span>
      </div>
      <template v-for="l in SONG_LANES" :key="l">
      <div class="flex flex-wrap items-center gap-1" :class="lanesOn[l] ? '' : 'opacity-40'">
        <span class="w-12 text-[10px] font-bold uppercase tracking-wider" :title="lanesOn[l] ? '' : 'This row is not on a lane / not connected: the song leaves it alone'">{{ SONG_LANE_LABELS[l] }}</span>
        <button class="w-9 h-10 rounded border text-[11px] font-mono"
                :class="section.lanes[l] === null ? 'bg-white/15 border-white/30 text-white' : 'border-white/10 text-neutral-500 hover:bg-white/10'"
                title="Silent in this section" @click="setLaneClips(section, l, [])">–</button>
        <button v-for="(L, v) in SONG_SLOTS" :key="L" class="relative w-16 h-10 px-1 rounded border font-mono flex items-center justify-center"
                :class="slotClass(l, v)" :title="`${SONG_LANE_LABELS[l]} ${labelFor(l, v)}${filled[l]?.[v] ? '' : ' (empty)'} — right-click: name`"
                @click="setSlot(l, v)" @contextmenu.prevent="promptSlotName(nameKeys[l] ?? l, v, `${SONG_LANE_LABELS[l]} slot`)">
          <template v-if="nameOf(l, v)">
            <span class="absolute top-0.5 left-1 text-[8px] font-bold opacity-70">{{ L }}</span>
            <span class="text-[9px] leading-[1.1] font-sans font-semibold text-center break-words overflow-hidden mt-1"
                  style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical">{{ nameOf(l, v) }}</span>
          </template>
          <span v-else class="text-[11px] font-bold">{{ L }}</span>
        </button>
        <span v-if="hasOwnClips(section, l)" class="text-[9px] text-sky-300" title="Clips placed on some bars (Session Browser): a slot picked here plays it over the whole section">{{ (section.clips[l] || []).length }} clips · Browser</span>
        <template v-if="l === 'drum' && section.lanes.drum !== null">
          <span class="ml-2 text-[10px] uppercase tracking-wider text-neutral-500" title="The Rig's Drum Density in this section: 127 as written, lower the weakest steps go first (the downbeat stays). On the section's bar line">Density</span>
          <input type="range" min="0" max="127" step="1" class="w-28 accent-sky-400" :class="densityShown === null ? 'opacity-40' : ''"
                 :value="densityShown ?? 127" @input="section.drumDensity = Number($event.target.value)" />
          <span class="w-8 text-right text-[10px] font-mono" :class="section.drumDensity != null ? 'text-white' : 'text-neutral-600'"
                :title="densityShown === null ? 'Not set in the song: the Density is left as it is' : section.drumDensity == null ? 'Not set here: 127 (set in other sections)' : ''">{{ densityShown ?? '—' }}</span>
          <button v-if="section.drumDensity != null" class="text-[10px] text-neutral-500 hover:text-white" title="Not set in this section (127 if the song sets it elsewhere)" @click="section.drumDensity = null">×</button>
        </template>
        <template v-if="l === 'chord' && section.lanes.chord !== null && chordCount > 1">
          <span class="ml-2 text-[10px] uppercase tracking-wider text-neutral-500" title="The section loops on the first chords of the slot (All: the whole progression). A change comes in on the bar line, from the first chord">Steps</span>
          <div class="flex rounded border border-white/10 overflow-hidden">
            <button class="px-2 py-1 text-[10px] font-mono" :class="section.chordSteps === null || stepsOver ? 'bg-white/20 text-white' : 'text-neutral-400 hover:bg-white/10'"
                    :title="`All ${chordCount} chords`" @click="section.chordSteps = null">All</button>
            <button v-for="n in chordCount - 1" :key="n" class="px-2 py-1 text-[10px] font-mono"
                    :class="section.chordSteps === n ? 'bg-sky-500/70 text-black' : 'text-neutral-400 hover:bg-white/10'"
                    :title="n === 1 ? 'Latch on chord 1: it holds for the whole section (the Rig\'s Latch 1)' : `Loop on chords 1–${n} of ${chordCount}`" @click="section.chordSteps = n">{{ n === 1 ? '1 · Latch' : n }}</button>
          </div>
        </template>
      </div>
      <div v-if="laneChannels(l).length" class="flex flex-wrap gap-x-4 gap-y-1 pl-14">
        <div v-for="r in laneChannels(l)" :key="r.key" class="flex items-center gap-1.5 text-[10px]"
             :title="volOf(r.key) === null ? `${chName(r)}: the song leaves its volume alone — move it to set it` : section.vol[r.key] === undefined ? `${chName(r)}: not set in this section — 100% (set in other sections)` : `${chName(r)}: ${section.vol[r.key]}% of its Max in this section`">
          <span class="w-28 truncate font-mono" :class="section.vol[r.key] !== undefined ? 'text-sky-300' : 'text-neutral-500'">{{ chName(r) }}</span>
          <input type="range" min="0" max="100" step="1" class="w-24 accent-sky-400" :class="volOf(r.key) === null ? 'opacity-40' : ''"
                 :value="volOf(r.key) ?? 100" @input="setVol(r.key, $event.target.value)" />
          <span class="w-8 text-right font-mono" :class="section.vol[r.key] !== undefined ? 'text-white' : 'text-neutral-600'">{{ volOf(r.key) === null ? '—' : `${volOf(r.key)}%` }}</span>
          <button v-if="section.vol[r.key] !== undefined" class="text-neutral-500 hover:text-white" title="Not set in this section (100% if the song sets it elsewhere)" @click="clearVol(r.key)">×</button>
        </div>
      </div>
      </template>
      <div class="text-[10px] text-neutral-500">Amber: slots with content. The song points to the slots: change a slot in its app and every song using it plays the new one.</div>
    </div>
  </div>
</template>
