<script setup>
import { ref, computed } from 'vue'
import { Circle, Cable, ExternalLink, Volume2, VolumeX, Network, ChevronUp, Play, Square, AlertTriangle } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { useUiStore } from '@/stores/useUiStore'
import { useAudioMixerStore } from '@/stores/useAudioMixerStore'
import { useArpStore } from '@/stores/useArpStore'
import { useSyncStore } from '@/stores/useSyncStore'
import { useMidiFlowConfigsStore } from '@/stores/useMidiFlowConfigsStore'
import { useDeviceRegistry } from '@/composables/useDeviceRegistry'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { useDeviceImages } from '@/composables/useDeviceImages'
import { useGlobalTransportControls } from '@/composables/useGlobalTransportControls'
import { MidiSource } from '@/core/midi/midi-service'
import { typeMeta } from '@/lib/device-type-meta'
import { MIDI_APPS, APP_PANEL_ID } from '@/lib/midi-apps'
import { dispatch } from '@/types/events'
import MiniAudioScope from '@/components/MiniAudioScope.vue'

const midiStore = useMidiStore()
const uiStore   = useUiStore()
const mixer     = useAudioMixerStore()
const arpStore  = useArpStore()
const syncStore = useSyncStore()
const midiFlowConfigsStore = useMidiFlowConfigsStore()
const { devices: registryDevices } = useDeviceRegistry()
const { openMenu } = useMidiContextMenu()
const { images: deviceImages } = useDeviceImages()
const { transportManager, playAll, stopAll } = useGlobalTransportControls()

const FLAG_FIELDS = [
  { key: 'midiThru',  label: 'Thru' },
  { key: 'clock',     label: 'Clock' },
  { key: 'transport', label: 'Transp' },
]

// Same four apps TransportBar.vue's "Sync Apps to Transport" panel toggles —
// shown here as clickable status badges next to the global Play button.
const SYNC_APPS = [
  { key: 'syncSequencerToTransport',    label: 'Sequencer' },
  { key: 'syncChordProgToTransport',    label: 'Chord Prog' },
  { key: 'syncDrumMachineToTransport',  label: 'Drum Machine' },
  { key: 'syncBackingTrackToTransport', label: 'Backing Track' },
]

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

function openApp(app) {
  if (app.panelId) uiStore.openPanel(app.panelId)
}

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

const hoveredTarget = ref(null)   // { kind: 'controller' | 'app' | 'port', name?, sourceId? }

function hoverController(c) {
  hoveredTarget.value = { kind: c.isVirtualOutputPort ? 'port' : 'controller', name: c.name }
}
function hoverApp(a) {
  hoveredTarget.value = { kind: 'app', sourceId: a.sourceId }
}
function clearHover() {
  hoveredTarget.value = null
}

const highlightedInstrumentNames = computed(() => {
  const t = hoveredTarget.value
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
})

// ── Instruments (bottom row) — everything that isn't a controller: hardware
// + virtual instruments. Rows are built from the same reactive sources MIDI
// Flow itself reads/writes, so anything changed elsewhere (Program Change
// panel, MIDI Flow, Audio Mixer) shows up here live. ──
const instruments = computed(() => {
  const uiOutputs = midiStore.routingMatrix[MidiSource.UI] ?? []

  return Object.values(midiStore.routingConfig?.registrations ?? {})
    .filter(reg => deviceType(reg.name) !== 'controller')
    .map(reg => {
      const isVirtual = midiStore.virtualInstruments.some(v => v.name === reg.name)
      const type = deviceType(reg.name)
      const online = isVirtual || registryDevices.value.some(d => d.name === reg.name && d.online)

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
    // Real instruments (single/multi) grouped before virtual instruments, alphabetical within each group.
    }).sort((a, b) => Number(a.type === 'virtual') - Number(b.type === 'virtual') || a.name.localeCompare(b.name))
})

function toggleFlag(row, flag) {
  midiStore.updateRegistration(row.name, flag.key, !flag.active)
}

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
  selected.value = { name: row.name, channel: null }
  dispatch('device-pc-select', { deviceName: row.name })
}

// A specific patch/channel line in the display's list — sets both the
// device AND that exact channel in Program Change (still without opening
// it), so multi-timbral devices land on the right part, not just channel 0.
function selectInstrumentChannel(row, cp) {
  selected.value = { name: row.name, channel: cp.channel }
  dispatch('device-pc-select', { deviceName: row.name, channel: cp.channel })
}

