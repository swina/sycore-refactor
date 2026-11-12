<script setup>
// The header of a player panel in its play view: name, EDIT, window buttons — nothing else (tempo,
// position and transport are in the toolbar and on the Rig). Drag it to move the panel.
import PlayEditToggle from '@/components/ui/PlayEditToggle.vue'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
// edit: false for a panel with no settings to fold (Map · Live Instruments)
defineProps({ title: String, panelId: String, accent: { type: String, default: 'text-amber-300' }, edit: { type: Boolean, default: true } })
defineEmits(['close', 'minimize', 'maximize'])
</script>

<template>
  <div class="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-neutral-800 bg-black/40 touch-none cursor-grab active:cursor-grabbing select-none">
    <span class="text-[11px] font-black uppercase tracking-widest" :class="accent">{{ title }}</span>
    <PlayEditToggle v-if="edit" :panel-id="panelId" />
    <!-- the panel's own controls after EDIT (e.g. the Drum Machine's style) -->
    <slot />
    <div class="flex-1" />
    <div @mousedown.stop><MacOsButtons @close="$emit('close')" @minimize="$emit('minimize')" @maximize="$emit('maximize')" /></div>
  </div>
</template>
