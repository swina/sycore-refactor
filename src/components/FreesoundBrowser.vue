<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import {
  Search, Play, Pause, Plus, Loader2, Music2,
  ChevronLeft, ChevronRight, Repeat, BadgeCheck, X, Minus,
  Download, HardDrive, Trash2, FileAudio, KeyRound, DatabaseZap,
  Tag, ChevronDown, Layers, Info, Activity, Shuffle, Star,
} from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { userKey } from '@/lib/userKey'
import { useMidiStore } from '@/stores/useMidiStore'
import { useArpStore } from '@/stores/useArpStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { useFreesoundBrowserState } from '@/composables/useFreesoundBrowserState'
import { useFreesoundCache } from '@/composables/useFreesoundCache'
import { fetchSoundDetail, fetchSimilarSounds, fetchSoundAnalysis } from '@/composables/useFreesound'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { detectBpmFromUrl } from '@/composables/useBpmDetector'

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
  category, subcategory, selectedTags,
  results, totalCount, isLoading, error,
  page, nextUrl, prevUrl,
  doSearch, onNext, onPrev,
} = useFreesoundBrowserState()

// ── Advanced search constants ─────────────────────────────────────
const CATEGORIES = ['Sound effects', 'Music', 'Instrument samples', 'Soundscapes', 'Speech']
const MUSIC_SUBCATEGORIES = ['Solo instrument', 'Solo percussion', 'Multiple instruments', 'Other']
const SOUND_TAGS = [
  'loop', 'drum', 'ambient', 'synth', 'music', 'industrial', 'soundtrack', 'samples',
  'underground', 'beat', 'bass', 'dark', 'drums', 'electronic', 'weird', 'loopable',
  'alien', 'piano', 'noise', 'guitar', 'percussion', 'dance', 'synthesizer', 'electro',
  'loops', 'horror', 'techno', 'sci-fi', 'free', 'melody', 'sample', 'house',
  'reverb', 'rhythm', 'glitch', 'games', 'effect sound', 'multisample', 'single-note',
  'experimental', 'cinematic', 'drumloop', 'cyberpunk', 'trance', 'drum-loop',
]

const tagsOpen = ref(false)

function toggleCategory(cat) {
  if (category.value === cat) { category.value = ''; subcategory.value = '' }
  else { category.value = cat; if (cat !== 'Music') subcategory.value = '' }
}

function toggleSubcategory(sub) {
  subcategory.value = subcategory.value === sub ? '' : sub
}

function toggleTag(tag) {
  const idx = selectedTags.value.indexOf(tag)
  if (idx >= 0) selectedTags.value.splice(idx, 1)
  else selectedTags.value.push(tag)
}

// ── Preview audio ──────────────────────────────────────────────────
const previewAudio   = new Audio()
const previewingId   = ref(null)
const previewPlaying = ref(false)

function stopPreview() {
  previewAudio.pause()
  previewPlaying.value = false
  previewingId.value   = null
}

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
  if (previewingId.value === sound.id) {
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
  previewingId.value   = sound.id
  previewPlaying.value = true
}

// ── Local cache view ─────────────────────────────────────────────
const localOnly       = ref(false)
const cachedSounds    = ref([])
const localQuery      = ref('')
const localSortBy     = ref('date') // 'date' | 'name' | 'duration'
const infoSound       = ref(null)

function formatBytes(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

// ── Info dialog API data ─────────────────────────────────────────
const infoDetail        = ref(null)   // { description, avg_rating, num_ratings }
const infoDetailLoading = ref(false)
const analysisData      = ref(null)
const analysisLoading   = ref(false)
const similarLoading    = ref(false)

// ── Inline analysis for search results ──────────────────────────
const searchAnalysisId      = ref(null)  // freesoundId of expanded row
const searchAnalysisData    = ref(null)
const searchAnalysisLoading = ref(false)

async function toggleSearchAnalysis(sound) {
  if (searchAnalysisId.value === sound.freesoundId) {
    searchAnalysisId.value   = null
    searchAnalysisData.value = null
    return
  }
  searchAnalysisId.value      = sound.freesoundId
  searchAnalysisData.value    = null
  searchAnalysisLoading.value = true
  try {
    searchAnalysisData.value = await fetchSoundAnalysis(sound.freesoundId)
  } catch { searchAnalysisData.value = { error: 'Analysis unavailable' } }
  finally { searchAnalysisLoading.value = false }
}

watch(infoSound, async (sound) => {
  infoDetail.value  = null
  analysisData.value = null
  if (!sound?.freesoundId) return
  infoDetailLoading.value = true
  try {
    const d = await fetchSoundDetail(sound.freesoundId)
    infoDetail.value = { description: d.description || '', avgRating: d.avg_rating, numRatings: d.num_ratings }
  } catch { /* silently skip if API unavailable */ }
  finally { infoDetailLoading.value = false }
})

async function loadAnalysis() {
  if (!infoSound.value?.freesoundId || analysisLoading.value) return
  analysisLoading.value = true
  try {
    analysisData.value = await fetchSoundAnalysis(infoSound.value.freesoundId)
  } catch { analysisData.value = { error: 'Analysis unavailable' } }
  finally { analysisLoading.value = false }
}

async function doSimilar(sound) {
  if (!sound?.freesoundId || similarLoading.value) return
  infoSound.value  = null
  localOnly.value  = false
  similarLoading.value = true
  isLoading.value  = true
  error.value      = ''
  results.value    = []
  try {
    const data = await fetchSimilarSounds(sound.freesoundId)
    results.value    = data.results
    totalCount.value = data.count
    nextUrl.value    = data.nextUrl
    prevUrl.value    = data.previousUrl
    page.value       = 1
  } catch (e) {
    error.value = e.message || 'Similar sounds search failed'
  } finally {
    isLoading.value     = false
    similarLoading.value = false
  }
}

function formatAnalysisValue(v) {
  if (v == null) return '—'
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 40)
  return typeof v === 'number' ? v.toFixed(2) : String(v)
}

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
  stopPreview()
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
    const v = localStorage.getItem(userKey(LS_LPP_LOOP_PADS))
    const arr = v ? JSON.parse(v) : []
    while (arr.length < 8) arr.push(null)
    return arr.slice(0, 8)
  } catch { return Array(8).fill(null) }
}

