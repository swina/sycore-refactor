/**
 * The active workspace (core/workspaces/registry.ts): which panels are shown, tiled, and the
 * visual effects level. Switching never stops an engine — the players play on (core/engines/*).
 * Remembered per user: the active workspace and, per workspace, the panels' places moved by hand.
 */
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { userKey } from '@/lib/userKey'
import { useUiStore } from '@/stores/useUiStore'
import { setPanelGeometry, getPanelGeometry, onPanelGeometryChange, setResizeMinimum } from '@/composables/useDraggableResizable'
import { WORKSPACES, workspaceById, layoutOf, PANEL_STORAGE_KEYS, tileToPx, type TileRect } from '@/core/workspaces/registry'
import { useMidiStore } from '@/stores/useMidiStore'
import { LINK_OUTPUT_NAME, useLinkStore } from '@/stores/useLinkStore'

const LS_ACTIVE = 'SYCORE_WORKSPACE'
const LS_LAYOUTS = 'SYCORE_WORKSPACE_LAYOUTS'
const LS_CLASSIC = 'SYCORE_WORKSPACE_CLASSIC'
const FOOTER_H = 40 // AppFooter h-10

type Layouts = Record<string, Record<string, TileRect>> // workspace → panel → px rect
/** Classic as it was left: the panels open and the managed panels' places (a workspace moves them). */
interface ClassicSnapshot { open: string[]; rects: Record<string, (TileRect & { minimized?: boolean }) | null> }

function load<T>(key: string, def: T): T {
  try { const v = localStorage.getItem(userKey(key)); return v == null ? def : JSON.parse(v) } catch { return def }
}
function save(key: string, v: unknown) { try { localStorage.setItem(userKey(key), JSON.stringify(v)) } catch {} }

// Four contexts (2026-11-24): the Performance workspace before them is Studio now — the places moved
// by hand in it go with it (once; the new Performance starts from its tiles).
const LS_LAYOUTS_V = 'SYCORE_WORKSPACE_LAYOUTS_V'
function migrateLayouts(l: Layouts): Layouts {
  if (load(LS_LAYOUTS_V, 0) >= 2) return l
  const out = { ...l }
  for (const [from, to] of [['performance', 'studio'], ['performance+live', 'studio+live']]) {
    if (out[from] && !out[to]) out[to] = out[from]
    delete out[from]
  }
  save(LS_LAYOUTS, out)
  save(LS_LAYOUTS_V, 2)
  return out
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const uiStore = useUiStore()
  const midiStore = useMidiStore()
  /** Ableton Live set up in MIDI Flow: the "Live (M4L)" destination exists (SY.CORE Link). */
  const liveConfigured = () => !!midiStore.routingConfig?.registrations?.[LINK_OUTPUT_NAME] || midiStore.panelOutputs.includes(LINK_OUTPUT_NAME)
  const linkStore = useLinkStore()
  const layout = (wsId: string) => layoutOf(workspaceById(wsId), liveConfigured(), { linked: linkStore.connected })
  const active = ref<string>(workspaceById(load(LS_ACTIVE, 'classic')).id)
  const layouts = ref<Layouts>(migrateLayouts(load(LS_LAYOUTS, {})))
  let classic: ClassicSnapshot | null = load(LS_CLASSIC, null)

  const managedPanels = () => [...new Set(WORKSPACES.flatMap(w => [...(w.panels ?? []), ...(w.withLive?.panels ?? [])]))]
  function snapshotClassic() {
    const rects: ClassicSnapshot['rects'] = {}
    for (const id of managedPanels()) rects[id] = getPanelGeometry(id, PANEL_STORAGE_KEYS[id])
    classic = { open: [...uiStore.openPanelIds], rects }
    save(LS_CLASSIC, classic)
  }
  function restoreClassic() {
    if (!classic) return
    for (const id of [...uiStore.openPanelIds]) if (!classic.open.includes(id)) uiStore.closePanel(id)
    for (const [id, r] of Object.entries(classic.rects)) {
      if (r) setPanelGeometry(id, PANEL_STORAGE_KEYS[id], r)
      // never placed in Classic: its default place again (not the workspace's tile)
      else if (!uiStore.isPanelOpen(id)) try { localStorage.removeItem(userKey(PANEL_STORAGE_KEYS[id])) } catch {}
    }
    for (const id of classic.open) uiStore.openPanel(id)
  }

  function area() {
    return { w: window.innerWidth, h: Math.max(200, window.innerHeight - FOOTER_H) }
  }

  /** Each managed panel's place: moved by hand in this layout, else its tile. */
  function rectOf(wsId: string, panelId: string): TileRect | null {
    const l = layout(wsId)
    if (!l) return null
    const saved = layouts.value[l.key]?.[panelId]
    if (saved) return saved
    const tile = l.tiles[panelId]
    return tile ? tileToPx(tile, area()) : null
  }

  function applyEffects() {
    document.documentElement.classList.toggle('low-effects', !!workspaceById(active.value).lowEffects)
  }

  /** Show the workspace: its panels opened in their places, the other panels closed. */
  function apply() {
    const ws = workspaceById(active.value)
    applyEffects()
    const l = layout(ws.id)
    if (!l) return
    const floating = ws.floating ?? []
    for (const id of [...uiStore.openPanelIds]) if (!l.panels.includes(id) && !floating.includes(id)) uiStore.closePanel(id)
    for (const id of l.panels) {
      const r = rectOf(ws.id, id)
      if (r) setPanelGeometry(id, PANEL_STORAGE_KEYS[id], r)
      uiStore.openPanel(id)
    }
  }

  function switchTo(id: string) {
    const next = workspaceById(id).id
    if (next === active.value) { apply(); return }
    if (active.value === 'classic') snapshotClassic()
    active.value = next
    save(LS_ACTIVE, active.value)
    if (next === 'classic') { applyEffects(); restoreClassic(); return }
    apply()
  }

  /** Back to the tiles (forget the places moved by hand) and show them. */
  function resetLayout() {
    const l = { ...layouts.value }
    const key = layout(active.value)?.key
    if (key) delete l[key]
    layouts.value = l
    save(LS_LAYOUTS, l)
    apply()
  }

  // Resized by hand in a workspace with play views: small minimums (the play views fit; the
  // Classic minimums are for the full settings).
  setResizeMinimum(() => workspaceById(active.value).playViews ? { w: 160, h: 36 } : null)

  // A managed panel moved / resized by hand: remembered for the active workspace.
  onPanelGeometryChange((panelId: string, rect: TileRect) => {
    const l = layout(active.value)
    if (!l?.panels.includes(panelId)) return
    layouts.value = { ...layouts.value, [l.key]: { ...(layouts.value[l.key] ?? {}), [panelId]: rect } }
    save(LS_LAYOUTS, layouts.value)
  })

  /** Rig Controls' Mixer: the floating panels this workspace allows (Performance: the Audio Mixer). */
  const floatingPanels = computed(() => workspaceById(active.value).floating ?? [])
  // SY.CORE Link connecting / dropping in a workspace whose Map needs it: the Map comes / goes
  watch(() => layout(active.value)?.key, (k, old) => { if (k && old && k !== old) apply() })

  return { active, layouts, workspaces: WORKSPACES, switchTo, apply, resetLayout, rectOf, floatingPanels }
})
