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

      <!-- The flow: controllers → what they drive; a controller clicked: its controls on the right -->
      <div class="flex-1 flex min-h-0">
        <div class="flex-1 overflow-auto custom-scrollbar p-4 min-w-0" @click.self="selected = null">
          <div v-if="!controllers.length" class="text-center text-[10px] font-mono text-neutral-600 py-8">
            No controllers yet. Add one to the MIDI Flow (Routing), or give a Controller Designer preset a device.
          </div>
          <div v-else class="relative" :style="{ width: FLOW_W + 'px', height: flowH + 'px' }" @click.self="selected = null">
            <svg class="absolute inset-0 pointer-events-none" :width="FLOW_W" :height="flowH">
              <g v-for="e in drawnEdges" :key="e.from + '→' + e.to">
                <path :d="e.d" fill="none" :stroke="e.hot ? '#a78bfa' : '#4c1d95'" :stroke-width="e.w" :stroke-opacity="e.dim ? 0.25 : 0.9" />
                <text :x="e.mx" :y="e.my - 4" text-anchor="middle" class="font-mono" font-size="9"
                      :fill="e.hot ? '#ddd6fe' : '#7c3aed'" :fill-opacity="e.dim ? 0.3 : 1">{{ e.count }}</text>
              </g>
            </svg>

            <!-- controllers -->
            <button v-for="(c, i) in controllers" :key="c.name"
                    class="absolute flex flex-col justify-center gap-0.5 px-2.5 rounded-lg border text-left transition-colors"
                    :style="{ left: '0px', top: nodeY(i) + 'px', width: NODE_W + 'px', height: NODE_H + 'px' }"
                    :class="[
                      selected === c.name ? 'ring-2 ring-violet-400' : '',
                      c.role === 'live' ? 'border-amber-700/60 bg-amber-950/30' : c.role === 'rig' ? 'border-sky-500/60 bg-sky-900/40' : c.conflicts.length ? 'border-red-700/60 bg-red-950/20' : 'border-sky-800/60 bg-sky-950/30 hover:border-sky-500/60',
                    ]"
                    :title="'Show its controls'" @click.stop="selected = selected === c.name ? null : c.name">
              <span class="flex items-center gap-1.5 min-w-0">
                <Gamepad2 class="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span class="text-[11px] font-black text-white truncate">{{ c.name }}</span>
                <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="c.connected ? 'bg-emerald-400' : 'bg-neutral-700'" :title="c.connected ? 'Connected' : 'Not connected'" />
              </span>
              <span class="flex items-center gap-1.5 text-[9px] font-mono">
                <span :class="c.role === 'live' ? 'text-amber-300' : c.role === 'rig' ? 'text-sky-300' : 'text-emerald-400'" class="font-black uppercase">{{ c.role === 'live' ? 'Live' : c.role === 'rig' ? 'Rig' : 'Perform' }}</span>
                <span class="text-neutral-500 truncate">· {{ c.role === 'live' ? 'ignored by SY.CORE' : c.role === 'rig' ? 'the whole controller' : c.assigned + ' assigned' }}</span>
                <AlertTriangle v-if="c.conflicts.length && c.role === 'perform'" class="w-3 h-3 text-red-400 shrink-0" />
              </span>
            </button>

            <!-- targets -->
            <div v-for="(t, i) in graph.targets" :key="t"
                 class="absolute flex items-center gap-1.5 px-2.5 rounded-lg border text-[11px] font-bold"
                 :style="{ left: TARGET_X + 'px', top: targetY(i) + 'px', width: NODE_W + 'px', height: TARGET_H + 'px' }"
                 :class="hotTargets.has(t) ? 'border-violet-400/70 bg-violet-950/50 text-violet-100' : 'border-neutral-700 bg-neutral-900/70 text-neutral-300'">
              <component :is="targetIcon(t)" class="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <span class="truncate" :title="t">{{ t }}</span>
            </div>
          </div>

          <div v-if="noDevicePresets.length" class="mt-4 rounded-lg border border-amber-800/50 bg-amber-950/10 p-2.5 text-[10px] text-amber-200/90 flex items-start gap-2 max-w-[640px]">
            <AlertTriangle class="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              {{ noDevicePresets.map(p => p.name).join(', ') }}: no device. A preset needs its controller's device
              (Controller Designer → Preset Settings → Device) to work and to light its LEDs.
            </span>
          </div>
        </div>

        <!-- the controller clicked: role, presets in this set, its controls -->
        <aside v-if="sel" class="w-[340px] shrink-0 border-l border-neutral-800 bg-neutral-950/80 flex flex-col min-h-0">
          <div class="flex items-center gap-1.5 px-3 py-2 border-b border-neutral-800">
            <Gamepad2 class="w-4 h-4 text-sky-400 shrink-0" />
            <span class="text-[12px] font-black text-white truncate flex-1" :title="sel.name">{{ sel.name }}</span>
            <button class="text-neutral-500 hover:text-white" title="Close" @click="selected = null"><X class="w-3.5 h-3.5" /></button>
          </div>
          <div class="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-3 min-h-0">
            <div class="flex items-center gap-2">
              <span class="text-[8px] font-black uppercase tracking-widest text-neutral-500">Role in {{ set.name }}</span>
              <div class="flex rounded border border-neutral-700 overflow-hidden">
                <button v-for="r in ROLES" :key="r.id"
                        class="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        :class="sel.role === r.id ? r.on : 'text-neutral-500 hover:text-neutral-200'"
                        :disabled="roleDisabled(r, sel.name)"
                        :title="roleTitle(r, sel.name)" @click="setControllerRole(sel.name, r.id)">{{ r.label }}</button>
              </div>
            </div>

            <div v-if="sel.role === 'live'" class="text-[10px] text-amber-300/80 leading-snug">
              Ableton Live's control surface in this set: SY.CORE ignores it and sends it no LEDs.
            </div>
            <div v-if="sel.role === 'rig'" class="flex flex-col gap-1.5 text-[10px] text-sky-200/90 leading-snug">
              <span>The whole controller drives the Rig Controller ({{ isLaunchpadName(sel.name) ? 'Launchpad template' : 'MIDImix template' }}), with its LEDs. Its presets are paused meanwhile.</span>
              <span class="text-neutral-500">It works while the Rig Controller is open.</span>
              <button class="self-start px-2 py-0.5 rounded border border-sky-500/40 text-sky-300 text-[9px] font-black uppercase tracking-wider hover:bg-sky-500/15"
                      @click="uiStore.openPanel('rig-controller')">Open Rig Controller</button>
            </div>

            <div class="flex flex-col gap-1" :class="sel.role !== 'perform' ? 'opacity-40' : ''">
              <span class="text-[8px] font-black uppercase tracking-widest text-neutral-500">Presets in this set</span>
              <label v-for="p in sel.presets" :key="p.id" class="flex items-center gap-1.5 cursor-pointer text-[10px] text-neutral-300">
                <input type="checkbox" class="w-3 h-3 accent-violet-500" :checked="enabled.includes(p.id)" @change="togglePreset(p.id)" />
                <span class="truncate">{{ p.name }}</span>
                <span class="text-neutral-600 font-mono text-[9px]">{{ (p.controls ?? []).filter(c => c.assignment).length }}/{{ (p.controls ?? []).length }}</span>
              </label>
              <span v-if="!sel.presets.length" class="text-[9px] text-neutral-600">No preset for this controller</span>
            </div>

            <div v-for="(k, i) in sel.conflicts" :key="'c' + i" class="flex items-start gap-1.5 text-[10px] text-red-300">
              <AlertTriangle class="w-3 h-3 shrink-0 mt-0.5" />
              <span>{{ k.button }} is assigned by {{ k.presets.join(' and ') }}: turn one off, or change one of them.</span>
            </div>

            <div v-if="sel.role === 'perform'" class="flex flex-col gap-1">
              <span class="text-[8px] font-black uppercase tracking-widest text-neutral-500">Controls</span>
              <div v-for="r in sel.rows" :key="r.key"
                   class="grid grid-cols-[1fr_auto] gap-x-2 px-2 py-1 rounded border border-neutral-800 bg-neutral-900/50 text-[10px]">
                <span class="flex items-center gap-1 min-w-0">
                  <span class="font-bold text-neutral-200 truncate">{{ r.label }}</span>
                  <span v-if="r.led" class="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="LED feedback" />
                </span>
                <span class="font-mono text-[9px] text-neutral-500 text-right">{{ r.msg }}</span>
                <span class="col-span-2 flex items-center gap-1 min-w-0" :class="r.to ? 'text-violet-200' : 'text-neutral-600'">
                  <ArrowRight class="w-3 h-3 shrink-0" :class="r.to ? 'text-violet-500' : 'text-neutral-700'" />
                  <span class="truncate" :title="r.to || 'Not assigned: played (MIDI Flow cables)'">{{ r.to || 'not assigned' }}</span>
                </span>
              </div>
              <span v-if="!sel.rows.length" class="text-[9px] text-neutral-600">No preset on: its controls are played (MIDI Flow cables) and do nothing else.</span>
            </div>

            <button class="self-start flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-200" @click="openDesigner">
              <Pencil class="w-3 h-3" /> {{ sel.presets.length ? 'Edit in Controller Designer' : 'Make a preset in Controller Designer' }}
            </button>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { Plus, Gamepad2, Pencil, ArrowRight, AlertTriangle, X, SlidersHorizontal, Drum, Music, ListMusic, Waves, LayoutGrid, Play, Radio, Cpu } from 'lucide-vue-next'