function openPadPicker(sound) {
  stopPreview()
  if (pickingPadFor.value?.freesoundId === sound.freesoundId) {
    pickingPadFor.value = null; pendingPadSlot.value = null; pendingBpm.value = ''; isPadDetecting.value = false; return
  }
  loopPadsSnapshot.value = readLoopPads()
  pickingPadFor.value    = sound
  pendingPadSlot.value   = null
  pendingBpm.value       = sound.bpm != null
    ? String(sound.bpm)
    : midiStore.currentBpm > 0 ? String(midiStore.currentBpm) : ''
  _autoDetectBpm(sound, pendingBpm, isPadDetecting)
}

function selectPadSlot(padIdx) {
  pendingPadSlot.value = padIdx
  nextTick(() => bpmInput.value?.focus())
}

async function confirmPadAssign() {
  if (pendingPadSlot.value == null || !pickingPadFor.value) return
  const bpm   = pendingBpm.value !== '' ? Number(pendingBpm.value) : undefined
  const track = {
    id: pickingPadFor.value.id, label: pickingPadFor.value.label,
    url: pickingPadFor.value.url, author: pickingPadFor.value.author,
    duration: pickingPadFor.value.duration, ...(bpm ? { bpm } : {}),
  }
  // Ensure blob is cached — CDN preview URLs are blocked by CORS in WebAudio MediaElementSource
  if (!isDownloaded(pickingPadFor.value.id)) {
    await downloadSound(pickingPadFor.value)
  }
  window.dispatchEvent(new CustomEvent('loop-pad-assign', { detail: { padIdx: pendingPadSlot.value, track } }))
  const updated = [...loopPadsSnapshot.value]
  updated[pendingPadSlot.value] = track
  loopPadsSnapshot.value = updated
  pendingPadSlot.value = null; pendingBpm.value = ''; pickingPadFor.value = null
}

// ── Samples Machine assignment ──────────────────────────────────────
const LS_LM_PADS           = 'SYCORE_LOOP_MACHINE_PADS'
const pickingLMFor         = ref(null)
const pendingLMSlot        = ref(null)
const pendingLMBpm         = ref('')
const lmBpmInput           = ref(null)
const lmPadsSnapshot       = ref(readLMPads())
const isLMDetecting        = ref(false)

function readLMPads() {
  try {
    const v = localStorage.getItem(userKey(LS_LM_PADS))
    const arr = v ? JSON.parse(v) : []
    while (arr.length < 24) arr.push(null)
    return arr.slice(0, 24)
  } catch { return Array(24).fill(null) }
}

function openLMPicker(sound) {
  stopPreview()
  if (pickingLMFor.value?.freesoundId === sound.freesoundId) {
    pickingLMFor.value = null; pendingLMSlot.value = null; pendingLMBpm.value = ''; isLMDetecting.value = false; return
  }
  lmPadsSnapshot.value = readLMPads()
  pickingLMFor.value   = sound
  pendingLMSlot.value  = null
  pendingLMBpm.value   = sound.bpm != null
    ? String(sound.bpm)
    : midiStore.currentBpm > 0 ? String(midiStore.currentBpm) : ''
  _autoDetectBpm(sound, pendingLMBpm, isLMDetecting)
}

function selectLMSlot(padIdx) {
  pendingLMSlot.value = padIdx
  nextTick(() => lmBpmInput.value?.focus())
}

