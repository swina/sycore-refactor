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
  const uiStore = useUiStore()

  // SynthApp.vue's focusStyle() gives whichever panel holds
  // uiStore.focusedModalKey a hardcoded z-index:399 + isolation:isolate
  // wrapper — a *stacking context* that beats this panel's own activeZ
  // (also capped at 399) on ties, and beats it outright otherwise. That
  // legacy "Ctrl+Tab cycle" pin is only ever set by openPanel()/togglePanel()
  // (via _bumpFocus), never by ordinary clicks on an already-open panel, so
  // once some panel grabbed it, merely clicking a *different* already-open
  // panel to raise it (this bringToFront) could never actually win — it
  // looked permanently stuck on top. Clearing the pin here on every manual
  // interaction lets plain activeZ ordering (i.e. "last thing you touched")
  // decide, which is what users actually expect from a click-to-front panel.
  function bringToFront() {
    if (_topZ >= DRAGGABLE_Z_MAX) _topZ = 50
    activeZ.value = ++_topZ
    uiStore.focusedModalKey = null
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

  // `transform` instead of `left`/`top` — the latter forces a synchronous
  // browser layout of the panel's subtree on every write, which on a fast
  // mousemove stream (dragging) was enough main-thread work to stall Tone.js's
  // Transport scheduling and cause audible playback stutter, the same class
  // of bug fixed for continuous MIDI CC input (see CHANGES.md 2026-07-26).
  // `transform` is compositor-only, so moving a panel no longer reflows it.
  const panelStyle = computed(() => ({
    position: 'fixed',
    left: 0,
    top: 0,
    transform: `translate3d(${pos.value.x}px, ${pos.value.y}px, 0)`,
    width:  pos.value.w + 'px',
    height: pos.value.h + 'px',
    zIndex: activeZ.value,
  }))

  /* ── Drag ──────────────────────────────────────────────────────── */
  let _drag = null
  let _dragRAF = null
  let _dragLatest = null

  function onDragStart(e) {
    if (e.button !== 0) return
    // Raise the panel even when the click lands on an interactive header
    // element (a button, input, etc.) — only drag-initiation is skipped for
    // those, not the focus/z-index raise, otherwise clicking e.g. a header
    // toolbar button on a background panel would leave it stacked behind.
    bringToFront()
    if (e.target.closest('button, input, select, a, [role="button"]')) return
    e.preventDefault()
    _drag = { ox: e.clientX, oy: e.clientY, px: pos.value.x, py: pos.value.y }
    window.addEventListener('mousemove', _onDragMove)
    window.addEventListener('mouseup', _onDragEnd)
  }

  // Batched to one commit per animation frame — a raw mousemove stream can
  // fire far faster than the display refresh rate, and writing pos.value
  // (and thus re-rendering panelStyle) on every single event is wasted,
  // uncapped main-thread work during a drag.
  function _onDragMove(e) {
    if (!_drag) return
    _dragLatest = { x: _drag.px + (e.clientX - _drag.ox), y: _drag.py + (e.clientY - _drag.oy) }
    if (_dragRAF) return
    _dragRAF = requestAnimationFrame(() => {
      _dragRAF = null
      if (!_dragLatest) return
      pos.value.x = _dragLatest.x
      pos.value.y = _dragLatest.y
      constrain()
    })
  }

  function _onDragEnd() {
    if (_dragRAF) { cancelAnimationFrame(_dragRAF); _dragRAF = null }
    if (_dragLatest) { pos.value.x = _dragLatest.x; pos.value.y = _dragLatest.y; constrain(); _dragLatest = null }
    _drag = null
    window.removeEventListener('mousemove', _onDragMove)
    window.removeEventListener('mouseup', _onDragEnd)
    persist()
  }

  /* ── Resize ────────────────────────────────────────────────────── */
  let _res = null
  let _resizeRAF = null
  let _resizeLatest = null

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

  function _computeResize(e) {
    const { dir, ox, oy, sw, sh, sx, sy } = _res
    const dx = e.clientX - ox, dy = e.clientY - oy
    const next = { w: sw, h: sh, x: sx, y: sy }
    if (dir.includes('e')) next.w = Math.max(minWidth, sw + dx)
    if (dir.includes('s')) next.h = Math.max(minHeight, sh + dy)
    if (dir.includes('w')) { next.w = Math.max(minWidth, sw - dx); next.x = sx + (sw - next.w) }
    if (dir.includes('n')) { next.h = Math.max(minHeight, sh - dy); next.y = sy + (sh - next.h) }
    return next
  }

  // Same one-commit-per-frame batching as drag — resizing still forces a
  // real layout (width/height are unavoidably layout-affecting), but capping
  // it to the display refresh rate keeps a fast mousemove stream from
  // stalling the main thread beyond Tone.js's scheduling lookahead.
  function _onResizeMove(e) {
    if (!_res) return
    _resizeLatest = _computeResize(e)
    if (_resizeRAF) return
    _resizeRAF = requestAnimationFrame(() => {
      _resizeRAF = null
      if (!_resizeLatest) return
      Object.assign(pos.value, _resizeLatest)
      constrain()
    })
  }

  function _onResizeEnd() {
    if (_resizeRAF) { cancelAnimationFrame(_resizeRAF); _resizeRAF = null }
    if (_resizeLatest) { Object.assign(pos.value, _resizeLatest); constrain(); _resizeLatest = null }
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
