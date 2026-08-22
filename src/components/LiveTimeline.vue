<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  X, Minus, Play, Pause, Square, SkipBack, Plus, Trash2,
  ChevronUp, ChevronDown, Flag, ListMusic, ZoomIn, ZoomOut, Clock, Library,
  Save, FilePlus, FolderOpen, AudioLines
} from 'lucide-vue-next'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import { detectBpmFromUrl }      from '@/composables/useBpmDetector'
import { useMidiStore }    from '@/stores/useMidiStore'
import { usePresetStore }  from '@/stores/usePresetStore'
import { midiService, MidiSource } from '@/core/midi/midi-service'
import { useMappingStore }  from '@/stores/useMappingStore'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import MidiMapContextMenu     from '@/components/ui/MidiMapContextMenu.vue'
import { useLivePadStore } from '@/stores/useLivePadStore'
import { useSyncStore }    from '@/stores/useSyncStore'
import { useUiStore }      from '@/stores/useUiStore'
import { useAuthStore }    from '@/stores/useAuthStore'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { usePerformanceSets } from '@/composables/usePerformanceSets'
import catalogIndex        from '@/data/program_change/program_change.json'
const _pcDataModules = import.meta.glob('@/data/program_change/**/*.json')
import { collection, onSnapshot, query, orderBy, addDoc, getDocs, setDoc, deleteDoc, doc, serverTimestamp, db } from '@/lib/idb'
import { userKey } from '@/lib/userKey'
import { on } from '@/types/events'

const props = defineProps({ isOpen: Boolean })
const emit  = defineEmits(['close'])

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
  storageKey: 'SYCORE_POS_LIVE_TIMELINE',
  initialWidth: 1020,
  initialHeight: 580,
  minWidth: 700,
  minHeight: 440,
  zIndex: 100,
  minimizeLabel: 'Live Timeline',
  panelId: 'live-timeline',
})
watch(() => props.isOpen, (v) => { if (v) bringToFront() })

const midiStore    = useMidiStore()
const presetStore  = usePresetStore()
const livePadStore = useLivePadStore()
const authStore    = useAuthStore()

const allDevicesPcState = computed(() => {
  if (!midiStore.routingConfig?.registrations) return []
  const uiRoutes = midiStore.routingMatrix?.[MidiSource.UI] ?? []
  const curCh = (midiStore.midiChannel ?? 1) - 1  // 0-based

  return Object.entries(midiStore.routingConfig.registrations)
    .filter(([, r]) => r.outEnabled && r.pcEnabled)
    .map(([regKey, r]) => {
      const isUi = uiRoutes.includes(r.name ?? regKey)
      if (isUi) {
        return { key: regKey, name: r.name ?? regKey, isUi: true, soundName: presetStore.lastPreset?.name ?? null }
      }
      const allEntries = Object.entries(r.pcChannels ?? {})
        .map(([ch, info]) => ({ ch: parseInt(ch), ...info }))
        .sort((a, b) => a.ch - b.ch)
      const isMulti = r.isMulti && allEntries.length > 1
      const entries = isMulti
        ? [allEntries.find(e => e.ch === curCh) ?? allEntries[0]]
        : allEntries
      return { key: regKey, name: r.name ?? regKey, isUi: false, isMulti, entries }
    })
})
const syncStore    = useSyncStore()
const uiStore      = useUiStore()
const drumStore    = useDrumMachineStore()
const mappingStore = useMappingStore()
const { openMenu } = useMidiContextMenu()

const syncTimelineToAudioCapture = computed({
  get: () => syncStore.syncTimelineToAudioCapture,
  set: (v) => { syncStore.syncTimelineToAudioCapture = v },
})




// ─── localStorage ──────────────────────────────────────────────────────────
const LS_SEGS  = 'SYCORE_TIMELINE_SEGMENTS'
const LS_MARKS = 'SYCORE_TIMELINE_MARKERS'
const getLS = (k, d) => { try { const v = localStorage.getItem(userKey(k)); return v ? JSON.parse(v) : d } catch { return d } }
const setLS = (k, v) => { try { localStorage.setItem(userKey(k), JSON.stringify(v)) } catch {} }


// ─── Data ──────────────────────────────────────────────────────────────────
const segments = ref(getLS(LS_SEGS,  []))
const markers  = ref(getLS(LS_MARKS, []))

// ─── UI ────────────────────────────────────────────────────────────────────
const tab       = ref('timeline')  // 'timeline' | 'arrange'
const scale     = ref(0.25)        // px per beat (quarter note)
const timelineBpm = ref(midiStore.currentBpm || 120)

const showAddSeg    = ref(false)
const showAddMarker = ref(false)

const newSeg = ref({ trackIdx: 0, segStart: 0, segEnd: 0, label: '', notes: '' })
const newMkr    = ref({ position: 0, type: 'tempo', label: '', value: 120 })
const newMkrPos = ref('1:0')
const newMkrPc  = ref({ device: '', channel: 1, msb: null, lsb: null, soundName: '' })
const newMkrCp  = ref({ seqKey: '', chainEnabled: null })

// Add Segment: source tab ('playlist' | 'library') + library state
const segSource       = ref('playlist')
const libraryTracks   = ref([])
const librarySearch   = ref('')
const librarySelected = ref(null)   // track object from library, pending add

// Folder source (SoundFolderBrowser pick)
const folderPendingTrack = ref(null)  // { id, label, url, duration, author }
const folderSaveToLib    = ref(false)
const folderSaving       = ref(false)

// Save-to-library prompt after direct folder→timeline assign
const showSaveToLibPrompt = ref(false)
const saveToLibCandidate  = ref(null)   // { url: dataUrl, label, duration, playlistIdx }
const saveToLibSaving     = ref(false)
const bpmDetecting        = ref(false)
const bpmEditable         = ref('')

const libraryFiltered = computed(() => {
  const q = librarySearch.value.toLowerCase().trim()
  if (!q) return libraryTracks.value
  return libraryTracks.value.filter(t =>
    t.label?.toLowerCase().includes(q) ||
    t.genre?.toLowerCase().includes(q) ||
    String(t.bpm || '').includes(q)
  )
})

// Crossfade between segment transitions
const crossfadeOnChange = ref(false)
const crossfadeDurMs = computed({
  get: () => Math.round(livePadStore.crossfadeSec * 1000),
  set: v => {
    const sec = Math.max(0, Number(v)) / 1000
    livePadStore.crossfadeSec = sec
    window.dispatchEvent(new CustomEvent('playlist-mutate', { detail: { key: 'crossfadeSec', value: sec } }))
  }
})

// Loop timeline
const loopTimeline = ref(false)

// PC preset browser state
const showPcBrowser    = ref(false)
const pcBrowserBank    = ref('')
const pcBrowserSounds  = ref([])
const pcBrowserSearch  = ref('')
const pcBrowserLoading = ref(false)

// Performance set picker state
const { pcSets, loadSets: loadPerfSets } = usePerformanceSets()
const availPerfSets  = computed(() => pcSets.value)
const newMkrPerfSet  = ref({ setId: '', setName: '' })
const newMkrLm       = ref({ padIdx: 0 })
const newMkrDm       = ref({ presetName: '', seqKey: '', chainEnabled: null })
const newMkrDmRec    = ref({ measures: 4 })
const newMkrAudioLoop = ref({ measures: 2 })
const newMkrGoto     = ref({ targetTime: '0:00', repeat: false })

// ─── Macro chain helper ─────────────────────────────────────────────────────
const showMacroChain = ref(false)
const macroChain = ref({
  dmRecPos: 0,
  dmRecMeasures: 4,
  recDurationSec: 0,
  chainTrim: true,
  chainLoop: true,
  chainLoopMeasures: 2,
  chainCrop: true,
})

// ─── IDB Save / Load ───────────────────────────────────────────────────────
const TL_COL         = () => collection(db, 'users', authStore.user?.uid, 'timeline_sets')
const savedSets      = ref([])
const currentSetId   = ref(null)
const currentSetName = ref('')
const showSaveAs     = ref(false)
const saveAsName     = ref('')
const showLoadSets   = ref(false)

const MARKER_TYPES = [
  { value: 'tempo',           label: 'Change Tempo',         hasValue: true  },
  { value: 'perf-set',        label: 'Select Perf Set Pad',  hasValue: true  },
  { value: 'load-perf-set',   label: 'Load Performance Set', hasValue: true  },
  { value: 'crossfade',       label: 'CrossFade',            hasValue: true  },
  { value: 'program-change',  label: 'Program Change (PC)',  hasValue: true  },
  { value: 'seq-start',        label: 'Start Sequencer',          hasValue: false },
  { value: 'seq-stop',         label: 'Stop Sequencer',           hasValue: false },
  { value: 'cp-start',         label: 'Start Chord Prog',         hasValue: false },
  { value: 'cp-stop',          label: 'Stop Chord Prog',          hasValue: false },
  { value: 'cp-select-pattern',label: 'Select Chord Prog Slot',   hasValue: true  },
  { value: 'transport-start',  label: 'MIDI Sync Start',          hasValue: false },
  { value: 'transport-stop',   label: 'MIDI Sync Stop',           hasValue: false },
  { value: 'clock-start',      label: 'Start Clock (ticks only)', hasValue: false },
  { value: 'clock-stop',       label: 'Stop Clock (ticks only)',  hasValue: false },
  { value: 'lm-start',         label: 'Start Loop Machine Pad',   hasValue: false },
  { value: 'lm-stop',          label: 'Stop Loop Machine',        hasValue: false },
  { value: 'dm-start',         label: 'Start Drum Machine',       hasValue: false },
  { value: 'dm-stop',          label: 'Stop Drum Machine',        hasValue: false },
  { value: 'goto',             label: 'Go To Time',               hasValue: false },
  { value: 'dm-rec-sync',      label: 'DM Rec Sync (macro)',      hasValue: false },
  { value: 'audio-trim-start', label: 'Audio Trim Start (macro)',  hasValue: false },
  { value: 'audio-set-loop',   label: 'Audio Set Loop (macro)',   hasValue: true  },
  { value: 'audio-crop',       label: 'Audio Crop (macro)',       hasValue: false },
  { value: 'audio-save-wav',   label: 'Audio Save WAV (macro)',   hasValue: false },
  { value: 'tl-stop',          label: 'Stop Timeline',           hasValue: false },
  { value: 'gt-start',         label: 'Global Transport Start',  hasValue: false },
  { value: 'gt-stop',          label: 'Global Transport Stop',   hasValue: false },
]

const newMkrType = computed(() => MARKER_TYPES.find(t => t.value === newMkr.value.type))

// All registered output-enabled devices for PC target selection
const outDevices = computed(() => {
  const regs = midiStore.routingConfig?.registrations
  if (!regs) return []
  return Object.values(regs)
    .filter(r => r.outEnabled && r.name)
    .map(r => r.name)
    .sort()
})

// PC browser: fuzzy-match device name to catalog key
const pcCatalogKey = computed(() => {
  const dev = newMkrPc.value.device
  if (!dev) return ''
  return Object.keys(catalogIndex).find(k =>
    k.toLowerCase().includes(dev.toLowerCase()) ||
    dev.toLowerCase().includes(k.toLowerCase())
  ) || ''
})

const pcAvailableBanks = computed(() =>
  pcCatalogKey.value ? Object.keys(catalogIndex[pcCatalogKey.value] || {}) : []
)

const pcBrowserBankConfig = computed(() =>
  (pcCatalogKey.value && pcBrowserBank.value)
    ? (catalogIndex[pcCatalogKey.value]?.[pcBrowserBank.value] ?? null)
    : null
)

const pcBrowserFiltered = computed(() => {
  const q = pcBrowserSearch.value.toLowerCase().trim()
  if (!q) return pcBrowserSounds.value
  return pcBrowserSounds.value.filter(s =>
    s.name?.toLowerCase().includes(q) || s.category?.toLowerCase().includes(q)
  )
})

// ─── Playback ──────────────────────────────────────────────────────────────
const timelinePos  = ref(0)
const isPlaying    = ref(false)
const isPaused     = ref(false)
const activeSegIdx = ref(-1)

let _posAtStart          = 0
let _startedAt           = 0
let _effectiveBpm        = 120
let _rafId               = null
const _fired             = new Set()
let _lastTransportWasPlay = false  // tracks last transport-start/stop marker state

// ─── Colors ────────────────────────────────────────────────────────────────
const SEG_COLORS = [
  { bg: 'rgba(0,255,136,0.12)',   border: '#00ff88', text: '#00ff88' },
  { bg: 'rgba(217,70,239,0.12)', border: '#d946ef', text: '#d946ef' },
  { bg: 'rgba(249,115,22,0.12)', border: '#f97316', text: '#f97316' },
  { bg: 'rgba(34,211,238,0.12)', border: '#22d3ee', text: '#22d3ee' },
  { bg: 'rgba(124,58,237,0.12)', border: '#7c3aed', text: '#7c3aed' },
  { bg: 'rgba(244,63,94,0.12)',  border: '#f43f5e', text: '#f43f5e' },
]

const MKR_COLORS = {
  'tempo':          '#00ff88',
  'perf-set':       '#d946ef',
  'load-perf-set':  '#a855f7',
  'crossfade':      '#06b6d4',
  'program-change': '#f97316',
  'seq-start':       '#22d3ee',
  'seq-stop':        '#f43f5e',
  'cp-start':        '#7c3aed',
  'cp-stop':         '#dc2626',
  'cp-select-pattern':'#a855f7',
  'transport-start': '#4ade80',
  'transport-stop':  '#fb923c',
  'clock-start':     '#10b981',
  'clock-stop':      '#ef4444',
  'lm-start':        '#f59e0b',
  'lm-stop':         '#d97706',
  'dm-start':        '#ec4899',
  'dm-stop':         '#be185d',
  'goto':            '#a78bfa',
  'dm-rec-sync':      '#ff6b35',
  'audio-trim-start': '#38bdf8',
  'audio-set-loop':   '#34d399',
  'audio-crop':       '#f472b6',
  'audio-save-wav':   '#fbbf24',
  'tl-stop':          '#ef4444',
  'gt-start':         '#00ff88',
  'gt-stop':          '#ff0044',
}

const MKR_ICONS = {
  'tempo':          '♩',
  'perf-set':       '⊞',
  'load-perf-set':  '★',
  'crossfade':      '⇌',
  'program-change': 'PC',
  'seq-start':       '▶',
  'seq-stop':        '■',
  'cp-start':        '⏵',
  'cp-stop':         '⏹',
  'cp-select-pattern':'↕',
  'transport-start': '▷',
  'transport-stop':  '◻',
  'clock-start':     '⏱',
  'clock-stop':      '⏹',
  'lm-start':        '⊕',
  'lm-stop':         '⊗',
  'dm-start':        '⬡',
  'dm-stop':         '⬢',
  'goto':            '⏩',
  'dm-rec-sync':      '⏺',
  'audio-trim-start': '✂',
  'audio-set-loop':   '↺',
  'audio-crop':       '⊞',
  'audio-save-wav':   '⬇',
  'tl-stop':          '◼',
  'gt-start':         '⏯',
  'gt-stop':          '⏹',
}

const MKR_ABBREV = {
  'tempo':          'BPM',
  'perf-set':       'PAD',
  'load-perf-set':  'SET',
  'crossfade':      'XFD',
  'program-change': 'PC',
  'seq-start':       'SEQ▶',
  'seq-stop':        'SEQ■',
  'cp-start':        'CP▶',
  'cp-stop':         'CP■',
  'cp-select-pattern':'CPSL',
  'transport-start': 'SYN▶',
  'transport-stop':  'SYN■',
  'clock-start':     'CLK▶',
  'clock-stop':      'CLK■',
  'lm-start':        'LM▶',
  'lm-stop':         'LM■',
  'dm-start':        'DM▶',
  'dm-stop':         'DM■',
  'goto':            'GOTO',
  'dm-rec-sync':      'REC⏺',
  'audio-trim-start': 'TRM✂',
  'audio-set-loop':   'LOP↺',
  'audio-crop':       'CRP⊞',
  'audio-save-wav':   'SAVE',
  'tl-stop':          'TL■',
  'gt-start':         'GT▶',
  'gt-stop':          'GT■',
}

