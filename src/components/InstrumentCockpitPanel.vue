<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { AudioLines, Circle, Cable, ExternalLink, Volume2, VolumeX, Network, Play, Square, AlertTriangle, ChevronLeft, ChevronRight, RotateCw, CircleDot, Pin, ListMusic } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { useUiStore } from '@/stores/useUiStore'
import { useAudioMixerStore } from '@/stores/useAudioMixerStore'
import { useArpStore } from '@/stores/useArpStore'
import { useSyncStore } from '@/stores/useSyncStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useMidiFlowConfigsStore } from '@/stores/useMidiFlowConfigsStore'
import { useDeviceRegistry } from '@/composables/useDeviceRegistry'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { useDeviceImages } from '@/composables/useDeviceImages'
import { useCockpitBackground } from '@/composables/useCockpitBackground'
import { useGlobalTransportControls } from '@/composables/useGlobalTransportControls'
import { useCockpitNavigation } from '@/composables/useCockpitNavigation'
import { midiService, MidiSource } from '@/core/midi/midi-service'
import { typeMeta } from '@/lib/device-type-meta'
import { MIDI_APPS, APP_PANEL_ID } from '@/lib/midi-apps'
import { dispatch } from '@/types/events'
import MiniAudioScope from '@/components/MiniAudioScope.vue'
import DeckDrumMachineSummary from '@/components/DeckDrumMachineSummary.vue'
import DeckChordProgSummary from '@/components/DeckChordProgSummary.vue'
import DeckPlaylistSummary from '@/components/DeckPlaylistSummary.vue'

const midiStore = useMidiStore()
const uiStore   = useUiStore()
const mixer     = useAudioMixerStore()
const arpStore  = useArpStore()
const syncStore = useSyncStore()
const mappingStore = useMappingStore()
const midiFlowConfigsStore = useMidiFlowConfigsStore()
const { devices: registryDevices } = useDeviceRegistry()
const { openMenu } = useMidiContextMenu()
const { images: deviceImages } = useDeviceImages()
const { backgroundImage } = useCockpitBackground()
const { transportManager, playAll, stopAll } = useGlobalTransportControls()

const miniScopeRef = ref(null)

const FLAG_FIELDS = [
  { key: 'midiThru',  label: 'Thru' },
  { key: 'clock',     label: 'Clock' },
  { key: 'transport', label: 'Transp' },
]

// Same apps TransportBar.vue's "Sync Apps to Transport" panel toggles —
// shown here as clickable status badges next to the global Play button.
// syncRecordToTransport ("Arm Rec") arms AudioCapture.vue to start recording
// the instant global Play starts (and stop when it stops) — see
// useGlobalTransportControls.js's playAll()/stopAll(). Sequencer (the
// piano-roll-style app, MidiSource.SEQUENCER2) only shows up here once it's
// actually present as a node in MIDI FLOW — canvasAppSourceIds mirrors the
// same gate the Apps column below already uses — since syncing a node that
// isn't there has nothing to affect.
const SYNC_APPS = computed(() => {
  const apps = [
    { key: 'syncSequencerToTransport',    label: 'Step Sequencer' },
    { key: 'syncChordProgToTransport',    label: 'Chord Prog' },
    { key: 'syncDrumMachineToTransport',  label: 'Drum Machine' },
    { key: 'syncBackingTrackToTransport', label: 'Backing Track' },
    { key: 'syncRecordToTransport',       label: 'Arm Rec' },
  ]
  if (canvasAppSourceIds.value.has(MidiSource.SEQUENCER2)) {
    apps.splice(1, 0, { key: 'syncSequencer2ToTransport', label: 'Sequencer' })
  }
  return apps
})

function deviceType(name) {
  if (midiStore.virtualInstruments.some(v => v.name === name)) return 'virtual'
  return registryDevices.value.find(d => d.name === name)?.type ?? 'instrument-single'
}

// ── What's actually present as a node on the MIDI Flow canvas right now —
// liveNodes is shared reactive state (useMidiFlowConfigsStore), so this
// updates immediately as devices/apps are dragged on/off the canvas. ──
const canvasControllerNames = computed(() =>
  new Set(midiFlowConfigsStore.liveNodes.filter(n => n.type === 'controller').map(n => n.name))
)
const canvasAppSourceIds = computed(() =>
  new Set(midiFlowConfigsStore.liveNodes.filter(n => n.sourceId != null).map(n => n.sourceId))
)
const canvasInstrumentNames = computed(() =>
  new Set(midiFlowConfigsStore.liveNodes.filter(n => n.sourceId == null && n.type !== 'controller').map(n => n.name))
)

// ── Controllers (left column) — plain identity, no patch/volume: they're
// inputs, not sound sources. Canvas-present real controllers, PLUS the real
// output-port device each virtual instrument actually sends its MIDI to
// (e.g. a loopback/virtual cable or a hardware synth used as a bridge) —
// that port is a physical/software device in its own right, just never
// dragged onto the canvas as its own node. ──
const controllers = computed(() => {
  const canvasControllers = Object.values(midiStore.routingConfig?.registrations ?? {})
    .filter(reg => canvasControllerNames.value.has(reg.name))
    .map(reg => ({
      name: reg.name,
      online: registryDevices.value.some(d => d.name === reg.name && d.online),
      image: deviceImages.value[reg.name],
      isVirtualOutputPort: false,
    }))

  const existingNames = new Set(canvasControllers.map(c => c.name))
  const portControllers = [...new Set(midiStore.virtualInstruments.map(v => v.midiOutputPort).filter(Boolean))]
    .filter(name => !existingNames.has(name))
    .map(name => ({
      name,
      online: registryDevices.value.some(d => d.name === name && d.online),
      image: deviceImages.value[name],
      isVirtualOutputPort: true,
    }))

  return [...canvasControllers, ...portControllers]
    .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name))
})

// ── Apps (right column) — only MIDI_APPS entries actually present as a
// node on the MIDI Flow canvas. ──
const apps = computed(() =>
  MIDI_APPS.filter(a => canvasAppSourceIds.value.has(a.sourceId))
    .map(a => ({ ...a, panelId: APP_PANEL_ID[a.sourceId] }))
)

