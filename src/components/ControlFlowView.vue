<template>
  <div class="flex-1 flex flex-col min-h-0 bg-black/40">
    <div v-if="!project" class="flex-1 flex items-center justify-center text-[10px] font-mono text-neutral-600 uppercase tracking-widest">
      No project
    </div>
    <template v-else>
      <!-- Control sets: the active one is in force; the key switches between its pair -->
      <div class="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-neutral-800 bg-neutral-900/40">
        <span class="text-[8px] font-black uppercase tracking-widest text-violet-400 shrink-0">Control sets</span>
        <div class="flex flex-wrap items-center gap-1">
          <template v-for="s in project.control.sets" :key="s.id">
            <input v-if="renaming === s.id" v-model="renameText" ref="renameInput"
                   class="w-28 bg-black border border-violet-500/60 rounded px-1.5 py-0.5 text-[10px] text-white font-mono outline-none"
                   @keydown.enter="commitRename(s.id)" @keydown.esc="renaming = null" @blur="commitRename(s.id)" />
            <button v-else
                    class="group flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-black uppercase tracking-wider transition-colors"
                    :class="s.id === set.id ? 'bg-violet-500/80 border-violet-300 text-white' : 'border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500'"
                    :title="s.id === set.id ? 'The set in force · double-click to rename' : 'Switch to this set · double-click to rename'"
                    @click="switchSet(s.id)" @dblclick="startRename(s)">
              {{ s.name }}
              <span v-if="liveDevicesOf(s).length" class="text-[8px] px-1 rounded bg-amber-500/30 text-amber-200" :title="'Live\'s: ' + liveDevicesOf(s).join(', ')">LIVE</span>
              <span v-if="project.control.sets.length > 1" class="opacity-0 group-hover:opacity-100 text-neutral-300 hover:text-red-300"
                    title="Delete this set" @click.stop="removeSet(s)">×</span>
            </button>
          </template>
          <button class="flex items-center gap-1 px-2 py-1 rounded border border-dashed border-neutral-700 text-neutral-500 text-[10px] font-black uppercase tracking-wider hover:text-violet-300 hover:border-violet-500/60"
                  title="A new set, a copy of the one in force" @click="addSet">
            <Plus class="w-3 h-3" /> Set
          </button>
        </div>

        <span class="flex-1" />

        <!-- The key: switches between two sets -->
        <div class="flex items-center gap-1.5 text-[9px] text-neutral-400">
          <span class="uppercase tracking-widest text-neutral-500 text-[8px] font-bold">Key</span>
          <button class="px-1.5 py-0.5 rounded border font-bold font-mono"
                  :class="learningProfileKey ? 'bg-amber-500 border-amber-300 text-black animate-pulse' : profileSettings.key ? 'border-emerald-400/50 text-emerald-300 hover:bg-white/10' : 'border-white/15 text-neutral-400 hover:bg-white/10'"
                  :title="profileSettings.key ? toggleLabel(profileSettings.key) + ' · click to learn again' : 'Click, then press a button on any controller'"
                  @click="toggleLearn">{{ learningProfileKey ? 'Press a button…' : keyLabel }}</button>
          <span>switches</span>
          <select :value="pair[0]" class="bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 text-[10px] text-white" @change="setPair(0, $event.target.value)">
            <option value="">—</option>
            <option v-for="s in project.control.sets" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <span>↔</span>
          <select :value="pair[1]" class="bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 text-[10px] text-white" @change="setPair(1, $event.target.value)">
            <option value="">—</option>
            <option v-for="s in project.control.sets" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <label class="flex items-center gap-1 cursor-pointer ml-1" title="While an external clock (Live's MIDI clock or Link) is followed: the second set; when it stops: the first">
            <input type="checkbox" class="w-3 h-3 accent-amber-500" :checked="profileSettings.autoLive" @change="updateProfile({ autoLive: $event.target.checked })" />
            Follow the clock
          </label>
        </div>
      </div>

      <div class="px-4 pt-2 text-[9px] text-neutral-500">
        Editing <span class="text-violet-300 font-bold">{{ set.name }}</span>, the set in force. To change another set, switch to it.
      </div>

      <!-- Controllers → what they do -->
      <div class="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-2 min-h-0">
        <div v-if="!controllers.length" class="text-center text-[10px] font-mono text-neutral-600 py-8">
          No controllers yet. Add one to the MIDI Flow (Routing), or give a Controller Designer preset a device.
        </div>

        <div v-for="c in controllers" :key="c.name"
             class="grid grid-cols-[220px_1fr] gap-3 rounded-lg border p-2.5"
             :class="c.role === 'live' ? 'border-amber-800/50 bg-amber-950/10' : c.conflicts.length ? 'border-red-800/60 bg-red-950/10' : 'border-neutral-800 bg-neutral-900/40'">
          <!-- the controller: its role, its presets in this set -->
          <div class="flex flex-col gap-1.5 min-w-0">
            <div class="flex items-center gap-1.5 min-w-0">
              <Gamepad2 class="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span class="text-[11px] font-black text-white truncate" :title="c.name">{{ c.name }}</span>
              <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="c.connected ? 'bg-emerald-400' : 'bg-neutral-700'" :title="c.connected ? 'Connected' : 'Not connected'" />
            </div>
            <div class="flex rounded border border-neutral-700 overflow-hidden w-max">
              <button v-for="r in ROLES" :key="r.id"
                      class="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider transition-colors"
                      :class="c.role === r.id ? r.on : 'text-neutral-500 hover:text-neutral-200'"
                      :title="r.title" @click="setControllerRole(c.name, r.id)">{{ r.label }}</button>
            </div>
            <div v-if="c.presets.length" class="flex flex-col gap-0.5" :class="c.role === 'live' ? 'opacity-40' : ''">
              <label v-for="p in c.presets" :key="p.id" class="flex items-center gap-1.5 cursor-pointer text-[10px] text-neutral-300">
                <input type="checkbox" class="w-3 h-3 accent-violet-500" :checked="enabled.includes(p.id)" @change="togglePreset(p.id)" />
                <span class="truncate">{{ p.name }}</span>
              </label>
            </div>
            <span v-else class="text-[9px] text-neutral-600">No preset for this controller</span>
            <button class="self-start flex items-center gap-1 text-[9px] text-violet-400 hover:text-violet-200" @click="openDesigner">
              <Pencil class="w-3 h-3" /> {{ c.presets.length ? 'Edit in Controller Designer' : 'Make a preset in Controller Designer' }}
            </button>
          </div>

          <!-- what it does -->
          <div class="flex flex-col gap-1 min-w-0">
            <div v-if="c.role === 'live'" class="text-[10px] text-amber-300/80 leading-snug">
              Ableton Live's control surface in this set: SY.CORE ignores it and sends it no LEDs.
            </div>
            <template v-else>
              <div v-for="(l, i) in c.links" :key="i" class="flex items-center gap-2 text-[10px] min-w-0">
                <span class="shrink-0 w-32 truncate font-mono text-neutral-300" :title="l.from">{{ l.from }}</span>
                <ArrowRight class="w-3 h-3 text-violet-500 shrink-0" />
                <span class="truncate text-violet-200" :title="l.to">{{ l.to }}</span>
              </div>
              <div v-if="!c.links.length" class="text-[10px] text-neutral-600">
                {{ c.presets.some(p => enabled.includes(p.id)) ? 'Nothing assigned yet' : 'No preset on: its controls are played (MIDI Flow cables) and do nothing else' }}
              </div>
              <div v-for="(k, i) in c.conflicts" :key="'c' + i" class="flex items-center gap-1.5 text-[10px] text-red-300">
                <AlertTriangle class="w-3 h-3 shrink-0" />
                <span>{{ k.button }} is assigned by {{ k.presets.join(' and ') }}: turn one off, or change one of them.</span>
              </div>
            </template>
          </div>
        </div>

        <div v-if="noDevicePresets.length" class="rounded-lg border border-amber-800/50 bg-amber-950/10 p-2.5 text-[10px] text-amber-200/90 flex items-start gap-2">
          <AlertTriangle class="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            {{ noDevicePresets.map(p => p.name).join(', ') }}: no device. A preset needs its controller's device
            (Controller Designer → Preset Settings → Device) to work and to light its LEDs.
          </span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { Plus, Gamepad2, Pencil, ArrowRight, AlertTriangle } from 'lucide-vue-next'