function segColor(idx)    { return SEG_COLORS[segments.value[idx]?.trackIdx % SEG_COLORS.length ?? idx % SEG_COLORS.length] }
function mColor(type)     { return MKR_COLORS[type] || '#fff' }
function mIcon(type)      { return MKR_ICONS[type] || '●' }
function mAbbrev(type)    { return MKR_ABBREV[type] || type }
function mTypeLabel(type) { return MARKER_TYPES.find(t => t.value === type)?.label || type }

// BPM from playlist track, falling back to library track by ID
// (playlist entry may pre-date when BPM was added to the data)
function getTrackBpm(trackIdx) {
  const pt = livePadStore.playlist[trackIdx]
  if (!pt) return null
  if (pt.bpm) return Number(pt.bpm)
  const lib = libraryTracks.value.find(t => t.id === pt.id)
  return lib?.bpm ? Number(lib.bpm) : null
}

function mDisplayValue(m) {
  switch (m.type) {
    case 'tempo':          return `${m.value} BPM`
    case 'perf-set':       return `Pad ${Number(m.value) + 1}`
    case 'load-perf-set':  return m.setName || m.setId || '—'
    case 'crossfade':      return `${m.value} ms`
    case 'program-change': return m.soundName ? m.soundName : `PC ${m.value}`
    case 'lm-start':       return `Pad ${(m.padIdx ?? 0) + 1}`
    case 'dm-start':       return [m.presetName, m.seqKey ? `Seq ${m.seqKey}` : ''].filter(Boolean).join(' / ') || '(current)'
    case 'cp-start':       return [m.seqKey ? `Slot ${m.seqKey}` : '', m.chainEnabled ? 'Chain' : ''].filter(Boolean).join(' / ') || '(current)'
    case 'goto':           return formatTime(m.targetBeat ?? 0) + (m.repeat ? ' ↻' : '')
    case 'dm-rec-sync':    return `${m.measures ?? 4} bars`
    case 'cp-select-pattern': return `Slot ${String.fromCharCode(65 + (m.value ?? 0))}`
    case 'audio-set-loop': return `${m.measures ?? 2} bars`
    case 'audio-save-wav': return m.filename || 'drum_machine.wav'
    default:               return ''
  }
}

// ─── Computed ──────────────────────────────────────────────────────────────
const playlist = computed(() => livePadStore.playlist)

const segBounds = computed(() => {
  let pos = 0
  return segments.value.map(seg => {
    const dur = Math.max(1, (seg.segEnd || 0) - (seg.segStart || 0))
    const start = pos
    pos += dur
    return { start, end: pos, dur }
  })
})

const totalDuration = computed(() => {
  if (segBounds.value.length) return segBounds.value[segBounds.value.length - 1].end
  if (markers.value.length) {
    const lastPos = Math.max(...markers.value.map(m => m.position))
    return lastPos + 16 // 4 bars of padding after the last marker
  }
  return 0
})

const timelineWidth = computed(() => Math.max(totalDuration.value * scale.value + 160, 800))

const progressPct = computed(() => {
  if (totalDuration.value <= 0) return 0
  return Math.min(100, (timelinePos.value / totalDuration.value) * 100)
})

const rulerTicks = computed(() => {
  const totalBars = Math.ceil(totalDuration.value / 4) + 16
  const target = Math.round(24 / scale.value)
  const barIntervals = [1, 2, 4, 8, 16, 32, 64]
  const interval = barIntervals.find(n => n * 4 * scale.value >= target) || 64
  const ticks = []
  for (let bar = 0; bar <= totalBars; bar += interval) {
    const beatPos = bar * 4
    ticks.push({ t: beatPos, x: beatPos * scale.value, label: (bar + 1).toString() })
  }
  return ticks
})

// ─── Format ────────────────────────────────────────────────────────────────
function formatTime(beats) {
  if (!isFinite(beats) || isNaN(beats)) return '0:00'
  const bar = Math.floor(beats / 4)
  const beat = (beats % 4).toFixed(1)
  return `${bar + 1}:${beat}`
}

function beatsToSec(beats, bpm) {
  return (beats / (bpm || 120)) * 60
}

function secToBeats(sec, bpm) {
  return sec * ((bpm || 120) / 60)
}

// ─── Playback engine ───────────────────────────────────────────────────────
function play() {
  if (isPlaying.value || totalDuration.value === 0) return
  const resumingFromPause = isPaused.value
  if (!resumingFromPause) window.dispatchEvent(new CustomEvent('toggle-backing-track', { detail: { play: false } }))
  _effectiveBpm = timelineBpm.value
  _posAtStart = timelinePos.value
  _startedAt  = performance.now()
  isPlaying.value = true
  isPaused.value  = false
  _fired.clear()
  markers.value.forEach(m  => { if (m.position < timelinePos.value)  _fired.add(m.id) })
  segBounds.value.forEach((b, i) => { if (b.end <= timelinePos.value) _fired.add(`seg_${i}`) })
  // Restore transport when resuming from pause if it was playing before
  if (resumingFromPause && _lastTransportWasPlay) midiStore.sendStart()
  if (syncStore.syncTimelineToAudioCapture)
    window.dispatchEvent(new CustomEvent('capture-start-rec', { detail: { background: true } }))
  _rafId = requestAnimationFrame(_tick)
}

function pause() {
  if (!isPlaying.value) return
  cancelAnimationFrame(_rafId)
  _rafId = null
  isPlaying.value = false
  isPaused.value  = true
  window.dispatchEvent(new CustomEvent('toggle-backing-track', { detail: { play: false } }))
  window.dispatchEvent(new CustomEvent('timeline-lm-stop'))
  window.dispatchEvent(new CustomEvent('timeline-dm-stop'))
  window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: false, source: 'timeline' } }))
  if (syncStore.syncTimelineToAudioCapture)
    window.dispatchEvent(new CustomEvent('capture-stop-rec'))
  midiStore.sendStop()
}

function stop() {
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null }
  isPlaying.value = false
  isPaused.value  = false
  timelinePos.value  = 0
  activeSegIdx.value = -1
  _fired.clear()
  _lastTransportWasPlay = false  // reset — no auto-resume after a full stop
  window.dispatchEvent(new CustomEvent('toggle-backing-track', { detail: { play: false } }))
  if (syncStore.syncTimelineToAudioCapture) {
    window.dispatchEvent(new CustomEvent('capture-stop-rec'))
    uiStore.isAudioCaptureOpen = true
  }
  midiStore.sendStop()
  window.dispatchEvent(new CustomEvent('timeline-lm-stop'))
  window.dispatchEvent(new CustomEvent('timeline-dm-stop'))
  window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: false, source: 'timeline' } }))
}

function _tick() {
  const elapsed = (performance.now() - _startedAt) / 1000
  timelinePos.value = _posAtStart + elapsed * (_effectiveBpm / 60)

  if (totalDuration.value > 0 && timelinePos.value >= totalDuration.value) {
    if (loopTimeline.value) {
      // Stop the backing track so playlist-play on the next tick restarts it cleanly
      window.dispatchEvent(new CustomEvent('toggle-backing-track', { detail: { play: false } }))
      timelinePos.value    = 0
      _posAtStart          = 0
      _startedAt           = performance.now()
      _lastTransportWasPlay = false
      _fired.clear()
      if (timelineRef.value) timelineRef.value.scrollLeft = 0
      _rafId = requestAnimationFrame(_tick)
      return
    }
    timelinePos.value  = totalDuration.value
    isPlaying.value    = false
    activeSegIdx.value = -1
    _lastTransportWasPlay = false
    midiStore.sendStop()
    window.dispatchEvent(new CustomEvent('toggle-backing-track', { detail: { play: false } }))
    window.dispatchEvent(new CustomEvent('timeline-lm-stop'))
    window.dispatchEvent(new CustomEvent('timeline-dm-stop'))
    window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: false, source: 'timeline' } }))
    return
  }

  // Smooth auto-scroll: keep playhead at ~30% from left
  const el = timelineRef.value
  if (el) {
    const px         = timelinePos.value * scale.value
    const targetLeft = Math.max(0, px - el.clientWidth * 0.3)
    el.scrollLeft   += (targetLeft - el.scrollLeft) * 0.1
  }

  _checkSegments()
  _checkMarkers()
  if (isPlaying.value) _rafId = requestAnimationFrame(_tick)
}

function _checkSegments() {
  const pos = timelinePos.value
  let next = -1
  segBounds.value.forEach((b, i) => { if (pos >= b.start && pos < b.end) next = i })

  if (next >= 0 && !_fired.has(`seg_${next}`)) {
    _fired.add(`seg_${next}`)
    activeSegIdx.value = next
    const seg = segments.value[next]
    if (seg) {
      const track = playlist.value[seg.trackIdx]
      const bpm = getTrackBpm(seg.trackIdx)
      if (bpm) {
        midiStore.setGlobalBpm(bpm)
        window.dispatchEvent(new CustomEvent('bpm-update', { detail: { bpm } }))
      }
      window.dispatchEvent(new CustomEvent('playlist-play', { detail: { idx: seg.trackIdx, playlist: playlist.value, crossfade: crossfadeOnChange.value, source: 'timeline' } }))
      // Always seek: audio target = segStart + how far the cursor is into this segment's timeline window.
      // This ensures correct playback whether starting from the segment's beginning or mid-segment,
      // and whether segStart is 0 or non-zero.
      if (track?.duration > 0) {
        const trackBpm = getTrackBpm(seg.trackIdx) || timelineBpm.value
        const bounds = segBounds.value[next]
        const audioTargetSeconds = beatsToSec((seg.segStart || 0) + (pos - bounds.start), trackBpm)
        const ratio = Math.max(0, Math.min(1, audioTargetSeconds / track.duration))
        setTimeout(() => window.dispatchEvent(new CustomEvent('playlist-seek', { detail: ratio })), 150)
      }
    }
  } else if (next >= 0) {
    activeSegIdx.value = next
  } else if (next === -1 && activeSegIdx.value !== -1) {
    // Cursor left the segment's bounds — stop the backing track so audio doesn't bleed into gaps
    activeSegIdx.value = -1
    window.dispatchEvent(new CustomEvent('toggle-backing-track', { detail: { play: false } }))
  }
}

function _checkMarkers() {
  const pos = timelinePos.value
  markers.value.forEach(m => {
    if (pos >= m.position && !_fired.has(m.id)) {
      _fired.add(m.id)
      _fireMarker(m)
    }
  })
}

function _fireMarker(m) {
  switch (m.type) {
    case 'tempo': {
      const bpm = Number(m.value)
      if (bpm > 0) {
        midiStore.setGlobalBpm(bpm)
        if (isPlaying.value) _effectiveBpm = bpm
      }
      break
    }
    case 'perf-set': {
      const padIdx = Math.max(0, Math.min(15, Number(m.value)))
      // LPP always mounted (v-show), handles this event directly
      window.dispatchEvent(new CustomEvent('timeline-trigger-perf-set', { detail: { idx: padIdx } }))
      break
    }
    case 'load-perf-set': {
      // Loads the performance set directly by ID (independent of pad assignment)
      window.dispatchEvent(new CustomEvent('timeline-load-perf-set', { detail: { setId: m.setId } }))
      break
    }
    case 'crossfade': {
      // Update BTP crossfade duration (ms → seconds)
      const sec = Math.max(0, Number(m.value)) / 1000
      window.dispatchEvent(new CustomEvent('playlist-mutate', { detail: { key: 'crossfadeSec', value: sec } }))
      break
    }
    case 'program-change': {
      const pc   = Math.max(0, Math.min(127, Number(m.value)))
      const ch   = Math.max(0, Math.min(15, Number(m.channel ?? 0)))
      const port = midiStore.outputs.find(o => o.name === m.device)
      if (port) {
        if (m.msb !== null && m.msb !== undefined) port.send([0xB0 | ch, 0,  m.msb])
        if (m.lsb !== null && m.lsb !== undefined) port.send([0xB0 | ch, 32, m.lsb])
        port.send([0xC0 | ch, pc])
      }
      // Keep pcChannels in sync so the Patches panel reflects the fired state
      const reg = midiStore.routingConfig?.registrations?.[m.device]
      if (reg) {
        const updated = {
          ...(reg.pcChannels ?? {}),
          [ch]: {
            program:   pc,
            bank:      reg.pcBank ?? '',
            soundName: m.soundName ?? '',
            category:  '',
            msb:       m.msb ?? 0,
            lsb:       m.lsb ?? 0,
          },
        }
        midiStore.updateRegistration(m.device, 'pcChannels', updated)
        midiStore.updateRegistration(m.device, 'pcProgram', pc)
        if (m.msb != null) midiStore.updateRegistration(m.device, 'pcMsb', m.msb)
        if (m.lsb != null) midiStore.updateRegistration(m.device, 'pcLsb', m.lsb)
      }
      break
    }
    case 'seq-start':
      window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: true, source: 'timeline' } }))
      break
    case 'seq-stop':
      window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: false, source: 'timeline' } }))
      break
    case 'cp-start':
      if (m.seqKey) {
        const slotIdx = 'ABCDEFGH'.indexOf(m.seqKey)
        if (slotIdx >= 0) window.dispatchEvent(new CustomEvent('cp-slot-select', { detail: { idx: slotIdx } }))
      }
      if (m.chainEnabled != null) {
        window.dispatchEvent(new CustomEvent('cp-chain-toggle', { detail: { enabled: m.chainEnabled } }))
      }
      window.dispatchEvent(new CustomEvent('cp-start'))
      break
    case 'cp-stop':
      window.dispatchEvent(new CustomEvent('cp-stop'))
      break
    case 'cp-select-pattern':
      window.dispatchEvent(new CustomEvent('cp-slot-select', { detail: { idx: Math.max(0, Math.min(7, m.value ?? 0)) } }))
      break
    // Full transport sync: sends 0xFC → 0xFA + starts clock ticks
    case 'transport-start':
      _lastTransportWasPlay = true
      midiStore.sendStart()
      break
    case 'transport-stop':
      _lastTransportWasPlay = false
      midiStore.sendStop()
      break
    // Global Transport: Play All / Stop All (synced apps)
    case 'gt-start':
      window.dispatchEvent(new CustomEvent('transport-play-all'))
      break
    case 'gt-stop':
      window.dispatchEvent(new CustomEvent('transport-stop-all'))
      break
    // Clock ticks only (no transport START/STOP byte)
    case 'clock-start':
      midiStore.startClock()
      break
    case 'clock-stop':
      midiStore.stopClock()
      break
    case 'lm-start':
      window.dispatchEvent(new CustomEvent('timeline-lm-start', { detail: { padIdx: m.padIdx ?? 0, bpm: midiStore.currentBpm } }))
      break
    case 'lm-stop':
      window.dispatchEvent(new CustomEvent('timeline-lm-stop'))
      break
    case 'dm-start':
      window.dispatchEvent(new CustomEvent('timeline-dm-start', { detail: { presetName: m.presetName, seqKey: m.seqKey, chainEnabled: m.chainEnabled, bpm: midiStore.currentBpm } }))
      break
    case 'dm-stop':
      window.dispatchEvent(new CustomEvent('timeline-dm-stop'))
      break
    case 'dm-rec-sync': {
      const measures = m.measures ?? 4
      window.dispatchEvent(new CustomEvent('timeline-dm-rec-sync', { detail: { measures } }))
      break
    }
    case 'audio-trim-start':
      window.dispatchEvent(new CustomEvent('timeline-audio-trim-start'))
      break
    case 'audio-set-loop': {
      const loopMeasures = m.measures ?? 2
      window.dispatchEvent(new CustomEvent('timeline-audio-set-loop', { detail: { measures: loopMeasures } }))
      break
    }
    case 'audio-crop':
      window.dispatchEvent(new CustomEvent('timeline-audio-crop'))
      break
    case 'audio-save-wav': {
      const pName = drumStore.currentPresetName || 'preset'
      const seq = drumStore.activeSequence || 'A'
      const bpm = drumStore.bpm || 120
      const filename = `sycore_dm_${pName.toLowerCase().replace(/\s+/g, '_')}_${seq}_${bpm}bpm.wav`
      window.dispatchEvent(new CustomEvent('timeline-audio-save-wav', { detail: { filename } }))
      break
    }
    case 'tl-stop':
      stop()
      break
    case 'goto': {
      const target = m.targetBeat ?? m.targetSec ?? 0
      window.dispatchEvent(new CustomEvent('toggle-backing-track', { detail: { play: false } }))
      timelinePos.value = target
      _posAtStart = target
      _startedAt  = performance.now()
      // Re-sync _fired to the new position
      markers.value.forEach(mk => {
        if (mk.id === m.id) return
        if (mk.position < target) _fired.add(mk.id)
        else _fired.delete(mk.id)
      })
      segBounds.value.forEach((b, i) => {
        if (b.end <= target) _fired.add(`seg_${i}`)
        else _fired.delete(`seg_${i}`)
      })
      // repeat: true → remove from _fired so it fires again next pass
      if (m.repeat) _fired.delete(m.id)
      break
    }
  }
}

