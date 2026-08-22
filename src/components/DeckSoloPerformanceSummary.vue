<script setup>
import { computed } from 'vue'
import { Star, X, ExternalLink, Play, Square } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { useSoloPerformanceSets, SOLO_SLOT_LETTERS } from '@/composables/useSoloPerformanceSets'

const emit = defineEmits(['close'])

const uiStore = useUiStore()
const { soloSlots, soloSets, triggerSlot, getSlotAssignment, load } = useSoloPerformanceSets()

load()

function openPanel() {
  uiStore.openPanel('device-program-change')
}

// Show the first non-empty slot's device + patch info
const activeInfo = computed(() => {
  for (const slot of soloSlots.value) {
    if (!slot?.soloSetId) continue
    const set = soloSets.value.find(s => s.id === slot.soloSetId)
    if (set) return { deviceName: set.deviceName, soundName: set.soundName || `PC ${set.pcProgram}`, pcProgram: set.pcProgram }
  }
  return null
})
</script>

<template>
  <div class="flex flex-col h-full min-h-0 text-[9px] font-mono">
    <div class="flex items-center justify-between shrink-0 mb-1.5">
      <span class="flex items-center gap-1.5 text-synth-neon font-black uppercase tracking-widest text-[10px]">
        <Star class="w-3 h-3" /> Solo Performance
      </span>
      <div class="flex items-center gap-1">
        <button @click="openPanel" title="Open Device PC panel"
          class="p-1 rounded border border-neutral-700 text-neutral-400 hover:text-synth-neon hover:border-synth-neon/50 transition-colors"
        >
          <ExternalLink class="w-3 h-3" />
        </button>
        <button @click="emit('close')" title="Back"
          class="p-1 rounded border border-neutral-700 text-neutral-400 hover:text-rose-400 hover:border-rose-500/50 transition-colors"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <div class="flex-1 min-h-0 flex flex-col gap-1.5">
      <!-- Device + patch info -->
      <div v-if="activeInfo" class="px-2 py-1 bg-neutral-800/40 rounded-lg">
        <div class="text-[10px] font-bold text-white truncate">{{ activeInfo.deviceName }}</div>
        <div class="text-[8px] font-mono text-amber-400 truncate">{{ activeInfo.soundName }}</div>
      </div>
      <div v-else class="px-2 py-2 text-[8px] font-mono text-neutral-700 italic text-center">
        No solo sets assigned
      </div>

      <!-- Solo slot pads -->
      <div class="grid grid-cols-8 gap-1 mt-1">
        <button
          v-for="(slot, idx) in soloSlots"
          :key="idx"
          @click="triggerSlot(idx)"
          :class="[
            'flex flex-col items-center justify-center h-9 rounded border text-center transition-all',
            getSlotAssignment(idx)
              ? 'bg-amber-900/20 border-amber-600/40 text-amber-300 hover:bg-amber-900/40 hover:border-amber-500'
              : 'bg-neutral-900/40 border-neutral-800/60 text-neutral-500'
          ]"
          :title="getSlotAssignment(idx)?.name || 'Empty'"
        >
          <span class="text-[9px] font-black leading-none">{{ SOLO_SLOT_LETTERS[idx] }}</span>
          <span class="text-[6px] font-mono leading-none mt-0.5 truncate w-full px-0.5">
            {{ getSlotAssignment(idx)?.soundName || getSlotAssignment(idx)?.name || '—' }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
