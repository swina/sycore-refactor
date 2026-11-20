import { ref, computed, watch, onUnmounted } from 'vue'

const FOOTER_H = 40 // AppFooter h-10
import { registerMinimized, unregisterMinimized } from './useMinimizedModals'
import { userKey } from '@/lib/userKey'
import { useUiStore } from '@/stores/useUiStore'
import { useViewportClass } from './useViewportClass'

// Shared counter for draggable panels. Capped at 399 so non-draggable
// modals (z-[400]+) always layer above floating panels.
// Panels placed from outside (workspaces, core/workspaces): a mounted panel takes a new geometry at
// once; one not mounted reads it from its storage key when it mounts. Geometry changes by hand are
// reported (the active workspace remembers them).
const _livePanels = new Map() // panelId → (rect) => void
const _editSnaps = new Map() // panelId → its geometry before EDIT went full screen
const _editCtl = new Map()   // panelId → { enter, leave } (a mounted panel)
/**
 * A player in a workspace with play views (Performance): EDIT opens it full screen (`on`), Play view puts
 * it back where and as big as it was. Not persisted while full screen (a drag there isn't kept either).
 */
export function setEditFullscreen(panelId, on) {
  const ctl = _editCtl.get(panelId)
  if (ctl) { on ? ctl.enter() : ctl.leave() }
  else if (!on) _editSnaps.delete(panelId)
}
const _geometryListeners = new Set()
/** Place a panel: live if mounted, else written to its storage key for its next mount. */
export function setPanelGeometry(panelId, storageKey, rect) {
  const live = _livePanels.get(panelId)
  if (live) { live(rect); return }
  if (!storageKey) return
  try { localStorage.setItem(userKey(storageKey), JSON.stringify({ minimized: false, ...rect })) } catch {}
}
const _liveGetters = new Map() // panelId → () => { x, y, w, h, minimized }
/** A panel's place: live if mounted, else as saved under its storage key (null: never placed). */
export function getPanelGeometry(panelId, storageKey) {
  const live = _liveGetters.get(panelId)
  if (live) return live()
  if (!storageKey) return null
  try { const v = JSON.parse(localStorage.getItem(userKey(storageKey))); return v && typeof v.x === 'number' ? v : null } catch { return null }
}
/** (panelId, { x, y, w, h }) after a drag or a resize by hand. Returns the unsubscribe. */
// A smaller minimum size while resizing by hand (a workspace with play views: Performance) — the
// panels' Classic minimums fit their full settings, not their play views. null: the panel's own.
let _minOverride = null
export function setResizeMinimum(fn) { _minOverride = fn }
export function onPanelGeometryChange(fn) { _geometryListeners.add(fn); return () => _geometryListeners.delete(fn) }

