<template>
  <div class="flex items-center gap-1">
    <!-- Enabled presets indicator -->
    <div class="flex items-center gap-1 px-2 py-1 rounded-full bg-neutral-900/60 border border-neutral-800/60 group relative cursor-default">
      <Cpu class="w-3 h-3 text-violet-400 shrink-0" />
      <span class="text-[9px] font-black font-mono text-violet-300">{{ enabledCount }}</span>
      <div
        class="absolute bottom-full left-0 mb-1 hidden group-hover:flex flex-col bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 shadow-xl whitespace-nowrap z-[1060] min-w-[180px]"
      >
        <span class="text-[8px] text-neutral-500 uppercase tracking-wider font-bold mb-1">Controller Presets</span>
        <button
          v-for="p in presets"
          :key="p.id"
          @click.stop="togglePreset(p.id)"
          class="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-neutral-800 transition-colors text-left"
        >
          <span
            :class="[
              'w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors shrink-0',
              isEnabled(p.id)
                ? 'bg-violet-500 border-violet-400'
                : 'bg-transparent border-neutral-600'
            ]"
          >
            <Check v-if="isEnabled(p.id)" class="w-2.5 h-2.5 text-white" />
          </span>
          <span class="text-[10px] font-mono" :class="isEnabled(p.id) ? 'text-white' : 'text-neutral-400'">
            {{ p.name }}
          </span>
        </button>
        <div v-if="presets.length === 0" class="text-[9px] text-neutral-500 italic px-1.5 py-1">No presets yet</div>
        <div class="border-t border-neutral-800 mt-1 pt-1 px-1.5">
          <button
            @click.stop="openDesigner"
            class="text-[9px] text-violet-400 hover:text-violet-300 transition-colors font-bold"
          >
            + Open Designer
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Cpu, Check } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { loadControllerPresets } from '@/lib/midi-controller-presets'

const uiStore = useUiStore()
const authStore = useAuthStore()
const uid = computed(() => authStore.user?.uid)

const presets = ref([])

const enabledCount = computed(() => uiStore.enabledControllerDesignerPresetIds.length)

function isEnabled(id) {
  return uiStore.enabledControllerDesignerPresetIds.includes(id)
}

function togglePreset(id) {
  const idx = uiStore.enabledControllerDesignerPresetIds.indexOf(id)
  if (idx === -1) {
    uiStore.enabledControllerDesignerPresetIds.push(id)
  } else {
    uiStore.enabledControllerDesignerPresetIds.splice(idx, 1)
  }
}

function openDesigner() {
  uiStore.isMidiControllerDesignerOpen = true
}

watch(uid, async (newUid) => {
  if (!newUid) {
    presets.value = []
    return
  }
  const loaded = await loadControllerPresets()
  presets.value = loaded
}, { immediate: true })
</script>
