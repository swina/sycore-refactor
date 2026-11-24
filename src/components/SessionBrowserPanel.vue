<script setup>
// Session Browser (docs/plans/projects-and-control.md phase 6; mockup "Session Browser"): the
// project's sessions and their songs, and the song open as an arrangement — sections across, lanes
// down, each cell a clip (the slot playing there, by its name: Verse-A). Slots of each lane to drag
// into the song; the clip selected sets its slot, Density, Chord steps below. The songs play in the
// Rig (its player: lib/songs.ts songCommand); the bar, section and chords show here while they do.
import { computed, ref, watch, nextTick } from 'vue'
import { ChevronRight, ChevronLeft, Plus, Copy, Trash2, Play, Square, Pause, Lock, Link2, Sparkles, Save, Pencil, ArrowLeft, ArrowRight } from 'lucide-vue-next'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import PlayPanelHeader from '@/components/play/PlayPanelHeader.vue'
import { usePlayView } from '@/composables/usePlayView'
import ResizeHandles from '@/components/ui/ResizeHandles.vue'
import { useUiStore } from '@/stores/useUiStore'
import { useChordProgStore } from '@/stores/useChordProgStore'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { useSeqLaneStore } from '@/stores/useStepSequencerStore'
import { useArpStore } from '@/stores/useArpStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useVirtualDeviceStore } from '@/stores/useVirtualDeviceStore'
import { laneSoundLabel } from '@/lib/lane-sound'
import { rowLane, chordSnapshot, drumSnapshot, seqSnapshot, bassSnapshot } from '@/lib/rig-live'
import {
  songLibrary, songRun, songCommand, songPaused, songPreview, songXfadeBars, setSongXfade, SONG_XFADE_OPTIONS, rigLaneMutes, SONG_FADE_OPTIONS, songChannels, songVolKeys, SONG_LANES, SONG_LANE_LABELS, SONG_SLOTS, SECTION_BAR_OPTIONS, laneClips, hasOwnClips, setLaneClips, clipFits, setSectionBars, VOL_BAR_OPTIONS,
  MAX_SECTIONS, newSong, newSection, exampleSong, songBars, sectionStartBar, barsLeft,
  clipAt, samePreset, setClipPreset, clearClipPresets, isPresetEcho, AUDIO_SONG_LANES, songAudioOf, okBpm,
} from '@/lib/songs'
import {
  sessions, currentSession, pendingSession, loadSession, newSession, renameSession, duplicateSession, deleteSession,
  saveCurrentSession, copySongToSession, materialPending,
} from '@/core/sessions'
import { captureInto, dropMaterial, copyMaterial } from '@/lib/song-material'
import { slotName, promptSlotName, labelOf, setSlotName, SLOT_NAME_MAX } from '@/lib/slot-names'
import { saveSongSample } from '@/lib/song-samples'
import { useRigCaptures } from '@/core/engines/rig-captures'
import { useAuthStore } from '@/stores/useAuthStore'
import { useArpStore as useTempoStore } from '@/stores/useArpStore'
import { collection, query, orderBy, getDocs, db } from '@/lib/idb'

const emit = defineEmits(['close'])
const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
  storageKey: 'SYCORE_POS_SESSION_BROWSER',
  minimizeLabel: 'Sessions',
  initialWidth: 1240,
  initialHeight: 720,
  minWidth: 760,
  minHeight: 420,
  zIndex: 166,
  panelId: 'session-browser',
})

const ui = useUiStore()
// Performance (play views): the song as in EDIT, without the Slots pane (dragging slots into the song: EDIT)
const { play: playMode } = usePlayView('session-browser')
const cp = useChordProgStore()
const dm = useDrumMachineStore()
const arp = useArpStore()
const lanes = { main: useSeqLaneStore('main'), bass: useSeqLaneStore('bass'), arp: useSeqLaneStore('arp') }
const midiStore = useMidiStore()
const lib = songLibrary()

const msg = ref('')
let msgTimer = null
function say(t) { msg.value = t; clearTimeout(msgTimer); msgTimer = setTimeout(() => { msg.value = '' }, 4000) }

// ── Sessions › Songs (the pane on the left; folded to a strip when a song is open) ──
const collapsed = ref(!!lib.currentId)
const browseId = ref(currentSession.value?.id ?? null)
watch(() => currentSession.value?.id, id => { browseId.value = id ?? null })
const browsed = computed(() => sessions.value.find(s => s.id === browseId.value) ?? currentSession.value)
const browsingCurrent = computed(() => !!browsed.value && browsed.value.id === currentSession.value?.id)
const browsedSongs = computed(() => (browsingCurrent.value ? lib.songs : browsed.value?.data.songs?.songs ?? []))

const song = computed(() => lib.songs.find(s => s.id === lib.currentId) ?? null)
function openSong(id) {
  if (!lib.songs.some(s => s.id === id)) return // another session's song: load that session first
  lib.currentId = id
  sel.value = 0; selLane.value = null; selClip.value = null
  collapsed.value = true
}
async function pickLoad() {
  const s = browsed.value
  if (!s || browsingCurrent.value) return
  const r = await loadSession(s.id)
  say(r === 'pending' ? `${s.name}: loads at the next stop` : r === 'now' ? `Loaded: ${s.name}` : '')
}
const sessionSummary = s => {
  const n = s.id === currentSession.value?.id ? lib.songs.length : s.data.songs?.songs?.length ?? 0
  const bpm = s.id === currentSession.value?.id ? arp.arpBpm : s.data.engines?.bpm
  return `${n} song${n === 1 ? '' : 's'}${bpm ? ` · ${Math.round(bpm)} BPM` : ''}`
}
const newSessionName = ref('')
async function addSession() {
  const s = await newSession(newSessionName.value || 'Session')
  newSessionName.value = ''
  if (s) say(`New session: ${s.name} (from what is in the apps now)`)
}
function renameSessionPrompt(s) {
  const v = window.prompt('Session name', s.name)
  if (v) renameSession(s.id, v)
}
async function removeSession(s) {
  if (!confirm(`Delete the session "${s.name}" and its songs?`)) return
  if (!(await deleteSession(s.id))) say('The current session (or the last one) can\'t be deleted')
}
async function save() { await saveCurrentSession(); say(`Saved: ${currentSession.value?.name ?? ''}`) }

// songs: new ▾, rename, duplicate, delete, order (drag), copy to another session (drag onto it)
const newMenu = ref(false)
function addSongFrom(kind) {
  newMenu.value = false
  if (kind === 'ai') {
    ui.isChordProgOpen = true
    nextTick(() => setTimeout(() => window.dispatchEvent(new CustomEvent('open-song-composer', { detail: { autoSong: true } })), 150))
    say('AI Composer: Compose, then Load — the song is made with its own patterns')
    return
  }
  const s = kind === 'example' ? exampleSong() : newSong(`Song ${lib.songs.length + 1}`)
  lib.songs.push(s)
  openSong(s.id)
  if (kind === 'apps') captureInto(lib, s).then(() => say(`${s.name}: the apps' slots are its own patterns`))
}
function renameSong(s) {
  const v = window.prompt('Song name', s.name)
  if (v?.trim()) s.name = v.trim().slice(0, 40)
}
async function duplicateSong(s) {
  const c = JSON.parse(JSON.stringify(s))
  c.id = Math.random().toString(36).slice(2, 10)
  c.name = `${s.name} copy`.slice(0, 40)
  for (const x of c.sections) x.id = Math.random().toString(36).slice(2, 10)
  if (s.own) await copyMaterial(s.id, c.id)
  lib.songs.splice(lib.songs.indexOf(s) + 1, 0, c)
}
async function deleteSong(s) {
  if (lib.songs.length <= 1 || songRun.value?.songId === s.id) return
  if (!confirm(`Delete the song "${s.name}"${s.own ? ' and its patterns' : ''}?`)) return
  if (s.own) await dropMaterial(lib, s)
  const i = lib.songs.indexOf(s)
  lib.songs.splice(i, 1)
  if (lib.currentId === s.id) lib.currentId = lib.songs[Math.max(0, i - 1)]?.id ?? null
}
const drag = ref(null) // { kind: 'song', id } | { kind: 'slot', lane, slot }
const dropSession = ref(null)
function onSongDragStart(e, s) {
  drag.value = { kind: 'song', id: s.id }
  e.dataTransfer.effectAllowed = 'copyMove'
  e.dataTransfer.setData('text/plain', s.name)
}
function onSongDrop(target) {
  const d = drag.value
  drag.value = null
  if (d?.kind !== 'song' || d.id === target.id) return
  const from = lib.songs.findIndex(x => x.id === d.id)
  const to = lib.songs.findIndex(x => x.id === target.id)
  if (from < 0 || to < 0) return
  const [m] = lib.songs.splice(from, 1)
  lib.songs.splice(to, 0, m)
}
async function onSessionDrop(s) {
  const d = drag.value
  drag.value = null
  dropSession.value = null
  if (d?.kind !== 'song' || s.id === currentSession.value?.id) return
  const name = await copySongToSession(d.id, s.id)
  say(name ? `“${name}” copied to ${s.name}` : 'Not copied')
}

// ── The song open ──
const sel = ref(0)        // the section selected
const selLane = ref(null) // the clip selected: its lane (null: the section)
watch(() => song.value?.sections.length, n => { if (n != null && sel.value >= n) sel.value = Math.max(0, n - 1) })
const section = computed(() => song.value?.sections[sel.value] ?? null)
const total = computed(() => (song.value ? songBars(song.value) : 0))

// slot names per lane: Bass is the Sequencer's Bass lane, or the Drum Machine's basslines
const nameKey = l => (l === 'bass' ? (rowLane('bass') ? 'bass' : 'dmBass') : l)
// The song's own lanes: Tracks / Samples (song.audio, their slots the song's) and Capture (the Rig's pads C1–C8)
const captures = useRigCaptures()
const isAudioLane = l => AUDIO_SONG_LANES.includes(l)
const ownLane = l => isAudioLane(l) || l === 'capture'
const audioSlot = (l, v) => song.value?.audio?.[l]?.[v] ?? null
const slotLetter = (l, v) => (l === 'capture' ? `C${v + 1}` : SONG_SLOTS[v])
const nameOf = (l, v) => {
  if (v == null) return ''
  if (l === 'track') { const t = audioSlot(l, v); return t ? `${t.label}${t.retrigger ? ' ↻' : ''}` : '' }
  if (l === 'sample') { const s = audioSlot(l, v); return s ? `${s.name}${s.mode === 'loop' ? ' ⟳' : ''}` : '' }
  if (l === 'capture') return ''
  return slotName(nameKey(l), v)
}
const slotLabel = (l, v) => (v == null ? '–' : ownLane(l) ? nameOf(l, v) || slotLetter(l, v) : labelOf(slotName(nameKey(l), v), v))

