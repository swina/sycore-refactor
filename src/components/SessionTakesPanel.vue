<script setup>
import ResizeHandles from '@/components/ui/ResizeHandles.vue'
// Session panel: the session takes (stores/useSessionTakesStore.ts, lib/session-takes.ts) — each
// slot's content before a Generate ('start' the first of the session) and each Generate's result,
// newest first. Load one back into its slot or into another (e.g. a free one, to keep it), delete
// it, or clear the session. Preview: A/B in the chosen slot — heard as that slot plays, then Revert
// (the slot as it was) or Keep (as a Load); closing the panel reverts it.
import { computed, ref, onUnmounted } from 'vue'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import PlayPanelHeader from '@/components/play/PlayPanelHeader.vue'
import { useSessionTakesStore } from '@/stores/useSessionTakesStore'
import { applyTake, takeSummary, takeTargets, targetLabel, TAKE_APP_LABELS, takePreview, previewTake, revertPreview, keepPreview } from '@/lib/session-takes'

const emit = defineEmits(['close'])
const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } = useDraggableResizable({
  storageKey: 'SYCORE_POS_SESSION_TAKES',
  minimizeLabel: 'Session',
  initialWidth: 560,
  initialHeight: 420,
  minWidth: 380,
  minHeight: 200,
  zIndex: 165,
  panelId: 'session-takes',
})

const takes = useSessionTakesStore()
const filter = ref('all')
const FILTERS = [['all', 'All'], ['drum', 'Drum'], ['bass', 'Bass'], ['chord', 'Chord'], ['seq', 'Seq'], ['capt', 'Capt']]
const APP_CLASS = { drum: 'text-amber-300', bass: 'text-violet-300', chord: 'text-emerald-300', seq: 'text-sky-300' }

const rows = computed(() => takes.takes
  .filter(t => filter.value === 'all' || t.app === filter.value)
  .slice().reverse())
const count = (app) => takes.takes.filter(t => app === 'all' || t.app === app).length

// per take: the slot to load it into (its own unless changed)
const dest = ref({})
const destOf = (t) => dest.value[t.id] ?? t.target
const msg = ref('')
let msgTimer = null
function say(text) { msg.value = text; clearTimeout(msgTimer); msgTimer = setTimeout(() => { msg.value = '' }, 2500) }

function load(t) {
  if (takePreview.value) revertPreview()
  const to = destOf(t)
  say(applyTake(t, to) ? `${targetLabel(t.app, t.target)} ${kindLabel(t)} → ${targetLabel(t.app, to)}` : 'Could not load it')
}

const inPreview = (t) => takePreview.value?.takeId === t.id
function preview(t) {
  const to = destOf(t)
  say(previewTake(t, to) ? `Preview in ${targetLabel(t.app, to)} — Revert or Keep` : 'Could not preview it')
}
function revert() {
  const p = takePreview.value
  if (p && revertPreview()) say(`${targetLabel(p.app, p.target)} back as it was`)
}
function keep() {
  const p = takePreview.value
  if (p && keepPreview()) say(`Kept in ${targetLabel(p.app, p.target)}`)
}
function remove(t) {
  if (inPreview(t)) revertPreview()
  takes.remove(t.id)
}
// closing the panel: the slot goes back as it was
onUnmounted(() => { if (takePreview.value) revertPreview() })

function kindLabel(t) { return t.kind === 'start' ? 'Start' : t.kind === 'before' ? 'Before' : t.source === 'ai' ? 'AI' : 'Gen' }
const KIND_CLASS = { start: 'bg-sky-500/20 text-sky-300', before: 'bg-neutral-700/60 text-neutral-300', gen: 'bg-amber-500/20 text-amber-300', ai: 'bg-emerald-500/20 text-emerald-300' }
const kindClass = (t) => KIND_CLASS[t.kind === 'gen' && t.source === 'ai' ? 'ai' : t.kind]
const time = (at) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const confirmClear = ref(false)
let clearTimer = null
function clearAll() {
  if (!confirmClear.value) { confirmClear.value = true; clearTimeout(clearTimer); clearTimer = setTimeout(() => { confirmClear.value = false }, 3000); return }
  confirmClear.value = false
  if (takePreview.value) revertPreview()
  takes.clear()
  say('New session')
}
const since = computed(() => new Date(takes.startedAt).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))
</script>

