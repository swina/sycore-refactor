<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { SlidersHorizontal, Volume2, VolumeX, Settings2, Activity, Save, FilePlus, FolderOpen, X, Trash2 } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { useAudioMixerStore } from '@/stores/useAudioMixerStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useAudioMixerChannels } from '@/composables/useAudioMixerChannels'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { loadMixerConfigs, persistMixerConfigs, createMixerConfig } from '@/lib/audio-mixer-configs'
import { typeMeta } from '@/lib/device-type-meta'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'

const emit = defineEmits(['close'])

const uiStore    = useUiStore()
const mixer      = useAudioMixerStore()
const mappingStore = useMappingStore()
const { openMenu } = useMidiContextMenu()
const { availableSources, flatChannels } = useAudioMixerChannels()

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } =
  useDraggableResizable({
    storageKey:    'S1_AUDIO_MIXER_DR',
    minimizeLabel: 'Audio Mixer',
    openRef:       () => uiStore.isAudioMixerOpen,
    initialWidth:  480,
    initialHeight: 420,
    minWidth:      280,
    minHeight:     340,
    zIndex:        180,
    panelId:       'audio-mixer',
  })

const showAssign = ref(false)

// Only the 16 slots that resolve to a live source, each carrying its
// 1-based slot number for the "CH n" label — the mixer's unified fader view.
const assignedChannels = computed(() =>
  flatChannels.value
    .map((ch, i) => ch ? { ...ch, slotNum: i + 1 } : null)
    .filter(Boolean)
)

const sourcesByGroup = computed(() => {
  const groups = {}
  for (const s of availableSources.value) {
    if (!groups[s.group]) groups[s.group] = []
    groups[s.group].push(s)
  }
  return groups
})

function slotValue(assignment) {
  return assignment ? `${assignment.type}::${assignment.id}` : ''
}

function onAssignChange(slotIdx, e) {
  const val = e.target.value
  if (!val) { mixer.clearChannelSlot(slotIdx); return }
  const i = val.indexOf('::')
  mixer.assignChannelSlot(slotIdx, { type: val.slice(0, i), id: val.slice(i + 2) })
}

// ── Save / Update / Load configurations ───────────────────────────────────────
const configs = ref([])
const activeConfigId = ref('')
const activeConfig = computed(() => configs.value.find(c => c.id === activeConfigId.value) ?? null)
const showLoadConfigs = ref(false)

onMounted(async () => {
  configs.value = await loadMixerConfigs()
})

function snapshotChannels() {
  return mixer.channelSlots.map((slot, i) => {
    const ch = flatChannels.value[i]
    return { slot, vol: ch ? ch.vol() : 0.8, muted: ch ? ch.muted() : false }
  })
}

function applyConfig(cfg) {
  mixer.channelSlots = cfg.channels.map(c => c.slot)
  // channelSlots changing is what makes flatChannels re-resolve — wait one
  // tick so the per-slot setVol/toggleMute calls below hit the newly
  // resolved channels, not the previous assignment's.
  nextTick(() => {
    cfg.channels.forEach((c, i) => {
      const ch = flatChannels.value[i]
      if (!ch) return
      ch.setVol(c.vol)
      if (ch.muted() !== c.muted) ch.toggleMute()
    })
  })
  mixer.setMasterVol(cfg.masterVol)
}

async function saveConfigUpdate() {
  if (!activeConfig.value) { await saveConfigAs(); return }
  activeConfig.value.channels  = snapshotChannels()
  activeConfig.value.masterVol = mixer.masterVol
  activeConfig.value.updatedAt = Date.now()
  await persistMixerConfigs(configs.value)
}

async function saveConfigAs() {
  const name = prompt('Configuration name:')
  if (!name) return
  const cfg = createMixerConfig(name, { channels: snapshotChannels(), masterVol: mixer.masterVol })
  configs.value.push(cfg)
  activeConfigId.value = cfg.id
  await persistMixerConfigs(configs.value)
}

function loadConfig(id) {
  const cfg = configs.value.find(c => c.id === id)
  if (!cfg) return
  applyConfig(cfg)
  activeConfigId.value = id
  showLoadConfigs.value = false
}

async function deleteConfig(id) {
  if (!confirm('Delete this configuration?')) return
  configs.value = configs.value.filter(c => c.id !== id)
  if (activeConfigId.value === id) activeConfigId.value = ''
  await persistMixerConfigs(configs.value)
}

