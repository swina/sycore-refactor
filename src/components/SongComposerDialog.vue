<script setup lang="ts">
// AI Song Composer (lib/song-composer.ts), phase 2 UI: key + mode + style + tempo + length →
// Compose → the plan is shown (sections, form, issues) → Apply loads it into Chord Prog (slots +
// chain, drums + Sequencer following), Drum Machine and Sequencer banks, sets the tempo; Undo puts the previous state back.
import { ref, computed } from 'vue'
import { X, ListMusic, Loader2, Check, Undo2, AlertTriangle } from 'lucide-vue-next'
import { useAiAgentStore } from '@/stores/useAiAgentStore'
import { useArpStore } from '@/stores/useArpStore'
import {
  composeSong, applySongPlan, undoSongPlan, keyLabel, type SongSnapshot,
  loadLastGeneration, saveLastGeneration, markLastGenerationApplied, sessionUndo, type LastGeneration,
  partTarget, partCategories, sectionSounds, type PresetMode, type ChordsMode,
} from '@/lib/song-composer'
import { NOTE_NAMES, MODES, type ModeName } from '@/lib/music-theory'
import type { SongPlan, PlanIssue } from '@/lib/song-plan'

const emit = defineEmits<{ close: [] }>()
const aiStore = useAiAgentStore()

const LS = 'SYCORE_SONG_COMPOSER_INPUT'
const saved = (() => { try { return JSON.parse(localStorage.getItem(LS) || 'null') } catch { return null } })()
const root = ref<string>(saved?.root ?? 'A')
const mode = ref<ModeName>(saved?.mode ?? 'minor')
const style = ref<string>(saved?.style ?? '')
const bpm = ref<number>(saved?.bpm ?? useArpStore().arpBpm ?? 120)
const bars = ref<number>(saved?.bars ?? 32)
const presets = ref<PresetMode>(saved?.presets ?? 'keep')
const chordsMode = ref<ChordsMode>(saved?.chordsMode ?? 'chord')
const CHORDS_MODE_OPTIONS: { value: ChordsMode; label: string; hint: string }[] = [
  { value: 'chord', label: 'Chord', hint: 'block chords only: the Sequencer / an instrument arpeggiator does the movement' },
  { value: 'arp', label: 'Arp', hint: 'all chords arpeggiated by the Chord Prog' },
  { value: 'mixed', label: 'AI decides', hint: 'block chords and arpeggios per section and per chord, as the AI writes them' },
]
const PRESET_OPTIONS: { value: PresetMode; label: string; hint: string }[] = [
  { value: 'keep', label: 'Keep current presets', hint: 'the instruments keep the sounds they have' },
  { value: 'once', label: 'Set presets at Load', hint: 'one preset per part (Chord Prog, Sequencer) for the whole song' },
  { value: 'section', label: 'Change presets per section', hint: 'also at each section boundary, during chain playback with Follow on' },
]
// where the parts play (MIDI Flow) — the presets are picked there, from the bank open in Program Change
const targets = computed(() => ({ chords: partTarget('chords'), seq: partTarget('seq') }))
const targetLabel = (t: { deviceName: string; channel: number } | null) => t ? `${t.deviceName} CH ${t.channel + 1}` : 'not wired'

const MODE_OPTIONS = Object.keys(MODES) as ModeName[]
const isLoading = ref(false)
const error = ref('')
// The last generation comes back when the dialog opens (what was asked, the plan, the AI's answer)
const last = ref<LastGeneration | null>(loadLastGeneration())
const plan = ref<SongPlan | null>(last.value?.plan ?? null)
const issues = ref<PlanIssue[]>(last.value?.issues ?? [])
const raw = ref<string>(last.value?.raw ?? '')
if (last.value?.error) error.value = last.value.error
const undo = ref<SongSnapshot | null>(sessionUndo.get())
const applied = ref(!!last.value?.appliedAt)

