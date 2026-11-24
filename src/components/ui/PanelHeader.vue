<script setup>
// The one panel header (the play views' style, every panel moving to it): an icon or the device's image, the
// title (and a short subtitle), the panel's own controls (default slot), its right-side controls (slot
// `actions`), the window buttons always on the right. Drag it to move the panel: the host passes its drag
// handler (@mousedown / @pointerdown fall through to the root). Controls inside stop the drag themselves.
import MacOsButtons from '@/components/ui/MacOsButtons.vue'
import PlayEditToggle from '@/components/ui/PlayEditToggle.vue'
defineProps({
  title: String,
  subtitle: String,
  icon: [Object, Function],
  image: String,
  accent: { type: String, default: 'text-neutral-200' },
  badge: String,
  /** the play views' EDIT toggle (panelId needed) */
  edit: { type: Boolean, default: false },
  panelId: String,
  /** no window buttons (a view inside another panel) */
  bare: { type: Boolean, default: false },
})
defineEmits(['close', 'minimize', 'maximize'])
</script>

<template>
  <div class="shrink-0 flex items-center gap-2 px-3 h-9 border-b border-neutral-800 bg-black/40 touch-none cursor-grab active:cursor-grabbing select-none min-w-0">
    <img v-if="image" :src="image" :alt="title" class="w-6 h-6 rounded object-cover border border-white/10 shrink-0" />
    <component v-else-if="icon" :is="icon" class="w-3.5 h-3.5 shrink-0" :class="accent" />
    <span class="text-[11px] font-black uppercase tracking-widest truncate shrink min-w-0" :class="accent" :title="title">{{ title }}</span>
    <span v-if="subtitle" class="text-[9px] font-mono text-neutral-500 truncate shrink min-w-0">{{ subtitle }}</span>
    <span v-if="badge" class="shrink-0 bg-amber-400/70 text-[8px] rounded font-mono px-1.5 text-black">{{ badge }}</span>
    <div v-if="edit" @mousedown.stop @pointerdown.stop><PlayEditToggle :panel-id="panelId" /></div>
    <div class="flex items-center gap-2 min-w-0" @mousedown.stop @pointerdown.stop><slot /></div>
    <div class="flex-1" />
    <div class="flex items-center gap-2 shrink-0" @mousedown.stop @pointerdown.stop><slot name="actions" /></div>
    <div v-if="!bare" class="shrink-0" @mousedown.stop @pointerdown.stop>
      <MacOsButtons @close="$emit('close')" @minimize="$emit('minimize')" @maximize="$emit('maximize')" />
    </div>
  </div>
</template>
