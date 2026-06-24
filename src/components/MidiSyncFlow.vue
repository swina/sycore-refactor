<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { X, Link2, Clock, Play, Mic, Music2, Zap, Layers, Repeat, Music, Drum } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { useSyncStore } from '@/stores/useSyncStore'
import { useConfigStore } from '@/stores/useConfigStore'

const midiStore   = useMidiStore()
const syncStore   = useSyncStore()
const configStore = useConfigStore()

// ── Sync node definitions ──
const SYNC_NODES_DEF = [
  { id: 'live-timeline',  name: 'Live Timeline',        icon: Clock   },
  { id: 'backing-track',  name: 'Backing Track',        icon: Music2  },
  { id: 'sequencer',      name: 'Step Sequencer',       icon: Play    },
  { id: 'chord-prog',     name: 'Chord Prog Seq',       icon: Music   },
  { id: 'live-pad',       name: 'Live Pad',             icon: Zap     },
  { id: 'audio-looper',   name: 'Audio Looper',         icon: Layers  },
  { id: 'loop-pads',      name: 'Loop Pads',            icon: Repeat  },
  { id: 'audio-capture',  name: 'Audio Capture',        icon: Mic     },
  { id: 'midi-transport', name: 'MIDI Transport',       icon: Link2   },
  { id: 'drum-machine',   name: 'Drum Machine',         icon: Drum    },
]

// ── Connection map: fromSyncId → toSyncId → { get, set } ──
// Mirrors MidiSyncMatrix ROWS × COLS. Missing entry = invalid connection.
function buildMap() {
  return {
    'live-timeline': {
      'midi-transport': { get: () => syncStore.syncTimelineToMidi,          set: v => { syncStore.syncTimelineToMidi = v } },
      'sequencer':      { get: () => syncStore.syncTimelineToSequencer,     set: v => { syncStore.syncTimelineToSequencer = v } },
      'backing-track':  { get: () => syncStore.syncTimelineToBackingTrack,  set: v => { syncStore.syncTimelineToBackingTrack = v } },
      'audio-capture':  { get: () => syncStore.syncTimelineToAudioCapture,  set: v => { syncStore.syncTimelineToAudioCapture = v } },
    },
    'backing-track': {
      'midi-transport': { get: () => midiStore.syncMidiTransport,           set: v => midiStore.setSyncMidiTransport(v) },
      'sequencer':      { get: () => syncStore.syncTrack,                   set: v => { syncStore.syncTrack = v } },
      'audio-looper':   { get: () => syncStore.syncBackingTrackToLooper,    set: v => { syncStore.syncBackingTrackToLooper = v } },
      'audio-capture':  { get: () => syncStore.syncRecordAudioCapture,      set: v => { syncStore.syncRecordAudioCapture = v } },
    },
    'sequencer': {
      'midi-transport': { get: () => midiStore.syncSequencerTransport,      set: v => midiStore.setSyncSequencerTransport(v) },
      'backing-track':  { get: () => syncStore.syncTrack,                   set: v => { syncStore.syncTrack = v } },
      'audio-looper':   { get: () => syncStore.syncSequencerToLooper,       set: v => { syncStore.syncSequencerToLooper = v } },
    },
    'live-pad': {
      'midi-transport': { get: () => configStore.syncMidiTransportFromLivePad, set: v => { configStore.syncMidiTransportFromLivePad = v } },
    },
    'audio-looper': {
      'midi-transport': { get: () => syncStore.syncLooperToMidi,            set: v => { syncStore.syncLooperToMidi = v } },
      'sequencer':      { get: () => syncStore.syncLooperToSequencer,       set: v => { syncStore.syncLooperToSequencer = v } },
      'backing-track':  { get: () => syncStore.syncLooperToBackingTrack,    set: v => { syncStore.syncLooperToBackingTrack = v } },
      'audio-capture':  { get: () => syncStore.syncLooperToAudioCapture,    set: v => { syncStore.syncLooperToAudioCapture = v } },
    },
    'chord-prog': {
      'midi-transport': { get: () => midiStore.syncChordProgTransport,      set: v => midiStore.setSyncChordProgTransport(v) },
      'sequencer':      { get: () => syncStore.syncChordProgToSequencer,    set: v => { syncStore.syncChordProgToSequencer = v } },
      'backing-track':  { get: () => syncStore.syncChordProgToBackingTrack, set: v => { syncStore.syncChordProgToBackingTrack = v } },
      'audio-looper':   { get: () => syncStore.syncChordProgToLooper,       set: v => { syncStore.syncChordProgToLooper = v } },
      'audio-capture':  { get: () => syncStore.syncChordProgToAudioCapture, set: v => { syncStore.syncChordProgToAudioCapture = v } },
    },
    'loop-pads': {
      'midi-transport': { get: () => syncStore.syncLoopPadsToMidi,          set: v => { syncStore.syncLoopPadsToMidi = v } },
      'sequencer':      { get: () => syncStore.syncLoopPadsToSequencer,     set: v => { syncStore.syncLoopPadsToSequencer = v } },
      'backing-track':  { get: () => syncStore.syncLoopPadsToBackingTrack,  set: v => { syncStore.syncLoopPadsToBackingTrack = v } },
      'audio-looper':   { get: () => syncStore.syncLoopPadsToLooper,        set: v => { syncStore.syncLoopPadsToLooper = v } },
      'audio-capture':  { get: () => syncStore.syncLoopPadsToAudioCapture,  set: v => { syncStore.syncLoopPadsToAudioCapture = v } },
    },
    'audio-capture': {
      'midi-transport': { get: () => syncStore.syncAudioCaptureToMidi,          set: v => { syncStore.syncAudioCaptureToMidi = v } },
      'sequencer':      { get: () => syncStore.syncAudioCaptureToSequencer,     set: v => { syncStore.syncAudioCaptureToSequencer = v } },
      'backing-track':  { get: () => syncStore.syncAudioCaptureToBackingTrack,  set: v => { syncStore.syncAudioCaptureToBackingTrack = v } },
      'audio-looper':   { get: () => syncStore.syncAudioCaptureToLooper,        set: v => { syncStore.syncAudioCaptureToLooper = v } },
    },
    'drum-machine': {
      'midi-transport': { get: () => syncStore.syncDrumMachineToMidi,          set: v => { syncStore.syncDrumMachineToMidi = v } },
      'sequencer':      { get: () => syncStore.syncDrumMachineToSequencer,     set: v => { syncStore.syncDrumMachineToSequencer = v } },
      'backing-track':  { get: () => syncStore.syncDrumMachineToBackingTrack,  set: v => { syncStore.syncDrumMachineToBackingTrack = v } },
      'audio-looper':   { get: () => syncStore.syncDrumMachineToLooper,        set: v => { syncStore.syncDrumMachineToLooper = v } },
      'audio-capture':  { get: () => syncStore.syncDrumMachineToAudioCapture,  set: v => { syncStore.syncDrumMachineToAudioCapture = v } },
    },
  }
}