// ─── Selection ─────────────────────────────────────────────────────────────
const selectedSegIdx   = ref(-1)
const selectedMarkerId = ref(null)

const selectedSeg    = computed(() => selectedSegIdx.value >= 0 ? segments.value[selectedSegIdx.value] : null)
const selectedMarker = computed(() => selectedMarkerId.value ? markers.value.find(m => m.id === selectedMarkerId.value) : null)

function clickSeg(idx) {
  selectedSegIdx.value   = selectedSegIdx.value === idx ? -1 : idx
  selectedMarkerId.value = null
}

function clickMarker(id) {
  selectedMarkerId.value = selectedMarkerId.value === id ? null : id
  selectedSegIdx.value   = -1
}

// ─── Time editing helpers ───────────────────────────────────────────────────
function parseTimeStr(s) {
  s = String(s).trim()
  if (s.includes(':')) {
    const [bar, beat] = s.split(':')
    return Math.max(0, (Number(bar) - 1) * 4 + (Number(beat) || 0))
  }
  return Math.max(0, Number(s) || 0)
}

function updateSegStart(val) {
  const idx = selectedSegIdx.value
  if (idx < 0) return
  const t   = parseTimeStr(val)
  const seg = segments.value[idx]
  seg.segStart = Math.max(0, Math.min(t, seg.segEnd - 4))
}

function updateSegEnd(val) {
  const idx = selectedSegIdx.value
  if (idx < 0) return
  const t      = parseTimeStr(val)
  const seg    = segments.value[idx]
  seg.segEnd   = Math.max(seg.segStart + 4, t)
}

function updateMarkerPos(val) {
  const m = markers.value.find(mk => mk.id === selectedMarkerId.value)
  if (!m) return
  m.position = Math.max(0, parseTimeStr(val))
  markers.value.sort((a, b) => a.position - b.position)
}

// Editable footer position
const editingPos = ref(false)

function commitSeek(val) {
  if (!editingPos.value) return
  editingPos.value = false
  const t = parseTimeStr(val)
  timelinePos.value = Math.max(0, Math.min(t, totalDuration.value || Infinity))
  if (isPlaying.value) {
    _posAtStart = timelinePos.value
    _startedAt  = performance.now()
    _fired.clear()
    markers.value.forEach(m  => { if (m.position  < timelinePos.value) _fired.add(m.id) })
    segBounds.value.forEach((b, i) => { if (b.end <= timelinePos.value) _fired.add(`seg_${i}`) })
  }
}

// ─── Seek ──────────────────────────────────────────────────────────────────
const timelineRef = ref(null)

function onRulerClick(e) {
  if (!timelineRef.value || !e.target.closest('.tl-ruler')) return
  const rect = timelineRef.value.getBoundingClientRect()
  const x    = e.clientX - rect.left + timelineRef.value.scrollLeft
  const t    = Math.max(0, Math.min(x / scale.value, totalDuration.value))
  timelinePos.value = t
  if (isPlaying.value) {
    _posAtStart = t
    _startedAt  = performance.now()
    _fired.clear()
    markers.value.forEach(m => { if (m.position < t) _fired.add(m.id) })
    segBounds.value.forEach((b, i) => { if (b.end <= t) _fired.add(`seg_${i}`) })
  }
}

// ─── Playhead drag ─────────────────────────────────────────────────────────
const isDraggingPlayhead = ref(false)

function _seekTo(t) {
  timelinePos.value = t
  if (isPlaying.value) {
    _posAtStart = t
    _startedAt  = performance.now()
    _fired.clear()
    markers.value.forEach(m => { if (m.position < t) _fired.add(m.id) })
    segBounds.value.forEach((b, i) => { if (b.end <= t) _fired.add(`seg_${i}`) })
  }
}

function onPlayheadMouseDown(e) {
  e.stopPropagation()
  isDraggingPlayhead.value = true
  document.addEventListener('mousemove', _onPlayheadDrag)
  document.addEventListener('mouseup',   _onPlayheadDragEnd)
}

function _onPlayheadDrag(e) {
  if (!timelineRef.value) return
  const rect = timelineRef.value.getBoundingClientRect()
  const x    = e.clientX - rect.left + timelineRef.value.scrollLeft
  _seekTo(Math.max(0, Math.min(x / scale.value, totalDuration.value)))
}

function _onPlayheadDragEnd() {
  isDraggingPlayhead.value = false
  document.removeEventListener('mousemove', _onPlayheadDrag)
  document.removeEventListener('mouseup',   _onPlayheadDragEnd)
}

// ─── Segment ops ───────────────────────────────────────────────────────────
function probeDuration(url) {
  return new Promise(res => {
    const a = new Audio(url)
    a.addEventListener('loadedmetadata', () => res(isFinite(a.duration) ? a.duration : 0), { once: true })
    a.addEventListener('error', () => res(0), { once: true })
  })
}

function openAddSeg() {
  segSource.value          = playlist.value.length ? 'playlist' : 'library'
  librarySearch.value      = ''
  librarySelected.value    = null
  folderPendingTrack.value = null
  folderSaveToLib.value    = false
  if (playlist.value.length) {
    const t = playlist.value[0]
    newSeg.value = { trackIdx: 0, segStart: 0, segEnd: t?.duration || 60, label: t?.label || '' }
  }
  showAddSeg.value = true
}

function openFolderForTimeline() {
  uiStore.soundFolderAssignTarget = {
    label: 'Add to Timeline',
    onAssign: async (file) => {
      const raw      = await file.handle.getFile()
      const blobUrl  = URL.createObjectURL(raw)
      const duration = await probeDuration(blobUrl)
      // Keep blobUrl alive — reused for BPM detection below
      const dataUrl  = await new Promise((res, rej) => {
        const reader = new FileReader()
        reader.onload  = () => res(reader.result)
        reader.onerror = rej
        reader.readAsDataURL(raw)
      })
      const track    = {
        id:     `folder_${Date.now()}`,
        label:  file.name.replace(/\.[^.]+$/, ''),
        url:    dataUrl,
        author: 'Sound Folder',
        duration,
      }
      livePadStore.playlist = [...playlist.value, track]
      const trackIdx = playlist.value.length - 1
      segments.value.push({
        id:       `s${Date.now()}`,
        trackIdx,
        segStart: 0,
        segEnd:   Math.max(1, duration || 60),
        label:    track.label,
      })
      uiStore.soundFolderAssignTarget = null
      saveToLibCandidate.value  = { url: dataUrl, label: track.label, duration, playlistIdx: trackIdx }
      showSaveToLibPrompt.value = true
      bpmEditable.value         = ''
      bpmDetecting.value        = true
      detectBpmFromUrl(blobUrl)
        .then(detected => {
          URL.revokeObjectURL(blobUrl)
          bpmDetecting.value = false
          if (detected) {
            bpmEditable.value = String(detected)
            // Write BPM into the playlist entry so timeline segment tempo sync works
            const pl = [...livePadStore.playlist]
            if (pl[trackIdx]) { pl[trackIdx] = { ...pl[trackIdx], bpm: detected }; livePadStore.playlist = pl }
          }
        })
        .catch(() => { URL.revokeObjectURL(blobUrl); bpmDetecting.value = false })
    },
  }
  uiStore.isSoundFolderBrowserOpen = true
}

function selectLibraryTrack(track) {
  librarySelected.value = track
  newSeg.value = { trackIdx: -1, segStart: 0, segEnd: track.duration || 60, label: track.label || '' }
}

function onSegTrackChange() {
  const t = playlist.value[newSeg.value.trackIdx]
  if (t) { newSeg.value.segEnd = t.duration || 60; newSeg.value.label = t.label || '' }
}

async function confirmAddSeg() {
  let trackIdx = Number(newSeg.value.trackIdx)

  // Library source: ensure the track is in the playlist first
  if (segSource.value === 'library' && librarySelected.value) {
    const libTrack = librarySelected.value
    const existIdx = playlist.value.findIndex(p => p.id === libTrack.id)
    if (existIdx >= 0) {
      trackIdx = existIdx
    } else {
      livePadStore.playlist = [...playlist.value, libTrack]
      trackIdx = playlist.value.length - 1
    }
  }

  // Folder source: add file to playlist, optionally save to library
  if (segSource.value === 'folder' && folderPendingTrack.value) {
    const track = { ...folderPendingTrack.value }

    if (folderSaveToLib.value) {
      folderSaving.value = true
      try {
        const blob    = await fetch(track.url).then(r => r.blob())
        const dataUrl = await new Promise((res, rej) => {
          const reader = new FileReader()
          reader.onload  = () => res(reader.result)
          reader.onerror = rej
          reader.readAsDataURL(blob)
        })
        const ref = await addDoc(collection(db, 'backing_tracks'), {
          url:       dataUrl,
          label:     track.label,
          author:    'Sound Folder',
          duration:  track.duration,
          genre:     'Local',
          createdAt: serverTimestamp(),
        })
        // Use the IDB doc ID so library can find it later
        track.id = ref._segments[ref._segments.length - 1]
        track.url = dataUrl
      } catch (e) {
        console.error('[Timeline] saveToLibrary', e)
      } finally {
        folderSaving.value = false
      }
    }

    const existIdx = playlist.value.findIndex(p => p.id === track.id)
    if (existIdx >= 0) {
      trackIdx = existIdx
    } else {
      livePadStore.playlist = [...playlist.value, track]
      trackIdx = playlist.value.length - 1
    }
  }

  const t      = playlist.value[trackIdx]
  const maxDur = t?.duration || 3600
  const start  = Math.max(0, Math.min(Number(newSeg.value.segStart), maxDur - 1))
  const end    = Math.min(maxDur, Math.max(start + 1, Number(newSeg.value.segEnd)))
  segments.value.push({
    id:       `s${Date.now()}`,
    trackIdx,
    segStart: start,
    segEnd:   end,
    label:    newSeg.value.label || t?.label || `Track ${trackIdx + 1}`,
    notes:    newSeg.value.notes || '',
  })
  showAddSeg.value = false
}

function removeSeg(id) { segments.value = segments.value.filter(s => s.id !== id) }

function moveSeg(idx, dir) {
  const arr = [...segments.value]
  const t   = idx + dir
  if (t < 0 || t >= arr.length) return
  ;[arr[idx], arr[t]] = [arr[t], arr[idx]]
  segments.value = arr
}

async function confirmSaveToLib() {
  const c = saveToLibCandidate.value
  if (!c || !authStore.user?.uid) return
  saveToLibSaving.value = true
  try {
    const bpmVal = Number(bpmEditable.value)
    const data = {
      url:       c.url,
      label:     c.label,
      genre:     'Local',
      duration:  c.duration || 0,
      createdAt: serverTimestamp(),
    }
    if (bpmVal > 0) data.bpm = bpmVal
    await addDoc(collection(db, 'users', authStore.user.uid, 'backing_tracks'), data)
    // Ensure playlist entry has BPM even if detection finished after prompt opened
    if (bpmVal > 0 && c.playlistIdx != null) {
      const pl = [...livePadStore.playlist]
      if (pl[c.playlistIdx]) { pl[c.playlistIdx] = { ...pl[c.playlistIdx], bpm: bpmVal }; livePadStore.playlist = pl }
    }
  } catch (e) {
    console.error('[Timeline] saveToLib', e)
  } finally {
    saveToLibSaving.value     = false
    showSaveToLibPrompt.value = false
    saveToLibCandidate.value  = null
    bpmEditable.value         = ''
    bpmDetecting.value        = false
  }
}

// ─── Marker ops ────────────────────────────────────────────────────────────
function openAddMarker() {
  newMkr.value = {
    position: Math.round(timelinePos.value),
    type:     'tempo',
    label:    '',
    value:    midiStore.currentBpm || 120,
  }
  newMkrPos.value = formatTime(Math.round(timelinePos.value))
  newMkrPc.value = {
    device:    outDevices.value[0] || '',
    channel:   1,
    msb:       null,
    lsb:       null,
    soundName: '',
  }
  // Load saved performance sets (IndexedDB via usePerformanceSets)
  loadPerfSets().then(() => {
    if (!newMkrPerfSet.value.setId) {
      newMkrPerfSet.value = {
        setId:   availPerfSets.value[0]?.id   || '',
        setName: availPerfSets.value[0]?.name || '',
      }
    }
  })
  newMkrPerfSet.value = {
    setId:   availPerfSets.value[0]?.id   || '',
    setName: availPerfSets.value[0]?.name || '',
  }
  newMkrLm.value   = { padIdx: 0 }
  newMkrDm.value   = { presetName: '', seqKey: '', chainEnabled: null }
  newMkrCp.value   = { seqKey: '', chainEnabled: null }
  newMkrDmRec.value = { measures: 4 }
  newMkrAudioLoop.value = { measures: 2 }
  newMkrGoto.value = { targetTime: '0:00', repeat: false }
  showAddMarker.value = true
}

function confirmAddMarker() {
  const type = newMkr.value.type
  let val = newMkr.value.value
  newMkr.value.position = parseTimeStr(newMkrPos.value)

  if (type === 'perf-set') {
    val = Math.max(0, Math.min(15, Number(val)))
  } else if (type === 'crossfade') {
    val = Math.max(0, Number(val))
  }

  let extra = {}
  if (type === 'program-change') {
    extra = {
      device:    newMkrPc.value.device,
      channel:   Math.max(1, Math.min(16, Number(newMkrPc.value.channel))) - 1,
      msb:       newMkrPc.value.msb,
      lsb:       newMkrPc.value.lsb,
      soundName: newMkrPc.value.soundName,
    }
  } else if (type === 'load-perf-set') {
    extra = {
      setId:   newMkrPerfSet.value.setId,
      setName: newMkrPerfSet.value.setName,
    }
    val = 0
  } else if (type === 'lm-start') {
    extra = { padIdx: Math.max(0, Math.min(23, Number(newMkrLm.value.padIdx))) }
  } else if (type === 'dm-start') {
    extra = {
      presetName:   newMkrDm.value.presetName || '',
      seqKey:       newMkrDm.value.seqKey     || '',
      chainEnabled: newMkrDm.value.chainEnabled,
    }
  } else if (type === 'cp-start') {
    extra = {
      seqKey:       newMkrCp.value.seqKey     || '',
      chainEnabled: newMkrCp.value.chainEnabled,
    }
  } else if (type === 'goto') {
    extra = {
      targetBeat: parseTimeStr(newMkrGoto.value.targetTime),
      repeat:    newMkrGoto.value.repeat,
    }
  } else if (type === 'dm-rec-sync') {
    extra = { measures: Math.max(1, Math.min(16, Number(newMkrDmRec.value.measures))) }
  } else if (type === 'audio-set-loop') {
    extra = { measures: Math.max(1, Math.min(16, Number(newMkrAudioLoop.value.measures))) }
  } else if (type === 'audio-save-wav') {
    extra = {}
  }

  markers.value.push({
    id:       `m${Date.now()}`,
    position: Number(newMkr.value.position),
    type,
    label:    newMkr.value.label,
    value:    val,
    ...extra,
  })
  markers.value.sort((a, b) => a.position - b.position)
  showAddMarker.value = false

  // After adding dm-rec-sync, suggest chaining subsequent macro markers
  if (type === 'dm-rec-sync') {
    const bpm = midiStore.currentBpm || 120
    const measures = extra.measures ?? 4
    const recDurBeats = 4 + measures * 4
    macroChain.value = {
      dmRecPos: Number(newMkr.value.position),
      dmRecMeasures: measures,
      recDurationSec: recDurBeats,
      chainTrim: true,
      chainLoop: true,
      chainLoopMeasures: 2,
      chainCrop: true,
      chainSave: true,
    }
    showMacroChain.value = true
  }
}