// ── Apps not driven by MIDI_APPS (not a MIDI Flow source, e.g. Playlist /
// Backing Track Player) — always visible, unlike `apps` above which is
// gated on canvas presence. ──
const EXTRA_APPS = [
  { id: 'playlist', name: 'Playlist', icon: ListMusic, kind: 'playlist' },
]

// ── Selected app — clicking an app icon shows its compact summary in the
// display area (replacing the instrument-patch list) instead of opening its
// full floating panel; each summary has its own "open full panel" button.
// { sourceId } for a MIDI_APPS entry, or { kind: 'playlist' } for apps
// outside that list. ──
const selectedApp = ref(null)

function selectApp(target) {
  selectedApp.value = target
}

// Only Drum Machine/Chord Prog (and Playlist, via its own separate button)
// have a compact summary — every other app keeps the old behavior of
// opening its full panel directly, so clicking never leaves the display blank.
function activateApp(a) {
  if (a.sourceId === MidiSource.DRUM_MACHINE || a.sourceId === MidiSource.CHORD_PROG) {
    selectApp({ sourceId: a.sourceId })
  } else if (a.panelId) {
    uiStore.openPanel(a.panelId)
  }
}

function closeAppSummary() {
  selectedApp.value = null
}

const selectedAppComponent = computed(() => {
  if (!selectedApp.value) return null
  if (selectedApp.value.kind === 'playlist') return DeckPlaylistSummary
  if (selectedApp.value.sourceId === MidiSource.DRUM_MACHINE) return DeckDrumMachineSummary
  if (selectedApp.value.sourceId === MidiSource.CHORD_PROG) return DeckChordProgSummary
  return null
})

// ── Hover highlight: which instruments does a given controller/app/port
// actually reach? For a real canvas node (controller or app), trace forward
// through the canvas's own cables (the same graph the user drew in MIDI
// Flow) — this naturally handles multi-hop paths like
// Controller -> Step Sequencer -> S-1. For a synthesized virtual-output-port
// entry (not a real node), "connected" just means whichever virtual
// instruments are bound to that port. ──
const nodeById = computed(() => new Map(midiFlowConfigsStore.liveNodes.map(n => [n.id, n])))

const forwardAdjacency = computed(() => {
  const map = new Map()
  for (const cable of midiFlowConfigsStore.liveCables) {
    if (!map.has(cable.fromId)) map.set(cable.fromId, new Set())
    map.get(cable.fromId).add(cable.toId)
  }
  return map
})

function reachableNodeIds(startIds) {
  const visited = new Set()
  const queue = [...startIds]
  while (queue.length) {
    const id = queue.shift()
    if (visited.has(id)) continue
    visited.add(id)
    for (const nextId of (forwardAdjacency.value.get(id) ?? [])) {
      if (!visited.has(nextId)) queue.push(nextId)
    }
  }
  return visited
}

const hoveredTarget = ref(null)   // { kind: 'controller' | 'app' | 'port', name?, sourceId? } — transient, mouse-driven

function hoverController(c) {
  hoveredTarget.value = { kind: c.isVirtualOutputPort ? 'port' : 'controller', name: c.name }
}
function hoverApp(a) {
  hoveredTarget.value = { kind: 'app', sourceId: a.sourceId }
}
function clearHover() {
  hoveredTarget.value = null
}

// Persistent counterpart to hoveredTarget — set by SELECT (mouse click, MIDI,
// or the on-screen nav cluster) on a Controller/Port, so the reachable
// instruments stay highlighted after focus/mouse moves elsewhere. Activating
// the same already-pinned target again un-pins it.
const pinnedNavTarget = ref(null)   // { kind: 'controller' | 'port', name }

function activatePinTarget(target) {
  const same = pinnedNavTarget.value?.kind === target.kind && pinnedNavTarget.value?.name === target.name
  pinnedNavTarget.value = same ? null : target
}

function resolveHighlightsFor(t) {
  if (!t) return new Set()

  if (t.kind === 'port') {
    return new Set(midiStore.virtualInstruments.filter(v => v.midiOutputPort === t.name).map(v => v.name))
  }

  const startIds = midiFlowConfigsStore.liveNodes
    .filter(n => t.kind === 'controller' ? (n.type === 'controller' && n.name === t.name) : (n.sourceId === t.sourceId))
    .map(n => n.id)
  if (!startIds.length) return new Set()

  const instrumentNameSet = new Set(instruments.value.map(i => i.name))
  const names = new Set()
  for (const id of reachableNodeIds(startIds)) {
    const node = nodeById.value.get(id)
    if (node && !node.sourceId && instrumentNameSet.has(node.name)) names.add(node.name)
  }
  return names
}

const highlightedInstrumentNames = computed(() => {
  const fromHover = resolveHighlightsFor(hoveredTarget.value)
  const fromPin   = resolveHighlightsFor(pinnedNavTarget.value)
  if (!fromHover.size) return fromPin
  if (!fromPin.size) return fromHover
  return new Set([...fromHover, ...fromPin])
})

