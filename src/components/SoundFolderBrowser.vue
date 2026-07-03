<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { FolderOpen, X, Play, Pause, Search, RefreshCw, Loader2, Music2, AlertTriangle, CheckCircle2 } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { idbHandleGet, idbHandlePut } from '@/lib/idb'
import { decodeAudioFile, loadFileAsPcmWavBlob } from '@/lib/decode-audio'

const uiStore = useUiStore()

const HANDLE_KEY = 'lastSoundFolder'
const AUDIO_EXT_RE = /\.(wav|mp3|ogg|m4a|aac|flac|webm|opus)$/i

const isApiSupported = typeof window !== 'undefined' && !!window.showDirectoryPicker

const dirHandle      = ref(null)
const folderName     = ref('')
const needsPermission = ref(false)
const isScanning      = ref(false)
const files            = ref([])   // { name, relPath, handle }
const searchQuery       = ref('')
const error              = ref('')

const filteredFiles = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return files.value
  return files.value.filter(f =>
    f.name.toLowerCase().includes(q) || f.relPath.toLowerCase().includes(q)
  )
})

// ── Recursive folder walk ────────────────────────────────────────
function formatSize(bytes) {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function* walk(dir, relPath = '') {
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file') {
      if (AUDIO_EXT_RE.test(name)) {
        const file = await handle.getFile()
        yield { name, relPath, handle, size: file.size }
      }
    } else if (handle.kind === 'directory') {
      yield* walk(handle, relPath ? `${relPath}/${name}` : name)
    }
  }
}

async function scanFolder() {
  if (!dirHandle.value) return
  isScanning.value = true
  error.value = ''
  const next = []
  try {
    for await (const entry of walk(dirHandle.value)) {
      next.push(entry)
    }
    files.value = next
  } catch (e) {
    console.error('[SoundFolderBrowser] scan failed', e)
    error.value = 'Failed to read folder contents'
  } finally {
    isScanning.value = false
  }
}

async function pickFolder() {
  if (!isApiSupported) return
  try {
    const handle = await window.showDirectoryPicker()
    dirHandle.value     = handle
    folderName.value    = handle.name
    needsPermission.value = false
    await idbHandlePut(HANDLE_KEY, handle)
    await scanFolder()
  } catch (e) {
    if (e?.name !== 'AbortError') console.error('[SoundFolderBrowser] pickFolder failed', e)
  }
}

async function reconnectFolder() {
  if (!dirHandle.value) return
  try {
    const perm = await dirHandle.value.requestPermission({ mode: 'read' })
    if (perm === 'granted') {
      needsPermission.value = false
      await scanFolder()
    }
  } catch (e) {
    console.error('[SoundFolderBrowser] reconnect failed', e)
  }
}

onMounted(async () => {
  if (!isApiSupported) return
  try {
    const handle = await idbHandleGet(HANDLE_KEY)
    if (!handle) return
    dirHandle.value  = handle
    folderName.value = handle.name
    const perm = await handle.queryPermission({ mode: 'read' })
    if (perm === 'granted') {
      await scanFolder()
    } else {
      needsPermission.value = true
    }
  } catch (e) {
    console.error('[SoundFolderBrowser] restore folder failed', e)
  }
})

// ── Preview audio (uses AudioContext for broader codec support) ─────
const previewCtx      = new (window.AudioContext || window.webkitAudioContext)()
const previewingPath  = ref(null)
const previewPlaying  = ref(false)
let previewSource     = null
let previewBuffer     = null

function stopPreview() {
  if (previewSource) { previewSource.stop(); previewSource.disconnect(); previewSource = null }
  previewBuffer = null
  previewPlaying.value = false
  previewingPath.value = null
}

function playBuffer() {
  if (!previewBuffer) return
  previewSource = previewCtx.createBufferSource()
  previewSource.buffer = previewBuffer
  previewSource.connect(previewCtx.destination)
  previewSource.start(0)
  previewSource.onended = () => { previewPlaying.value = false; previewingPath.value = null; previewSource = null }
  previewPlaying.value = true
  if (previewCtx.state === 'suspended') previewCtx.resume()
}

async function togglePreview(file) {
  const path = `${file.relPath}/${file.name}`
  if (previewingPath.value === path) {
    if (previewPlaying.value) {
      if (previewSource) { previewSource.stop(); previewSource.disconnect(); previewSource = null }
      previewPlaying.value = false
    } else {
      if (previewBuffer) playBuffer()
    }
    return
  }
  stopPreview()
  try {
    const fileObj = await file.handle.getFile()
    const arrayBuf = await fileObj.arrayBuffer()
    previewBuffer = await decodeAudioFile(arrayBuf)
    playBuffer()
    previewingPath.value = path
  } catch (e) {
    console.error('[SoundFolderBrowser] preview failed', e)
    previewingPath.value = null
    previewPlaying.value = false
  }
}

