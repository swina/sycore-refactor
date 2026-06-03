import { ref, computed, watch, onUnmounted } from 'vue'
import { registerMinimized, unregisterMinimized } from './useMinimizedModals'

// Shared counter — each bringToFront call gets the next highest z-index
let _topZ = 1000

export function useDraggableResizable({
  storageKey = null,
  initialWidth = 900,
  initialHeight = 700,
  minWidth = 500,
  minHeight = 400,
  zIndex = 100,
  minimizedHeight = 44,
  minimizeLabel = 'Modal',
} = {}) {

  const _id = storageKey || `modal_${Math.random().toString(36).slice(2)}`

  function loadSaved() {
    if (!storageKey) return null
    try {
      const v = JSON.parse(localStorage.getItem(storageKey))
      if (v && typeof v.x === 'number') return v
    } catch {}
    return null
  }

  function getDefault() {
    const w = Math.min(initialWidth, window.innerWidth - 16)
    const h = Math.min(initialHeight, window.innerHeight - 16)
    return {
      x: Math.max(8, Math.round((window.innerWidth - w) / 2)),
      y: Math.max(8, Math.round((window.innerHeight - h) / 2)),
      w,
      h,
      minimized: false,
    }
  }

  const pos = ref(loadSaved() ?? getDefault())
  if (pos.value.minimized === undefined) pos.value.minimized = false

  const activeZ = ref(zIndex)

  function bringToFront() {
    activeZ.value = ++_topZ
  }

  const isMinimized = computed({
    get: () => !!pos.value.minimized,
    set: (v) => { pos.value.minimized = v; persist() },
  })

  function toggleMinimize() {
    isMinimized.value = !isMinimized.value
  }

  // Keep global minimized-modals registry in sync
  watch(isMinimized, (v) => {
    if (v) registerMinimized(_id, minimizeLabel, toggleMinimize)
    else   unregisterMinimized(_id)
  }, { immediate: true })

  onUnmounted(() => unregisterMinimized(_id))

  function persist() {
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(pos.value)) } catch {}
    }
  }

  function constrain() {
    const p = pos.value
    p.w = Math.max(minWidth, p.w)
    p.h = Math.max(minHeight, p.h)
    p.x = Math.max(0, Math.min(window.innerWidth - p.w, p.x))
    p.y = Math.max(0, Math.min(window.innerHeight - p.h, p.y))
  }

  const panelStyle = computed(() => ({
    position: 'fixed',
    left:   pos.value.x + 'px',
    top:    pos.value.y + 'px',
    width:  pos.value.w + 'px',
    height: pos.value.h + 'px',
    zIndex: activeZ.value,
  }))

  /* ── Drag ──────────────────────────────────────────────────────── */
  let _drag = null

  function onDragStart(e) {
    if (e.button !== 0) return
    if (e.target.closest('button, input, select, a, [role="button"]')) return
    bringToFront()
    e.preventDefault()
    _drag = { ox: e.clientX, oy: e.clientY, px: pos.value.x, py: pos.value.y }
    window.addEventListener('mousemove', _onDragMove)
    window.addEventListener('mouseup', _onDragEnd)
  }

  function _onDragMove(e) {
    if (!_drag) return
    pos.value.x = _drag.px + (e.clientX - _drag.ox)
    pos.value.y = _drag.py + (e.clientY - _drag.oy)
    constrain()
  }

  function _onDragEnd() {
    _drag = null
    window.removeEventListener('mousemove', _onDragMove)
    window.removeEventListener('mouseup', _onDragEnd)
    persist()
  }

  /* ── Resize ────────────────────────────────────────────────────── */
  let _res = null

  function onResizeStart(e, dir) {
    if (e.button !== 0) return
    if (pos.value.minimized) return
    bringToFront()
    e.preventDefault()
    e.stopPropagation()
    _res = {
      dir,
      ox: e.clientX, oy: e.clientY,
      sw: pos.value.w, sh: pos.value.h,
      sx: pos.value.x, sy: pos.value.y,
    }
    window.addEventListener('mousemove', _onResizeMove)
    window.addEventListener('mouseup', _onResizeEnd)
  }

  function _onResizeMove(e) {
    if (!_res) return
    const { dir, ox, oy, sw, sh, sx, sy } = _res
    const dx = e.clientX - ox, dy = e.clientY - oy
    if (dir.includes('e')) pos.value.w = Math.max(minWidth, sw + dx)
    if (dir.includes('s')) pos.value.h = Math.max(minHeight, sh + dy)
    if (dir.includes('w')) { pos.value.w = Math.max(minWidth, sw - dx); pos.value.x = sx + (sw - pos.value.w) }
    if (dir.includes('n')) { pos.value.h = Math.max(minHeight, sh - dy); pos.value.y = sy + (sh - pos.value.h) }
    constrain()
  }

  function _onResizeEnd() {
    _res = null
    window.removeEventListener('mousemove', _onResizeMove)
    window.removeEventListener('mouseup', _onResizeEnd)
    persist()
  }

  return { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront }
}