// ── Volumes per channel (% of the channel's Max in the Rig's Fade modal), per section ──
const chName = r => `${r.device.replace(/\s*\(.*\)$/, '')} ch${r.ch + 1}`
const volKeys = computed(() => new Set(song.value ? songVolKeys(song.value) : []))
/** The lane's channels as the Rig saw them; none known yet: the ones the song already sets (any lane). */
const laneChannels = l => songChannels.value.find(c => c.id === l)?.rows ?? []
const volOf = key => section.value?.vol[key] ?? (volKeys.value.has(key) ? 100 : null)
const setVol = (key, v) => { section.value.vol[key] = Math.max(0, Math.min(100, Math.round(Number(v)))) }
const clearVol = key => { delete section.value.vol[key] }
// the slots with content, per lane
const filled = computed(() => ({
  chord: chordSnapshot(cp.slots, cp.activeSlotIndex, null, false, null).filled,
  drum: drumSnapshot(dm.sequences, undefined, dm.activeSequence, false, null).filled,
  seq: seqSnapshot(lanes.main.banks, lanes.main.activeBankIndex, false, null).filled,
  bass: rowLane('bass') ? seqSnapshot(lanes.bass.banks, lanes.bass.activeBankIndex, false, null).filled : bassSnapshot(dm.basslineSequences, true, dm.activeSequence, false, null).filled,
  arp: rowLane('arp') ? seqSnapshot(lanes.arp.banks, lanes.arp.activeBankIndex, false, null).filled : Array(8).fill(true),
  track: Array.from({ length: 8 }, (_, v) => !!audioSlot('track', v)),
  sample: Array.from({ length: 8 }, (_, v) => !!audioSlot('sample', v)),
  capture: Array.from({ length: 8 }, (_, v) => !!captures.state.clips[v]),
}))

// ── The Tracks / Samples slots (right-click): a library track · a sound from the Sound Folder Browser, One-shot / Loop ──
const authStore = useAuthStore()
const tempoStore = useTempoStore()
const audioMenu = ref(null) // { lane, v, x, y }
const libTracks = ref([])
async function openAudioMenu(e, l, v) {
  audioMenu.value = { lane: l, v, x: Math.min(e.clientX, window.innerWidth - 300), y: Math.min(e.clientY, window.innerHeight - 340) }
  if (l !== 'track') return
  const uid = authStore.user?.uid
  if (!uid) { libTracks.value = []; return }
  try {
    const snap = await getDocs(query(collection(db, 'users', uid, 'backing_tracks'), orderBy('createdAt', 'desc')))
    const ts = []
    snap.forEach(d => { const x = d.data(); ts.push({ id: d.id, label: x.label || 'Track', bpm: x.bpm ?? null, duration: x.duration ?? null }) })
    libTracks.value = ts
  } catch { libTracks.value = [] }
}
function setTrackSlot(t) {
  const m = audioMenu.value
  if (!m || !song.value) return
  const prev = songAudioOf(song.value).track[m.v]
  songAudioOf(song.value).track[m.v] = t ? { id: t.id, label: t.label, bpm: t.bpm, duration: t.duration, ...(prev?.retrigger ? { retrigger: true } : {}), ...(prev?.fit === 'varispeed' && t.bpm ? { fit: 'varispeed' } : {}) } : null
  audioMenu.value = null
  if (t) say(`Tracks ${SONG_SLOTS[m.v]}: ${t.label}`)
}
const tempoOff = t => !!t?.bpm && Math.abs(t.bpm - (song.value?.bpm || tempoStore.arpBpm || 120)) > 0.5
/** A BPM typed (empty: none); the song's / a section's tempo. */
const bpmIn = v => { const n = okBpm(Number(String(v).replace(',', '.'))); return String(v).trim() === '' ? null : n }
function setSongBpm(v) { if (!song.value) return; const n = bpmIn(v); if (n == null) delete song.value.bpm; else song.value.bpm = n }
function setSectionBpm(v) { if (!section.value) return; const n = bpmIn(v); if (n == null) delete section.value.bpm; else section.value.bpm = n }
function setTrackBpm(v) { const t = audioMenu.value && audioSlot('track', audioMenu.value.v); if (t) t.bpm = bpmIn(v) }
function scaleTrackBpm(k) { const t = audioMenu.value && audioSlot('track', audioMenu.value.v); if (t?.bpm) t.bpm = okBpm(t.bpm * k) ?? t.bpm }
function pickSampleFile() {
  const m = audioMenu.value
  if (!m || !song.value) return
  const s = song.value, v = m.v
  audioMenu.value = null
  ui.soundFolderAssignTarget = {
    label: `Song ${s.name} · Samples ${SONG_SLOTS[v]}`,
    onAssign: async (file) => {
      const f = await file.handle.getFile()
      const id = await saveSongSample(f)
      const prev = songAudioOf(s).sample[v]
      songAudioOf(s).sample[v] = { id, name: file.name.replace(/\.[^.]+$/, ''), mode: prev?.mode ?? 'oneshot' }
      ui.soundFolderAssignTarget = null
      ui.isSoundFolderBrowserOpen = false
      say(`Samples ${SONG_SLOTS[v]}: ${file.name}`)
    },
  }
  ui.isSoundFolderBrowserOpen = true
}
function setSampleMode(mode) {
  const m = audioMenu.value
  const s = m && audioSlot('sample', m.v)
  if (s) s.mode = mode
}
function clearSampleSlot() {
  const m = audioMenu.value
  if (m && song.value) songAudioOf(song.value).sample[m.v] = null
  audioMenu.value = null
}
const chordCount = v => (v == null ? 0 : cp.slots[v]?.numSteps ?? 0)
/** The chords of a section: its Chord slot's (as far as its Steps go). */
function chordsOf(sec) {
  const v = sec.lanes.chord
  const sl = v == null ? null : cp.slots[v]
  if (!sl) return ''
  const n = sec.chordSteps ?? sl.numSteps
  const names = sl.steps.slice(0, Math.min(n, sl.numSteps)).filter(st => st?.active && st.notes?.length).map(st => st.chordName || '?')
  return sec.chordSteps === 1 ? `${names[0] ?? ''} (latch)` : names.join(' ')
}
/** A clip's detail: Drum Density, Chord steps / latch. */
function clipExtra(sec, l) {
  if (l === 'drum' && sec.drumDensity != null) return `D ${sec.drumDensity}`
  if (l === 'chord' && sec.chordSteps === 1) return 'latch'
  if (l === 'chord' && sec.chordSteps) return `${sec.chordSteps} steps`
  return ''
}
function pickClip(i, l, c = 0) { sel.value = i; selLane.value = l; selClip.value = c }
function pickSection(i) { sel.value = i; selLane.value = null; selClip.value = null }
/** EDIT, the song playing: a click on a section takes the song there on the next bar line (Hold on: it stays there,
 *  to set its sounds with Save presets); the section playing or already launched: just picked. */
function onSectionClick(i) {
  pickSection(i)
  const r = run.value
  if (!playMode.value && r && !(r.queued === i || (r.queued === null && r.index === i))) jump(i)
}

