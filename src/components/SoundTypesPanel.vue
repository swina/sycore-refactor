<script setup>
import { ref, computed } from 'vue'
import {
  X, Layers, Activity, Zap, Ghost, Dna, Anchor, Wind, Circle,
  Cpu, Box, Triangle, Compass, Sparkles, Bot, RefreshCw, Save, Trash2
} from 'lucide-vue-next'
import { usePresetStore } from '@/stores/usePresetStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { S1_MUSICAL_VARIATIONS } from '@/constants/s1-musical-variations'

const emit = defineEmits(['close'])

const presetStore = usePresetStore()
const configStore = useConfigStore()

const showPrompt = ref(false)

const activeTypes = computed(() => configStore.appSoundTypes.filter(t => t.enabled))

const iconMap = {
  pad:          Layers,
  bass:         Activity,
  lead:         Zap,
  arp:          Ghost,
  keys:         Dna,
  pluck:        Anchor,
  brass:        Wind,
  bell:         Circle,
  fm:           Cpu,
  sequence:     Box,
  sfx:          Triangle,
  percussion:   Compass,
  experimental: Sparkles,
  ai:           Bot,
}
const getIcon = (id) => iconMap[id] ?? Wind

function selectCategory(id) {
  presetStore.setCategory(id)
  presetStore.currentVariation = null
  showPrompt.value = false
}

const categoryVariations = computed(() => {
  return S1_MUSICAL_VARIATIONS[presetStore.currentCategory] || []
})

function selectVariation(v) {
  if (presetStore.currentVariation?.name === v.name) {
    presetStore.currentVariation = null
  } else {
    presetStore.currentVariation = v
  }
}

function handleGenerate() {
  if (presetStore.hasUnsavedChanges) {
    showPrompt.value = true
  } else {
    presetStore.generate()
    emit('close')
  }
}

async function saveAndGenerate() {
  await presetStore.savePreset()
  presetStore.generate()
  emit('close')
}