// ── Assign to caller-supplied slot (e.g. Drum Machine track) ──────
const assigningPath = ref(null)
const assignedPath  = ref(null)

async function assignFile(file) {
  const target = uiStore.soundFolderAssignTarget
  if (!target) return
  const path = `${file.relPath}/${file.name}`
  assigningPath.value = path
  try {
    const fileObj = await file.handle.getFile()
    let assignedFile = fileObj
    // Convert Opus-in-WAV and other non-standard codecs to PCM WAV
    if (!fileObj.type || fileObj.type === 'audio/wav' || /\.wav$/i.test(fileObj.name)) {
      try {
        const wavBlob = await loadFileAsPcmWavBlob(fileObj)
        assignedFile = new File([wavBlob], fileObj.name.replace(/\.[^.]+$/, '') + '.wav', { type: 'audio/wav' })
      } catch {
        // Not all WAVs are problematic — use original if conversion fails
      }
    }
    await target.onAssign({ ...file, handle: { ...file.handle, getFile: () => assignedFile } })
    assignedPath.value = path
  } catch (e) {
    console.error('[SoundFolderBrowser] assign failed', e)
    error.value = 'Failed to assign sound'
  } finally {
    assigningPath.value = null
  }
}

// ── Drag & resize ─────────────────────────────────────────────────
const MIN_W = 420
const MIN_H = 320

const pos  = ref({ x: 0, y: 0 })
const size = ref({ w: 560, h: 560 })

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

