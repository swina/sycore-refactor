<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { lucideIcons } from '@/lib/lucide-icons'
const { Menu, X } = lucideIcons
import { useUiStore } from '@/stores/useUiStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { moduleRegistry } from '@/core/modules/registry'

const authStore = useAuthStore()
const uiStore = useUiStore()
const configStore = useConfigStore()

const COLORS = [
  'text-synth-neon', 'text-blue-400', 'text-yellow-400', 'text-emerald-400',
  'text-pink-400', 'text-red-400', 'text-indigo-400', 'text-orange-400',
  'text-rose-400', 'text-cyan-400', 'text-purple-400', 'text-amber-400'
]

// Driven entirely by moduleRegistry + ModuleManagerPanel's enabled state,
// same source as AppFooter.vue's menuActions — keeps the dial and footer
// menus identical. See docs/plans/modular-panel-system.md.
const filteredActions = computed(() => {
  if (!uiStore.isMainMenuOpen) return []

  const enabledModules = moduleRegistry.filter(m => configStore.isModuleEnabled(m.id))

  return enabledModules.map((m, idx) => ({
    id: m.id,
    label: m.label,
    iconComponent: m.icon,
    color: COLORS[idx % COLORS.length],
    onClick: () => uiStore.togglePanel(m.id)
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
