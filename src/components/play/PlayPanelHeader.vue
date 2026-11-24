<script setup>
// The header of a player panel in its play view: name, EDIT, window buttons — nothing else (tempo,
// position and transport are in the toolbar and on the Rig). Drag it to move the panel. (The common
// ui/PanelHeader with the play views' EDIT.)
import PanelHeader from '@/components/ui/PanelHeader.vue'
// edit: false for a panel with no settings to fold (Map · Live Instruments)
defineProps({ title: String, panelId: String, accent: { type: String, default: 'text-amber-300' }, edit: { type: Boolean, default: true }, icon: [Object, Function] })
defineEmits(['close', 'minimize', 'maximize'])
</script>

<template>
  <PanelHeader :title="title" :panel-id="panelId" :accent="accent" :edit="edit" :icon="icon"
               @close="$emit('close')" @minimize="$emit('minimize')" @maximize="$emit('maximize')">
    <!-- the panel's own controls after EDIT (e.g. the Drum Machine's style) -->
    <slot />
  </PanelHeader>
</template>
