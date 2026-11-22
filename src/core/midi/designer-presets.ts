/**
 * designer-presets.ts — the Controller Designer presets as setups, at runtime.
 *
 * One shared list (the Designer and the footer's Controller Presets read and edit
 * the same one), the presets that are on (saved per user), and the sync
 * (lib/designer-preset-mappings.ts): the mapping tables hold the controls of the
 * presets that are on, whatever panel is open. Installed by SynthApp.
 */
import { ref, watch, type Ref } from 'vue'
import { loadControllerPresets, persistControllerPresets, type ControllerPreset } from '@/lib/midi-controller-presets'
import { syncPresetMappings } from '@/lib/designer-preset-mappings'
import { adoptMappings, needsAdoption } from '@/lib/mapping-adoption'
import { actionLabel } from '@/lib/app-midi-actions'
import { paramOwnerLabel } from '@/composables/useMidiCCListener'
import { bigSave } from '@/lib/big-storage'
import { useMidiStore } from '@/stores/useMidiStore'
import { userKey } from '@/lib/userKey'
import { useMappingStore } from '@/stores/useMappingStore'
import { useUiStore } from '@/stores/useUiStore'
import { useAuthStore } from '@/stores/useAuthStore'

export const designerPresets: Ref<ControllerPreset[]> = ref([])
/** True once the user's presets are loaded: before that nothing is synced (an empty list would remove every preset mapping). */
export const designerPresetsLoaded = ref(false)

const LS_ENABLED = 'SYCORE_DESIGNER_PRESETS_ON'
/** Set once the first adoption (the migration, phase 4) ran: its backup is saved before it. */
const LS_ADOPTED = 'SYCORE_MAPPINGS_ADOPTED_V1'
/** The tables and MIDI Mapping Presets as they were before the migration (IndexedDB). */
export const MAPPINGS_BACKUP_KEY = 'SYCORE_MAPPINGS_BACKUP'

/**
 * Presets made by the first adoption (the migration): core/projects turns them on in every
 * set of every project, as the mappings they hold were on everywhere before. Later ones are
 * turned on in the set in force only (the enabled ids, which the current project follows).
 */
export const adoptionHooks: { onMigrated: ((presetIds: string[]) => void) | null } = { onMigrated: null }
/** The last adoption, for the Control view: how many moved and dropped. */
export const lastAdoption = ref<{ adopted: number; dropped: string[]; at: number } | null>(null)

function readEnabled(): string[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(userKey(LS_ENABLED)) ?? 'null')
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : null
  } catch { return null }
}

/** The presets as loaded (the Designer, the footer): the ones on are restored, all on the first time. */
export function setDesignerPresets(list: ControllerPreset[]): void {
  designerPresets.value = list
  const ui = useUiStore()
  const stored = readEnabled()
  const ids = new Set(list.map(p => p.id))
  ui.enabledControllerDesignerPresetIds = stored === null ? list.map(p => p.id) : stored.filter(id => ids.has(id))
  designerPresetsLoaded.value = true
}

let loading: Promise<void> | null = null
export function loadDesignerPresets(): Promise<void> {
  if (!loading) loading = loadControllerPresets().then(setDesignerPresets).finally(() => { loading = null })
  return loading
}

let installed = false

export function installDesignerPresets(): void {
  if (installed) return
  installed = true
  const mapping = useMappingStore()
  const ui = useUiStore()
  const auth = useAuthStore()
  /** What the last sync wrote (outside changes to it go into the presets). */
  let written: { app: Set<string>; learn: Set<string> } | undefined

  watch(() => auth.user?.uid, uid => {
    written = undefined
    designerPresetsLoaded.value = false
    designerPresets.value = []
    if (uid) loadDesignerPresets()
  }, { immediate: true })

  watch(() => ui.enabledControllerDesignerPresetIds, ids => {
    if (!designerPresetsLoaded.value) return
    try { localStorage.setItem(userKey(LS_ENABLED), JSON.stringify(ids)) } catch {}
  }, { deep: true })

  const midiStore = useMidiStore()
  let timer: ReturnType<typeof setTimeout> | null = null
  let adopting = false

  /** Every mapping made outside a preset goes into one (lib/mapping-adoption.ts). True: changed. */
  async function adopt(): Promise<boolean> {
    const learn = mapping.midiMappings as Record<string, any>
    const app = mapping.appMidiMappings ?? []
    if (!needsAdoption(learn, app)) return false
    const first = (() => { try { return localStorage.getItem(userKey(LS_ADOPTED)) !== '1' } catch { return false } })()
    if (first) {
      // the migration: the tables and the MIDI Mapping Presets kept first
      await bigSave(userKey(MAPPINGS_BACKUP_KEY), JSON.parse(JSON.stringify({
        at: new Date().toISOString(), midiMappings: learn, appMidiMappings: app,
        mappingPresets: mapping.presets ?? [], velocityConfig: mapping.velocityConfig,
      }))).catch(() => {})
    }
    const r = adoptMappings({
      presets: designerPresets.value as any,
      enabledIds: ui.enabledControllerDesignerPresetIds,
      learn: mapping.midiMappings as Record<string, any>,
      app: mapping.appMidiMappings ?? [],
      labelParam: paramOwnerLabel,
      labelAction: a => actionLabel(a, midiStore.virtualInstruments),
    })
    designerPresets.value = r.presets as any
    if (r.enabledIds.length !== ui.enabledControllerDesignerPresetIds.length) ui.enabledControllerDesignerPresetIds = r.enabledIds
    mapping.saveAppMidiMappings(r.app)
    mapping.midiMappings = r.learn as any
    mapping.saveMidiMappings()
    await persistControllerPresets(designerPresets.value).catch(() => {})
    lastAdoption.value = { adopted: r.adopted, dropped: r.dropped, at: Date.now() }
    if (first) {
      try { localStorage.setItem(userKey(LS_ADOPTED), '1') } catch {}
      if (r.createdPresetIds.length) adoptionHooks.onMigrated?.(r.createdPresetIds)
      console.info(`[Control] mappings into presets: ${r.adopted} moved, ${r.dropped.length} dropped (backup: ${MAPPINGS_BACKUP_KEY})`)
    }
    return true
  }

  const sync = async () => {
    if (!designerPresetsLoaded.value || adopting) return
    adopting = true
    try { if (await adopt()) return } finally { adopting = false } // the tables changed: the watch runs sync again
    const r = syncPresetMappings({
      presets: designerPresets.value,
      enabledIds: ui.enabledControllerDesignerPresetIds,
      app: mapping.appMidiMappings ?? [],
      learn: mapping.midiMappings as Record<string, any>,
      written,
    })
    written = r.written
    if (r.appChanged) mapping.saveAppMidiMappings(r.app)
    if (r.learnChanged) { mapping.midiMappings = r.learn as any; mapping.saveMidiMappings() }
    if (r.backfilled) persistControllerPresets(designerPresets.value).catch(() => {})
  }
  const later = () => { if (timer) clearTimeout(timer); timer = setTimeout(sync, 120) }

  // A preset turned on / off, edited, a mapping preset loaded over the tables: in sync again.
  watch(
    [designerPresets, () => ui.enabledControllerDesignerPresetIds, () => mapping.appMidiMappings, () => mapping.midiMappings, designerPresetsLoaded],
    later,
    { deep: true },
  )
}
