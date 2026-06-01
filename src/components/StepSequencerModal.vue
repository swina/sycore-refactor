<script setup>
import StepSequencer from './StepSequencer.vue'

defineOptions({ inheritAttrs: false })
defineProps({ isOpen: Boolean })
</script>

<template>
  <div v-if="isOpen" class="fixed rounded-lg py-4 inset-0 max-w-[980px] ml-16 bg-black/50 backdrop-blur-sm z-40" @click="$emit('close')">
  <StepSequencer
    v-if="isOpen"
    v-bind="$attrs"
    :isOpen="true"
    :embedded="false"
  />
  </div>
</template>