async function confirmLMAssign() {
  if (pendingLMSlot.value == null || !pickingLMFor.value) return
  const sound  = pickingLMFor.value
  const padIdx = pendingLMSlot.value
  const bpm    = pendingLMBpm.value !== '' ? Number(pendingLMBpm.value) : undefined
  if (!isDownloaded(sound.id)) await downloadSound(sound)
  const url = await getCachedUrl(sound.id) || sound.url
  const track = {
    id: sound.id, label: sound.label, url,
    author: sound.author, duration: sound.duration, ...(bpm ? { bpm } : {}),
  }
  window.dispatchEvent(new CustomEvent('loop-machine-assign', { detail: { padIdx, track } }))
  const updated = [...lmPadsSnapshot.value]
  updated[padIdx] = track
  lmPadsSnapshot.value = updated
  pendingLMSlot.value = null; pendingLMBpm.value = ''; pickingLMFor.value = null
}

// ── Sampler pad assignment ──────────────────────────────────────
const pickingSamplerFor  = ref(null)
const pendingSamplerSlot = ref(null)
const samplerBpmInput    = ref(null)

function openSamplerPicker(sound) {
  stopPreview()
  if (pickingSamplerFor.value?.freesoundId === sound.freesoundId) {
    pickingSamplerFor.value = null; pendingSamplerSlot.value = null; return
  }
  pickingSamplerFor.value  = sound
  pendingSamplerSlot.value = null
}

async function assignSamplerSlot(padIdx) {
  if (!pickingSamplerFor.value) return
  pendingSamplerSlot.value = padIdx
  const sound = pickingSamplerFor.value
  if (!isDownloaded(sound.id)) await downloadSound(sound)
  const blobUrl = await getCachedUrl(sound.id)
  const track = {
    id: sound.id, label: sound.label, blobUrl,
    author: sound.author, duration: sound.duration,
  }
  window.dispatchEvent(new CustomEvent('sampler-pad-assign', { detail: { padIdx, track } }))
  pendingSamplerSlot.value = null; pickingSamplerFor.value = null
}

// ── Send to AudioCapture ─────────────────────────────────────────
const capturePickerFor   = ref(null)
const captureBpm         = ref('')
const captureBpmInput    = ref(null)
const isSendingToCapture = ref(false)
const isCaptureDetecting = ref(false)

const isPadDetecting     = ref(false)

// Runs client-side BPM detection for the given sound.
// Always runs regardless of whether Freesound provided ac_tempo — the spinner
// gives the user feedback that detection is happening.  Only overwrites bpmRef
// when Freesound had no BPM, so the ac_tempo value remains the default for
// tagged sounds while still validating it visually.
// guardId is checked after async resolution to avoid races when the user
// switches sounds before detection finishes.
function _guardId(bpmRef) {
  if (bpmRef === captureBpm)  return capturePickerFor.value?.freesoundId
  if (bpmRef === pendingLMBpm) return pickingLMFor.value?.freesoundId
  return pickingPadFor.value?.freesoundId
}

async function _autoDetectBpm(sound, bpmRef, detectingRef) {
  const guardId = sound.freesoundId
  detectingRef.value = true
  try {
    const url = await getCachedUrl(sound.id)
      ?? sound.previews?.['preview-hq-mp3']
      ?? sound.previews?.['preview-lq-mp3']
      ?? sound.url
    const detected = await detectBpmFromUrl(url)
    if (detected && _guardId(bpmRef) === guardId && sound.bpm == null) {
      bpmRef.value = String(detected)
    }
  } catch {
    // detection failed silently — user can type BPM manually
  } finally {
    if (_guardId(bpmRef) === guardId) {
      detectingRef.value = false
    }
  }
}

function openCapturePicker(sound) {
  stopPreview()
  if (capturePickerFor.value?.freesoundId === sound.freesoundId) {
    capturePickerFor.value = null; captureBpm.value = ''; isCaptureDetecting.value = false; return
  }
  capturePickerFor.value = sound
  captureBpm.value = sound.bpm != null
    ? String(sound.bpm)
    : midiStore.currentBpm > 0 ? String(midiStore.currentBpm) : ''
  nextTick(() => captureBpmInput.value?.focus())
  _autoDetectBpm(sound, captureBpm, isCaptureDetecting)
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
const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } =
  useDraggableResizable({
    storageKey:    'S1_FREESOUND_BROWSER',
    minimizeLabel: 'Freesound',
    openRef:       () => uiStore.isFreesoundBrowserOpen,
    initialWidth:  700,
    initialHeight: 620,
    minWidth:      420,
    minHeight:     320,
    zIndex:        300,
  })

watch(() => uiStore.isFreesoundBrowserOpen, (open) => { if (open) bringToFront() })