// ── Clips placed in a section (start + length, in bars; lib/songs.ts) ──
const selClip = ref(null) // index in the lane's clips (null: none — an empty spot of the lane)
const selBar = ref(1)     // the bar clicked on an empty spot (where a slot picked goes)
const clipOf = computed(() => (section.value && selLane.value && selClip.value != null ? laneClips(section.value, selLane.value)[selClip.value] ?? null : null))
function editClips(sec, l, fn) {
  const cs = laneClips(sec, l).map(c => ({ ...c }))
  const r = fn(cs)
  setLaneClips(sec, l, cs)
  return r
}
/** The free bars around `bar` on the lane: [start, len] (null: a clip is there). */
function gapAt(sec, l, bar) {
  const cs = laneClips(sec, l)
  if (cs.some(c => bar >= c.start && bar < c.start + c.len)) return null
  const start = Math.max(1, ...cs.filter(c => c.start + c.len <= bar).map(c => c.start + c.len))
  const end = Math.min(sec.bars + 1, ...cs.filter(c => c.start > bar).map(c => c.start))
  return [start, end - start]
}
/** A slot put on a lane at `bar`: on a clip there, its slot; on an empty spot, a clip over the free bars. */
function putSlot(i, l, bar, slot) {
  const sec = song.value.sections[i]
  const cs = laneClips(sec, l)
  const on = cs.findIndex(c => bar >= c.start && bar < c.start + c.len)
  if (on >= 0) { editClips(sec, l, x => { x[on].slot = slot }); pickClip(i, l, on); return }
  const g = gapAt(sec, l, bar) ?? [1, sec.bars]
  editClips(sec, l, x => { x.push({ slot, start: g[0], len: g[1] }) })
  pickClip(i, l, laneClips(sec, l).findIndex(c => c.start === g[0]))
}
const barOfEvent = (e, sec) => {
  const r = e.currentTarget.getBoundingClientRect()
  return Math.max(1, Math.min(sec.bars, Math.floor((e.clientX - r.left) / (r.width / sec.bars)) + 1))
}
function onLaneClick(e, i, l) {
  const sec = song.value.sections[i]
  sel.value = i; selLane.value = l; selClip.value = null
  selBar.value = barOfEvent(e, sec)
}
const setClipSlot = v => {
  const sec = section.value, l = selLane.value
  if (!sec || !l) return
  if (v === null) { deleteClip(); return }
  if (clipOf.value) editClips(sec, l, x => { x[selClip.value].slot = v })
  else putSlot(sel.value, l, selBar.value, v)
}
function deleteClip() {
  const sec = section.value, l = selLane.value
  if (!sec || !l || selClip.value == null) return
  const k = selClip.value
  editClips(sec, l, x => { x.splice(k, 1) })
  selClip.value = null
}
function setClipStart(v) {
  const c = clipOf.value, sec = section.value, l = selLane.value
  if (!c || !clipFits(sec, l, v, c.len, selClip.value)) return
  editClips(sec, l, x => { x[selClip.value].start = v })
  selClip.value = laneClips(sec, l).findIndex(x => x.start === v)
}
function setClipLen(v) {
  const c = clipOf.value, sec = section.value, l = selLane.value
  if (!c || !clipFits(sec, l, c.start, v, selClip.value)) return
  editClips(sec, l, x => { x[selClip.value].len = v })
}
/** The longest a clip can be from its start (up to the next clip / the section's end). */
const maxLen = computed(() => {
  const c = clipOf.value, sec = section.value
  if (!c) return 0
  const nextStart = Math.min(sec.bars + 1, ...laneClips(sec, selLane.value).filter(x => x.start > c.start).map(x => x.start))
  return nextStart - c.start
})
/** A copy of the clip on the next free bars after it (its length, or what fits). */
function duplicateClip() {
  const c = clipOf.value, sec = section.value, l = selLane.value
  if (!c) return
  let start = c.start + c.len
  while (start <= sec.bars && !gapAt(sec, l, start)) start++
  const g = start <= sec.bars ? gapAt(sec, l, start) : null
  if (!g) { say('No free bars after it'); return }
  const len = Math.min(c.len, g[0] + g[1] - start)
  editClips(sec, l, x => { x.push({ slot: c.slot, start, len }) })
  selClip.value = laneClips(sec, l).findIndex(x => x.start === start)
}
function wholeSection() {
  const c = clipOf.value, sec = section.value, l = selLane.value
  if (!c) return
  setLaneClips(sec, l, [{ slot: c.slot, start: 1, len: sec.bars }])
  selClip.value = 0
}
// Dragging a clip: its body moves it (Alt: a copy), its right edge sets its length; on whole bars
const clipDrag = ref(null) // { i, l, k, mode: 'move' | 'copy' | 'len', x0, barPx, start, len, moved, ghost }
function onClipPointerDown(e, i, l, k, mode) {
  if (e.button !== 0) return
  const sec = song.value.sections[i]
  const c = laneClips(sec, l)[k]
  const cell = e.currentTarget.closest('[data-cell]')
  if (!c || !cell) return
  e.stopPropagation()
  e.currentTarget.setPointerCapture?.(e.pointerId)
  clipDrag.value = { i, l, k, mode: mode === 'len' ? 'len' : e.altKey ? 'copy' : 'move', x0: e.clientX, barPx: cell.getBoundingClientRect().width / sec.bars, start: c.start, len: c.len, moved: false, ghost: null }
  pickClip(i, l, k)
}
function onClipPointerMove(e) {
  const d = clipDrag.value
  if (!d) return
  const sec = song.value.sections[d.i]
  const delta = Math.round((e.clientX - d.x0) / d.barPx)
  if (delta !== 0) d.moved = true
  if (d.mode === 'len') {
    const len = Math.max(1, d.len + delta)
    if (len !== laneClips(sec, d.l)[d.k]?.len && clipFits(sec, d.l, d.start, len, d.k)) editClips(sec, d.l, x => { x[d.k].len = len })
  } else if (d.mode === 'move') {
    const start = d.start + delta
    if (start !== laneClips(sec, d.l)[d.k]?.start && clipFits(sec, d.l, start, d.len, d.k)) {
      editClips(sec, d.l, x => { x[d.k].start = start })
      d.k = laneClips(sec, d.l).findIndex(x => x.start === start)
      selClip.value = d.k
    }
  } else {
    const start = d.start + delta
    d.ghost = delta !== 0 && clipFits(sec, d.l, start, d.len) ? start : null
  }
}
const vd = useVirtualDeviceStore()
function vdToLane(l) {
  const rows = laneChannels(l).filter(r => vd.devices.includes(r.device))
  if (!rows.length) return
  const r = rows.reduce((a, b) => (b.ch < a.ch ? b : a))
  vd.selectedDevice = r.device
  vd.setChannel(r.device, r.ch)
}
function onClipPointerUp() {
  const d = clipDrag.value
  clipDrag.value = null
  // EDIT, a click on a clip: the Virtual Device goes to its lane's device and channel (on several: the lowest)
  if (d && !d.moved && d.mode === 'move' && !playMode.value) vdToLane(d.l)
  // Preview on (EDIT, the song not playing): a click on a clip plays it on its own (again: stops it)
  if (d && !d.moved && d.mode === 'move' && previewOn.value && !playMode.value && !playingHere.value) command({ cmd: 'preview', index: d.i, lane: d.l, start: d.start })
  if (!d || d.mode !== 'copy' || d.ghost == null) return
  const sec = song.value.sections[d.i]
  const slot = laneClips(sec, d.l)[d.k]?.slot
  if (slot == null) return
  editClips(sec, d.l, x => { x.push({ slot, start: d.ghost, len: d.len }) })
  pickClip(d.i, d.l, laneClips(sec, d.l).findIndex(x => x.start === d.ghost))
}
const clipStyle = (sec, c) => ({ left: `calc(${((c.start - 1) / sec.bars) * 100}% + 1px)`, width: `calc(${(c.len / sec.bars) * 100}% - 2px)` })
function onSlotDragStart(e, l, v) {
  drag.value = { kind: 'slot', lane: l, slot: v }
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData('text/plain', slotLabel(l, v))
}
const dropCell = ref(null)
function onCellDrop(i, l) {
  const d = drag.value
  drag.value = null
  dropCell.value = null
  if (d?.kind !== 'slot' || d.lane !== l || !song.value) return
  putSlot(i, l, dropBar.value ?? 1, d.slot)
}
const dropBar = ref(null)
function onCellDragOver(e, i, l) {
  if (drag.value?.kind !== 'slot' || drag.value.lane !== l) return
  e.preventDefault()
  dropCell.value = `${i}|${l}`
  dropBar.value = barOfEvent(e, song.value.sections[i])
}

// sections
function addSection() {
  const secs = song.value.sections
  if (secs.length >= MAX_SECTIONS) return
  const from = section.value
  const s = newSection(`Section ${secs.length + 1}`, from?.bars ?? 8, from ? { ...from.lanes } : {})
  if (from) { s.vol = { ...from.vol }; s.volBars = from.volBars; s.chordSteps = from.chordSteps; s.drumDensity = from.drumDensity }
  secs.splice(sel.value + 1, 0, s)
  pickSection(sel.value + 1)
}
function duplicateSection() {
  if (!section.value || song.value.sections.length >= MAX_SECTIONS) return
  const c = JSON.parse(JSON.stringify(section.value))
  c.id = Math.random().toString(36).slice(2, 10)
  song.value.sections.splice(sel.value + 1, 0, c)
  pickSection(sel.value + 1)
}
function deleteSection() {
  if (song.value.sections.length <= 1 || playingHere.value) return
  song.value.sections.splice(sel.value, 1)
  selLane.value = null
  selClip.value = null
}
function moveSection(d) {
  const secs = song.value.sections, j = sel.value + d
  if (playingHere.value || j < 0 || j >= secs.length) return
  ;[secs[sel.value], secs[j]] = [secs[j], secs[sel.value]]
  sel.value = j
}
// ── Drag a whole section (its header) to another place; not while the song plays ──
const secDrop = ref(null) // { i, after }: the insertion point shown
function onSectionDragStart(e, i) {
  if (playingHere.value) { e.preventDefault(); return }
  drag.value = { kind: 'section', from: i }
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', song.value.sections[i].name)
}
function onSectionDragOver(e, i) {
  if (drag.value?.kind !== 'section') return
  e.preventDefault()
  const r = e.currentTarget.getBoundingClientRect()
  secDrop.value = { i, after: e.clientX > r.left + r.width / 2 }
}
function onSectionDrop() {
  const d = drag.value, t = secDrop.value
  drag.value = null; secDrop.value = null
  if (d?.kind !== 'section' || !t || playingHere.value) return
  const secs = song.value.sections
  let to = t.i + (t.after ? 1 : 0)
  if (to > d.from) to -= 1
  if (to === d.from) return
  const [s] = secs.splice(d.from, 1)
  secs.splice(to, 0, s)
  sel.value = to
}
function renameSection(i) {
  const s = song.value.sections[i]
  const v = window.prompt('Section name', s.name)
  if (v?.trim()) s.name = v.trim().slice(0, 24)
}

// patterns: own / shared (SG4)
async function setOwn(on) {
  const s = song.value
  if (!s || s.own === on) return
  if (on) { await captureInto(lib, s); say(`${s.name}: the apps' slots are its own patterns now`); return }
  if (!confirm(`"${s.name}" back to the session's slots? Its own patterns are deleted.`)) return
  await dropMaterial(lib, s)
  say(`${s.name}: plays the session's slots`)
}

// ── Playing (the Rig's player) ──
const playingHere = computed(() => !!songRun.value && songRun.value.songId === song.value?.id)
const run = computed(() => (playingHere.value ? songRun.value : null))
// the player is the Rig engine (core/engines/rig.js): it plays with the Rig panel closed
function command(c) { songCommand.value = c }
// The clips of the section playing (background), the one sounding now brighter
const playingSec = i => !!run.value && run.value.bar > 0 && !run.value.stopping && run.value.index === i
const soundingClip = (i, c) => playingSec(i) && run.value.bar >= c.start && run.value.bar < c.start + c.len

// ── The preset of each clip: its slot's own sound (a Sequencer lane's bank), else the one now on the
//    lane's MIDI channel (MIDI Flow's Program Change state); the Chord Prog on several channels: MULTI ──
const SEQ_LANE_OF = { seq: 'main', bass: 'bass', arp: 'arp' }
const presetName = p => (p ? p.soundName || (p.program != null ? `PC ${p.program + 1}` : '') : '')
const channelPresets = computed(() => {
  void JSON.stringify(midiStore.routingMatrix)
  const regs = midiStore.routingConfig?.registrations ?? {}
  return Object.fromEntries(SONG_LANES.map(l => {
    const rows = laneChannels(l)
    const names = rows.map(r => presetName(regs[r.device]?.pcChannels?.[r.ch])).filter(Boolean)
    return [l, { rows: rows.length, names }]
  }))
})
// ── Save presets (EDIT, while the song plays): a preset changed on a lane's channel (the Virtual Device, a PC
// panel…) goes into that lane's clip selected, else into the one sounding — the song player sends it before
// that clip's bar line, only when the channel plays another sound (so the same clip can change sound).
const savePresets = ref(false)
/** Preview (EDIT): a click on a clip plays it on its own — with Save presets, its sound is set there, the song stopped. */
const previewOn = ref(false)
// Preview off: the clip previewing stops too (else nothing would stop it)
watch(previewOn, on => { if (!on && songPreview.value) command({ cmd: 'previewStop' }) })
const previewHere = computed(() => !!songPreview.value && songPreview.value.songId === song.value?.id ? songPreview.value : null)
const isPreviewed = (i, l, c) => { const p = previewHere.value; return !!p && p.index === i && p.lane === l && p.start === c.start }
watch(() => {
  if (!savePresets.value || !(playingHere.value || previewHere.value)) return null
  const regs = midiStore.routingConfig?.registrations ?? {}
  const out = {}
  for (const l of SONG_LANES) for (const r of laneChannels(l)) out[`${r.device}|${r.ch}`] = regs[r.device]?.pcChannels?.[r.ch] ?? null
  return out
}, (cur, old) => {
  if (!cur || !old) return // just turned on (or the song started): what is there now is the reference
  for (const [k, st] of Object.entries(cur)) {
    if (!st || samePreset(st, old[k]) || isPresetEcho(k, st)) continue
    savePresetFor(k, st)
  }
}, { deep: true })
function savePresetFor(key, st) {
  const r = run.value, s = song.value, p = previewHere.value
  if (!(r || p) || !s) return
  for (const l of SONG_LANES) {
    if (!laneChannels(l).some(x => `${x.device}|${x.ch}` === key)) continue
    let sec = null, clip = null
    if (p) { if (p.lane !== l) continue; sec = s.sections[p.index]; clip = sec ? clipAt(sec, l, p.start)?.clip ?? null : null }
    else if (selLane.value === l && clipOf.value) { sec = section.value; clip = clipOf.value }
    else { sec = s.sections[r.index]; clip = sec && r.bar > 0 ? clipAt(sec, l, Math.min(r.bar, sec.bars))?.clip ?? null : null }
    if (!sec || !clip) continue
    if (setClipPreset(sec, l, clip.start, key, st)) say(`Preset ${presetName(st) || '?'} saved in ${laneLabel(l)} ${SONG_SLOTS[clip.slot]} (${sec.name}, bar ${clip.start})`)
  }
}
/** The presets saved in a clip: a name, MULTI for several sounds, '' none. */
function savedPreset(c) {
  const names = Object.values(c.presets ?? {}).map(presetName).filter(Boolean)
  if (!names.length) return ''
  return new Set(names).size > 1 ? 'MULTI' : names[0]
}
/** A Sequencer lane's slot with its own sound (the bank's SOUND): its label, '' none. */
function slotSound(l, slot) {
  const lane = SEQ_LANE_OF[l]
  return lane && (l === 'seq' || rowLane(l)) ? laneSoundLabel(lanes[lane].banks?.[slot]?.sound) : ''
}
/**
 * What a clip plays, played from the song's start: its own preset (saved in it), else its slot's sound (a Sequencer
 * bank's), else the sound the clips before it left on the channel; with none of these the channel's preset now
 * (the Chord on several channels: MULTI).
 */
