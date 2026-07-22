<script setup>
import { useAuthStore } from '@/stores/useAuthStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useArpStore } from '@/stores/useArpStore'
import { useUiStore } from '@/stores/useUiStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, Captions, Play, Square, SkipBack, SkipForward, Pause, Music, Volume2, Repeat, Link, Settings, Save, Home, User, Menu, X, SlidersHorizontal, SquareStack } from 'lucide-vue-next'
import QuickChannelSelector from '@/components/ui/QuickChannelSelector.vue'
import AppLauncherModal from '@/components/ui/AppLauncherModal.vue'
import ActiveMidiControllers from '@/components/ActiveMidiControllers.vue'
import TransportBar from '@/components/TransportBar.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { midiService } from '@/core/midi/midi-service'

const emit = defineEmits(['bpm-override'])

const authStore    = useAuthStore()
const midiStore    = useMidiStore()
const arpStore     = useArpStore()
const uiStore      = useUiStore()
const configStore  = useConfigStore()
const mappingStore = useMappingStore()
const { openMenu } = useMidiContextMenu()
const router = useRouter()

const showPartSelector = computed(() => configStore.enablePartSelector)

// Plain {x,y} only — never store the DOMRect itself in reactive state, its
// native getters can throw "Illegal invocation" when accessed through a
// Vue reactivity Proxy.
function onToggleOpenAppsDock(event) {
  const rect = event.currentTarget.getBoundingClientRect()
  uiStore.toggleOpenAppsDock({ x: rect.left + rect.width / 2, y: rect.top })
}

// ── Backing Track transport state (synced via window events) ──────────────────
const btIsPlaying        = ref(false)
const btPlaylist         = ref([])
const btPlaylistIdx      = ref(-1)
const btSrc              = ref(false)
const btCurrentTime      = ref(0)
const btDuration         = ref(0)
const btVolume           = ref(0.5)
const btIsLooping        = ref(true)
const btPlayingTrackLabel = ref('')

const btIsPlaylistMode = computed(() => btPlaylistIdx.value >= 0 && btPlaylist.value.length > 0)
const btProgress       = computed(() => btDuration.value > 0 ? (btCurrentTime.value / btDuration.value) * 100 : 0)

const isOpen = computed({
  get: () => uiStore.isTracksPlayerOpen,
  set: (v) => uiStore.isTracksPlayerOpen = v
})

function onPlayerSync(e) {
  const d = e.detail
  if (d.isPlaying          !== undefined) btIsPlaying.value         = d.isPlaying
  if (d.playlistIdx        !== undefined) btPlaylistIdx.value       = d.playlistIdx
  if (d.playlist           !== undefined) btPlaylist.value          = d.playlist
  if (d.hasSrc             !== undefined) btSrc.value               = d.hasSrc
  if (d.currentTime        !== undefined) btCurrentTime.value       = d.currentTime
  if (d.duration           !== undefined) btDuration.value          = d.duration
  if (d.volume             !== undefined) btVolume.value            = d.volume
  if (d.isLooping          !== undefined) btIsLooping.value         = d.isLooping
  if (d.playingTrackLabel  !== undefined) btPlayingTrackLabel.value = d.playingTrackLabel
}

function btPlayStop()     { window.dispatchEvent(new CustomEvent('playlist-play-stop')) }
function btPrev()         { window.dispatchEvent(new CustomEvent('playlist-prev')) }
function btNext()         { window.dispatchEvent(new CustomEvent('playlist-next')) }
function btLoopToggle()   { window.dispatchEvent(new CustomEvent('playlist-loop-toggle')) }
function btSetVolume(v)   { window.dispatchEvent(new CustomEvent('playlist-volume', { detail: parseFloat(v) })) }
function btSeek(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const pos  = (e.clientX - rect.left) / rect.width
  window.dispatchEvent(new CustomEvent('playlist-seek', { detail: pos }))
}

