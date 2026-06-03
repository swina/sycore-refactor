<script setup>
import StepSequencer from './StepSequencer.vue'

defineOptions({ inheritAttrs: false })
defineProps({ isOpen: Boolean })
</script>

<template>
  <div v-if="isOpen" class="fixed rounded-lg py-4 inset-0 max-w-[1020px] max-h-[88vh] w-full bg-black/50 z-1000">
  <StepSequencer
    v-if="isOpen"
    v-bind="$attrs"
    :isOpen="true"
    :embedded="false"
  />
  </div>
</template>