function clipSound(i, l, c) {
  const own = savedPreset(c)
  if (own) return { text: own, kind: 'saved', title: `Saved in the clip: ${Object.values(c.presets).map(presetName).join(', ')} — sent before its bar line when the channel plays another sound` }
  const bank = slotSound(l, c.slot)
  if (bank) return { text: bank, kind: 'slot', title: `Slot ${SONG_SLOTS[c.slot]}'s own sound (the Sequencer's SOUND): every clip of this slot` }
  let left = null
  const secs = song.value?.sections ?? []
  for (let j = 0; j <= i && j < secs.length; j++) {
    for (const x of laneClips(secs[j], l)) {
      if (j === i && x.start >= c.start) break
      const s = savedPreset(x) || slotSound(l, x.slot)
      if (s) left = { text: s, from: `${secs[j].name}, ${SONG_SLOTS[x.slot]}` }
    }
  }
  if (left) return { text: left.text, kind: 'carried', title: `From the clip before (${left.from}): the channel keeps that sound` }
  const now = clipPreset(l, c.slot)
  return now ? { text: now, kind: 'now', title: now === 'MULTI' ? 'The Chord on several channels (nothing saved in this clip)' : `The channel's preset now (nothing saved in this clip)` } : null
}
function clipPreset(l, slot) {
  const lane = SEQ_LANE_OF[l]
  if (lane && (l === 'seq' || rowLane(l))) {
    const own = laneSoundLabel(lanes[lane].banks?.[slot]?.sound)
    if (own) return own
  }
  const cur = channelPresets.value[l]
  if (!cur?.rows) return ''
  if (l === 'chord' && cur.rows > 1) return 'MULTI'
  if (!cur.names.length) return ''
  return cur.names.length > 1 && new Set(cur.names).size > 1 ? `${cur.names[0]} +${cur.names.length - 1}` : cur.names[0]
}

/** Muted, or another lane soloed (the Rig's Mute / Solo). */
const laneSilenced = l => { const m = rigLaneMutes.value; return !!m[l]?.muted || (Object.values(m).some(x => x?.solo) && !m[l]?.solo) }
const play = () => command({ cmd: 'play', index: sel.value })
const stop = () => command({ cmd: 'stop' })
const pause = () => command({ cmd: 'pause' })
const resume = () => command({ cmd: 'resume' })
/** This song paused: Resume goes on from its section */
const pausedHere = computed(() => !songRun.value && songPaused.value?.songId === song.value?.id ? song.value.sections[songPaused.value.index] ?? null : null)
const hold = () => command({ cmd: 'hold', on: !run.value?.hold })
const jump = i => { if (playingHere.value) command({ cmd: 'jump', index: i }) }
const songBar = computed(() => (run.value && run.value.bar > 0 ? sectionStartBar(song.value, run.value.index) + Math.min(run.value.bar, song.value.sections[run.value.index]?.bars ?? 0) - 1 : 0))
const playhead = computed(() => (total.value && songBar.value ? `${((songBar.value - 0.5) / total.value) * 100}%` : null))
const isCurrent = i => !!run.value && run.value.index === i && run.value.bar > 0
const isQueued = i => !!run.value && (run.value.queued === i || (run.value.bar === 0 && run.value.index === i))

const fadeLabel = v => (v === 'rig' ? 'Rig' : v === 0 ? 'Cut' : v === 0.5 ? '½' : String(v))
const END_OPTIONS = [['stop', 'Stop'], ['loop', 'Loop'], ['stay', 'Stay · bar'], ['staySection', 'Stay · section'], ['next', 'Next song']]
const barLabel = b => (b === 0.5 ? '½' : b === 0 ? 'Cut' : String(b))
const btn = 'px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-wider disabled:opacity-30'
const laneLabel = l => SONG_LANE_LABELS[l]
const slotClass = (l, v, on) => on
  ? 'bg-sky-500/80 border-sky-200 text-black'
  : filled.value[l]?.[v] ? 'border-sky-400/40 bg-sky-900/30 text-sky-100 hover:bg-sky-800/40' : 'border-white/10 text-neutral-600 hover:bg-white/5'
</script>

