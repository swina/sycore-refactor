<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { X, Layers, Heart, Trash2, Download, Ghost, ChevronDown } from 'lucide-vue-next'
import { usePresetStore } from '@/stores/usePresetStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useConfigStore } from '@/stores/useConfigStore'
import BANK_DEFAULT from '@/data/BANK_DEFAULT.json'

const emit = defineEmits(['close'])

const presetStore = usePresetStore()
const authStore = useAuthStore()
const configStore = useConfigStore()

const fileInput = ref(null)
const isExporting = ref(false)
const defaultBankLoaded = ref(false)
const isFilterDropdownOpen = ref(false)

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

// ─── Filtered preset list (uses store filter + optional text search) ──────────

const filteredPresets = computed(() => presetStore.filteredHistory)

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

function deletePreset(e, id) {
  e.stopPropagation()
  presetStore.deletePreset(id)
}

// ─── Export bank ──────────────────────────────────────────────────────────────

function exportBank() {
  isExporting.value = true
  try {
    const bankData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      presets: presetStore.history,
    }
    const blob = new Blob([JSON.stringify(bankData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `preset-bank-${Date.now()}.json`
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
    if (!bankData.presets || !Array.isArray(bankData.presets)) {
      alert('Invalid bank file format')
      return
    }
    for (const preset of bankData.presets) {
      await presetStore.savePreset(preset.name, preset.data, preset.category, {
        id: preset.id, patchNotes: preset.patchNotes, arpConfig: preset.arpConfig,
        seqConfig: preset.seqConfig, isFavorite: preset.isFavorite,
        createdAt: preset.createdAt, updatedAt: preset.updatedAt,
      })
    }
    alert(`Imported ${bankData.presets.length} presets`)
  } catch (err) {
    console.error('Import failed', err)
    alert('Failed to import bank file')
  }
  if (fileInput.value) fileInput.value.value = ''
}

// ─── Delete all ───────────────────────────────────────────────────────────────

async function deleteAllPresets() {
  if (!confirm(`Delete all ${presetStore.history.length} presets? This cannot be undone.`)) return
  await presetStore.deleteAllPresets()
}

// ─── Default bank seeding ─────────────────────────────────────────────────────

async function loadDefaultBankIfNeeded() {
  if (defaultBankLoaded.value) return
  defaultBankLoaded.value = true

  if (!authStore.user) {
    defaultBankLoaded.value = false
    return
  }

  await new Promise(resolve => setTimeout(resolve, 100))

  if (presetStore.history.length === 0 && BANK_DEFAULT) {
    const presets = Array.isArray(BANK_DEFAULT) ? BANK_DEFAULT : (BANK_DEFAULT.presets || BANK_DEFAULT)
    if (presets && Array.isArray(presets)) {
      try {
        for (const preset of presets) {
          await presetStore.savePreset(preset.name, preset.data, preset.category, {
            id: preset.id, patchNotes: preset.patchNotes, arpConfig: preset.arpConfig,
            seqConfig: preset.seqConfig, abVariant: preset.abVariant,
            isFavorite: preset.isFavorite, createdAt: preset.createdAt, updatedAt: preset.updatedAt,
          })
        }
      } catch (err) {
        console.error('Failed to load default bank:', err)
      }
    }
  }
}

onMounted(async () => {
  if (authStore.user) {
    presetStore.loadHistory(authStore.user.uid)
    await loadDefaultBankIfNeeded()
  } else {
    watch(() => authStore.user, async (newUser) => {
      if (newUser) {
        presetStore.loadHistory(newUser.uid)
        await loadDefaultBankIfNeeded()
      }
    }, { once: true })
  }
})
</script>

<template>
  <div class="fixed inset-0 z-[120] flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto p-4 md:p-8">
    <div class="bg-neutral-950 border border-neutral-900 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl">

      <!-- Hidden file input -->
      <input ref="fileInput" type="file" accept=".json,.sco" class="hidden" @change="handleFileUpload" />

      <!-- ── HEADER ── -->
      <div class="flex flex-col md:flex-row md:items-center justify-between p-6 md:p-8 gap-4">

        <!-- Title + slot count -->
        <div class="flex items-center gap-3">
          <Layers class="w-5 h-5 text-synth-neon" />
          <h2 class="text-xl font-black uppercase tracking-tight text-white">Sound History</h2>
          <span
            v-if="authStore.profile"
            class="text-[10px] bg-neutral-900 border border-neutral-800 px-2 py-1 rounded-md ml-2 font-mono text-neutral-400"
          >
            {{ presetStore.history.length }} / {{ slotLimit }} SLOTS
          </span>
        </div>

        <!-- Controls row -->
        <div class="flex flex-wrap items-center gap-3 border-b md:border-none border-neutral-800 pb-4 md:pb-0">

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
              :disabled="presetStore.history.length === 0"
              class="text-[10px] font-mono text-red-500/70 hover:text-red-500 uppercase tracking-widest px-3 py-2 bg-neutral-900 rounded border border-red-900/30 hover:border-red-500/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Delete All
            </button>
            <button
              @click="emit('close')"
              class="text-[10px] font-mono text-neutral-500 hover:text-white uppercase tracking-widest px-3 py-2 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <!-- ── PRESET GRID ── -->
      <div class="p-6 md:p-8 pt-0">

        <!-- Empty state -->
        <div v-if="filteredPresets.length === 0" class="py-20 text-center">
          <Ghost class="w-12 h-12 text-neutral-800 mx-auto mb-4" />
          <p class="font-mono text-xs text-neutral-600 uppercase tracking-widest">
            {{ presetStore.history.length === 0 ? 'No sounds archived' : 'No sounds matching filter' }}
          </p>
        </div>

        <!-- Card grid -->
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                  <span class="text-sm leading-none select-none">{{ getCategoryIcon(preset.category) }}</span>
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
                  {{ preset.name }}
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
</style>