// ── Canvas state ──
const canvasEl   = ref(null)
const syncNodes  = ref([])
const syncCables = ref([])
let nextId = 1

const NODE_W = 200
const PORT_Y = 18

// ── Sidebar drag ──
function onSidebarDragStart(e, node) {
  e.dataTransfer.setData('sync-node', JSON.stringify({ syncId: node.id, name: node.name }))
  e.dataTransfer.effectAllowed = 'copy'
}

function onCanvasDrop(e) {
  e.preventDefault()
  const raw = e.dataTransfer.getData('sync-node')
  if (!raw) return
  const data = JSON.parse(raw)
  if (syncNodes.value.some(n => n.syncId === data.syncId)) return  // already on canvas
  const rect = canvasEl.value.getBoundingClientRect()
  syncNodes.value.push({
    id: nextId++,
    syncId: data.syncId,
    name: data.name,
    x: Math.max(0, e.clientX - rect.left - NODE_W / 2),
    y: Math.max(0, e.clientY - rect.top - PORT_Y),
  })
}

function removeNode(id) {
  const map = buildMap()
  for (const cable of syncCables.value) {
    if (cable.fromId !== id && cable.toId !== id) continue
    const src = syncNodes.value.find(n => n.id === cable.fromId)
    const dst = syncNodes.value.find(n => n.id === cable.toId)
    if (src && dst) map[src.syncId]?.[dst.syncId]?.set(false)
  }
  syncNodes.value  = syncNodes.value.filter(n => n.id !== id)
  syncCables.value = syncCables.value.filter(c => c.fromId !== id && c.toId !== id)
}

// ── Node dragging ──
const draggingNode = ref(null)

function onNodeMousedown(e, node) {
  if (e.target.tagName === 'BUTTON') return
  e.preventDefault()
  e.stopPropagation()
  const rect = canvasEl.value.getBoundingClientRect()
  draggingNode.value = { id: node.id, ox: e.clientX - rect.left - node.x, oy: e.clientY - rect.top - node.y }
}

