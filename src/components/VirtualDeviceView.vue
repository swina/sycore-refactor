<script setup>
// Virtual Device view (the floating Virtual Device Panel and the DECK's device view share it): one
// UI per virtual instrument (multipart ones too) — an LCD-style display
// (preset position, browse TYPE All/Category, channel, bank:program, preset name, category) with
// PRESET ▼▲ and CHANNEL ▼▲ above it, the instrument's CC table as dials below, and saved sounds
// (one channel's preset + mapped control values, recalled onto the selected channel). State and MIDI in
// stores/useVirtualDeviceStore.ts; presets are stepped by the Program Change panel. Right-click a
// dial or a ▼▲ button for MIDI Learn. The header is a drag handle for the panel ('header-mousedown');
// slot `actions` takes the host's buttons (window controls, back to DECK…).
import { ref, computed, watch } from 'vue'
import { SlidersHorizontal, ChevronDown, ChevronUp, ChevronRight, Save, X, Music2, Table2 } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useVirtualDeviceStore, VD_SOUNDS_PER_CHANNEL, VD_CC_DEFAULT } from '@/stores/useVirtualDeviceStore'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { pcBrowse } from '@/lib/pc-browse'
import { bankProgramLabel, vdpCcParam, vdpActionParam, vdpSlotParam, LCD_THEMES, lcdTheme } from '@/lib/virtual-device'
import { dispatch } from '@/types/events'
import { useChordProgStore } from '@/stores/useChordProgStore'
import { useArpStore } from '@/stores/useArpStore'
import { usePlayerTrackInfo } from '@/composables/usePlayerTrackInfo'
import KnobDial from '@/components/ui/KnobDial.vue'

defineProps({ grab: { type: Boolean, default: false } })   // header shows a grab cursor (panel drag)
const emit = defineEmits(['header-mousedown'])
const uiStore = useUiStore()
const midiStore = useMidiStore()
const mappingStore = useMappingStore()
const vd = useVirtualDeviceStore()
const cpStore = useChordProgStore()
const arpStore = useArpStore()

// LCD bottom row, as the toolbar shows them: the playing track's key, the chord the Chord Prog plays
// now, the tempo (the track's BPM when one is loaded, else the global BPM)
const player = usePlayerTrackInfo()
const lcdTrackKey = computed(() => player.hasSrc.value ? player.trackKey.value : '')
const lcdBpm = computed(() => (player.hasSrc.value && player.trackBpm.value) || arpStore.arpBpm || null)

// the Controls panel can be collapsed (remembered)
const controlsOpen = ref((() => { try { return localStorage.getItem('SYCORE_VD_CONTROLS_OPEN') !== '0' } catch { return true } })())
watch(controlsOpen, v => { try { localStorage.setItem('SYCORE_VD_CONTROLS_OPEN', v ? '1' : '0') } catch {} })
const { openMenu } = useMidiContextMenu()

// the selected device, falling back to the first virtual instrument
const device = computed(() =>
  vd.devices.includes(vd.selectedDevice) ? vd.selectedDevice : (vd.devices[0] ?? ''))

const channel = computed(() => device.value ? vd.channel(device.value) : 0)
const channelList = computed(() => device.value ? vd.channels(device.value) : [])
const multipart = computed(() => device.value && midiStore.partChannels(device.value).length > 1)
const preset = computed(() => device.value ? vd.presetState(device.value, channel.value) : null)
const controls = computed(() => device.value ? vd.ccTable(device.value) : [])
// the selected channel's sounds on its current bank (the one the Program Change panel has open),
// laid out as VD_SOUNDS_PER_CHANNEL slots (null = empty)
const soundsBank = computed(() => device.value ? vd.bankOf(device.value, channel.value) : '')
const savedSounds = computed(() => device.value ? vd.soundsOf(device.value, channel.value) : [])
const soundSlots = computed(() =>
  Array.from({ length: VD_SOUNDS_PER_CHANNEL }, (_, i) => savedSounds.value.find(s => s.slot === i) ?? null))

// P0285: the preset's position in the bank the Program Change panel has open for it
const presetNumber = computed(() => {
  const b = pcBrowse.value
  if (b.device !== device.value || b.channel !== channel.value || b.index < 0) return 'P----'
  return 'P' + String(b.index + 1).padStart(4, '0')
})

