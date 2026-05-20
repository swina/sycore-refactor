<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { X, Layers, Heart, Trash2, Download, Ghost, ChevronDown } from 'lucide-vue-next'
import { usePresetStore } from '@/stores/usePresetStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useLivePadStore } from '@/stores/useLivePadStore'

const emit = defineEmits(['close'])

const presetStore = usePresetStore()
const authStore = useAuthStore()
const configStore = useConfigStore()
const livePadStore = useLivePadStore()

const fileInput = ref(null)
const isExporting = ref(false)
const isFilterDropdownOpen = ref(false)
const showDeleteConfirm = ref(false)

// ─── Slot limit ───────────────────────────────────────────────────────────────

const slotLimit = computed(() => {
  if (!authStore.profile) return '∞'
  const limit = authStore.getLimits(authStore.profile.role)?.slots
  return limit === Infinity ? '∞' : limit
})

// ─── Category icon map ────────────────────────────────────────────────────────

const iconMap = {
  pad: '🎹', lead: '⚡', bass: '🔊', drum: '🥁', synth: '🎛️',
  ambient: '☁️', strings: '🎻', brass: '🎺', piano: '🎹', organ: '🎹',
  percussion: '🥁', pluck: '🎸', bell: '🔔', arp: '↗️',
  texture: '🌊', drone: '👻', experimental: '🧪', key: '🎵', acid: '⚗️',
}
function getCategoryIcon(cat) {
  return iconMap[cat] || '🎵'
}

// ─── Poly mode label ──────────────────────────────────────────────────────────

function polyModeLabel(val) {
  return val === 0 ? 'MONO' : val === 1 ? 'UNISON' : val === 2 ? 'POLY' : 'CHORD'
}

function getPresetIndex(preset) {
  const idx = presetStore.history.findIndex(p => p.id === preset.id)
  if (idx === -1) return '+'
  return presetStore.history.length - idx
}

// ─── Filtered preset list (uses store filter + optional text search) ──────────

const filteredPresets = computed(() => [...presetStore.filteredHistory].reverse())

// ─── Filter dropdown label ────────────────────────────────────────────────────

const filterLabel = computed(() => {
  const f = presetStore.historyCategoryFilter
  if (f === 'all') return 'ALL SOUND TYPES'
  if (f === 'favorites') return 'FAVORITES'
  return f.toUpperCase()
})

function setFilter(val) {
  presetStore.historyCategoryFilter = val
  isFilterDropdownOpen.value = false
}

// ─── Recall preset → open results panel ──────────────────────────────────────

function recallPreset(preset) {
  presetStore.recallPreset(preset)
  presetStore.showResults = true
  emit('close')
}

async function deletePreset(e, id) {
  e.stopPropagation()
  try {
    await presetStore.deletePreset(id)
  } catch (err) {
    console.error('Failed to delete individual preset', err)
  }
}

// ─── Export bank ──────────────────────────────────────────────────────────────

