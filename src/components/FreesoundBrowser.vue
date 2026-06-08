<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import {
  Search, Play, Pause, Plus, Loader2, Music2,
  ChevronLeft, ChevronRight, Repeat, BadgeCheck, X,
  Download, HardDrive, Trash2, FileAudio, KeyRound, DatabaseZap
} from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useArpStore } from '@/stores/useArpStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useFreesoundBrowserState } from '@/composables/useFreesoundBrowserState'
import { useFreesoundCache } from '@/composables/useFreesoundCache'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'

const uiStore      = useUiStore()
const authStore    = useAuthStore()
const midiStore    = useMidiStore()
const arpStore     = useArpStore()
const mappingStore = useMappingStore()
const { openMenu } = useMidiContextMenu()

const hasApiKey = computed(() => !!authStore.profile?.freesoundApiKey || !!import.meta.env.VITE_FREESOUND_API_KEY)

const { isDownloaded, isDownloading, downloadSound, deleteCache, getCachedUrl, getCachedSounds, cachedIds } = useFreesoundCache()

const {
  query, minDur, maxDur, cc0Only,
  results, totalCount, isLoading, error,
  page, nextUrl, prevUrl,
  doSearch, onNext, onPrev,
} = useFreesoundBrowserState()

// ── Preview audio ──────────────────────────────────────────────────
const previewAudio   = new Audio()
const previewingId   = ref(null)
const previewPlaying = ref(false)

previewAudio.addEventListener('ended', () => {
  previewPlaying.value = false
  previewingId.value   = null
})