import {
  currentProject, currentSet, switchSet, newControlSet, renameControlSet, removeControlSet,
  setKeyPair, setControllerRole,
} from '@/core/projects'
import { liveDevicesOf, roleOf } from '@/lib/projects'
import { profileSettings, learningProfileKey, updateProfile } from '@/core/midi/controller-profiles'
import { designerPresets } from '@/core/midi/designer-presets'
import { presetConflicts, controlFlowGraph, controlMessage, controlTarget } from '@/lib/control-summary'
import { toggleLabel, toggleShortLabel } from '@/lib/rig-toggle'
import { AUTOSAVE_CONTROLLER_ID } from '@/lib/midi-controller-presets'
import { isLaunchpadName } from '@/lib/rig-launchpad'
import { isMidimixName } from '@/lib/rig-midimix'
import { useUiStore } from '@/stores/useUiStore'
import { useMidiStore } from '@/stores/useMidiStore'

const props = defineProps({ canvasNodes: { type: Array, default: () => [] } })

const ROLES = [
  { id: 'perform', label: 'Perform', on: 'bg-emerald-500/80 text-black', title: 'SY.CORE uses it: its presets on, with LEDs' },
  { id: 'rig', label: 'Rig', on: 'bg-sky-500/80 text-black', title: 'The whole controller drives the Rig Controller (its Rig template), with its LEDs' },
  { id: 'live', label: 'Live', on: 'bg-amber-500/80 text-black', title: "Ableton Live's control surface: SY.CORE ignores it" },
]
/** A controller with a whole-controller Rig template (others: Rig Controller actions in a preset, Perform). */
const hasRigTemplate = name => isLaunchpadName(name) || isMidimixName(name)
const roleDisabled = (r, name) => r.id === 'rig' && !hasRigTemplate(name)
const roleTitle = (r, name) => roleDisabled(r, name)
  ? 'The whole-controller Rig: Launchpad Mini MK1 and AKAI MIDImix. Any other controller drives the Rig in Perform: assign Rig Controller actions to its controls in the Controller Designer'
  : r.title