function confirmMacroChain() {
  const mc = macroChain.value
  const recEndPos = mc.dmRecPos + mc.recDurationSec
  let offset = 0

  if (mc.chainTrim) {
    markers.value.push({
      id: `m${Date.now()}_1`,
      position: recEndPos + offset,
      type: 'audio-trim-start',
      label: '',
      value: 0,
    })
    offset += 0.25
  }
  if (mc.chainLoop) {
    markers.value.push({
      id: `m${Date.now()}_2`,
      position: recEndPos + offset,
      type: 'audio-set-loop',
      label: '',
      value: mc.chainLoopMeasures,
      measures: mc.chainLoopMeasures,
    })
    offset += 0.25
  }
  if (mc.chainCrop) {
    markers.value.push({
      id: `m${Date.now()}_3`,
      position: recEndPos + offset,
      type: 'audio-crop',
      label: '',
      value: 0,
    })
    offset += 0.25
  }
  if (mc.chainSave) {
    markers.value.push({
      id: `m${Date.now()}_4`,
      position: recEndPos + offset,
      type: 'audio-save-wav',
      label: '',
      value: 0,
    })
    offset += 0.25
  }
  // Always stop the timeline at the end of the macro chain
  markers.value.push({
    id: `m${Date.now()}_stop`,
    position: recEndPos + offset,
    type: 'tl-stop',
    label: '',
    value: 0,
  })
  markers.value.sort((a, b) => a.position - b.position)
  showMacroChain.value = false
}

function removeMarker(id) { markers.value = markers.value.filter(m => m.id !== id) }

// ─── PC Preset Browser ─────────────────────────────────────────────────────
watch(pcBrowserBank, async (bank) => {
  pcBrowserSounds.value = []
  if (!bank || !pcBrowserBankConfig.value) return
  pcBrowserLoading.value = true
  try {
    const match = pcBrowserBankConfig.value.data.match(/^\.\/([^/]+)\/(.+)$/)
    if (!match) return
    const [, folder, filename] = match
    const key    = Object.keys(_pcDataModules).find(k => k.endsWith(`/${folder}/${filename}`))
    if (!key) { console.warn('[Timeline PC Browser] data file not found:', folder, filename); return }
    const mod    = await _pcDataModules[key]()
    pcBrowserSounds.value = mod.default ?? mod
  } catch (e) {
    console.error('[Timeline PC Browser]', e)
  } finally {
    pcBrowserLoading.value = false
  }
})

function openPcBrowser() {
  pcBrowserBank.value   = pcAvailableBanks.value[0] || ''
  pcBrowserSearch.value = ''
  showPcBrowser.value   = true
}

function selectPcSound(sound) {
  const cfg    = pcBrowserBankConfig.value
  if (!cfg) return
  const pField = cfg.program_field ?? 'program'
  const prog   = sound[pField] ?? 0
  let progNum  = prog >= 128 ? prog % 128 : prog
  progNum      = Math.max(0, Math.min(127, progNum + (cfg.program_base ?? 0)))
  // Mirror MidiDeviceProgramChangePanel.sendCatalogSound: always derive msb/lsb,
  // never store null when the catalog has cfg.msb/lsb = false.
  const msb = cfg.msb ? (sound.msb ?? 0) : Math.floor(prog / 128)
  const lsb = cfg.lsb ? (sound.lsb ?? 0) : 0
  newMkr.value.value       = progNum
  newMkrPc.value.msb       = msb
  newMkrPc.value.lsb       = lsb
  newMkrPc.value.soundName = sound.name || ''
  showPcBrowser.value = false
}

// ─── IDB Timeline Set ops ──────────────────────────────────────────────────
async function loadSets() {
  try {
    const snap = await getDocs(TL_COL())
    const rows = []
    snap.forEach(d => rows.push({ id: d.id, ...d.data() }))
    rows.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''))
    savedSets.value = rows
  } catch (e) {
    console.error('[Timeline] loadSets', e)
  }
}

function openSaveAs() {
  saveAsName.value = currentSetName.value || ''
  showSaveAs.value = true
}

async function _snapshotPlaylist() {
  const usedIdxs = new Set(segments.value.map(s => s.trackIdx))
  const entries = []
  for (const idx of [...usedIdxs].sort((a, b) => a - b)) {
    const t = playlist.value[idx]
    if (!t) continue
    let url = t.url || ''
    if (url.startsWith('blob:')) {
      try {
        const blob = await fetch(url).then(r => r.blob())
        url = await new Promise((res, rej) => {
          const reader = new FileReader()
          reader.onload  = () => res(reader.result)
          reader.onerror = rej
          reader.readAsDataURL(blob)
        })
      } catch { url = '' }
    }
    entries.push({ _origIdx: idx, ...t, url })
  }
  return entries
}

async function confirmSaveAs() {
  const name = saveAsName.value.trim()
  if (!name) return
  try {
    const snapshotPlaylist = await _snapshotPlaylist()
    const ref = await addDoc(TL_COL(), {
      name,
      segments: segments.value,
      markers:  markers.value,
      playlist: snapshotPlaylist,
      savedAt:  new Date().toISOString(),
    })
    currentSetId.value   = ref._segments[ref._segments.length - 1]
    currentSetName.value = name
    showSaveAs.value     = false
    await loadSets()
  } catch (e) {
    console.error('[Timeline] saveAs', e)
  }
}

async function saveUpdate() {
  if (!currentSetId.value) return
  try {
    const snapshotPlaylist = await _snapshotPlaylist()
    await setDoc(doc(TL_COL(), currentSetId.value), {
      name:     currentSetName.value,
      segments: segments.value,
      markers:  markers.value,
      playlist: snapshotPlaylist,
      savedAt:  new Date().toISOString(),
    })
    await loadSets()
  } catch (e) {
    console.error('[Timeline] saveUpdate', e)
  }
}

function loadSet(set) {
  stop()
  if (set.playlist?.length) {
    // Rebuild playlist so trackIdx values in segments remain valid.
    // _snapshotPlaylist stores _origIdx; place each entry at that index.
    const maxIdx = Math.max(...set.playlist.map(t => t._origIdx ?? 0))
    const rebuilt = new Array(maxIdx + 1).fill(null)
    set.playlist.forEach(t => { rebuilt[t._origIdx ?? 0] = t })
    livePadStore.playlist = rebuilt.filter(Boolean)
  }
  segments.value       = set.segments || []
  markers.value        = (set.markers  || []).sort((a, b) => a.position - b.position)
  currentSetId.value   = set.id
  currentSetName.value = set.name || ''
  showLoadSets.value   = false
}

async function deleteSet(id) {
  try {
    await deleteDoc(doc(TL_COL(), id))
    if (currentSetId.value === id) { currentSetId.value = null; currentSetName.value = '' }
    await loadSets()
  } catch (e) {
    console.error('[Timeline] deleteSet', e)
  }
}

// ─── Persistence ───────────────────────────────────────────────────────────
watch([segments, markers], () => {
  setLS(LS_SEGS,  segments.value)
  setLS(LS_MARKS, markers.value)
}, { deep: true })

watch(() => props.isOpen, (open) => { if (!open && isPlaying.value) stop() })

let _unsubLib = null
// ─── Transport MIDI Learn ─────────────────────────────────────────────────────

function _resolveParamFromCC(cc, chan, deviceName) {
  const preciseKey = deviceName ? `${deviceName}:CH${chan + 1}:CC${cc}` : `CH${chan + 1}:CC${cc}`
  const deviceCCKey = deviceName ? `${deviceName}:${cc}` : null
  const plainCCKey  = `${cc}`
  const mapping = mappingStore.midiMappings[preciseKey] ||
                  (deviceCCKey ? mappingStore.midiMappings[deviceCCKey] : null) ||
                  mappingStore.midiMappings[plainCCKey]
  return mapping ? (typeof mapping === 'object' ? mapping.paramName : mapping) : null
}

function _onTransportCC(cc, val, chan, inputId) {
  const deviceName = midiService.getInputs().find(i => i.id === inputId)?.name ?? null
  const paramName  = _resolveParamFromCC(cc, chan, deviceName)
  if (!paramName) return
  console.log(`[LiveTimeline] CC ${cc}=${val} from "${deviceName || 'Unknown'}" (CH ${chan + 1}) -> ${paramName}`)
  if (paramName === 'live_timeline_play_stop' && val > 63) { isPlaying.value ? pause() : play() }
  else if (paramName === 'live_timeline_stop' && val > 63) { stop() }
}

function _onTransportNote(type, note, velocity, chan, inputId) {
  if (type !== 'on' || velocity === 0) return
  const deviceName  = midiService.getInputs().find(i => i.id === inputId)?.name ?? null
  // Must match confirmLearn's key format exactly (useMappingStore.ts) — it
  // always saves the fragment as uppercase `NOTE${n}`. This previously read
  // `Note${note}` (mixed case), which is a different string key and could
  // never match a mapping actually saved by the standard MIDI Learn flow.
  const preciseKey  = deviceName ? `${deviceName}:CH${chan + 1}:NOTE${note}` : `CH${chan + 1}:NOTE${note}`
  const deviceKey   = deviceName ? `${deviceName}:NOTE${note}` : null
  const plainKey    = `NOTE${note}`
  const mapping     = mappingStore.midiMappings[preciseKey] ||
                      (deviceKey ? mappingStore.midiMappings[deviceKey] : null) ||
                      mappingStore.midiMappings[plainKey]
  const paramName   = mapping ? (typeof mapping === 'object' ? mapping.paramName : mapping) : null
  if (!paramName) return
  const isGlobalFallback = !mappingStore.midiMappings[preciseKey] && !(deviceKey && mappingStore.midiMappings[deviceKey])
  console.log(`[LiveTimeline] Note ${note} from "${deviceName || 'Unknown'}" (CH ${chan + 1}) -> ${paramName}${isGlobalFallback ? ' [device-agnostic mapping — matches this note on ANY device]' : ''}`)
  if (paramName === 'live_timeline_play_stop') { isPlaying.value ? pause() : play() }
  else if (paramName === 'live_timeline_stop') { stop() }
}

let _removeTransportCC   = null
let _removeTransportNote = null
let _addMkrUnsubDmRec    = null
let _addMkrUnsubTrimStart = null
let _addMkrUnsubSetLoop  = null
let _addMkrUnsubCrop     = null
let _addMkrUnsubSaveWav  = null

onMounted(() => {
  const q = query(collection(db, 'backing_tracks'), orderBy('createdAt', 'desc'))
  _unsubLib = onSnapshot(q, snap => {
    const ts = []
    snap.forEach(d => ts.push({ id: d.id, ...d.data() }))
    libraryTracks.value = ts
  })
  loadSets()
  _removeTransportCC   = midiService.addCCListener(_onTransportCC)
  _removeTransportNote = midiService.addNoteListener(_onTransportNote)
  _addMkrUnsubDmRec    = on('timeline-add-mkr-dm-rec-sync', () => { newMkr.value.position = timelinePos.value; newMkr.value.type = 'dm-rec-sync'; showAddMarker.value = true })
  _addMkrUnsubTrimStart = on('timeline-add-mkr-audio-trim-start', () => { newMkr.value.position = timelinePos.value; newMkr.value.type = 'audio-trim-start'; showAddMarker.value = true })
  _addMkrUnsubSetLoop  = on('timeline-add-mkr-audio-set-loop', () => { newMkr.value.position = timelinePos.value; newMkr.value.type = 'audio-set-loop'; showAddMarker.value = true })
  _addMkrUnsubCrop     = on('timeline-add-mkr-audio-crop', () => { newMkr.value.position = timelinePos.value; newMkr.value.type = 'audio-crop'; showAddMarker.value = true })
  _addMkrUnsubSaveWav  = on('timeline-add-mkr-audio-save-wav', () => { newMkr.value.position = timelinePos.value; newMkr.value.type = 'audio-save-wav'; showAddMarker.value = true })
})

onUnmounted(() => {
  if (_rafId) cancelAnimationFrame(_rafId)
  _unsubLib?.()
  _removeTransportCC?.()
  _removeTransportNote?.()
  _addMkrUnsubDmRec?.()
  _addMkrUnsubTrimStart?.()
  _addMkrUnsubSetLoop?.()
  _addMkrUnsubCrop?.()
  _addMkrUnsubSaveWav?.()
  document.removeEventListener('mousemove', _onPlayheadDrag)
  document.removeEventListener('mouseup',   _onPlayheadDragEnd)
})
</script>