// ── Per-channel styling — catalog channels use the color-keyed C map,
// instrument/virtual channels use device-type-meta's classes (matching MIDI
// FLOW's coloring), unified here so the single fader-strip template below
// doesn't need to branch on `kind` more than once per helper. ─────────────
function chDeviceKind(ch) { return ch.kind === 'instrument' ? ch.deviceType : 'virtual' }
function chText(ch)  { return ch.kind === 'catalog' ? (C[ch.color]?.text ?? 'text-neutral-400') : typeMeta(chDeviceKind(ch)).text }
function chTrack(ch) { return ch.kind === 'catalog' ? (C[ch.color]?.track ?? 'bg-neutral-400') : (TYPE_FILL[chDeviceKind(ch)] ?? TYPE_FILL['instrument-single']) }
function chFill(ch)  { return ch.muted() ? 'bg-neutral-700' : chTrack(ch) }
function chThumb(ch) { return ch.muted() ? 'bg-neutral-700 opacity-40' : (ch.kind === 'catalog' ? 'bg-neutral-200' : ch.kind === 'virtual' ? 'bg-amber-200' : 'bg-rose-500') }
function chMuteBtnClass(ch) {
  if (!ch.muted()) return 'border-neutral-700 text-neutral-500 hover:text-white hover:border-neutral-500'
  return ch.kind === 'catalog' ? (C[ch.color]?.muted ?? 'bg-red-500/20 text-red-300 border-red-500/30') : (TYPE_MUTED[chDeviceKind(ch)] ?? TYPE_MUTED['instrument-single'])
}

// ── Pointer-capture vertical fader drag ───────────────────────────────────────
const FADER_H = 140  // px — must match the style="height: 140px" on the track div

function startFaderDrag(e, setVol, getMuted) {
  if (getMuted()) return
  e.preventDefault()
  e.stopPropagation()
  const trackEl = e.currentTarget
  trackEl.setPointerCapture(e.pointerId)
  const rect = trackEl.getBoundingClientRect()

  function update(ev) {
    const y   = ev.clientY - rect.top
    const raw = 1 - Math.max(0, Math.min(1, y / rect.height))
    setVol(Math.round(raw * 100) / 100)
  }

  function onMove(ev) { update(ev) }
  function onUp()     {
    trackEl.removeEventListener('pointermove', onMove)
    trackEl.removeEventListener('pointerup',   onUp)
  }

  trackEl.addEventListener('pointermove', onMove)
  trackEl.addEventListener('pointerup',   onUp)
  update(e)
}

// ── Display helpers ───────────────────────────────────────────────────────────
function toDb(v) {
  if (v <= 0) return '-∞'
  const db = 20 * Math.log10(v)
  return (db >= 0 ? '+' : '') + db.toFixed(1) + ' dB'
}
function toPct(v) { return Math.round(v * 100) + '%' }

// Thumb bottom offset: 4px bottom padding + fill height, clamped so thumb stays on track
function thumbBottom(vol) { return 4 + vol * (FADER_H - 8) - 6 }

// ── Color map (full Tailwind strings so purge keeps them) ─────────────────────
const C = {
  cyan:       { track: 'bg-cyan-400',    text: 'text-cyan-400',    muted: 'bg-cyan-400/20 text-cyan-300 border-cyan-500/30',       check: 'border-cyan-500 bg-cyan-500/10 text-cyan-300' },
  violet:     { track: 'bg-violet-400',  text: 'text-violet-400',  muted: 'bg-violet-400/20 text-violet-300 border-violet-500/30', check: 'border-violet-500 bg-violet-500/10 text-violet-300' },
  'synth-neon':{ track: 'bg-synth-neon', text: 'text-synth-neon',  muted: 'bg-green-400/20 text-green-300 border-green-500/30',    check: 'border-green-500 bg-green-500/10 text-green-300' },
  fuchsia:    { track: 'bg-fuchsia-400', text: 'text-fuchsia-400', muted: 'bg-fuchsia-400/20 text-fuchsia-300 border-fuchsia-500/30', check: 'border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-300' },
  orange:     { track: 'bg-orange-400',  text: 'text-orange-400',  muted: 'bg-orange-400/20 text-orange-300 border-orange-500/30', check: '' },
  rose:       { track: 'bg-rose-400',    text: 'text-rose-400',    muted: 'bg-rose-400/20 text-rose-300 border-rose-500/30',       check: 'border-rose-500 bg-rose-500/10 text-rose-300' },
  emerald:    { track: 'bg-emerald-400', text: 'text-emerald-400', muted: 'bg-emerald-400/20 text-emerald-300 border-emerald-500/30', check: 'border-emerald-500 bg-emerald-500/10 text-emerald-300' },
  sky:        { track: 'bg-sky-400',     text: 'text-sky-400',     muted: 'bg-sky-400/20 text-sky-300 border-sky-500/30',           check: 'border-sky-500 bg-sky-500/10 text-sky-300' },
}