// ── Instruments (bottom row) — everything that isn't a controller: hardware
// + virtual instruments. Rows are built from the same reactive sources MIDI
// Flow itself reads/writes, so anything changed elsewhere (Program Change
// panel, MIDI Flow, Audio Mixer) shows up here live. Gated on canvas
// presence (canvasInstrumentNames) just like controllers/apps above —
// removeNode() in MIDI Flow clears routing/input-routing for a deleted node
// but intentionally leaves its `registrations` entry alone (other panels,
// e.g. Program Change, still read patch data from it), so without this
// filter a device removed from the MIDI Flow canvas would keep showing up
// here forever. ──
const instruments = computed(() => {
  const uiOutputs = midiStore.routingMatrix[MidiSource.UI] ?? []

  return Object.values(midiStore.routingConfig?.registrations ?? {})
    .filter(reg => deviceType(reg.name) !== 'controller' && canvasInstrumentNames.value.has(reg.name))
    .map(reg => {
      const virtualInstrument = midiStore.virtualInstruments.find(v => v.name === reg.name)
      const isVirtual = !!virtualInstrument
      const type = deviceType(reg.name)
      const online = isVirtual
        ? virtualInstrument.online !== false
        : registryDevices.value.some(d => d.name === reg.name && d.online)

      // Must match MidiDeviceProgramChangePanel.vue's own key exactly (reg.pcChannel ?? 0) —
      // this is the Program Change channel, unrelated to reg.inChannel (the note-input
      // channel), which was the bug: single-timbral devices default pcChannel to 0, and
      // using inChannel as a fallback would look the patch up under the wrong key whenever
      // the two differ (e.g. a MicroFreak whose keyboard input isn't on channel 1).
      const activeCh = reg.pcChannel ?? 0
      const chInfo = reg.pcChannels?.[activeCh]
      const patchName = chInfo?.soundName ?? (reg.pcProgram != null ? `PC ${reg.pcProgram + 1}` : null)
      const patchCategory = chInfo?.category || null

      // One entry per active channel (multi-timbral virtual instruments fan
      // out over several) — the PC-number fallback only applies to the
      // single primary channel, since pcProgram/pcBank track just that one.
      const channelPatchList = (reg.outChannels && reg.outChannels.length > 0 ? reg.outChannels : [reg.outChannel]).map(ch => {
        const info = reg.pcChannels?.[ch]
        const name = info?.soundName ?? (ch === activeCh && reg.pcProgram != null ? `PC ${reg.pcProgram + 1}` : null)
        return { channel: ch + 1, patchName: name, patchCategory: info?.category || null }
      })

      const volCh = reg.outChannels?.[0]
      const useVirtualChannel = isVirtual && volCh != null
      const vol    = useVirtualChannel ? mixer.getVirtualChannelVol(reg.name, volCh) : mixer.getInstrumentVol(reg.name)
      const muted  = useVirtualChannel ? mixer.isVirtualChannelMuted(reg.name, volCh) : mixer.isInstrumentMuted(reg.name)

      // Multi-timbral virtual instruments fan out to several channels at
      // once (reg.outChannels) — show all of them, not just the single
      // outChannel remap that applies when there's no fanout.
      const activeChannels = (reg.outChannels && reg.outChannels.length > 0)
        ? reg.outChannels.map(c => c + 1)
        : [reg.outChannel + 1]

      return {
        name: reg.name,
        type,
        meta: typeMeta(type),
        image: deviceImages.value[reg.name],
        online,
        channel: reg.outChannel,
        activeChannels,
        channelPatchList,
        flags: FLAG_FIELDS.map(f => ({ ...f, active: !!reg[f.key] })),
        patchName,
        patchCategory,
        vol,
        muted,
        hasSoundEngineLink: uiOutputs.includes(reg.name),
        setVol: v => useVirtualChannel ? mixer.setVirtualChannelVol(reg.name, volCh, v) : mixer.setInstrumentVol(reg.name, v),
        toggleMute: () => useVirtualChannel ? mixer.toggleVirtualChannelMute(reg.name, volCh) : mixer.toggleInstrumentMute(reg.name),
      }
    })
    // Offline instruments are unreachable — drop them from the DECK
    // instruments layer entirely rather than showing a dimmed, dead card.
    // For real hardware "offline" means disconnected; for a virtual
    // instrument it's the manual online/offline toggle on its MIDI Flow
    // card (there's no real connection state to detect otherwise).
    .filter(row => row.online)
    // Real instruments (single/multi) grouped before virtual instruments, alphabetical within each group.
    .sort((a, b) => Number(a.type === 'virtual') - Number(b.type === 'virtual') || a.name.localeCompare(b.name))
})

function toggleFlag(row, flag) {
  midiStore.updateRegistration(row.name, flag.key, !flag.active)
}

// ── Navigation zones — a focus cursor (see useCockpitNavigation) that steps
// through Controllers -> Display -> Apps -> Instruments, driven identically
// by the on-screen nav cluster and by physical MIDI buttons/encoders learned
// against the 7 cockpit_nav_* paramNames below. ──
const controllerItems = computed(() => controllers.value.map(c => ({
  id: c.name,
  activate: () => activatePinTarget({ kind: c.isVirtualOutputPort ? 'port' : 'controller', name: c.name }),
})))

const appItems = computed(() => apps.value.map(a => ({
  id: a.sourceId,
  activate: () => activateApp(a),
})))

// One item per active CHANNEL, not per instrument — this is what ties the
// item encoder/nav directly to the patch list shown in the display: for a
// multi-timbral instrument with several channels, stepping "next/prev item"
// walks through its channel rows exactly as they're listed there, and
// SELECT lands Program Change on that exact device+channel (selectInstrumentChannel),
// same as clicking that row directly.
const instrumentItems = computed(() => {
  const items = []
  for (const row of instruments.value) {
    for (const cp of row.channelPatchList) {
      items.push({
        id: row.name + ':' + cp.channel,
        rowName: row.name,
        channel: cp.channel,
        activate: () => selectInstrumentChannel(row, cp),
      })
    }
  }
  return items
})

function instrumentItemFocusRing(rowName, channel = null) {
  if (channel != null) {
    const idx = instrumentItems.value.findIndex(it => it.rowName === rowName && it.channel === channel)
    return idx === -1 ? '' : focusRing('instruments', idx)
  }
  // Card-level (whole instrument): amber if focus is on ANY of its channel rows.
  const anyFocused = instrumentItems.value.some((it, idx) => it.rowName === rowName && nav.isFocused('instruments', idx))
  return anyFocused ? 'outline outline-2 outline-dashed outline-orange-500 outline-offset-2' : ''
}

// Fixed order — indices below (DISPLAY_*_IDX) must match this array.
const DISPLAY_BPM_IDX = 0, DISPLAY_MIDIFLOW_IDX = 1, DISPLAY_PANIC_IDX = 2, DISPLAY_SCOPE_IDX = 3, DISPLAY_PLAY_IDX = 4, DISPLAY_SYNC_START_IDX = 5