import {
  currentProject, currentSet, switchSet, newControlSet, renameControlSet, removeControlSet,
  setKeyPair, setControllerRole,
} from '@/core/projects'
import { liveDevicesOf, roleOf } from '@/lib/projects'
import { profileSettings, learningProfileKey, updateProfile } from '@/core/midi/controller-profiles'
import { designerPresets } from '@/core/midi/designer-presets'
import { summarizeControls, presetConflicts } from '@/lib/control-summary'
import { toggleLabel, toggleShortLabel } from '@/lib/rig-toggle'
import { AUTOSAVE_CONTROLLER_ID } from '@/lib/midi-controller-presets'
import { useUiStore } from '@/stores/useUiStore'
import { useMidiStore } from '@/stores/useMidiStore'

const props = defineProps({ canvasNodes: { type: Array, default: () => [] } })

const ROLES = [
  { id: 'perform', label: 'Perform', on: 'bg-emerald-500/80 text-black', title: 'SY.CORE uses it: its presets on, with LEDs' },
  { id: 'live', label: 'Live', on: 'bg-amber-500/80 text-black', title: "Ableton Live's control surface: SY.CORE ignores it" },
]

const uiStore = useUiStore()
const midiStore = useMidiStore()

const project = computed(() => currentProject.value)
const set = computed(() => currentSet.value)
const enabled = computed(() => uiStore.enabledControllerDesignerPresetIds)
const presets = computed(() => designerPresets.value.filter(p => p.id !== AUTOSAVE_CONTROLLER_ID))
const norm = n => (n ?? '').trim().toLowerCase()

