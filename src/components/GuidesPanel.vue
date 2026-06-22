<script setup>
import { ref, computed, onMounted, onUnmounted, h, render } from 'vue'
import { marked } from 'marked'
import { X, BookOpen, ChevronRight } from 'lucide-vue-next'
import { lucideIcons } from '@/lib/lucide-icons'

// --- :IconName: shortcode support ---
// Renders a Lucide icon component to an SVG string via a detached DOM node (cached).
const _iconSvgCache = {}
function lucideToSvg(name) {
  if (_iconSvgCache[name] !== undefined) return _iconSvgCache[name]
  const Icon = lucideIcons[name]
  if (!Icon) { _iconSvgCache[name] = ''; return '' }
  const el = document.createElement('div')
  render(h(Icon, { width: 15, height: 15, strokeWidth: 1.75, style: 'display:inline-block;vertical-align:middle;margin:-2px 3px 0' }), el)
  _iconSvgCache[name] = el.innerHTML
  render(null, el)
  return _iconSvgCache[name]
}

// Marked extension — matches :PascalCaseName: in markdown
marked.use({
  extensions: [{
    name: 'lucide-icon',
    level: 'inline',
    start(src) { return src.indexOf(':') },
    tokenizer(src) {
      const m = /^:([A-Z][A-Za-z0-9]+):/.exec(src)
      if (m) return { type: 'lucide-icon', raw: m[0], name: m[1] }
    },
    renderer(token) {
      const svg = lucideToSvg(token.name)
      return svg || token.raw
    },
  }],
})

// Bundle all markdown guides at build time
const rawGuides = import.meta.glob('/docs/guides/*.md', { query: '?raw', import: 'default', eager: true })

const CATEGORIES = [
  {
    label: 'Overview',
    color: 'text-synth-neon',
    items: [
      { id: 'commercial',     label: 'Product Overview',      file: 'SYCORE_COMMERCIAL_PRESENTATION' },
      { id: 'advantages',     label: 'SY.CORE Advantages',    file: 'SYCORE_ADVANTEGES' },
      { id: 'start-here',     label: 'Start Here',  file: 'SYCORE_MIDI_SETUP' },
      { id: 'entrepreneurs',  label: 'Note for Entrepreneurs', file: 'SYCORE_FOR_ENTERPRENEURS' },
    ],
  },
  {
    label: 'Sound Engine',
    color: 'text-emerald-400',
    items: [
      { id: 'sound-engine',  label: 'Roland S-1',     file: 'SYCORE_SOUND_ENGINE_S1' },
    ],
  },
  {
    label: 'MIDI',
    color: 'text-blue-400',
    items: [
      { id: 'midi-setup',       label: 'Connecting MIDI Devices', file: 'SYCORE_MIDI_SETUP' },
      { id: 'midi-manager',    label: 'MIDI Manager',         file: 'SYCORE_MIDI MANAGER' },
      { id: 'midi-devices',    label: 'Devices',         file: 'SYCORE_MIDI_DEVICES' },
      { id: 'midi-routing',    label: 'Routing',         file: 'SYCORE_MIDI_ROUTING' },
      { id: 'midi-performance',  label: 'Performance',         file: 'SYCORE_MIDI_PERFORMANCE' },
      { id: 'midi-mapping',      label: 'CC Mapping',         file: 'SYCORE_MIDI_MAPPING' },
      { id: 'midi-actions',      label: 'MIDI Actions',         file: 'SYCORE_MIDI_ACTIONS' },
      { id: 'midi-sync',    label: 'MIDI Sync',         file: 'SYCORE_MIDI_SYNC' },
      { id: 'midi-capture',    label: 'MIDI Capture',         file: 'SYCORE_MIDI_CAPTURE' },
      { id: 'program-change',  label: 'Multi Sound',          file: 'SYCORE_DEVICE_PROGRAM_CHANGE' },
    ],
  },
  {
    label: 'Audio',
    color: 'text-emerald-400',
    items: [
      { id: 'audio-capture', label: 'Audio Capture',              file: 'SYCORE_AUDIO_CAPTURE' },
      { id: 'backing-track', label: 'Backing Track Player',       file: 'SYCORE_BACKING_TRACK_PLAYER' },
      { id: 'freesound-browser', label: 'Freesound.org Browser',  file: 'SYCORE_FREESOUND_BROWSER' },
      { id: 'looper',        label: 'Audio Looper',               file: 'SYCORE_LOOPER', badge: 'Beta' },
      { id: 'sampler',       label: 'Sampler',                    file: 'SYCORE_SAMPLER' },
    ],
  },

  {
    label: 'Live Performance',
    color: 'text-pink-400',
    items: [
      { id: 'live-timeline',  label: 'Live Timeline',         file: 'SYCORE_LIVE_TIMELINE' },
      { id: 'loop-machine', label: 'Samples Machine',      file: 'SYCORE_LOOP_MACHINE' },
      { id: 'live-pad',       label: 'Live Set',  file: 'SYCORE_LIVE_PERFORMANCE_PAD' },
      { id: 'step-sequencer', label: 'Step Sequencer',        file: 'SYCORE_STEP_SEQUENCER' },
      { id: 'chord-progression-sequencer', label: 'Chord Progression Sequencer', file: 'SYCORE_CHORD_PROG_SEQUENCER' },
      { id: 'drum-machine', label: 'Drum Machine', file: 'SYCORE_DRUM_MACHINE' },
    ],
  },
]