const displayItems = computed(() => [
  { id: 'bpm', activate: () => {} }, // no-op — BPM already has its own direct right-click MIDI Learn
  { id: 'midiflow', activate: () => openMidiFlow() },
  { id: 'panic', activate: () => midiStore.panic() },
  { id: 'scope', activate: () => {
      if (!miniScopeRef.value) return
      miniScopeRef.value.isActive ? miniScopeRef.value.stop() : miniScopeRef.value.start()
    } },
  { id: 'transport', activate: () => { transportManager.isRunning.value ? stopAll() : playAll() } },
  ...SYNC_APPS.value.map(s => ({ id: s.key, activate: () => { syncStore[s.key] = !syncStore[s.key] } })),
])

const zones = [
  { id: 'controllers', items: controllerItems },
  { id: 'display', items: displayItems },
  { id: 'apps', items: appItems },
  { id: 'instruments', items: instrumentItems },
]

const nav = useCockpitNavigation(zones)

function focusRing(zoneId, idx) {
  return nav.isFocused(zoneId, idx) ? 'outline outline-1 outline-dashed outline-orange-500/40 outline-offset-2' : ''
}

// ── Local raw MIDI listener — resolves the 7 cockpit_nav_* paramNames
// learned via the on-screen cluster's right-click MIDI Learn menus, mirroring
// the same local-listener pattern MidiDeviceProgramChangePanel.vue already
// uses for its own paramNames (same key-building convention, so it correctly
// reads back whatever confirmLearn() stored). Buttons/notes are naturally
// single-fire; CC-driven "buttons" get their own small rising-edge guard
// since mappingStore.midiMappings has no generic one. Encoders are read as
// plain absolute CC (the default mode nearly every hardware encoder ships
// in) — we track each encoder's last raw value and derive direction from
// the wrap-safe delta between ticks, rather than assuming the two's-
// complement "relative" protocol that requires special controller config
// most users never set up (the earlier approach, and why it felt unusable). ──
const _cockpitEdgeState = new Map()
const _cockpitEncoderState = new Map()

function encoderDelta(id, val) {
  const prev = _cockpitEncoderState.get(id)
  _cockpitEncoderState.set(id, val)
  if (prev === undefined) return 0
  let diff = val - prev
  if (diff > 64) diff -= 128
  else if (diff < -64) diff += 128
  return diff
}

function edgeTriggered(id, val) {
  const prev = _cockpitEdgeState.get(id) ?? 0
  _cockpitEdgeState.set(id, val)
  return prev < 64 && val >= 64
}

function _cockpitMidiListener(event) {
  if (!event.data || event.data.length < 2) return
  const status  = event.data[0]
  const type    = status & 0xF0
  const channel = status & 0x0F
  const byte1   = event.data[1]
  const byte2   = event.data[2] ?? 0
  const inputId = event.target?.id
  const deviceName = midiService.getInputs().find(i => i.id === inputId)?.name
  if (!deviceName) return

  const isCC   = type === 0xB0
  const isNote = type === 0x90 && byte2 > 0
  if (!isCC && !isNote) return

  const key = [deviceName, `CH${channel + 1}`, isNote ? `NOTE${byte1}` : `CC${byte1}`].join(':')
  const mapping = mappingStore.midiMappings[key]
  if (!mapping) return
  const paramName = typeof mapping === 'object' ? mapping.paramName : mapping

  switch (paramName) {
    case 'cockpit_nav_next_zone': if (isNote || edgeTriggered('nz', byte2)) nav.moveZone(1); break
    case 'cockpit_nav_prev_zone': if (isNote || edgeTriggered('pz', byte2)) nav.moveZone(-1); break
    case 'cockpit_nav_next_item': if (isNote || edgeTriggered('ni', byte2)) nav.moveItem(1); break
    case 'cockpit_nav_prev_item': if (isNote || edgeTriggered('pi', byte2)) nav.moveItem(-1); break
    case 'cockpit_nav_select':    if (isNote || edgeTriggered('sel', byte2)) nav.selectCurrent(); break
    case 'cockpit_nav_zone_encoder': { const d = encoderDelta('ze', byte2); if (d) nav.moveZone(Math.sign(d)) } break
    case 'cockpit_nav_item_encoder': { const d = encoderDelta('ie', byte2); if (d) nav.moveItem(Math.sign(d)) } break
  }
}

let _unsubCockpitMidi = null
onMounted(() => { _unsubCockpitMidi = midiService.addRawListener(_cockpitMidiListener) })
onUnmounted(() => _unsubCockpitMidi?.())

// ── Transport position (bar:beat:sixteenth) — same rAF-driven readout as
// TransportBar.vue (the footer's transport controls), just mirrored here. ──
const position = ref('001:1:1')
let _positionRafId = null

function updatePosition() {
  // Always reschedule, even while stopped — see TransportBar.vue's identical
  // fix: gating the reschedule on isRunning let the loop die at mount
  // (before playback starts) and never restart once playback began.
  if (transportManager.isRunning.value) {
    const p = transportManager.getBarPosition()
    position.value = `${String(p.bar).padStart(3, '0')}:${p.beat}:${p.sixteenth}`
  } else {
    position.value = '001:1:1'
  }
  _positionRafId = requestAnimationFrame(updatePosition)
}

onMounted(() => { _positionRafId = requestAnimationFrame(updatePosition) })
onUnmounted(() => { if (_positionRafId) cancelAnimationFrame(_positionRafId) })

// { name, channel } of whatever was last picked — channel is null when a
// whole instrument card was clicked (highlights every channel row for it),
// or a specific 1-based channel when a single patch/channel line in the
// display's list was clicked (highlights just that row).
const selected = ref(null)
function isSelected(name, channel = null) {
  return !!selected.value && selected.value.name === name
    && (selected.value.channel == null || channel == null || selected.value.channel === channel)
}