// ── ESC to close ──────────────────────────────────────────────────
function onKeydown(e) {
  if (e.key === 'Escape' && uiStore.isFreesoundBrowserOpen)
    uiStore.isFreesoundBrowserOpen = false
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  previewAudio.pause(); previewAudio.src = ''
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
      <!-- Dialog shell — no backdrop so AudioCapture remains interactive beneath -->
      <div
        v-show="uiStore.isFreesoundBrowserOpen && !isMinimized"
        class="fixed flex flex-col bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
        :style="panelStyle"
      >

        <!-- ── Capture busy overlay ─────────────────────────────────── -->
        <Transition name="fade">
          <div
            v-if="isSendingToCapture"
            class="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm rounded-2xl pointer-events-auto select-none"
          >
            <div class="w-12 h-12 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
            <div class="text-center">
              <p class="text-sm font-black uppercase tracking-widest text-white">Capturing…</p>
              <p class="text-[10px] font-mono text-violet-400 mt-1">Please wait, fetching sound</p>
            </div>
          </div>
        </Transition>

        <!-- ── Header / drag handle ───────────────────────────────── -->
        <div
          @mousedown="onDragStart"
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
          <div class="flex items-center gap-1 ml-3">
            <MacOsButtons @close="uiStore.isFreesoundBrowserOpen = false" @minimize="toggleMinimize" @maximize="maximize" />
          </div>
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

          <!-- Category row -->
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-[9px] font-black uppercase tracking-widest text-neutral-500 shrink-0 mr-0.5">Type</span>
            <button
              v-for="cat in CATEGORIES" :key="cat"
              @click="toggleCategory(cat)"
              :class="['px-2 py-0.5 rounded border text-[8px] font-black uppercase tracking-widest transition-all',
                category === cat
                  ? 'bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-400'
                  : 'border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-neutral-400']"
            >{{ cat }}</button>
          </div>

          <!-- Music subcategory row -->
          <Transition name="fade-down">
            <div v-if="category === 'Music'" class="flex items-center gap-1.5 flex-wrap pl-3">
              <span class="text-[9px] text-neutral-600 shrink-0">↳</span>
              <button
                v-for="sub in MUSIC_SUBCATEGORIES" :key="sub"
                @click="toggleSubcategory(sub)"
                :class="['px-2 py-0.5 rounded border text-[8px] font-black uppercase tracking-widest transition-all',
                  subcategory === sub
                    ? 'bg-fuchsia-500/10 border-fuchsia-400/30 text-fuchsia-300'
                    : 'border-neutral-800 text-neutral-600 hover:border-neutral-600 hover:text-neutral-400']"
              >{{ sub }}</button>
            </div>
          </Transition>

          <!-- Tags row -->
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <button
                @click="tagsOpen = !tagsOpen"
                :class="['flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-black uppercase tracking-widest transition-all',
                  selectedTags.length > 0
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-neutral-400']"
              >
                <Tag class="w-2.5 h-2.5" />
                Tags
                <span v-if="selectedTags.length > 0" class="text-amber-300">{{ selectedTags.length }}</span>
                <ChevronDown :class="['w-2.5 h-2.5 transition-transform duration-200', tagsOpen ? 'rotate-180' : '']" />
              </button>
              <button
                v-if="selectedTags.length > 0"
                @click="selectedTags.splice(0)"
                class="text-[8px] text-neutral-600 hover:text-neutral-400 transition-colors"
              >Clear</button>
            </div>
            <Transition name="fade-down">
              <div v-if="tagsOpen" class="flex flex-wrap gap-1 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                <button
                  v-for="tag in SOUND_TAGS" :key="tag"
                  @click="toggleTag(tag)"
                  :class="['px-1.5 py-0.5 rounded border text-[10px] font-mono transition-all',
                    selectedTags.includes(tag)
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                      : 'border-neutral-800 text-neutral-300 hover:border-neutral-600 hover:text-amber-400 hover:bg-amber-500/10']"
                >{{ tag }}</button>
              </div>
            </Transition>
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
                <span class="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-neutral-500 shrink-0">
                  BPM
                  <Loader2 v-if="isCaptureDetecting" class="w-2.5 h-2.5 animate-spin text-violet-400" />
                </span>
                <input
                  ref="captureBpmInput"
                  v-model="captureBpm"
                  type="number" min="1" max="999"
                  :placeholder="isCaptureDetecting ? 'Detecting…' : 'e.g. 120'"
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
                  <span class="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-neutral-500 shrink-0">
                    BPM
                    <Loader2 v-if="isPadDetecting" class="w-2.5 h-2.5 animate-spin text-cyan-400" />
                  </span>
                  <input ref="bpmInput" v-model="pendingBpm" type="number" min="1" max="999"
                    :placeholder="isPadDetecting ? 'Detecting…' : 'optional'"
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

          <!-- Samples Machine picker -->
          <Transition name="fade-down">
            <div v-if="pickingLMFor" class="bg-neutral-950 border border-fuchsia-500/30 rounded-xl p-3 mt-2">
              <div class="flex items-center justify-between mb-2">
                <span class="text-[9px] font-black uppercase tracking-widest text-fuchsia-400 flex items-center gap-1.5">
                  <Layers class="w-3 h-3" /> Assign to Samples Machine
                </span>
                <span class="text-[9px] text-neutral-500 truncate max-w-[200px] italic">{{ pickingLMFor.label }}</span>
                <button @click="pickingLMFor = null; pendingLMSlot = null" class="text-neutral-600 hover:text-white transition-colors ml-2 shrink-0">
                  <X class="w-3 h-3" />
                </button>
              </div>
              <div class="grid grid-cols-8 gap-1 mb-1">
                <div v-for="(slot, i) in lmPadsSnapshot" :key="i">
                  <button
                    @click="selectLMSlot(i)"
                    :class="['w-full h-8 rounded border flex flex-col items-center justify-center p-0.5 transition-all text-[8px]',
                      pendingLMSlot === i
                        ? 'border-fuchsia-400 bg-fuchsia-500/20 text-fuchsia-200'
                        : slot
                          ? 'border-fuchsia-500/40 bg-fuchsia-500/5 hover:bg-fuchsia-500/20 hover:border-fuchsia-400/60'
                          : 'border-neutral-700 bg-neutral-900 hover:border-fuchsia-500/50 hover:bg-fuchsia-500/5']"
                    :title="slot ? `Replace: ${slot.label}` : `Assign to Pad ${i + 1}`"
                  >
                    <span class="font-black text-neutral-400">{{ i + 1 }}</span>
                    <span v-if="slot" class="text-[6px] text-fuchsia-400/70 truncate w-full text-center leading-none px-0.5">{{ slot.label?.slice(0, 5) }}</span>
                    <span v-else class="text-[6px] text-neutral-700 leading-none">—</span>
                  </button>
                </div>
              </div>
              <Transition name="fade-down">
                <div v-if="pendingLMSlot != null" class="flex items-center gap-2 mt-2 pt-2 border-t border-neutral-800">
                  <span class="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-neutral-500 shrink-0">
                    BPM
                    <Loader2 v-if="isLMDetecting" class="w-2.5 h-2.5 animate-spin text-fuchsia-400" />
                  </span>
                  <input ref="lmBpmInput" v-model="pendingLMBpm" type="number" min="1" max="999"
                    :placeholder="isLMDetecting ? 'Detecting…' : 'optional'"
                    @keydown.enter="confirmLMAssign" @keydown.esc="pendingLMSlot = null"
                    class="w-24 bg-black border border-neutral-700 rounded-lg px-2 py-1 text-xs text-white font-mono outline-none focus:border-fuchsia-500 placeholder-neutral-700" />
                  <button @click="confirmLMAssign"
                    class="flex-1 py-1 rounded-lg bg-fuchsia-700 hover:bg-fuchsia-600 text-white text-[10px] font-black uppercase tracking-widest transition-colors">
                    Assign to LM Pad {{ pendingLMSlot + 1 }}
                  </button>
                  <button @click="pendingLMSlot = null"
                    class="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-[10px] transition-colors">
                    Cancel
                  </button>
                </div>
              </Transition>
            </div>
          </Transition>

          <!-- Sampler pad picker -->
          <Transition name="fade-down">
            <div v-if="pickingSamplerFor" class="bg-neutral-950 border border-violet-500/30 rounded-xl p-3 mt-2">
              <div class="flex items-center justify-between mb-2">
                <span class="text-[9px] font-black uppercase tracking-widest text-violet-400 flex items-center gap-1.5">
                  <Music2 class="w-3 h-3" /> Assign to Sampler
                </span>
                <span class="text-[9px] text-neutral-500 truncate max-w-[200px] italic">{{ pickingSamplerFor.label }}</span>
                <button @click="pickingSamplerFor = null; pendingSamplerSlot = null" class="text-neutral-600 hover:text-white transition-colors ml-2 shrink-0">
                  <X class="w-3 h-3" />
                </button>
              </div>
              <div class="flex gap-1 mb-1">
                <button
                  v-for="i in 7" :key="i"
                  @click="assignSamplerSlot(i - 1)"
                  :class="['w-10 h-8 rounded border flex flex-col items-center justify-center transition-all text-[9px]',
                    pendingSamplerSlot === i - 1
                      ? 'border-violet-400 bg-violet-500/20 text-violet-200'
                      : 'border-neutral-700 bg-neutral-900 hover:border-violet-500/50 hover:bg-violet-500/5 text-neutral-400']"
                  :title="`Assign to Sampler pad ${i}${i === 7 ? ' (Granular)' : ''}`"
                >
                  <span class="font-black">{{ i }}</span>
                  <span v-if="i === 7" class="text-[6px] text-violet-400/50 leading-none">G</span>
                </button>
              </div>
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
                    previewingId === sound.id && previewPlaying
                      ? 'bg-sky-500/20 border-sky-400 text-sky-400'
                      : 'border-neutral-700 text-neutral-500 hover:border-sky-500/50 hover:text-sky-400']"
                >
                  <Pause v-if="previewingId === sound.id && previewPlaying" class="w-2.5 h-2.5 fill-current" />
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
                  <button @click.stop="openLMPicker(sound)"
                    :class="['flex items-center gap-1 px-2 py-1 rounded border text-[9px] font-black uppercase tracking-widest transition-colors',
                      pickingLMFor?.freesoundId === sound.freesoundId
                        ? 'bg-fuchsia-500/20 border-fuchsia-400/50 text-fuchsia-300'
                        : 'border-neutral-700 text-neutral-500 hover:border-fuchsia-500/50 hover:text-fuchsia-400']"
                    title="Assign to Samples Machine">
                    <Layers class="w-2.5 h-2.5" /> LM
                  </button>
                  <button @click.stop="openSamplerPicker(sound)"
                    :class="['flex items-center gap-1 px-2 py-1 rounded border text-[9px] font-black uppercase tracking-widest transition-colors',
                      pickingSamplerFor?.freesoundId === sound.freesoundId
                        ? 'bg-violet-500/20 border-violet-400/50 text-violet-300'
                        : 'border-neutral-700 text-neutral-500 hover:border-violet-500/50 hover:text-violet-400']"
                    title="Assign to Sampler">
                    <Music2 class="w-2.5 h-2.5" /> Smp
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
                  <button
                    @click.stop="infoSound = sound"
                    class="flex items-center gap-1 px-2 py-1 rounded border border-neutral-700 text-neutral-500 hover:border-sky-500/50 hover:text-sky-400 text-[9px] font-black uppercase tracking-widest transition-colors"
                    title="Sound info"
                  >
                    <Info class="w-2.5 h-2.5" />
                  </button>
                  <button
                    @click.stop="doSimilar(sound)"
                    :disabled="similarLoading"
                    class="flex items-center gap-1 px-2 py-1 rounded border border-neutral-700 text-neutral-500 hover:border-cyan-500/50 hover:text-cyan-400 text-[9px] font-black uppercase tracking-widest transition-colors disabled:opacity-40"
                    title="Find similar sounds"
                  >
                    <Loader2 v-if="similarLoading" class="w-2.5 h-2.5 animate-spin" />
                    <Shuffle v-else class="w-2.5 h-2.5" />
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
            <div v-for="sound in results" :key="sound.freesoundId" class="flex flex-col">
            <div
              class="group flex items-center gap-2 px-2 py-2 rounded-lg border border-neutral-800 hover:border-neutral-700 transition-colors" :class="[previewingId === sound.id && previewPlaying ? 'bg-cyan-500/20' :'bg-neutral-950/60', searchAnalysisId === sound.freesoundId ? 'border-b-0 rounded-b-none border-violet-500/30' : '']"
            >
              <!-- Preview button -->
              <button
                @click="togglePreview(sound)"
                :class="['shrink-0 w-6 h-6 flex items-center justify-center rounded-full border transition-colors',
                  previewingId === sound.id && previewPlaying
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-400'
                    : 'border-neutral-700 text-neutral-500 hover:border-cyan-500/50 hover:text-cyan-400']"
                :title="previewingId === sound.id && previewPlaying ? 'Pause preview' : 'Preview'"
              >
                <Pause v-if="previewingId === sound.id && previewPlaying" class="w-2.5 h-2.5" />
                <Play  v-else class="w-2.5 h-2.5 ml-0.5" />
              </button>

              <!-- Info -->
              <div class="flex-1 min-w-0">
                <div class="text-[11px] font-bold text-cyan-400 truncate leading-none mb-0.5">{{ sound.label }}</div>
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-[9px] text-neutral-200 italic">{{ sound.author }}</span>
                  <span class="text-[9px] font-mono text-neutral-300 bg-neutral-800 px-1 rounded">{{ formatTime(sound.duration) }}</span>
                  <span v-if="sound.bpm"
                    class="text-[8px] font-black px-1 py-px rounded bg-violet-500/10 border border-violet-500/20 text-violet-400 font-mono tracking-tight">{{ sound.bpm }} BPM</span>
                  <span v-if="sound.isLoop"
                    class="text-[7px] font-black px-1 py-px rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 uppercase tracking-widest">Loop</span>
                  <span v-if="sound.license?.includes('zero')"
                    class="text-[7px] font-black px-1 py-px rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 uppercase tracking-widest">CC0</span>
                  <span v-for="tag in (sound.tags || []).slice(0, 3)" :key="tag"
                    class="text-[8px] px-1 py-px rounded bg-neutral-800 text-amber-600 font-mono">{{ tag }}</span>
                </div>
              </div>

              <!-- Always-visible cached badge -->
              <div v-if="isDownloaded(sound.id)" class="shrink-0">
                <HardDrive class="w-3 h-3 text-emerald-400/70" title="Cached locally" />
              </div>

              <!-- Hover actions -->
              <div :class="['shrink-0 transition-opacity flex items-center gap-1', isDownloading(sound.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100']">
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
                <button @click.stop="openLMPicker(sound)"
                  :class="['flex items-center gap-1 px-2 py-1 rounded border text-[9px] font-black uppercase tracking-widest transition-colors',
                    pickingLMFor?.freesoundId === sound.freesoundId
                      ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                      : 'border-neutral-700 text-neutral-500 hover:border-amber-500/50 hover:text-amber-400']"
                  title="Assign to Samples Machine">
                  <Layers class="w-2.5 h-2.5" /> LM
                </button>
                <button @click.stop="openSamplerPicker(sound)"
                  :class="['flex items-center gap-1 px-2 py-1 rounded border text-[9px] font-black uppercase tracking-widest transition-colors',
                    pickingSamplerFor?.freesoundId === sound.freesoundId
                      ? 'bg-violet-500/20 border-violet-400/50 text-violet-300'
                      : 'border-neutral-700 text-neutral-500 hover:border-violet-500/50 hover:text-violet-400']"
                  title="Assign to Sampler">
                  <Music2 class="w-2.5 h-2.5" /> Smp
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
                  @click.stop="stopPreview(); downloadSound(sound)"
                  class="flex items-center gap-1 px-2 py-1 rounded border border-neutral-700 text-neutral-500 hover:border-sky-500/50 hover:text-sky-400 text-[9px] font-black uppercase tracking-widest transition-colors"
                  title="Download preview to local cache"
                >
                  <Download class="w-2.5 h-2.5" /> Save
                </button>
                <button
                  @click.stop="doSimilar(sound)"
                  :disabled="similarLoading"
                  class="flex items-center gap-1 px-2 py-1 rounded border border-neutral-700 text-neutral-500 hover:border-cyan-500/50 hover:text-cyan-400 text-[9px] font-black uppercase tracking-widest transition-colors disabled:opacity-40"
                  title="Find similar sounds"
                >
                  <Loader2 v-if="similarLoading" class="w-2.5 h-2.5 animate-spin" />
                  <Shuffle v-else class="w-2.5 h-2.5" />
                </button>
                <button
                  @click.stop="toggleSearchAnalysis(sound)"
                  :class="['flex items-center gap-1 px-2 py-1 rounded border text-[9px] font-black uppercase tracking-widest transition-colors',
                    searchAnalysisId === sound.freesoundId
                      ? 'bg-violet-500/15 border-violet-500/40 text-violet-300'
                      : 'border-neutral-700 text-neutral-500 hover:border-violet-500/50 hover:text-violet-400']"
                  title="Audio analysis"
                >
                  <Loader2 v-if="searchAnalysisLoading && searchAnalysisId === sound.freesoundId" class="w-2.5 h-2.5 animate-spin" />
                  <Activity v-else class="w-2.5 h-2.5" />
                </button>
              </div>
            </div>

            <!-- Inline analysis expansion -->
            <Transition name="fade-down">
              <div
                v-if="searchAnalysisId === sound.freesoundId"
                class="px-3 py-2.5 rounded-b-lg border border-t-0 border-violet-500/30 bg-violet-950/20"
              >
                <div v-if="searchAnalysisLoading" class="flex items-center gap-2 text-neutral-500 py-1">
                  <Loader2 class="w-3 h-3 animate-spin" />
                  <span class="text-[9px] font-mono">Fetching analysis…</span>
                </div>
                <div v-else-if="searchAnalysisData">
                  <div v-if="searchAnalysisData.error" class="text-[9px] text-red-400 font-mono">{{ searchAnalysisData.error }}</div>
                  <dl v-else class="grid grid-cols-3 gap-x-4 gap-y-1">
                    <template v-for="(val, key) in searchAnalysisData" :key="key">
                      <div class="flex items-center justify-between gap-1">
                        <dt class="text-[8px] font-black uppercase tracking-widest text-neutral-500 capitalize">{{ key }}</dt>
                        <dd class="text-[9px] text-violet-300 font-mono">{{ formatAnalysisValue(val) }}</dd>
                      </div>
                    </template>
                  </dl>
                </div>
              </div>
            </Transition>

            </div><!-- end per-sound wrapper -->
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

        <!-- ── Cached sound info dialog ──────────────────────────── -->
        <Transition name="fade">
          <div
            v-if="infoSound"
            class="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl"
            @click.self="infoSound = null"
          >
            <div class="bg-neutral-900 border border-sky-500/30 rounded-2xl shadow-2xl w-80 max-h-[80%] flex flex-col overflow-hidden">

              <!-- Dialog header -->
              <div class="flex items-center justify-between px-5 py-3 border-b border-neutral-800 shrink-0">
                <span class="text-[10px] font-black uppercase tracking-widest text-sky-400 flex items-center gap-1.5">
                  <Info class="w-3 h-3" /> Sound Info
                </span>
                <div class="flex items-center gap-2">
                  <!-- Analysis button -->
                  <button
                    @click="loadAnalysis"
                    :disabled="analysisLoading || !infoSound.freesoundId"
                    :class="['flex items-center gap-1 px-2 py-1 rounded border text-[9px] font-black uppercase tracking-widest transition-colors',
                      analysisData && !analysisData.error
                        ? 'bg-violet-500/15 border-violet-500/40 text-violet-300'
                        : 'border-neutral-700 text-neutral-500 hover:border-violet-500/50 hover:text-violet-400 disabled:opacity-30']"
                    title="Fetch audio analysis"
                  >
                    <Loader2 v-if="analysisLoading" class="w-2.5 h-2.5 animate-spin" />
                    <Activity v-else class="w-2.5 h-2.5" />
                    Analysis
                  </button>
                  <!-- Similar button -->
                  <button
                    @click="doSimilar(infoSound)"
                    :disabled="similarLoading || !infoSound.freesoundId"
                    class="flex items-center gap-1 px-2 py-1 rounded border border-neutral-700 text-neutral-500 hover:border-cyan-500/50 hover:text-cyan-400 text-[9px] font-black uppercase tracking-widest transition-colors disabled:opacity-30"
                    title="Find similar sounds"
                  >
                    <Loader2 v-if="similarLoading" class="w-2.5 h-2.5 animate-spin" />
                    <Shuffle v-else class="w-2.5 h-2.5" />
                    Similar
                  </button>
                  <button @click="infoSound = null" class="text-neutral-600 hover:text-white transition-colors ml-1">
                    <X class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <!-- Scrollable body -->
              <div class="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 flex flex-col gap-4">

                <!-- Basic info table -->
                <dl class="flex flex-col gap-2">
                  <div class="flex gap-2">
                    <dt class="text-[9px] font-black uppercase tracking-widest text-neutral-500 w-20 shrink-0">Name</dt>
                    <dd class="text-[10px] text-white font-mono break-all leading-tight">{{ infoSound.label }}</dd>
                  </div>
                  <div class="flex gap-2">
                    <dt class="text-[9px] font-black uppercase tracking-widest text-neutral-500 w-20 shrink-0">Author</dt>
                    <dd class="text-[10px] text-neutral-300 font-mono">{{ infoSound.author || '—' }}</dd>
                  </div>
                  <div class="flex gap-2">
                    <dt class="text-[9px] font-black uppercase tracking-widest text-neutral-500 w-20 shrink-0">Duration</dt>
                    <dd class="text-[10px] text-neutral-300 font-mono">{{ formatTime(infoSound.duration) }}</dd>
                  </div>
                  <div class="flex gap-2">
                    <dt class="text-[9px] font-black uppercase tracking-widest text-neutral-500 w-20 shrink-0">Size</dt>
                    <dd class="text-[10px] text-neutral-300 font-mono">{{ formatBytes(infoSound.size) }}</dd>
                  </div>
                  <div class="flex gap-2">
                    <dt class="text-[9px] font-black uppercase tracking-widest text-neutral-500 w-20 shrink-0">Cached</dt>
                    <dd class="text-[10px] text-neutral-300 font-mono">{{ formatDate(infoSound.downloadedAt) }}</dd>
                  </div>
                  <div v-if="infoSound.freesoundId" class="flex gap-2">
                    <dt class="text-[9px] font-black uppercase tracking-widest text-neutral-500 w-20 shrink-0">FS ID</dt>
                    <dd class="text-[10px] text-sky-400 font-mono">#{{ infoSound.freesoundId }}</dd>
                  </div>
                </dl>

                <!-- Rating + description (fetched from API) -->
                <div v-if="infoDetailLoading" class="flex items-center gap-2 text-neutral-600">
                  <Loader2 class="w-3 h-3 animate-spin" />
                  <span class="text-[9px] font-mono">Loading details…</span>
                </div>
                <div v-else-if="infoDetail" class="flex flex-col gap-2">
                  <!-- Rating -->
                  <div v-if="infoDetail.avgRating != null" class="flex items-center gap-1.5">
                    <div class="flex items-center gap-0.5">
                      <Star
                        v-for="i in 5" :key="i"
                        :class="['w-2.5 h-2.5', i <= Math.round(infoDetail.avgRating) ? 'text-amber-400 fill-amber-400' : 'text-neutral-700']"
                      />
                    </div>
                    <span class="text-[9px] font-mono text-neutral-400">{{ infoDetail.avgRating?.toFixed(1) }}</span>
                    <span class="text-[8px] text-neutral-600 font-mono">({{ infoDetail.numRatings }} ratings)</span>
                  </div>
                  <!-- Description -->
                  <p v-if="infoDetail.description" class="text-[9px] text-neutral-400 leading-relaxed font-mono whitespace-pre-wrap break-words">{{ infoDetail.description }}</p>
                </div>

                <!-- Analysis section -->
                <div v-if="analysisData" class="border-t border-neutral-800 pt-3">
                  <div class="flex items-center gap-1.5 mb-2">
                    <Activity class="w-3 h-3 text-violet-400" />
                    <span class="text-[9px] font-black uppercase tracking-widest text-violet-400">Analysis</span>
                  </div>
                  <div v-if="analysisData.error" class="text-[9px] text-red-400 font-mono">{{ analysisData.error }}</div>
                  <dl v-else class="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <template v-for="(val, key) in analysisData" :key="key">
                      <div class="flex justify-between gap-1">
                        <dt class="text-[9px] font-black uppercase tracking-widest text-neutral-500 capitalize">{{ key }}</dt>
                        <dd class="text-[9px] text-violet-300 font-mono">{{ formatAnalysisValue(val) }}</dd>
                      </div>
                    </template>
                  </dl>
                </div>

              </div>
            </div>
          </div>
        </Transition>

        <!-- ── Resize handle (SE corner) ──────────────────────────── -->
        <div
          @mousedown="e => onResizeStart(e, 'se')"
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
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
.fade-down-enter-active, .fade-down-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.fade-down-enter-from, .fade-down-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