watch(() => uiStore.isSoundFolderBrowserOpen, (open) => { if (open) center() })
watch(() => uiStore.soundFolderAssignTarget, () => { assignedPath.value = null })

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
  if (e.key === 'Escape' && uiStore.isSoundFolderBrowserOpen)
    uiStore.isSoundFolderBrowserOpen = false
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  stopPreview()
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup',  onMouseUp)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="uiStore.isSoundFolderBrowserOpen"
      class="fixed flex flex-col bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
      :style="{ left: pos.x + 'px', top: pos.y + 'px', width: size.w + 'px', height: size.h + 'px', zIndex: 600 }"
    >
      <!-- ── Header / drag handle ───────────────────────────────── -->
      <div
        @mousedown="startDrag"
        class="shrink-0 flex items-center justify-between px-5 py-3 border-b border-neutral-800 bg-neutral-950/60 cursor-grab active:cursor-grabbing select-none"
      >
        <div class="flex items-center gap-3 pointer-events-none">
          <div class="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
            <FolderOpen class="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div>
            <span class="text-sm font-black uppercase tracking-[0.2em] text-white leading-none">Sound Folder</span>
            <p class="text-[9px] font-mono text-rose-500/60 uppercase tracking-widest leading-none mt-0.5">
              {{ uiStore.soundFolderAssignTarget ? `Assigning to: ${uiStore.soundFolderAssignTarget.label}` : 'Browse · Preview Local Audio Files' }}
            </p>
          </div>
        </div>
        <button
          @click="uiStore.isSoundFolderBrowserOpen = false"
          @mousedown.stop
          class="ml-3 shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- ── Unsupported browser gate ────────────────────────────── -->
      <div v-if="!isApiSupported" class="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div class="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <AlertTriangle class="w-6 h-6 text-amber-400" />
        </div>
        <div>
          <p class="text-sm font-black uppercase tracking-widest text-white mb-1">Not Supported</p>
          <p class="text-[11px] font-mono text-neutral-400 max-w-[280px] leading-relaxed">
            Folder browsing requires the File System Access API — available in Chrome, Edge, or Opera.
          </p>
        </div>
      </div>

      <template v-else>
        <!-- ── Toolbar: folder picker + search ──────────────────── -->
        <div class="shrink-0 flex flex-col gap-3 px-5 pt-4 pb-3 border-b border-neutral-800/60 bg-neutral-950/20">
          <div class="flex items-center gap-2">
            <button
              @click="pickFolder"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/20 transition-colors"
            >
              <FolderOpen class="w-3 h-3" />
              {{ dirHandle ? 'Change Folder' : 'Choose Folder' }}
            </button>
            <span v-if="folderName" class="flex-1 min-w-0 text-[11px] font-mono text-neutral-400 truncate">{{ folderName }}</span>
            <button
              v-if="needsPermission"
              @click="reconnectFolder"
              class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-black uppercase tracking-widest hover:bg-amber-500/20 transition-colors"
            >
              <RefreshCw class="w-3 h-3" />
              Reconnect
            </button>
            <span v-else-if="dirHandle" class="shrink-0 text-[9px] font-mono text-neutral-600">
              {{ files.length }} file{{ files.length !== 1 ? 's' : '' }}
            </span>
          </div>

          <div v-if="dirHandle && !needsPermission" class="relative">
            <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-500 pointer-events-none" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Filter by name or path…"
              class="w-full bg-black border border-neutral-800 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-neutral-600 focus:border-rose-500/60 outline-none"
            />
          </div>
        </div>

        <!-- ── Body ─────────────────────────────────────────────── -->
        <div class="flex-1 overflow-y-auto custom-scrollbar">
          <!-- No folder chosen yet -->
          <div v-if="!dirHandle" class="flex flex-col items-center gap-2 py-16 text-neutral-600">
            <FolderOpen class="w-8 h-8" />
            <span class="text-[10px] uppercase font-black tracking-widest">No folder selected</span>
          </div>

          <!-- Needs permission re-grant -->
          <div v-else-if="needsPermission" class="flex flex-col items-center gap-2 py-16 text-neutral-600 px-8 text-center">
            <RefreshCw class="w-8 h-8" />
            <span class="text-[10px] uppercase font-black tracking-widest">Permission needed to re-read this folder</span>
          </div>

          <!-- Scanning -->
          <div v-else-if="isScanning" class="flex items-center justify-center gap-2 py-16 text-neutral-500">
            <Loader2 class="w-4 h-4 animate-spin" />
            <span class="text-[10px] uppercase font-black tracking-widest">Scanning…</span>
          </div>

          <!-- Error -->
          <div v-else-if="error" class="flex flex-col items-center gap-2 py-16 text-red-500/70">
            <AlertTriangle class="w-6 h-6" />
            <span class="text-[10px] uppercase font-black tracking-widest">{{ error }}</span>
          </div>

          <!-- Empty -->
          <div v-else-if="filteredFiles.length === 0" class="flex flex-col items-center gap-2 py-16 text-neutral-600">
            <Music2 class="w-6 h-6" />
            <span class="text-[10px] uppercase font-black tracking-widest">No audio files found</span>
          </div>

          <!-- File list -->
          <div v-else class="flex flex-col gap-1 p-4">
            <div
              v-for="file in filteredFiles" :key="`${file.relPath}/${file.name}`"
              @click="togglePreview(file)"
              class="group flex items-center gap-2 px-2 py-2 rounded-lg border border-neutral-800 hover:border-rose-700/40 bg-neutral-950/60 transition-colors cursor-pointer"
            >
              <button
                @click.stop="togglePreview(file)"
                :class="['shrink-0 w-6 h-6 flex items-center justify-center rounded-full border transition-colors',
                  previewingPath === `${file.relPath}/${file.name}` && previewPlaying
                    ? 'bg-rose-500/20 border-rose-400 text-rose-400'
                    : 'border-neutral-700 text-neutral-500 group-hover:border-rose-500/50 group-hover:text-rose-400']"
              >
                <Pause v-if="previewingPath === `${file.relPath}/${file.name}` && previewPlaying" class="w-2.5 h-2.5 fill-current" />
                <Play  v-else class="w-2.5 h-2.5 fill-current ml-px" />
              </button>

              <div class="flex-1 min-w-0">
                <div class="text-[11px] font-bold text-white truncate leading-tight">{{ file.name }}</div>
                <div class="flex items-center gap-1.5">
                  <span v-if="file.relPath" class="text-[9px] text-neutral-500 font-mono truncate">{{ file.relPath }}</span>
                  <span v-if="file.size != null" class="shrink-0 text-[9px] font-mono text-neutral-600">{{ formatSize(file.size) }}</span>
                </div>
              </div>

              <button
                v-if="uiStore.soundFolderAssignTarget"
                @click.stop="assignFile(file)"
                :disabled="assigningPath === `${file.relPath}/${file.name}`"
                :class="['shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md border text-[9px] font-black uppercase tracking-widest transition-colors',
                  assignedPath === `${file.relPath}/${file.name}`
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20']"
              >
                <Loader2 v-if="assigningPath === `${file.relPath}/${file.name}`" class="w-3 h-3 animate-spin" />
                <CheckCircle2 v-else-if="assignedPath === `${file.relPath}/${file.name}`" class="w-3 h-3" />
                <span v-if="assignedPath === `${file.relPath}/${file.name}` && assigningPath !== `${file.relPath}/${file.name}`">Assigned</span>
                <span v-else-if="assigningPath !== `${file.relPath}/${file.name}`">{{ uiStore.soundFolderAssignTarget?.label === 'Audio Capture' ? 'Capture' : 'Assign' }}</span>
              </button>
            </div>
          </div>
        </div>
      </template>

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
  </Teleport>
</template>