function formatTime(t) {
  if (isNaN(t) || !isFinite(t)) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

let _unsubFooterMidi = null

onMounted(() => {
  window.addEventListener('player-state-sync', onPlayerSync)
  window.dispatchEvent(new CustomEvent('player-state-request'))

  _unsubFooterMidi = midiService.addRawListener((event) => {
    if (!event.data || event.data.length < 3) return
    const status  = event.data[0]
    const type    = status & 0xF0
    const channel = status & 0x0F
    const byte1   = event.data[1]
    const byte2   = event.data[2]
    const isCC    = type === 0xB0 && byte2 > 0
    const isNote  = type === 0x90 && byte2 > 0
    if (!isCC && !isNote) return
    const inputPort = midiService.getInputs().find(i => i.id === event.target?.id)
    const device    = inputPort?.name || null
    const keyParts  = []
    if (device) keyParts.push(device)
    keyParts.push(`CH${channel + 1}`)
    keyParts.push(isNote ? `NOTE${byte1}` : `CC${byte1}`)
    const key       = keyParts.join(':')
    const mapping   = mappingStore.midiMappings[key]
    if (!mapping) return
    const paramName = typeof mapping === 'object' ? mapping.paramName : mapping
    console.log(`[AppFooter] ${isNote ? 'Note' : 'CC'} ${byte1} from "${device || 'UNRESOLVED — matched device-agnostic key ' + key}" (CH ${channel + 1}) -> ${paramName}`)
    if (paramName === 'globalTransport') midiStore.toggleGlobalTransport()
    else if (paramName === 'panic') midiStore.panic()
  })
})

onUnmounted(() => {
  window.removeEventListener('player-state-sync', onPlayerSync)
  if (_unsubFooterMidi) _unsubFooterMidi()
})
</script>

<template>
  <footer class="fixed bottom-0 left-0 w-full bg-surface-panel/95 dark:bg-black/95 backdrop-blur-md border-t border-black/5 dark:border-neutral-900/80 z-[960] text-[10px] font-mono tracking-widest text-neutral-500 uppercase h-10">
    <div class="h-full px-4 md:px-2 flex flex-row justify-between items-center gap-2">

      <button
        @click="uiStore.closeAll(); router.push('/')"
        title="Home"
        class="-ml-1 w-10 h-10 text-neutral-400 hover:bg-synth-cyan hover:text-black flex items-center justify-center transition-all active:scale-95 shadow-lg"
      >
        <Home class="w-5 h-5" />
      </button>

      <!-- Burger menu toggle -->
      <!-- <button
        @click="uiStore.toggleMainMenu()"
        :class="[
          'w-10 h-10 flex items-center justify-center transition-all active:scale-95',
          uiStore.isMainMenuOpen ? 'text-white bg-white/10' : 'text-synth-neon hover:bg-synth-neon/10'
        ]"
        title="Menu"
      >
        <X v-if="uiStore.isMainMenuOpen" class="w-5 h-5" />
        <Menu v-else class="w-5 h-5" />
      </button> -->

      <!-- Open-apps dial toggle -->
      <button
        v-if="uiStore.openPanelIds.length > 0"
        @click="onToggleOpenAppsDock"
        :class="[
          'w-10 h-10 flex items-center justify-center transition-all active:scale-95',
          uiStore.isOpenAppsDockOpen ? 'text-white bg-white/10' : 'text-synth-neon hover:bg-synth-neon/10'
        ]"
        title="Open Apps"
      >
        <SquareStack class="w-5 h-5" />
      </button>

      <!-- Left: Backing Track transport -->
      <div v-if="authStore.user" class="flex-none flex items-center gap-2 bg-neutral-800/40 p-1">

        <!-- Library toggle -->
        <button
          @click="isOpen = !isOpen"
          :class="['flex items-center justify-center gap-1.5 transition-all active:scale-95', isOpen || btIsPlaying ? 'text-synth-neon' : 'text-neutral-400 hover:text-white']"
          title="Library & Playlist"
        >
          <Settings :class="['w-4 h-4', btIsPlaying ? 'animate-pulse' : '']" />
          <span v-if="btIsPlaylistMode" class="text-[9px] font-black font-mono bg-synth-neon/20 px-1.5 rounded">{{ btPlaylistIdx + 1 }}/{{ btPlaylist.length }}</span>
        </button>

        <div class="w-px h-4 bg-white/10" />

        <template v-if="btSrc">
          <!-- Prev -->
          <button @click="btPrev()" title="Previous track"
            :disabled="!btIsPlaylistMode"
            :class="['transition-colors', btIsPlaylistMode ? 'text-neutral-500 hover:text-white' : 'text-neutral-700 cursor-not-allowed']">
            <SkipBack class="w-4 h-4" />
          </button>

          <!-- Play / Pause -->
          <button @click="btPlayStop()"
            class="w-8 h-8 flex items-center justify-center rounded-full bg-synth-neon/10 text-synth-neon hover:bg-synth-neon hover:text-black transition-all active:scale-90 shadow-lg shadow-synth-neon/20">
            <Pause v-if="btIsPlaying" class="w-4 h-4 fill-current" />
            <Play  v-else             class="w-4 h-4 fill-current ml-0.5" />
          </button>

          <!-- Next -->
          <button @click="btNext()" title="Next track (crossfade)"
            :disabled="!btIsPlaylistMode"
            :class="['transition-colors', btIsPlaylistMode ? 'text-neutral-500 hover:text-white' : 'text-neutral-700 cursor-not-allowed']">
            <SkipForward class="w-4 h-4" />
          </button>

          <!-- Loop (single track only) -->
          <button v-if="!btIsPlaylistMode" @click="btLoopToggle()"
            :class="['transition-colors', btIsLooping ? 'text-synth-neon' : 'text-neutral-500 hover:text-white']"
            title="Toggle Loop">
            <Repeat class="w-4 h-4" />
          </button>

          <!-- Track name -->
          <div class="hidden sm:flex flex-col ml-1 min-w-0 max-w-[100px]">
            <span class="text-[7px] font-black uppercase tracking-tighter text-white/30 leading-none mb-0.5">Playing</span>
            <span class="text-[9px] font-black uppercase tracking-tighter text-synth-neon truncate leading-tight">
              {{ btPlayingTrackLabel || 'Audio Track' }}
            </span>
          </div>

          <!-- Progress -->
          <div class="w-16 lg:w-24 flex flex-col items-center ml-2">
            <div
              class="w-full h-1 bg-white/5 rounded-full overflow-hidden cursor-pointer relative group/progress"
              @click="btSeek"
            >
              <div
                class="h-full bg-synth-neon absolute left-0 top-0 bottom-0 pointer-events-none transition-all duration-75 shadow-[0_0_8px_rgba(0,163,112,0.8)]"
                :style="{ width: `${btProgress}%` }"
              />
            </div>
          </div>

          <!-- Volume -->
          <div class="items-center gap-1.5 w-10 lg:w-14 flex ml-2 group/vol">
            <Volume2 class="w-2.5 h-2.5 text-neutral-500 group-hover/vol:text-white transition-colors" />
            <input type="range" min="0" max="1" step="0.01" :value="btVolume"
              @input="e => btSetVolume(e.target.value)"
              class="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-synth-neon" />
          </div>

          <!-- Time -->
          <div class="text-[8px] font-mono text-neutral-400 w-[40px] text-right ml-1 shrink-0 flex flex-col leading-tight">
            <span class="text-white">{{ formatTime(btCurrentTime) }}</span>
            <span class="text-neutral-600 tracking-tighter">{{ formatTime(btDuration) }}</span>
          </div>

          <div class="w-px h-4 bg-white/10 mx-1" />

          
        </template>
        
        
        <span v-else class="text-[10px] font-black text-neutral-500 tracking-[0.2em] px-2">PLAYER READY</span>
        <!-- MIDI Sync -->
        <button
            @click="midiStore.syncMidiTransport = !midiStore.syncMidiTransport"
            :class="['transition-all p-1 rounded-md active:scale-90', midiStore.syncMidiTransport ? 'text-synth-neon bg-synth-neon/10' : 'text-neutral-500 hover:text-white']"
            title="Sync MIDI START/STOP with Audio Player"
          >
            <Link class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Right: controls -->
      <div class="flex-1 flex items-center justify-end gap-1 md:gap-1">

        <!-- Audio Capture recording indicator -->
        <div
          v-if="uiStore.isCaptureRecording"
          class="flex items-center gap-1 px-2 py-0.5 bg-red-950/60 border border-red-500/40 rounded-full cursor-pointer"
          title="Audio Capture is recording"
          @click="uiStore.isAudioCaptureOpen = true"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_4px_rgba(239,68,68,0.8)]" />
          <span class="text-[8px] font-black text-red-400 tracking-widest">REC</span>
        </div>

        <div v-if="authStore.user" class="flex items-center gap-2">
          <TransportBar />
          <QuickChannelSelector v-if="showPartSelector" />
          <ActiveMidiControllers />
        </div>

        <div v-if="authStore.user" class="relative">
          <button
            @click="midiStore.panic()"
            @contextmenu.prevent="openMenu($event, { name: 'panic', label: 'Panic (All Notes OFF)' })"
            title="Panic (All Notes OFF) · Right-click to MIDI learn"
            class="w-8 h-8 flex items-center justify-center rounded-full bg-red-950/30 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white transition-all active:scale-90"
          >
            <AlertTriangle class="w-3.5 h-3.5" />
          </button>
          <span
            v-if="mappingStore.learningParamName === 'panic'"
            class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse pointer-events-none z-50"
          />
        </div>

        <ThemeToggle size="sm" />
        <button
          v-if="authStore.user"
          @click="uiStore.openPanel('audio-mixer')"
          title="Audio Mixer"
          class="w-8 h-8 flex items-center justify-center hover:bg-synth-neon/40 rounded-full transition-all active:scale-90"
        >
          <SlidersHorizontal class="w-5 h-5 text-synth-neon" />
        </button>
        <button
          v-if="authStore.user"
          @click="uiStore.isSessionOpen = true"
          title="Save Session"
          class="w-8 h-8 flex items-center justify-center hover:bg-synth-neon/40 rounded-full transition-all active:scale-90"
        >
          <Save class="w-5 h-5 text-synth-neon" />
        </button>
        <button
          v-if="authStore.user"
          @click="uiStore.isProfileOpen = true"
          title="Profile"
          class="w-8 h-8 flex items-center justify-center hover:bg-synth-neon/40 rounded-full transition-all active:scale-90"
        >
          <User class="w-5 h-5 text-synth-neon" />
        </button>
      </div>

    </div>

  </footer>

  <AppLauncherModal v-if="uiStore.isMainMenuOpen" @close="uiStore.isMainMenuOpen = false" />
</template>
