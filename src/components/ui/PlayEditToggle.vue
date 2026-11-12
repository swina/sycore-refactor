<script setup>
// PLAY / EDIT for a player panel in a workspace with play views (Performance): EDIT unfolds its
// settings, PLAY folds them away again. Hidden elsewhere.
import { usePlayView } from '@/composables/usePlayView'
const props = defineProps({ panelId: { type: String, required: true } })
const { playViews, isEditing, toggleEdit } = usePlayView(props.panelId)
</script>

<template>
  <button
    v-if="playViews"
    @click.stop="toggleEdit"
    @mousedown.stop
    :class="['px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border transition-colors shrink-0',
      isEditing ? 'border-amber-500/60 text-amber-300 bg-amber-500/10' : 'border-neutral-700 text-neutral-400 hover:text-neutral-200']"
    :title="isEditing ? 'Back to the play view (settings folded)' : 'Edit: show the settings'"
  >{{ isEditing ? 'Play view' : 'Edit' }}</button>
</template>