<template>
  <div
    v-show="!isMinimized"
    class="bg-neutral-950 border border-neutral-900 rounded-2xl overflow-hidden flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)]"
    :style="panelStyle"
    @mousedown.capture="bringToFront"
  >
    <!-- Resize handles -->
    <div @mousedown.stop="e => onResizeStart(e, 'n')"  class="absolute top-0    left-3 right-3  h-1  cursor-n-resize  z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 's')"  class="absolute bottom-0 left-3 right-3  h-1  cursor-s-resize  z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'e')"  class="absolute top-3 bottom-3 right-0   w-1  cursor-e-resize  z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'w')"  class="absolute top-3 bottom-3 left-0    w-1  cursor-w-resize  z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'se')" class="absolute bottom-0 right-0  w-3 h-3 cursor-se-resize z-50" />
    <div @mousedown.stop="e => onResizeStart(e, 'sw')" class="absolute bottom-0 left-0   w-3 h-3 cursor-sw-resize z-50" />

    <!-- ── Header ──────────────────────────────────────────────────────────── -->
    <div
      class="px-4 py-4 border-b border-neutral-900 flex items-center gap-4 shrink-0 bg-black/40 backdrop-blur-md cursor-grab active:cursor-grabbing select-none bg-gradient-to-r from-violet-950/40 "
      @mousedown="onDragStart"
    >
      <!-- Title & Tabs -->
      <div class="flex items-center gap-6 pointer-events-auto">
        <div class="flex flex-col">
          <div class="flex items-center gap-2">
            <Clock class="w-4 h-4 text-synth-neon" />
            <h2 class="text-sm font-black uppercase tracking-[0.3em] text-synth-neon">Live Timeline</h2>
          </div>
          <span class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">Live Set Arranger</span>
        </div>
        <nav class="flex items-center gap-6">
          <button
            @click="tab = 'timeline'"
            :class="['relative py-1 text-[11px] font-black uppercase tracking-[0.2em] transition-all',
              tab === 'timeline' ? 'text-white' : 'text-neutral-600 hover:text-neutral-400']"
          >
            Timeline
            <div v-if="tab === 'timeline'" class="absolute -bottom-[9px] left-0 w-full h-[2px] bg-synth-neon shadow-[0_0_10px_rgba(0,255,136,0.8)]" />
          </button>
          <button
            @click="tab = 'arrange'"
            :class="['relative py-1 text-[11px] font-black uppercase tracking-[0.2em] transition-all',
              tab === 'arrange' ? 'text-white' : 'text-neutral-600 hover:text-neutral-400']"
          >
            Arrange
            <div v-if="tab === 'arrange'" class="absolute -bottom-[9px] left-0 w-full h-[2px] bg-synth-neon/50" />
          </button>
        </nav>
      </div>


      <div class="flex-1" />

      <!-- Save / Load controls (moved from the footer to free up its space
           for the Macro/Global Transport buttons relocated off the toolbar row) -->
      <div class="flex items-center gap-1 pointer-events-auto">
        <!-- Current set name chip -->
        <div
          class="flex items-center gap-1 px-2 py-1 rounded-md bg-neutral-900/60 border text-[9px] font-mono max-w-[120px] overflow-hidden"
          :class="currentSetId ? 'border-synth-neon/20 text-synth-neon' : 'border-neutral-800 text-neutral-600'"
          :title="currentSetName || 'No timeline saved'"
        >
          <span class="truncate">{{ currentSetName || 'Unsaved' }}</span>
        </div>
        <!-- Save (update) -->
        <button
          @click="saveUpdate"
          :disabled="!currentSetId"
          title="Save (update current)"
          class="p-1.5 rounded-md text-neutral-500 hover:text-synth-neon hover:bg-synth-neon/10 transition-colors active:scale-90 disabled:opacity-25 disabled:cursor-not-allowed"
        >
          <Save class="w-3.5 h-3.5" />
        </button>
        <!-- Save As -->
        <button
          @click="openSaveAs"
          title="Save as new timeline"
          class="p-1.5 rounded-md text-neutral-500 hover:text-synth-neon hover:bg-synth-neon/10 transition-colors active:scale-90"
        >
          <FilePlus class="w-3.5 h-3.5" />
        </button>
        <!-- Load -->
        <button
          @click="showLoadSets = true; loadSets()"
          title="Load saved timeline"
          class="p-1.5 rounded-md text-neutral-500 hover:text-synth-neon hover:bg-synth-neon/10 transition-colors active:scale-90"
        >
          <FolderOpen class="w-3.5 h-3.5" />
        </button>
      </div>

      <div class="flex items-center gap-1 pointer-events-auto ml-2">
        <MacOsButtons @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize" />
      </div>

    </div>

    <!-- ── Timeline Tab ────────────────────────────────────────────────────── -->
    <div v-if="tab === 'timeline'" class="flex-1 flex flex-col min-h-0">

      <!-- Toolbar row -->
      <div class="flex items-center gap-3 px-4 py-2 border-b border-neutral-900/50 shrink-0">
        <!-- Zoom -->
        <span class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">Zoom</span>
        <button @click="scale = Math.max(0.2, scale - (scale <= 2 ? 0.2 : 5))" class="p-1 text-neutral-500 hover:text-white transition-colors">
          <ZoomOut class="w-3.5 h-3.5" />
        </button>
        <input
          type="range" v-model.number="scale" min="0.2" max="200" step="0.2"
          class="w-64 h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer accent-[#00ff88]"
        />
        <button @click="scale = Math.min(200, scale + (scale < 2 ? 0.2 : 5))" class="p-1 text-neutral-500 hover:text-white transition-colors">
          <ZoomIn class="w-3.5 h-3.5" />
        </button>
        <span class="text-[9px] font-mono text-neutral-600">{{ scale < 1 ? `1px/${(1/scale).toFixed(0)}s` : `${scale.toFixed(2)}px/s` }}</span>

        <!-- Reset playhead -->
        <button @click="stop" title="Reset to start" class="p-1 text-neutral-600 hover:text-white transition-colors ml-1">
          <SkipBack class="w-3.5 h-3.5" />
        </button>

        <!-- Loop toggle -->
        <div
          @click="loopTimeline = !loopTimeline"
          :class="[
            'flex items-center gap-1 px-2 py-1 rounded-md border cursor-pointer transition-all select-none ml-1',
            loopTimeline
              ? 'border-synth-neon/60 bg-synth-neon/10 text-synth-neon'
              : 'border-neutral-700 bg-transparent text-neutral-600 hover:text-neutral-400'
          ]"
          title="Loop timeline"
        >
          <span class="text-[9px] font-bold uppercase tracking-widest">Loop</span>
        </div>

        <!-- Crossfade toggle + duration -->
        <div class="flex items-center gap-1.5 ml-2">
          <div
            @click="crossfadeOnChange = !crossfadeOnChange"
            :class="[
              'flex items-center gap-1 px-2 py-1 rounded-md border cursor-pointer transition-all select-none',
              crossfadeOnChange
                ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-400'
                : 'border-neutral-700 bg-transparent text-neutral-600 hover:text-neutral-400'
            ]"
            title="Crossfade between segments"
          >
            <span class="text-[9px] font-bold uppercase tracking-widest">Xfade</span>
          </div>
          <input
            v-model.number="crossfadeDurMs"
            type="number" min="0" step="100"
            :class="[
              'w-16 text-center text-[10px] font-mono rounded-md border px-1 py-0.5 outline-none transition-colors',
              crossfadeOnChange
                ? 'bg-cyan-950/40 border-cyan-700/60 text-cyan-300 focus:border-cyan-400'
                : 'bg-neutral-900 border-neutral-700 text-neutral-500 focus:border-neutral-500'
            ]"
            title="Crossfade duration (ms)"
          />
          <span class="text-[8px] font-mono text-neutral-600">ms</span>
        </div>

        <div class="flex-1" />

        <button
          @click="openFolderForTimeline"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-700 bg-neutral-900 hover:border-synth-neon/60 text-neutral-400 hover:text-synth-neon text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95"
        >
          <Plus class="w-3 h-3" /> Segment
        </button>
        <button
          @click="openAddMarker"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-700 bg-neutral-900 hover:border-violet-500/60 text-neutral-400 hover:text-violet-400 text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95"
        >
          <Flag class="w-3 h-3" /> Marker
        </button>
        <button
          @click="segments = []; setLS(LS_SEGS, segments)"
          title="Clear all segments"
          class="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-neutral-700 bg-neutral-900 hover:border-red-500/60 hover:bg-red-500/10 text-neutral-500 hover:text-red-400 text-[9px] font-bold uppercase tracking-widest transition-all active:scale-95"
        >
          <Trash2 class="w-3 h-3" /> Segs
        </button>
        <button
          @click="markers = []; setLS(LS_MARKS, markers)"
          title="Clear all markers"
          class="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-neutral-700 bg-neutral-900 hover:border-red-500/60 hover:bg-red-500/10 text-neutral-500 hover:text-red-400 text-[9px] font-bold uppercase tracking-widest transition-all active:scale-95 ml-1"
        >
          <Trash2 class="w-3 h-3" /> Mks
        </button>
      </div>

      <!-- Timeline canvas -->
      <div class="shrink-0 overflow-hidden relative bg-neutral-950 pl-8 min-h-[30vh]" style="height: 158px;">

        <!-- Empty state -->
        <div v-if="!segments.length" class="absolute inset-0 flex flex-col items-center justify-center text-neutral-700 gap-2 pointer-events-none">
          <ListMusic class="w-8 h-8 opacity-30" />
          <span class="text-xs font-mono uppercase tracking-widest">Add segments from your backing track playlist</span>
        </div>

        <!-- BPM badge — fixed to canvas viewport, not scrolled -->
        <div class="absolute top-1.5 left-2.5 z-20 pointer-events-none flex items-center gap-1.5">
          <span class="text-[8px] font-mono text-neutral-600 uppercase tracking-widest">BPM</span>
          <span class="text-[13px] font-black text-synth-neon font-mono leading-none">{{ midiStore.currentBpm || 120 }}</span>
        </div>

        <!-- Scrollable area — click on ruler to seek -->
        <div ref="timelineRef" class="absolute inset-0 overflow-x-auto overflow-y-hidden custom-scrollbar pl-10" @click="onRulerClick">
          <div class="relative h-full" :style="{ width: timelineWidth + 'px', minWidth: '100%' }">

            <!-- Time ruler (click-to-seek target) -->
            <div class="tl-ruler absolute top-0 left-0 right-0 h-7 bg-neutral-950/80 border-b border-neutral-800 cursor-pointer z-10">
              <div
                v-for="tick in rulerTicks"
                :key="tick.t"
                class="absolute top-0 flex flex-col items-start pointer-events-none"
                :style="{ left: tick.x + 'px' }"
              >
                <div class="w-px h-3 bg-neutral-700" />
                <span class="text-[8px] font-mono text-neutral-600 ml-0.5 leading-none mt-0.5">{{ tick.label }}</span>
              </div>
            </div>

            <!-- Marker label cards (type · name · value) -->
            <div class="absolute left-0 right-0" style="top: 28px; height: 62px;">
              <div
                v-for="m in markers"
                :key="m.id + '_card'"
                class="absolute top-0 flex flex-col items-center cursor-pointer"
                :style="{ left: (m.position * scale) + 'px', transform: 'translateX(-50%)' }"
                @click.stop="clickMarker(m.id)"
              >
                <!-- type badge + icon -->
                <div
                  class="flex items-center gap-0.5 px-1 py-0.5 rounded-sm text-[7px] font-black uppercase tracking-wider leading-none transition-all"
                  :style="{
                    background: selectedMarkerId === m.id ? mColor(m.type) + '44' : mColor(m.type) + '22',
                    color:      mColor(m.type),
                    border:     '1px solid ' + (selectedMarkerId === m.id ? mColor(m.type) + 'cc' : mColor(m.type) + '66')
                  }"
                >
                  <span>{{ mIcon(m.type) }}</span>
                  <span class="ml-0.5">{{ mAbbrev(m.type) }}</span>
                </div>
                <!-- name (if set) -->
                <span
                  v-if="m.label"
                  class="mt-0.5 text-[7px] font-mono text-neutral-400 leading-none truncate"
                  style="max-width: 64px"
                >{{ m.label }}</span>
                <!-- value -->
                <span
                  v-if="mDisplayValue(m)"
                  class="mt-0.5 text-[7px] font-bold leading-none truncate"
                  style="max-width: 72px"
                  :style="{ color: mColor(m.type) }"
                >{{ mDisplayValue(m) }}</span>
                <!-- connector to segment lane -->
                <div class="w-px mt-0.5 flex-1" :style="{ background: mColor(m.type) + '44', minHeight: '6px' }" />
              </div>
            </div>

            <!-- Segment lane -->
            <div class="absolute left-0 right-0" style="top: 90px; height: 60px;">
              <!-- Subtle grid lines -->
              <div
                v-for="tick in rulerTicks"
                :key="'g' + tick.t"
                class="absolute top-0 bottom-0 w-px bg-neutral-800/40 pointer-events-none"
                :style="{ left: tick.x + 'px' }"
              />

              <!-- Segment blocks -->
              <div
                v-for="(seg, idx) in segments"
                :key="seg.id"
                class="absolute top-1 bottom-1 rounded border-l-[3px] min-h-[20vh] flex flex-col items-start justify-start overflow-hidden cursor-pointer select-none"
                :class="[
                  activeSegIdx === idx ? 'ring-1 ring-white/30' : '',
                  selectedSegIdx === idx ? 'ring-2 ring-white/60 brightness-125' : ''
                ]"
                :style="{
                  background:  segColor(idx).bg,
                  borderColor: segColor(idx).border,
                  color:       segColor(idx).text,
                  left:  (segBounds[idx].start * scale) + 'px',
                  width: Math.max(3, segBounds[idx].dur * scale) + 'px',
                }"
                @click.stop="clickSeg(idx)"
              >
                <div class="text-[11px] font-bold uppercase tracking-tight px-1.5 py-1 mt-1 truncate w-full leading-tight">{{ seg.label }}</div>
                <div
                  v-if="getTrackBpm(seg.trackIdx)"
                  class="text-[10px] font-black font-mono px-1.5 leading-none"
                  :style="{ color: segColor(idx).border }"
                >{{ getTrackBpm(seg.trackIdx) }} BPM</div>
                <div class="text-[9px] font-mono px-1.5 py-1 leading-none opacity-50">
                  {{ formatTime(seg.segStart) }}–{{ formatTime(seg.segEnd) }}
                  <span v-if="playlist[seg.trackIdx]?.duration" class="ml-1 opacity-60">[{{ formatTime(playlist[seg.trackIdx].duration) }}]</span>
                </div>
                <div v-if="seg.notes" class="text-[9px] italic px-1.5 pb-1 leading-tight opacity-60 truncate w-full">{{ seg.notes }}</div>
              </div>

              <!-- Marker vertical lines -->
              <div
                v-for="m in markers"
                :key="m.id + '_line'"
                class="absolute top-0 bottom-0 w-px cursor-pointer"
                :style="{
                  left: (m.position * scale) + 'px',
                  background: selectedMarkerId === m.id ? mColor(m.type) : mColor(m.type) + 'bb'
                }"
                @click.stop="clickMarker(m.id)"
              />
            </div>

            <!-- Playhead -->
            <div
              class="absolute top-0 bottom-0 w-0.5 z-20"
              :class="isDraggingPlayhead ? 'cursor-grabbing' : 'cursor-ew-resize'"
              :style="{
                left:       (timelinePos * scale) + 'px',
                background: 'rgba(255,255,255,0.85)',
                boxShadow:  '0 0 8px rgba(255,255,255,0.5)',
              }"
              @mousedown.stop="onPlayheadMouseDown"
            >
              <div
                class="w-3.5 h-3.5 bg-white rounded-full -translate-x-[6px] mt-0.5 shadow-[0_0_6px_rgba(255,255,255,0.7)]"
                :class="isDraggingPlayhead ? 'scale-110' : 'hover:scale-125'"
                style="transition: transform 0.1s"
              />
            </div>

          </div>
        </div>
      </div>

      <!-- Info panel — shows selected segment or marker details -->
      <div class="flex flex-1 min-h-0 overflow-hidden border-t text-[12px] border-neutral-900/60 bg-neutral-950/60">

        <!-- Left column: segment / marker details -->
        <div class="flex-1 min-w-0 px-4 py-2">
        <!-- Nothing selected -->
        <div v-if="!selectedSeg && !selectedMarker" class="h-full flex items-center justify-center">
          <span class="text-[9px] font-mono text-neutral-700 uppercase tracking-widest">Click a segment or marker for details</span>
        </div>

        <!-- Selected segment info -->
        <div v-else-if="selectedSeg" class="flex items-start gap-6 h-full">
          <!-- Color bar -->
          <div class="w-1 self-stretch rounded-full shrink-0" :style="{ background: segColor(selectedSegIdx).border }" />
          <!-- Info rows -->
          <div class="flex flex-col justify-center gap-0.5 min-w-0">
            <div class="text-[14px] font-black uppercase tracking-wide text-white truncate">
              {{ selectedSeg.label }}
              <span v-if="playlist[selectedSeg.trackIdx]?.duration" class="ml-1 font-mono text-xs opacity-60">[{{ formatTime(playlist[selectedSeg.trackIdx].duration) }}]</span>
            </div>
            <div class="text-[12px] font-mono text-neutral-500">
              Track {{ selectedSeg.trackIdx + 1 }}
              <span
                v-if="getTrackBpm(selectedSeg.trackIdx)"
                class="ml-2 font-bold"
                :style="{ color: segColor(selectedSegIdx).border }"
              >{{ getTrackBpm(selectedSeg.trackIdx) }} BPM</span>
            </div>
            <div class="flex items-center gap-1 text-[16px] font-mono text-neutral-500">
              <input
                :value="formatTime(selectedSeg.segStart)"
                @change="updateSegStart($event.target.value)"
                @keyup.enter="$event.target.blur()"
                class="w-14 bg-transparent border-b border-neutral-700 text-neutral-300 outline-none text-center hover:border-neutral-500 focus:border-synth-neon transition-colors cursor-text"
                title="Segment in-point (bars:beats)"
              />
              <span class="text-neutral-700">→</span>
              <input
                :value="formatTime(selectedSeg.segEnd)"
                @change="updateSegEnd($event.target.value)"
                @keyup.enter="$event.target.blur()"
                class="w-14 bg-transparent border-b border-neutral-700 text-neutral-300 outline-none text-center hover:border-neutral-500 focus:border-synth-neon transition-colors cursor-text"
                title="Segment out-point (bars:beats)"
              />
              <span class="ml-1 text-neutral-700">({{ formatTime(selectedSeg.segEnd - selectedSeg.segStart) }})</span>
              <span class="ml-2 text-neutral-600">@ {{ formatTime(segBounds[selectedSegIdx]?.start) }}</span>
            </div>
            <input
              :value="selectedSeg.notes || ''"
              @change="selectedSeg.notes = $event.target.value; setLS(LS_SEGS, segments)"
              @keyup.enter="$event.target.blur()"
              placeholder="Notes…"
              class="text-[11px] text-neutral-400 bg-transparent border-b border-transparent hover:border-neutral-700 focus:border-synth-neon/50 outline-none w-full placeholder-neutral-700 transition-colors italic"
            />
          </div>
          <button @click="selectedSegIdx = -1" class="ml-auto shrink-0 text-neutral-700 hover:text-neutral-400 transition-colors p-1">
            <X class="w-3 h-3" />
          </button>
        </div>

        <!-- Selected marker info -->
        <div v-else-if="selectedMarker" class="flex items-start gap-6 h-full">
          <!-- Icon badge -->
          <div
            class="w-7 h-7 rounded flex items-center justify-center shrink-0 text-[10px] font-black self-center"
            :style="{
              background: mColor(selectedMarker.type) + '22',
              color:      mColor(selectedMarker.type),
              border:     '1px solid ' + mColor(selectedMarker.type) + '66'
            }"
          >{{ mIcon(selectedMarker.type) }}</div>
          <!-- Info rows -->
          <div class="flex flex-col justify-center gap-0.5 min-w-0">
            <div class="text-[14px] font-black uppercase tracking-wide" :style="{ color: mColor(selectedMarker.type) }">
              {{ mTypeLabel(selectedMarker.type) }}
            </div>
            <div v-if="selectedMarker.label" class="text-[12px] font-mono text-neutral-400">{{ selectedMarker.label }}</div>
            <div class="flex items-center gap-2 text-[14px] font-mono text-neutral-500">
              <span class="text-neutral-600">@</span>
              <input
                :value="formatTime(selectedMarker.position)"
                @change="updateMarkerPos($event.target.value)"
                @keyup.enter="$event.target.blur()"
                class="w-14 bg-transparent border-b border-neutral-700 text-neutral-300 outline-none text-center hover:border-neutral-500 transition-colors cursor-text"
                :style="{ borderColor: 'inherit' }"
                @focus="$event.target.style.borderColor = mColor(selectedMarker.type)"
                @blur="$event.target.style.borderColor = ''"
                title="Marker position (bars:beats)"
              />
              <span v-if="mDisplayValue(selectedMarker)" :style="{ color: mColor(selectedMarker.type) }">{{ mDisplayValue(selectedMarker) }}</span>
              <template v-if="selectedMarker.type === 'program-change'">
                <span v-if="selectedMarker.device" class="text-neutral-600">→ {{ selectedMarker.device }} CH{{ Number(selectedMarker.channel ?? 0) + 1 }}</span>
              </template>
            </div>
          </div>
          <div class="ml-auto flex items-center gap-1 shrink-0">
            <button
              @click="removeMarker(selectedMarkerId); selectedMarkerId = null"
              class="text-neutral-700 hover:text-red-400 transition-colors p-1"
              title="Delete marker"
            >
              <Trash2 class="w-3 h-3" />
            </button>
            <button @click="selectedMarkerId = null" class="text-neutral-700 hover:text-neutral-400 transition-colors p-1">
              <X class="w-3 h-3" />
            </button>
          </div>
        </div>
        </div><!-- /left column -->

        <!-- Right column: current program/patch per device -->
        <div class="w-52 shrink-0 border-l border-neutral-900/80 overflow-y-auto py-1.5 px-2 flex flex-col gap-0.5">
          <div class="px-1 pb-1 shrink-0">
            <span class="text-[8px] font-mono text-neutral-700 uppercase tracking-widest">Patches</span>
          </div>
          <div v-if="allDevicesPcState.length === 0" class="flex-1 flex items-center justify-center">
            <span class="text-[8px] font-mono text-neutral-800 italic">No PC devices</span>
          </div>
          <template v-for="dev in allDevicesPcState" :key="dev.key">
            <!-- UI device: show Sound Library preset name -->
            <div v-if="dev.isUi" class="flex flex-col items-start border-b border-neutral-700/60 justify-start cursor-pointer gap-2 px-1.5 py-0.5 hover:bg-white/[0.02]">
              <div class="text-[11px] font-bold text-neutral-500 truncate" style="max-width:5rem">{{ dev.name }}</div>
              <div class="text-[11px] font-mono text-sky-400/80 truncate flex-1 text-right">{{ dev.soundName ?? '—' }}</div>
            </div>
            <!-- PC device: no state yet -->
            <div v-else-if="!dev.entries || dev.entries.length === 0" class="flex flex-col items-start border-b border-neutral-700/60 justify-start cursor-pointer gap-2 px-1.5 py-0.5">
              <div class="text-[11px] font-bold text-neutral-600 truncate flex-1">{{ dev.name }}</div>
              <div class="text-[11px] font-mono text-neutral-800 shrink-0">—</div>
            </div>
            <!-- PC device: single entry (mono or multi showing current channel) -->
            <div v-else class="flex flex-col items-start border-b border-neutral-700/60 justify-start cursor-pointer gap-2 px-1.5 py-0.5 hover:bg-white/[0.02] cursor-pointer">
              <div class="text-[11px] font-bold text-neutral-500 truncate">{{ dev.name }}</div>
              <div class="text-[11px] font-mono text-violet-400/80 truncate flex-1 text-right">{{ dev.entries[0].soundName || ('PC' + dev.entries[0].program) }}</div>
            </div>
          </template>
        </div><!-- /right column -->

      </div>

      <!-- Progress bar -->
      <div class="h-1 bg-neutral-900 shrink-0 relative">
        <div
          class="absolute inset-y-0 left-10 bg-synth-neon/70 transition-none"
          :style="{ width: progressPct + '%' }"
        />
      </div>
    </div>

    <!--- footer -->
    <div class="flex p-4 relative" v-if="tab === 'timeline'">
      <div
        v-if="syncTimelineToAudioCapture && isPlaying"
        class="absolute inset-0 pointer-events-none"
        style="background: radial-gradient(circle,rgba(251, 85, 63, 0.68) 0%, rgba(252, 70, 107, 0.49) 100%); animation: rec-pulse 2s ease-in-out infinite;"
      />
      
      
      <!-- Transport + Info + Close (pointer-events separated from drag area) -->
      <div class="flex items-center gap-4 pointer-events-auto w-1/4" @mousedown.stop>
        <!-- BPM -->
        <div class="flex flex-col items-center">
          <span class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">BPM</span>
          <span class="text-xs font-black text-synth-neon font-mono">{{ midiStore.currentBpm || 120 }}</span>
        </div>

        <!-- Active segment label -->
        <div v-if="activeSegIdx >= 0" class="flex flex-col items-start max-w-[120px]">
          <span class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">Playing</span>
          <span class="text-[10px] font-bold text-white truncate">{{ segments[activeSegIdx]?.label }}</span>
        </div>
      </div>

      <!-- Transport controls -->
      <div class="flex items-center gap-4 pointer-events-auto w-1/2" @mousedown.stop>
        <div class="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded-xl px-2 py-1">
          <button
            @click="stop"
            @contextmenu.prevent="openMenu($event, { name: 'live_timeline_stop', label: 'Timeline Stop' })"
            title="Stop · Right-click to MIDI Learn"
            :class="['p-1.5 transition-colors active:scale-90 hover:text-white', mappingStore.mappedParams?.has('live_timeline_stop') ? 'text-amber-400' : 'text-neutral-400']"
          >
            <Square class="w-4 h-4" />
          </button>
          <button
            @click="isPlaying ? pause() : play()"
            @contextmenu.prevent="openMenu($event, { name: 'live_timeline_play_stop', label: 'Timeline Play/Stop' })"
            :class="['p-1.5 transition-colors active:scale-90', isPlaying ? 'text-synth-neon' : mappingStore.mappedParams?.has('live_timeline_play_stop') ? 'text-amber-400' : 'text-neutral-400 hover:text-white']"
            :title="(isPlaying ? 'Pause' : (isPaused ? 'Resume' : 'Play')) + ' · Right-click to MIDI Learn'"
          >
            <Pause v-if="isPlaying" class="w-5 h-5" />
            <Play  v-else class="w-5 h-5" />
          </button>
        </div>

        <!-- Position -->
        <div class="flex flex-col items-end">
          <span class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">Position</span>
          <div class="flex items-center gap-1">
            <input
              v-if="editingPos"
              :value="formatTime(timelinePos)"
              @keyup.enter="commitSeek($event.target.value)"
              @blur="commitSeek($event.target.value)"
              class="w-16 bg-transparent border-b border-synth-neon text-xs font-black text-synth-neon font-mono outline-none text-center"
              autofocus
              title="Seek to position (bars:beats)"
            />
            <span
              v-else
              class="text-xs font-black text-neutral-200 font-mono cursor-pointer hover:text-synth-neon transition-colors"
              title="Click to seek"
              @click="editingPos = true"
            >{{ formatTime(timelinePos) }}</span>
            <span class="text-[12px] font-mono text-neutral-600">/ {{ formatTime(totalDuration) }}</span>
          </div>
        </div>

        <!-- Timeline BPM -->
        <div class="flex items-center gap-1 text-[10px] font-mono" title="Base BPM for timeline timing">
          <span class="text-neutral-600">♩</span>
          <input
            v-model.number="timelineBpm"
            type="number" min="20" max="300"
            class="w-12 bg-neutral-900 border border-neutral-800 rounded px-1 py-0.5 text-xs text-purple-300 font-mono text-center outline-none focus:border-purple-500"
          />
        </div>

        <!-- <button @click="emit('close')" class="text-neutral-600 hover:text-white transition-colors ml-2">
          <X class="w-5 h-5" />
        </button> -->
      </div>

      <div class="flex flex items-center gap-0.5 relative z-10">
        <div class="flex items-center gap-1.5 mb-0.5">
        <!-- Audio capture sync toggle -->
        <div
          class="flex items-center gap-1.5 mb-0.5 cursor-pointer select-none"
          @click="syncTimelineToAudioCapture = !syncTimelineToAudioCapture"
        >
          <span
            :class="[
              'w-1.5 h-1.5 rounded-full transition-all duration-300',
              syncTimelineToAudioCapture && isPlaying ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)] animate-pulse'
              : syncTimelineToAudioCapture ? 'bg-red-500/60'
              : 'bg-neutral-700'
            ]"
          />
          <span :class="[
            'text-[11px] font-mono uppercase tracking-widest transition-colors duration-300',
            syncTimelineToAudioCapture && isPlaying ? 'text-red-400'
            : syncTimelineToAudioCapture ? 'text-red-500/60 hover:text-red-400'
            : 'text-neutral-600 hover:text-neutral-500'
          ]">REC SYNC</span>
        </div>
        <!--- Open Audio Capture-->
        <div v-if="syncTimelineToAudioCapture && !isPlaying" @click="uiStore.isAudioCaptureOpen = true" class="cursor-pointer text-synth-cyan text-mono text-xs uppercase text-[9px]">
          <AudioLines title="Audio Capture" class="w-5 h-5" />
        </div>
        <!-- <span class="text-[8px] font-mono text-neutral-600 uppercase tracking-widest" :class="syncRecordAudioCapture?'text-red-500':''">{{ syncRecordAudioCapture ? 'ON' : 'OFF' }}  </span> -->
        </div>
      </div>

      <!-- Quick Macro + Global Transport buttons (moved from the toolbar row,
           which overflowed with these included — compact icon-only here to
           fit the footer's quarter-width slot) -->
      <div class="flex items-center gap-0.5 pointer-events-auto justify-end w-1/4" @mousedown.stop>
        <button
          @click="newMkr.position = timelinePos; newMkr.type = 'dm-rec-sync'; showAddMarker = true"
          title="Insert DM Rec Sync → records 4 bars at playhead"
          class="p-1.5 rounded-md hover:bg-white/10 transition-colors active:scale-90"
          :style="{ color: '#ff6b35' }"
        >⏺</button>
        <button
          @click="newMkr.position = timelinePos; newMkr.type = 'audio-trim-start'; showAddMarker = true"
          title="Insert Audio Trim Start at playhead"
          class="p-1.5 rounded-md hover:bg-white/10 transition-colors active:scale-90"
          :style="{ color: '#38bdf8' }"
        >✂</button>
        <button
          @click="newMkr.position = timelinePos; newMkr.type = 'audio-set-loop'; showAddMarker = true"
          title="Insert Audio Set Loop (2 bars) at playhead"
          class="p-1.5 rounded-md hover:bg-white/10 transition-colors active:scale-90"
          :style="{ color: '#34d399' }"
        >↺</button>
        <button
          @click="newMkr.position = timelinePos; newMkr.type = 'audio-crop'; showAddMarker = true"
          title="Insert Audio Crop at playhead"
          class="p-1.5 rounded-md hover:bg-white/10 transition-colors active:scale-90"
          :style="{ color: '#f472b6' }"
        >⊞</button>
        <button
          @click="newMkr.position = timelinePos; newMkr.type = 'audio-save-wav'; showAddMarker = true"
          title="Insert Audio Save WAV at playhead"
          class="p-1.5 rounded-md hover:bg-white/10 transition-colors active:scale-90"
          :style="{ color: '#fbbf24' }"
        >⬇</button>
        <div class="w-px h-4 bg-neutral-800 mx-0.5" />
        <button
          @click="newMkr.position = timelinePos; newMkr.type = 'gt-start'; showAddMarker = true"
          title="Insert Global Transport Start at playhead"
          class="p-1.5 rounded-md hover:bg-white/10 transition-colors active:scale-90"
          :style="{ color: '#00ff88' }"
        >⏯</button>
        <button
          @click="newMkr.position = timelinePos; newMkr.type = 'gt-stop'; showAddMarker = true"
          title="Insert Global Transport Stop at playhead"
          class="p-1.5 rounded-md hover:bg-white/10 transition-colors active:scale-90"
          :style="{ color: '#ff0044' }"
        >⏹</button>
      </div>
    </div> 

    <!-- ── Arrange Tab ─────────────────────────────────────────────────────── -->
    <div v-if="tab === 'arrange'" class="flex-1 flex min-h-0 gap-0 overflow-hidden">

      <!-- Segments column -->
      <div class="flex-1 flex flex-col min-h-0 min-w-0 p-4">
        <div class="flex items-center justify-between mb-3 shrink-0">
          <h3 class="text-[10px] font-black text-neutral-500 uppercase tracking-[0.25em] font-mono">Segments</h3>
          <button
            @click="openFolderForTimeline"
            class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-700 bg-neutral-900 hover:border-synth-neon/60 text-neutral-400 hover:text-synth-neon text-[9px] font-bold uppercase tracking-widest transition-all active:scale-95"
          >
            <Plus class="w-3 h-3" /> Add
          </button>
        </div>

        <div v-if="!segments.length" class="text-[10px] font-mono text-neutral-700 uppercase tracking-widest py-6 text-center">
          No segments yet
        </div>
        <div v-if="!playlist.length && !segments.length" class="text-[9px] font-mono text-neutral-700 text-center">
          Add tracks to your playlist first
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar space-y-2">
          <div
            v-for="(seg, idx) in segments"
            :key="seg.id"
            class="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-xl p-2.5 group"
            :class="{ 'border-white/20 bg-neutral-800': activeSegIdx === idx }"
          >
            <div
              class="w-1 h-8 rounded-full shrink-0"
              :style="{ background: SEG_COLORS[seg.trackIdx % SEG_COLORS.length].border }"
            />
            <div class="flex-1 min-w-0">
              <div class="text-[11px] font-bold text-white truncate">{{ seg.label }}</div>
              <div class="text-[9px] font-mono text-neutral-500">
                Track {{ seg.trackIdx + 1 }}
                <span
                  v-if="getTrackBpm(seg.trackIdx)"
                  class="ml-2 font-bold"
                  :style="{ color: SEG_COLORS[seg.trackIdx % SEG_COLORS.length].border }"
                >{{ getTrackBpm(seg.trackIdx) }} BPM</span>
                <span class="ml-2 opacity-70">{{ formatTime(seg.segStart) }} → {{ formatTime(seg.segEnd) }}</span>
                <span class="ml-2 text-neutral-700">({{ formatTime(seg.segEnd - seg.segStart) }})</span>
              </div>
              <input
                :value="seg.notes || ''"
                @change="seg.notes = $event.target.value; setLS(LS_SEGS, segments)"
                @keyup.enter="$event.target.blur()"
                placeholder="Notes…"
                class="mt-0.5 text-[9px] italic text-neutral-500 bg-transparent border-b border-transparent hover:border-neutral-700 focus:border-synth-neon/50 outline-none w-full placeholder-neutral-700 transition-colors"
              />
            </div>
            <span class="text-[9px] font-mono text-neutral-600 shrink-0">@ {{ formatTime(segBounds[idx].start) }}</span>
            <div class="flex items-center gap-0.5 shrink-0">
              <button @click="moveSeg(idx, -1)" :disabled="idx === 0" class="p-1 text-neutral-600 hover:text-white disabled:opacity-25 transition-colors">
                <ChevronUp class="w-3.5 h-3.5" />
              </button>
              <button @click="moveSeg(idx, 1)" :disabled="idx === segments.length - 1" class="p-1 text-neutral-600 hover:text-white disabled:opacity-25 transition-colors">
                <ChevronDown class="w-3.5 h-3.5" />
              </button>
              <button @click="removeSeg(seg.id)" class="p-1 text-neutral-600 hover:text-rose-500 transition-colors ml-1">
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Divider -->
      <div class="w-px bg-neutral-900 self-stretch shrink-0" />

      <!-- Markers column -->
      <div class="flex-1 flex flex-col min-h-0 min-w-0 p-4">
        <div class="flex items-center justify-between mb-3 shrink-0">
          <h3 class="text-[10px] font-black text-neutral-500 uppercase tracking-[0.25em] font-mono">Markers</h3>
          <button
            @click="openAddMarker"
            class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-700 bg-neutral-900 hover:border-violet-500/60 text-neutral-400 hover:text-violet-400 text-[9px] font-bold uppercase tracking-widest transition-all active:scale-95"
          >
            <Plus class="w-3 h-3" /> Add
          </button>
        </div>

        <div v-if="!markers.length" class="text-[10px] font-mono text-neutral-700 uppercase tracking-widest py-6 text-center">
          No markers yet
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar space-y-2">
          <div
            v-for="m in markers"
            :key="m.id"
            class="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-xl p-2.5"
          >
            <div
              class="w-6 h-6 rounded flex items-center justify-center shrink-0 text-[9px] font-bold"
              :style="{
                background: mColor(m.type) + '22',
                color:      mColor(m.type),
                border:     '1px solid ' + mColor(m.type) + '55'
              }"
            >{{ mIcon(m.type) }}</div>
            <div class="flex-1 min-w-0">
              <div class="text-[10px] font-mono text-neutral-400 uppercase tracking-wider leading-tight">{{ mTypeLabel(m.type) }}</div>
              <div v-if="m.label" class="text-[9px] text-neutral-600 truncate">{{ m.label }}</div>
              <!-- Tempo -->
              <div v-if="m.type === 'tempo' && m.value !== undefined" class="text-[9px] font-mono text-neutral-500">{{ m.value }} BPM</div>
              <!-- Perf-set pad -->
              <div v-if="m.type === 'perf-set' && m.value !== undefined" class="text-[9px] font-mono text-neutral-500">Pad {{ Number(m.value) + 1 }} (index {{ m.value }})</div>
              <!-- Load Performance Set -->
              <div v-if="m.type === 'load-perf-set'" class="text-[9px] font-mono text-neutral-500">
                <span class="text-purple-300 font-bold">{{ m.setName || m.setId || '—' }}</span>
              </div>
              <!-- CrossFade -->
              <div v-if="m.type === 'crossfade'" class="text-[9px] font-mono text-neutral-500">
                {{ m.value }} ms <span class="text-neutral-600 ml-1">({{ (m.value / 1000).toFixed(2) }}s)</span>
              </div>
              <!-- Program Change with device + channel -->
              <div v-if="m.type === 'program-change'" class="text-[9px] font-mono text-neutral-500">
                <span v-if="m.soundName" class="text-neutral-300 font-bold">{{ m.soundName }}</span>
                <span :class="m.soundName ? 'ml-1 text-neutral-600' : ''">PC {{ m.value }}</span>
                <span v-if="m.device" class="ml-1 text-neutral-600">→ {{ m.device }} CH{{ Number(m.channel ?? 0) + 1 }}</span>
              </div>
              <!-- Loop Machine start -->
              <div v-if="m.type === 'lm-start'" class="text-[9px] font-mono text-neutral-500">Pad {{ (m.padIdx ?? 0) + 1 }}</div>
              <!-- Drum Machine start -->
              <div v-if="m.type === 'dm-start'" class="text-[9px] font-mono text-neutral-500">
                <span v-if="m.presetName" class="text-neutral-300 font-bold">{{ m.presetName }}</span>
                <span v-if="m.seqKey" class="ml-1">Seq {{ m.seqKey }}</span>
                <span v-if="!m.presetName && !m.seqKey" class="text-neutral-700 italic">current state</span>
              </div>
              <!-- DM Rec Sync (macro) -->
              <div v-if="m.type === 'dm-rec-sync'" class="text-[9px] font-mono text-neutral-500">
                Record {{ m.measures ?? 4 }} bars
              </div>
              <!-- Audio Trim Start (macro) -->
              <div v-if="m.type === 'audio-trim-start'" class="text-[9px] font-mono text-neutral-500">
                Trim leading silence
              </div>
              <!-- Audio Set Loop (macro) -->
              <div v-if="m.type === 'audio-set-loop'" class="text-[9px] font-mono text-neutral-500">
                Set loop {{ m.measures ?? 2 }} bars
              </div>
              <!-- Audio Crop (macro) -->
              <div v-if="m.type === 'audio-crop'" class="text-[9px] font-mono text-neutral-500">
                Crop to loop region
              </div>
              <!-- Audio Save WAV (macro) -->
              <div v-if="m.type === 'audio-save-wav'" class="text-[9px] font-mono text-neutral-500">
                <span class="text-amber-400">⬇</span> {{ m.filename || 'drum_machine.wav' }}
              </div>