// Clicking an instrument card body (not its inner controls, which stop
// propagation) sets that device as selected in Program Change — ready to
// view there without stealing focus by popping that panel open — and
// keeps it highlighted in the display's own patch list, so you can tell
// at a glance which instrument you last picked.
function selectInstrument(row) {
  closeAppSummary()
  selected.value = { name: row.name, channel: null }
  dispatch('device-pc-select', { deviceName: row.name })
}

// A specific patch/channel line in the display's list — sets both the
// device AND that exact channel in Program Change (still without opening
// it), so multi-timbral devices land on the right part, not just channel 0.
function selectInstrumentChannel(row, cp) {
  closeAppSummary()
  selected.value = { name: row.name, channel: cp.channel }
  dispatch('device-pc-select', { deviceName: row.name, channel: cp.channel })
}

// The dedicated "Select in Program Change" button — this one DOES bring
// the panel to the front, unlike the passive card/list clicks above.
function openInProgramChange(row) {
  closeAppSummary()
  selected.value = { name: row.name, channel: null }
  dispatch('device-pc-open', { deviceName: row.name })
}

function openSoundEngine() {
  uiStore.openPanel('sound-engine')
}

function openMidiFlow() {
  uiStore.openPanel('midi-flow')
}

function handleBpmChange(e) {
  const v = parseInt(e.target.value)
  if (!isNaN(v) && v >= 20 && v <= 300) midiStore.setGlobalBpm(v)
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- Toolbar
    <div class="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-black/20 shrink-0">
      <span class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
        {{ controllers.length + instruments.length }} devices routed
      </span>
      <button @click="openMidiFlow"
        class="text-[10px] flex items-center gap-1 px-2 py-1 rounded border border-synth-neon/40 text-synth-neon/70 hover:text-synth-neon hover:border-synth-neon transition-colors"
      >
        <Network class="w-3 h-3" /> MIDI Flow
      </button>
    </div> -->

    <div v-if="controllers.length === 0 && instruments.length === 0" class="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
      <p class="text-neutral-600 text-sm font-mono">
        No devices routed yet.<br/>Wire up your rig in MIDI Flow to see it here.
      </p>
      <button @click="openMidiFlow"
        class="flex items-center gap-2 text-xs px-3 py-1.5 rounded border border-synth-neon/40 text-synth-neon hover:bg-synth-neon/10 transition-colors"
      >
        <Cable class="w-3.5 h-3.5" /> Open MIDI Flow
      </button>
    </div>

    <div v-else class="flex-1 min-h-0 flex gap-3 p-3 overflow-hidden cockpit-root"
      :style="backgroundImage ? { backgroundImage: `url(${backgroundImage})` } : null"
    >

      <!-- ── Controllers (left) ── -->
      <div class="ml-4 w-28 shrink-0 flex flex-col gap-2 justify-start overflow-y-auto custom-scrollbar border-neutral-800 pr-3">
        <p class="text-[8px] font-black uppercase tracking-widest text-neutral-600 bg-black py-1 text-center mb-0.5">Controllers</p>
        <div v-if="controllers.length === 0" class="text-[9px] text-neutral-700 italic text-center">None</div>
        <div v-for="(c, idx) in controllers" :key="c.name"
          @mouseenter="hoverController(c)"
          @mouseleave="clearHover"
          @click="activatePinTarget({ kind: c.isVirtualOutputPort ? 'port' : 'controller', name: c.name })"
          title="Pin the instruments this reaches"
          class="relative rounded-lg border-3 p-2 flex flex-col items-center gap-1 text-center transition-colors cursor-pointer"
          :class="[
            c.online ? 'bg-neutral-900 border-black hover:border-sky-700' : 'bg-neutral-950 border-black opacity-60',
            focusRing('controllers', idx),
          ]"
        >
          <Pin v-if="pinnedNavTarget?.kind === (c.isVirtualOutputPort ? 'port' : 'controller') && pinnedNavTarget?.name === c.name"
            class="w-2.5 h-2.5 text-amber-400 fill-current absolute top-1 right-1" />
          <div class="w-8 h-8 rounded-md overflow-hidden flex items-center justify-center bg-black/40 text-sky-400">
            <img v-if="c.image" :src="c.image" class="w-full h-full object-cover" :alt="c.name" />
            <component v-else :is="typeMeta('controller').icon" class="w-4 h-4" />
          </div>
          <p class="text-[9px] font-bold text-neutral-300 truncate w-full" :title="c.name">{{ c.name }}</p>
          <span v-if="c.isVirtualOutputPort" class="text-[7px] px-1 rounded bg-amber-900/30 text-amber-500 border border-amber-900/30">Port</span>
          <Circle v-else class="w-1.5 h-1.5 fill-current" :class="c.online ? 'text-emerald-400' : 'text-neutral-600'" />
        </div>
      </div>

      <!-- ── Center: Display + Instruments ── -->
      <div class="flex-1 min-w-0 flex flex-col gap-3">
        <!-- <p class="text-[8px] font-black uppercase tracking-widest text-neutral-600 text-center mb-0.5">Apps</p> -->
        <!-- Main display (LCD screen) -->
        <div class="display-glass relative rounded-xl border-2 border-black bg-black overflow-hidden shadow-2xl p-3 flex flex-col shrink-0 h-3/5 h-min-1/2">
          <!-- Hardware screen effect overlays — decorative only, must not carry real content or backgrounds (they'd override the ones above) -->
          <div class="absolute inset-0 z-20 pointer-events-none glass-reflection"></div>
          <div class="absolute inset-0 z-10 pointer-events-none scanlines"></div>

          <div class="relative z-30 flex flex-col flex-1 min-h-0 gap-2">
          <!-- <div class="flex items-start justify-between">
            
          </div> -->

          <div class="flex-1 min-h-0 flex items-start gap-3">
            <div class="shrink-0 w-42 flex flex-col items-center gap-1.5 rounded-lg p-1" :class="focusRing('display', DISPLAY_SCOPE_IDX)">
              <span class="text-sm font-mono uppercase tracking-[0.35em] text-synth-neon/80">SY.CORE</span>
              <!-- Audio Scope -->
              <MiniAudioScope ref="miniScopeRef" class="h-24 w-full" />
              
              <!-- PLAY Transport Global -->
              <button
              @click="transportManager.isRunning.value ? stopAll() : playAll()"
              @contextmenu.prevent="openMenu($event, { name: 'transport-play-all', label: transportManager.isRunning.value ? 'Stop All' : 'Play All' })"
              class="flex items-center gap-1.5 px-3 py-1 rounded-full text-[16px] font-mono uppercase tracking-widest border transition-all active:scale-95"
              :class="[
                transportManager.isRunning.value
                  ? 'text-red-400 border-red-500/40 bg-red-500/10 hover:bg-red-500/20'
                  : 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20',
                focusRing('display', DISPLAY_PLAY_IDX),
              ]"
              >
                <component :is="transportManager.isRunning.value ? Square : Play" class="w-3 h-3 fill-current" />
                <span>{{ transportManager.isRunning.value ? 'Stop' : 'Play' }}</span>
              </button>
              <!-- Transport position — same format as TransportBar.vue's own readout -->
              <span class="text-[12px] font-mono text-neutral-400 tabular-nums">{{ position }}</span>

              <!-- Recording indicator — only while Arm Rec armed AND actually recording; opens Audio Capture -->
              <button
                v-if="syncStore.syncRecordToTransport && uiStore.isCaptureRecording"
                @click="uiStore.openPanel('audio-capture')"
                title="Recording — open Audio Capture"
                class="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors animate-pulse"
              >
                <Circle class="w-2.5 h-2.5 fill-current" />
                <span>Rec</span>
              </button>

              <!-- Transport stopped but Arm Rec is armed — surface a way back into Audio Capture to grab the take -->
              <button
                v-else-if="syncStore.syncRecordToTransport && !transportManager.isRunning.value"
                @click="uiStore.openPanel('audio-capture')"
                title="Open Audio Capture"
                class="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest border border-cyan-500/40 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
              >
                <AudioLines class="w-2.5 h-2.5 fill-current" />
                <span>Audio Rec</span>
              </button>
            </div>

            <!-- Current instrument patches + active channels -->
            <div v-if="!selectedApp" class="flex-1 min-w-0 h-full overflow-y-auto custom-scrollbar bg-neutral-400/20 p-1 rounded-lg text-[9px] font-mono border-[4px] border-neutral-900 pl-1 shadow-inner" :class="focusRing('instruments', 3)">
              <p v-if="instruments.length === 0" class="text-neutral-700 italic text-center pt-2">No instruments routed</p>
              <template v-for="row in instruments" :key="row.name">
                <div v-for="(cp, idx) in row.channelPatchList" :key="row.name + ':' + cp.channel"
                  @click="selectInstrumentChannel(row, cp)"
                  title="Select this device/channel in Program Change"
                  class="flex items-center gap-2 py-0.5 px-1 border-b font-mono text-[14px] rounded transition-colors cursor-pointer hover:bg-white/5"
                  :class="[
                    isSelected(row.name, cp.channel) ? 'border-violet-700/50 bg-sky-500/50' : 'border-neutral-900/60',
                    instrumentItemFocusRing(row.name, cp.channel),
                  ]"
                >
                  <Circle v-if="idx === 0" class="w-1.5 h-1.5 fill-current shrink-0" :class="row.online ? 'text-emerald-400' : 'text-neutral-600'" />
                  <span v-else class="w-1.5 h-1.5 shrink-0"></span>
                  <span class="truncate text-neutral-300 w-42 shrink-0" :title="row.name">{{ idx === 0 ? row.name : '' }}</span>
                  <span class="truncate flex-1 min-w-0 text-sky-400" :class="cp.patchName ? 'text-neutral-300' : 'text-neutral-700 italic'">
                    {{ cp.patchName ?? 'No preset' }} {{ cp.patchCategory ? '(' + cp.patchCategory + ')' : '' }}
                  </span>
                  <span class="shrink-0 text-synth-neon/70">CH {{ cp.channel }}</span>
                </div>
              </template>
            </div>

            <!-- Selected app's compact summary — replaces the instrument list above -->
            <div v-else class="flex-1 min-w-0 h-full overflow-y-auto custom-scrollbar bg-neutral-400/20 p-1.5 rounded-lg border-[4px] border-neutral-900 pl-3">
              <component :is="selectedAppComponent" @close="closeAppSummary" />
            </div>
          </div>

          
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <!-- <button @click="openSoundEngine"
                class="flex items-center gap-1 px-2 py-1 rounded border border-synth-neon/40 text-synth-neon/70 hover:text-synth-neon hover:border-synth-neon transition-colors"
                :class="focusRing('display', DISPLAY_SYNC_START_IDX - 1)"
              >
                <Cpu class="w-3 h-3" /> Sound Engine
              </button> -->

            <!-- <button
              @click="transportManager.isRunning.value ? stopAll() : playAll()"
              @contextmenu.prevent="openMenu($event, { name: 'transport-play-all', label: transportManager.isRunning.value ? 'Stop All' : 'Play All' })"
              class="flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all active:scale-95"
              :class="[
                transportManager.isRunning.value
                  ? 'text-red-400 border-red-500/40 bg-red-500/10 hover:bg-red-500/20'
                  : 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20',
                focusRing('display', DISPLAY_PLAY_IDX),
              ]"
            >
              <component :is="transportManager.isRunning.value ? Square : Play" class="w-3 h-3 fill-current" />
              <span>{{ transportManager.isRunning.value ? 'Stop' : 'Play' }}</span>
            </button> -->
            <!-- Transport position — same format as TransportBar.vue's own readout -->
            <!-- <span class="text-[12px] font-mono text-neutral-400 tabular-nums">{{ position }}</span> -->
            <!-- Global BPM (bottom-right) -->
            <span class="text-[8px] text-neutral-600">BPM</span>
              <input
                type="number" min="20" max="300"
                :value="arpStore.arpBpm"
                @change="handleBpmChange"
                class="w-14 bg-black border border-neutral-800 rounded px-1 py-0.5 text-center text-synth-neon text-[12px] focus:outline-none focus:border-synth-neon transition-colors"
              />
            </div>
            
            <!-- Synced apps (click to toggle sync to the global transport) -->
            <div class="flex items-center gap-1">
              <button
                v-for="(s, idx) in SYNC_APPS" :key="s.key"
                @click="syncStore[s.key] = !syncStore[s.key]"
                :title="(syncStore[s.key] ? 'Synced: ' : 'Not synced: ') + s.label"
                class="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded border transition-colors"
                :class="[
                  syncStore[s.key]
                    ? 'bg-violet-800/50 border-violet-700/40 text-emerald-400'
                    : 'bg-violet-800/20 border-neutral-700 text-neutral-600',
                  focusRing('display', DISPLAY_SYNC_START_IDX + idx),
                ]"
              >
                {{ s.label }}
              </button>
            </div>
          </div>
          </div>
        </div>

        <!-- Bus line down to instruments -->
        <!-- <div class="h-2 border-neutral-800 shrink-0" v-if="instruments.length > 0"></div> -->

        <!-- Instruments (bottom row) -->
        <div class="flex justify-center min-h-0 w-full overflow-x-auto overflow-y-hidden custom-scrollbar -mt-2">
          <div v-if="instruments.length === 0" class="text-[10px] text-neutral-700 italic text-center pt-4">No instruments routed</div>
          <div v-else class="display-glass relative shadow-lg h-full bg-black/60 flex gap-2 w-full justify-center p-2 rounded-lg border border-black">
            <div
              v-for="row in instruments"
              :key="row.name"
              @click="selectInstrument(row)"
              title="Select in Program Change"
              class="relative w-36 shrink-0 rounded-xl border-2 p-2.5 flex flex-col gap-1.5 transition-colors max-h-48 cursor-pointer"
              :class="[
                row.meta.card,
                !row.online ? 'opacity-60' : '',
                highlightedInstrumentNames.has(row.name) ? 'ring-2 ring-synth-neon border-synth-neon bg-synth-neon/10' : '',
                isSelected(row.name) ? 'ring-2 ring-violet-400 border-violet-400' : '',
                instrumentItemFocusRing(row.name),
              ]"
            >
              <!-- <ChevronUp class="w-3 h-3 text-neutral-700 absolute -top-2.5 left-1/2 -translate-x-1/2" /> -->

              <div class="flex items-center gap-2">
                <div :class="['w-7 h-7 rounded-md overflow-hidden flex items-center justify-center shrink-0 bg-black/40', row.meta.text]">
                  <img v-if="row.image" :src="row.image" class="w-full h-full object-cover" :alt="row.name" />
                  <component v-else :is="row.meta.icon" class="w-3.5 h-3.5" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-[10px] font-bold text-neutral-200 truncate" :title="row.name">{{ row.name }}</p>
                  <span class="flex items-center gap-1 text-[8px] font-mono uppercase" :class="row.online ? 'text-emerald-400' : 'text-neutral-600'">
                    <Circle class="w-1.5 h-1.5 fill-current" /> CH {{ row.activeChannels.join(',') }}
                  </span>
                </div>
              </div>

              <div class="flex items-center gap-1">
                <p v-if="row.patchName" class="text-[9px] text-neutral-300 truncate">{{ row.patchName }}</p>
                <p v-else class="text-[9px] text-neutral-600 italic">No preset</p>
                <span v-if="row.patchCategory" class="inline-block mt-0.5 text-[8px] px-1 rounded bg-violet-900/30 text-violet-400 border border-violet-900/30">
                  {{ row.patchCategory }}
                </span>
              </div>

              <!-- <div class="flex gap-1">
                <button
                  v-for="flag in row.flags" :key="flag.key"
                  @click.stop="toggleFlag(row, flag)"
                  class="text-[8px] font-mono uppercase px-1 py-0.5 rounded border transition-colors"
                  :class="flag.active ? 'bg-emerald-900/20 border-emerald-700/40 text-emerald-400' : 'bg-neutral-800/40 border-neutral-700 text-neutral-600'"
                >
                  {{ flag.label }}
                </button>
              </div> -->

              <!-- <div class="flex items-center gap-1" @click.stop @contextmenu.prevent="openMenu($event, { name: 'cockpit_vol_' + row.name, label: row.name + ' Volume' })">
                <button @click.stop="row.toggleMute()" :title="row.muted ? 'Unmute' : 'Mute'" class="shrink-0 text-neutral-400 hover:text-neutral-200">
                  <VolumeX v-if="row.muted" class="w-3 h-3" />
                  <Volume2 v-else class="w-3 h-3" />
                </button>
                <input type="range" min="0" max="1" step="0.01" :value="row.vol"
                  @input="row.setVol(parseFloat($event.target.value))"
                  class="w-full accent-synth-neon h-1"
                />
              </div> -->

              <div class="flex items-center gap-1 mt-auto">
                <button v-if="row.hasSoundEngineLink" @click.stop="openSoundEngine" title="Open Sound Engine"
                  class="p-1 rounded border border-neutral-700 text-neutral-400 hover:text-synth-neon hover:border-synth-neon/50 transition-colors"
                >
                  <ExternalLink class="w-3 h-3" />
                </button>
                <button @click.stop="openInProgramChange(row)" title="Open in Program Change"
                  class="p-1 rounded border border-neutral-700 text-neutral-400 hover:text-violet-400 hover:border-violet-700 transition-colors"
                >
                  <Cable class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Apps (right) ── -->
      <div class="mr-4 w-28 shrink-0 flex flex-col gap-2 justify-start overflow-y-auto custom-scrollbar border-neutral-800 pl-3">
        <p class="text-[8px] font-black uppercase bg-black py-1 tracking-widest text-neutral-600 text-center mb-0.5">Apps</p>
        <button
          v-for="(a, idx) in apps" :key="a.sourceId"
          @click="activateApp(a)"
          @mouseenter="hoverApp(a)"
          @mouseleave="clearHover"
          :disabled="!a.panelId"
          class="relative rounded-lg border-3 p-2 flex flex-col items-center gap-1 text-center bg-neutral-900 border-black transition-colors"
          :class="[
            a.panelId ? 'hover:border-violet-700 hover:bg-neutral-800' : 'opacity-50 cursor-default',
            focusRing('apps', idx),
          ]"
        >
          <!-- <ChevronLeft class="w-3 h-3 text-neutral-700 absolute top-1/2 -left-2.5 -translate-y-1/2" /> -->
          <div class="w-8 h-8 rounded-md flex items-center justify-center bg-black/40 text-violet-400">
            <component :is="a.icon" class="w-4 h-4" />
          </div>
          <p class="text-[9px] font-bold text-neutral-300 truncate w-full">{{ a.name }}</p>
        </button>

        <!-- Extra apps not on the MIDI Flow canvas (e.g. Playlist) — always visible -->
        <button
          v-for="a in EXTRA_APPS" :key="a.id"
          @click="selectApp({ kind: a.kind })"
          class="relative rounded-lg border-3 p-2 flex flex-col items-center gap-1 text-center bg-neutral-900 border-black transition-colors hover:border-violet-700 hover:bg-neutral-800"
        >
          <div class="w-8 h-8 rounded-md flex items-center justify-center bg-black/40 text-violet-400">
            <component :is="a.icon" class="w-4 h-4" />
          </div>
          <p class="text-[9px] font-bold text-neutral-300 truncate w-full">{{ a.name }}</p>
        </button>
      </div>

    </div>
  </div>
  <img src="/sycore-lab.png" class="absolute bottom-2 right-1 rounded-lg w-16 opacity-80 pointer-events-none select-none" />

  <!-- ── On-screen nav cluster — same 4 zones as MIDI buttons/encoders below,
       so mouse and hardware share one useCockpitNavigation instance. Each
       button is also its own right-click MIDI Learn target. ── -->

  <div class="flex items-center gap-3 absolute bottom-1 w-full justify-between px-22">
    <!-- PANIC (bottom center) -->
    <button @click="midiStore.panic()" title="Panic — All Notes Off"
      class="bottom-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded border border-rose-600/50 bg-rose-950/50 text-rose-400 hover:bg-red-950/80 hover:border-rose-500 transition-colors"
      :class="focusRing('display', DISPLAY_PANIC_IDX)"
    >
      <AlertTriangle class="w-3 h-3" /> Panic
    </button>
    <div class="bottom-1 justify-center z-40 flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
    <div class="flex items-center gap-0.5 bg-black/70 rounded-full border border-neutral-800 px-1 py-0.5">
      <span class="text-[11px] font-mono text-neutral-600 px-0.5">Z</span>
      <button @click="nav.moveZone(-1)"
        @contextmenu.prevent="openMenu($event, { name: 'cockpit_nav_prev_zone', label: 'Cockpit: Prev Zone' })"
        title="Prev zone" class="p-1 text-neutral-400 hover:text-synth-neon transition-colors"
      ><ChevronLeft class="w-5 h-5" /></button>
      <button
        @contextmenu.prevent="openMenu($event, { name: 'cockpit_nav_zone_encoder', label: 'Cockpit: Zone Encoder' })"
        title="Zone encoder — right-click to Learn a rotary encoder" class="p-1 text-neutral-500 hover:text-amber-400 cursor-default transition-colors"
      ><RotateCw class="w-5 h-5" /></button>
      <button @click="nav.moveZone(1)"
        @contextmenu.prevent="openMenu($event, { name: 'cockpit_nav_next_zone', label: 'Cockpit: Next Zone' })"
        title="Next zone" class="p-1 text-neutral-400 hover:text-synth-neon transition-colors"
      ><ChevronRight class="w-5 h-5" /></button>
    </div>
    <div class="flex items-center gap-0.5 bg-black/70 rounded-full border border-neutral-800 px-1 py-0.5">
      <span class="text-[11px] font-mono text-neutral-600 px-0.5">I</span>
      <button @click="nav.moveItem(-1)"
        @contextmenu.prevent="openMenu($event, { name: 'cockpit_nav_prev_item', label: 'Cockpit: Prev Item' })"
        title="Prev item" class="p-1 text-neutral-400 hover:text-synth-neon transition-colors"
      ><ChevronLeft class="w-5 h-5" /></button>
      <button
        @contextmenu.prevent="openMenu($event, { name: 'cockpit_nav_item_encoder', label: 'Cockpit: Item Encoder' })"
        title="Item encoder — right-click to Learn a rotary encoder" class="p-1 text-neutral-500 hover:text-amber-400 cursor-default transition-colors"
      ><RotateCw class="w-5 h-5" /></button>
      <button @click="nav.moveItem(1)"
        @contextmenu.prevent="openMenu($event, { name: 'cockpit_nav_next_item', label: 'Cockpit: Next Item' })"
        title="Next item" class="p-1 text-neutral-400 hover:text-synth-neon transition-colors"
      ><ChevronRight class="w-5 h-5" /></button>
    </div>
    <button @click="nav.selectCurrent()"
      @contextmenu.prevent="openMenu($event, { name: 'cockpit_nav_select', label: 'Cockpit: Select' })"
      title="Select / Activate" class="p-1.5 rounded-full bg-synth-neon/10 border border-synth-neon/40 text-synth-neon hover:bg-synth-neon/20 transition-colors"
    ><CircleDot class="w-5 h-5" /></button>
        
    </div>
    <!-- MIDI Flow (bottom-right) -->
        <button @click="openMidiFlow"
        class="right-20 bottom-1 text-[10px] flex items-center gap-1 px-2 py-1 rounded border border-synth-neon/40 text-synth-neon/90 hover:text-white hover:border-synth-neon transition-colors bg-synth-neon/40"
        :class="focusRing('display', DISPLAY_MIDIFLOW_IDX)"
            >
                <Network class="w-3 h-3" /> MIDI Flow
        </button>

        
  </div>
</template>