const ALL_ITEMS = CATEGORIES.flatMap(c => c.items)

// filename (no extension) → id, for resolving inter-guide links
const fileToId = Object.fromEntries(ALL_ITEMS.map(i => [i.file, i.id]))

const activeId  = ref('commercial')
const contentEl = ref(null)

const renderedHtml = computed(() => {
  const item = ALL_ITEMS.find(i => i.id === activeId.value)
  if (!item) return ''
  const key = Object.keys(rawGuides).find(k => k.includes(item.file))
  if (!key) return '<p>Guide not found.</p>'
  let html = marked.parse(rawGuides[key])
  // Convert ./FILENAME.md links to in-app guide navigation
  html = html.replace(/href="\.\/([^"]+?)\.md"/g, (match, filename) => {
    const id = fileToId[filename]
    return id ? `href="#" data-guide="${id}"` : match
  })
  return html
})

function select(id) {
  activeId.value = id
  if (contentEl.value) contentEl.value.scrollTop = 0
}

function onContentClick(e) {
  const link = e.target.closest('a[data-guide]')
  if (!link) return
  e.preventDefault()
  select(link.dataset.guide)
}

const emit = defineEmits(['close'])

function onKey(e) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[600] flex bg-black/80 backdrop-blur-sm"
      @click.self="emit('close')"
    >
      <Transition name="guides-panel" appear>
        <div class="relative flex w-full max-w-6xl mx-auto my-4 bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">

          <!-- Sidebar -->
          <aside class="w-64 shrink-0 flex flex-col border-r border-neutral-800 bg-black/40">
            <!-- Sidebar header -->
            <div class="flex items-center gap-2 px-4 py-4 border-b border-neutral-800">
              <BookOpen class="w-4 h-4 text-synth-neon shrink-0" />
              <span class="text-xs font-black uppercase tracking-widest text-white">Guides</span>
            </div>

            <!-- Nav -->
            <nav class="flex-1 overflow-y-auto custom-scrollbar py-3">
              <div v-for="cat in CATEGORIES" :key="cat.label" class="mb-4">
                <div :class="['px-4 py-1 text-[9px] font-black uppercase tracking-[0.2em] mb-1', cat.color]">
                  {{ cat.label }}
                </div>
                <button
                  v-for="item in cat.items"
                  :key="item.id"
                  @click="select(item.id)"
                  :class="[
                    'w-full flex items-center gap-2 px-4 py-2 text-left text-xs transition-all',
                    activeId === item.id
                      ? 'bg-synth-neon/10 text-synth-neon border-r-2 border-synth-neon'
                      : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  ]"
                >
                  <ChevronRight :class="['w-3 h-3 shrink-0 transition-transform', activeId === item.id ? 'text-synth-neon' : 'text-neutral-700']" />
                  <span class="flex-1 leading-tight">{{ item.label }}</span>
                  <span v-if="item.badge" class="text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 uppercase tracking-wide">
                    {{ item.badge }}
                  </span>
                </button>
              </div>
            </nav>
          </aside>

          <!-- Content -->
          <div class="flex flex-col flex-1 min-w-0">
            <!-- Content header -->
            <div class="shrink-0 flex items-center justify-between px-6 py-2 border-b border-neutral-800 bg-neutral-950/60">
              <span class="text-xs font-black text-synth-neon uppercase tracking-widest text-neutral-400">
                {{ ALL_ITEMS.find(i => i.id === activeId)?.label ?? '' }}
              </span>
              <button
                @click="emit('close')"
                class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
              >
                <X class="w-4 h-4" />
              </button>
            </div>

            <!-- Markdown content -->
            <div
              ref="contentEl"
              class="flex-1 overflow-y-auto custom-scrollbar px-8 py-8 guide-content"
              v-html="renderedHtml"
              @click="onContentClick"
            />
          </div>

        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
