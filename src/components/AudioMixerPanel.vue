<script setup>
import { ref, computed } from 'vue'
import { SlidersHorizontal, Volume2, VolumeX, Music, Layers, Radio, Mic2, Settings2, CheckSquare, Square, Piano, Disc, Zap } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { useAudioMixerStore } from '@/stores/useAudioMixerStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useDeviceRegistry } from '@/composables/useDeviceRegistry'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'

const emit = defineEmits(['close'])

const uiStore    = useUiStore()
const mixer      = useAudioMixerStore()
const midiStore  = useMidiStore()
const mappingStore = useMappingStore()
const { openMenu } = useMidiContextMenu()
const { instruments } = useDeviceRegistry()

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
  })

const showConfig = ref(false)

// ── Catalog of all controllable audio sources ─────────────────────────────────
const CATALOG = [
  {
    id:       'backing',
    label:    'Backing',
    sub:      'Track Player',
    desc:     'Backing Track Player playlist volume',
    icon:     Music,
    color:    'cyan',
    volParam: 'mix_backing_vol',
    muteParam:'mix_backing_mute',
    vol:    () => mixer.backingVol,
    muted:  () => mixer.backingMuted,
    setVol: v => mixer.setBackingVol(v),
    mute:   () => mixer.toggleBackingMute(),
  },
  {
    id:       'tracks',
    label:    'Tracks',
    sub:      'Tracks Player',
    desc:     'Tracks Player playlist volume',
    icon:     Radio,
    color:    'violet',
    volParam: 'mix_tracks_vol',
    muteParam:'mix_tracks_mute',
    vol:    () => mixer.tracksVol,
    muted:  () => mixer.tracksMuted,
    setVol: v => mixer.setTracksVol(v),
    mute:   () => mixer.toggleTracksMute(),
  },
  {
    id:       'looper',
    label:    'Looper',
    sub:      '8-Track Looper',
    desc:     'Master gain for all looper tracks combined',
    icon:     Mic2,
    color:    'synth-neon',
    volParam: 'mix_looper_vol',
    muteParam:'mix_looper_mute',
    vol:    () => mixer.looperVol,
    muted:  () => mixer.looperMuted,
    setVol: v => mixer.setLooperVol(v),
    mute:   () => mixer.toggleLooperMute(),
  },
  {
    id:       'lm',
    label:    'Loop Mch',
    sub:      'Samples Machine',
    desc:     'Master gain for all 24 Samples Machine pads',
    icon:     Layers,
    color:    'fuchsia',
    volParam: 'mix_lm_vol',
    muteParam:'mix_lm_mute',
    vol:    () => mixer.lmVol,
    muted:  () => mixer.lmMuted,
    setVol: v => mixer.setLMVol(v),
    mute:   () => mixer.toggleLMMute(),
  },
  {
    id:       'drums',
    label:    'Drums',
    sub:      'Drum Machine',
    desc:     'Master gain for Drum Machine audio engine',
    icon:     Layers,
    color:    'orange',
    volParam: 'mix_drums_vol',
    muteParam:'mix_drums_mute',
    vol:    () => mixer.drumsVol,
    muted:  () => mixer.drumsMuted,
    setVol: v => mixer.setDrumsVol(v),
    mute:   () => mixer.toggleDrumsMute(),
  },
  {
    id:       'drumsLevel',
    label:    'DM Level',
    sub:      'All 8 Slots',
    desc:     'Master level multiplier for all 8 Drum Machine slot volumes (same control as the Drum Machine footer Vol)',
    icon:     Layers,
    color:    'rose',
    volParam: 'mix_drums_level_vol',
    muteParam:'mix_drums_level_mute',
    vol:    () => mixer.drumsLevelVol,
    muted:  () => mixer.drumsLevelMuted,
    setVol: v => mixer.setDrumsLevelVol(v),
    mute:   () => mixer.toggleDrumsLevelMute(),
  },
  {
    id:       'sampler',
    label:    'Sampler',
    sub:      'Sampler Engine',
    desc:     'Master gain for all Sampler pads (multiplied with per-pad volume)',
    icon:     Disc,
    color:    'emerald',
    volParam: 'mix_sampler_vol',
    muteParam:'mix_sampler_mute',
    vol:    () => mixer.samplerVol,
    muted:  () => mixer.samplerMuted,
    setVol: v => mixer.setSamplerVol(v),
    mute:   () => mixer.toggleSamplerMute(),
  },
  {
    id:       'liveperf',
    label:    'Live Perf',
    sub:      'Performance Pad',
    desc:     'Master volume multiplier for Live Performance Pad',
    icon:     Zap,
    color:    'sky',
    volParam: 'mix_liveperf_vol',
    muteParam:'mix_liveperf_mute',
    vol:    () => mixer.liveperfVol,
    muted:  () => mixer.liveperfMuted,
    setVol: v => mixer.setLiveperfVol(v),
    mute:   () => mixer.toggleLiveperfMute(),
  },
]