<template>
  <div class="bg-neutral-950 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden relative" :style="panelStyle" v-show="!isMinimized" @mousedown.capture="bringToFront">
    <PlayPanelHeader title="Session" panel-id="session-takes" :edit="false" accent="text-sky-300"
                     @pointerdown="onDragStart" @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize">
      <span class="text-[10px] text-neutral-500 font-mono">since {{ since }}</span>
    </PlayPanelHeader>
    <div class="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-neutral-800">
      <button v-for="f in FILTERS" :key="f[0]" @click="filter = f[0]"
              class="px-2 py-0.5 rounded text-[10px] font-bold border"
              :class="filter === f[0] ? 'bg-sky-500/20 border-sky-400/60 text-sky-200' : 'bg-white/[0.03] border-white/10 text-neutral-400 hover:text-white'">
        {{ f[1] }} <span class="font-mono opacity-60">{{ count(f[0]) }}</span>
      </button>
      <div class="flex-1" />
      <span v-if="msg" class="text-[10px] text-emerald-300 truncate">{{ msg }}</span>
      <button class="px-2 py-0.5 rounded text-[10px] font-bold border"
              :class="confirmClear ? 'bg-red-600 border-red-400 text-white' : 'bg-white/[0.03] border-white/10 text-neutral-400 hover:text-red-300'"
              title="Empty the session journal (a new session starts)" :disabled="!takes.takes.length" @click="clearAll">{{ confirmClear ? 'Sure? Clear' : 'Clear' }}</button>
    </div>
    <div class="flex-1 min-h-0 overflow-y-auto">
      <div v-if="!rows.length" class="p-4 text-[11px] text-neutral-500 leading-relaxed">
        Nothing yet. Each Generate (Drum, Bass, Chord Prog, Sequencer — from the panels, the Rig or MIDI) keeps
        here the slot it writes over and what it made, until you clear the session.
      </div>
      <div v-for="t in rows" :key="t.id" class="flex items-center gap-2 px-2 py-1 border-b border-white/5 text-[11px]"
           :class="inPreview(t) ? 'bg-sky-500/10' : 'hover:bg-white/[0.03]'">
        <span class="font-mono text-[10px] text-neutral-500 w-14 shrink-0">{{ time(t.at) }}</span>
        <span class="w-16 shrink-0 font-bold" :class="APP_CLASS[t.app]">{{ targetLabel(t.app, t.target) }}</span>
        <span class="px-1.5 py-px rounded text-[9px] font-black uppercase shrink-0" :class="kindClass(t)">{{ kindLabel(t) }}</span>
        <span class="flex-1 min-w-0 truncate text-neutral-300 font-mono" :title="takeSummary(t)">{{ takeSummary(t) }}</span>
        <select :value="destOf(t)" :disabled="inPreview(t)" @change="dest[t.id] = t.app === 'drum' || t.app === 'bass' ? $event.target.value : Number($event.target.value)"
                class="bg-black/40 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white shrink-0" :title="`Load into (${TAKE_APP_LABELS[t.app]})`">
          <option v-for="o in takeTargets(t.app)" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <template v-if="inPreview(t)">
          <button class="px-2 py-0.5 rounded text-[10px] font-bold border bg-sky-600/30 border-sky-400/60 text-sky-100 hover:bg-sky-600/50 shrink-0"
                  title="Revert: the slot back as it was before the preview" @click="revert">■ Revert</button>
          <button class="px-2 py-0.5 rounded text-[10px] font-bold border bg-emerald-600/20 border-emerald-500/50 text-emerald-200 hover:bg-emerald-600/40 shrink-0"
                  title="Keep: the take stays in the slot (what was there is kept as a take)" @click="keep">✓ Keep</button>
        </template>
        <template v-else>
          <button class="px-2 py-0.5 rounded text-[10px] font-bold border bg-white/[0.03] border-sky-500/40 text-sky-200 hover:bg-sky-600/30 shrink-0"
                  title="Preview: the take in the chosen slot, heard as that slot plays — then Revert or Keep (another Preview, or closing the panel, reverts it)" @click="preview(t)">▶ Preview</button>
          <button class="px-2 py-0.5 rounded text-[10px] font-bold border bg-emerald-600/20 border-emerald-500/50 text-emerald-200 hover:bg-emerald-600/40 shrink-0"
                  title="Load this take into the chosen slot (what is there now is kept as a take first)" @click="load(t)">Load</button>
        </template>
        <button class="px-1.5 py-0.5 rounded text-[10px] text-neutral-500 hover:text-red-300 shrink-0" title="Delete this take" @click="remove(t)">✕</button>
      </div>
    </div>
    <ResizeHandles :start="onResizeStart" />
  </div>
</template>