function discardAndGenerate() {
  presetStore.generate()
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <Transition name="sy-modal" appear>
      <div class="bg-neutral-950/90 border border-synth-neon/30 glow-neon rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] relative">

        <!-- Header -->
        <div class="p-6 border-b border-neutral-900 flex justify-between items-center bg-neutral-900/50 backdrop-blur-md sticky top-0 z-20">
          <h2 class="text-xl font-black uppercase tracking-tight text-white flex items-center gap-3">
            <Layers class="w-5 h-5 text-synth-neon" /> Select Sound Type
          </h2>
          <button @click="emit('close')" class="p-2 bg-neutral-800 text-neutral-400 rounded-lg hover:bg-neutral-700 hover:text-white transition-all">
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Grid -->
        <div class="p-6 overflow-y-auto custom-scrollbar flex-1 relative">
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
            <button
              v-for="(cat, i) in activeTypes"
              :key="`${cat.id}-${i}`"
              @click="selectCategory(cat.id)"
              :class="[
                'relative h-24 flex flex-col justify-end p-3 rounded-xl border transition-all duration-200 text-left overflow-hidden group',
                presetStore.currentCategory === cat.id
                  ? 'bg-neutral-900 border-synth-neon glow-neon'
                  : 'bg-neutral-950 border-neutral-900 hover:border-neutral-800'
              ]"
            >
              <template v-if="configStore.soundTypeBg[cat.id]">
                <div
                  class="absolute inset-0 bg-cover bg-center opacity-20 transition-opacity duration-300 group-hover:opacity-30"/>
                  <!-- :style="{ backgroundImage: `url(${configStore.soundTypeBg[cat.id]})` }"
                /> -->
                <div class="absolute inset-0 bg-gradient-to-br from-synth-cyan/20 to-transparent to-transparent" />
              </template>
              <div class="relative z-10 flex flex-col gap-2">
                <component
                  :is="getIcon(cat.id)"
                  class="w-5 h-5 transition-colors"
                  :class="presetStore.currentCategory === cat.id ? 'text-synth-neon' : 'text-neutral-500 group-hover:text-synth-neon'"
                />
                <span
                  class="font-black text-[10px] uppercase tracking-widest"
                  :class="presetStore.currentCategory === cat.id ? 'text-white' : 'text-neutral-300'"
                >{{ cat.label || cat.id }}</span>
              </div>
            </button>
          </div>

          <!-- Variations / Keywords -->
          <Transition name="sy-modal">
            <div v-if="categoryVariations.length > 0" class="mt-8">
              <div class="flex items-center gap-3 mb-4">
                <div class="h-[1px] flex-1 bg-neutral-900"></div>
                <span class="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-500">Refine with Keywords</span>
                <div class="h-[1px] flex-1 bg-neutral-900"></div>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="v in categoryVariations"
                  :key="v.name"
                  @click="selectVariation(v)"
                  :class="[
                    'px-4 py-3 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all flex flex-col items-start gap-1',
                    presetStore.currentVariation?.name === v.name
                      ? 'bg-synth-neon/10 border-synth-neon text-synth-neon shadow-[0_0_15px_rgba(0,255,159,0.2)]'
                      : 'bg-neutral-900/50 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white'
                  ]"
                >
                  <span>{{ v.name }}</span>
                  <span class="text-[8px] opacity-50 font-medium normal-case tracking-normal">{{ v.keywords }}</span>
                </button>
              </div>
            </div>
          </Transition>
        </div>

        <!-- Footer -->
        <div class="p-6 border-t border-neutral-900 bg-neutral-950 flex flex-col md:flex-row items-center justify-between gap-4 sticky bottom-0 z-20 mt-auto">
          <div class="flex-1">
            <Transition name="sy-modal" mode="out-in">
              <div v-if="showPrompt" class="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <span class="text-xs font-bold text-neutral-400 uppercase tracking-widest mr-2">Unsaved preset!</span>
                <div class="flex items-center gap-2">
                  <button @click="discardAndGenerate"
                    class="flex items-center gap-2 px-4 py-2 bg-red-950/40 text-red-400 hover:bg-red-500 hover:text-white border border-red-900/50 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                  ><Trash2 class="w-3 h-3" /> DISCARD</button>
                  <button @click="saveAndGenerate" :disabled="presetStore.isSaving"
                    class="flex items-center gap-2 px-4 py-2 bg-emerald-950/40 text-emerald-400 hover:bg-emerald-500 hover:text-white border border-emerald-900/50 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                  ><Save class="w-3 h-3" :class="presetStore.isSaving ? 'animate-pulse' : ''" />
                    {{ presetStore.isSaving ? 'SAVING...' : 'SAVE' }}</button>
                </div>
              </div>
              <div v-else class="flex flex-col">
                <span class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Target Mode: </span>
                <div class="flex items-baseline gap-2">
                  <span class="text-[12px] font-black text-synth-neon uppercase tracking-tight">
                    {{ presetStore.currentCategory === 'ai' ? 'AI SYNTH' : presetStore.currentCategory }}
                  </span>
                  <span v-if="presetStore.currentVariation" class="text-[10px] font-bold text-white uppercase tracking-wider opacity-80">
                    / {{ presetStore.currentVariation.name }}
                  </span>
                </div>
              </div>
            </Transition>
          </div>
          <button @click="handleGenerate" :disabled="showPrompt && presetStore.isSaving"
            class="flex items-center justify-center gap-2 bg-synth-neon text-black px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-white transition-colors shadow-lg active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          >
            <RefreshCw class="w-4 h-4" /> Generate
          </button>
        </div>

        <!-- AI overlay -->
        <Transition name="sy-modal">
          <div v-if="presetStore.currentCategory === 'ai'"
            class="absolute inset-0 z-[200] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 rounded-3xl"
          >
            <button @click="selectCategory('pad')"
              class="absolute top-6 right-6 p-2 bg-neutral-900 border border-neutral-800 text-neutral-400 rounded-lg hover:bg-synth-neon hover:text-black hover:border-synth-neon transition-all shadow-lg"
            ><X class="w-5 h-5" /></button>

            <div class="w-full max-w-xl text-center flex flex-col items-center">
              <Bot class="w-16 h-16 text-synth-neon mb-4" />
              <span class="text-xl font-black text-white uppercase tracking-[0.2em] mb-8">
                AI <span class="text-synth-neon">S1CORE</span>
              </span>

              <input
                v-model="presetStore.aiPrompt"
                type="text"
                placeholder="e.g. pad dark polifonico"
                class="w-full bg-neutral-950 border-2 border-neutral-800 rounded-xl px-6 py-4 text-white text-lg font-medium focus:outline-none focus:border-synth-neon transition-all mb-6 text-center shadow-inner"
              />

              <div class="flex flex-col items-center w-full mb-10">
                <span class="text-[10px] text-neutral-500 uppercase tracking-widest mb-3">Suggestions</span>
                <div class="flex flex-wrap items-center justify-center gap-3">
                  <button v-for="tag in ['pad dark polifonico','bass acid res','lead detuned','organ dist']" :key="tag"
                    @click="presetStore.aiPrompt = presetStore.aiPrompt ? presetStore.aiPrompt + ' ' + tag : tag"
                    class="text-xs uppercase font-bold tracking-wider bg-neutral-900 border border-neutral-700 hover:border-synth-neon hover:text-synth-neon hover:bg-black text-neutral-400 px-4 py-2 rounded-xl transition-all"
                  >{{ tag }}</button>
                </div>
              </div>

              <button @click="handleGenerate" :disabled="showPrompt && presetStore.isSaving"
                class="flex flex-row items-center justify-center gap-3 bg-synth-neon text-black px-12 py-4 rounded-xl font-black text-sm uppercase tracking-[0.2em] hover:bg-white transition-colors active:scale-95 disabled:opacity-50 w-full max-w-sm"
              >
                <Sparkles class="w-5 h-5" /> Generate sound
              </button>

              <span class="text-[10px] font-mono text-neutral-500 mt-8">
                * Describe sound character, waveform, filter, or genre.
              </span>
            </div>
          </div>
        </Transition>

      </div>
    </Transition>
  </div>
</template>