const RIG_TARGET = 'Rig Controller'

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
    const rows = own.filter(p => enabled.value.includes(p.id)).flatMap(p => (p.controls ?? []).map(c => ({
      key: `${p.id}:${c.id}`,
      label: (c.label ?? '').trim() || controlMessage(c),
      msg: controlMessage(c),
      to: controlTarget(c),
      led: c.appMapping?.feedbackOn !== undefined,
    })))
    return {
      name,
      connected: connectedNames.value.has(norm(name)),
      role: roleOf(set.value, name),
      presets: own,
      controls,
      rows: rows.sort((a, b) => (a.to ? 0 : 1) - (b.to ? 0 : 1)),
      assigned: controls.filter(c => c.assignment).length,
      conflicts: conflicts.filter(k => norm(k.device) === norm(name)),
    }
  })
})

// ── the flow's layout: controllers on the left, what they drive on the right ──
const FLOW_W = 620, NODE_W = 210, NODE_H = 52, TARGET_H = 36, GAP = 14, TARGET_X = FLOW_W - NODE_W
const nodeY = i => i * (NODE_H + GAP)
const targetY = i => i * (TARGET_H + GAP)
const selected = ref(null)
const sel = computed(() => controllers.value.find(c => c.name === selected.value) ?? null)
const graph = computed(() => {
  const g = controlFlowGraph(controllers.value.filter(c => c.role === 'perform').map(c => ({ controller: c.name, controls: c.controls })))
  // a Rig controller: one link to the Rig Controller, the whole controller
  const rig = controllers.value.filter(c => c.role === 'rig')
  if (!rig.length) return g
  return {
    targets: [RIG_TARGET, ...g.targets.filter(t => t !== RIG_TARGET)],
    edges: [...rig.map(c => ({ from: c.name, to: RIG_TARGET, count: 'all' })), ...g.edges],
  }
})
const flowH = computed(() => Math.max(nodeY(controllers.value.length) - GAP, targetY(graph.value.targets.length) - GAP, NODE_H))
const hotTargets = computed(() => new Set(selected.value ? graph.value.edges.filter(e => e.from === selected.value).map(e => e.to) : []))
const drawnEdges = computed(() => {
  const ci = new Map(controllers.value.map((c, i) => [c.name, i]))
  const ti = new Map(graph.value.targets.map((t, i) => [t, i]))
  return graph.value.edges.map(e => {
    const x1 = NODE_W, y1 = nodeY(ci.get(e.from)) + NODE_H / 2
    const x2 = TARGET_X, y2 = targetY(ti.get(e.to)) + TARGET_H / 2
    const dx = (x2 - x1) / 2
    const hot = selected.value === e.from
    return {
      ...e, hot, dim: !!selected.value && !hot,
      w: e.count === 'all' ? 4 : Math.min(4, 1 + Math.log2(e.count)),
      d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
      mx: (x1 + x2) / 2, my: (y1 + y2) / 2,
    }
  })
})
const TARGET_ICONS = {
  'Audio Mixer': SlidersHorizontal, 'Drum Machine': Drum, 'Chord Prog': Music, 'Sequencer': ListMusic,
  [RIG_TARGET]: LayoutGrid, 'Arpeggiator': Waves, 'Modulation': Waves, 'UI & Panels': LayoutGrid, 'Transport & Performance': Play, 'Sound Engine': Radio,
}
const targetIcon = t => TARGET_ICONS[t] ?? Cpu

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
