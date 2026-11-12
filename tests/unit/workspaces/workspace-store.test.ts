import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkspaceStore } from '@/stores/useWorkspaceStore'
import { useUiStore } from '@/stores/useUiStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { tileToPx, WORKSPACES, PANEL_STORAGE_KEYS } from '@/core/workspaces/registry'
import { userKey } from '@/lib/userKey'

describe('workspaces', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true })
    document.documentElement.classList.remove('low-effects')
  })

  it('tiles: a 2×2 grid over the area, 4 px between tiles, no overlap', () => {
    const area = { w: 1920, h: 1040 }
    const a = tileToPx({ x: 0, y: 0, w: 0.5, h: 0.5 }, area)
    const b = tileToPx({ x: 0.5, y: 0, w: 0.5, h: 0.5 }, area)
    expect(a).toEqual({ x: 0, y: 0, w: 958, h: 518 })
    expect(b).toEqual({ x: 962, y: 0, w: 958, h: 518 })
    expect(a.x + a.w).toBeLessThan(b.x)
  })

  it('every managed panel has a storage key and a tile', () => {
    for (const ws of WORKSPACES) for (const id of ws.panels ?? []) {
      expect(PANEL_STORAGE_KEYS[id]).toBeTruthy()
      expect(ws.tiles?.[id]).toBeTruthy()
    }
  })

  it('Performance: opens its panels in their tiles (players left, Rig Controls, Rig right), closes the others, low effects on', () => {
    const ui = useUiStore()
    ui.openPanel('midi-flow')
    const ws = useWorkspaceStore()
    ws.switchTo('performance')
    for (const id of ['rig-controller', 'rig-controls', 'chord-prog', 'drum-machine', 'sequencer2', 'chord-now']) expect(ui.isPanelOpen(id)).toBe(true)
    expect(ui.isPanelOpen('midi-flow')).toBe(false)
    // panels not mounted: their place written where they read it at mount
    const saved = JSON.parse(localStorage.getItem(userKey('SYCORE_POS_CHORD_PROG'))!)
    expect(saved).toMatchObject({ x: 0, y: 548, w: 910, h: 214, minimized: false })
    const controls = JSON.parse(localStorage.getItem(userKey('SYCORE_POS_RIG_CONTROLS'))!)
    const rig = JSON.parse(localStorage.getItem(userKey('SYCORE_POS_RIG_CONTROLLER'))!)
    expect(controls).toMatchObject({ x: 914, y: 0, h: 1040 })
    expect(rig.x).toBe(controls.x + controls.w + 4)
    expect(rig.h).toBe(1040)
    expect(document.documentElement.classList.contains('low-effects')).toBe(true)
  })

  it('back to Classic: the panels open and their places as Classic was left, effects back to normal', () => {
    const ui = useUiStore()
    localStorage.setItem(userKey('SYCORE_POS_CHORD_PROG'), JSON.stringify({ x: 100, y: 50, w: 900, h: 640, minimized: false }))
    ui.openPanel('midi-flow')
    ui.openPanel('chord-prog')
    const ws = useWorkspaceStore()
    ws.switchTo('performance')
    expect(ui.isPanelOpen('midi-flow')).toBe(false)
    ws.switchTo('classic')
    expect(ui.isPanelOpen('midi-flow')).toBe(true)
    expect(ui.isPanelOpen('chord-prog')).toBe(true)
    expect(ui.isPanelOpen('drum-machine')).toBe(false)
    expect(JSON.parse(localStorage.getItem(userKey('SYCORE_POS_CHORD_PROG'))!)).toMatchObject({ x: 100, y: 50, w: 900, h: 640 })
    expect(document.documentElement.classList.contains('low-effects')).toBe(false)
  })

  it('remembered across sessions: the active workspace', () => {
    useWorkspaceStore().switchTo('performance')
    setActivePinia(createPinia())
    expect(useWorkspaceStore().active).toBe('performance')
  })
  it('Performance with Live (M4L) set up in MIDI Flow: Map · Live Instruments too, under the Rig', () => {
    const ui = useUiStore()
    useMidiStore().addRegistration('Live (M4L)')
    useWorkspaceStore().switchTo('performance')
    expect(ui.isPanelOpen('live-map')).toBe(true)
    const map = JSON.parse(localStorage.getItem(userKey('SYCORE_POS_LIVE_MAP'))!)
    const rig = JSON.parse(localStorage.getItem(userKey('SYCORE_POS_RIG_CONTROLLER'))!)
    expect(map.x).toBe(rig.x)
    expect(map.y).toBe(rig.y + rig.h + 4)
    expect(map.y + map.h).toBe(1040)
  })
})

import { usePlayView } from '@/composables/usePlayView'
describe('play views', () => {
  beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })
  it('Performance shows what plays (settings folded); EDIT unfolds them; Classic: always the full panel', () => {
    const ws = useWorkspaceStore()
    const v = usePlayView('drum-machine')
    expect(v.play.value).toBe(false) // Classic
    ws.switchTo('performance')
    expect(v.play.value).toBe(true)
    v.toggleEdit()
    expect(v.play.value).toBe(false)
    v.toggleEdit()
    expect(v.play.value).toBe(true)
  })
})