// Keep the Program Change panel on this device (and channel: the store's setChannel does that on
// changes), so its bank is loaded for ▼▲.
watch(device, (d) => {
  if (d) dispatch('device-pc-select', { deviceName: d, channel: vd.channel(d) + 1 })
}, { immediate: true })

const mappedParams = computed(() => new Set(Object.values(mappingStore.midiMappings ?? {})
  .map(m => (typeof m === 'object' ? m?.paramName : m)).filter(Boolean)))

function learnMenu(e, name, label) {
  openMenu(e, { name, label: `${device.value}: ${label}` })
}

// LCD theme: CSS variables for the LCD (its classes read --lcd-*), the dials take its accent
const theme = computed(() => lcdTheme(vd.lcdThemeId))
const lcdStyle = computed(() => ({
  background: `linear-gradient(to bottom, ${theme.value.bg[0]}, ${theme.value.bg[1]})`,
  '--lcd-text': theme.value.text,
  '--lcd-bright': theme.value.bright,
}))
// the Sounds panel: the theme's colors on a transparent background
const soundsStyle = computed(() => ({
  '--lcd-text': theme.value.onDark?.text ?? theme.value.text,
  '--lcd-bright': theme.value.onDark?.bright ?? theme.value.bright,
}))

function onDial(cc, value) {
  if (value !== vd.getCc(device.value, cc, channel.value)) vd.setCc(device.value, cc, value)
}

// a value typed in the field under a dial (0..127; anything else snaps back)
function onTypedValue(cc, e) {
  const v = Math.round(Number(e.target.value))
  if (e.target.value === '' || !Number.isFinite(v)) { e.target.value = vd.getCc(device.value, cc, channel.value); return }
  const clamped = Math.max(0, Math.min(127, v))
  e.target.value = clamped
  vd.setCc(device.value, cc, clamped)
}

// ── Saved sounds ────────────────────────────────────────────────────────
const soundName = ref('')
// the Save row is collapsed until needed (remembered)
const saveOpen = ref((() => { try { return localStorage.getItem('SYCORE_VD_SAVE_OPEN') === '1' } catch { return false } })())
watch(saveOpen, v => { try { localStorage.setItem('SYCORE_VD_SAVE_OPEN', v ? '1' : '0') } catch {} })

// Select a pad (its sound is recalled: PC, then the controls) → name → Save writes onto that pad.
const selectedSlot = computed(() => device.value ? vd.selectedSlotOf(device.value) : null)

function saveSound() {
  if (selectedSlot.value == null) return
  vd.saveSound(device.value, soundName.value || preset.value?.soundName || '', selectedSlot.value)
}

function onSlotClick(i, s) {
  vd.selectSlot(device.value, i)
  soundName.value = s?.name ?? ''
}

// a pad selected from a controller: show its name for the next Save too
watch(selectedSlot, (i) => {
  if (i == null) return
  soundName.value = vd.soundAt(device.value, channel.value, i)?.name ?? ''
})


// a slot's MIDI Learn mark: learning now (orange) / mapped (teal)
function slotMark(i) {
  const name = vdpSlotParam(i, device.value)
  if (mappingStore.learningParamName === name) return 'bg-orange-500 animate-pulse'
  return mappedParams.value.has(name) ? 'bg-teal-400' : ''
}

// a learnable control's MIDI Learn mark by param name: learning now (orange) / mapped (teal)
function learnMark(name) {
  if (mappingStore.learningParamName === name) return 'bg-orange-500 animate-pulse'
  return mappedParams.value.has(name) ? 'bg-teal-400' : ''
}

// TYPE Category: the preset's position among its category's presets (3/12), '' when unknown
const categoryCount = computed(() => {
  const b = pcBrowse.value
  if (b.device !== device.value || b.channel !== channel.value || !b.catTotal) return ''
  return `${b.catIndex != null && b.catIndex >= 0 ? b.catIndex + 1 : '-'}/${b.catTotal}`
})

// ── TYPE Category: the CATEGORY knob steps through the open bank's categories ──
const categoryList = computed(() => device.value ? vd.categories(device.value) : [])
const categoryIdx = computed(() => device.value ? Math.max(0, vd.categoryIndex(device.value)) : 0)

function openCcTable() {
  uiStore.openPanel('midi-devices')
}
</script>