<!-- Chord Prog start -->
              <div v-if="m.type === 'cp-start'" class="text-[9px] font-mono text-purple-400">
                <span v-if="m.seqKey" class="text-purple-300 font-bold">Slot {{ m.seqKey }}</span>
                <span v-if="m.chainEnabled != null" class="ml-1">{{ m.chainEnabled ? 'Chain:ON' : 'Chain:OFF' }}</span>
                <span v-if="!m.seqKey && m.chainEnabled == null" class="text-neutral-700 italic">current slot</span>
              </div>
              <!-- Chord Prog Select Pattern -->
              <div v-if="m.type === 'cp-select-pattern'" class="text-[9px] font-mono text-purple-400">
                Slot {{ String.fromCharCode(65 + (m.value ?? 0)) }}
              </div>
              <!-- Stop Timeline -->
              <div v-if="m.type === 'tl-stop'" class="text-[9px] font-mono text-neutral-500">
                Stop timeline playback
              </div>
              <!-- Global Transport markers -->
              <div v-if="m.type === 'gt-start'" class="text-[9px] font-mono text-emerald-400">
                Global Transport Start — Play All
              </div>
              <div v-if="m.type === 'gt-stop'" class="text-[9px] font-mono text-rose-400">
                Global Transport Stop — Stop All
              </div>
            </div>
            <span class="text-[9px] font-mono text-neutral-600 shrink-0">{{ formatTime(m.position) }}</span>
            <button @click="removeMarker(m.id)" class="p-1 text-neutral-600 hover:text-rose-500 transition-colors shrink-0">
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>



    <!-- ── Add Marker Dialog ───────────────────────────────────────────────── -->
    <Teleport to="body">
      <div
        v-if="showAddMarker"
        class="fixed inset-0 z-[600] bg-black/75 flex items-center justify-center"
        @click.self="showAddMarker = false"
      >
        <div class="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
          <h3 class="text-sm font-black uppercase tracking-[0.25em] text-white mb-5">Add Marker</h3>

          <div class="space-y-4">
            <div>
              <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">Position (bars:beats)</label>
              <input
                v-model="newMkrPos"
                type="text" placeholder="e.g. 5:2"
                class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-synth-neon outline-none font-mono"
              />
            </div>

            <div>
              <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">Event Type</label>
              <select
                v-model="newMkr.type"
                class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-synth-neon outline-none"
              >
                <option v-for="t in MARKER_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </div>

            <!-- Tempo -->
            <div v-if="newMkr.type === 'tempo'">
              <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">BPM</label>
              <input
                v-model.number="newMkr.value"
                type="number" min="20" max="300"
                placeholder="e.g. 120"
                class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-synth-neon outline-none"
              />
            </div>

            <!-- Perf Set Pad (16 pads, index 0–15) -->
            <div v-if="newMkr.type === 'perf-set'">
              <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">
                Pad <span class="text-neutral-600">(16 pads available)</span>
              </label>
              <select
                v-model.number="newMkr.value"
                class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-synth-neon outline-none"
              >
                <option v-for="i in 16" :key="i - 1" :value="i - 1">Pad {{ i }} (index {{ i - 1 }})</option>
              </select>
            </div>

            <!-- Load Performance Set (by saved set ID) -->
            <div v-if="newMkr.type === 'load-perf-set'">
              <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">Performance Set</label>
              <div v-if="!availPerfSets.length" class="text-[9px] font-mono text-neutral-600 italic py-2">
                No saved performance sets found — save one in the Device Program Change panel.
              </div>
              <select
                v-else
                v-model="newMkrPerfSet.setId"
                @change="newMkrPerfSet.setName = availPerfSets.find(s => s.id === newMkrPerfSet.setId)?.name || ''"
                class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
              >
                <option v-for="s in availPerfSets" :key="s.id" :value="s.id">
                  {{ s.name }} ({{ s.devices?.length ?? 0 }} device{{ s.devices?.length !== 1 ? 's' : '' }})
                </option>
              </select>
            </div>

            <!-- CrossFade duration (ms) -->
            <div v-if="newMkr.type === 'crossfade'">
              <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">
                Duration <span class="text-neutral-600">(milliseconds)</span>
              </label>
              <input
                v-model.number="newMkr.value"
                type="number" min="0" step="100"
                placeholder="e.g. 2000"
                class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 outline-none"
              />
              <div class="mt-1 text-[9px] font-mono text-neutral-600">
                = {{ (newMkr.value / 1000).toFixed(2) }}s — updates the backing track crossfade duration
              </div>
            </div>

            <!-- Loop Machine Pad -->
            <div v-if="newMkr.type === 'lm-start'">
              <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">Pad</label>
              <select
                v-model.number="newMkrLm.padIdx"
                class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
              >
                <option v-for="i in 24" :key="i - 1" :value="i - 1">Pad {{ i }}</option>
              </select>
            </div>

            <!-- Drum Machine start -->
            <template v-if="newMkr.type === 'dm-start'">
              <div>
                <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">
                  Preset <span class="text-neutral-600">(optional)</span>
                </label>
                <select
                  v-model="newMkrDm.presetName"
                  class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-pink-500 outline-none"
                >
                  <option value="">— Keep current preset —</option>
                  <option v-for="p in drumStore.presets" :key="p.id" :value="p.name">{{ p.name }}</option>
                </select>
              </div>
              <div>
                <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">
                  Sequence <span class="text-neutral-600">(optional)</span>
                </label>
                <select
                  v-model="newMkrDm.seqKey"
                  class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-pink-500 outline-none"
                >
                  <option value="">— Keep current sequence —</option>
                  <option v-for="k in ['A','B','C','D','E','F','G','H']" :key="k" :value="k">Sequence {{ k }}</option>
                </select>
              </div>
              <div>
                <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">
                  Chain <span class="text-neutral-600">(optional)</span>
                </label>
                <select
                  v-model="newMkrDm.chainEnabled"
                  class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-pink-500 outline-none"
                >
