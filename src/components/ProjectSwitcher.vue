<template>
  <div class="relative" ref="root">
    <button
      class="flex items-center gap-1 max-w-[160px] px-2 py-1 rounded-full border text-[9px] font-black font-mono uppercase tracking-wider transition-colors bg-violet-500/10 border-violet-500/40 text-violet-200 hover:bg-violet-500/20"
      :title="current ? `Project: ${current.name}${current.flow ? ' · setup ' + current.flow : ''}. Click to switch, create, export or import` : 'No project yet'"
      @click="open = !open"
    >
      <FolderKanban class="w-3 h-3 shrink-0" />
      <span class="truncate">{{ current?.name ?? 'Project' }}</span>
    </button>

    <Transition name="popup">
      <div v-if="open"
           class="absolute bottom-full right-0 mb-1 flex flex-col gap-2 bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-2 shadow-xl z-[1060] w-[300px] text-[10px] text-neutral-300">
        <span class="text-[8px] text-neutral-500 uppercase tracking-wider font-bold">Projects · MIDI Flow + Control</span>

        <div class="max-h-64 overflow-y-auto custom-scrollbar flex flex-col border border-neutral-800 rounded">
          <div v-for="p in projects" :key="p.id"
               class="group flex items-center gap-1.5 px-2 py-1.5 hover:bg-neutral-800/60"
               :class="p.id === currentProjectId ? 'bg-violet-500/10' : ''">
            <template v-if="renaming === p.id">
              <input v-model="renameText" ref="renameInput"
                     class="flex-1 min-w-0 bg-black border border-violet-500/60 rounded px-1.5 py-0.5 text-[10px] text-white font-mono outline-none"
                     @keydown.enter="commitRename(p.id)" @keydown.esc="renaming = null" @blur="commitRename(p.id)" />
            </template>
            <button v-else class="flex-1 min-w-0 text-left" @click="pick(p.id)" :title="p.id === currentProjectId ? 'The current project' : 'Load: its setup, its controllers'">
              <span class="flex items-center gap-1">
                <span class="font-bold text-white truncate">{{ p.name }}</span>
                <span v-if="p.id === currentProjectId" class="shrink-0 text-[7px] font-black uppercase tracking-wider px-1 py-0.5 rounded bg-violet-500/20 text-violet-300">Current</span>
              </span>
              <span class="block text-[8px] font-mono text-neutral-500 truncate">
                <span :class="p.flow && !flow.hasConfig(p.flow) ? 'text-red-400' : ''">{{ p.flow ? (flow.hasConfig(p.flow) ? p.flow : `setup "${p.flow}" missing`) : 'no setup saved' }}</span>
                · {{ controllersOf(p) }}
              </span>
            </button>
            <span v-if="renaming !== p.id" class="shrink-0 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button class="text-neutral-500 hover:text-white" title="Rename" @click="startRename(p)"><Pencil class="w-3 h-3" /></button>
              <button class="text-neutral-500 hover:text-white" title="Duplicate" @click="duplicate(p.id)"><Copy class="w-3 h-3" /></button>
              <button class="text-neutral-500 hover:text-white" title="Export to a file (setup and presets included)" @click="exportProject(p.id)"><Download class="w-3 h-3" /></button>
              <button class="text-neutral-500 hover:text-red-400 disabled:opacity-30" :disabled="projects.length <= 1"
                      :title="projects.length <= 1 ? 'The last project can\'t be deleted' : 'Delete (its setup and presets stay)'"
                      @click="remove(p)"><Trash2 class="w-3 h-3" /></button>
            </span>
          </div>
        </div>

        <div class="flex items-center gap-1.5">
          <input v-model="newName" placeholder="New project…"
                 class="flex-1 min-w-0 bg-black border border-neutral-700 rounded px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-violet-500/60 placeholder:text-neutral-700"
                 @keydown.enter="create" />
          <button class="flex items-center gap-1 px-2 py-1 rounded bg-violet-500/10 border border-violet-500/30 text-violet-300 text-[9px] font-black uppercase tracking-wider hover:bg-violet-500/20 disabled:opacity-30"
                  :disabled="!newName.trim()" title="A new project from what is on screen now (setup, controllers)" @click="create">
            <Plus class="w-3 h-3" /> New
          </button>
        </div>

        <div class="flex items-center justify-between gap-1.5">
          <button class="flex items-center gap-1 px-2 py-1 rounded border border-white/15 text-neutral-300 text-[9px] font-black uppercase tracking-wider hover:bg-white/10"
                  title="Import a project file (added as a new project; nothing of yours is overwritten)" @click="fileInput?.click()">
            <Upload class="w-3 h-3" /> Import
          </button>
          <span v-if="message" class="text-[9px] truncate" :class="messageError ? 'text-red-400' : 'text-emerald-400'">{{ message }}</span>
          <input ref="fileInput" type="file" accept=".json,application/json" class="hidden" @change="onImport" />
        </div>
        <p class="text-[9px] text-neutral-500 leading-snug">
          The current project follows what you do: the setup you load in MIDI Flow and the controller presets you turn on.
        </p>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { FolderKanban, Pencil, Copy, Download, Trash2, Plus, Upload } from 'lucide-vue-next'
import {
  projects, currentProjectId, currentProject, loadProject, newProject, renameProject,
  duplicate, deleteProject, exportProject, importProjectFile,
} from '@/core/projects'
import { activeSet } from '@/lib/projects'
import { designerPresets } from '@/core/midi/designer-presets'
import { useMidiFlowConfigsStore } from '@/stores/useMidiFlowConfigsStore'

const flow = useMidiFlowConfigsStore()
const open = ref(false)
const root = ref(null)
const fileInput = ref(null)
const newName = ref('')
const renaming = ref(null)
const renameText = ref('')
const renameInput = ref(null)
const message = ref('')
const messageError = ref(false)

const current = computed(() => currentProject.value)

function controllersOf(p) {
  const names = activeSet(p).presetIds.map(id => designerPresets.value.find(x => x.id === id)?.name).filter(Boolean)
  return names.length ? names.join(', ') : 'no controllers'
}

function pick(id) {
  loadProject(id)
  open.value = false
}

function create() {
  if (!newName.value.trim()) return
  newProject(newName.value)
  newName.value = ''
}

async function startRename(p) {
  renaming.value = p.id
  renameText.value = p.name
  await nextTick()
  const el = Array.isArray(renameInput.value) ? renameInput.value[0] : renameInput.value
  el?.focus(); el?.select()
}

function commitRename(id) {
  if (renaming.value !== id) return
  renameProject(id, renameText.value)
  renaming.value = null
}

function remove(p) {
  if (!confirm(`Delete the project "${p.name}"?\nIts MIDI Flow setup and its controller presets stay.`)) return
  deleteProject(p.id)
}

function flash(text, error = false) {
  message.value = text
  messageError.value = error
  setTimeout(() => { if (message.value === text) message.value = '' }, 4000)
}

async function onImport(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  if (!f) return
  try {
    const p = await importProjectFile(f)
    flash(`Imported: ${p.name}`)
  } catch (err) {
    flash(err?.message || 'Import failed', true)
  }
}

const onDoc = e => { if (open.value && root.value && !root.value.contains(e.target)) open.value = false }
onMounted(() => document.addEventListener('pointerdown', onDoc))
onUnmounted(() => document.removeEventListener('pointerdown', onDoc))
</script>