<template>
  <div class="flex flex-col min-h-0 max-h-full">
    <!-- Header -->
    <div class="flex items-center justify-between gap-3 px-4 py-2 bg-gradient-to-b from-white/5 to-transparent shrink-0 select-none" :class="grab ? 'cursor-grab active:cursor-grabbing' : ''" @mousedown="emit('header-mousedown', $event)">
      <div class="flex items-center gap-3 min-w-0">
        <div class="p-1.5 bg-teal-500/20 rounded-lg border border-teal-500/20">
          <SlidersHorizontal class="w-4 h-4 text-teal-300" />
        </div>
        <h2 class="text-sm font-black text-white tracking-[0.1em] uppercase whitespace-nowrap">Virtual Device</h2>
        <span class="bg-amber-400/70 text-[8px] rounded font-mono px-2 text-black">BETA</span>
      </div>
      <div class="flex items-center gap-2" @mousedown.stop>
        <!-- LCD theme -->
        <div class="flex items-center gap-1" title="LCD color">
          <button v-for="t in LCD_THEMES" :key="t.id" @click="vd.lcdThemeId = t.id" :title="t.label"
            class="w-3 h-3 rounded-full border transition-transform hover:scale-125"
            :class="vd.lcdThemeId === t.id ? 'border-white ring-1 ring-white/60' : 'border-neutral-600'"
            :style="{ background: `linear-gradient(135deg, ${t.bg[0]} 50%, ${t.text} 50%)` }" />
        </div>
        <select v-if="vd.devices.length" :value="device" @change="e => vd.selectedDevice = e.target.value"
          class="bg-neutral-900 border border-white/10 rounded px-2 py-1 text-[11px] text-white font-mono max-w-[200px]" title="Virtual instrument">
          <option v-for="d in vd.devices" :key="d" :value="d">{{ d }}</option>
        </select>
        <button class="p-1.5 rounded hover:bg-white/10 text-neutral-400 hover:text-white" title="Open in Program Change"
          @click="device && dispatch('device-pc-open', { deviceName: device })">
          <Music2 class="w-3.5 h-3.5" />
        </button>
        <slot name="actions" />
      </div>
    </div>

    <div v-if="!device" class="flex-1 flex items-center justify-center text-[11px] text-neutral-500 px-6 text-center">
      No virtual instruments yet — add one in MIDI Devices.
    </div>

    <div v-else class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 pb-3 flex flex-col gap-2">
      <!-- Device face: buttons above the LCD -->
      <div class="rounded-xl p-2 pt-1.5 bg-gradient-to-b from-neutral-300 to-neutral-500 border border-neutral-600 shadow-inner">
        <div class="grid grid-cols-4 items-center text-[9px] font-black uppercase tracking-widest text-neutral-800 mb-1 px-1">
          <div class="flex items-center gap-1.5">
            Preset
            <button class="w-5 h-4 flex items-center justify-center rounded-full bg-gradient-to-b from-neutral-500 to-neutral-700 text-neutral-100 border border-neutral-700 shadow hover:from-neutral-400" title="Previous preset (right-click: MIDI Learn)" @click="vd.stepPreset(device, -1)"
              @contextmenu.prevent="learnMenu($event, vdpActionParam('preset_prev', device), 'Preset ▼')"><ChevronDown class="w-3 h-3" /></button>
            <button class="w-5 h-4 flex items-center justify-center rounded-full bg-gradient-to-b from-neutral-500 to-neutral-700 text-neutral-100 border border-neutral-700 shadow hover:from-neutral-400" title="Next preset (right-click: MIDI Learn)" @click="vd.stepPreset(device, 1)"
              @contextmenu.prevent="learnMenu($event, vdpActionParam('preset_next', device), 'Preset ▲')"><ChevronUp class="w-3 h-3" /></button>
          </div>
          <div class="flex items-center gap-1.5 justify-center">
            Type
            <button class="w-8 h-3.5 rounded-full border border-neutral-700 shadow-inner relative transition-colors"
              :class="vd.browseScope === 'category' ? 'bg-teal-600' : 'bg-teal-900'"
              :title="(vd.browseScope === 'category' ? 'PRESET ▼▲ within the current category' : 'PRESET ▼▲ through all presets') + ' (right-click: MIDI Learn)'"
              @click="vd.toggleBrowseScope()"
              @contextmenu.prevent="learnMenu($event, vdpActionParam('type', device), 'Type All / Category')">
              <span class="absolute top-0.5 w-2.5 h-2.5 rounded-full bg-teal-200 transition-all" :class="vd.browseScope === 'category' ? 'left-[18px]' : 'left-0.5'" />
              <span v-if="learnMark(vdpActionParam('type', device))" class="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full" :class="learnMark(vdpActionParam('type', device))" />
            </button>
          </div>
          <div class="flex items-center gap-1.5 justify-center">
            Channel
            <button class="w-5 h-4 flex items-center justify-center rounded-full bg-gradient-to-b from-neutral-500 to-neutral-700 text-neutral-100 border border-neutral-700 shadow hover:from-neutral-400" title="Previous channel (right-click: MIDI Learn)" @click="vd.stepChannel(device, -1)"
              @contextmenu.prevent="learnMenu($event, vdpActionParam('ch_prev', device), 'Channel ▼')"><ChevronDown class="w-3 h-3" /></button>
            <button class="w-5 h-4 flex items-center justify-center rounded-full bg-gradient-to-b from-neutral-500 to-neutral-700 text-neutral-100 border border-neutral-700 shadow hover:from-neutral-400" title="Next channel (right-click: MIDI Learn)" @click="vd.stepChannel(device, 1)"
              @contextmenu.prevent="learnMenu($event, vdpActionParam('ch_next', device), 'Channel ▲')"><ChevronUp class="w-3 h-3" /></button>
          </div>
          <div class="text-right">Bank : Program</div>
        </div>

        <!-- LCD -->
        <div class="rounded-lg border-2 border-neutral-600 px-3 py-1.5 font-mono text-(--lcd-text) shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]" :style="lcdStyle">
          <div class="grid grid-cols-4 items-start">
            <span class="text-lg leading-none">{{ presetNumber }}</span>
            <span class="flex flex-col text-[10px] leading-tight justify-self-center">
              <span :class="vd.browseScope === 'all' ? 'text-(--lcd-bright)' : 'text-(--lcd-text)/40'">• All</span>
              <span :class="vd.browseScope === 'category' ? 'text-(--lcd-bright)' : 'text-(--lcd-text)/40'">• Category</span>
            </span>
            <span class="text-lg leading-none justify-self-center" :title="multipart ? 'Mapped channels: ' + channelList.map(c => c + 1).join(', ') : ''">
              {{ String(channel + 1).padStart(2, '0') }}
            </span>
            <span class="text-lg leading-none justify-self-end">{{ bankProgramLabel(preset) }}</span>
          </div>
          <div class="text-2xl leading-tight mt-0.5 truncate" :class="preset?.soundName ? '' : 'text-(--lcd-text)/40'">
            {{ preset?.soundName ?? 'No preset' }}
          </div>
          <div class="flex justify-between items-end text-[10px] min-h-[1em]">
            <span class="text-[8px] uppercase tracking-widest text-(--lcd-text)/40">Category</span>
            <span>{{ preset?.category || '' }}<template v-if="vd.browseScope === 'category' && categoryCount"> · {{ categoryCount }}</template></span>
          </div>
          <!-- track key · Chord Prog chord · tempo (like the toolbar) -->
          <div class="grid grid-cols-3 items-end text-base leading-tight mt-1 pt-0.5 border-t border-(--lcd-text)/20">
            <span class="truncate" title="Key of the playing track (Tracks Player)">
              <span class="text-[9px] uppercase tracking-widest text-(--lcd-text)/40">Key </span>{{ lcdTrackKey || '--' }}
            </span>
            <span class="truncate justify-self-center" title="Chord Prog — playing chord">
              <span class="text-[9px] uppercase tracking-widest text-(--lcd-text)/40">Chord </span><span :class="cpStore.playingChordName ? 'text-(--lcd-bright)' : ''">{{ cpStore.playingChordName || '--' }}</span>
            </span>
            <span class="justify-self-end" :title="player.hasSrc.value && player.trackBpm.value ? 'Tempo of the playing track' : 'Global tempo'">
              {{ lcdBpm ?? '--' }}<span class="text-[9px] uppercase tracking-widest text-(--lcd-text)/40"> BPM</span>
            </span>
          </div>
        </div>

        <!-- TYPE Category: a knob through the open bank's categories (sends each one's first preset) -->
        <div v-if="vd.browseScope === 'category'" class="flex items-center gap-2 mt-1.5 px-1 text-[9px] font-black uppercase tracking-widest text-neutral-800">
          <div class="relative" :title="categoryList.length ? 'Category: turn to pick one — its first preset is sent (right-click: MIDI Learn)' : 'No categories in the open bank'"
            @contextmenu.prevent="learnMenu($event, vdpActionParam('category', device), 'Category')">
            <KnobDial :model-value="categoryIdx" :min="0" :max="Math.max(1, categoryList.length - 1)" :step="1" :size="30"
              :show-value="false" :color="theme.accent" @change="v => v !== categoryIdx && vd.selectCategory(device, v)" />
            <span v-if="learnMark(vdpActionParam('category', device))" class="absolute top-0 right-0 w-1.5 h-1.5 rounded-full" :class="learnMark(vdpActionParam('category', device))" />
          </div>
          Category
          <span class="font-mono normal-case tracking-normal text-[10px] text-neutral-900 truncate">
            {{ categoryList.length ? categoryList[categoryIdx] : 'none in the open bank' }}
          </span>
        </div>
      </div>

      <!-- Controls: the instrument's CC table -->
      <div class="rounded-xl border border-white/10 bg-neutral-900/60 px-3 py-2">
        <div class="flex items-center justify-between" :class="controlsOpen ? 'mb-1' : ''">
          <button class="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-neutral-500 hover:text-white"
            :title="controlsOpen ? 'Hide the controls' : 'Show the controls'" @click="controlsOpen = !controlsOpen">
            <ChevronRight class="w-3 h-3 transition-transform" :class="controlsOpen ? 'rotate-90' : ''" />
            Controls · CH {{ channel + 1 }}<template v-if="!controlsOpen && controls.length"> · {{ controls.length }}</template>
          </button>
          <button class="flex items-center gap-1 text-[9px] font-mono text-neutral-500 hover:text-white" title="Edit the CC table in MIDI Devices" @click="openCcTable">
            <Table2 class="w-3 h-3" /> CC table
          </button>
        </div>
        <template v-if="controlsOpen">
        <p v-if="!controls.length" class="text-[10px] text-neutral-600 italic">
          No CC table for {{ device }} — add named CCs in MIDI Devices → CC Table.
        </p>
        <div v-else class="grid grid-cols-8 gap-x-2 gap-y-2">
          <div v-for="row in controls" :key="row.cc" class="relative flex flex-col items-center min-w-0"
            :title="`${row.name || 'CC ' + row.cc} · CC ${row.cc} → CH ${channel + 1} (right-click: MIDI Learn)`"
            @contextmenu.prevent="learnMenu($event, vdpCcParam(device, row.cc), row.name || `CC ${row.cc}`)">
            <KnobDial :model-value="vd.getCc(device, row.cc, channel)" :min="0" :max="127" :step="1" :default-val="VD_CC_DEFAULT" :size="44"
              :show-value="false" :color="theme.accent" @change="v => onDial(row.cc, v)" />
            <!-- the value, typed in: Enter / leaving the field sends it -->
            <input type="number" min="0" max="127" step="1"
              :value="vd.getCc(device, row.cc, channel)"
              @change="e => onTypedValue(row.cc, e)"
              @keydown.enter="e => e.target.blur()"
              @mousedown.stop
              class="w-10 bg-black/60 border border-neutral-800 rounded text-[10px] font-mono text-neutral-300 text-center py-0 mt-0.5 outline-none focus:border-teal-500/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
            <span class="text-[11px] text-neutral-200 font-mono truncate w-full text-center leading-tight">{{ row.name || `CC ${row.cc}` }}</span>
            <span v-if="mappedParams.has(vdpCcParam(device, row.cc)) || mappingStore.learningParamName === vdpCcParam(device, row.cc)"
              class="absolute top-0 right-1 w-1.5 h-1.5 rounded-full"
              :class="mappingStore.learningParamName === vdpCcParam(device, row.cc) ? 'bg-orange-500 animate-pulse' : 'bg-teal-400'" />
          </div>
        </div>
        </template>
      </div>

      <!-- Saved sounds: up to 8 per channel and bank, the Save row collapsed until needed -->
      <!-- the LCD theme's colors (--lcd-* variables) on a transparent background -->
      <div class="rounded-xl border border-(--lcd-text)/20 px-3 py-2 flex flex-col gap-1.5 font-mono text-(--lcd-text)" :style="soundsStyle">
        <div class="flex items-center gap-2">
          <button class="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-(--lcd-text)/70 hover:text-(--lcd-bright) shrink-0"
            :title="saveOpen ? 'Hide Save' : 'Save this channel\'s preset and mapped controls'" @click="saveOpen = !saveOpen">
            <ChevronRight class="w-3 h-3 transition-transform" :class="saveOpen ? 'rotate-90' : ''" />
            Sounds · CH {{ channel + 1 }}<template v-if="soundsBank"> · {{ soundsBank }}</template>
          </button>
          <span class="text-[9px] font-mono text-(--lcd-text)/50">{{ savedSounds.length }}/{{ VD_SOUNDS_PER_CHANNEL }}</span>
          <template v-if="saveOpen">
            <input v-model="soundName" @keydown.enter="saveSound" :placeholder="preset?.soundName ?? 'Sound name'"
              class="flex-1 min-w-0 bg-black/30 border border-(--lcd-text)/30 rounded px-2 py-0.5 text-[11px] text-(--lcd-bright) placeholder:text-(--lcd-text)/40 font-mono outline-none focus:border-(--lcd-text)/70 disabled:opacity-40" />
            <button class="flex items-center gap-1 px-2 py-0.5 rounded border border-(--lcd-text)/50 text-(--lcd-bright) text-[10px] font-bold uppercase hover:bg-(--lcd-text)/15 disabled:opacity-30 disabled:hover:bg-transparent"
              :disabled="selectedSlot == null"
              :title="selectedSlot == null ? 'Select a pad first' : (soundSlots[selectedSlot] ? `Overwrite pad ${selectedSlot + 1} (${soundSlots[selectedSlot].name})` : `Save on pad ${selectedSlot + 1}`)" @click="saveSound">
              <Save class="w-3 h-3" /> Save
            </button>
          </template>
        </div>
        <p v-if="saveOpen" class="text-[9px] font-mono text-(--lcd-text)/60 -mt-0.5">
          Select a pad, type a name, Save — a used pad is overwritten.{{ selectedSlot != null ? ` Pad ${selectedSlot + 1} selected.` : '' }}
        </p>
        <div class="grid grid-cols-4 sm:grid-cols-8 gap-1">
          <template v-for="(s, i) in soundSlots" :key="s?.id ?? 'empty-' + i">
            <div v-if="s"
              @contextmenu.prevent="learnMenu($event, vdpSlotParam(i, device), `Sound slot ${i + 1}`)"
              class="relative flex items-center rounded border pl-1.5 pr-4 py-1 text-[10px] font-mono cursor-pointer transition-colors truncate"
              :class="selectedSlot === i ? 'border-(--lcd-bright) bg-(--lcd-text)/20 text-(--lcd-bright) ring-1 ring-(--lcd-bright)/60' : 'border-(--lcd-text)/40 text-(--lcd-text) hover:border-(--lcd-text)/80'"
              :title="`Pad ${i + 1}: ${s.name} — select & recall on CH ${channel + 1}: ${s.preset?.soundName ?? 'no preset'} + ${Object.keys(s.cc).length} mapped controls (right-click: MIDI Learn)`"
              @click="onSlotClick(i, s)">
              <span class="truncate">{{ s.name }}</span>
              <span v-if="slotMark(i)" class="absolute top-0.5 left-0.5 w-1 h-1 rounded-full" :class="slotMark(i)" />
              <button class="absolute right-0.5 p-0.5 text-(--lcd-text)/50 hover:text-red-400" title="Delete" @click.stop="vd.deleteSound(device, s.id)">
                <X class="w-2.5 h-2.5" />
              </button>
            </div>
            <div v-else
              @contextmenu.prevent="learnMenu($event, vdpSlotParam(i, device), `Sound slot ${i + 1}`)"
              :title="`Pad ${i + 1}: empty — select it to save here (right-click: MIDI Learn)`"
              @click="onSlotClick(i, null)"
              class="relative rounded border border-dashed py-1 text-[10px] font-mono text-center cursor-pointer"
              :class="selectedSlot === i ? 'border-(--lcd-bright) text-(--lcd-bright) bg-(--lcd-text)/15' : 'border-(--lcd-text)/25 text-(--lcd-text)/40 hover:border-(--lcd-text)/60'">
              {{ i + 1 }}
              <span v-if="slotMark(i)" class="absolute top-0.5 left-0.5 w-1 h-1 rounded-full" :class="slotMark(i)" />
            </div>
          </template>
        </div>
      </div>
    </div>

  </div>
</template>
