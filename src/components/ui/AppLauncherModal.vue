<script setup>
import ModalShell from '@/components/ui/ModalShell.vue'
import AppLauncher from '@/components/ui/AppLauncher.vue'

const emit = defineEmits(['close'])
</script>

<template>
  <ModalShell title="Apps" size="lg" zClass="z-[1050]" @close="emit('close')">
    <div class="p-4 sm:p-5">
      <AppLauncher variant="modal" @select="emit('close')" />
    </div>
  </ModalShell>
</template>