// ── Instrument-channel "muted button" styles, matching MIDI FLOW's device-
// type colors (DEVICE_TYPE_META) for Instrument (Single/Multi) and Virtual
// Instrument — full literal Tailwind strings so purge keeps them.
const TYPE_MUTED = {
  'instrument-single': 'bg-rose-400/20 text-rose-300 border-rose-500/30',
  'instrument-multi':  'bg-violet-400/20 text-violet-300 border-violet-500/30',
  virtual:              'bg-red-700/20 text-amber-400 border-amber-500/30',
}

// Fader fill/thumb color — more saturated than DEVICE_TYPE_META's own
// icon/label rose-300 (that stays as-is for MIDI FLOW parity); the mixer's
// actual slider reads better with a stronger red-leaning rose.
const TYPE_FILL = {
  'instrument-single': 'bg-rose-500',
  'instrument-multi':  'bg-violet-400',
  virtual:              'bg-amber-400',
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sy-modal">
      <div
        v-show="uiStore.isAudioMixerOpen && !isMinimized"
        :style="panelStyle"
        class="fixed bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        @mousedown.capture="bringToFront"
      >
        <!-- Header ────────────────────────────────────────────────────── -->
        <div
          class="shrink-0 flex items-center gap-2 px-4 py-4 border-b border-neutral-800 bg-neutral-900/60 cursor-grab active:cursor-grabbing"
          @mousedown.stop="onDragStart"
        >
          <SlidersHorizontal class="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span class="text-[14px] font-mono font-bold uppercase tracking-widest text-synth-neon select-none">Audio Mixer</span>

          <!-- Current configuration chip -->
          <div
            class="flex items-center gap-1 px-2 py-1 rounded-md bg-neutral-900/60 border text-[9px] font-mono max-w-[110px] overflow-hidden"
            :class="activeConfig ? 'border-synth-neon/20 text-synth-neon' : 'border-neutral-800 text-neutral-600'"
            :title="activeConfig?.name || 'No configuration loaded'"
          >
            <span class="truncate">{{ activeConfig?.name || 'Unsaved' }}</span>
          </div>

          <div class="flex-1" />

          <!-- Save (update) -->
          <button
            @click.stop="saveConfigUpdate"
            :disabled="!activeConfig"
            title="Save (update current configuration)"
            class="p-1.5 rounded-md text-neutral-500 hover:text-synth-neon hover:bg-synth-neon/10 transition-colors active:scale-90 disabled:opacity-25 disabled:cursor-not-allowed"
          >
            <Save class="w-3.5 h-3.5" />
          </button>
          <!-- Save As -->
          <button
            @click.stop="saveConfigAs"
            title="Save as new configuration"
            class="p-1.5 rounded-md text-neutral-500 hover:text-synth-neon hover:bg-synth-neon/10 transition-colors active:scale-90"
          >
            <FilePlus class="w-3.5 h-3.5" />
          </button>
          <!-- Load -->
          <button
            @click.stop="showLoadConfigs = true"
            title="Load saved configuration"
            class="p-1.5 rounded-md text-neutral-500 hover:text-synth-neon hover:bg-synth-neon/10 transition-colors active:scale-90"
          >
            <FolderOpen class="w-3.5 h-3.5" />
          </button>

          <div class="w-px h-4 bg-neutral-800 mx-0.5" />

          <button
            @click.stop="showAssign = !showAssign"
            :class="['p-1.5 transition-colors rounded-full hover:bg-white/5', showAssign ? 'text-amber-400' : 'text-neutral-500 hover:text-white']"
            title="Channel assignments"
          >
            <Settings2 class="w-3.5 h-3.5" />
          </button>
          <button
            @click.stop="uiStore.openPanel('visualizer')"
            class="p-1.5 transition-colors rounded-full hover:bg-white/5 text-neutral-500 hover:text-white"
            title="Audio Visualizer"
          >
            <Activity class="w-3.5 h-3.5" />
          </button>
          <div class="flex items-center gap-1 pointer-events-auto">
            <MacOsButtons @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize" />
          </div>
        </div>

        <!-- Channel assignments overlay ───────────────────────────────── -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 -translate-y-1"
          leave-active-class="transition-all duration-150 ease-in"
          leave-to-class="opacity-0 -translate-y-1"
        >
          <div v-if="showAssign" class="shrink-0 border-b border-neutral-800 bg-neutral-900/90 px-4 py-3 space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
            <p class="text-[9px] font-black uppercase tracking-widest text-neutral-500 mb-2 select-none">
              Assign a source to each numbered channel
            </p>
            <div
              v-for="(slot, i) in mixer.channelSlots"
              :key="i"
              class="flex items-center gap-2"
            >
              <span class="w-12 shrink-0 text-[9px] font-mono font-bold text-neutral-400">CH {{ i + 1 }}</span>
              <select
                :value="slotValue(slot)"
                @change="onAssignChange(i, $event)"
                class="flex-1 min-w-0 bg-neutral-800 border border-neutral-700 rounded px-1.5 py-1 text-[10px] font-mono text-white outline-none focus:border-violet-500"
              >
                <option value="">— None —</option>
                <optgroup v-for="(sources, group) in sourcesByGroup" :key="group" :label="group">
                  <option v-for="s in sources" :key="s.type + '::' + s.id" :value="s.type + '::' + s.id">{{ s.label }}</option>
                </optgroup>
              </select>
            </div>
          </div>
        </Transition>

        <!-- Fader strips ──────────────────────────────────────────────── -->
        <div class="flex-1 flex items-stretch min-h-0 overflow-x-auto custom-scrollbar">

          <!-- Empty state -->
          <div
            v-if="assignedChannels.length === 0"
            class="flex-1 flex flex-col items-center justify-center gap-2 text-neutral-600 p-6"
          >
            <Settings2 class="w-6 h-6 opacity-40" />
            <p class="text-[10px] font-bold uppercase tracking-widest text-center select-none">No channels assigned</p>
            <p class="text-[9px] text-neutral-700 text-center select-none">
              Click <span class="text-amber-500">⚙</span> above to assign channels 1–16.
            </p>
          </div>

          <template v-else>

            <!-- Per-channel strip (unified: app sources, MIDI instruments, virtual instruments) -->
            <div
              v-for="ch in assignedChannels"
              :key="ch.id"
              class="flex-1 flex flex-col items-center gap-2 py-4 px-2 border-r border-neutral-800/60"
              style="min-width: 56px;"
            >
              <component :is="ch.icon" :class="['w-4 h-4 shrink-0', chText(ch)]" />

              <div class="text-center select-none w-full px-1">
                <div class="text-[9px] font-black text-neutral-500 tracking-wider leading-none">CH {{ ch.slotNum }}</div>
                <div class="text-[10px] font-black uppercase tracking-wider text-white leading-none truncate mt-0.5" :title="ch.label">
                  {{ ch.label.length > 8 ? ch.label.slice(0, 7) + '…' : ch.label }}
                </div>
                <div class="text-[8px] text-neutral-600 font-mono leading-none mt-0.5 truncate">{{ ch.sub }}</div>
              </div>

              <!-- dB readout -->
              <div :class="['text-[9px] font-mono font-bold select-none', ch.kind === 'instrument' && ch.noCC7() ? 'text-amber-500' : ch.muted() ? 'text-neutral-600' : chText(ch)]">
                {{ ch.kind === 'instrument' && ch.noCC7() ? 'EXT' : ch.muted() ? 'MUTE' : toDb(ch.vol()) }}
              </div>

              <!-- ── Fader track (pointer-capture drag) ── -->
              <div class="flex-1 flex items-center justify-center w-full">
                <div
                  :class="['relative rounded', ch.kind === 'instrument' && ch.noCC7() ? 'opacity-25 cursor-not-allowed' : 'cursor-ns-resize', ch.volParam && mappingStore.mappedParams?.has(ch.volParam) ? 'ring-1 ring-amber-500/50' : '']"
                  style="height: 140px; width: 28px; touch-action: none;"
                  @pointerdown="ch.kind !== 'instrument' || !ch.noCC7() ? startFaderDrag($event, ch.setVol, ch.muted) : null"
                  @contextmenu.prevent="ch.volParam && openMenu($event, { name: ch.volParam, label: ch.label + ': Volume' })"
                >
                  <!-- Groove -->
                  <div class="absolute rounded-full bg-neutral-800"
                    style="width:6px; top:4px; bottom:4px; left:50%; transform:translateX(-50%)" />
                  <!-- Fill -->
                  <div
                    :class="['absolute rounded-full transition-none', chFill(ch)]"
                    :style="{ width: '6px', bottom: '4px', left: '50%', transform: 'translateX(-50%)', height: (ch.vol() * 132) + 'px' }"
                  />
                  <!-- Thumb -->
                  <div
                    :class="['absolute rounded-sm border border-neutral-500 shadow-md pointer-events-none', chThumb(ch)]"
                    :style="{ width: '20px', height: '10px', bottom: thumbBottom(ch.vol()) + 'px', left: '50%', transform: 'translateX(-50%)' }"
                  />
                  <!-- MIDI learn pulse -->
                  <span
                    v-if="ch.volParam && mappingStore.learningParamName === ch.volParam"
                    class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50"
                  />
                </div>
              </div>

              <!-- % label -->
              <div class="text-[9px] font-mono text-neutral-500 select-none">{{ toPct(ch.vol()) }}</div>

              <!-- Mute / Solo buttons -->
              <div class="flex items-center gap-1">
                <div class="relative">
                  <button
                    @click="ch.toggleMute()"
                    @contextmenu.prevent="ch.muteParam && openMenu($event, { name: ch.muteParam, label: ch.label + ': Mute' })"
                    :class="['flex items-center justify-center w-7 h-7 rounded-lg border transition-colors',
                      ch.muteParam && mappingStore.mappedParams?.has(ch.muteParam) ? 'ring-1 ring-amber-500/50' : '',
                      chMuteBtnClass(ch)]"
                    :title="ch.muted() ? 'Unmute' : 'Mute'"
                  >
                    <VolumeX v-if="ch.muted()" class="w-3.5 h-3.5" />
                    <Volume2 v-else            class="w-3.5 h-3.5" />
                  </button>
                  <span
                    v-if="ch.muteParam && mappingStore.learningParamName === ch.muteParam"
                    class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50"
                  />
                </div>
                <button
                  @click="ch.toggleSolo()"
                  :class="['flex items-center justify-center w-7 h-7 rounded-lg border text-[9px] font-black transition-colors',
                    ch.soloed()
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      : 'border-neutral-700 text-neutral-500 hover:text-white hover:border-neutral-500']"
                  :title="ch.soloed() ? 'Unsolo' : 'Solo — silences every other channel'"
                >S</button>
              </div>

              <!-- CC#7 toggle — instrument channels only -->
              <button
                v-if="ch.kind === 'instrument'"
                @click="ch.toggleNoCC7()"
                :class="['text-[8px] font-mono px-1.5 py-0.5 rounded border transition-colors',
                  ch.noCC7()
                    ? 'bg-amber-500/15 text-amber-400 border-amber-600/50 hover:border-amber-400'
                    : 'text-neutral-600 border-neutral-800 hover:text-neutral-400 hover:border-neutral-600']"
                :title="ch.noCC7()
                  ? 'Physical control mode: CC#7 not sent. Click to re-enable MIDI volume.'
                  : 'Volume/Mute uses MIDI CC#7. Click to disable if this device does not support it.'"
              >{{ ch.noCC7() ? 'EXT' : 'CC7' }}</button>
            </div>

            <!-- Master channel (fixed, not part of the numbered slots) ── -->
            <div class="flex flex-col items-center gap-2 py-4 px-3 bg-neutral-900/40 border-l border-neutral-700/60" style="min-width: 64px;">
              <SlidersHorizontal class="w-4 h-4 text-red-700 shrink-0" />
              <div class="text-center select-none">
                <div class="text-[10px] font-black uppercase tracking-wider text-red-600 leading-none">Master</div>
                <div class="text-[8px] text-neutral-600 font-mono leading-none mt-0.5">Output</div>
              </div>

              <div class="text-[9px] font-mono font-bold text-red-600 select-none">{{ toDb(mixer.masterVol) }}</div>

              <div class="flex-1 flex items-center justify-center w-full">
                <div
                  :class="['relative cursor-ns-resize rounded', mappingStore.mappedParams?.has('mix_master_vol') ? 'ring-1 ring-amber-500/50' : '']"
                  style="height: 140px; width: 28px; touch-action: none;"
                  @pointerdown="startFaderDrag($event, v => mixer.setMasterVol(v), () => false)"
                  @contextmenu.prevent="openMenu($event, { name: 'mix_master_vol', label: 'Master: Volume' })"
                >
                  <div class="absolute rounded-full bg-neutral-800"
                    style="width:6px; top:4px; bottom:4px; left:50%; transform:translateX(-50%)" />
                  <div
                    class="absolute rounded-full bg-red-700 transition-none"
                    :style="{ width: '6px', bottom: '4px', left: '50%', transform: 'translateX(-50%)', height: (mixer.masterVol * 132) + 'px' }"
                  />
                  <div
                    class="absolute rounded-sm border border-amber-600 bg-amber-100 shadow-md pointer-events-none"
                    :style="{ width: '20px', height: '10px', bottom: thumbBottom(mixer.masterVol) + 'px', left: '50%', transform: 'translateX(-50%)' }"
                  />
                  <span
                    v-if="mappingStore.learningParamName === 'mix_master_vol'"
                    class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50"
                  />
                </div>
              </div>

              <div class="text-[9px] font-mono text-neutral-500 select-none">{{ toPct(mixer.masterVol) }}</div>
              <div class="w-8 h-8" />
            </div>

          </template>
        </div>

        <!-- dB scale footer ───────────────────────────────────────────── -->
        <div class="shrink-0 flex items-center justify-around px-2 py-1.5 border-t border-neutral-800/60 bg-neutral-900/30">
          <span v-for="label in ['-∞', '-24', '-12', '-6', '0', '+3']" :key="label"
            class="text-[8px] font-mono text-neutral-700 select-none">{{ label }}</span>
        </div>

        <!-- Resize handles -->
        <div @mousedown.stop="e => onResizeStart(e, 'n')"  class="absolute top-0    left-3 right-3 h-1   cursor-n-resize  z-50" />
        <div @mousedown.stop="e => onResizeStart(e, 's')"  class="absolute bottom-0 left-3 right-3 h-1   cursor-s-resize  z-50" />
        <div @mousedown.stop="e => onResizeStart(e, 'e')"  class="absolute top-3 bottom-3 right-0  w-1   cursor-e-resize  z-50" />
        <div @mousedown.stop="e => onResizeStart(e, 'w')"  class="absolute top-3 bottom-3 left-0   w-1   cursor-w-resize  z-50" />
        <div @mousedown.stop="e => onResizeStart(e, 'ne')" class="absolute top-0    right-0  w-3 h-3 cursor-ne-resize z-50" />
        <div @mousedown.stop="e => onResizeStart(e, 'nw')" class="absolute top-0    left-0   w-3 h-3 cursor-nw-resize z-50" />
        <div @mousedown.stop="e => onResizeStart(e, 'sw')" class="absolute bottom-0 left-0   w-3 h-3 cursor-sw-resize z-50" />
        <div @mousedown.stop="e => onResizeStart(e, 'se')" class="absolute bottom-0 right-0  w-3 h-3 cursor-se-resize z-50" />
      </div>
    </Transition>
  </Teleport>

  <!-- Load Configuration dialog ─────────────────────────────────────────── -->
  <Teleport to="body">
    <div
      v-if="showLoadConfigs"
      class="fixed inset-0 z-[9999] bg-black/75 flex items-center justify-center"
      @click.self="showLoadConfigs = false"
    >
      <div class="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div class="flex items-center justify-between mb-4">
          <span class="text-sm font-black uppercase tracking-widest text-white">Load Configuration</span>
          <button @click="showLoadConfigs = false" class="text-neutral-500 hover:text-white transition-colors">
            <X class="w-4 h-4" />
          </button>
        </div>
        <div v-if="!configs.length" class="py-10 text-center text-neutral-600 font-mono text-[10px] uppercase tracking-widest">
          No saved configurations yet — use Save As to create one.
        </div>
        <div v-else class="space-y-1.5 max-h-80 overflow-y-auto custom-scrollbar">
          <div
            v-for="cfg in configs"
            :key="cfg.id"
            class="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-800 hover:border-neutral-700 transition-colors"
          >
            <button @click="loadConfig(cfg.id)" class="flex-1 min-w-0 text-left text-[11px] font-bold text-white truncate">
              {{ cfg.name }}
            </button>
            <button @click="deleteConfig(cfg.id)" class="p-1 text-neutral-600 hover:text-red-400 transition-colors" title="Delete">
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