// The dedicated "Select in Program Change" button — this one DOES bring
// the panel to the front, unlike the passive card/list clicks above.
function openInProgramChange(row) {
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

    <div v-else class="flex-1 min-h-0 flex gap-3 p-3 overflow-hidden cockpit-root">

      <!-- ── Controllers (left) ── -->
      <div class="ml-4 w-28 shrink-0 flex flex-col gap-2 justify-start overflow-y-auto custom-scrollbar border-neutral-800 pr-3">
        <p class="text-[8px] font-black uppercase tracking-widest text-neutral-600 bg-black py-1 text-center mb-0.5">Controllers</p>
        <div v-if="controllers.length === 0" class="text-[9px] text-neutral-700 italic text-center">None</div>
        <div v-for="c in controllers" :key="c.name"
          @mouseenter="hoverController(c)"
          @mouseleave="clearHover"
          class="rounded-lg border-3 p-2 flex flex-col items-center gap-1 text-center transition-colors cursor-pointer"
          :class="c.online ? 'bg-neutral-900 border-black hover:border-sky-700' : 'bg-neutral-950 border-black opacity-60'"
        >
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
        <div class="display-glass relative rounded-xl border-2 border-black bg-black overflow-hidden shadow-2xl p-3 flex flex-col shrink-0 h-1/2 h-min-1/2">
          <!-- Hardware screen effect overlays — decorative only, must not carry real content or backgrounds (they'd override the ones above) -->
          <div class="absolute inset-0 z-20 pointer-events-none glass-reflection"></div>
          <div class="absolute inset-0 z-10 pointer-events-none scanlines"></div>

          <div class="relative z-30 flex flex-col flex-1 min-h-0 gap-2">
          <div class="flex items-start justify-between">
            <!-- BPM (top-left) -->
            <div class="flex items-center gap-1" @contextmenu.prevent="openMenu($event, { name: 'global_bpm', label: 'Global BPM' })">
              <span class="text-[8px] text-neutral-600">BPM</span>
              <input
                type="number" min="20" max="300"
                :value="arpStore.arpBpm"
                @change="handleBpmChange"
                class="w-14 bg-black border border-neutral-800 rounded px-1 py-0.5 text-center text-synth-neon text-[12px] focus:outline-none focus:border-synth-neon transition-colors"
              />
            </div>
            <button @click="openMidiFlow"
        class="text-[10px] flex items-center gap-1 px-2 py-1 rounded border border-synth-neon/40 text-synth-neon/70 hover:text-synth-neon hover:border-synth-neon transition-colors"
      >
        <Network class="w-3 h-3" /> MIDI Flow
      </button>
            <!-- PANIC (top-right) -->
            <button @click="midiStore.panic()" title="Panic — All Notes Off"
              class="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded border border-rose-600/50 bg-rose-950/20 text-rose-400 hover:bg-rose-950/40 hover:border-rose-500 transition-colors"
            >
              <AlertTriangle class="w-3 h-3" /> Panic
            </button>
          </div>

          <div class="flex-1 min-h-0 flex items-start gap-3">
            <div class="shrink-0 w-42 flex flex-col items-center gap-1.5">
              <span class="text-sm font-mono uppercase tracking-[0.35em] text-synth-neon/80">SY.CORE</span>
              <MiniAudioScope class="h-24 w-full" />
            </div>

            <!-- Current instrument patches + active channels -->
            <div class="flex-1 min-w-0 h-full overflow-y-auto custom-scrollbar bg-sky-900/40 p-1 rounded-lg text-[9px] font-mono border-l border-neutral-700 pl-3">
              <p v-if="instruments.length === 0" class="text-neutral-700 italic text-center pt-2">No instruments routed</p>
              <template v-for="row in instruments" :key="row.name">
                <div v-for="(cp, idx) in row.channelPatchList" :key="row.name + ':' + cp.channel"
                  @click="selectInstrumentChannel(row, cp)"
                  title="Select this device/channel in Program Change"
                  class="flex items-center gap-2 py-0.5 border-b font-mono text-[11px] transition-colors cursor-pointer hover:bg-white/5"
                  :class="isSelected(row.name, cp.channel) ? 'border-violet-700/50 bg-violet-500/10' : 'border-neutral-900/60'"
                >
                  <Circle v-if="idx === 0" class="w-1.5 h-1.5 fill-current shrink-0" :class="row.online ? 'text-emerald-400' : 'text-neutral-600'" />
                  <span v-else class="w-1.5 h-1.5 shrink-0"></span>
                  <span class="truncate text-neutral-500 w-42 shrink-0" :title="row.name">{{ idx === 0 ? row.name : '' }}</span>
                  <span class="truncate flex-1 min-w-0 text-sky-400" :class="cp.patchName ? 'text-neutral-400' : 'text-neutral-700 italic'">
                    {{ cp.patchName ?? 'No preset' }} {{ cp.patchCategory ? '(' + cp.patchCategory + ')' : '' }}
                  </span>
                  <span class="shrink-0 text-synth-neon/70">CH {{ cp.channel }}</span>
                </div>
              </template>
            </div>
          </div>

          <!-- PLAY / Transport (bottom-left) -->
          <div class="flex items-center justify-between">
            <button
              @click="transportManager.isRunning.value ? stopAll() : playAll()"
              @contextmenu.prevent="openMenu($event, { name: 'transport-play-all', label: transportManager.isRunning.value ? 'Stop All' : 'Play All' })"
              class="flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all active:scale-95"
              :class="transportManager.isRunning.value
                ? 'text-red-400 border-red-500/40 bg-red-500/10 hover:bg-red-500/20'
                : 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20'"
            >
              <component :is="transportManager.isRunning.value ? Square : Play" class="w-3 h-3 fill-current" />
              <span>{{ transportManager.isRunning.value ? 'Stop' : 'Play' }}</span>
            </button>

            <!-- Synced apps (click to toggle sync to the global transport) -->
            <div class="flex items-center gap-1">
              <button
                v-for="s in SYNC_APPS" :key="s.key"
                @click="syncStore[s.key] = !syncStore[s.key]"
                :title="(syncStore[s.key] ? 'Synced: ' : 'Not synced: ') + s.label"
                class="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded border transition-colors"
                :class="syncStore[s.key]
                  ? 'bg-violet-800/50 border-violet-700/40 text-emerald-400'
                  : 'bg-violet-800/20 border-neutral-700 text-neutral-600'"
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
        <div class="flex justify-center min-h-0 overflow-x-auto overflow-y-hidden custom-scrollbar">
          <div v-if="instruments.length === 0" class="text-[10px] text-neutral-700 italic text-center pt-4">No instruments routed</div>
          <div v-else class="display-glass relative shadow-lg h-full bg-black/60 flex gap-2 w-full justify-center p-2 rounded-lg border border-black">
            <div
              v-for="row in instruments"
              :key="row.name"
              @click="selectInstrument(row)"
              title="Select in Program Change"
              class="relative w-42 shrink-0 rounded-xl border-2 p-2.5 flex flex-col gap-1.5 transition-colors max-h-48 cursor-pointer"
              :class="[
                row.meta.card,
                !row.online ? 'opacity-60' : '',
                highlightedInstrumentNames.has(row.name) ? 'ring-2 ring-synth-neon border-synth-neon bg-synth-neon/10' : '',
                isSelected(row.name) ? 'ring-2 ring-violet-400 border-violet-400' : '',
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

              <div>
                <p v-if="row.patchName" class="text-[9px] text-neutral-300 truncate">{{ row.patchName }}</p>
                <p v-else class="text-[9px] text-neutral-600 italic">No preset</p>
                <span v-if="row.patchCategory" class="inline-block mt-0.5 text-[8px] px-1 rounded bg-violet-900/30 text-violet-400 border border-violet-900/30">
                  {{ row.patchCategory }}
                </span>
              </div>

              <div class="flex gap-1">
                <button
                  v-for="flag in row.flags" :key="flag.key"
                  @click.stop="toggleFlag(row, flag)"
                  class="text-[8px] font-mono uppercase px-1 py-0.5 rounded border transition-colors"
                  :class="flag.active ? 'bg-emerald-900/20 border-emerald-700/40 text-emerald-400' : 'bg-neutral-800/40 border-neutral-700 text-neutral-600'"
                >
                  {{ flag.label }}
                </button>
              </div>

              <div class="flex items-center gap-1" @click.stop @contextmenu.prevent="openMenu($event, { name: 'cockpit_vol_' + row.name, label: row.name + ' Volume' })">
                <button @click.stop="row.toggleMute()" :title="row.muted ? 'Unmute' : 'Mute'" class="shrink-0 text-neutral-400 hover:text-neutral-200">
                  <VolumeX v-if="row.muted" class="w-3 h-3" />
                  <Volume2 v-else class="w-3 h-3" />
                </button>
                <input type="range" min="0" max="1" step="0.01" :value="row.vol"
                  @input="row.setVol(parseFloat($event.target.value))"
                  class="w-full accent-synth-neon h-1"
                />
              </div>

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
          v-for="a in apps" :key="a.sourceId"
          @click="openApp(a)"
          @mouseenter="hoverApp(a)"
          @mouseleave="clearHover"
          :disabled="!a.panelId"
          class="relative rounded-lg border-3 p-2 flex flex-col items-center gap-1 text-center bg-neutral-900 border-black transition-colors"
          :class="a.panelId ? 'hover:border-violet-700 hover:bg-neutral-800' : 'opacity-50 cursor-default'"
        >
          <!-- <ChevronLeft class="w-3 h-3 text-neutral-700 absolute top-1/2 -left-2.5 -translate-y-1/2" /> -->
          <div class="w-8 h-8 rounded-md flex items-center justify-center bg-black/40 text-violet-400">
            <component :is="a.icon" class="w-4 h-4" />
          </div>
          <p class="text-[9px] font-bold text-neutral-300 truncate w-full">{{ a.name }}</p>
        </button>
      </div>

    </div>
  </div>
  <img src="/sycore-lab.png" class="absolute bottom-1 right-14 w-22 opacity-70 pointer-events-none select-none" />
</template>