const DRAGGABLE_Z_MIN = 50
const DRAGGABLE_Z_MAX = 399
// Every mounted panel's z ref: when the counter reaches the cap they are renumbered in their current
// order (bottom → top) from the floor. It used to wrap to 50 instead: after ~350 clicks the panel just
// clicked dropped *below* all the others — it seemed to close, or another one "jumped" on top.
const _panelZs = new Set()
// Panels start at their own zIndex (100 by default): the next one raised goes above the highest
// present, not above the counter (it started at 50: a clicked panel landed *under* the untouched ones).
function _raise(z) {
  let top = DRAGGABLE_Z_MIN
  for (const r of _panelZs) if (r !== z && r.value > top) top = r.value
  if (z.value > top) return                                          // already on top: nothing to change
  if (top >= DRAGGABLE_Z_MAX) {
    const order = [..._panelZs].filter(r => r !== z).sort((x, y) => x.value - y.value)
    top = DRAGGABLE_Z_MIN
    for (const r of order) r.value = ++top
  }
  z.value = top + 1
}

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
  _panelZs.add(activeZ)
  onUnmounted(() => _panelZs.delete(activeZ))
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
    _raise(activeZ)
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
  if (panelId) {
    // placed by a workspace: kept in the window, not grown to the Classic minimum size (the play
    // views are compact)
    const setLive = (rect) => {
      pos.value = { ...pos.value, minimized: false, ...rect }
      const p = pos.value
      p.x = Math.max(0, Math.min(window.innerWidth - p.w, p.x))
      p.y = Math.max(0, Math.min(window.innerHeight - p.h, p.y))
      persist()
    }
    const getLive = () => ({ ...pos.value })
    _livePanels.set(panelId, setLive)
    _liveGetters.set(panelId, getLive)
    // Only its own entries: a panel remounted under the same id (the Sequencer, keyed per lane) runs
    // the new instance's setup before the old one's onUnmounted — which then removed the new entries
    // (the Sequencer's EDIT no longer went full screen once a lane had been switched).
    onUnmounted(() => {
      if (_livePanels.get(panelId) === setLive) _livePanels.delete(panelId)
      if (_liveGetters.get(panelId) === getLive) _liveGetters.delete(panelId)
    })
  }
  const reportGeometry = () => {
    if (!panelId) return
    const { x, y, w, h } = pos.value
    for (const fn of _geometryListeners) fn(panelId, { x, y, w, h })
  }

  // The size's minimum is kept by the resize (_computeResize): moving a panel a workspace placed
  // smaller (a compact play view) doesn't grow it.
  function constrain() {
    const p = pos.value
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
    window.addEventListener('pointermove', _onDragMove)
    window.addEventListener('pointerup', _onDragEnd)
    window.addEventListener('pointercancel', _onDragEnd)
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
    window.removeEventListener('pointermove', _onDragMove)
    window.removeEventListener('pointerup', _onDragEnd)
    window.removeEventListener('pointercancel', _onDragEnd)
    persist()
    reportGeometry()
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
    window.addEventListener('pointermove', _onResizeMove)
    window.addEventListener('pointerup', _onResizeEnd)
    window.addEventListener('pointercancel', _onResizeEnd)
  }

  function _computeResize(e) {
    const { dir, ox, oy, sw, sh, sx, sy } = _res
    const dx = e.clientX - ox, dy = e.clientY - oy
    const next = { w: sw, h: sh, x: sx, y: sy }
    const o = _minOverride?.()
    const minW = o ? Math.min(minWidth, o.w) : minWidth
    const minH = o ? Math.min(minHeight, o.h) : minHeight
    if (dir.includes('e')) next.w = Math.max(minW, sw + dx)
    if (dir.includes('s')) next.h = Math.max(minH, sh + dy)
    if (dir.includes('w')) { next.w = Math.max(minW, sw - dx); next.x = sx + (sw - next.w) }
    if (dir.includes('n')) { next.h = Math.max(minH, sh - dy); next.y = sy + (sh - next.h) }
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
    window.removeEventListener('pointermove', _onResizeMove)
    window.removeEventListener('pointerup', _onResizeEnd)
    window.removeEventListener('pointercancel', _onResizeEnd)
    persist()
    reportGeometry()
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

    // Silent/background activation — open the panel for MIDI processing but
    // keep it visually hidden until the user explicitly opens it.
    watch(() => uiStore.silentPanels[panelId], (isSilent) => {
      if (isSilent) isMinimized.value = true
    })
  }

  // EDIT full screen (setEditFullscreen, from usePlayView): a panel remounted while editing (the
  // Sequencer switching lane) comes up full screen too and still goes back.
  if (panelId) {
    const full = () => {
      pos.value = { ...pos.value, x: 0, y: 0, w: window.innerWidth, h: window.innerHeight - FOOTER_H, minimized: false }
      bringToFront()
    }
    const ctl = {
      enter() {
        if (isMaximized.value && !_editSnaps.has(panelId)) return
        if (!_editSnaps.has(panelId)) _editSnaps.set(panelId, { x: pos.value.x, y: pos.value.y, w: pos.value.w, h: pos.value.h })
        full()
      },
      leave() {
        const snap = _editSnaps.get(panelId)
        _editSnaps.delete(panelId)
        if (snap) { pos.value = { ...pos.value, ...snap }; persist(); reportGeometry() }
      },
    }
    _editCtl.set(panelId, ctl)
    if (_editSnaps.has(panelId)) full()
    onUnmounted(() => { if (_editCtl.get(panelId) === ctl) _editCtl.delete(panelId) })
  }

  return { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize, isMaximized }
}