<template>
  <div class="bg-neutral-950 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden relative text-neutral-200" :style="panelStyle" v-show="!isMinimized" @mousedown.capture="bringToFront" @keydown.stop>
    <PlayPanelHeader title="Session Browser" panel-id="session-browser" accent="text-sky-300"
                     @pointerdown="onDragStart" @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize">
      <span class="text-[11px] text-neutral-400">{{ currentSession?.name ?? '—' }}</span>
      <template v-if="song">
        <ChevronRight class="w-3 h-3 text-neutral-600" />
        <span class="text-[12px] font-black text-sky-200">{{ song.name }}</span>
        <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
              :class="song.own ? 'bg-sky-500/15 text-sky-300' : 'bg-amber-500/15 text-amber-300'">
          <component :is="song.own ? Lock : Link2" class="w-3 h-3" />{{ song.own ? 'own patterns' : 'shared slots' }}
        </span>
        <span class="text-[10px] font-mono text-neutral-500">{{ song.sections.length }} sections · {{ total }} bars · {{ Math.round(arp.arpBpm) }} BPM</span>
        <span v-if="materialPending" class="text-[10px] text-amber-300">its patterns load at the next stop</span>
      </template>
      <span v-if="pendingSession" class="text-[10px] text-amber-300 animate-pulse">a session loads at the next stop</span>
    </PlayPanelHeader>

    <div class="flex-1 min-h-0 flex">
      <!-- ── Sessions › Songs ── -->
      <div v-if="collapsed" class="w-12 shrink-0 flex flex-col items-center gap-1.5 py-2 border-r border-white/10 bg-black/30">
        <button class="w-8 h-8 rounded border border-white/15 hover:bg-white/10 flex items-center justify-center" title="Sessions › Songs" @click="collapsed = false"><ChevronRight class="w-4 h-4" /></button>
        <span class="text-[8px] font-black uppercase tracking-widest text-neutral-500">Songs</span>
        <button v-for="(s, i) in lib.songs" :key="s.id" class="w-8 h-8 rounded border text-[11px] font-mono font-bold"
                :class="s.id === lib.currentId ? 'border-sky-300 bg-sky-500/20 text-sky-100' : 'border-white/10 text-neutral-400 hover:bg-white/10'"
                :title="s.name" @click="openSong(s.id)">{{ i + 1 }}</button>
      </div>
      <div v-else class="w-[420px] shrink-0 flex border-r border-white/10 bg-black/30">
        <!-- sessions -->
        <div class="w-[190px] shrink-0 flex flex-col border-r border-white/10">
          <div class="flex items-center justify-between px-2.5 pt-2.5 pb-1.5">
            <span class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Sessions</span>
            <button v-if="song" class="text-neutral-500 hover:text-white" title="Fold: back to the song" @click="collapsed = true"><ChevronLeft class="w-4 h-4" /></button>
          </div>
          <div class="flex-1 min-h-0 overflow-y-auto px-1.5 flex flex-col gap-1">
            <div v-for="s in sessions" :key="s.id"
                 class="group rounded-lg border px-2 py-1.5 cursor-pointer"
                 :class="[s.id === browsed?.id ? 'border-sky-400/60 bg-sky-500/10' : 'border-white/10 hover:bg-white/5', dropSession === s.id ? 'border-dashed !border-amber-400 bg-amber-500/10' : '']"
                 @click="browseId = s.id"
                 @dragover.prevent="drag?.kind === 'song' && s.id !== currentSession?.id && (dropSession = s.id)"
                 @dragleave="dropSession === s.id && (dropSession = null)"
                 @drop.prevent="onSessionDrop(s)">
              <div class="flex items-center gap-1">
                <span class="text-[12px] font-bold truncate flex-1">{{ s.name }}</span>
                <span v-if="s.id === currentSession?.id" class="text-[8px] font-black uppercase px-1 rounded bg-sky-500/25 text-sky-200">Current</span>
                <span v-else-if="pendingSession?.sessionId === s.id" class="text-[8px] font-black uppercase px-1 rounded bg-amber-500/25 text-amber-200">At stop</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-[9px] font-mono text-neutral-500 flex-1 truncate">{{ dropSession === s.id ? 'drop: copy the song here' : sessionSummary(s) }}</span>
                <span class="hidden group-hover:flex items-center gap-1">
                  <button class="text-neutral-500 hover:text-white" title="Rename" @click.stop="renameSessionPrompt(s)"><Pencil class="w-3 h-3" /></button>
                  <button class="text-neutral-500 hover:text-white" title="Duplicate (its songs and patterns too)" @click.stop="duplicateSession(s.id)"><Copy class="w-3 h-3" /></button>
                  <button class="text-neutral-500 hover:text-red-400" title="Delete (its songs too)" @click.stop="removeSession(s)"><Trash2 class="w-3 h-3" /></button>
                </span>
              </div>
            </div>
          </div>
          <div class="p-1.5 border-t border-white/10 flex flex-col gap-1">
            <div class="flex gap-1">
              <input v-model="newSessionName" placeholder="New session…" class="flex-1 min-w-0 bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[10px]" @keydown.enter="addSession" />
              <button :class="[btn, 'border-sky-400/40 text-sky-300 hover:bg-sky-500/20']" title="A new session from what is in the apps now" @click="addSession"><Plus class="w-3 h-3" /></button>
            </div>
            <button :class="[btn, 'border-white/15 hover:bg-white/10']" title="Save the current session now (it is also saved when you leave it)" @click="save"><Save class="w-3 h-3 inline" /> Save</button>
          </div>
        </div>
        <!-- songs of the session browsed -->
        <div class="flex-1 min-w-0 flex flex-col relative">
          <div class="flex items-center gap-1.5 px-2.5 pt-2.5 pb-1.5">
            <span class="text-[9px] font-black uppercase tracking-widest text-neutral-500 truncate">Songs · {{ browsed?.name }}</span>
            <span class="flex-1" />
            <button v-if="browsingCurrent" :class="[btn, 'border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/20']" @click="newMenu = !newMenu"><Plus class="w-3 h-3 inline" /> New</button>
            <button v-else :class="[btn, 'border-sky-400/50 text-sky-300 hover:bg-sky-500/20']" title="Load this session (stopped: now; playing: at the next stop)" @click="pickLoad">Load session</button>
          </div>
          <div v-if="newMenu" class="absolute right-2 top-9 z-10 w-56 p-1 rounded-lg border border-white/15 bg-neutral-900 shadow-xl flex flex-col">
            <button class="text-left px-2 py-1.5 rounded hover:bg-white/10" @click="addSongFrom('empty')"><div class="text-[11px] font-bold">Empty</div><div class="text-[9px] text-neutral-500">on this session's slots</div></button>
            <button class="text-left px-2 py-1.5 rounded hover:bg-white/10" @click="addSongFrom('apps')"><div class="text-[11px] font-bold">From the apps now</div><div class="text-[9px] text-neutral-500">their slots as its own patterns</div></button>
            <button class="text-left px-2 py-1.5 rounded hover:bg-white/10" @click="addSongFrom('ai')"><div class="text-[11px] font-bold text-violet-300"><Sparkles class="w-3 h-3 inline" /> With the AI Composer…</div><div class="text-[9px] text-neutral-500">key, style, tempo → a song with its own patterns</div></button>
            <button class="text-left px-2 py-1.5 rounded hover:bg-white/10" @click="addSongFrom('example')"><div class="text-[11px] font-bold">Example (Nightline)</div><div class="text-[9px] text-neutral-500">six sections to start from</div></button>
          </div>
          <div class="flex-1 min-h-0 overflow-y-auto px-1.5 flex flex-col gap-1">
            <div v-for="(s, i) in browsedSongs" :key="s.id"
                 class="group flex items-center gap-2 rounded-lg border px-2 py-1.5"
                 :class="[s.id === lib.currentId && browsingCurrent ? 'border-sky-400/60 bg-sky-500/10' : 'border-white/10 hover:bg-white/5', browsingCurrent ? 'cursor-pointer' : 'opacity-80']"
                 :draggable="browsingCurrent" @dragstart="onSongDragStart($event, s)" @dragend="drag = null; dropSession = null"
                 @dragover.prevent @drop.prevent="browsingCurrent && onSongDrop(s)"
                 :title="browsingCurrent ? 'Click: open · drag: order, or onto a session to copy it there' : 'Load the session to open its songs'"
                 @click="openSong(s.id)">
              <span class="w-4 text-[10px] font-mono text-neutral-500">{{ i + 1 }}</span>
              <span class="flex-1 min-w-0">
                <span class="block text-[12px] font-bold truncate">{{ s.name }}</span>
                <span class="block text-[9px] font-mono text-neutral-500">{{ s.sections.length }} sections · {{ songBars(s) }} bars</span>
              </span>
              <span class="inline-flex items-center gap-0.5 px-1 rounded text-[9px] font-bold" :class="s.own ? 'bg-sky-500/15 text-sky-300' : 'bg-amber-500/15 text-amber-300'">
                <component :is="s.own ? Lock : Link2" class="w-2.5 h-2.5" />{{ s.own ? 'own' : 'shared' }}
              </span>
              <span v-if="browsingCurrent" class="hidden group-hover:flex items-center gap-1">
                <button class="text-neutral-500 hover:text-white" title="Rename" @click.stop="renameSong(s)"><Pencil class="w-3 h-3" /></button>
                <button class="text-neutral-500 hover:text-white" title="Duplicate" @click.stop="duplicateSong(s)"><Copy class="w-3 h-3" /></button>
                <button class="text-neutral-500 hover:text-red-400" title="Delete" @click.stop="deleteSong(s)"><Trash2 class="w-3 h-3" /></button>
              </span>
            </div>
            <div v-if="!browsedSongs.length" class="text-[10px] text-neutral-500 p-2">No songs yet.</div>
          </div>
          <div class="px-2.5 py-1.5 border-t border-white/10 text-[9px] text-neutral-500 leading-snug">Drag a song onto a session: a copy (its own patterns go with it). Drag in the list: the set list order.</div>
        </div>
      </div>

      <!-- ── Slots of each lane ── -->
      <div v-if="song && !playMode" class="w-[200px] shrink-0 flex flex-col gap-2 p-2 border-r border-white/10 bg-black/20 overflow-y-auto">
        <div class="flex items-baseline justify-between"><span class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Slots</span><span class="text-[9px] text-neutral-500">drag · right-click: name</span></div>
        <div v-for="l in SONG_LANES" :key="l" class="flex flex-col gap-1">
          <span class="text-[10px] font-black uppercase tracking-wider">{{ laneLabel(l) }}</span>
          <div class="grid grid-cols-4 gap-1">
            <button v-for="(L, v) in SONG_SLOTS" :key="L" draggable="true" @dragstart="onSlotDragStart($event, l, v)" @dragend="drag = null; dropCell = null"
                    class="relative h-9 px-0.5 rounded border flex items-center justify-center cursor-grab"
                    :class="slotClass(l, v, false)"
                    :title="`${laneLabel(l)} ${slotLabel(l, v)}${filled[l]?.[v] ? '' : ' (empty)'} — drag into a section · right-click: ${l === 'track' ? 'a library track' : l === 'sample' ? 'a sound, One-shot / Loop' : l === 'capture' ? 'record it with Capt (Launchpad / Rig)' : 'name'}`"
                    @click="selLane === l && setClipSlot(v)"
                    @contextmenu.prevent="isAudioLane(l) ? openAudioMenu($event, l, v) : l === 'capture' ? null : promptSlotName(nameKey(l), v, `${laneLabel(l)} slot`)">
              <template v-if="nameOf(l, v)">
                <span class="absolute top-0.5 left-1 text-[8px] font-mono font-bold opacity-70">{{ slotLetter(l, v) }}</span>
                <span class="mt-1.5 text-[9px] leading-[1.1] font-semibold text-center break-words overflow-hidden" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical">{{ nameOf(l, v) }}</span>
              </template>
              <span v-else class="text-[11px] font-mono font-bold">{{ slotLetter(l, v) }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- ── The song ── -->
      <div v-if="song" class="flex-1 min-w-0 flex flex-col">
        <div class="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-white/10">
          <div class="flex rounded border border-white/15 overflow-hidden text-[10px] font-bold">
            <span class="px-2 py-1 text-neutral-500 uppercase tracking-wider border-r border-white/15">Patterns</span>
            <button class="px-2 py-1 inline-flex items-center gap-1" :class="song.own ? 'bg-sky-500/25 text-sky-100' : 'text-neutral-400 hover:bg-white/10'" title="Its own slots A–H: the patterns go with the song" @click="setOwn(true)"><Lock class="w-3 h-3" />Own</button>
            <button class="px-2 py-1 inline-flex items-center gap-1 border-l border-white/15" :class="!song.own ? 'bg-amber-500/25 text-amber-100' : 'text-neutral-400 hover:bg-white/10'" title="The session's slots A–H (shared with the other shared songs)" @click="setOwn(false)"><Link2 class="w-3 h-3" />Shared</button>
          </div>
          <div class="flex rounded border border-white/15 overflow-hidden text-[10px] font-bold">
            <span class="px-2 py-1 text-neutral-500 uppercase tracking-wider border-r border-white/15">End</span>
            <button v-for="([v, t], i) in END_OPTIONS" :key="v" class="px-2 py-1" :class="[i ? 'border-l border-white/15' : '', song.end === v ? 'bg-white/20 text-white' : 'text-neutral-400 hover:bg-white/10']" @click="song.end = v">{{ t }}</button>
          </div>
          <div class="flex rounded border border-white/15 overflow-hidden text-[10px] font-bold"
               title="Fade Out before the lanes stop (Stop song, End Stop) — Rig: the Fade Out set in Performance · Cut: none · bars: this song's own, on every channel">
            <span class="px-2 py-1 text-neutral-500 uppercase tracking-wider border-r border-white/15">Out</span>
            <button v-for="(v, i) in SONG_FADE_OPTIONS" :key="String(v)" class="px-2 py-1" :class="[i ? 'border-l border-white/15' : '', song.fadeOut === v ? 'bg-white/20 text-white' : 'text-neutral-400 hover:bg-white/10']" @click="song.fadeOut = v">{{ fadeLabel(v) }}</button>
          </div>
          <div class="flex rounded border border-white/15 overflow-hidden text-[10px] font-bold"
               title="Fade In when this song comes after another (End Next, a song picked while one plays) — Rig: the Fade In set in Performance · Cut: at once · bars: this song's own, on every channel">
            <span class="px-2 py-1 text-neutral-500 uppercase tracking-wider border-r border-white/15">In</span>
            <button v-for="(v, i) in SONG_FADE_OPTIONS" :key="String(v)" class="px-2 py-1" :class="[i ? 'border-l border-white/15' : '', (song.fadeIn ?? 'rig') === v ? 'bg-white/20 text-white' : 'text-neutral-400 hover:bg-white/10']" @click="song.fadeIn = v">{{ fadeLabel(v) }}</button>
          </div>
          <label class="flex items-center gap-1 rounded border border-white/15 px-1.5 py-0.5 text-[10px] font-bold"
                 title="The song's tempo: set when it starts (and between songs); a section can have its own. Empty: the tempo as it is">
            <span class="text-neutral-500 uppercase tracking-wider">BPM</span>
            <input type="text" inputmode="decimal" class="w-12 bg-black/40 rounded px-1 py-0.5 font-mono text-white text-center" :value="song.bpm ?? ''" :placeholder="String(Math.round(tempoStore.arpBpm || 120))" @change="setSongBpm($event.target.value)" />
            <button v-if="song.bpm == null" class="text-neutral-400 hover:text-white" title="The tempo now becomes the song's" @click="song.bpm = okBpm(tempoStore.arpBpm)">now</button>
          </label>
          <div class="flex rounded border border-white/15 overflow-hidden text-[10px] font-bold"
               title="Between two songs (every song): the song before fades out (its Out), these bars of silence, then the next fades in (its In) — Cut: no gap, the next song starts on the bar line the one before ends on (its own material needs a gap: it loads there)">
            <span class="px-2 py-1 text-neutral-500 uppercase tracking-wider border-r border-white/15">X-fade</span>
            <button v-for="(v, i) in SONG_XFADE_OPTIONS" :key="v" class="px-2 py-1" :class="[i ? 'border-l border-white/15' : '', songXfadeBars === v ? 'bg-white/20 text-white' : 'text-neutral-400 hover:bg-white/10']" @click="setSongXfade(v)">{{ v === 0 ? 'Cut' : v }}</button>
          </div>
          <button v-if="!playMode" class="px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-wider"
                  :class="savePresets ? 'bg-amber-500/80 border-amber-300 text-black' : 'border-white/15 text-neutral-400 hover:bg-white/10'"
                  :title="savePresets ? 'Save presets on: while the song plays, a preset changed on a lane\'s channel (Virtual Device, PC…) is saved in that lane\'s clip selected, else the one sounding' : 'Save presets: while the song plays, the presets you change go into the clips (sent before each clip\'s bar line, only when the sound changes)'"
                  @click="savePresets = !savePresets">● Save presets</button>
          <button v-if="!playMode" class="px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-wider"
                  :class="previewOn ? 'bg-emerald-500/80 border-emerald-300 text-black' : 'border-white/15 text-neutral-400 hover:bg-white/10'"
                  :title="previewOn ? 'Preview on: a click on a clip plays it on its own (the other lanes stopped, its saved preset sent); a click on it again: stop. With Save presets: its sound is set there, without playing the song' : 'Preview: a click on a clip plays it on its own (the song not playing)'"
                  @click="previewOn = !previewOn">▶ Preview</button>
          <span class="flex-1" />
          <span v-if="msg" class="text-[10px] text-emerald-300 truncate max-w-[280px]">{{ msg }}</span>
          <template v-if="playingHere">
            <button :class="[btn, run.hold ? 'bg-amber-500/80 border-amber-300 text-black' : 'border-amber-400/50 text-amber-300 hover:bg-amber-500/20']" title="Hold: the section playing loops until released" @click="hold"><Pause class="w-3 h-3 inline" /> Hold</button>
            <button :class="[btn, 'border-sky-400/50 text-sky-300 hover:bg-sky-500/20']" title="Pause: the transport stops at the bar end, the song is kept — Play / Resume goes on from this section" @click="pause"><Pause class="w-3 h-3 inline" /> Pause</button>
            <button :class="[btn, 'border-red-400/50 text-red-300 hover:bg-red-500/20']" title="Stop the song on the next bar line (the next Play starts it from the start)" @click="stop"><Square class="w-3 h-3 inline" /> Stop song</button>
          </template>
          <button v-else :class="[btn, 'border-emerald-400/60 text-emerald-300 hover:bg-emerald-500/20']" title="Play from the section selected (in the Rig, LIVE): playing, on the next bar line; stopped, it starts the Play" @click="play"><Play class="w-3 h-3 inline" /> Play from {{ section?.name }}</button>
          <button v-if="pausedHere" :class="[btn, 'border-sky-400/60 text-sky-300 hover:bg-sky-500/20']" title="Paused: goes on from the section it was paused in (with the Play's count-in)" @click="resume"><Play class="w-3 h-3 inline" /> Resume {{ pausedHere.name }}</button>
        </div>

        <div class="flex-1 min-h-0 overflow-auto px-3 pt-2">
          <!-- while playing: bar, section, chords (as in the Performance) -->
          <div class="flex justify-center mb-1.5 pl-16">
            <div class="flex items-stretch gap-2" :class="playingHere ? '' : 'opacity-40'">
              <div class="px-2.5 py-1 rounded-md bg-black/50 border border-white/10 flex flex-col justify-center">
                <span class="text-[8px] font-black uppercase tracking-widest text-neutral-500">Bar</span>
                <span class="font-mono text-[15px] font-bold text-emerald-300">{{ songBar || '–' }}<span class="text-[10px] text-neutral-500"> / {{ total }}</span></span>
              </div>
              <div class="px-2.5 py-1 rounded-md bg-black/50 border border-white/10 flex flex-col justify-center">
                <span class="text-[8px] font-black uppercase tracking-widest text-neutral-500">{{ run ? song.sections[run.index]?.name : 'Section' }}</span>
                <span class="font-mono text-[15px] font-bold">{{ run?.bar || '–' }}<span class="text-[10px] text-neutral-500"> / {{ run ? song.sections[run.index]?.bars : '–' }}{{ run && run.bar ? ` · ${barsLeft(run, song)} left` : '' }}</span></span>
              </div>
              <div class="px-3 py-1 rounded-md bg-black/50 border border-white/10 flex items-center gap-2.5">
                <span class="flex flex-col"><span class="text-[8px] font-black uppercase tracking-widest text-neutral-500">Now</span><span class="text-[18px] font-black text-amber-300 leading-tight">{{ (playingHere && cp.playingChordName) || '–' }}</span></span>
                <ArrowRight class="w-3.5 h-3.5 text-neutral-600" />
                <span class="flex flex-col"><span class="text-[8px] font-black uppercase tracking-widest text-neutral-500">Next</span><span class="text-[14px] font-bold text-neutral-300 leading-tight">{{ (playingHere && cp.nextChord?.name) || '–' }} <span v-if="playingHere && cp.nextChord?.duration" class="text-[9px] font-mono text-neutral-500">{{ cp.nextChord.duration }}</span></span></span>
              </div>
            </div>
          </div>

          <!-- section headers -->
          <div class="flex gap-[3px] pl-16" @dragleave="$event.currentTarget.contains($event.relatedTarget) || (secDrop = null)">
            <button v-for="(sec, i) in song.sections" :key="sec.id" class="relative min-w-[52px] flex items-center justify-between gap-1 px-1.5 py-1 rounded-t text-left"
                    :style="{ flex: `${sec.bars} 1 0` }"
                    :class="isCurrent(i) ? 'bg-emerald-500/30 text-emerald-50' : isQueued(i) ? 'bg-amber-500/25 text-amber-50 animate-pulse' : sel === i && !selLane ? 'bg-neutral-100 text-neutral-900' : sel === i ? 'bg-white/20' : 'bg-white/[0.06] hover:bg-white/10'"
                    :title="`${sec.name} · ${sec.bars} bars — ${playingHere && !playMode ? 'click: the song goes there on the next bar line (with Hold: it stays there — set its sounds)' : `click: the section · double-click: ${playingHere ? 'go there on the next bar line' : 'rename · drag: move it'}`}`"
                    :draggable="!playingHere" @dragstart="onSectionDragStart($event, i)" @dragover="onSectionDragOver($event, i)" @drop.prevent="onSectionDrop"
                    @dragend="drag = null; secDrop = null"
                    @click="onSectionClick(i)" @dblclick="playingHere ? (playMode && jump(i)) : renameSection(i)">
              <span v-if="secDrop?.i === i" class="absolute -top-0.5 -bottom-2 w-1 rounded bg-amber-400 pointer-events-none" :class="secDrop.after ? '-right-[3px]' : '-left-[3px]'"></span>
              <span class="text-[10px] font-semibold uppercase tracking-wide truncate">{{ i + 1 }} {{ sec.name }}</span>
              <span class="text-[9px] font-mono opacity-75">{{ sec.bars }}</span>
            </button>
          </div>
          <div class="relative h-2 ml-16 border-b border-white/10">
            <span v-if="playhead" class="absolute top-0 -bottom-px w-0.5 bg-emerald-400" :style="{ left: playhead }"></span>
          </div>
          <!-- chords -->
          <div class="flex gap-[3px] items-center h-6 border-b border-white/10">
            <span class="w-[61px] shrink-0 text-[9px] font-black uppercase tracking-widest text-neutral-500">Chords</span>
            <span v-for="sec in song.sections" :key="sec.id" class="min-w-[52px] px-1.5 font-mono text-[10px] text-neutral-300 truncate" :style="{ flex: `${sec.bars} 1 0` }" :title="chordsOf(sec)">{{ chordsOf(sec) }}</span>
          </div>
          <!-- lanes -->
          <div v-for="l in SONG_LANES" :key="l" class="flex gap-[3px] items-stretch h-[76px] py-1.5 border-b border-white/[0.06]">
            <span class="w-[61px] shrink-0 flex flex-col justify-center gap-1">
              <span class="text-[10px] font-semibold uppercase tracking-wider" :class="laneSilenced(l) ? 'text-neutral-600 line-through' : 'text-neutral-300'">{{ laneLabel(l) }}</span>
              <span class="flex gap-1">
                <button v-if="l !== 'capture'" class="w-6 h-5 rounded border text-[9px] font-bold" :class="rigLaneMutes[l]?.muted ? 'bg-rose-500 border-rose-300 text-black' : 'border-white/15 text-neutral-400 hover:bg-white/10'"
                        title="Mute (the Rig's, live: not saved in the song) — the lane goes on playing silently, back in time when unmuted" @click="command({ cmd: 'mute', lane: l })">M</button>
                <button v-if="!ownLane(l)" class="w-6 h-5 rounded border text-[9px] font-bold" :class="rigLaneMutes[l]?.solo ? 'bg-sky-500 border-sky-300 text-black' : 'border-white/15 text-neutral-400 hover:bg-white/10'"
                        title="Solo (the Rig's, live: not saved in the song)" @click="command({ cmd: 'solo', lane: l })">S</button>
              </span>
            </span>
            <div v-for="(sec, i) in song.sections" :key="sec.id" data-cell
                 class="relative min-w-[52px] rounded-md cursor-pointer box-border border"
                 :style="{ flex: `${sec.bars} 1 0`, backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: `${100 / sec.bars}% 100%` }"
                 :class="[
                   sel === i && selLane === l && selClip == null ? 'border-white/40' : 'border-transparent hover:border-white/10',
                   dropCell === `${i}|${l}` ? '!border-dashed !border-amber-400 bg-amber-500/10' : '',
                 ]"
                 :title="`${laneLabel(l)} in ${sec.name} — drop a slot on a bar · click a clip: its settings · drag it: move (Alt: a copy) · its right edge: length`"
                 @click="onLaneClick($event, i, l)"
                 @dragover="onCellDragOver($event, i, l)"
                 @dragleave="dropCell === `${i}|${l}` && (dropCell = null)"
                 @drop.prevent="onCellDrop(i, l)">
              <!-- where a dropped slot goes -->
              <span v-if="dropCell === `${i}|${l}` && dropBar" class="absolute inset-y-0 bg-amber-400/20 pointer-events-none" :style="{ left: `${((dropBar - 1) / sec.bars) * 100}%`, width: `${100 / sec.bars}%` }"></span>
              <div v-for="(c, k) in laneClips(sec, l)" :key="`${c.start}`"
                   class="absolute inset-y-0 rounded-md flex flex-col gap-1 px-2 py-1.5 overflow-hidden select-none touch-none"
                   :style="clipStyle(sec, c)"
                   :class="[sel === i && selLane === l && selClip === k ? 'bg-sky-700/60 border-2 border-sky-100 ring-2 ring-sky-300/40'
                              : soundingClip(i, c) || isPreviewed(i, l, c) ? 'bg-emerald-700/55 border border-emerald-300/70'
                              : playingSec(i) ? 'bg-emerald-950/70 border border-emerald-400/45 hover:bg-emerald-900/60'
                              : 'bg-sky-950/70 border border-sky-400/35 hover:bg-sky-900/60',
                            clipDrag && clipDrag.i === i && clipDrag.l === l && clipDrag.k === k && clipDrag.mode !== 'copy' ? 'cursor-grabbing' : 'cursor-grab']"
                   :title="`${laneLabel(l)} ${slotLabel(l, c.slot)} · bars ${c.start}–${c.start + c.len - 1} of ${sec.name} — drag: move (Alt: a copy) · right edge: length`"
                   @click.stop
                   @pointerdown="onClipPointerDown($event, i, l, k, 'move')" @pointermove="onClipPointerMove" @pointerup="onClipPointerUp" @pointercancel="clipDrag = null">
                <span class="flex items-baseline justify-between gap-1 text-[9px] text-sky-200/70">
                  <span class="whitespace-nowrap">{{ laneLabel(l) }} · {{ slotLetter(l, c.slot) }}<template v-if="hasOwnClips(sec, l)"> · {{ c.start }}–{{ c.start + c.len - 1 }}</template></span>
                  <span class="font-mono">{{ clipExtra(sec, l) }}</span>
                </span>
                <span class="min-h-0 text-[12px] font-medium leading-snug text-sky-50 break-words overflow-hidden" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical">{{ slotLabel(l, c.slot) }}</span>
                <span v-if="clipSound(i, l, c)" class="mt-auto shrink-0 flex items-center gap-1 text-[9px] leading-tight min-w-0"
                      :class="{ saved: 'text-amber-200/90', slot: 'text-sky-200/70', carried: 'text-sky-200/50 italic', now: 'text-sky-200/60' }[clipSound(i, l, c).kind]"
                      :title="clipSound(i, l, c).title">
                  <span class="truncate">{{ clipSound(i, l, c).kind === 'saved' ? '●' : '♪' }} {{ clipSound(i, l, c).text }}</span>
                  <button v-if="clipSound(i, l, c).kind === 'saved' && !playMode" class="shrink-0 px-0.5 leading-none text-amber-200/60 hover:text-white" title="Take the preset off this clip"
                          @pointerdown.stop @click.stop="clearClipPresets(sec, l, c.start)">×</button>
                </span>
                <span class="absolute top-0 right-0 bottom-0 w-2 cursor-ew-resize hover:bg-sky-300/30" title="Drag: the clip's length"
                      @pointerdown="onClipPointerDown($event, i, l, k, 'len')" @pointermove="onClipPointerMove" @pointerup="onClipPointerUp"></span>
              </div>
              <!-- Alt-drag: where the copy goes -->
              <span v-if="clipDrag && clipDrag.mode === 'copy' && clipDrag.i === i && clipDrag.l === l && clipDrag.ghost != null"
                    class="absolute inset-y-0 rounded-md border-2 border-dashed border-sky-300/70 bg-sky-500/10 pointer-events-none"
                    :style="clipStyle(sec, { start: clipDrag.ghost, len: clipDrag.len })"></span>
            </div>
          </div>
        </div>

        <!-- the clip / section selected -->
        <div v-if="section" class="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 border-t border-white/10 bg-white/[0.03]">
          <template v-if="selLane">
            <span class="flex flex-col">
              <span class="text-[8px] font-semibold uppercase tracking-widest text-neutral-500">{{ clipOf ? 'Clip' : 'Empty' }} · {{ sel + 1 }} {{ section.name }}{{ clipOf ? '' : ` · bar ${selBar}` }}</span>
              <span class="text-[13px] font-semibold text-sky-100">{{ laneLabel(selLane) }} · {{ clipOf ? slotLabel(selLane, clipOf.slot) : 'pick a slot' }}</span>
            </span>
            <span class="flex flex-wrap items-center gap-1 text-[10px] text-neutral-500">Slot
              <button class="px-1.5 py-1 rounded border text-[10px] font-mono" :class="!clipOf ? 'bg-white/20 border-white/40 text-white' : 'border-white/10 hover:bg-white/10'" title="Delete the clip (silent on its bars)" @click="setClipSlot(null)">–</button>
              <button v-for="(L, v) in SONG_SLOTS" :key="L" class="px-1.5 py-1 rounded border text-[10px] font-mono" :class="slotClass(selLane, v, clipOf?.slot === v)"
                      :title="`${slotLabel(selLane, v)}${filled[selLane]?.[v] ? '' : ' (empty)'} — right-click: name`" @click="setClipSlot(v)"
                      @contextmenu.prevent="promptSlotName(nameKey(selLane), v, `${laneLabel(selLane)} slot`)">{{ slotLabel(selLane, v) }}</button>
            </span>
            <label v-if="clipOf" class="flex items-center gap-1.5 text-[10px] text-neutral-500">Name
              <input type="text" :maxlength="SLOT_NAME_MAX" placeholder="none" spellcheck="false"
                     class="w-32 px-1.5 py-1 rounded bg-black/40 border border-white/15 text-[11px] font-medium text-white focus:outline-none focus:border-sky-400"
                     :value="nameOf(selLane, clipOf.slot)"
                     @change="setSlotName(nameKey(selLane), clipOf.slot, $event.target.value)"
                     @keydown.enter="$event.target.blur()" @keydown.stop />
              <span class="font-mono text-[10px] text-sky-200">-{{ slotLetter(selLane, clipOf.slot) }}</span>
            </label>
            <span v-if="clipOf" class="flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-500"
                  title="The clip plays its slot from the pattern's start (looping if shorter) on these bars of the section; silent outside its clips">
              Start
              <span class="flex items-center rounded border border-white/10 overflow-hidden font-mono">
                <button class="px-1.5 py-0.5 hover:bg-white/10" @click="setClipStart(clipOf.start - 1)">◀</button>
                <span class="px-1.5 text-white">{{ clipOf.start }}</span>
                <button class="px-1.5 py-0.5 hover:bg-white/10" @click="setClipStart(clipOf.start + 1)">▶</button>
              </span>
              Bars
              <span class="flex items-center rounded border border-white/10 overflow-hidden font-mono">
                <button class="px-1.5 py-0.5 hover:bg-white/10" @click="setClipLen(clipOf.len - 1)">−</button>
                <span class="px-1.5 text-white">{{ clipOf.len }}</span>
                <button class="px-1.5 py-0.5 hover:bg-white/10" @click="setClipLen(clipOf.len + 1)">+</button>
              </span>
              <span class="flex rounded border border-white/10 overflow-hidden font-mono">
                <button v-for="n in [1, 2, 4, 8, 16].filter(n => n <= maxLen)" :key="n" class="px-1.5 py-0.5" :class="clipOf.len === n ? 'bg-white/20 text-white' : 'hover:bg-white/10'" @click="setClipLen(n)">{{ n }}</button>
              </span>
              <span class="text-neutral-600">bars {{ clipOf.start }}–{{ clipOf.start + clipOf.len - 1 }} of {{ section.bars }}</span>
              <button class="px-1.5 py-0.5 rounded border border-white/10 hover:bg-white/10" title="A copy on the next free bars after it (Alt+drag the clip: anywhere)" @click="duplicateClip">Duplicate</button>
              <button v-if="hasOwnClips(section, selLane)" class="px-1.5 py-0.5 rounded border border-white/10 hover:bg-white/10" title="One clip over the whole section" @click="wholeSection">Whole section</button>
              <button class="px-1.5 py-0.5 rounded border border-white/10 hover:bg-rose-500/20 hover:text-rose-200" @click="deleteClip">Delete</button>
            </span>
            <span v-if="selLane === 'drum' && section.lanes.drum !== null" class="flex items-center gap-1.5 text-[10px] text-neutral-500">Density
              <input type="range" min="0" max="127" class="w-28 accent-sky-400" :value="section.drumDensity ?? 127" @input="section.drumDensity = Number($event.target.value)" />
              <span class="font-mono text-white w-7">{{ section.drumDensity ?? '—' }}</span>
              <button v-if="section.drumDensity != null" class="text-neutral-500 hover:text-white" title="Not set in this section" @click="section.drumDensity = null">×</button>
            </span>
            <span v-if="selLane === 'chord' && section.lanes.chord !== null && chordCount(section.lanes.chord) > 1" class="flex items-center gap-1 text-[10px] text-neutral-500">Steps
              <button class="px-1.5 py-1 rounded border font-mono" :class="section.chordSteps == null ? 'bg-white/20 border-white/40 text-white' : 'border-white/10 hover:bg-white/10'" @click="section.chordSteps = null">All</button>
              <button v-for="n in chordCount(section.lanes.chord) - 1" :key="n" class="px-1.5 py-1 rounded border font-mono"
                      :class="section.chordSteps === n ? 'bg-sky-500/70 border-sky-200 text-black' : 'border-white/10 hover:bg-white/10'"
                      :title="n === 1 ? 'Latch on chord 1: held for the whole section' : `Loop on chords 1–${n}`" @click="section.chordSteps = n">{{ n === 1 ? '1 · Latch' : n }}</button>
            </span>
            <span class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-neutral-500">
              <span class="font-black uppercase tracking-widest text-neutral-400" title="% of each channel's Max (the Rig's Fade modal), sent as CC 7; reached over the section's Vol ramp">Vol</span>
              <span v-for="r in laneChannels(selLane)" :key="r.key" class="flex items-center gap-1"
                    :title="volOf(r.key) === null ? `${chName(r)}: the song leaves its volume alone — move it to set it` : section.vol[r.key] === undefined ? `${chName(r)}: not set in this section — 100% (set in other sections)` : `${chName(r)}: ${section.vol[r.key]}% of its Max in this section`">
                <span class="font-mono truncate max-w-[7rem]" :class="section.vol[r.key] !== undefined ? 'text-sky-300' : 'text-neutral-500'">{{ chName(r) }}</span>
                <input type="range" min="0" max="100" step="1" class="w-20 accent-sky-400" :class="volOf(r.key) === null ? 'opacity-40' : ''"
                       :value="volOf(r.key) ?? 100" @input="setVol(r.key, $event.target.value)" />
                <span class="w-8 text-right font-mono" :class="section.vol[r.key] !== undefined ? 'text-white' : 'text-neutral-600'">{{ volOf(r.key) === null ? '—' : `${volOf(r.key)}%` }}</span>
                <button v-if="section.vol[r.key] !== undefined" class="text-neutral-500 hover:text-white" title="Not set in this section (100% if the song sets it elsewhere)" @click="clearVol(r.key)">×</button>
              </span>
              <span v-if="!laneChannels(selLane).length" class="text-[9px]">no MIDI channel known for this lane: the Rig lists them in LIVE mode</span>
            </span>
          </template>
          <span class="flex-1" />
          <span class="flex flex-wrap items-center gap-1.5 pl-3 border-l border-white/10 text-[10px] text-neutral-500">
            <span class="font-black uppercase tracking-widest text-neutral-400">{{ selLane ? 'Section' : `${sel + 1} ${section.name}` }}</span>
            <span class="flex rounded border border-white/10 overflow-hidden">
              <button v-for="b in SECTION_BAR_OPTIONS" :key="b" class="px-1.5 py-0.5 font-mono" :class="section.bars === b ? 'bg-white/20 text-white' : 'hover:bg-white/10'" @click="setSectionBars(section, b)">{{ b }}</button>
            </span>
            bars · Vol ramp
            <span class="flex rounded border border-white/10 overflow-hidden">
              <button v-for="b in VOL_BAR_OPTIONS" :key="b" class="px-1.5 py-0.5 font-mono" :class="section.volBars === b ? 'bg-white/20 text-white' : 'hover:bg-white/10'" @click="section.volBars = b">{{ barLabel(b) }}</button>
            </span>
            · BPM
            <input type="text" inputmode="decimal" class="w-12 bg-black/40 border border-white/10 rounded px-1 py-0.5 font-mono text-white text-center"
                   :title="'This section\'s tempo, from its first bar line — empty: the song\'s' + (song.bpm ? ` (${song.bpm})` : ' (none: the tempo as it is)')"
                   :value="section.bpm ?? ''" :placeholder="song.bpm ? String(song.bpm) : '—'" @change="setSectionBpm($event.target.value)" />
            <button :class="[btn, 'border-white/15 hover:bg-white/10']" :disabled="sel === 0 || playingHere" title="Move left" @click="moveSection(-1)"><ArrowLeft class="w-3 h-3" /></button>
            <button :class="[btn, 'border-white/15 hover:bg-white/10']" :disabled="sel === song.sections.length - 1 || playingHere" title="Move right" @click="moveSection(1)"><ArrowRight class="w-3 h-3" /></button>
            <button :class="[btn, 'border-white/15 hover:bg-white/10']" :disabled="song.sections.length >= MAX_SECTIONS" title="Add a section after this one (same clips)" @click="addSection"><Plus class="w-3 h-3 inline" /></button>
            <button :class="[btn, 'border-white/15 hover:bg-white/10']" :disabled="song.sections.length >= MAX_SECTIONS" title="Duplicate the section" @click="duplicateSection"><Copy class="w-3 h-3 inline" /></button>
            <button :class="[btn, 'border-white/15 hover:bg-red-500/20']" :disabled="song.sections.length <= 1 || playingHere" title="Delete the section" @click="deleteSection"><Trash2 class="w-3 h-3 inline" /></button>
          </span>
        </div>
      </div>
      <div v-else class="flex-1 flex items-center justify-center text-[11px] text-neutral-500">Open a song (or make one with New) to see it here.</div>
    </div>
    <!-- Tracks / Samples slot (right-click in the Slots pane) -->
    <Teleport to="body"><template v-if="audioMenu">
      <div class="fixed inset-0 z-[10000]" @click="audioMenu = null" @contextmenu.prevent="audioMenu = null"></div>
      <div class="fixed z-[10001] w-[280px] rounded-lg border border-white/15 bg-neutral-900/95 shadow-2xl p-2 flex flex-col gap-1.5 text-[11px]"
           :style="{ left: `${audioMenu.x}px`, top: `${audioMenu.y}px` }">
        <div class="text-[10px] font-black uppercase tracking-wider text-neutral-400">{{ laneLabel(audioMenu.lane) }} {{ SONG_SLOTS[audioMenu.v] }} · {{ song?.name }}</div>
        <template v-if="audioMenu.lane === 'track'">
          <div class="max-h-60 overflow-y-auto flex flex-col gap-0.5">
            <button v-for="t in libTracks" :key="t.id" class="text-left px-2 py-1 rounded hover:bg-white/10 flex justify-between gap-2"
                    :class="audioSlot('track', audioMenu.v)?.id === t.id ? 'bg-sky-500/25 text-sky-100' : 'text-neutral-200'"
                    :title="tempoOff(t) ? `${t.bpm} BPM — the song's tempo is ${tempoStore.arpBpm || 120} (no time-stretch)` : t.label"
                    @click="setTrackSlot(t)">
              <span class="truncate">{{ t.label }}</span>
              <span v-if="t.bpm" class="shrink-0 font-mono" :class="tempoOff(t) ? 'text-amber-300' : 'text-neutral-500'">{{ Math.round(t.bpm) }}</span>
            </button>
            <span v-if="!libTracks.length" class="px-2 py-1 text-neutral-500">No tracks in the library (Tracks Player: add some)</span>
          </div>
          <div v-if="audioSlot('track', audioMenu.v)" class="flex items-center gap-1.5">
            <span class="text-[10px] uppercase tracking-wider text-neutral-500">BPM</span>
            <input type="text" inputmode="decimal" class="w-14 bg-black/40 border border-white/10 rounded px-1 py-0.5 font-mono text-white text-center"
                   :class="tempoOff(audioSlot('track', audioMenu.v)) ? 'text-amber-300' : ''" title="The track's tempo (detection is often off: ×2 / ÷2, or type it)"
                   :value="audioSlot('track', audioMenu.v).bpm ?? ''" placeholder="?" @change="setTrackBpm($event.target.value)" />
            <button class="px-1.5 py-0.5 rounded border border-white/10 font-mono hover:bg-white/10" @click="scaleTrackBpm(2)">×2</button>
            <button class="px-1.5 py-0.5 rounded border border-white/10 font-mono hover:bg-white/10" @click="scaleTrackBpm(0.5)">÷2</button>
          </div>
          <div v-if="audioSlot('track', audioMenu.v)" class="flex items-center gap-1.5">
            <span class="text-[10px] uppercase tracking-wider text-neutral-500">Fit</span>
            <div class="flex flex-1 rounded border border-white/15 overflow-hidden font-bold">
              <button class="flex-1 px-2 py-1" :class="audioSlot('track', audioMenu.v).fit !== 'varispeed' ? 'bg-white/20 text-white' : 'text-neutral-400 hover:bg-white/10'" title="Off: at its own speed (free intros, ambient, unsteady tracks)" @click="audioSlot('track', audioMenu.v).fit = 'off'">Off</button>
              <button class="flex-1 px-2 py-1 border-l border-white/15" :class="audioSlot('track', audioMenu.v).fit === 'varispeed' ? 'bg-white/20 text-white' : 'text-neutral-400 hover:bg-white/10'"
                      :disabled="!audioSlot('track', audioMenu.v).bpm" title="Varispeed: its speed follows the song's tempo (song BPM ÷ its BPM; the pitch moves too — fine for small gaps). Needs its BPM" @click="audioSlot('track', audioMenu.v).fit = 'varispeed'">Varispeed</button>
            </div>
          </div>
          <div v-if="audioSlot('track', audioMenu.v)" class="flex items-center gap-1.5">
            <span class="text-[10px] uppercase tracking-wider text-neutral-500">Retrigger</span>
            <div class="flex flex-1 rounded border border-white/15 overflow-hidden font-bold">
              <button class="flex-1 px-2 py-1" :class="!audioSlot('track', audioMenu.v).retrigger ? 'bg-white/20 text-white' : 'text-neutral-400 hover:bg-white/10'" title="Off: it runs on while this slot follows, clip after clip, section after section (the song starting over: from its start)" @click="audioSlot('track', audioMenu.v).retrigger = false">Off</button>
              <button class="flex-1 px-2 py-1 border-l border-white/15" :class="audioSlot('track', audioMenu.v).retrigger ? 'bg-white/20 text-white' : 'text-neutral-400 hover:bg-white/10'" title="On: from its start at every clip" @click="audioSlot('track', audioMenu.v).retrigger = true">On</button>
            </div>
          </div>
          <button v-if="audioSlot('track', audioMenu.v)" class="px-2 py-1 rounded border border-white/10 text-neutral-300 hover:bg-white/10" @click="setTrackSlot(null)">Clear the slot</button>
        </template>
        <template v-else>
          <span class="px-1 text-neutral-200 truncate">{{ audioSlot('sample', audioMenu.v)?.name ?? 'Empty' }}</span>
          <button class="px-2 py-1 rounded border border-sky-400/40 text-sky-200 hover:bg-sky-500/20" @click="pickSampleFile">Pick from the Sound Folder…</button>
          <div v-if="audioSlot('sample', audioMenu.v)" class="flex rounded border border-white/15 overflow-hidden font-bold">
            <button class="flex-1 px-2 py-1" :class="audioSlot('sample', audioMenu.v).mode === 'oneshot' ? 'bg-white/20 text-white' : 'text-neutral-400 hover:bg-white/10'" title="Once, from the clip's bar line" @click="setSampleMode('oneshot')">One-shot</button>
            <button class="flex-1 px-2 py-1 border-l border-white/15" :class="audioSlot('sample', audioMenu.v).mode === 'loop' ? 'bg-white/20 text-white' : 'text-neutral-400 hover:bg-white/10'" title="Again and again until the clip ends" @click="setSampleMode('loop')">Loop</button>
          </div>
          <button v-if="audioSlot('sample', audioMenu.v)" class="px-2 py-1 rounded border border-white/10 text-neutral-300 hover:bg-white/10" @click="clearSampleSlot">Clear the slot</button>
        </template>
      </div>
    </template></Teleport>
    <ResizeHandles :start="onResizeStart" />
  </div>
</template>
