<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { lucideIcons } from '@/lib/lucide-icons'
const { Menu, X } = lucideIcons
import { useUiStore } from '@/stores/useUiStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useAuthStore } from '@/stores/useAuthStore'

const authStore = useAuthStore()
const uiStore = useUiStore()
const configStore = useConfigStore()

const COLORS = [
  'text-synth-neon', 'text-blue-400', 'text-yellow-400', 'text-emerald-400',
  'text-pink-400', 'text-red-400', 'text-indigo-400', 'text-orange-400',
  'text-rose-400', 'text-cyan-400', 'text-purple-400', 'text-amber-400'
]

const filteredActions = computed(() => {
  if (!uiStore.isMainMenuOpen) return []

  const configButtons = (configStore.toolbarConfig || [])
    .filter(b => b.enabled !== false && (b.fab === 'main' || !b.fab))

  return configButtons.map((b, idx) => ({
    ...b,
    iconComponent: lucideIcons[b.icon] || lucideIcons.HelpCircle,
    color: COLORS[idx % COLORS.length],
    onClick: () => uiStore.togglePanel(b.id)
  })).reverse()
})

const toggle = () => uiStore.toggleMainMenu()

const handleMidiMainMenu = (e) => {
  const { action, val } = e.detail
  if (action === 'toggle') {
    if (val > 63) {
      if (uiStore.isMainMenuOpen && uiStore.mainMenuSelectedIndex !== -1) {
        const currentActions = filteredActions.value
        const selectedAction = currentActions[uiStore.mainMenuSelectedIndex]
        if (selectedAction) {
          selectedAction.onClick()
          uiStore.isMainMenuOpen = false
        }
      } else {
        uiStore.toggleMainMenu()
      }
    }
  } else if (action === 'select') {
    if (val > 63 && uiStore.isMainMenuOpen && uiStore.mainMenuSelectedIndex !== -1) {
      const currentActions = filteredActions.value
      const selectedAction = currentActions[uiStore.mainMenuSelectedIndex]
      if (selectedAction) {
        selectedAction.onClick()
        uiStore.isMainMenuOpen = false
      }
    }
  } else if (action === 'scroll') {
    if (uiStore.isMainMenuOpen) {
      const currentActions = filteredActions.value
      if (currentActions.length > 0) {
        const idx = Math.min(
          currentActions.length - 1,
          Math.floor((val / 127.1) * currentActions.length)
        )
        uiStore.mainMenuSelectedIndex = idx
      }
    }
  }
}

onMounted(() => {
  window.addEventListener('midi-main-menu', handleMidiMainMenu)
})

onUnmounted(() => {
  window.removeEventListener('midi-main-menu', handleMidiMainMenu)
})

const activeLabel = computed(() => {
  if (!uiStore.isMainMenuOpen || uiStore.mainMenuSelectedIndex === -1) return ''
  const currentActions = filteredActions.value
  const selectedAction = currentActions[uiStore.mainMenuSelectedIndex]
  return selectedAction ? selectedAction.label : ''
})
</script>

<template></template>