function formatTime(t) {
  if (!t || isNaN(t)) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function togglePreview(sound) {
  if (previewingId.value === sound.freesoundId) {
    if (previewPlaying.value) {
      previewAudio.pause(); previewPlaying.value = false
    } else {
      previewAudio.play().catch(() => {}); previewPlaying.value = true
    }
    return
  }
  previewAudio.pause()
  getCachedUrl(sound.id).then(blobUrl => {
    previewAudio.src = blobUrl || sound.previews?.['preview-hq-mp3'] || sound.previews?.['preview-lq-mp3'] || ''
    previewAudio.play().catch(() => {})
  })
  previewingId.value   = sound.freesoundId
  previewPlaying.value = true
}

// ── Local cache view ─────────────────────────────────────────────
const localOnly       = ref(false)
const cachedSounds    = ref([])
const localQuery      = ref('')
const localSortBy     = ref('date') // 'date' | 'name' | 'duration'

async function loadCachedSounds() {
  cachedSounds.value = await getCachedSounds()
}

const filteredCachedSounds = computed(() => {
  let list = cachedSounds.value
  const q = localQuery.value.trim().toLowerCase()
  if (q) list = list.filter(s => s.label.toLowerCase().includes(q) || s.author.toLowerCase().includes(q))
  if (localSortBy.value === 'name')     return [...list].sort((a, b) => a.label.localeCompare(b.label))
  if (localSortBy.value === 'duration') return [...list].sort((a, b) => a.duration - b.duration)
  return [...list].sort((a, b) => (b.downloadedAt || '').localeCompare(a.downloadedAt || ''))
})

watch(localOnly, (v) => { if (v) loadCachedSounds() })
watch(cachedIds, () => { if (localOnly.value) loadCachedSounds() }, { deep: true })

// ── Add to playlist ──────────────────────────────────────────────
function addToPlaylist(sound) {
  const { tags, license, previews, freesoundId, ...track } = sound
  window.dispatchEvent(new CustomEvent('freesound-add-to-playlist', { detail: track }))
}

// ── Loop pad assignment ──────────────────────────────────────────
const LS_LPP_LOOP_PADS = 'SYCORE_LPP_LOOP_PADS'
const pickingPadFor    = ref(null)
const pendingPadSlot   = ref(null)
const pendingBpm       = ref('')
const bpmInput         = ref(null)
const loopPadsSnapshot = ref(readLoopPads())

function readLoopPads() {
  try {
    const v = localStorage.getItem(LS_LPP_LOOP_PADS)
    const arr = v ? JSON.parse(v) : []
    while (arr.length < 8) arr.push(null)
    return arr.slice(0, 8)
  } catch { return Array(8).fill(null) }
}

function openPadPicker(sound) {
  if (pickingPadFor.value?.freesoundId === sound.freesoundId) {
    pickingPadFor.value = null; pendingPadSlot.value = null; pendingBpm.value = ''; return
  }
  loopPadsSnapshot.value = readLoopPads()
  pickingPadFor.value    = sound
  pendingPadSlot.value   = null
  pendingBpm.value       = ''
}

function selectPadSlot(padIdx) {
  pendingPadSlot.value = padIdx
  pendingBpm.value     = ''
  nextTick(() => bpmInput.value?.focus())
}

function confirmPadAssign() {
  if (pendingPadSlot.value == null || !pickingPadFor.value) return
  const bpm   = pendingBpm.value !== '' ? Number(pendingBpm.value) : undefined
  const track = {
    id: pickingPadFor.value.id, label: pickingPadFor.value.label,
    url: pickingPadFor.value.url, author: pickingPadFor.value.author,
    duration: pickingPadFor.value.duration, ...(bpm ? { bpm } : {}),
  }
  window.dispatchEvent(new CustomEvent('loop-pad-assign', { detail: { padIdx: pendingPadSlot.value, track } }))
  const updated = [...loopPadsSnapshot.value]
  updated[pendingPadSlot.value] = track
  loopPadsSnapshot.value = updated
  pendingPadSlot.value = null; pendingBpm.value = ''; pickingPadFor.value = null
}

// ── Send to AudioCapture ─────────────────────────────────────────
const capturePickerFor  = ref(null)
const captureBpm        = ref('')
const captureBpmInput   = ref(null)
const isSendingToCapture = ref(false)

function openCapturePicker(sound) {
  if (capturePickerFor.value?.freesoundId === sound.freesoundId) {
    capturePickerFor.value = null; captureBpm.value = ''; return
  }
  capturePickerFor.value = sound
  // Prefer the sound's own BPM from Freesound analysis, fall back to global BPM
  captureBpm.value = sound.bpm != null
    ? String(sound.bpm)
    : midiStore.currentBpm > 0 ? String(midiStore.currentBpm) : ''
  nextTick(() => captureBpmInput.value?.focus())
}

async function confirmCaptureAndSend() {
  if (!capturePickerFor.value || isSendingToCapture.value) return
  const bpm = captureBpm.value !== '' ? Number(captureBpm.value) : null
  if (bpm !== null && bpm > 0) {
    arpStore.arpBpm      = bpm
    midiStore.currentBpm = bpm
    midiStore.setBpm(bpm)
  }
  const sound = capturePickerFor.value
  capturePickerFor.value = null
  captureBpm.value = ''
  isSendingToCapture.value = true
  try {
    const cachedUrl = await getCachedUrl(sound.id)
    const fetchUrl  = cachedUrl ?? (sound.previews?.['preview-hq-mp3'] || sound.previews?.['preview-lq-mp3'] || sound.url)
    const res = await fetch(fetchUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    window.dispatchEvent(new CustomEvent('freesound-send-to-capture', {
      detail: { blob, label: sound.label, author: sound.author, duration: sound.duration, id: sound.id, bpm }
    }))
  } catch (e) {
    console.error('[FreesoundBrowser] sendToCapture failed', e)
  } finally {
    isSendingToCapture.value = false
  }
}

// ── Drag & resize ─────────────────────────────────────────────────
const MIN_W = 420
const MIN_H = 320

const pos  = ref({ x: 0, y: 0 })
const size = ref({ w: 700, h: 620 })

let dragging = false
let resizing = false
let dragOffset  = { x: 0, y: 0 }
let resizeStart = { mx: 0, my: 0, w: 0, h: 0 }

function center() {
  pos.value = {
    x: Math.max(0, (window.innerWidth  - size.value.w) / 2),
    y: Math.max(0, (window.innerHeight - size.value.h) / 2),
  }
}

watch(() => uiStore.isFreesoundBrowserOpen, (open) => { if (open) center() })

function startDrag(e) {
  if (e.button !== 0) return
  dragging   = true
  dragOffset = { x: e.clientX - pos.value.x, y: e.clientY - pos.value.y }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup',  onMouseUp)
}

function startResize(e) {
  if (e.button !== 0) return
  e.preventDefault()
  resizing    = true
  resizeStart = { mx: e.clientX, my: e.clientY, w: size.value.w, h: size.value.h }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup',  onMouseUp)
}

function onMouseMove(e) {
  if (dragging) {
    pos.value = {
      x: Math.max(0, Math.min(window.innerWidth  - size.value.w, e.clientX - dragOffset.x)),
      y: Math.max(0, Math.min(window.innerHeight - size.value.h, e.clientY - dragOffset.y)),
    }
  }
  if (resizing) {
    size.value = {
      w: Math.min(Math.max(MIN_W, resizeStart.w + e.clientX - resizeStart.mx), window.innerWidth  - pos.value.x),
      h: Math.min(Math.max(MIN_H, resizeStart.h + e.clientY - resizeStart.my), window.innerHeight - pos.value.y),
    }
  }
}

function onMouseUp() {
  dragging = false; resizing = false
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup',  onMouseUp)
}

// ── ESC to close ──────────────────────────────────────────────────
function onKeydown(e) {
  if (e.key === 'Escape' && uiStore.isFreesoundBrowserOpen)
    uiStore.isFreesoundBrowserOpen = false
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  previewAudio.pause(); previewAudio.src = ''
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup',  onMouseUp)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="uiStore.isFreesoundBrowserOpen"
      class="fixed inset-0 bg-black/60 backdrop-blur-sm z-modal"
      @click.self="uiStore.isFreesoundBrowserOpen = false"
    >
      <!-- Dialog shell -->
      <div
        class="fixed flex flex-col bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
        :style="{ left: pos.x + 'px', top: pos.y + 'px', width: size.w + 'px', height: size.h + 'px' }"
      >

        <!-- ── Header / drag handle ───────────────────────────────── -->
        <div
          @mousedown="startDrag"
          class="shrink-0 flex items-center justify-between px-5 py-3 border-b border-neutral-800 bg-neutral-950/60 cursor-grab active:cursor-grabbing select-none"
        >
          <div class="flex items-center gap-3 pointer-events-none">
            <div class="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
              <Repeat class="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div>
              <span class="text-sm font-black uppercase tracking-[0.2em] text-white leading-none">Freesound</span>
              <p class="text-[9px] font-mono text-cyan-500/60 uppercase tracking-widest leading-none mt-0.5">Browse · Preview · Add to Playlist or Loop Pad</p>
            </div>
          </div>
          <button
            @click="uiStore.isFreesoundBrowserOpen = false"
            @mousedown.stop
            class="ml-3 shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- ── No API key gate ───────────────────────────────────── -->
        <div v-if="!hasApiKey" class="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div class="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <KeyRound class="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <p class="text-sm font-black uppercase tracking-widest text-white mb-1">API Key Required</p>
            <p class="text-[11px] font-mono text-neutral-400 max-w-[280px] leading-relaxed">
              A personal Freesound API key is needed to use this browser.
              Add yours in your profile settings.
            </p>
          </div>
          <button
            @click="uiStore.isFreesoundBrowserOpen = false; uiStore.isProfileOpen = true"
            class="px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-black uppercase tracking-widest hover:bg-amber-500/20 transition-colors"
          >
            Open Profile Settings
          </button>
        </div>

        <!-- ── Fixed: search + filters + pad picker ───────────────── -->
        <template v-if="hasApiKey">
        <div class="shrink-0 flex flex-col gap-3 px-5 pt-4 pb-3 border-b border-neutral-800/60 bg-neutral-950/20">

          <!-- Search bar -->
          <div class="flex gap-2">
            <div class="relative flex-1">
              <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-500 pointer-events-none" />
              <input
                v-model="query"
                type="text"
                placeholder="Search freesound.org…"
                @keydown.enter="doSearch()"
                class="w-full bg-black border border-neutral-800 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-neutral-600 focus:border-cyan-500/60 outline-none"
              />
            </div>
            <button
              @click="doSearch()"
              :disabled="isLoading"
              class="px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-black uppercase tracking-widest hover:bg-cyan-500/20 transition-colors disabled:opacity-40"
            >Search</button>
          </div>

          <!-- Filters row -->
          <div class="flex items-center gap-4 flex-wrap">
            <div class="flex items-center gap-2">
              <span class="text-[9px] font-black uppercase tracking-widest text-neutral-500 shrink-0">Duration</span>
              <input v-model="minDur" type="number" min="0" placeholder="Min s"
                class="w-14 bg-black border border-neutral-800 rounded px-2 py-1 text-[10px] text-white placeholder-neutral-700 focus:border-cyan-500/60 outline-none" />
              <span class="text-neutral-700 text-[10px]">–</span>
              <input v-model="maxDur" type="number" min="0" placeholder="Max s"
                class="w-14 bg-black border border-neutral-800 rounded px-2 py-1 text-[10px] text-white placeholder-neutral-700 focus:border-cyan-500/60 outline-none" />
            </div>
            <div class="w-px h-4 bg-neutral-800" />
            <button
              @click="cc0Only = !cc0Only"
              :class="['flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all',
                cc0Only ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                        : 'border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-neutral-400']"
              title="Filter: Creative Commons 0 (public domain) only"
            >
              <BadgeCheck class="w-3 h-3" /> CC0 Only
            </button>
            <div class="w-px h-4 bg-neutral-800" />
            <button
              @click="localOnly = !localOnly"
              :class="['flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all',
                localOnly ? 'bg-sky-500/15 border-sky-500/40 text-sky-400'
                          : 'border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-neutral-400']"
              :title="`Show locally cached sounds (${cachedIds.size})`"
            >
              <DatabaseZap class="w-3 h-3" /> Local <span class="opacity-60">({{ cachedIds.size }})</span>
            </button>
            <span v-if="!localOnly && totalCount > 0 && !isLoading" class="text-[9px] text-neutral-600 font-mono ml-auto">
              {{ totalCount.toLocaleString() }} results · page {{ page }}
            </span>
            <span v-if="localOnly" class="text-[9px] text-neutral-600 font-mono ml-auto">
              {{ filteredCachedSounds.length }} cached
            </span>
          </div>

          <!-- Error -->
          <div v-if="error" class="text-[10px] text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
            {{ error }}
          </div>

          <!-- Capture BPM picker -->
          <Transition name="fade-down">
            <div v-if="capturePickerFor" class="bg-neutral-950 border border-violet-500/30 rounded-xl p-3">
              <div class="flex items-center justify-between mb-2">
                <span class="text-[9px] font-black uppercase tracking-widest text-violet-400 flex items-center gap-1.5">
                  <FileAudio class="w-3 h-3" /> Send to Audio Capture
                </span>
                <span class="text-[9px] text-neutral-500 truncate max-w-[200px] italic">{{ capturePickerFor.label }}</span>
                <button @click="capturePickerFor = null; captureBpm = ''" class="text-neutral-600 hover:text-white transition-colors ml-2 shrink-0">
                  <X class="w-3 h-3" />
                </button>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-[9px] font-black uppercase tracking-widest text-neutral-500 shrink-0">BPM</span>
                <input
                  ref="captureBpmInput"
                  v-model="captureBpm"
                  type="number" min="1" max="999" placeholder="e.g. 120"
                  @keydown.enter="confirmCaptureAndSend"
                  @keydown.esc="capturePickerFor = null; captureBpm = ''"
                  class="w-24 bg-black border border-neutral-700 rounded-lg px-2 py-1 text-xs text-white font-mono outline-none focus:border-violet-500 placeholder-neutral-700"
                />
                <span class="text-[8px] text-neutral-600 font-mono">Sets global BPM · auto-discovers loop</span>
                <button
                  @click="confirmCaptureAndSend"
                  :disabled="isSendingToCapture"
                  class="flex-1 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-50"
                >
                  {{ isSendingToCapture ? 'Loading…' : 'Capture + Auto Loop' }}
                </button>
                <button @click="capturePickerFor = null; captureBpm = ''"
                  class="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-[10px] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </Transition>

          <!-- Pad picker -->
          <Transition name="fade-down">
            <div v-if="pickingPadFor" class="bg-neutral-950 border border-cyan-500/30 rounded-xl p-3">
              <div class="flex items-center justify-between mb-2">
                <span class="text-[9px] font-black uppercase tracking-widest text-cyan-400 flex items-center gap-1.5">
                  <Repeat class="w-3 h-3" /> Assign to Loop Pad
                </span>
                <span class="text-[9px] text-neutral-500 truncate max-w-[200px] italic">{{ pickingPadFor.label }}</span>
                <button @click="pickingPadFor = null; pendingPadSlot = null" class="text-neutral-600 hover:text-white transition-colors ml-2 shrink-0">
                  <X class="w-3 h-3" />
                </button>
              </div>
              <div class="grid grid-cols-8 gap-1.5">
                <div v-for="(slot, i) in loopPadsSnapshot" :key="i" class="relative">
                  <button
                    @click="selectPadSlot(i)"
                    @contextmenu.prevent="openMenu($event, { name: 'lpp_loop_' + i, label: 'Loop Pad ' + (i + 1) })"
                    :class="['w-full h-10 rounded-lg border flex flex-col items-center justify-center p-1 transition-all',
                      pendingPadSlot === i
                        ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                        : slot
                          ? 'border-cyan-500/40 bg-cyan-500/5 hover:bg-cyan-500/20 hover:border-cyan-400/60'
                          : 'border-neutral-700 bg-neutral-900 hover:border-cyan-500/50 hover:bg-cyan-500/5']"
                    :title="slot ? `Replace: ${slot.label} (right-click to MIDI learn)` : `Assign to Pad ${i + 1} (right-click to MIDI learn)`"
                  >
                    <span class="text-[9px] font-black text-neutral-400">{{ i + 1 }}</span>
                    <span v-if="slot" class="text-[6px] text-cyan-400/70 truncate w-full text-center leading-none px-0.5">{{ slot.label?.slice(0, 7) }}</span>
                    <span v-else class="text-[6px] text-neutral-700 leading-none">empty</span>
                  </button>
                  <!-- MIDI learning indicator -->
                  <span
                    v-if="mappingStore.learningParamName === 'lpp_loop_' + i"
                    class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none"
                  />
                </div>
              </div>
              <Transition name="fade-down">
                <div v-if="pendingPadSlot != null" class="flex items-center gap-2 mt-2 pt-2 border-t border-neutral-800">
                  <span class="text-[9px] font-black uppercase tracking-widest text-neutral-500 shrink-0">BPM</span>
                  <input ref="bpmInput" v-model="pendingBpm" type="number" min="1" max="999" placeholder="optional"
                    @keydown.enter="confirmPadAssign" @keydown.esc="pendingPadSlot = null"
                    class="w-24 bg-black border border-neutral-700 rounded-lg px-2 py-1 text-xs text-white font-mono outline-none focus:border-cyan-500 placeholder-neutral-700" />
                  <button @click="confirmPadAssign"
                    class="flex-1 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-black text-[10px] font-black uppercase tracking-widest transition-colors">
                    Assign to Pad {{ pendingPadSlot + 1 }}
                  </button>
                  <button @click="pendingPadSlot = null"
                    class="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-[10px] transition-colors">
                    Cancel
                  </button>
                </div>
              </Transition>
            </div>
          </Transition>
        </div>

        <!-- ── Scrollable results ─────────────────────────────────── -->
        <div class="flex-1 overflow-y-auto min-h-0 custom-scrollbar">

          <!-- ── Local cache view ──────────────────────────────────── -->
          <template v-if="localOnly">
            <!-- Local search + sort bar -->
            <div class="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 bg-neutral-900/90 backdrop-blur border-b border-neutral-800/60">
              <div class="relative flex-1">
                <Search class="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-500 pointer-events-none" />
                <input
                  v-model="localQuery"
                  type="text"
                  placeholder="Filter cached…"
                  class="w-full bg-black border border-neutral-800 rounded pl-6 pr-2 py-1 text-[10px] text-white placeholder-neutral-700 focus:border-sky-500/60 outline-none"
                />
              </div>
              <select
                v-model="localSortBy"
                class="bg-black border border-neutral-800 rounded px-2 py-1 text-[10px] text-neutral-400 focus:border-sky-500/60 outline-none"
              >
                <option value="date">Latest</option>
                <option value="name">Name</option>
                <option value="duration">Duration</option>
              </select>
            </div>

            <!-- Empty cache -->
            <div v-if="filteredCachedSounds.length === 0"
              class="flex flex-col items-center gap-2 py-10 text-neutral-600">
              <DatabaseZap class="w-6 h-6" />
              <span class="text-[10px] uppercase font-black tracking-widest">No cached sounds</span>
            </div>

            <!-- Cached list -->
            <div v-else class="flex flex-col gap-1 p-4">
              <div
                v-for="sound in filteredCachedSounds" :key="sound.id"
                class="group flex items-center gap-2 px-2 py-2 rounded-lg bg-sky-950/20 border border-sky-900/30 hover:border-sky-700/40 transition-colors"
              >
                <!-- Preview -->
                <button
                  @click="togglePreview(sound)"
                  :class="['shrink-0 w-6 h-6 flex items-center justify-center rounded-full border transition-colors',
                    previewingId === sound.freesoundId && previewPlaying
                      ? 'bg-sky-500/20 border-sky-400 text-sky-400'
                      : 'border-neutral-700 text-neutral-500 hover:border-sky-500/50 hover:text-sky-400']"
                >
                  <Pause v-if="previewingId === sound.freesoundId && previewPlaying" class="w-2.5 h-2.5 fill-current" />
                  <Play  v-else class="w-2.5 h-2.5 fill-current ml-px" />
                </button>

                <!-- Info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <span class="text-[10px] font-bold text-white truncate leading-tight">{{ sound.label }}</span>
                  </div>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="text-[9px] text-neutral-500 font-mono">{{ sound.author }}</span>
                    <span class="text-[9px] text-neutral-700 font-mono">{{ formatTime(sound.duration) }}</span>
                    <span v-if="sound.size" class="text-[9px] text-neutral-700 font-mono">{{ (sound.size / 1024).toFixed(0) }}KB</span>
                  </div>
                </div>

                <!-- Cache badge -->
                <HardDrive class="shrink-0 w-3 h-3 text-sky-400/60" title="Cached locally" />

                <!-- Actions -->
                <div class="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <button @click="addToPlaylist(sound)"
                    class="flex items-center gap-1 px-2 py-1 rounded bg-synth-neon/10 border border-synth-neon/30 text-synth-neon hover:bg-synth-neon/20 text-[9px] font-black uppercase tracking-widest transition-colors"
                    title="Add to playlist">
                    <Plus class="w-2.5 h-2.5" /> Add
                  </button>
                  <button @click.stop="openPadPicker(sound)"
                    :class="['flex items-center gap-1 px-2 py-1 rounded border text-[9px] font-black uppercase tracking-widest transition-colors',
                      pickingPadFor?.freesoundId === sound.freesoundId
                        ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                        : 'border-neutral-700 text-neutral-500 hover:border-cyan-500/50 hover:text-cyan-400']"
                    title="Assign to Loop Pad">
                    <Repeat class="w-2.5 h-2.5" /> Pad
                  </button>
                  <button
                    @click.stop="deleteCache(sound.id)"
                    class="flex items-center gap-1 px-2 py-1 rounded border border-neutral-700 text-neutral-500 hover:border-red-500/50 hover:text-red-400 text-[9px] font-black uppercase tracking-widest transition-colors"
                    title="Remove from local cache"
                  >
                    <Trash2 class="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            </div>
          </template>

          <!-- ── Search results view ───────────────────────────────── -->
          <template v-else>

          <!-- Loading -->
          <div v-if="isLoading" class="flex items-center justify-center gap-2 py-10 text-neutral-500">
            <Loader2 class="w-4 h-4 animate-spin" />
            <span class="text-[10px] uppercase font-black tracking-widest">Searching…</span>
          </div>

          <!-- Empty state -->
          <div v-else-if="results.length === 0 && !error && totalCount === 0 && query"
            class="flex flex-col items-center gap-2 py-10 text-neutral-600">
            <Music2 class="w-6 h-6" />
            <span class="text-[10px] uppercase font-black tracking-widest">No results</span>
          </div>

          <!-- Results list -->
          <div v-if="results.length > 0" class="flex flex-col gap-1 p-4">
            <div
              v-for="sound in results" :key="sound.freesoundId"
              class="group flex items-center gap-2 px-2 py-2 rounded-lg bg-neutral-950/60 border border-neutral-800 hover:border-neutral-700 transition-colors"
            >
              <!-- Preview button -->
              <button
                @click="togglePreview(sound)"
                :class="['shrink-0 w-6 h-6 flex items-center justify-center rounded-full border transition-colors',
                  previewingId === sound.freesoundId && previewPlaying
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-400'
                    : 'border-neutral-700 text-neutral-500 hover:border-cyan-500/50 hover:text-cyan-400']"
                :title="previewingId === sound.freesoundId && previewPlaying ? 'Pause preview' : 'Preview'"
              >
                <Pause v-if="previewingId === sound.freesoundId && previewPlaying" class="w-2.5 h-2.5" />
                <Play  v-else class="w-2.5 h-2.5 ml-0.5" />
              </button>

              <!-- Info -->
              <div class="flex-1 min-w-0">
                <div class="text-[11px] font-bold text-neutral-200 truncate leading-none mb-0.5">{{ sound.label }}</div>
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-[9px] text-neutral-500 italic">{{ sound.author }}</span>
                  <span class="text-[9px] font-mono text-neutral-600 bg-neutral-800 px-1 rounded">{{ formatTime(sound.duration) }}</span>
                  <span v-if="sound.bpm"
                    class="text-[8px] font-black px-1 py-px rounded bg-violet-500/10 border border-violet-500/20 text-violet-400 font-mono tracking-tight">{{ sound.bpm }} BPM</span>
                  <span v-if="sound.isLoop"
                    class="text-[7px] font-black px-1 py-px rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 uppercase tracking-widest">Loop</span>
                  <span v-if="sound.license?.includes('zero')"
                    class="text-[7px] font-black px-1 py-px rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 uppercase tracking-widest">CC0</span>
                  <span v-for="tag in (sound.tags || []).slice(0, 3)" :key="tag"
                    class="text-[8px] px-1 py-px rounded bg-neutral-800 text-neutral-600 font-mono">{{ tag }}</span>
                </div>
              </div>

              <!-- Always-visible cached badge -->
              <div v-if="isDownloaded(sound.id)" class="shrink-0">
                <HardDrive class="w-3 h-3 text-emerald-400/70" title="Cached locally" />
              </div>

              <!-- Hover actions -->
              <div class="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                <button @click="addToPlaylist(sound)"
                  class="flex items-center gap-1 px-2 py-1 rounded bg-synth-neon/10 border border-synth-neon/30 text-synth-neon hover:bg-synth-neon/20 text-[9px] font-black uppercase tracking-widest transition-colors"
                  title="Add to playlist">
                  <Plus class="w-2.5 h-2.5" /> Add
                </button>
                <button @click.stop="openPadPicker(sound)"
                  :class="['flex items-center gap-1 px-2 py-1 rounded border text-[9px] font-black uppercase tracking-widest transition-colors',
                    pickingPadFor?.freesoundId === sound.freesoundId
                      ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                      : 'border-neutral-700 text-neutral-500 hover:border-cyan-500/50 hover:text-cyan-400']"
                  title="Assign to Loop Pad">
                  <Repeat class="w-2.5 h-2.5" /> Pad
                </button>
                <button
                  @click.stop="openCapturePicker(sound)"
                  :disabled="isSendingToCapture"
                  :class="['flex items-center gap-1 px-2 py-1 rounded border text-[9px] font-black uppercase tracking-widest transition-colors',
                    capturePickerFor?.freesoundId === sound.freesoundId
                      ? 'bg-violet-500/20 border-violet-400/50 text-violet-300'
                      : isSendingToCapture
                        ? 'border-violet-500/40 bg-violet-500/10 text-violet-300 cursor-wait'
                        : 'border-neutral-700 text-neutral-500 hover:border-violet-500/50 hover:text-violet-400']"
                  title="Send to Audio Capture — set BPM and auto-discover loop"
                >
                  <FileAudio class="w-2.5 h-2.5" />
                  {{ isSendingToCapture ? '…' : 'Capture' }}
                </button>

                <!-- Download / cached / downloading -->
                <button
                  v-if="isDownloading(sound.id)"
                  disabled
                  class="flex items-center gap-1 px-2 py-1 rounded border border-neutral-700 text-neutral-500 text-[9px] font-black uppercase tracking-widest cursor-wait"
                  title="Downloading…"
                >
                  <Loader2 class="w-2.5 h-2.5 animate-spin" />
                </button>
                <button
                  v-else-if="isDownloaded(sound.id)"
                  @click.stop="deleteCache(sound.id)"
                  class="flex items-center gap-1 px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-400 text-[9px] font-black uppercase tracking-widest transition-colors"
                  title="Cached locally · Click to remove"
                >
                  <HardDrive class="w-2.5 h-2.5" />
                </button>
                <button
                  v-else
                  @click.stop="downloadSound(sound)"
                  class="flex items-center gap-1 px-2 py-1 rounded border border-neutral-700 text-neutral-500 hover:border-sky-500/50 hover:text-sky-400 text-[9px] font-black uppercase tracking-widest transition-colors"
                  title="Download preview to local cache"
                >
                  <Download class="w-2.5 h-2.5" /> Save
                </button>
              </div>
            </div>
          </div>
          </template><!-- end v-else (search results) -->

        </div>

        <!-- ── Fixed: pagination ─────────────────────────────────── -->
        <div v-if="!localOnly && results.length > 0"
          class="shrink-0 flex items-center justify-between px-5 py-2.5 border-t border-neutral-800 bg-neutral-950/40">
          <button @click="onPrev" :disabled="!prevUrl || isLoading"
            class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-[9px] font-black uppercase tracking-widest text-neutral-400 hover:text-white hover:border-neutral-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronLeft class="w-3 h-3" /> Prev
          </button>
          <span class="text-[9px] text-neutral-600 font-mono">{{ page }}</span>
          <button @click="onNext" :disabled="!nextUrl || isLoading"
            class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-[9px] font-black uppercase tracking-widest text-neutral-400 hover:text-white hover:border-neutral-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            Next <ChevronRight class="w-3 h-3" />
          </button>
        </div>

        </template><!-- end v-if="hasApiKey" -->

        <!-- ── Resize handle (SE corner) ──────────────────────────── -->
        <div
          @mousedown="startResize"
          class="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize flex items-end justify-end p-1.5 select-none"
          title="Resize"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" class="text-neutral-600 opacity-60">
            <circle cx="8.5" cy="8.5" r="1.2"/>
            <circle cx="5"   cy="8.5" r="1.2"/>
            <circle cx="8.5" cy="5"   r="1.2"/>
          </svg>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.fade-down-enter-active, .fade-down-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.fade-down-enter-from, .fade-down-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
