<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { ChevronUp, ChevronDown, X, Settings } from 'lucide-vue-next'
import { midiService, MidiSource } from '@/core/midi/midi-service'
import { useArpStore } from '@/stores/useArpStore'
import { useUiStore } from '@/stores/useUiStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useMidiStore } from '@/stores/useMidiStore'

const props = defineProps({
  channel:      { type: Number, default: 0 },
  inputChannel: { type: Number, default: -1 },
})
const emit = defineEmits(['close'])

const arpStore    = useArpStore()
const uiStore     = useUiStore()
const configStore = useConfigStore()
const midiStore   = useMidiStore()

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const octave       = ref(4)
const activeNotes  = ref(new Set())
const extActiveNotes = ref(new Set())
const modValue     = ref(0)
const pitchValue   = ref(8192)
const pitchCC      = ref(128)   // 128 → use real pitch-bend; else a CC number
const showSettings = ref(false)

let physicalVirtualKeysHeld = 0

// ─── Pre-computed key descriptors ─────────────────────────────────────────────

const keys = computed(() =>
  Array.from({ length: 25 }, (_, i) => {
    const notePos  = i % 12
    const noteName = NOTES[notePos]
    const black    = noteName.includes('#')
    const midiNote = i + (octave.value * 12)
    const keyOctave = Math.floor(midiNote / 12) - 1
    const label    = `${noteName}${keyOctave}`

    const isSent    = activeNotes.value.has(midiNote) || extActiveNotes.value.has(midiNote)
    const gt        = uiStore.globalTranspose ?? 0
    const isSounded = gt !== 0
      ? activeNotes.value.has(midiNote - gt) || extActiveNotes.value.has(midiNote - gt)
      : false
    const isActive  = isSent || isSounded

    return { i, black, midiNote, label, isSent, isSounded, isActive }
  })
)

// ─── Styling helpers ──────────────────────────────────────────────────────────

function keyClass(key) {
  const gt = uiStore.globalTranspose ?? 0
  let activeStyle = ''

  if (key.isActive) {
    if (gt !== 0) {
      if (key.isSounded) {
        activeStyle = key.black
          ? 'bg-synth-neon shadow-synth-neon/40 translate-y-1'
          : 'bg-synth-neon border-synth-neon translate-y-1 shadow-synth-neon/20'
      } else {
        activeStyle = key.black
          ? 'bg-neutral-500 shadow-neutral-500/40 translate-y-1'
          : 'bg-neutral-500 border-neutral-500 translate-y-1 shadow-neutral-500/20'
      }
    } else {
      activeStyle = key.black
        ? 'bg-synth-neon shadow-synth-neon/40 translate-y-1'
        : 'bg-synth-neon border-synth-neon translate-y-1 shadow-synth-neon/20'
    }
  }

  const inactiveStyle = key.black
    ? 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700'
    : 'bg-neutral-100 border-neutral-200 hover:bg-neutral-200'

  const base = key.black
    ? 'absolute -left-[11px] top-0 w-5 h-20 z-20 rounded-b-md shadow-lg transition-all flex flex-col items-center justify-end pb-1 select-none cursor-pointer'
    : 'w-full h-full border-r border-neutral-900 rounded-b-md transition-all flex flex-col items-center justify-end pb-2 select-none cursor-pointer'

  return `${base} ${key.isActive ? activeStyle : inactiveStyle}`
}

function labelClass(key) {
  return key.black
    ? `font-mono font-bold pointer-events-none select-none text-[6px] mb-1 ${key.isActive ? 'text-black' : 'text-neutral-500'}`
    : `font-mono font-bold pointer-events-none select-none text-[8px] ${key.isActive ? 'text-black' : 'text-neutral-400'}`
}

// ─── Note handlers ────────────────────────────────────────────────────────────

function handleNoteOn(keyI) {
  const midiNote = keyI + (octave.value * 12)
  if (arpStore.arpEnabled) {
    if (arpStore.arpHold && physicalVirtualKeysHeld === 0) arpStore.clearHeldNotes()
    physicalVirtualKeysHeld++
    arpStore.pressNote(midiNote)
  } else {
    midiStore.sendNoteOn(midiNote, 100, MidiSource.KEYBOARD)
  }
  activeNotes.value = new Set(activeNotes.value).add(midiNote)
}

function handleNoteOff(keyI) {
  const midiNote = keyI + (octave.value * 12)
  if (arpStore.arpEnabled) {
    physicalVirtualKeysHeld = Math.max(0, physicalVirtualKeysHeld - 1)
    if (!arpStore.arpHold || (physicalVirtualKeysHeld === 0 && arpStore.heldNoteCount <= 1)) {
      arpStore.releaseNote(midiNote)
      if (arpStore.arpHold && physicalVirtualKeysHeld === 0 && arpStore.heldNoteCount <= 1) {
        arpStore.clearHeldNotes()
      }
    }
  } else {
    midiStore.sendNoteOff(midiNote, 0, MidiSource.KEYBOARD)
  }
  const next = new Set(activeNotes.value)
  next.delete(midiNote)
  activeNotes.value = next
}

