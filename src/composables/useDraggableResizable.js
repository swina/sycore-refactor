import { ref, computed, watch, onUnmounted } from 'vue'

const FOOTER_H = 40 // AppFooter h-10
import { registerMinimized, unregisterMinimized } from './useMinimizedModals'
import { userKey } from '@/lib/userKey'
import { useUiStore } from '@/stores/useUiStore'
import { useViewportClass } from './useViewportClass'

// Shared counter for draggable panels. Capped at 399 so non-draggable
// modals (z-[400]+) always layer above floating panels.
let _topZ = 50
const DRAGGABLE_Z_MAX = 399

export function useDraggableResizable({
  storageKey = null,
  initialWidth = 900,
  initialHeight = 700,
  minWidth = 500,
  minHeight = 400,
  zIndex = 100,
  minimizedHeight = 44,
  minimizeLabel = 'Modal',
  openRef = null,
  // Canonical moduleRegistry/PANEL_ID_REF_LOOKUP id — lets the open-apps
  // dock and useUiStore.focusPanel() address this panel by a stable id
  // instead of the internal storageKey.
  panelId = null,
} = {}) {

  const _id = storageKey || `modal_${Math.random().toString(36).slice(2)}`

  function loadSaved() {
    if (!storageKey) return null
    try {
      const v = JSON.parse(localStorage.getItem(userKey(storageKey)))
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
    if (_topZ >= DRAGGABLE_Z_MAX) _topZ = 50
    activeZ.value = ++_topZ
  }

  const isMinimized = computed({
    get: () => !!pos.value.minimized,
    set: (v) => { pos.value.minimized = v; persist() },
  })

  function toggleMinimize() {
    isMinimized.value = !isMinimized.value
  }

  let _preMaxSnap = null

  const isMaximized = computed(() =>
    pos.value.x === 0 && pos.value.y === 0 &&
    pos.value.w === window.innerWidth &&
    pos.value.h === window.innerHeight - FOOTER_H
  )

  function maximize() {
    if (isMaximized.value) {
      // Restore
      if (_preMaxSnap) {
        pos.value = { ...pos.value, ..._preMaxSnap }
        _preMaxSnap = null
      } else {
        const d = getDefault()
        pos.value = { ...pos.value, x: d.x, y: d.y, w: d.w, h: d.h }
      }
    } else {
      _preMaxSnap = { x: pos.value.x, y: pos.value.y, w: pos.value.w, h: pos.value.h }
      pos.value = { ...pos.value, x: 0, y: 0, w: window.innerWidth, h: window.innerHeight - FOOTER_H, minimized: false }
    }
    persist()
  }

  // Keep global minimized-modals registry in sync — keyed by panelId when
  // available so the open-apps dock (which iterates moduleRegistry ids) can
  // cross-reference minimized state by the same id.
  const _minimizedKey = panelId ?? _id
  watch(isMinimized, (v) => {
    if (v) registerMinimized(_minimizedKey, minimizeLabel, toggleMinimize)
    else   unregisterMinimized(_minimizedKey)
  }, { immediate: true })

  onUnmounted(() => unregisterMinimized(_minimizedKey))

  function persist() {
    if (storageKey) {
      try { localStorage.setItem(userKey(storageKey), JSON.stringify(pos.value)) } catch {}
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

  // When an open-state ref is provided, restore from minimize whenever the panel is opened.
  // { immediate: true } handles v-if panels that mount while already open.
  if (openRef) {
    watch(openRef, (v) => { if (v) { isMinimized.value = false; bringToFront() } }, { immediate: true })
  }

  // focusRequest always changes (nonce bump), unlike a boolean open ref, so
  // this also handles re-focusing a panel that's already open (dock clicks,
  // launcher tiles for an already-open app) — not just the initial open.
  // On a tablet-width viewport, a freshly-focused panel auto-fills the
  // workspace instead of requiring a manual maximize. { immediate: true }
  // catches panels that only mount once already open (v-if-gated) — by the
  // time they mount, focusRequest was already bumped by whatever opened them.
  if (panelId) {
    const uiStore = useUiStore()
    const { isTabletSize } = useViewportClass()
    watch(() => uiStore.focusRequest, (req) => {
      if (req.id !== panelId) return
      isMinimized.value = false
      bringToFront()
      if (isTabletSize.value && !isMaximized.value) maximize()
    }, { immediate: true })
  }

  return { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize, isMaximized }
}
