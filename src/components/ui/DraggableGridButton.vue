<template>
    <div class="flex flex-col gap-1 overflow-y-auto">
        <div
          v-for="(btn, idx) in buttonList" :key="`${btn.id}-${idx}`"
          draggable="true"
          @click="$emit('select', idx)"
          @dragstart="dragIdxRef = idx"
          @dragover.prevent="dragOverIdx !== idx && (dragOverIdx = idx)"
          @drop.prevent="(e) => { if (dragIdxRef !== null) reorderButtonList(dragIdxRef, idx); dragIdxRef = null; dragOverIdx = null }"
          @dragend="dragIdxRef = null; dragOverIdx = null"
          :class="['group isolate relative overflow-hidden flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors border', dragOverIdx === idx ? 'bg-synth-neon/5 border-synth-neon/50' : isPlaylistMode && buttonIdx === idx ? 'bg-synth-neon/10 border-synth-neon text-synth-neon' : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:border-neutral-700']"
        >
          <!-- Progress overlay for current track -->
          <div v-if="isPlaylistMode && playlistIdx === idx"
            class="absolute inset-y-0 left-0 bg-synth-neon/20 pointer-events-none"
            :style="{ width: `${duration > 0 ? Math.min(100, (currentTime / duration) * 100).toFixed(1) : 0}%`, zIndex: -1 }"
          />
          <GripVertical class="w-3 h-3 text-neutral-700 shrink-0 cursor-grab active:cursor-grabbing" />
          <span class="text-[9px] font-mono text-neutral-600 w-4 shrink-0 text-center">{{ idx + 1 }}</span>
          <div class="flex flex-col flex-1 overflow-hidden min-w-0">
            <span class="text-xs font-bold truncate flex items-center gap-1.5">
              {{ btn.label }}
            </span>
            <span class="text-[10px] text-neutral-500 uppercase tracking-wider">{{ btn.category }}</span>
          </div>
          
          <!-- Move / Remove -->
          <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" @click.stop>
            <button @click="moveInButtonList(idx, 'up')" :disabled="idx === 0" class="p-1 text-neutral-600 hover:text-white disabled:opacity-20 transition-colors"><ChevronUp class="w-3 h-3" /></button>
            <button @click="moveInButtonList(idx, 'down')" :disabled="idx === buttonList.length - 1" class="p-1 text-neutral-600 hover:text-white disabled:opacity-20 transition-colors"><ChevronDown class="w-3 h-3" /></button>
            <button @click="removeFromButtonList(idx)" class="p-1 text-neutral-600 hover:text-red-400 transition-colors"><X class="w-3 h-3" /></button>
          </div>
        </div>
      </div>
</template>

<script setup>
import { ref } from 'vue'
import { GripVertical, ChevronUp, ChevronDown, X } from 'lucide-vue-next'

const props = defineProps({
  buttonList: Array,
  buttonIdx: Number
})

const emit = defineEmits(['play', 'move', 'remove'])

const dragIdxRef = ref(null)
const dragOverIdx = ref(null)

function moveInButtonList(fromIdx, direction) {
  emit('move', fromIdx, direction)
}

function removeFromButtonList(idx) {
  emit('remove', idx)
}

function reorderButtonList(fromIdx, toIdx) {
  if (fromIdx === toIdx) return
  const pl = [...props.buttonList]
  const [item] = pl.splice(fromIdx, 1)
  pl.splice(toIdx, 0, item)
  emit('update:buttonList', pl)

  const cur = props.buttonIdx
  if (cur === fromIdx) emit('update:buttonIdx', toIdx)
  else if (fromIdx < toIdx && cur > fromIdx && cur <= toIdx) emit('update:buttonIdx', cur - 1)
  else if (fromIdx > toIdx && cur >= toIdx && cur < fromIdx) emit('update:buttonIdx', cur + 1)
}


</script>