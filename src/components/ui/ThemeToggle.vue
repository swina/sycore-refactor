<script setup>
import { Sun, Moon } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import SyButton from '@/components/ui/SyButton.vue'

const props = defineProps({
  size: { type: String, default: 'md' },
})

const uiStore = useUiStore()
</script>

<template>
  <SyButton
    variant="icon"
    :size="props.size"
    :title="uiStore.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
    @click="uiStore.toggleTheme()"
  >
    <Sun v-if="uiStore.theme === 'dark'" class="w-4 h-4" />
    <Moon v-else class="w-4 h-4" />
  </SyButton>
</template>