const fmtDate = (iso?: string) => iso ? new Date(iso).toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
const lastInputLabel = computed(() => {
  const i = last.value?.input
  if (!i) return ''
  const cm = i.chordsMode === 'arp' ? ' · arp' : i.chordsMode === 'mixed' ? ' · chord/arp by AI' : ' · chords'
  const p = i.presets === 'once' ? ' · presets at Load' : i.presets === 'section' ? ' · presets per section' : ''
  return `${i.root} ${i.mode === 'harmonicMinor' ? 'harmonic minor' : i.mode} · ${i.style || 'any style'} · ${i.bpm} BPM · ${i.bars ?? 32} bars${cm}${p}`
})
const showRaw = ref(false)

const shownIssues = computed(() => issues.value.filter(i => i.level !== 'repaired'))
const repairedCount = computed(() => issues.value.filter(i => i.level === 'repaired').length)

async function compose() {
  try { localStorage.setItem(LS, JSON.stringify({ root: root.value, mode: mode.value, style: style.value, bpm: bpm.value, bars: bars.value, presets: presets.value, chordsMode: chordsMode.value })) } catch {}
  isLoading.value = true
  error.value = ''
  applied.value = false
  const input = {
    root: root.value, mode: mode.value, style: style.value, bpm: bpm.value, bars: bars.value,
    presets: presets.value, chordsMode: chordsMode.value, ...(presets.value !== 'keep' ? { categories: partCategories() } : {}),
  }
  const r = await composeSong(input)
  isLoading.value = false
  plan.value = r.plan
  issues.value = r.issues
  raw.value = r.raw
  if (r.error) error.value = r.error
  last.value = { at: new Date().toISOString(), input, plan: r.plan, issues: r.issues, raw: r.raw, ...(r.error ? { error: r.error } : {}) }
  saveLastGeneration(last.value)
}

function apply() {
  if (!plan.value) return
  const r = applySongPlan(plan.value, { presets: presets.value, chordsMode: chordsMode.value })
  undo.value = r.before
  sessionUndo.set(r.before)
  issues.value = [...issues.value, ...r.issues]
  applied.value = true
  markLastGenerationApplied(true)
  last.value = loadLastGeneration()
}

function revert() {
  if (!undo.value) return
  undoSongPlan(undo.value)
  undo.value = null
  sessionUndo.set(null)
  applied.value = false
  markLastGenerationApplied(false)
  last.value = loadLastGeneration()
}

const sectionName = (id: string) => plan.value?.sections.find(s => s.id === id)?.name ?? id
</script>

