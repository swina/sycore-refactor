<script setup>
import { useAuthStore } from '@/stores/useAuthStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useArpStore } from '@/stores/useArpStore'
import { useUiStore } from '@/stores/useUiStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { computed, onMounted, onUnmounted } from 'vue'
import { User, Radio, AlertTriangle, Play, Square, Clock } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import QuickChannelSelector from '@/components/ui/QuickChannelSelector.vue'
import Tooltip from '@/components/Tooltip.vue'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { midiService } from '@/core/midi/MidiService'

const emit = defineEmits(['bpm-override'])

const router       = useRouter()
const authStore    = useAuthStore()
const midiStore    = useMidiStore()
const arpStore     = useArpStore()
const uiStore      = useUiStore()
const configStore  = useConfigStore()
const mappingStore = useMappingStore()
const { openMenu } = useMidiContextMenu()

const showPartSelector = computed(() => configStore.enablePartSelector)

let _unsubFooterMidi = null

onMounted(() => {
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
    const mapping   = mappingStore.midiMappings[keyParts.join(':')]
    if (!mapping) return
    const paramName = typeof mapping === 'object' ? mapping.paramName : mapping
    if (paramName === 'globalTransport') midiStore.toggleGlobalTransport()
  })
})

onUnmounted(() => { if (_unsubFooterMidi) _unsubFooterMidi() })

function handleBpmChange(e) {
  const v = parseInt(e.target.value)
  if (!isNaN(v)) {
    arpStore.arpBpm = v
    emit('bpm-override')
  }
}
</script>

<template>
  <footer class="fixed bottom-0 left-0 w-full bg-black/95 backdrop-blur-md border-t border-neutral-900/80 z-[960] text-[10px] font-mono tracking-widest text-neutral-500 uppercase h-10">
    <div class="h-full px-4 md:px-6 flex flex-row justify-between items-center gap-2">

      <!-- Left: app meta -->
      <div class="flex-none flex items-center gap-2">
        <Tooltip v-if="authStore.user" :content="`${authStore.user.email} (${authStore.profile?.role || 'demo'})`" :disabled="false" position="top">
          <button
            @click="uiStore.isProfileOpen = true"
            class="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase bg-neutral-900/50 border border-neutral-800 text-neutral-400 hover:text-synth-neon hover:border-synth-neon transition-colors"
          >
            <User class="w-3 h-3" />
            <span class="max-w-[100px] truncate">
              {{ authStore.profile?.name || authStore.user.email.split('@')[0] }}
            </span>
          </button>
        </Tooltip>
        <Tooltip content="MIDI Status — click to open Main Page" :disabled="false" position="top">
          <button
            @click="router.push('/')"
            :class="['px-2 py-1 rounded-md text-[10px] font-bold uppercase flex items-center gap-1.5 transition-colors cursor-pointer hover:brightness-125 active:scale-95', midiStore.midiReady ? 'bg-synth-neon/10 text-synth-neon' : 'bg-red-950/30 text-red-400']"
          >
            <Radio class="w-3 h-3" />
            {{ midiStore.midiReady ? 'READY' : 'WAITING S-1' }}
          </button>
        </Tooltip>
      </div>

      <!-- Right: controls -->
      <div class="flex-1 flex items-center justify-end gap-3 md:gap-5">
        <QuickChannelSelector v-if="showPartSelector" />

        <div v-if="authStore.user" class="flex items-center gap-2">
          <div class="flex items-center px-2 py-0.5 bg-neutral-900/40 border border-neutral-800/60 rounded-full group">
            <button
              @click="midiStore.toggleGlobalTransport()"
              @contextmenu.prevent="openMenu($event, { name: 'globalTransport', label: 'Global Transport' })"
              :class="[
                'flex items-center gap-2 px-2 py-1 rounded-full transition-all active:scale-95 font-black text-[8px] border',
                midiStore.isTransportPlaying
                  ? 'text-red-500 bg-red-500/10 border-red-500/30 hover:bg-red-500 hover:text-white'
                  : 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500 hover:text-black'
              ]"
            >
              <div class="flex items-center gap-1.5">
                <span class="opacity-50 text-[7px] border border-current px-1 rounded-sm tracking-tighter">MIDI</span>
                <component :is="midiStore.isTransportPlaying ? Square : Play" class="w-3 h-3 fill-current" />
                <span>{{ midiStore.isTransportPlaying ? 'STOP' : 'START' }}</span>
              </div>
            </button>
          </div>
        </div>

        <button
          v-if="authStore.user"
          @click="midiStore.panic()"
          class="w-8 h-8 flex items-center justify-center rounded-full bg-red-950/30 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white transition-all active:scale-90"
        >
          <AlertTriangle class="w-3.5 h-3.5" />
        </button>

        <!-- Timeline button -->
        <button
          v-if="authStore.user"
          @click="uiStore.isLiveTimelineOpen = !uiStore.isLiveTimelineOpen"
          :class="[
            'flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase border transition-all active:scale-95',
            uiStore.isLiveTimelineOpen
              ? 'bg-synth-neon/10 text-synth-neon border-synth-neon/40 hover:bg-synth-neon/20'
              : 'bg-neutral-900/40 text-neutral-500 border-neutral-800/60 hover:text-synth-neon hover:border-synth-neon/30'
          ]"
          title="Live Timeline"
        >
          <Clock class="w-3 h-3" />
          <span>Timeline</span>
        </button>

        <div v-if="authStore.user" class="flex items-center gap-2 relative group">
          <span class="text-neutral-500 text-[10px]">GLOBAL BPM:</span>
          <input
            type="number" min="20" max="300"
            :value="arpStore.arpBpm"
            @change="handleBpmChange"
            class="w-24 bg-neutral-900 border border-neutral-800 rounded px-1 py-0.5 text-center text-synth-neon text-lg focus:outline-none focus:border-synth-neon transition-colors"
          />
        </div>
      </div>

    </div>
  </footer>
</template>