<option :value="null">— No change —</option>
                  <option :value="true">Enable chain</option>
                  <option :value="false">Disable chain</option>
                </select>
              </div>
              <div class="text-[10px] font-mono text-neutral-600">Select a preset, sequence, and chain state the drum machine loads when this marker fires.</div>
            </template>

            <!-- Chord Prog start -->
            <template v-if="newMkr.type === 'cp-start'">
              <div>
                <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">
                  Slot <span class="text-neutral-600">(optional)</span>
                </label>
                <select
                  v-model="newMkrCp.seqKey"
                  class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                >
                  <option value="">— Keep current slot —</option>
                  <option v-for="k in ['A','B','C','D','E','F','G','H']" :key="k" :value="k">Slot {{ k }}</option>
                </select>
              </div>
              <div>
                <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">
                  Chain <span class="text-neutral-600">(optional)</span>
                </label>
                <select
                  v-model="newMkrCp.chainEnabled"
                  class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                >
                  <option :value="null">— No change —</option>
                  <option :value="true">Enable chain</option>
                  <option :value="false">Disable chain</option>
                </select>
              </div>
            </template>

            <!-- Go To Time -->
            <template v-if="newMkr.type === 'goto'">
              <div>
                <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">
                  Target Position <span class="text-neutral-600">(bars:beats)</span>
                </label>
                <input
                  v-model="newMkrGoto.targetTime"
                  type="text" placeholder="e.g. 5:2"
                  class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 outline-none font-mono"
                />
                <div class="mt-1 text-[9px] font-mono text-neutral-600">
                  → {{ formatTime(parseTimeStr(newMkrGoto.targetTime)) }}
                </div>
              </div>
              <div class="flex items-center gap-3">
                <input
                  id="mkr-goto-repeat"
                  v-model="newMkrGoto.repeat"
                  type="checkbox"
                  class="w-4 h-4 accent-violet-500 rounded"
                />
                <label for="mkr-goto-repeat" class="text-xs text-neutral-300 cursor-pointer select-none">
                  Repeat <span class="text-neutral-600">(fires every time playhead crosses this position)</span>
                </label>
              </div>
            </template>

            <!-- DM Rec Sync (macro) -->
            <template v-if="newMkr.type === 'dm-rec-sync'">
              <div>
                <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">
                  Bars to record <span class="text-neutral-600">(1–16)</span>
                </label>
                <input
                  v-model.number="newMkrDmRec.measures"
                  type="number" min="1" max="16"
                  class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-orange-500 outline-none"
                />
                <div class="mt-1 text-[9px] font-mono text-neutral-600">
                  Arms drum machine REC SYNC, records {{ newMkrDmRec.measures }} bars, then stops
                </div>
              </div>
            </template>

            <!-- Audio Trim Start (macro) -->
            <template v-if="newMkr.type === 'audio-trim-start'">
              <div class="text-[10px] font-mono text-neutral-500 py-2">
                Trims leading silence from the Audio Capture recording. No configuration needed.
              </div>
            </template>

            <!-- Audio Set Loop (macro) -->
            <template v-if="newMkr.type === 'audio-set-loop'">
              <div>
                <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">
                  Loop length <span class="text-neutral-600">(bars, 1–16)</span>
                </label>
                <input
                  v-model.number="newMkrAudioLoop.measures"
                  type="number" min="1" max="16"
                  class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none"
                />
                <div class="mt-1 text-[9px] font-mono text-neutral-600">
                  Sets loop region from playback start to {{ newMkrAudioLoop.measures }} bars at current BPM
                </div>
              </div>
            </template>

            <!-- Audio Crop (macro) -->
            <template v-if="newMkr.type === 'audio-crop'">
              <div class="text-[10px] font-mono text-neutral-500 py-2">
                Crops the Audio Capture recording to the current loop region. No configuration needed.
              </div>
            </template>

            <!-- Audio Save WAV (macro) -->
            <template v-if="newMkr.type === 'audio-save-wav'">
              <div class="text-[10px] font-mono text-neutral-500 py-2">
                Exports the cropped Audio Capture recording as a WAV file. The filename is auto-generated from the current drum machine preset, pattern, and BPM.
              </div>
            </template>

            <!-- Stop Timeline -->
            <template v-if="newMkr.type === 'tl-stop'">
              <div class="text-[10px] font-mono text-neutral-500 py-2">
                Stops the timeline playback when this marker is reached. Place at the end of your arrangement.
              </div>
            </template>

            <!-- Global Transport Start -->
            <template v-if="newMkr.type === 'gt-start'">
              <div class="text-[10px] font-mono text-neutral-500 py-2">
                Fires Play All on the global transport — starts all synced sequencers (step sequencer, chord prog, drum machine) and aligns them to the next bar boundary.
              </div>
            </template>

            <!-- Global Transport Stop -->
            <template v-if="newMkr.type === 'gt-stop'">
              <div class="text-[10px] font-mono text-neutral-500 py-2">
                Fires Stop All on the global transport — stops all synced sequencers and halts Tone.Transport.
              </div>
            </template>

            <!-- Chord Prog Select Pattern -->
            <div v-if="newMkr.type === 'cp-select-pattern'">
              <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">Slot A–H</label>
              <select
                v-model.number="newMkr.value"
                class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
              >
                <option v-for="i in 8" :key="i - 1" :value="i - 1">{{ String.fromCharCode(64 + i) }}</option>
              </select>
            </div>

            <!-- Program Change — device + channel + PC -->
            <template v-if="newMkr.type === 'program-change'">
              <div>
                <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">Device</label>
                <div class="flex gap-2">
                  <select
                    v-model="newMkrPc.device"
                    @change="newMkrPc.soundName = ''; newMkrPc.msb = null; newMkrPc.lsb = null"
                    class="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-synth-neon outline-none"
                  >
                    <option v-if="!outDevices.length" value="" disabled>No output devices registered</option>
                    <option v-for="d in outDevices" :key="d" :value="d">{{ d }}</option>
                  </select>
                  <button
                    v-if="pcCatalogKey"
                    @click="openPcBrowser"
                    class="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 hover:border-violet-500/60 hover:bg-violet-500/10 text-neutral-300 hover:text-violet-300 text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 shrink-0"
                    title="Browse presets catalog"
                  >
                    Browse
