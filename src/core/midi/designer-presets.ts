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
import { userKey } from '@/lib/userKey'
import { useMappingStore } from '@/stores/useMappingStore'
import { useUiStore } from '@/stores/useUiStore'
import { useAuthStore } from '@/stores/useAuthStore'

export const designerPresets: Ref<ControllerPreset[]> = ref([])
/** True once the user's presets are loaded: before that nothing is synced (an empty list would remove every preset mapping). */
export const designerPresetsLoaded = ref(false)

const LS_ENABLED = 'SYCORE_DESIGNER_PRESETS_ON'

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

  watch(() => auth.user?.uid, uid => {
    designerPresetsLoaded.value = false
    designerPresets.value = []
    if (uid) loadDesignerPresets()
  }, { immediate: true })

  watch(() => ui.enabledControllerDesignerPresetIds, ids => {
    if (!designerPresetsLoaded.value) return
    try { localStorage.setItem(userKey(LS_ENABLED), JSON.stringify(ids)) } catch {}
  }, { deep: true })

  let timer: ReturnType<typeof setTimeout> | null = null
  const sync = () => {
    if (!designerPresetsLoaded.value) return
    const r = syncPresetMappings({
      presets: designerPresets.value,
      enabledIds: ui.enabledControllerDesignerPresetIds,
      app: mapping.appMidiMappings ?? [],
      learn: mapping.midiMappings as Record<string, any>,
    })
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
