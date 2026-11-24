<script setup>
import PanelHeader from '@/components/ui/PanelHeader.vue'
// Projects (the MIDI Flow workspace's right pane): the projects (core/projects.ts: a MIDI Flow setup + the
// controllers of its control sets) and the MIDI Flow setups saved. A click only selects one (its details
// shown); **Load** loads it — so a click by mistake never changes the routing.
import { ref, computed } from 'vue'
import { FolderOpen, Check, FolderKanban } from 'lucide-vue-next'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import ResizeHandles from '@/components/ui/ResizeHandles.vue'
import { useMidiFlowConfigsStore } from '@/stores/useMidiFlowConfigsStore'
import { projects, currentProjectId, loadProject } from '@/core/projects'
import { designerPresets } from '@/core/midi/designer-presets'

const emit = defineEmits(['close'])
const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
  storageKey: 'SYCORE_POS_PROJECTS_LIST',
  minimizeLabel: 'Projects',
  initialWidth: 320,
  initialHeight: 560,
  minWidth: 220,
  minHeight: 200,
  zIndex: 120,
  panelId: 'projects-list',
})

const flow = useMidiFlowConfigsStore()
/** 'p:<id>' a project, 's:<name>' a setup */
const selected = ref('')
const msg = ref('')

const projectList = computed(() => [...projects.value].sort((a, b) => a.name.localeCompare(b.name)))
const setupList = computed(() => [...flow.configs].sort((a, b) => a.name.localeCompare(b.name)))
const presetName = id => designerPresets.value.find(p => p.id === id)?.name ?? id

function projectDetails(p) {
  return p.control.sets.map(s => ({ name: s.name, active: s.id === p.control.activeSetId, presets: s.presetIds.map(presetName) }))
}
const say = t => { msg.value = t; setTimeout(() => { if (msg.value === t) msg.value = '' }, 2500) }

function loadP(p) { loadProject(p.id); say(`Project ${p.name} loaded`) }
function loadS(name) { flow.requestLoad(name); say(`Setup ${name} loaded`) }
const fmtDate = d => { try { return new Date(d).toLocaleDateString() } catch { return '' } }
</script>

<template>
  <div class="bg-neutral-950 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden relative" :style="panelStyle" v-show="!isMinimized" @mousedown.capture="bringToFront">
    <PanelHeader title="Projects" :icon="FolderKanban" accent="text-violet-300"
                 @pointerdown="onDragStart" @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize">
      <span v-if="msg" class="text-[10px] text-emerald-300 truncate">{{ msg }}</span>
    </PanelHeader>
    <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-3">
      <!-- Projects -->
      <section>
        <div class="text-[9px] font-black uppercase tracking-widest text-violet-300/80 px-1 mb-1">Projects · {{ projectList.length }}</div>
        <p v-if="!projectList.length" class="px-1 text-[10px] text-neutral-600">No projects yet — save a setup in MIDI Flow with its controllers.</p>
        <div v-for="p in projectList" :key="p.id"
             class="rounded-lg border mb-1 transition-colors cursor-pointer"
             :class="selected === 'p:' + p.id ? 'border-violet-400/70 bg-violet-500/10' : 'border-white/10 bg-white/[0.02] hover:border-white/30'"
             @click="selected = selected === 'p:' + p.id ? '' : 'p:' + p.id">
          <div class="flex items-center gap-2 px-2 py-1.5">
            <Check v-if="currentProjectId === p.id" class="w-3 h-3 text-violet-300 shrink-0" title="Current project" />
            <span class="flex-1 min-w-0 truncate text-[11px] font-bold text-white">{{ p.name }}</span>
            <button class="shrink-0 px-2 py-0.5 rounded border border-violet-400/50 text-violet-200 text-[10px] font-bold uppercase hover:bg-violet-500/20"
                    :title="`Load ${p.name}: its MIDI Flow setup${p.flow ? ' (' + p.flow + ')' : ''} and its active control set's controllers`"
                    @click.stop="loadP(p)">Load</button>
          </div>
          <div v-if="selected === 'p:' + p.id" class="px-2 pb-2 text-[10px] font-mono text-neutral-400 flex flex-col gap-1">
            <span><span class="text-neutral-600">Setup</span> {{ p.flow || '—' }}</span>
            <span v-for="s in projectDetails(p)" :key="s.name">
              <span :class="s.active ? 'text-violet-300' : 'text-neutral-600'">{{ s.name }}{{ s.active ? ' ●' : '' }}</span>
              {{ s.presets.length ? s.presets.join(', ') : 'no controllers' }}
            </span>
            <span class="text-neutral-600">Updated {{ fmtDate(p.updatedAt) }}</span>
          </div>
        </div>
      </section>

      <!-- MIDI Flow setups -->
      <section>
        <div class="text-[9px] font-black uppercase tracking-widest text-emerald-300/80 px-1 mb-1">MIDI Flow setups · {{ setupList.length }}</div>
        <p v-if="!setupList.length" class="px-1 text-[10px] text-neutral-600">No setups saved — MIDI Flow's header: Save.</p>
        <div v-for="c in setupList" :key="c.name"
             class="rounded-lg border mb-1 transition-colors cursor-pointer"
             :class="selected === 's:' + c.name ? 'border-emerald-400/70 bg-emerald-500/10' : 'border-white/10 bg-white/[0.02] hover:border-white/30'"
             @click="selected = selected === 's:' + c.name ? '' : 's:' + c.name">
          <div class="flex items-center gap-2 px-2 py-1.5">
            <FolderOpen class="w-3 h-3 shrink-0" :class="flow.lastConfigName === c.name ? 'text-emerald-300' : 'text-neutral-600'" />
            <span class="flex-1 min-w-0 truncate text-[11px] font-bold" :class="flow.lastConfigName === c.name ? 'text-emerald-200' : 'text-white'">{{ c.name }}</span>
            <button class="shrink-0 px-2 py-0.5 rounded border border-emerald-400/50 text-emerald-200 text-[10px] font-bold uppercase hover:bg-emerald-500/20"
                    :title="`Load the setup ${c.name} in MIDI Flow (the controllers stay as they are)`"
                    @click.stop="loadS(c.name)">Load</button>
          </div>
          <div v-if="selected === 's:' + c.name" class="px-2 pb-2 text-[10px] font-mono text-neutral-400 flex flex-col gap-0.5">
            <span>{{ c.nodes.filter(n => !n.sourceId).length }} devices · {{ c.nodes.filter(n => n.sourceId).length }} apps · {{ c.cables.length }} cables</span>
            <span class="text-neutral-600">Saved {{ fmtDate(c.createdAt) }}</span>
          </div>
        </div>
      </section>
    </div>
    <ResizeHandles :start="onResizeStart" />
  </div>
</template>