</button>
        <button
          @click="segments = []; setLS(LS_SEGS, segments)"
          title="Clear all segments"
          class="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-neutral-700 bg-neutral-900 hover:border-red-500/60 hover:bg-red-500/10 text-neutral-500 hover:text-red-400 text-[9px] font-bold uppercase tracking-widest transition-all active:scale-95"
        >
          <Trash2 class="w-3 h-3" /> Segs
        </button>
        <button
          @click="markers = []; setLS(LS_MARKS, markers)"
          title="Clear all markers"
          class="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-neutral-700 bg-neutral-900 hover:border-red-500/60 hover:bg-red-500/10 text-neutral-500 hover:text-red-400 text-[9px] font-bold uppercase tracking-widest transition-all active:scale-95 ml-1"
        >
          <Trash2 class="w-3 h-3" /> Mks
        </button>
                </div>
                <!-- Selected sound indicator -->
                <div v-if="newMkrPc.soundName" class="mt-1.5 flex items-center gap-1.5">
                  <div class="w-1.5 h-1.5 rounded-full bg-synth-neon" />
                  <span class="text-[9px] font-mono text-synth-neon">{{ newMkrPc.soundName }} — PC {{ newMkr.value }}</span>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">MIDI Channel</label>
                  <input
                    v-model.number="newMkrPc.channel"
                    type="number" min="1" max="16"
                    placeholder="1–16"
                    class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-synth-neon outline-none"
                  />
                </div>
                <div>
                  <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">PC Number (0–127)</label>
                  <input
                    v-model.number="newMkr.value"
                    type="number" min="0" max="127"
                    placeholder="0–127"
                    class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-synth-neon outline-none"
                  />
                </div>
              </div>
            </template>

            <div>
              <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">Note (optional)</label>
              <input
                v-model="newMkr.label"
                type="text" placeholder="Short description…"
                class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-synth-neon outline-none"
              />
            </div>
          </div>

          <div class="flex gap-3 mt-5">
            <button @click="showAddMarker = false" class="flex-1 py-2 rounded-lg border border-neutral-800 text-neutral-500 hover:text-white text-sm transition-colors">
              Cancel
            </button>
            <button @click="confirmAddMarker" class="flex-1 py-2 rounded-lg bg-violet-600 text-white font-black text-sm hover:bg-violet-500 transition-colors active:scale-95">
              Add
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Save to Library Prompt ───────────────────────────────────────────── -->
    <Teleport to="body">
      <div
        v-if="showSaveToLibPrompt"
        class="fixed inset-0 z-[9999] flex items-center justify-center"
        @click.self="showSaveToLibPrompt = false; saveToLibCandidate = null"
      >
        <div class="bg-neutral-950 border border-neutral-800 rounded-2xl p-5 w-80 shadow-2xl flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <span class="text-xs font-black uppercase tracking-widest text-synth-neon">Save to Library?</span>
            <span class="text-sm text-neutral-300 truncate">{{ saveToLibCandidate?.label }}</span>
            <span class="text-xs text-neutral-600">Also add this track to TracksPlayer library for reuse.</span>
          </div>
          <!-- BPM row -->
          <div class="flex items-center gap-3">
            <span class="text-xs font-black uppercase tracking-widest text-neutral-500 w-10 shrink-0">BPM</span>
            <div v-if="bpmDetecting" class="flex items-center gap-2 text-xs text-neutral-500">
              <svg class="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Detecting…
            </div>
            <input
              v-else
              v-model="bpmEditable"
              type="number"
              min="20" max="300"
              placeholder="—"
              class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-synth-neon/50"
            />
          </div>
          <div class="flex gap-2">
            <button
              @click="showSaveToLibPrompt = false; saveToLibCandidate = null; bpmEditable = ''; bpmDetecting = false"
              class="flex-1 py-2 rounded-lg border border-neutral-800 text-neutral-500 hover:text-white text-sm transition-colors"
            >Skip</button>
            <button
              @click="confirmSaveToLib"
              :disabled="saveToLibSaving || bpmDetecting"
              class="flex-1 py-2 rounded-lg bg-synth-neon/20 border border-synth-neon/40 text-synth-neon font-black text-sm hover:bg-synth-neon/30 transition-colors active:scale-95 disabled:opacity-50"
            >{{ saveToLibSaving ? 'Saving…' : 'Save' }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Macro Chain Helper ─────────────────────────────────────────────────── -->
    <Teleport to="body">
      <div
        v-if="showMacroChain"
        class="fixed inset-0 z-[9999] flex items-center justify-center"
        @click.self="showMacroChain = false"
      >
        <div class="bg-neutral-950 border border-neutral-800 rounded-2xl p-5 w-96 shadow-2xl flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <span class="text-xs font-black uppercase tracking-widest text-orange-400">Chain Macro Steps</span>
            <span class="text-sm text-neutral-300">Add subsequent audio processing markers?</span>
            <span class="text-xs text-neutral-600 mt-1">
              Recording {{ macroChain.dmRecMeasures }} bars will take ≈ {{ macroChain.recDurationSec }} beats <span class="text-neutral-700">(incl. ~1 bar for bar-aligned start)</span>.
              The remaining markers will be placed at {{ formatTime(macroChain.dmRecPos + macroChain.recDurationSec) }}.
            </span>
          </div>

          <div class="flex flex-col gap-2.5">
            <label class="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" v-model="macroChain.chainTrim" class="w-4 h-4 accent-sky-500 rounded" />
              <div class="flex flex-col">
                <span class="text-sm font-bold text-neutral-200">✂ Audio Trim Start</span>
                <span class="text-[10px] font-mono text-neutral-500">Trim leading silence</span>
              </div>
            </label>
            <label class="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" v-model="macroChain.chainLoop" class="w-4 h-4 accent-emerald-500 rounded" />
              <div class="flex flex-col">
                <span class="text-sm font-bold text-neutral-200">↺ Audio Set Loop</span>
                <span class="text-[10px] font-mono text-neutral-500">Loop length in bars:</span>
              </div>
              <input
                v-model.number="macroChain.chainLoopMeasures"
                type="number" min="1" max="16"
                class="w-14 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-white text-center focus:border-emerald-500 outline-none"
              />
            </label>
            <label class="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" v-model="macroChain.chainCrop" class="w-4 h-4 accent-pink-500 rounded" />
              <div class="flex flex-col">
                <span class="text-sm font-bold text-neutral-200">⊞ Audio Crop</span>
                <span class="text-[10px] font-mono text-neutral-500">Crop to loop region (slightly after trim/loop)</span>
              </div>
            </label>
            <label class="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" v-model="macroChain.chainSave" class="w-4 h-4 accent-amber-500 rounded" />
              <div class="flex flex-col">
                <span class="text-sm font-bold text-neutral-200">⬇ Audio Save WAV</span>
                <span class="text-[10px] font-mono text-neutral-500">Export cropped WAV to save folder</span>
              </div>
            </label>
          </div>

          <div class="flex gap-2 mt-1">
            <button
              @click="showMacroChain = false"
              class="flex-1 py-2 rounded-lg border border-neutral-800 text-neutral-500 hover:text-white text-sm transition-colors"
            >Skip</button>
            <button
              @click="confirmMacroChain"
              class="flex-1 py-2 rounded-lg bg-orange-600 text-white font-black text-sm hover:bg-orange-500 transition-colors active:scale-95"
            >Add {{ [macroChain.chainTrim, macroChain.chainLoop, macroChain.chainCrop, macroChain.chainSave].filter(Boolean).length }} markers</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Save As Dialog ────────────────────────────────────────────────────── -->
    <Teleport to="body">
      <div
        v-if="showSaveAs"
        class="fixed inset-0 z-[620] bg-black/75 flex items-center justify-center"
        @click.self="showSaveAs = false"
      >
        <div class="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
          <h3 class="text-sm font-black uppercase tracking-[0.25em] text-white mb-5">Save Timeline As</h3>
          <div class="space-y-4">
            <div>
              <label class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">Name</label>
              <input
                v-model="saveAsName"
                type="text"
                placeholder="e.g. Main Set, Rehearsal 01…"
                @keyup.enter="confirmSaveAs"
                class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-synth-neon outline-none"
                autofocus
              />
            </div>
          </div>
          <div class="flex gap-3 mt-5">
            <button @click="showSaveAs = false" class="flex-1 py-2 rounded-lg border border-neutral-800 text-neutral-500 hover:text-white text-sm transition-colors">
              Cancel
            </button>
            <button
              @click="confirmSaveAs"
              :disabled="!saveAsName.trim()"
              class="flex-1 py-2 rounded-lg bg-synth-neon text-black font-black text-sm hover:bg-synth-neon/90 transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Load Sets Dialog ───────────────────────────────────────────────────── -->
    <Teleport to="body">
      <div
        v-if="showLoadSets"
        class="fixed inset-0 z-[620] bg-black/75 flex items-center justify-center"
        @click.self="showLoadSets = false"
      >
        <div class="bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden" style="max-width: 480px; max-height: 70vh">
          <div class="px-6 pt-5 pb-4 border-b border-neutral-800 flex items-center justify-between shrink-0">
            <h3 class="text-sm font-black uppercase tracking-[0.25em] text-white">Load Timeline</h3>
            <button @click="showLoadSets = false" class="text-neutral-600 hover:text-white transition-colors">
              <X class="w-4 h-4" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto custom-scrollbar min-h-0 p-4">
            <div v-if="!savedSets.length" class="py-10 text-center text-neutral-600 font-mono text-[10px] uppercase tracking-widest">
              No saved timelines yet — use Save As to create one.
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="set in savedSets"
                :key="set.id"
                class="flex items-center gap-3 bg-neutral-900 border rounded-xl px-4 py-3 transition-all"
                :class="set.id === currentSetId ? 'border-synth-neon/40 bg-synth-neon/5' : 'border-neutral-800 hover:border-neutral-700'"
              >
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-[12px] font-bold text-white truncate">{{ set.name }}</span>
                    <span v-if="set.id === currentSetId" class="text-[8px] font-bold uppercase tracking-widest text-synth-neon bg-synth-neon/10 border border-synth-neon/30 px-1.5 py-0.5 rounded-full shrink-0">Active</span>
                  </div>
                  <div class="text-[9px] font-mono text-neutral-600 mt-0.5">
                    {{ (set.segments || []).length }} segment{{ (set.segments || []).length !== 1 ? 's' : '' }}
                    · {{ (set.markers || []).length }} marker{{ (set.markers || []).length !== 1 ? 's' : '' }}
                    <span v-if="set.savedAt" class="ml-2 text-neutral-700">{{ new Date(set.savedAt).toLocaleDateString() }} {{ new Date(set.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span>
                  </div>
                </div>
                <button
                  @click="loadSet(set)"
                  class="px-3 py-1.5 rounded-lg bg-synth-neon/10 border border-synth-neon/30 text-synth-neon hover:bg-synth-neon/20 text-[9px] font-bold uppercase tracking-widest transition-all active:scale-95 shrink-0"
                >
                  Load
                </button>
                <button
                  @click="deleteSet(set.id)"
                  class="p-1.5 text-neutral-600 hover:text-rose-500 transition-colors shrink-0"
                  title="Delete this timeline"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── PC Preset Browser Modal ────────────────────────────────────────────── -->
    <Teleport to="body">
      <div
        v-if="showPcBrowser"
        class="fixed inset-0 z-[700] bg-black/85 flex items-center justify-center"
        @click.self="showPcBrowser = false"
      >
        <div class="bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden" style="max-height: 80vh">

          <!-- Browser header -->
          <div class="px-5 py-3 border-b border-neutral-800 flex items-center gap-3 shrink-0">
            <span class="text-sm font-black uppercase tracking-[0.2em] text-white">Preset Browser</span>
            <span class="text-[10px] font-mono text-violet-400 uppercase tracking-widest">{{ pcCatalogKey || newMkrPc.device }}</span>
            <div class="flex-1" />
            <button @click="showPcBrowser = false" class="p-1 text-neutral-500 hover:text-white transition-colors">
              <X class="w-4 h-4" />
            </button>
          </div>

          <!-- Bank selector + search -->
          <div class="px-4 py-3 border-b border-neutral-800 flex items-center gap-3 shrink-0">
            <select
              v-model="pcBrowserBank"
              class="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 outline-none shrink-0"
            >
              <option value="">Select bank…</option>
              <option v-for="bank in pcAvailableBanks" :key="bank" :value="bank">{{ bank }}</option>
            </select>
            <input
              v-model="pcBrowserSearch"
              placeholder="Search presets…"
              type="text"
              class="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 outline-none"
            />
          </div>

          <!-- Content area -->
          <div class="flex-1 overflow-y-auto custom-scrollbar min-h-0">
            <!-- No catalog for device -->
            <div v-if="!pcCatalogKey" class="py-12 text-center text-neutral-600 font-mono text-sm uppercase tracking-widest">
              No preset catalog available for "{{ newMkrPc.device }}"
            </div>

            <!-- Pick a bank -->
            <div v-else-if="!pcBrowserBank" class="py-12 text-center text-neutral-600 font-mono text-sm uppercase tracking-widest">
              Select a bank above to browse presets
            </div>

            <!-- Loading -->
            <div v-else-if="pcBrowserLoading" class="py-12 text-center text-neutral-500 font-mono text-sm uppercase tracking-widest animate-pulse">
              Loading presets…
            </div>

            <!-- No results -->
            <div v-else-if="!pcBrowserFiltered.length" class="py-12 text-center text-neutral-600 font-mono text-sm uppercase tracking-widest">
              No presets found
            </div>

            <!-- Sound grid -->
            <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-4">
              <button
                v-for="sound in pcBrowserFiltered"
                :key="sound.id ?? sound.name ?? sound.program"
                @click="selectPcSound(sound)"
                class="text-left px-3 py-2.5 rounded-xl border border-neutral-800 hover:border-violet-500/60 hover:bg-violet-500/8 transition-all group active:scale-95"
              >
                <div class="text-[10px] font-bold text-neutral-300 truncate group-hover:text-white leading-tight">{{ sound.name }}</div>
                <div class="text-[8px] font-mono text-neutral-600 uppercase mt-0.5">
                  {{ sound.category || '' }}
                  <span class="text-neutral-700 ml-1">PC{{ sound.program }}</span>
                </div>
              </button>
            </div>
          </div>

        </div>
      </div>
    </Teleport>

    <MidiMapContextMenu />
  </div>
</template>