const activeChannels = computed(() =>
  CATALOG.filter(c => mixer.enabledChannels.includes(c.id))
)

// MIDI instruments with output registration → get their own fader
const instrumentChannels = computed(() =>
  instruments.value.filter(d => {
    const reg = midiStore.routingConfig?.registrations?.[d.name]
    return reg && reg.outEnabled
  })
)

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
</script>

<template>
  <Teleport to="body">
    <Transition name="sy-modal">
      <div
        v-show="uiStore.isAudioMixerOpen && !isMinimized"
        :style="panelStyle"
        class="fixed bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        @mousedown="bringToFront"
      >
        <!-- Header ────────────────────────────────────────────────────── -->
        <div
          class="shrink-0 flex items-center gap-2 px-4 py-4 border-b border-neutral-800 bg-neutral-900/60 cursor-grab active:cursor-grabbing"
          @mousedown.stop="onDragStart"
        >
          
          <SlidersHorizontal class="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span class="flex-1 text-[14px] font-mono font-bold uppercase tracking-widest text-synth-neon select-none">Audio Mixer</span>
          <button
            @click.stop="showConfig = !showConfig"
            :class="['p-1.5 transition-colors rounded-full hover:bg-white/5', showConfig ? 'text-amber-400' : 'text-neutral-500 hover:text-white']"
            title="Configure channels"
          >
        </button>
        <div class="flex items-center gap-1 pointer-events-auto"  @mousedown.stop>
            <Settings2 class="w-3.5 h-3.5 mr-2 cursor-pointer" title="Settings" />
            <MacOsButtons @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize" />
          </div>
        </div>

        <!-- Channel selector overlay ──────────────────────────────────── -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 -translate-y-1"
          leave-active-class="transition-all duration-150 ease-in"
          leave-to-class="opacity-0 -translate-y-1"
        >
          <div v-if="showConfig" class="shrink-0 border-b border-neutral-800 bg-neutral-900/90 px-4 py-3 space-y-1.5">
            <p class="text-[9px] font-black uppercase tracking-widest text-neutral-500 mb-2 select-none">
              Select channels to control in this mixer
            </p>
            <button
              v-for="c in CATALOG"
              :key="c.id"
              @click="mixer.toggleChannel(c.id)"
              :class="['w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors text-left',
                mixer.isChannelEnabled(c.id)
                  ? (C[c.color]?.check ?? 'border-neutral-600 bg-neutral-800 text-white')
                  : 'border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300']"
            >
              <component :is="c.icon" class="w-3.5 h-3.5 shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="text-[10px] font-bold leading-none select-none">{{ c.label }}</div>
                <div class="text-[9px] text-neutral-500 font-mono leading-none mt-0.5 truncate select-none">{{ c.desc }}</div>
              </div>
              <CheckSquare v-if="mixer.isChannelEnabled(c.id)" class="w-3.5 h-3.5 shrink-0 opacity-70" />
              <Square      v-else                               class="w-3.5 h-3.5 shrink-0 opacity-30" />
            </button>
          </div>
        </Transition>

        <!-- Fader strips ──────────────────────────────────────────────── -->
        <div class="flex-1 flex items-stretch min-h-0">

          <!-- Empty state -->
          <div
            v-if="activeChannels.length === 0"
            class="flex-1 flex flex-col items-center justify-center gap-2 text-neutral-600 p-6"
          >
            <Settings2 class="w-6 h-6 opacity-40" />
            <p class="text-[10px] font-bold uppercase tracking-widest text-center select-none">No channels selected</p>
            <p class="text-[9px] text-neutral-700 text-center select-none">
              Click <span class="text-amber-500">⚙</span> above to add audio sources.
            </p>
          </div>

          <template v-else>

            <!-- Per-channel strip -->
            <div
              v-for="ch in activeChannels"
              :key="ch.id"
              class="flex-1 flex flex-col items-center gap-2 py-4 px-2 border-r border-neutral-800/60"
            >
              <component :is="ch.icon" :class="['w-4 h-4 shrink-0', C[ch.color]?.text ?? 'text-neutral-400']" />

              <div class="text-center select-none">
                <div class="text-[10px] font-black uppercase tracking-wider text-white leading-none">{{ ch.label }}</div>
                <div class="text-[8px] text-neutral-600 font-mono leading-none mt-0.5">{{ ch.sub }}</div>
              </div>

              <!-- dB readout -->
              <div :class="['text-[9px] font-mono font-bold select-none', ch.muted() ? 'text-neutral-600' : C[ch.color]?.text ?? 'text-neutral-300']">
                {{ ch.muted() ? 'MUTE' : toDb(ch.vol()) }}
              </div>

              <!-- ── Fader track (pointer-capture drag) ── -->
              <div class="flex-1 flex items-center justify-center w-full">
                <div
                  :class="['relative cursor-ns-resize rounded', mappingStore.mappedParams?.has(ch.volParam) ? 'ring-1 ring-amber-500/50' : '']"
                  style="height: 140px; width: 28px; touch-action: none;"
                  @pointerdown="startFaderDrag($event, ch.setVol, ch.muted)"
                  @contextmenu.prevent="openMenu($event, { name: ch.volParam, label: ch.label + ': Volume' })"
                >
                  <!-- Groove -->
                  <div class="absolute rounded-full bg-neutral-800"
                    style="width:6px; top:4px; bottom:4px; left:50%; transform:translateX(-50%)" />
                  <!-- Fill -->
                  <div
                    :class="['absolute rounded-full transition-none', ch.muted() ? 'bg-neutral-700' : C[ch.color]?.track ?? 'bg-neutral-400']"
                    :style="{ width: '6px', bottom: '4px', left: '50%', transform: 'translateX(-50%)', height: (ch.vol() * 132) + 'px' }"
                  />
                  <!-- Thumb -->
                  <div
                    :class="['absolute rounded-sm border border-neutral-500 shadow-md pointer-events-none', ch.muted() ? 'bg-neutral-700 opacity-40' : 'bg-neutral-200']"
                    :style="{ width: '20px', height: '10px', bottom: thumbBottom(ch.vol()) + 'px', left: '50%', transform: 'translateX(-50%)' }"
                  />
                  <!-- MIDI learn pulse -->
                  <span
                    v-if="mappingStore.learningParamName === ch.volParam"
                    class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50"
                  />
                </div>
              </div>

              <!-- % label -->
              <div class="text-[9px] font-mono text-neutral-500 select-none">{{ toPct(ch.vol()) }}</div>

              <!-- Mute button -->
              <div class="relative">
                <button
                  @click="ch.mute()"
                  @contextmenu.prevent="openMenu($event, { name: ch.muteParam, label: ch.label + ': Mute' })"
                  :class="['flex items-center justify-center w-8 h-8 rounded-lg border transition-colors',
                    mappingStore.mappedParams?.has(ch.muteParam) ? 'ring-1 ring-amber-500/50' : '',
                    ch.muted()
                      ? (C[ch.color]?.muted ?? 'bg-red-500/20 text-red-300 border-red-500/30')
                      : 'border-neutral-700 text-neutral-500 hover:text-white hover:border-neutral-500']"
                  :title="ch.muted() ? 'Unmute (right-click: MIDI learn)' : 'Mute (right-click: MIDI learn)'"
                >
                  <VolumeX v-if="ch.muted()" class="w-3.5 h-3.5" />
                  <Volume2 v-else            class="w-3.5 h-3.5" />
                </button>
                <span
                  v-if="mappingStore.learningParamName === ch.muteParam"
                  class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50"
                />
              </div>
            </div>

            <!-- MIDI Instrument channels ─────────────────────────────── -->
            <template v-if="instrumentChannels.length > 0">
              <!-- Divider -->
              <div class="w-px self-stretch bg-neutral-700/40 my-2" />

              <div
                v-for="inst in instrumentChannels"
                :key="'inst:' + inst.name"
                class="flex-1 flex flex-col items-center gap-2 py-4 px-2 border-r border-neutral-800/60"
                style="min-width: 56px;"
              >
                <Piano class="w-4 h-4 shrink-0 text-orange-400" />

                <div class="text-center select-none w-full px-1">
                  <div class="text-[10px] font-black uppercase tracking-wider text-white leading-none truncate" :title="inst.name">
                    {{ inst.name.length > 8 ? inst.name.slice(0, 7) + '…' : inst.name }}
                  </div>
                  <div class="text-[8px] text-neutral-600 font-mono leading-none mt-0.5">MIDI Inst</div>
                </div>

                <div :class="['text-[9px] font-mono font-bold select-none', mixer.isInstrumentMuted(inst.name) ? 'text-neutral-600' : 'text-orange-400']">
                  {{ mixer.isInstrumentMuted(inst.name) ? 'MUTE' : toDb(mixer.getInstrumentVol(inst.name)) }}
                </div>

                <div class="flex-1 flex items-center justify-center w-full">
                  <div
                    class="relative cursor-ns-resize"
                    style="height: 140px; width: 28px; touch-action: none;"
                    @pointerdown="startFaderDrag($event, v => mixer.setInstrumentVol(inst.name, v), () => mixer.isInstrumentMuted(inst.name))"
                  >
                    <div class="absolute rounded-full bg-neutral-800"
                      style="width:6px; top:4px; bottom:4px; left:50%; transform:translateX(-50%)" />
                    <div
                      :class="['absolute rounded-full transition-none', mixer.isInstrumentMuted(inst.name) ? 'bg-neutral-700' : 'bg-orange-400']"
                      :style="{ width: '6px', bottom: '4px', left: '50%', transform: 'translateX(-50%)', height: (mixer.getInstrumentVol(inst.name) * 132) + 'px' }"
                    />
                    <div
                      :class="['absolute rounded-sm border border-neutral-500 shadow-md pointer-events-none', mixer.isInstrumentMuted(inst.name) ? 'bg-neutral-700 opacity-40' : 'bg-neutral-200']"
                      :style="{ width: '20px', height: '10px', bottom: thumbBottom(mixer.getInstrumentVol(inst.name)) + 'px', left: '50%', transform: 'translateX(-50%)' }"
                    />
                  </div>
                </div>

                <div class="text-[9px] font-mono text-neutral-500 select-none">{{ toPct(mixer.getInstrumentVol(inst.name)) }}</div>

                <button
                  @click="mixer.toggleInstrumentMute(inst.name)"
                  :class="['flex items-center justify-center w-8 h-8 rounded-lg border transition-colors',
                    mixer.isInstrumentMuted(inst.name)
                      ? 'bg-orange-400/20 text-orange-300 border-orange-500/30'
                      : 'border-neutral-700 text-neutral-500 hover:text-white hover:border-neutral-500']"
                  :title="mixer.isInstrumentMuted(inst.name) ? 'Unmute' : 'Mute'"
                >
                  <VolumeX v-if="mixer.isInstrumentMuted(inst.name)" class="w-3.5 h-3.5" />
                  <Volume2 v-else                                     class="w-3.5 h-3.5" />
                </button>
              </div>
            </template>

            <!-- Master channel ────────────────────────────────────────── -->
            <div class="flex flex-col items-center gap-2 py-4 px-3 bg-neutral-900/40 border-l border-neutral-700/60" style="min-width: 64px;">
              <SlidersHorizontal class="w-4 h-4 text-amber-400 shrink-0" />
              <div class="text-center select-none">
                <div class="text-[10px] font-black uppercase tracking-wider text-amber-400 leading-none">Master</div>
                <div class="text-[8px] text-neutral-600 font-mono leading-none mt-0.5">Output</div>
              </div>

              <div class="text-[9px] font-mono font-bold text-amber-400 select-none">{{ toDb(mixer.masterVol) }}</div>

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
                    class="absolute rounded-full bg-amber-400 transition-none"
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
</template>