.guides-panel-enter-active { transition: opacity 0.2s ease, transform 0.25s ease; }
.guides-panel-enter-from   { opacity: 0; transform: scale(0.97) translateY(8px); }

/* Markdown prose styles */
.guide-content :deep(h1) {
  font-size: 1.5rem;
  font-weight: 900;
  color: #fff;
  margin-bottom: 0.75rem;
  line-height: 1.2;
}
.guide-content :deep(h2) {
  font-size: 1.1rem;
  font-weight: 800;
  color: #e5e5e5;
  margin-top: 2rem;
  margin-bottom: 0.5rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid #262626;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.guide-content :deep(h3) {
  font-size: 0.9rem;
  font-weight: 700;
  color: #a3a3a3;
  margin-top: 1.25rem;
  margin-bottom: 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.guide-content :deep(h4) {
  font-size: 0.8rem;
  font-weight: 700;
  color: #737373;
  margin-top: 1rem;
  margin-bottom: 0.25rem;
}
.guide-content :deep(p) {
  font-size: 0.85rem;
  color: #a3a3a3;
  line-height: 1.7;
  margin-bottom: 0.75rem;
}
.guide-content :deep(ul),
.guide-content :deep(ol) {
  padding-left: 1.25rem;
  margin-bottom: 0.75rem;
}
.guide-content :deep(li) {
  font-size: 0.85rem;
  color: #a3a3a3;
  line-height: 1.7;
  margin-bottom: 0.2rem;
}
.guide-content :deep(li::marker) {
  color: #00ffcc;
}
.guide-content :deep(strong) {
  color: #fff;
  font-weight: 700;
}
.guide-content :deep(em) {
  color: #d4d4d4;
  font-style: italic;
}
.guide-content :deep(code) {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.78rem;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 0.1em 0.35em;
  color: #00ffcc;
}
.guide-content :deep(pre) {
  background: #111;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  padding: 1rem;
  overflow-x: auto;
  margin-bottom: 1rem;
}
.guide-content :deep(pre code) {
  background: none;
  border: none;
  padding: 0;
  color: #e5e5e5;
  font-size: 0.8rem;
}
.guide-content :deep(blockquote) {
  border-left: 3px solid #00ffcc44;
  padding-left: 1rem;
  margin: 1rem 0;
  color: #737373;
  font-style: italic;
}
.guide-content :deep(blockquote p) {
  color: #737373;
}
.guide-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
  font-size: 0.82rem;
}
.guide-content :deep(th) {
  background: #1a1a1a;
  color: #fff;
  font-weight: 700;
  text-align: left;
  padding: 0.5rem 0.75rem;
  border: 1px solid #2a2a2a;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.guide-content :deep(td) {
  padding: 0.45rem 0.75rem;
  border: 1px solid #1f1f1f;
  color: #a3a3a3;
  vertical-align: top;
}
.guide-content :deep(tr:hover td) {
  background: #141414;
}
.guide-content :deep(hr) {
  border: none;
  border-top: 1px solid #262626;
  margin: 1.5rem 0;
}
.guide-content :deep(a) {
  color: #00ffcc;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.guide-content :deep(a:hover) {
  color: #fff;
}
.guide-content :deep(img) {
  max-width: 100%;
  border-radius: 8px;
  border: 1px solid #2a2a2a;
  margin: 0.75rem 0;
}
</style>
