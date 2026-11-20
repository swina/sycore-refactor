import { computed, reactive } from 'vue'
import { useWorkspaceStore } from '@/stores/useWorkspaceStore'
import { workspaceById } from '@/core/workspaces/registry'
import { setEditFullscreen } from './useDraggableResizable'

// Per panel: its settings opened with EDIT while in a workspace with play views (not remembered).
const editing = reactive({})

/**
 * A player's play view (workspaces with `playViews`, e.g. Performance): `play` true = show what
 * plays, the settings folded away (`v-if="!play"` on them). EDIT (toggleEdit) opens them again.
 */
export function usePlayView(panelId) {
  const ws = useWorkspaceStore()
  const playViews = computed(() => !!workspaceById(ws.active).playViews)
  const isEditing = computed(() => !!editing[panelId])
  const play = computed(() => playViews.value && !isEditing.value)
  // EDIT: the panel full screen; Play view: back to its place and size (useDraggableResizable)
  const toggleEdit = () => {
    editing[panelId] = !editing[panelId]
    if (playViews.value) setEditFullscreen(panelId, editing[panelId])
  }
  return { play, playViews, isEditing, toggleEdit }
}