function handleMouseLeave(keyI) {
  const midiNote = keyI + (octave.value * 12)
  if (activeNotes.value.has(midiNote) && !arpStore.arpEnabled) {
    handleNoteOff(keyI)
  }
}

// ─── Mod / Pitch ─────────────────────────────────────────────────────────────

function handleModChange(val) {
  modValue.value = val
  midiStore.sendCC(uiStore.globalModCC, val, MidiSource.KEYBOARD)
}

function handlePitchChange(val) {
  pitchValue.value = val
  if (pitchCC.value === 128) {
    midiStore.sendPitchBend(val, MidiSource.KEYBOARD)
  } else {
    midiStore.sendCC(pitchCC.value, Math.floor(val / 128), MidiSource.KEYBOARD)
  }
}

function startPitchDrag(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const onMove = (me) => {
    const y = Math.max(0, Math.min(rect.height, me.clientY - rect.top))
    handlePitchChange(Math.floor((1 - y / rect.height) * 16383))
  }
  onMove(e)
  const onUp = () => {
    handlePitchChange(8192)
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function startModDrag(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const onMove = (me) => {
    const y = Math.max(0, Math.min(rect.height, me.clientY - rect.top))
    handleModChange(Math.floor((1 - y / rect.height) * 127))
  }
  onMove(e)
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// ─── Watch pitchBend config ───────────────────────────────────────────────────

watch(() => configStore.midiConfig, (cfg) => {
  const pitchCfg = cfg?.find(c => c.name === 'pitchBend')
  if (pitchCfg?.cc !== undefined) pitchCC.value = pitchCfg.cc
}, { immediate: true })

// ─── MIDI listeners ───────────────────────────────────────────────────────────

let _unsubNote  = null
let _unsubCC    = null
let _unsubPitch = null

onMounted(() => {
  _unsubNote = midiService.addNoteListener((type, note, velocity, chan, inputId) => {
    if (props.inputChannel !== undefined && props.inputChannel !== -1 && chan !== props.inputChannel) return
    const inputDevice = midiService.getInputs().find(i => i.id === inputId)
    if (!midiStore.isDeviceRoutedToApp(inputDevice?.name, MidiSource.KEYBOARD, note)) return
    if (type === 'on' && velocity > 0) {
      extActiveNotes.value = new Set(extActiveNotes.value).add(note)
    } else {
      const next = new Set(extActiveNotes.value)
      next.delete(note)
      extActiveNotes.value = next
    }
  })

  _unsubCC = midiService.addCCListener((cc, val, chan) => {
    if (props.inputChannel !== undefined && props.inputChannel !== -1 && chan !== props.inputChannel) return
    if (cc === 1 || cc === uiStore.globalModCC) {
      modValue.value = val
    } else if (cc === pitchCC.value && pitchCC.value !== 128) {
      pitchValue.value = val * 128
    }
  })

  _unsubPitch = midiService.addPitchBendListener((val, chan) => {
    if (props.inputChannel !== undefined && props.inputChannel !== -1 && chan !== props.inputChannel) return
    if (pitchCC.value === 128) pitchValue.value = val
  })
})

onUnmounted(() => {
  _unsubNote?.()
  _unsubCC?.()
  _unsubPitch?.()
})
</script>

<template>
  <Transition name="keyboard" appear>
    <div class="fixed bottom-[52px] left-1/2 -translate-x-1/2 w-full max-w-4xl z-[700] bg-neutral-950/95 backdrop-blur-xl border border-neutral-800 rounded-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] p-2 md:px-4 pb-2">
      <div class="flex flex-col gap-2 relative">

        <!-- Header -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <button
              @click="emit('close')"
              class="p-2 hover:bg-neutral-900 rounded-lg text-neutral-500 hover:text-white transition-colors"
              title="Close Keyboard"
            >
              <X class="w-5 h-5" />
            </button>
            <div class="h-4 w-px bg-neutral-800" />
            <div class="flex flex-col">
              <span class="text-[10px] font-black text-synth-neon uppercase tracking-widest">Keyboard</span>
              <span class="text-[8px] font-mono text-neutral-500 uppercase tracking-tighter">S1_CONTROLLER_STRIP</span>
            </div>
          </div>
          <button
            @click="showSettings = !showSettings"
            :class="['p-2 rounded-lg transition-colors border', showSettings ? 'border-synth-neon text-synth-neon bg-synth-neon/10' : 'border-neutral-800 text-neutral-500 hover:text-white hover:bg-neutral-900']"
            title="MIDI Mapping Settings"
          >
            <Settings class="w-4 h-4" />
          </button>
        </div>

        <!-- Settings panel -->
        <Transition name="settings">
          <div v-if="showSettings" class="flex flex-wrap gap-4 p-4 bg-neutral-900/50 rounded-xl border border-neutral-800 w-full">
            <div class="flex flex-col">
              <span class="text-[8px] font-mono text-neutral-500 uppercase mb-1">Pitch MIDI CC#</span>
              <input
                :value="pitchCC"
                @input="e => pitchCC = parseInt(e.target.value) || 128"
                type="number"
                placeholder="128 (Bend)"
                class="bg-black border border-neutral-800 text-xs text-white rounded px-3 py-1.5 focus:border-synth-neon outline-none font-mono w-28"
              />
            </div>
            <div class="flex flex-col">
              <span class="text-[8px] font-mono text-neutral-500 uppercase mb-1">ModWheel Destination</span>
              <select
                :value="uiStore.globalModCC"
                @change="e => uiStore.globalModCC = parseInt(e.target.value)"
                class="bg-black border border-neutral-800 text-xs text-white rounded px-3 py-1.5 focus:border-synth-neon outline-none font-mono"
              >
                <option :value="1">ModWheel (CC 1)</option>
                <option
                  v-for="c in configStore.midiConfig.filter(c => c.cc !== undefined && c.cc !== 1)"
                  :key="c.name"
                  :value="c.cc"
                >{{ c.label || c.name }} (CC {{ c.cc }})</option>
              </select>
            </div>
          </div>
        </Transition>

        <!-- Main row: octave + pitch + mod + keys -->
        <div class="flex gap-4 items-end flex-1">

          <!-- Octave control -->
          <div class="flex flex-col items-center justify-end h-32 shrink-0">
            <span class="text-[8px] font-mono text-neutral-500 uppercase mb-2">Octave</span>
            <div class="flex flex-col items-center gap-1 bg-neutral-900 border border-neutral-800 rounded-lg p-1 h-24 justify-between">
              <button
                @click="octave = Math.min(7, octave + 1)"
                :disabled="octave === 7"
                class="p-1 hover:text-synth-neon transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronUp class="w-4 h-4" />
              </button>
              <span class="text-xs font-mono font-bold text-white px-1">{{ octave }}</span>
              <button
                @click="octave = Math.max(0, octave - 1)"
                :disabled="octave === 0"
                class="p-1 hover:text-synth-neon transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronDown class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Pitch Bend -->
          <div class="flex flex-col items-center justify-end h-32">
            <span class="text-[8px] font-mono text-neutral-500 uppercase mb-2">Pitch</span>
            <div
              class="h-24 w-8 bg-neutral-900 border border-neutral-800 rounded-lg relative overflow-hidden cursor-ns-resize shrink-0"
              @mousedown="startPitchDrag"
            >
              <div
                class="absolute bottom-0 left-0 w-full bg-synth-neon/40"
                :style="{ height: `${(pitchValue / 16383) * 100}%` }"
              />
              <div class="absolute top-1/2 left-0 w-full h-px bg-synth-neon/50 z-10" />
            </div>
          </div>

          <!-- Modulation -->
          <div class="flex flex-col items-center justify-end h-32">
            <span class="text-[8px] font-mono text-neutral-500 uppercase mb-2">Mod</span>
            <div
              class="h-24 w-8 bg-neutral-900 border border-neutral-800 rounded-lg relative overflow-hidden cursor-ns-resize shrink-0"
              @mousedown="startModDrag"
            >
              <div
                class="absolute bottom-0 left-0 w-full bg-synth-neon shadow-[0_0_10px_rgba(0,163,112,0.3)]"
                :style="{ height: `${(modValue / 127) * 100}%` }"
              />
            </div>
          </div>

          <!-- Piano keys (25 = 2 octaves + C) -->
          <div class="flex flex-col flex-1 ml-4 overflow-x-auto overflow-y-hidden custom-scrollbar">
            <div class="flex w-full items-start justify-center relative h-32">
              <template v-for="key in keys" :key="key.i">
                <div :class="['key-container relative', key.black ? 'w-0' : 'w-10 h-32']">
                  <button
                    :class="keyClass(key)"
                    @mousedown="handleNoteOn(key.i)"
                    @mouseup="handleNoteOff(key.i)"
                    @mouseleave="handleMouseLeave(key.i)"
                    @touchstart.prevent="handleNoteOn(key.i)"
                    @touchend.prevent="handleNoteOff(key.i)"
                  >
                    <span :class="labelClass(key)">{{ key.label }}</span>
                  </button>
                </div>
              </template>
            </div>
          </div>

        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.keyboard-enter-active,
.keyboard-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.keyboard-enter-from,
.keyboard-leave-to {
  transform: translate(-50%, 100%);
  opacity: 0;
}

.settings-enter-active,
.settings-leave-active {
  transition: opacity 0.15s ease, max-height 0.2s ease;
  overflow: hidden;
  max-height: 200px;
}
.settings-enter-from,
.settings-leave-to {
  opacity: 0;
  max-height: 0;
}
</style>