function exportBank() {
  isExporting.value = true
  try {
    const bankData = {
      version: '1.1', // Increment version
      exportDate: new Date().toISOString(),
      presets: presetStore.history,
      session: livePadStore.getSnapshot(), // Include live session snapshot
    }
    const blob = new Blob([JSON.stringify(bankData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sycore-session-${Date.now()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (err) {
    console.error('Export failed', err)
  } finally {
    isExporting.value = false
  }
}

// ─── Import bank ──────────────────────────────────────────────────────────────

function triggerUpload() { fileInput.value?.click() }

async function handleFileUpload(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (!file.name.endsWith('.json') && !file.name.endsWith('.sco')) {
    alert('Please select a .json file')
    return
  }
  try {
    const text = await file.text()
    const bankData = JSON.parse(text)
    
    // Import Presets
    if (bankData.presets && Array.isArray(bankData.presets)) {
      for (const preset of bankData.presets) {
        await presetStore.importPreset(preset.name, preset.data, preset.category, {
          id: preset.id, 
          patchNotes: preset.patchNotes, 
          arpConfig: preset.arpConfig,
          seqConfig: preset.seqConfig, 
          isFavorite: preset.isFavorite,
          createdAt: preset.createdAt, 
          updatedAt: preset.updatedAt,
        })
      }
    }

    // Import Session
    if (bankData.session) {
      livePadStore.loadSnapshot(bankData.session)
      // Trigger a refresh event for components listening to playlist changes
      window.dispatchEvent(new CustomEvent('playlist-clear'))
      if (bankData.session.playlist?.length > 0) {
        // Re-emit playlist update if needed
      }
    }

    alert(`Imported ${bankData.presets?.length || 0} presets and Live Session.`)
  } catch (err) {
    console.error('Import failed', err)
    alert('Failed to import bank file')
  }
  if (fileInput.value) fileInput.value.value = ''
}

// ─── Delete all ───────────────────────────────────────────────────────────────

function deleteAllPresets() {
  if (presetStore.history.length === 0) {
    // Even if empty, let's try to clear just in case of stale state
    console.warn('Bank seems empty but calling clear anyway')
  }
  showDeleteConfirm.value = true
}

async function confirmDeleteAll() {
  // Mark as seeded BEFORE deleting to avoid immediate re-seeding by the store listener
  localStorage.setItem('sycore_bank_seeded', 'true')
  await presetStore.deleteAllPresets()
  showDeleteConfirm.value = false
}

function cancelDeleteAll() {
  showDeleteConfirm.value = false
}

onMounted(() => {
  if (authStore.user) {
    presetStore.init()
  }
})
</script>

<template>
  <div class="fixed inset-0 z-[120] max-h-[92vh] pb-[30px] flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-hidden p-4 md:p-8">
    <div class="bg-neutral-950 border border-neutral-900 rounded-3xl max-w-4xl overflow-hidden shadow-2xl pb-[24px]">

      <!-- Hidden file input -->
      <input ref="fileInput" type="file" accept=".json,.sco" class="hidden" @change="handleFileUpload" />

      <!-- ── HEADER ── -->
      <div class="flex flex-col md:flex-row md:items-center justify-between p-2 gap-4 bg-neutral-900">

        <!-- Title + slot count -->
        <div class="flex flex-col items-start gap-3 w-full md:w-1/3 max-w-1/3">
          <div class="flex items-center gap-3">
            <Layers class="w-5 h-5 text-synth-neon" />
            <h2 class="text-xl font-black uppercase tracking-tight text-white">Sound Bank</h2>
          </div>
          <span
            v-if="authStore.profile"
            class="text-[10px] bg-neutral-900 border border-neutral-800 px-2 py-1 rounded-md ml-2 font-mono text-neutral-400"
          >
            {{ presetStore.history.length }} / {{ slotLimit }} SLOTS
          </span>
        </div>

        <!-- Controls row -->
        <div class="relative flex flex-col w-full items-start gap-3 border-b md:border-none border-neutral-800 pb-4 md:pb-0">

          <!-- Filter dropdown -->
          <div class="relative z-50">
            <button
              @click="isFilterDropdownOpen = !isFilterDropdownOpen"
              class="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-white outline-none font-mono text-xs uppercase tracking-widest cursor-pointer hover:border-neutral-700 shadow-md min-w-[180px] flex justify-between items-center gap-2 transition-colors"
            >
              {{ filterLabel }}
              <ChevronDown class="w-4 h-4 opacity-50 shrink-0" />
            </button>

            <Transition name="dropdown">
              <div v-if="isFilterDropdownOpen">
                <div class="fixed inset-0 z-40" @click="isFilterDropdownOpen = false" />
                <div class="absolute top-full left-0 mt-2 w-full min-w-[180px] bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl overflow-y-auto max-h-[300px] z-50">
                  <button
                    v-for="opt in [
                      { val: 'all', label: 'ALL SOUND TYPES' },
                      { val: 'favorites', label: 'FAVORITES' },
                      ...configStore.appSoundTypes.filter(t => t.enabled).map(t => ({ val: t.id, label: t.label || t.id }))
                    ]"
                    :key="opt.val"
                    @click="setFilter(opt.val)"
                    :class="[
                      'w-full text-left px-4 py-3 text-xs font-mono uppercase tracking-widest transition-colors',
                      presetStore.historyCategoryFilter === opt.val
                        ? 'bg-neutral-800 text-synth-neon'
                        : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
                    ]"
                  >{{ opt.label }}</button>
                </div>
              </div>
            </Transition>
          </div>

          <!-- Action buttons -->
          <div class="flex items-center gap-2">
            <button
              @click="exportBank"
              :disabled="isExporting || presetStore.history.length === 0"
              class="text-[10px] font-mono text-neutral-500 hover:text-synth-neon uppercase tracking-widest px-3 py-2 bg-neutral-900 rounded border border-neutral-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Export Bank
            </button>
            <label class="text-[10px] font-mono text-neutral-500 hover:text-synth-neon uppercase tracking-widest px-3 py-2 bg-neutral-900 rounded border border-neutral-800 transition-colors cursor-pointer">
              Import Bank
              <input type="file" accept=".json,.sco" class="hidden" @change="handleFileUpload" />
            </label>
            <button
              @click="deleteAllPresets"
              class="text-[10px] font-mono text-red-500/70 hover:text-red-500 uppercase tracking-widest px-3 py-2 bg-neutral-900 rounded border border-red-900/30 hover:border-red-500/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Delete All
            </button>
            <button
              v-if="presetStore.history.length === 0"
              @click="presetStore.seedDefaultBank(authStore.user.uid, true)"
              class="text-[10px] font-mono text-synth-neon/70 hover:text-synth-neon uppercase tracking-widest px-3 py-2 bg-neutral-900 rounded border border-synth-neon/30 hover:border-synth-neon/50 transition-colors"
            >
              Restore Defaults
            </button>
            
          </div>
          <button
              @click="emit('close')"
              class="absolute top-0 right-0 text-[10px] font-mono text-neutral-500 hover:text-white uppercase tracking-widest px-3 py-2 transition-colors"
            >
              Close
            </button>
        </div>
      </div>

      <!-- ── PRESET GRID ── -->
      <div class="p-6 md:p-2 pt-0 overflow-y-auto custom-scrollbar max-h-[70vh]">

        <!-- Empty state -->
        <div v-if="filteredPresets.length === 0" class="py-20 text-center">
          <Ghost class="w-12 h-12 text-neutral-800 mx-auto mb-4" />
          <p class="font-mono text-xs text-neutral-600 uppercase tracking-widest">
            {{ presetStore.history.length === 0 ? 'No sounds archived' : 'No sounds matching filter' }}
          </p>
        </div>

        <!-- Card grid -->
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-scroll custom-scrollbar">
          <div
            v-for="preset in filteredPresets"
            :key="preset.id"
            @click="recallPreset(preset)"
            class="bg-neutral-900/50 border border-neutral-800 p-4 rounded-xl cursor-pointer group hover:border-synth-neon/50 hover:bg-neutral-900 transition-all relative overflow-hidden"
          >
            <div class="flex justify-between items-start relative z-10">
              <div class="min-w-0 flex-1">
                <!-- Meta row: icon · category · polymode · seq · favorite -->
                <div class="flex items-center gap-1.5 mb-1 flex-wrap">
                  <span class="text-sm leading-none select-none grayscale">{{ getCategoryIcon(preset.category) }}</span>
                  <span class="text-[8px] font-mono text-synth-neon/60 uppercase">{{ preset.category }}</span>

                  <template v-if="preset.data?.polyMode !== undefined">
                    <span class="w-1 h-1 rounded-full bg-neutral-600 shrink-0" />
                    <span class="text-[8px] font-mono text-neutral-500 uppercase">
                      {{ polyModeLabel(preset.data.polyMode) }}
                    </span>
                  </template>

                  <template v-if="preset.seqConfig">
                    <span class="w-1 h-1 rounded-full bg-neutral-600 shrink-0" />
                    <span class="text-[8px] font-mono text-amber-500 uppercase">SEQ</span>
                  </template>

                  <Heart
                    v-if="preset.isFavorite"
                    class="w-3 h-3 text-rose-500 fill-rose-500 ml-0.5 shrink-0"
                  />
                </div>

                <!-- Preset name -->
                <h4 class="text-sm font-black uppercase tracking-tight text-neutral-200 truncate">
                  <span class="text-neutral-500 font-mono mr-1.5 text-xs">#{{ getPresetIndex(preset) }}</span>{{ preset.name }}
                </h4>
              </div>

              <!-- Delete button (hover only) -->
              <button
                @click.stop="deletePreset($event, preset.id)"
                class="opacity-0 group-hover:opacity-100 p-1.5 hover:text-red-500 text-neutral-500 bg-black/50 rounded-lg transition-all shrink-0 ml-2"
                title="Delete"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>

            <!-- Mini CC bars -->
            <div class="mt-3 flex gap-1">
              <div
                v-for="(val, i) in Object.values(preset.data || {}).slice(0, 8)"
                :key="i"
                class="h-0.5 flex-1 bg-neutral-800 rounded-full overflow-hidden"
              >
                <div
                  class="h-full bg-synth-neon/40"
                  :style="{ width: `${(Number(val) / 127) * 100}%` }"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- ── DELETE ALL CONFIRM MODAL ── -->
    <Transition name="fade">
      <div v-if="showDeleteConfirm" class="fixed inset-0 z-[150] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/80 backdrop-blur-md" @click="cancelDeleteAll" />
        <div class="relative bg-neutral-950 border border-red-500/30 rounded-3xl p-8 max-w-sm w-full shadow-[0_0_50px_rgba(239,68,68,0.2)] text-center">
          <div class="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-red-500/20">
            <Trash2 class="w-8 h-8 text-red-500" />
          </div>
          <h3 class="text-xl font-black text-white uppercase tracking-tight mb-2">Wipe Sound Bank?</h3>
          <p class="text-neutral-400 text-xs font-mono uppercase tracking-widest leading-relaxed mb-8">
            This will permanently delete all {{ presetStore.history.length }} sounds. This action cannot be undone.
          </p>
          <div class="flex flex-col gap-3">
            <button
              @click="confirmDeleteAll"
              class="w-full bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-xl uppercase tracking-widest text-xs transition-all active:scale-95"
            >
              Yes, Delete Everything
            </button>
            <button
              @click="cancelDeleteAll"
              class="w-full bg-neutral-900 hover:bg-neutral-800 text-neutral-400 font-black py-4 rounded-xl uppercase tracking-widest text-xs border border-neutral-800 transition-all active:scale-95"
            >
              Cancel / Undo
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