// ── Port positions ──
const outPos = n => ({ x: n.x + NODE_W, y: n.y + PORT_Y })
const inPos  = n => ({ x: n.x,          y: n.y + PORT_Y })

// ── Cable drawing ──
const pendingCable = ref(null)

function onOutPortMousedown(e, node) {
  e.preventDefault()
  e.stopPropagation()
  const rect = canvasEl.value.getBoundingClientRect()
  pendingCable.value = { fromId: node.id, mx: e.clientX - rect.left, my: e.clientY - rect.top }
}

function onInPortMouseup(e, node) {
  if (!pendingCable.value || pendingCable.value.fromId === node.id) { pendingCable.value = null; return }
  const src = syncNodes.value.find(n => n.id === pendingCable.value.fromId)
  if (!src) { pendingCable.value = null; return }
  const conn = buildMap()[src.syncId]?.[node.syncId]
  if (!conn) { pendingCable.value = null; return }  // no valid sync relationship
  const exists = syncCables.value.some(c => c.fromId === pendingCable.value.fromId && c.toId === node.id)
  if (!exists) {
    conn.set(true)
    syncCables.value.push({ id: nextId++, fromId: pendingCable.value.fromId, toId: node.id })
  }
  pendingCable.value = null
}

function removeCable(id) {
  const cable = syncCables.value.find(c => c.id === id)
  if (cable) {
    const src = syncNodes.value.find(n => n.id === cable.fromId)
    const dst = syncNodes.value.find(n => n.id === cable.toId)
    if (src && dst) buildMap()[src.syncId]?.[dst.syncId]?.set(false)
  }
  syncCables.value = syncCables.value.filter(c => c.id !== id)
}

// ── Canvas mouse events ──
function onCanvasMousemove(e) {
  if (!draggingNode.value && !pendingCable.value) return
  const rect = canvasEl.value.getBoundingClientRect()
  const cx = e.clientX - rect.left, cy = e.clientY - rect.top
  if (draggingNode.value) {
    const n = syncNodes.value.find(n => n.id === draggingNode.value.id)
    if (n) { n.x = Math.max(0, cx - draggingNode.value.ox); n.y = Math.max(0, cy - draggingNode.value.oy) }
  }
  if (pendingCable.value) { pendingCable.value.mx = cx; pendingCable.value.my = cy }
}

function onCanvasMouseup() { draggingNode.value = null; pendingCable.value = null }

// ── Init from store state ──
function initFromStore() {
  const map = buildMap()
  const nodeMap = new Map()
  let col = 0

  function ensureNode(syncId) {
    if (nodeMap.has(syncId)) return nodeMap.get(syncId)
    const def = SYNC_NODES_DEF.find(n => n.id === syncId)
    if (!def) return null
    const id = nextId++
    const COLS = 4, COL_W = NODE_W + 50, ROW_H = 90
    syncNodes.value.push({ id, syncId, name: def.name, x: 20 + (col % COLS) * COL_W, y: 20 + Math.floor(col / COLS) * ROW_H })
    nodeMap.set(syncId, id)
    col++
    return id
  }

  for (const [fromId, targets] of Object.entries(map)) {
    for (const [toId, conn] of Object.entries(targets)) {
      if (!conn.get()) continue
      const from = ensureNode(fromId)
      const to   = ensureNode(toId)
      if (from && to) syncCables.value.push({ id: nextId++, fromId: from, toId: to })
    }
  }
}

onMounted(() => {
  window.addEventListener('mouseup', onCanvasMouseup)
  if (!syncNodes.value.length) initFromStore()
})
onUnmounted(() => window.removeEventListener('mouseup', onCanvasMouseup))