const connectedNames = computed(() => new Set(midiStore.inputs.map(i => norm(i.name))))

/** The project's controllers: MIDI Flow controller nodes, the presets' devices, Live's in a set. */
const controllers = computed(() => {
  const names = new Map()
  const add = n => { if (n && !names.has(norm(n))) names.set(norm(n), n) }
  for (const n of props.canvasNodes) if (n.type === 'controller') add(n.name)
  for (const p of presets.value) add(p.assignedDevice)
  for (const s of project.value?.control.sets ?? []) liveDevicesOf(s).forEach(add)
  const conflicts = presetConflicts(presets.value, enabled.value)
  return [...names.values()].map(name => {
    const own = presets.value.filter(p => norm(p.assignedDevice) === norm(name))
    const controls = own.filter(p => enabled.value.includes(p.id)).flatMap(p => p.controls ?? [])
    return {
      name,
      connected: connectedNames.value.has(norm(name)),
      role: roleOf(set.value, name),
      presets: own,
      links: summarizeControls(controls),
      conflicts: conflicts.filter(k => norm(k.device) === norm(name)),
    }
  })
})

const noDevicePresets = computed(() => presets.value.filter(p => !p.assignedDevice && (p.controls?.length ?? 0) > 0))

function togglePreset(id) {
  const ids = enabled.value
  uiStore.enabledControllerDesignerPresetIds = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
}

function openDesigner() {
  uiStore.isMidiControllerDesignerOpen = true
}

// ── sets ──
const renaming = ref(null)
const renameText = ref('')
const renameInput = ref(null)

async function startRename(s) {
  renaming.value = s.id
  renameText.value = s.name
  await nextTick()
  const el = Array.isArray(renameInput.value) ? renameInput.value[0] : renameInput.value
  el?.focus(); el?.select()
}
function commitRename(id) {
  if (renaming.value !== id) return
  renameControlSet(id, renameText.value)
  renaming.value = null
}
function addSet() {
  newControlSet(`${set.value?.name ?? 'Set'} copy`)
}
function removeSet(s) {
  if (!confirm(`Delete the control set "${s.name}"?`)) return
  removeControlSet(s.id)
}

// The key's pair: kept here while only one side is chosen (the project stores a full pair only).
const pair = ref(['', ''])
watch(() => project.value?.control.keySets, ks => { if (ks) pair.value = [...ks]; else if (pair.value[0] && pair.value[1]) pair.value = ['', ''] }, { immediate: true })
function setPair(i, id) {
  const p = [...pair.value]
  p[i] = id || ''
  pair.value = p
  setKeyPair(p[0] || null, p[1] || null)
}

const toggleLearn = () => { learningProfileKey.value = !learningProfileKey.value }

const keyLabel = computed(() => profileSettings.value.key ? `${profileSettings.value.key.device} · ${toggleShortLabel(profileSettings.value.key)}` : 'Learn')
</script>
