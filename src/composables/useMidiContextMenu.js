import { ref } from 'vue'

// Module-level singleton — one menu shared across all components
const visible = ref(false)
const x       = ref(0)
const y       = ref(0)
const control = ref(null)   // { name, label }

const MENU_W = 232   // estimated w-56 + border
const MENU_H = 200   // estimated max height

function openMenu(event, ctrl) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  x.value = Math.min(event.clientX + 4, vw - MENU_W - 8)
  y.value = Math.min(event.clientY + 4, vh - MENU_H - 8)
  control.value = ctrl
  visible.value = true
}

function closeMenu() {
  visible.value = false
  control.value = null
}

export function useMidiContextMenu() {
  return { visible, x, y, control, openMenu, closeMenu }
}
