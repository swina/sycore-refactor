import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useAuthStore } from './useAuthStore'
import { userKey } from '@/lib/userKey'
import { parseProjects, upsertProject, removeProject, type FlowProject } from '@/lib/flow-projects'

const STORAGE_KEY = 'SYCORE_MIDI_FLOW_CONFIGS'
const LAST_CONFIG_STORAGE_KEY = 'SYCORE_MIDI_FLOW_LAST_CONFIG'
const PROJECTS_STORAGE_KEY = 'SYCORE_MIDI_FLOW_PROJECTS'
const LAST_PROJECT_STORAGE_KEY = 'SYCORE_MIDI_FLOW_LAST_PROJECT'

export interface MidiFlowConfigEntry {
  name: string
  createdAt: string
  nodes: any[]
  cables: any[]
}

export const useMidiFlowConfigsStore = defineStore('midiFlowConfigs', () => {
  const authStore = useAuthStore()
  const uid = computed(() => authStore.user?.uid)

  const configs = ref<MidiFlowConfigEntry[]>(load())
  // Name of the config last loaded/saved in the canvas — restored on reload
  // so MIDI FLOW reopens showing which configuration is active, not blank.
  const lastConfigName = ref<string>(localStorage.getItem(userKey(LAST_CONFIG_STORAGE_KEY)) ?? '')

  // The MIDI Flow canvas's current, unsaved node/cable state — lives here
  // (rather than as local refs inside MidiWizardFlow.vue) purely so other
  // components (e.g. InstrumentCockpitPanel.vue) can reactively read "what's
  // actually on the canvas right now" without waiting for an explicit Save.
  // Not persisted on its own — MidiWizardFlow.vue already derives/restores
  // this from useMidiStore's live routing state or a saved config on mount.
  const liveNodes = ref<any[]>([])
  const liveCables = ref<any[]>([])

  // v1 projects (setup + presets, lib/flow-projects.ts): read once to migrate them to
  // core/projects.ts (IDB); no longer written.
  const projects = ref<FlowProject[]>(loadProjects())
  const lastProjectName = ref<string>(localStorage.getItem(userKey(LAST_PROJECT_STORAGE_KEY)) ?? '')

  function loadProjects(): FlowProject[] {
    try { return parseProjects(JSON.parse(localStorage.getItem(userKey(PROJECTS_STORAGE_KEY)) ?? '[]')) } catch { return [] }
  }

  function load(): MidiFlowConfigEntry[] {
    try {
      return JSON.parse(localStorage.getItem(userKey(STORAGE_KEY)) ?? '[]')
    } catch {
      return []
    }
  }

  watch(configs, val => {
    localStorage.setItem(userKey(STORAGE_KEY), JSON.stringify(val))
  }, { deep: true })

  watch(lastConfigName, val => {
    localStorage.setItem(userKey(LAST_CONFIG_STORAGE_KEY), val)
  })

  watch(projects, val => {
    localStorage.setItem(userKey(PROJECTS_STORAGE_KEY), JSON.stringify(val))
  }, { deep: true })

  watch(lastProjectName, val => {
    localStorage.setItem(userKey(LAST_PROJECT_STORAGE_KEY), val)
  })

  watch(uid, (newUid) => {
    configs.value = newUid ? load() : []
    projects.value = newUid ? loadProjects() : []
    lastProjectName.value = newUid ? (localStorage.getItem(userKey(LAST_PROJECT_STORAGE_KEY)) ?? '') : ''
    lastConfigName.value = newUid ? (localStorage.getItem(userKey(LAST_CONFIG_STORAGE_KEY)) ?? '') : ''
  })

  function setLastConfigName(name: string) {
    lastConfigName.value = name
  }

  function saveConfig(name: string, nodes: any[], cables: any[]) {
    const idx = configs.value.findIndex(c => c.name === name)
    const entry: MidiFlowConfigEntry = { name, createdAt: new Date().toISOString(), nodes, cables }
    if (idx >= 0) configs.value.splice(idx, 1, entry)
    else configs.value.push(entry)
  }

  function getConfig(name: string): MidiFlowConfigEntry | undefined {
    return configs.value.find(c => c.name === name)
  }

  function deleteConfig(name: string) {
    configs.value = configs.value.filter(c => c.name !== name)
    if (lastConfigName.value === name) lastConfigName.value = ''
  }

  function hasConfig(name: string): boolean {
    return configs.value.some(c => c.name === name)
  }

  function saveProject(name: string, setup: string, controllerPresetIds: string[]) {
    projects.value = upsertProject(projects.value, { name, setup, controllerPresetIds: [...controllerPresetIds], updatedAt: new Date().toISOString() })
    lastProjectName.value = name
  }

  function deleteProject(name: string) {
    projects.value = removeProject(projects.value, name)
    if (lastProjectName.value === name) lastProjectName.value = ''
  }

  // A setup to load in the canvas, asked from outside MIDI Flow (a project loaded from the
  // footer): MidiWizardFlow.vue, always mounted, watches it and loads it.
  const loadRequest = ref<{ name: string; seq: number } | null>(null)
  let loadSeq = 0
  function requestLoad(name: string) {
    loadRequest.value = { name, seq: ++loadSeq }
  }

  function setLastProjectName(name: string) {
    lastProjectName.value = name
  }

  return { loadRequest, requestLoad, projects, lastProjectName, saveProject, deleteProject, setLastProjectName, configs, saveConfig, getConfig, deleteConfig, hasConfig, lastConfigName, setLastConfigName, liveNodes, liveCables }
})