<template>
  <div class="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" @mousedown.self="emit('close')">
    <div class="bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col">
      <div class="px-5 py-4 border-b border-neutral-900 flex justify-between items-center shrink-0">
        <div class="flex items-center gap-3">
          <ListMusic class="w-5 h-5 text-synth-neon" />
          <h2 class="text-base font-black uppercase tracking-widest text-white">Compose Song</h2>
          <span class="text-[10px] font-mono text-neutral-500">AI → Chord Prog + Drum Machine + Sequencer</span>
        </div>
        <button @click="emit('close')" class="p-1 text-neutral-400 hover:text-white"><X class="w-5 h-5" /></button>
      </div>

      <div class="p-5 space-y-4 overflow-y-auto">
        <div v-if="!aiStore.isConfigured" class="bg-amber-900/20 border border-amber-800/50 rounded-lg p-3 text-sm text-amber-300">
          AI Agent not configured. Open AI Agent settings to set up a provider and model.
        </div>

        <!-- input -->
        <div class="grid grid-cols-[auto_auto_1fr_auto_auto] gap-3 items-end text-[10px] font-mono uppercase tracking-widest text-neutral-500">
          <label class="flex flex-col gap-1">Key
            <select v-model="root" class="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-white normal-case">
              <option v-for="n in NOTE_NAMES" :key="n" :value="n">{{ n }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1">Mode
            <select v-model="mode" class="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-white normal-case">
              <option v-for="m in MODE_OPTIONS" :key="m" :value="m">{{ m === 'harmonicMinor' ? 'harmonic minor' : m }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1">Style (genre, artist, mood)
            <input v-model="style" placeholder="e.g. French house like Daft Punk, warm and funky"
              class="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-white normal-case tracking-normal placeholder:text-neutral-600"
              @keydown.enter="!isLoading && aiStore.isConfigured && compose()" />
          </label>
          <label class="flex flex-col gap-1">BPM
            <input v-model.number="bpm" type="number" min="40" max="240" class="w-16 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-white" />
          </label>
          <label class="flex flex-col gap-1">Bars
            <input v-model.number="bars" type="number" min="8" max="256" step="8" class="w-16 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-white" />
          </label>
        </div>

        <!-- Chord Prog chords mode -->
        <div class="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-neutral-500">
          <span class="mr-1">Chord Prog chords</span>
          <button v-for="o in CHORDS_MODE_OPTIONS" :key="o.value" @click="chordsMode = o.value" :title="o.hint"
            :class="['px-2.5 py-1 rounded-lg border text-[10px] font-mono uppercase tracking-wider transition-colors',
              chordsMode === o.value ? 'border-purple-500/70 bg-purple-600/20 text-purple-200' : 'border-neutral-700 text-neutral-500 hover:text-neutral-300']">
            {{ o.label }}
          </button>
        </div>

        <!-- presets -->
        <div class="flex flex-col gap-1.5">
          <div class="flex flex-wrap gap-1.5">
            <button v-for="o in PRESET_OPTIONS" :key="o.value" @click="presets = o.value" :title="o.hint"
              :class="['px-2.5 py-1 rounded-lg border text-[10px] font-mono uppercase tracking-wider transition-colors',
                presets === o.value ? 'border-synth-neon/60 bg-synth-neon/10 text-synth-neon' : 'border-neutral-700 text-neutral-500 hover:text-neutral-300']">
              {{ o.label }}
            </button>
          </div>
          <div v-if="presets !== 'keep'" class="text-[10px] font-mono text-neutral-500">
            Chord Prog → <span :class="targets.chords ? 'text-neutral-300' : 'text-amber-500'">{{ targetLabel(targets.chords) }}</span>
            · Sequencer → <span :class="targets.seq ? 'text-neutral-300' : 'text-amber-500'">{{ targetLabel(targets.seq) }}</span>
            · first preset of the category, from the bank open in Program Change
          </div>
        </div>

        <button :disabled="isLoading || !aiStore.isConfigured" @click="compose"
          class="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-synth-neon/15 border border-synth-neon/40 text-synth-neon text-xs font-black uppercase tracking-widest hover:bg-synth-neon/25 disabled:opacity-40">
          <Loader2 v-if="isLoading" class="w-4 h-4 animate-spin" />
          {{ isLoading ? 'Composing…' : plan ? 'Compose again' : 'Compose' }}
        </button>

        <div v-if="error" class="bg-red-900/20 border border-red-800/50 rounded-lg p-3 text-xs text-red-300 font-mono">{{ error }}</div>

        <!-- the generation shown: when, what was asked, loaded or not -->
        <div v-if="last" class="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-1.5 text-[10px] font-mono">
          <div class="min-w-0 truncate text-neutral-400">
            <span class="text-neutral-500 uppercase tracking-widest">Last generation</span>
            · {{ fmtDate(last.at) }} · <span class="text-neutral-300">{{ lastInputLabel }}</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span :class="last.appliedAt ? 'text-emerald-400' : 'text-neutral-500'">{{ last.appliedAt ? `loaded ${fmtDate(last.appliedAt)}` : 'not loaded' }}</span>
            <button v-if="raw" @click="showRaw = !showRaw" class="px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-400 hover:text-white">
              {{ showRaw ? 'Hide' : 'AI answer' }}
            </button>
          </div>
        </div>
        <pre v-if="showRaw && raw" class="max-h-56 overflow-auto rounded-lg border border-neutral-800 bg-black/60 p-2 text-[10px] leading-snug text-neutral-300 whitespace-pre-wrap break-all select-text">{{ raw }}</pre>

        <!-- plan -->
        <template v-if="plan">
          <div class="flex items-baseline justify-between gap-3">
            <div class="min-w-0">
              <div class="text-white font-black text-sm truncate">{{ plan.title }}</div>
              <div class="text-[10px] font-mono text-neutral-400">{{ keyLabel(plan) }} · {{ plan.bpm }} BPM<template v-if="plan.style.drumStyle"> · drums {{ plan.style.drumStyle }}</template></div>
            </div>
            <div class="text-[10px] font-mono text-neutral-500 text-right">
              {{ plan.form.map(sectionName).join(' → ') }}
            </div>
          </div>
          <p v-if="plan.style.summary" class="text-[11px] text-neutral-400 italic">{{ plan.style.summary }}</p>

          <div class="grid grid-cols-2 gap-2">
            <div v-for="s in plan.sections" :key="s.id" class="rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2">
              <div class="flex items-center justify-between text-[10px] font-mono">
                <span class="text-synth-neon font-black">{{ s.id }} · {{ s.name }}</span>
                <span class="text-neutral-500">{{ s.bars }} bars · E{{ s.energy }} · {{ chordsMode === 'mixed' ? s.playMode : chordsMode }}</span>
              </div>
              <div class="flex flex-wrap gap-x-2 gap-y-0.5 text-[12px] font-mono text-white mt-1">
                <span v-for="(c, ci) in s.chords" :key="ci" :title="`${c.beats} beats${c.velocity ? ' · vel ' + c.velocity : ''} · ${c.mode ?? s.playMode}`">
                  {{ c.symbol }}<sub class="text-[8px] text-neutral-500">{{ c.beats }}{{ (chordsMode === 'mixed' ? (c.mode ?? s.playMode) : chordsMode) === 'arp' ? 'a' : '' }}</sub>
                </span>
              </div>
              <div v-if="s.sequence || s.bass" class="text-[9px] font-mono text-cyan-500/80 mt-0.5">
                seq: {{ s.sequence ? `${s.sequence.role} · ${s.sequence.steps.length / 16} bar${s.sequence.steps.length > 16 ? 's' : ''}` : 'bass (from pattern)' }}
              </div>
              <div v-if="presets !== 'keep' && (sectionSounds(plan, s).chords || sectionSounds(plan, s).seq)" class="text-[9px] font-mono text-amber-500/80 mt-0.5 truncate">
                sounds: {{ [sectionSounds(plan, s).chords && `chords ${sectionSounds(plan, s).chords}`, sectionSounds(plan, s).seq && `seq ${sectionSounds(plan, s).seq}`].filter(Boolean).join(' · ') }}
              </div>
              <div class="text-[9px] font-mono text-neutral-500 mt-0.5 truncate">
                {{ Object.keys(s.drums).length ? Object.keys(s.drums).join(', ') : `drums: ${plan.style.drumStyle ?? 'none'}` }}
              </div>
            </div>
          </div>

          <div v-if="shownIssues.length || repairedCount" class="rounded-lg border border-neutral-800 px-3 py-2 space-y-0.5 max-h-28 overflow-y-auto">
            <div v-for="(i, k) in shownIssues" :key="k" class="flex items-start gap-1.5 text-[10px] font-mono"
              :class="i.level === 'error' ? 'text-red-400' : 'text-amber-400'">
              <AlertTriangle class="w-3 h-3 shrink-0 mt-px" /> {{ i.message }}
            </div>
            <div v-if="repairedCount" class="text-[10px] font-mono text-neutral-500">{{ repairedCount }} small fixes applied to the AI answer</div>
          </div>

          <div class="flex gap-2">
            <button v-if="!applied" @click="apply"
              class="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-purple-600/30 border border-purple-500 text-purple-200 text-xs font-black uppercase tracking-widest hover:bg-purple-600/50">
              <Check class="w-4 h-4" /> Load into Chord Prog + Drum Machine + Sequencer
            </button>
            <template v-else>
              <span class="flex-1 text-[11px] font-mono text-emerald-400 self-center">
                Loaded: start the Chord Prog (chain on, Follow on) with the Drum Machine and the Sequencer.
              </span>
              <button v-if="undo" @click="revert"
                class="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-700 text-neutral-300 text-xs font-bold uppercase hover:text-white">
                <Undo2 class="w-4 h-4" /> Undo
              </button>
            </template>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
