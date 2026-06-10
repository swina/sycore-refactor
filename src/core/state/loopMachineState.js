import { reactive } from 'vue'

export const loopMachineState = reactive({
  activePads: Array(32).fill(false),
  syncEnabled: true,
  recSyncEnabled: false,
})