// ── SVG ──
function bezier(x1, y1, x2, y2) {
  const cx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`
}
function cablePath(cable) {
  const from = syncNodes.value.find(n => n.id === cable.fromId)
  const to   = syncNodes.value.find(n => n.id === cable.toId)
  if (!from || !to) return ''
  const p1 = outPos(from), p2 = inPos(to)
  return bezier(p1.x, p1.y, p2.x, p2.y)
}
function pendingPath() {
  if (!pendingCable.value) return ''
  const from = syncNodes.value.find(n => n.id === pendingCable.value.fromId)
  if (!from) return ''
  const p1 = outPos(from)
  return bezier(p1.x, p1.y, pendingCable.value.mx, pendingCable.value.my)
}
</script>

<template>
  <div class="flex h-full overflow-hidden">

    <!-- Sidebar -->
    <div class="w-44 shrink-0 bg-neutral-900/40 border-r border-neutral-800 flex flex-col overflow-y-auto p-3 gap-1.5">
      <p class="text-[8px] font-bold uppercase tracking-widest text-neutral-600 mb-1 px-1">Sync Apps</p>
      <div
        v-for="node in SYNC_NODES_DEF"
        :key="node.id"
        draggable="true"
        @dragstart="onSidebarDragStart($event, node)"
        :class="syncNodes.some(n => n.syncId === node.id)
          ? 'opacity-40 cursor-not-allowed'
          : 'hover:border-amber-500/50 hover:bg-amber-900/20 cursor-grab active:cursor-grabbing'"
        class="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-900/40 bg-amber-950/10 transition-colors"
      >
        <component :is="node.icon" class="w-3 h-3 text-amber-400 shrink-0" />
        <span class="text-[9px] font-mono font-bold text-amber-200 truncate leading-tight">{{ node.name }}</span>
      </div>
    </div>

    <!-- Canvas -->
    <div
      ref="canvasEl"
      class="relative flex-1 overflow-hidden"
      style="background-color:#09090b; background-image:radial-gradient(circle,#121212 1px,transparent 1px); background-size:24px 24px;"
      @dragover.prevent
      @drop="onCanvasDrop"
      @mousemove="onCanvasMousemove"
      @mouseup="onCanvasMouseup"
    >
      <div v-if="!syncNodes.length" class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span class="text-[10px] font-mono text-neutral-700 uppercase tracking-widest">Drag sync apps here · connect SYNC OUT● → ●IN · cables apply instantly</span>
      </div>

      <!-- SVG cable layer -->
      <svg class="absolute inset-0 w-full h-full overflow-visible" style="pointer-events:none; z-index:1">
        <g v-for="cable in syncCables" :key="cable.id">
          <path :d="cablePath(cable)" fill="none" stroke="transparent" stroke-width="14"
            style="pointer-events:stroke; cursor:pointer;" @click="removeCable(cable.id)" />
          <path :d="cablePath(cable)" fill="none" stroke="#f59e0b" stroke-width="2" stroke-opacity="0.7"
            style="pointer-events:none;" />
        </g>
        <path v-if="pendingCable" :d="pendingPath()"
          fill="none" stroke="#f59e0b" stroke-width="2" stroke-opacity="0.4" stroke-dasharray="6 4" />
      </svg>

      <!-- Nodes -->
      <div
        v-for="node in syncNodes"
        :key="node.id"
        class="absolute"
        :style="{ left: node.x + 'px', top: node.y + 'px', width: NODE_W + 'px', zIndex: 2 }"
        @mousedown="onNodeMousedown($event, node)"
      >
        <!-- IN port -->
        <svg class="absolute" :style="{ left: '-9px', top: (PORT_Y - 8) + 'px', width: '18px', height: '18px', zIndex: 3, pointerEvents: 'all', cursor: 'crosshair' }"
          @mouseup.stop="onInPortMouseup($event, node)">
          <circle cx="9" cy="9" r="5" fill="#1c1008" stroke="#f59e0b" stroke-width="2" />
          <title>SYNC IN</title>
        </svg>

        <!-- Card -->
        <div class="bg-amber-950/20 border border-amber-900/50 hover:border-amber-500/50 rounded-xl overflow-hidden shadow-xl transition-colors cursor-grab active:cursor-grabbing">
          <div class="flex items-center gap-2 px-3 py-2.5 bg-amber-900/20">
            <component :is="SYNC_NODES_DEF.find(d => d.id === node.syncId)?.icon || Link2" class="w-3 h-3 text-amber-400 shrink-0" />
            <span class="text-[9px] font-mono font-bold text-amber-200 truncate flex-1 leading-tight">{{ node.name }}</span>
            <button @click.stop="removeNode(node.id)" class="text-amber-900 hover:text-red-400 transition-colors shrink-0">
              <X class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- OUT port -->
        <svg class="absolute" :style="{ right: '-9px', top: (PORT_Y - 8) + 'px', width: '18px', height: '18px', zIndex: 3, pointerEvents: 'all', cursor: 'crosshair' }"
          @mousedown.stop="onOutPortMousedown($event, node)">
          <circle cx="9" cy="9" r="5" fill="#1c1008" stroke="#f59e0b" stroke-width="2" />
          <title>SYNC OUT — drag to connect</title>
        </svg>
      </div>
    </div>
  </div>
</template>
