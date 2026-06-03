<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import {
  X, Settings, Settings2, Save, Download, Database, Trash2,
  ChevronUp, ChevronDown, Plus, Search, Palette, Captions, LayoutGrid, Loader2, AlertCircle, Bell
} from 'lucide-vue-next'
import { lucideIcons } from '@/lib/lucide-icons'
import { useConfigStore } from '@/stores/useConfigStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { usePushNotifications } from '@/composables/usePushNotifications'
import { db, doc, setDoc, getDoc, serverTimestamp } from '@/lib/idb'

const props = defineProps({ isOpen: Boolean })
const emit  = defineEmits(['close'])

const configStore = useConfigStore()
const authStore   = useAuthStore()

const isSuperAdmin = computed(() => authStore.user?.email === 'swina.allen@gmail.com')

const {
  isSubscribed, permissionState, isSupported,
  subscribers, subscribe, unsubscribe, sendPush,
  fetchSubscribers, removeSubscriber, exportSubscribers,
} = usePushNotifications()

// ─── State ───────────────────────────────────────────────────────────────────

const isLoading  = ref(false)
const isSaving   = ref(false)
const error      = ref(null)
const openSections = ref(new Set())

const appVersion     = ref('v. 0.0.1')
const appEngine      = ref('AGAS - 01')
const appOsTarget    = ref('ROLAND S-1 - v1.02')
const appName        = ref('SY.CORE')
const appSubtitle    = ref('for ROLAND S-1 Tweak Synth')
const toolbarIconSize = ref(6)

const controllers  = ref([])
const categories   = ref([])
const appSoundTypes = ref([])
const soundTypeBg  = ref({})
const toolbarButtons = ref([])
const rolesConfig  = ref({
  demo:     { slots: 8,  gens: 16,   features: {} },
  basic:    { slots: 16, gens: 200,  features: {} },
  producer: { slots: 64, gens: 1000, features: {} },
})

const searchQuery      = ref('')
const pushTitle        = ref('')
const pushBody         = ref('')
const editingId        = ref(null)
const editingOptionsId = ref(null)
const optionEdit       = ref({ label: '', value: 0 })
const draggedIndex     = ref(null)

const newCategory   = ref({ name: '', color: '#00ffcc', order: 0 })
const newSoundType  = ref({ id: '', label: '', enabled: true })
const newController = ref({ category: 'ADVANCED', min: 0, max: 127, type: 'SLIDER_H' })

const DEFAULT_CATEGORIES = [
  { id: 'LFO',       name: 'LFO',       color: '#00A370', order: 1 },
  { id: 'OSCILLATOR',name: 'OSCILLATOR',color: '#2563EB', order: 2 },
  { id: 'ENV',       name: 'ENV',       color: '#D946EF', order: 3 },
  { id: 'FILTER',    name: 'FILTER',    color: '#F59E0B', order: 4 },
  { id: 'EFX',       name: 'EFX',       color: '#EF4444', order: 5 },
  { id: 'ADVANCED',  name: 'ADVANCED',  color: '#6B7280', order: 6 },
]

const FEATURE_KEYS = [
  'midiOut','midiLearn','aiPrompt','bankExport','cloudSync','favorites',
  'support','midiLogger','copySound','abSound','seqPreviewMagic',
  'importBank','seqGen','seqParam2','seqGlobalTranspose','seqSyncTrack',
]

const ALL_AVAILABLE_ICONS = [
  'AudioLines','LayoutGrid','Cpu','Captions','Layers','Heart','KeyboardMusic','ListMusic','User','BookOpen','Workflow',
  'Cable','Settings','Settings2','Gamepad2','AlertTriangle','Mail','HelpCircle','Zap',
  'Activity','Sliders','Menu','MoreVertical','Plus','Minus','ChevronDown','ChevronUp',
  'Clock','Music','Volume2','Pause','Play','Square','Circle','Triangle',
  'Eye','EyeOff','Lock','Unlock','Trash2','Save','Download','Upload','Search','Filter',
  'Database','Palette','Disc3','Radio','BarChart3','ListFilter','Mic','GitCompareArrows','Grid3x3','RotateCw','RotateCcw','Network','ListTree','Music2',
]
const AVAILABLE_ICONS = ALL_AVAILABLE_ICONS.sort()

// All functions the app exposes as toolbar buttons.
// Add new entries here when a new panel/feature is wired up in SynthApp.
const KNOWN_TOOLBAR_FUNCTIONS = [
  { id: 'types',          label: 'Sound Types',      icon: 'LayoutGrid'   },
  { id: 'history',        label: 'Sounds History',   icon: 'Layers'       },
  { id: 'keyboard',       label: 'Virtual Keyboard', icon: 'KeyboardMusic'},
  { id: 'sequencer',      label: 'Step Sequencer',   icon: 'ListMusic'    },
  { id: 'arp',            label: 'Arpeggiator',      icon: 'Activity'     },
  { id: 'audio-capture',  label: 'Audio Capture',    icon: 'Mic'          },
  { id: 'visualizer',     label: 'Audio Visualizer', icon: 'Activity'     },
  { id: 'capture',        label: 'MIDI Capture',     icon: 'BarChart3'    },
  { id: 'midi-performance', label: 'MIDI Performance', icon: 'Network'      },
  { id: 'routing',        label: 'MIDI Routing',     icon: 'Cable'        },
  { id: 'midilearn',      label: 'MIDI Mapping',     icon: 'Workflow'     },
  { id: 'midiactions',    label: 'MIDI Actions',     icon: 'Gamepad2'     },
  { id: 'midiports',      label: 'MIDI Ports',       icon: 'Zap'          },
  { id: 'liveset',        label: 'Live Set',         icon: 'Zap'          },
  { id: 'favorites',      label: 'Favorites',        icon: 'Heart'        },
  { id: 'profile',        label: 'User Profile',     icon: 'User'         },
  { id: 'help',           label: 'Help',             icon: 'HelpCircle'   },
  { id: 'support',        label: 'Support',          icon: 'Mail'         },
  { id: 'manual',         label: 'User Manual',      icon: 'BookOpen'     },
  { id: 'portal',         label: 'Portal',           icon: 'BookOpen'     },
  { id: 'panic',          label: 'PANIC',            icon: 'AlertTriangle'},
  { id: 'midi_matrix',    label: 'MIDI Matrix',      icon: 'Network'      },
  { id: 'midilogger',      label: 'MIDI Logger',           icon: 'GitCompareArrows' },
  { id: 'program-change', label: 'Program Change Browser', icon: 'Music2'           },
  { id: 'midi-manager',   label: 'MIDI Manager',          icon: 'Cpu'              },
  { id: 'live-timeline',        label: 'Live Timeline',         icon: 'Clock'      },
  { id: 'sound-engine',         label: 'Sound Engine',          icon: 'Captions'        },
  { id: 'tracks-player',        label: 'Tracks Player',         icon: 'Music'      },
  { id: 'chord-prog',           label: 'Chord Progression',     icon: 'AudioLines' },
  { id: 'live-performance-pad', label: 'Live Performance',      icon: 'Layers'     },
  { id: 'device-program-change',label: 'Device Program Change', icon: 'Disc3'      },
]

// ─── Computed ─────────────────────────────────────────────────────────────────

const filteredControllers = computed(() =>
  controllers.value.filter(c =>
    c.name?.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
    c.cc?.toString().includes(searchQuery.value)
  )
)

const activeToolbarButtons = computed(() =>
  toolbarButtons.value.filter(b => b.enabled !== false)
)

const addableButtons = computed(() => {
  const activeIds = new Set(activeToolbarButtons.value.map(b => b.id))
  return KNOWN_TOOLBAR_FUNCTIONS.filter(f => !activeIds.has(f.id))
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toggleSection(id) {
  const next = new Set(openSections.value)
  next.has(id) ? next.delete(id) : next.add(id)
  openSections.value = next
}

function getIconComponent(name) {
  return lucideIcons[name] || LayoutGrid
}

// ─── Load ─────────────────────────────────────────────────────────────────────

async function loadConfigData() {
  isLoading.value = true
  error.value = null
  try {
    // Load from IDB directly (matches React source)
    const [midiDoc, catDoc, bgDoc, settingsDoc, rolesDoc, stDoc] = await Promise.all([
      getDoc(doc(db, 'system', 'midi_config')),
      getDoc(doc(db, 'system', 'categories_config')),
      getDoc(doc(db, 'system', 'sound_type_bg')),
      getDoc(doc(db, 'system', 'app_settings')),
      getDoc(doc(db, 'system', 'roles_config')),
      getDoc(doc(db, 'system', 'sound_types_config')),
    ])

    // Controllers
    if (midiDoc.exists()) {
      controllers.value = (midiDoc.data().controllers || []).filter(c =>
        c.name !== 'reverbTime' && c.name !== 'drawMulti'
      )
    }

    // Categories (CC groups — not roles)
    categories.value = catDoc.exists() ? (catDoc.data().list || []) : DEFAULT_CATEGORIES

    // Sound type backgrounds
    soundTypeBg.value = bgDoc.exists() ? (bgDoc.data() || {}) : {}

    // App settings
    if (settingsDoc.exists()) {
      const s = settingsDoc.data()
      appVersion.value      = s.version || s.appVersion || 'v. 0.0.1'
      appEngine.value       = s.engine  || s.appEngine  || 'AGAS - 01'
      appOsTarget.value     = s.osTarget || ''
      appName.value         = s.appName || 'SY.CORE'
      appSubtitle.value     = s.appSubtitle || ''
      toolbarIconSize.value = s.toolbarIconSize ?? 6
      if (s.toolbar) toolbarButtons.value = JSON.parse(JSON.stringify(s.toolbar))
    }

    // Roles config
    if (rolesDoc.exists()) {
      const r = rolesDoc.data()
      rolesConfig.value = {
        demo:     { ...rolesConfig.value.demo,     ...(r.demo     || {}), features: { ...rolesConfig.value.demo.features,     ...(r.demo?.features     || {}) } },
        basic:    { ...rolesConfig.value.basic,    ...(r.basic    || {}), features: { ...rolesConfig.value.basic.features,    ...(r.basic?.features    || {}) } },
        producer: { ...rolesConfig.value.producer, ...(r.producer || {}), features: { ...rolesConfig.value.producer.features, ...(r.producer?.features || {}) } },
      }
    }

    // Sound types
    if (stDoc.exists()) {
      appSoundTypes.value = stDoc.data().list || []
    }
  } catch (err) {
    console.error('Failed to load admin config', err)
    error.value = 'Failed to load configuration'
  } finally {
    isLoading.value = false
  }
}

// ─── Save ─────────────────────────────────────────────────────────────────────

async function handleSaveConfig() {
  if (!authStore.isAdmin) return
  isSaving.value = true
  error.value = null
  try {
    await Promise.all([
      setDoc(doc(db, 'system', 'midi_config'), {
        controllers: controllers.value,
        updatedAt: serverTimestamp(),
      }),
      setDoc(doc(db, 'system', 'categories_config'), {
        list: categories.value,
        updatedAt: serverTimestamp(),
      }),
      setDoc(doc(db, 'system', 'sound_types_config'), {
        list: appSoundTypes.value,
        updatedAt: serverTimestamp(),
      }),
      setDoc(doc(db, 'system', 'sound_type_bg'), {
        ...soundTypeBg.value,
        updatedAt: serverTimestamp(),
      }),
      setDoc(doc(db, 'system', 'app_settings'), {
        version: appVersion.value,
        appVersion: appVersion.value,
        engine: appEngine.value,
        appEngine: appEngine.value,
        osTarget: appOsTarget.value,
        appName: appName.value,
        appSubtitle: appSubtitle.value,
        toolbarIconSize: toolbarIconSize.value,
        toolbar: toolbarButtons.value,
        updatedAt: serverTimestamp(),
      }),
      setDoc(doc(db, 'system', 'roles_config'), {
        ...rolesConfig.value,
        updatedAt: serverTimestamp(),
      }),
    ])
    await configStore.init()
    editingId.value = null
    editingOptionsId.value = null
  } catch (err) {
    console.error('Failed to save config', err)
    error.value = 'Failed to save configuration'
  } finally {
    isSaving.value = false
  }
}

function handleLoadDefaults() {
  if (!confirm('Load default controller mappings? This will replace unsaved changes.')) return
  controllers.value = [
    { id:'d_3',  cc:3,  name:'lfoRate',   label:'LFO Rate',    category:'LFO',        type:'SLIDER_H', min:0, max:30,  order:1 },
    { id:'d_12', cc:12, name:'lfoWave',   label:'LFO Wave',    category:'LFO',        type:'MULTI',    min:0, max:5,   order:2, options:[{label:'SAW',value:0},{label:'SAW REV',value:1},{label:'SIN',value:2},{label:'PUL',value:3},{label:'RND',value:4},{label:'NOI',value:5}] },
    { id:'d_13', cc:13, name:'oscLFO',    label:'OSC LFO',     category:'LFO',        type:'SLIDER_H', min:0, max:127, order:3 },
    { id:'d_15', cc:15, name:'pwWidth',   label:'Pulse Width', category:'OSCILLATOR', type:'SLIDER_H', min:0, max:127, order:1 },
    { id:'d_16', cc:16, name:'pwmSrc',    label:'PWM Source',  category:'OSCILLATOR', type:'SLIDER_H', min:0, max:127, order:2 },
    { id:'d_17', cc:17, name:'lfoMod',    label:'LFO Mod',     category:'LFO',        type:'SLIDER_H', min:0, max:127, order:4 },
    { id:'d_19', cc:19, name:'oscSq',     label:'Square',      category:'OSCILLATOR', type:'SLIDER_H', min:0, max:127, order:3 },
    { id:'d_20', cc:20, name:'oscSaw',    label:'Sawtooth',    category:'OSCILLATOR', type:'SLIDER_H', min:0, max:127, order:4 },
    { id:'d_21', cc:21, name:'oscSub',    label:'Sub OSC',     category:'OSCILLATOR', type:'SLIDER_H', min:0, max:127, order:5 },
    { id:'d_23', cc:23, name:'oscNoise',  label:'Noise',       category:'OSCILLATOR', type:'SLIDER_H', min:0, max:127, order:6 },
    { id:'d_24', cc:24, name:'envFilt',   label:'ENV Filter',  category:'FILTER',     type:'SLIDER_H', min:0, max:127, order:3 },
    { id:'d_25', cc:25, name:'lfoFilt',   label:'LFO Filter',  category:'FILTER',     type:'SLIDER_H', min:0, max:127, order:4 },
    { id:'d_30', cc:30, name:'sustain',   label:'Sustain',     category:'ENV',        type:'SLIDER_H', min:0, max:127, order:3 },
    { id:'d_71', cc:71, name:'res',       label:'Resonance',   category:'FILTER',     type:'SLIDER_H', min:0, max:127, order:2 },
    { id:'d_72', cc:72, name:'release',   label:'Release',     category:'ENV',        type:'SLIDER_H', min:0, max:127, order:4 },
    { id:'d_73', cc:73, name:'attack',    label:'Attack',      category:'ENV',        type:'SLIDER_H', min:0, max:127, order:1 },
    { id:'d_74', cc:74, name:'cutoff',    label:'Cutoff',      category:'FILTER',     type:'SLIDER_H', min:0, max:127, order:1 },
    { id:'d_75', cc:75, name:'decay',     label:'Decay',       category:'ENV',        type:'SLIDER_H', min:0, max:127, order:2 },
    { id:'d_91', cc:91, name:'reverb',    label:'Reverb',      category:'EFX',        type:'SLIDER_H', min:0, max:127, order:1 },
    { id:'d_90', cc:90, name:'delayTime', label:'Delay Time',  category:'EFX',        type:'SLIDER_H', min:0, max:127, order:2 },
    { id:'d_92', cc:92, name:'delayLvl',  label:'Delay Level', category:'EFX',        type:'SLIDER_H', min:0, max:127, order:3 },
    { id:'d_105',cc:105,name:'btnKeyTrig',label:'Key Trigger', category:'ADVANCED',   type:'SWITCH',   min:0, max:1,   order:1 },
    { id:'d_106',cc:106,name:'btnSync',   label:'MIDI Sync',   category:'ADVANCED',   type:'SWITCH',   min:0, max:1,   order:2 },
  ]
}

function handleExportConfig() {
  const settings = {
    appVersion: appVersion.value, appEngine: appEngine.value, appOsTarget: appOsTarget.value,
    toolbarIconSize: toolbarIconSize.value, appName: appName.value, appSubtitle: appSubtitle.value,
    toolbar: toolbarButtons.value,
    syncMidiTransportFromLivePad: configStore.syncMidiTransportFromLivePad,
    enablePartSelector: configStore.enablePartSelector,
  }
  const data = [
    { key: 'app_settings',     value: settings },
    { key: 'categories_config', value: { list: categories.value } },
    { key: 'midi_config',       value: { controllers: controllers.value } },
    { key: 'roles_config',      value: { ...rolesConfig.value } },
    { key: 'sound_type_bg',     value: { ...soundTypeBg.value } },
    { key: 'sound_types_config',value: { list: appSoundTypes.value } },
  ]
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `system_config_${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Categories ───────────────────────────────────────────────────────────────

function handleAddCategory() {
  if (!newCategory.value.name) return
  const id = newCategory.value.name.toUpperCase().replace(/\s+/g, '_')
  const entry = { id, name: newCategory.value.name, color: newCategory.value.color || '#00ffcc', order: newCategory.value.order || categories.value.length + 1 }
  categories.value = [...categories.value, entry].sort((a, b) => a.order - b.order)
  newCategory.value = { name: '', color: '#00ffcc', order: categories.value.length + 1 }
}

function updateCategory(id, updates) {
  categories.value = categories.value.map(c => c.id === id ? { ...c, ...updates } : c).sort((a, b) => a.order - b.order)
}

function removeCategory(id) {
  if (confirm(`Remove category ${id}?`)) categories.value = categories.value.filter(c => c.id !== id)
}

// ─── Sound types ──────────────────────────────────────────────────────────────

function handleAddSoundType() {
  if (!newSoundType.value.id) return
  const id = newSoundType.value.id.toLowerCase().replace(/\s+/g, '_')
  if (!appSoundTypes.value.find(t => t.id === id)) {
    appSoundTypes.value = [...appSoundTypes.value, { id, label: newSoundType.value.label || id, enabled: newSoundType.value.enabled ?? true }]
  }
  newSoundType.value = { id: '', label: '', enabled: true }
}

function updateSoundType(id, updates) {
  appSoundTypes.value = appSoundTypes.value.map(t => t.id === id ? { ...t, ...updates } : t)
}

function removeSoundType(id) {
  if (confirm(`Remove sound type ${id}?`)) appSoundTypes.value = appSoundTypes.value.filter(t => t.id !== id)
}

// ─── Controllers ──────────────────────────────────────────────────────────────

function handleAddController() {
  if (!newController.value.name || !newController.value.label || newController.value.cc === undefined) return
  const id = `cc_${Date.now()}`
  const entry = {
    id, name: newController.value.name, label: newController.value.label,
    cc: newController.value.cc, category: newController.value.category || 'ADVANCED',
    type: newController.value.type || 'SLIDER_H', min: newController.value.min ?? 0,
    max: newController.value.max ?? 127,
    order: newController.value.order ?? (controllers.value.filter(c => c.category === newController.value.category).length + 1),
  }
  controllers.value = [...controllers.value, entry]
  newController.value = { category: 'ADVANCED', min: 0, max: 127, type: 'SLIDER_H' }
}

function updateController(id, updates) {
  controllers.value = controllers.value.map(c => c.id === id ? { ...c, ...updates } : c)
}

function removeController(id) {
  controllers.value = controllers.value.filter(c => c.id !== id)
}

// ─── Toolbar reorder / add / remove ──────────────────────────────────────────

function moveButton(activeIndex, dir) {
  const active = activeToolbarButtons.value
  const targetActive = activeIndex + dir
  if (targetActive < 0 || targetActive >= active.length) return
  const aId = active[activeIndex].id
  const bId = active[targetActive].id
  const next = [...toolbarButtons.value]
  const aReal = next.findIndex(b => b.id === aId)
  const bReal = next.findIndex(b => b.id === bId)
  ;[next[aReal], next[bReal]] = [next[bReal], next[aReal]]
  toolbarButtons.value = next
}

function removeButton(activeIndex) {
  const id = activeToolbarButtons.value[activeIndex]?.id
  if (!id) return
  toolbarButtons.value = toolbarButtons.value.map(b =>
    b.id === id ? { ...b, enabled: false } : b
  )
}

function addButton(fn) {
  const existing = toolbarButtons.value.find(b => b.id === fn.id)
  if (existing) {
    toolbarButtons.value = toolbarButtons.value.map(b =>
      b.id === fn.id ? { ...b, enabled: true } : b
    )
  } else {
    toolbarButtons.value = [...toolbarButtons.value, { id: fn.id, label: fn.label, icon: fn.icon, enabled: true, fab: 'main' }]
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(async () => {
  if (!authStore.isAdmin) return
  await loadConfigData()
})

watch(() => props.isOpen, (open) => {
  if (open && authStore.isAdmin && controllers.value.length === 0) loadConfigData()
})

watch(openSections, (sections) => {
  if (sections.has('push')) fetchSubscribers()
}, { deep: true })
</script>

<template>
  <Transition name="sy-drawer">
    <div
      v-if="isOpen && authStore.isAdmin"
      class="fixed inset-0 w-full max-w-full bg-neutral-950 border-l border-neutral-900 shadow-2xl z-[450] overflow-hidden flex flex-col"
    >
      <!-- Header -->
      <div class="p-6 border-b border-neutral-900 flex items-center justify-between bg-black/50 backdrop-blur-xl shrink-0">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-synth-neon/10 rounded-lg">
            <Settings class="w-5 h-5 text-synth-neon" />
          </div>
          <div>
            <h2 class="text-xl font-black uppercase tracking-tight">Admin Settings</h2>
            <p class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">MIDI Controller Mapping</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button @click="handleExportConfig" class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700 transition-colors text-xs font-bold tracking-widest uppercase">
            <Download class="w-4 h-4" /> Export
          </button>
          <button @click="emit('close')" class="p-2 hover:bg-neutral-900 rounded-lg text-neutral-500 hover:text-white transition-colors">
            <X class="w-6 h-6" />
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">

        <!-- Loading -->
        <div v-if="isLoading" class="h-40 flex items-center justify-center">
          <Loader2 class="w-8 h-8 text-synth-neon animate-spin" />
        </div>

        <template v-else>

          <!-- ── SYSTEM SETTINGS ── -->
          <div v-if="isSuperAdmin" class="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden">
            <button @click="toggleSection('system')" class="w-full flex items-center justify-between px-6 py-4 hover:bg-neutral-800/30 transition-colors">
              <span class="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2 text-neutral-400">
                <Settings class="w-4 h-4" /> System Settings
              </span>
              <ChevronDown :class="['w-4 h-4 text-neutral-600 transition-transform duration-200', openSections.has('system') ? 'rotate-180' : '']" />
            </button>
            <div v-if="openSections.has('system')" class="px-6 pb-6 border-t border-neutral-800/50 pt-5">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-[8px] font-mono text-neutral-500 uppercase mb-1.5 ml-1">Version</label>
                  <input v-model="appVersion" type="text" class="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs focus:border-synth-neon outline-none font-mono text-synth-neon" />
                </div>
                <div>
                  <label class="block text-[8px] font-mono text-neutral-500 uppercase mb-1.5 ml-1">Engine</label>
                  <input v-model="appEngine" type="text" class="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs focus:border-synth-neon outline-none font-mono text-synth-neon" />
                </div>
                <div>
                  <label class="block text-[8px] font-mono text-neutral-500 uppercase mb-1.5 ml-1">OS Target</label>
                  <input v-model="appOsTarget" type="text" class="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs focus:border-synth-neon outline-none font-mono text-synth-neon" />
                </div>
                <div>
                  <label class="block text-[8px] font-mono text-neutral-500 uppercase mb-1.5 ml-1">App Name</label>
                  <input v-model="appName" type="text" class="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs focus:border-synth-neon outline-none font-mono text-synth-neon" />
                </div>
                <div class="md:col-span-2">
                  <label class="block text-[8px] font-mono text-neutral-500 uppercase mb-1.5 ml-1">Subtitle</label>
                  <input v-model="appSubtitle" type="text" class="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs focus:border-synth-neon outline-none font-mono text-synth-neon" />
                </div>
              </div>
            </div>
          </div>

          <!-- ── ROLES CONFIG ── -->
          <div v-if="isSuperAdmin" class="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden">
            <button @click="toggleSection('roles')" class="w-full flex items-center justify-between px-6 py-4 hover:bg-neutral-800/30 transition-colors">
              <span class="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2 text-neutral-400">
                <Database class="w-4 h-4" /> Roles Configuration
              </span>
              <ChevronDown :class="['w-4 h-4 text-neutral-600 transition-transform duration-200', openSections.has('roles') ? 'rotate-180' : '']" />
            </button>
            <div v-if="openSections.has('roles')" class="px-6 pb-6 border-t border-neutral-800/50 pt-5 space-y-6">
              <div
                v-for="role in ['demo','basic','producer']"
                :key="role"
                class="bg-black/40 border border-neutral-800 rounded-xl p-4"
              >
                <h4 class="text-xs font-black uppercase tracking-widest text-synth-neon mb-4">{{ role }}</h4>
                <div class="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label class="block text-[8px] font-mono text-neutral-500 uppercase mb-1">Slots</label>
                    <input
                      :value="rolesConfig[role].slots"
                      @input="e => rolesConfig[role] = { ...rolesConfig[role], slots: parseInt(e.target.value) || 0 }"
                      type="number" min="0"
                      class="w-full bg-black border border-neutral-800 rounded px-3 py-1.5 text-xs text-white focus:border-synth-neon outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label class="block text-[8px] font-mono text-neutral-500 uppercase mb-1">Gens / Day</label>
                    <input
                      :value="rolesConfig[role].gens"
                      @input="e => rolesConfig[role] = { ...rolesConfig[role], gens: parseInt(e.target.value) || 0 }"
                      type="number" min="0"
                      class="w-full bg-black border border-neutral-800 rounded px-3 py-1.5 text-xs text-white focus:border-synth-neon outline-none font-mono"
                    />
                  </div>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <label
                    v-for="feat in FEATURE_KEYS"
                    :key="feat"
                    class="flex items-center gap-2 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      :checked="rolesConfig[role].features?.[feat] ?? false"
                      @change="e => rolesConfig[role] = { ...rolesConfig[role], features: { ...rolesConfig[role].features, [feat]: e.target.checked } }"
                      class="accent-synth-neon w-3 h-3"
                    />
                    <span class="text-[9px] font-mono text-neutral-400 group-hover:text-white transition-colors uppercase tracking-wider">{{ feat }}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- ── SOUND TYPES ── -->
          <div v-if="isSuperAdmin" class="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden">
            <button @click="toggleSection('soundtypes')" class="w-full flex items-center justify-between px-6 py-4 hover:bg-neutral-800/30 transition-colors">
              <span class="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2 text-neutral-400">
                <Palette class="w-4 h-4" /> Sound Types Configuration
              </span>
              <ChevronDown :class="['w-4 h-4 text-neutral-600 transition-transform duration-200', openSections.has('soundtypes') ? 'rotate-180' : '']" />
            </button>
            <div v-if="openSections.has('soundtypes')" class="px-6 pb-6 border-t border-neutral-800/50 pt-5 space-y-5">
              <!-- Add row -->
              <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                  <label class="block text-[8px] font-mono text-neutral-500 uppercase mb-1.5 ml-1">Sound Type ID</label>
                  <input v-model="newSoundType.id" type="text" placeholder="e.g. pad" class="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs outline-none focus:border-synth-neon" />
                </div>
                <div>
                  <label class="block text-[8px] font-mono text-neutral-500 uppercase mb-1.5 ml-1">Label</label>
                  <input v-model="newSoundType.label" type="text" placeholder="e.g. PAD" class="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs outline-none focus:border-synth-neon" />
                </div>
                <div class="flex items-center gap-2 mb-2">
                  <input v-model="newSoundType.enabled" type="checkbox" class="w-4 h-4 accent-synth-neon" />
                  <label class="text-xs font-mono text-neutral-300">Enabled</label>
                </div>
                <button @click="handleAddSoundType" class="bg-synth-neon/10 border border-synth-neon/20 hover:bg-synth-neon/20 text-synth-neon text-[10px] font-black uppercase py-2 px-4 rounded-lg transition-all">
                  Add Sound Type
                </button>
              </div>
              <!-- List -->
              <div class="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                <div
                  v-for="(st, idx) in appSoundTypes" :key="`${st.id}-${idx}`"
                  class="flex flex-col gap-1.5 bg-black/60 border border-neutral-800/50 rounded-lg p-3"
                >
                  <div class="flex items-center gap-4">
                    <div class="flex-1 grid grid-cols-2 gap-4">
                      <input :value="st.id" disabled class="bg-transparent border-none text-xs font-mono text-neutral-500 outline-none uppercase" />
                      <input
                        :value="st.label || ''"
                        @input="e => updateSoundType(st.id, { label: e.target.value })"
                        placeholder="Display Label"
                        class="bg-transparent border-none text-xs font-bold text-white outline-none uppercase"
                      />
                    </div>
                    <div class="flex items-center gap-3 shrink-0">
                      <label class="flex items-center gap-2 text-[10px] font-mono text-neutral-400 cursor-pointer">
                        <input type="checkbox" :checked="st.enabled" @change="e => updateSoundType(st.id, { enabled: e.target.checked })" class="w-3 h-3 accent-synth-neon" />
                        {{ st.enabled ? 'ON' : 'OFF' }}
                      </label>
                      <button @click="removeSoundType(st.id)" class="text-neutral-700 hover:text-red-500 transition-colors">
                        <Trash2 class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <!-- Background URL -->
                  <input
                    :value="soundTypeBg[st.id] || ''"
                    @input="e => soundTypeBg = { ...soundTypeBg, [st.id]: e.target.value }"
                    placeholder="Background image URL…"
                    class="bg-black/50 border border-neutral-800 text-[10px] text-neutral-400 rounded px-3 py-1.5 w-full focus:outline-none focus:border-synth-neon transition-colors font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- ── CATEGORIES ── -->
          <div v-if="isSuperAdmin" class="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden">
            <button @click="toggleSection('categories')" class="w-full flex items-center justify-between px-6 py-4 hover:bg-neutral-800/30 transition-colors">
              <span class="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2 text-neutral-400">
                <Settings2 class="w-4 h-4" /> Controllers Category Definition
              </span>
              <ChevronDown :class="['w-4 h-4 text-neutral-600 transition-transform duration-200', openSections.has('categories') ? 'rotate-180' : '']" />
            </button>
            <div v-if="openSections.has('categories')" class="px-6 pb-6 border-t border-neutral-800/50 pt-5 space-y-5">
              <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                  <label class="block text-[8px] font-mono text-neutral-500 uppercase mb-1.5 ml-1">Name</label>
                  <input v-model="newCategory.name" type="text" placeholder="e.g. FILTER" class="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs outline-none focus:border-synth-neon" />
                </div>
                <div>
                  <label class="block text-[8px] font-mono text-neutral-500 uppercase mb-1.5 ml-1">Color</label>
                  <div class="flex items-center gap-2">
                    <input v-model="newCategory.color" type="color" class="w-10 h-8 bg-transparent border-none p-0 cursor-pointer" />
                    <span class="text-[10px] font-mono text-neutral-500">{{ newCategory.color }}</span>
                  </div>
                </div>
                <div>
                  <label class="block text-[8px] font-mono text-neutral-500 uppercase mb-1.5 ml-1">Order</label>
                  <input v-model.number="newCategory.order" type="number" class="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs outline-none focus:border-synth-neon" />
                </div>
                <button @click="handleAddCategory" class="bg-synth-neon/10 border border-synth-neon/20 hover:bg-synth-neon/20 text-synth-neon text-[10px] font-black uppercase py-2 px-4 rounded-lg transition-all">
                  Add Cat
                </button>
              </div>
              <div class="space-y-2">
                <div v-for="(cat, idx) in categories" :key="`${cat.id}-${idx}`" class="flex items-center gap-4 bg-black/60 border border-neutral-800/50 rounded-lg p-3">
                  <div class="flex flex-col gap-1 w-12">
                    <span class="text-[7px] text-neutral-500 uppercase font-mono">Order</span>
                    <input :value="cat.order" @input="e => updateCategory(cat.id, { order: parseInt(e.target.value) })" type="number" class="w-full bg-black border border-neutral-800 rounded px-1 py-0.5 text-white text-xs outline-none" />
                  </div>
                  <input :value="cat.name" @input="e => updateCategory(cat.id, { name: e.target.value })" class="bg-transparent border-none text-xs font-bold text-white focus:outline-none flex-1" />
                  <input :value="cat.color" @input="e => updateCategory(cat.id, { color: e.target.value })" type="color" class="w-6 h-6 bg-transparent border-none p-0 cursor-pointer" />
                  <button @click="removeCategory(cat.id)" class="text-neutral-700 hover:text-red-500 transition-colors">
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- ── ADD CONTROLLER ── -->
          <div class="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden">
            <button @click="toggleSection('addcontroller')" class="w-full flex items-center justify-between px-6 py-4 hover:bg-neutral-800/30 transition-colors">
              <span class="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2 text-neutral-400">
                <Plus class="w-4 h-4" /> Add New Controller
              </span>
              <ChevronDown :class="['w-4 h-4 text-neutral-600 transition-transform duration-200', openSections.has('addcontroller') ? 'rotate-180' : '']" />
            </button>
            <div v-if="openSections.has('addcontroller')" class="px-6 pb-6 border-t border-neutral-800/50 pt-5">
              <div class="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div class="md:col-span-2">
                  <label class="block text-[8px] font-mono text-neutral-500 uppercase mb-1.5">Label</label>
                  <input v-model="newController.label" type="text" placeholder="Cutoff Frequency" class="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs outline-none focus:border-synth-neon" />
                </div>
                <div class="md:col-span-2">
                  <label class="block text-[8px] font-mono text-neutral-500 uppercase mb-1.5">Key (name)</label>
                  <input v-model="newController.name" type="text" placeholder="cutoff" class="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs outline-none focus:border-synth-neon" />
                </div>
                <div>
                  <label class="block text-[8px] font-mono text-neutral-500 uppercase mb-1.5">CC</label>
                  <input v-model.number="newController.cc" type="number" placeholder="74" class="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs outline-none focus:border-synth-neon" />
                </div>
                <div>
                  <label class="block text-[8px] font-mono text-neutral-500 uppercase mb-1.5">Order</label>
                  <input v-model.number="newController.order" type="number" placeholder="1" class="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs outline-none focus:border-synth-neon" />
                </div>
                <div>
                  <label class="block text-[8px] font-mono text-neutral-500 uppercase mb-1.5">Min</label>
                  <input v-model.number="newController.min" type="number" class="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs outline-none focus:border-synth-neon" />
                </div>
                <div>
                  <label class="block text-[8px] font-mono text-neutral-500 uppercase mb-1.5">Max</label>
                  <input v-model.number="newController.max" type="number" class="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs outline-none focus:border-synth-neon" />
                </div>
                <div class="md:col-span-3">
                  <label class="block text-[8px] font-mono text-neutral-500 uppercase mb-1.5">Category</label>
                  <select v-model="newController.category" class="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs outline-none focus:border-synth-neon uppercase">
                    <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
                  </select>
                </div>
                <div class="md:col-span-3">
                  <label class="block text-[8px] font-mono text-neutral-500 uppercase mb-1.5">Type</label>
                  <select v-model="newController.type" class="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs outline-none focus:border-synth-neon uppercase">
                    <option value="SLIDER_H">Slider Horizontal</option>
                    <option value="SLIDER_V">Slider Vertical</option>
                    <option value="SWITCH">Switch (0/1)</option>
                    <option value="MULTI">Multi Option</option>
                  </select>
                </div>
              </div>
              <button
                @click="handleAddController"
                :disabled="!newController.name || !newController.label || newController.cc === undefined"
                class="mt-4 w-full bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white font-black uppercase text-[10px] py-2 rounded-lg transition-all"
              >
                Register Controller
              </button>
            </div>
          </div>

          <!-- ── CONTROLLERS MAPPING ── -->
          <div class="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden">
            <div class="flex items-center justify-between pr-4">
              <button @click="toggleSection('mapping')" class="flex-1 flex items-center justify-between px-6 py-4 hover:bg-neutral-800/30 transition-colors text-left">
                <span class="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2 text-neutral-400">
                  <Database class="w-4 h-4" /> Controllers Mapping
                </span>
                <ChevronDown :class="['w-4 h-4 text-neutral-600 transition-transform duration-200', openSections.has('mapping') ? 'rotate-180' : '']" />
              </button>
              <div v-if="openSections.has('mapping')" class="relative shrink-0">
                <Search class="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" />
                <input v-model="searchQuery" type="text" placeholder="Search CC or Name…" class="bg-black border border-neutral-900 rounded-full pl-9 pr-4 py-1.5 text-[10px] focus:border-synth-neon/50 outline-none w-48 font-mono" />
              </div>
            </div>

            <div v-if="openSections.has('mapping')" class="px-6 pb-6 border-t border-neutral-800/50 pt-4 space-y-6">
              <div v-for="category in categories" :key="category.id">
                <!-- Category divider -->
                <div class="flex items-center gap-2 py-1 mb-2">
                  <div class="h-px flex-1 bg-neutral-900" />
                  <span class="text-[10px] font-black uppercase tracking-widest px-2" :style="{ color: category.color }">{{ category.name }}</span>
                  <div class="h-px flex-1 bg-neutral-900" />
                </div>

                <div v-if="filteredControllers.filter(c => c.category === category.id).length === 0" class="text-center py-3 border border-dashed border-neutral-900 rounded-xl">
                  <span class="text-[8px] font-mono text-neutral-700 uppercase tracking-widest">No controllers mapped</span>
                </div>

                <div class="space-y-2">
                  <div
                    v-for="ctrl in filteredControllers.filter(c => c.category === category.id)"
                    :key="ctrl.id"
                    class="bg-neutral-900/30 border border-neutral-800 rounded-xl p-3 flex flex-col group hover:border-synth-neon/30 transition-all"
                  >
                    <!-- Main row -->
                    <div class="flex items-center gap-4">
                      <!-- CC badge (Editable) -->
                      <div class="w-10 h-8 shrink-0 rounded-lg bg-black flex items-center justify-center font-mono text-[10px] font-bold text-synth-neon border border-neutral-800 focus-within:border-synth-neon/50 transition-colors">
                        <input 
                          v-if="editingId === ctrl.id"
                          :value="ctrl.cc" 
                          @input="e => updateController(ctrl.id, { cc: parseInt(e.target.value) || 0 })"
                          type="number"
                          class="w-full bg-transparent border-none text-center focus:outline-none text-synth-neon [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span v-else>{{ ctrl.cc }}</span>
                      </div>

                      <!-- Label / name (click to edit) -->
                      <div class="flex-1 max-w-[200px] min-w-0">
                        <div v-if="editingId === ctrl.id" class="space-y-1">
                          <input :value="ctrl.label" @input="e => updateController(ctrl.id, { label: e.target.value })" placeholder="Label" class="w-full bg-black border-b border-synth-neon text-xs focus:outline-none py-0.5" />
                          <input :value="ctrl.name" @input="e => updateController(ctrl.id, { name: e.target.value })" placeholder="key" class="w-full bg-black border-b border-neutral-800 text-[10px] font-mono focus:outline-none py-0.5 text-neutral-500" />
                        </div>
                        <div v-else class="cursor-pointer" @click="editingId = editingId === ctrl.id ? null : ctrl.id">
                          <span class="text-xs font-bold text-neutral-300 block truncate">{{ ctrl.label || ctrl.name }}</span>
                          <span class="text-[8px] font-mono text-neutral-600 uppercase block truncate">{{ ctrl.name }} · CC{{ ctrl.cc }}</span>
                        </div>
                      </div>

                      <!-- Order -->
                      <div class="flex flex-col gap-0.5 w-10 shrink-0">
                        <span class="text-[7px] text-neutral-500 uppercase font-mono">Order</span>
                        <input :value="ctrl.order ?? 0" @input="e => updateController(ctrl.id, { order: parseInt(e.target.value) })" type="number" class="w-full bg-black border border-neutral-800 rounded px-1 py-0.5 text-neutral-400 text-[10px] outline-none" />
                      </div>

                      <!-- Min / Max -->
                      <div class="flex items-center gap-2 text-[10px] font-mono shrink-0">
                        <div class="flex flex-col gap-0.5">
                          <span class="text-[7px] text-neutral-500 uppercase">Min</span>
                          <input :value="ctrl.min ?? 0" @input="e => updateController(ctrl.id, { min: parseInt(e.target.value) })" type="number" class="w-12 bg-black border border-neutral-800 rounded px-1 py-0.5 text-neutral-400 outline-none" />
                        </div>
                        <div class="flex flex-col gap-0.5">
                          <span class="text-[7px] text-neutral-500 uppercase">Max</span>
                          <input :value="ctrl.max ?? 127" @input="e => updateController(ctrl.id, { max: parseInt(e.target.value) })" type="number" class="w-12 bg-black border border-neutral-800 rounded px-1 py-0.5 text-neutral-400 outline-none" />
                        </div>
                      </div>

                      <!-- Hover controls -->
                      <div class="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <select
                          :value="ctrl.type ?? 'SLIDER_H'"
                          @change="e => updateController(ctrl.id, { type: e.target.value })"
                          class="bg-black border border-neutral-800 text-[8px] font-mono rounded px-1 py-0.5 outline-none text-neutral-500 hover:text-synth-neon"
                        >
                          <option value="SLIDER_H">H-SLDR</option>
                          <option value="SLIDER_V">V-SLDR</option>
                          <option value="SWITCH">SWITCH</option>
                          <option value="MULTI">MULTI</option>
                        </select>
                        <button
                          v-if="ctrl.type === 'MULTI'"
                          @click="editingOptionsId = editingOptionsId === ctrl.id ? null : ctrl.id; optionEdit = { label: '', value: ctrl.options?.length || 0 }"
                          :class="['p-1 px-1.5 border rounded text-[7px] font-black tracking-widest transition-all', editingOptionsId === ctrl.id ? 'bg-synth-neon text-black border-synth-neon' : 'bg-neutral-900 border-neutral-800 text-synth-neon hover:bg-synth-neon hover:text-black']"
                        >{{ editingOptionsId === ctrl.id ? 'CLOSE' : '+OPT' }}</button>
                        <select
                          :value="ctrl.category"
                          @change="e => updateController(ctrl.id, { category: e.target.value })"
                          class="bg-black border border-neutral-800 text-[8px] font-mono rounded px-1 py-0.5 outline-none text-neutral-500 hover:text-synth-neon"
                        >
                          <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
                        </select>
                        <button @click="removeController(ctrl.id)" class="p-1.5 text-neutral-600 hover:text-red-500 transition-colors">
                          <Trash2 class="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <!-- MULTI: options editor -->
                    <div v-if="ctrl.type === 'MULTI'" class="mt-2 pl-12">
                      <!-- Add option form -->
                      <div v-if="editingOptionsId === ctrl.id" class="flex items-end gap-2 bg-synth-neon/5 border border-synth-neon/20 p-2 rounded-lg mb-2">
                        <div class="flex flex-col gap-1">
                          <span class="text-[7px] text-neutral-500 uppercase font-mono">Label</span>
                          <input v-model="optionEdit.label" placeholder="Label" class="bg-black border border-neutral-800 rounded px-2 py-1 text-[10px] text-white focus:border-synth-neon outline-none w-24" />
                        </div>
                        <div class="flex flex-col gap-1">
                          <span class="text-[7px] text-neutral-500 uppercase font-mono">CC Value</span>
                          <input v-model.number="optionEdit.value" type="number" class="bg-black border border-neutral-800 rounded px-2 py-1 text-[10px] text-white focus:border-synth-neon outline-none w-16" />
                        </div>
                        <button
                          @click="() => { if (optionEdit.label) { updateController(ctrl.id, { options: [...(ctrl.options || []), { label: optionEdit.label, value: optionEdit.value }] }); optionEdit = { label: '', value: (optionEdit.value + 1) } } }"
                          class="p-2 bg-synth-neon text-black rounded-lg"
                        >
                          <Plus class="w-4 h-4" />
                        </button>
                      </div>
                      <!-- Options list -->
                      <div v-if="ctrl.options?.length" class="flex flex-wrap gap-1">
                        <div
                          v-for="(opt, oIdx) in ctrl.options" :key="oIdx"
                          class="flex items-center gap-1 bg-black/40 border border-neutral-900 rounded px-1.5 py-0.5 group/opt"
                        >
                          <span class="text-[7px] font-mono text-synth-neon">{{ opt.value }}:</span>
                          <span class="text-[7px] font-bold text-neutral-400 uppercase">{{ opt.label }}</span>
                          <button
                            @click="() => { const next = [...(ctrl.options || [])]; next.splice(oIdx, 1); updateController(ctrl.id, { options: next }) }"
                            class="opacity-0 group-hover/opt:opacity-100 text-red-500 hover:text-red-400 ml-0.5 transition-opacity"
                          >
                            <X class="w-2 h-2" />
                          </button>
                        </div>
                        <button @click="updateController(ctrl.id, { options: [] })" class="text-[7px] text-neutral-700 hover:text-red-500 underline">clear</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ── PUSH NOTIFICATIONS ── -->
          <div v-if="isSuperAdmin" class="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden">
            <button @click="toggleSection('push')" class="w-full flex items-center justify-between px-6 py-4 hover:bg-neutral-800/30 transition-colors">
              <span class="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2 text-neutral-400">
                <Bell class="w-4 h-4" /> Push Notifications
              </span>
              <ChevronDown :class="['w-4 h-4 text-neutral-600 transition-transform duration-200', openSections.has('push') ? 'rotate-180' : '']" />
            </button>
            <div v-if="openSections.has('push')" class="px-6 pb-6 border-t border-neutral-800/50 pt-5 space-y-4">
              <div class="flex items-center justify-between bg-black/40 border border-neutral-800 rounded-xl p-4">
                <div class="flex flex-col gap-1">
                  <span class="text-xs font-bold text-neutral-300">Browser Push</span>
                  <span class="text-[10px] font-mono text-neutral-500">
                    Status:
                    <span v-if="!isSupported" class="text-red-400">Not supported</span>
                    <span v-else-if="isSubscribed" class="text-synth-neon">Subscribed</span>
                    <span v-else-if="permissionState === 'denied'" class="text-red-400">Permission denied</span>
                    <span v-else class="text-yellow-400">Not subscribed</span>
                  </span>
                </div>
                <button
                  v-if="isSupported && !isSubscribed"
                  @click="subscribe"
                  class="bg-synth-neon/10 border border-synth-neon/20 hover:bg-synth-neon/20 text-synth-neon text-[10px] font-black uppercase py-2 px-4 rounded-lg transition-all"
                >
                  Subscribe
                </button>
                <button
                  v-if="isSubscribed"
                  @click="unsubscribe"
                  class="bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-[10px] font-black uppercase py-2 px-4 rounded-lg transition-all"
                >
                  Unsubscribe
                </button>
              </div>

              <div v-if="isSubscribed" class="bg-black/40 border border-neutral-800 rounded-xl p-4 space-y-3">
                <span class="text-xs font-bold text-neutral-300 block">Send Test Push</span>
                <div class="flex gap-3">
                  <input
                    v-model="pushTitle"
                    type="text"
                    placeholder="Notification title…"
                    class="flex-1 bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs focus:border-synth-neon outline-none"
                  />
                  <input
                    v-model="pushBody"
                    type="text"
                    placeholder="Notification body…"
                    class="flex-1 bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs focus:border-synth-neon outline-none"
                  />
                </div>
                <button
                  @click="sendPush({ title: pushTitle || 'SY.CORE', body: pushBody || 'Test notification from Admin Panel' })"
                  class="w-full bg-synth-neon/10 border border-synth-neon/20 hover:bg-synth-neon/20 text-synth-neon text-[10px] font-black uppercase py-2 px-4 rounded-lg transition-all"
                >
                  Send
                </button>
              </div>

              <!-- Subscribers list -->
              <div class="bg-black/40 border border-neutral-800 rounded-xl p-4 space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-bold text-neutral-300">Subscribers ({{ subscribers.length }})</span>
                  <div class="flex items-center gap-2">
                    <button
                      v-if="subscribers.length > 0"
                      @click="exportSubscribers"
                      class="text-[9px] font-mono text-neutral-500 hover:text-synth-neon uppercase tracking-wider transition-colors"
                    >
                      Export CSV
                    </button>
                    <button
                      @click="fetchSubscribers"
                      class="text-[9px] font-mono text-neutral-500 hover:text-synth-neon uppercase tracking-wider transition-colors"
                    >
                      Refresh
                    </button>
                  </div>
                </div>
                <div v-if="subscribers.length === 0" class="text-[10px] font-mono text-neutral-600 text-center py-4">
                  No subscribers yet
                </div>
                <div v-else class="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                  <div
                    v-for="sub in subscribers" :key="sub.hash"
                    class="flex items-center justify-between bg-neutral-900/50 border border-neutral-800/50 rounded-lg px-3 py-2"
                  >
                    <div class="flex flex-col min-w-0">
                      <span class="text-[11px] font-bold text-neutral-300 truncate">{{ sub.email }}</span>
                      <span class="text-[8px] font-mono text-neutral-600 truncate">{{ sub.subscribedAt ? new Date(sub.subscribedAt).toLocaleString() : '' }}</span>
                    </div>
                    <button
                      @click="removeSubscriber(sub.hash)"
                      class="text-neutral-700 hover:text-red-500 transition-colors shrink-0 ml-2"
                      title="Remove subscriber"
                    >
                      <X class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ── TOOLBAR CONFIG ── -->
          <div v-if="isSuperAdmin" class="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden">
            <button @click="toggleSection('toolbar')" class="w-full flex items-center justify-between px-6 py-4 hover:bg-neutral-800/30 transition-colors">
              <span class="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2 text-neutral-400">
                <LayoutGrid class="w-4 h-4" /> Toolbar Settings
              </span>
              <ChevronDown :class="['w-4 h-4 text-neutral-600 transition-transform duration-200', openSections.has('toolbar') ? 'rotate-180' : '']" />
            </button>
            <div v-if="openSections.has('toolbar')" class="px-6 pb-6 border-t border-neutral-800/50 pt-5 space-y-5">
              <p class="text-xs text-neutral-500 font-mono">
                Reorder active buttons with ↑ ↓. Remove to send back to the pick list.
              </p>

              <!-- Icon size -->
              <div class="flex items-center gap-4">
                <label class="text-xs text-neutral-400 font-mono whitespace-nowrap">Icon Size</label>
                <button @click="toolbarIconSize = 4" :class="['px-3 py-1 rounded text-xs font-mono transition-colors', toolbarIconSize === 4 ? 'bg-synth-neon text-black' : 'bg-neutral-800 text-neutral-400 hover:text-white']">normal (4)</button>
                <input v-model.number="toolbarIconSize" type="number" min="2" max="16" class="bg-black/50 border border-neutral-800 text-xs text-white rounded px-3 py-1 w-20 focus:outline-none focus:border-synth-neon font-mono" />
                <span class="text-[10px] text-neutral-500 font-mono">Tailwind units (1 = 0.25rem)</span>
              </div>

              <!-- Button list -->
              <div class="space-y-2">
                <div
                  v-for="(button, index) in activeToolbarButtons" :key="button.id"
                  class="flex items-center gap-3 bg-neutral-900/50 border border-neutral-800 p-2 rounded-lg"
                >
                  <!-- Up / Down -->
                  <div class="flex flex-col gap-0.5">
                    <button @click="moveButton(index, -1)" :disabled="index === 0" class="text-neutral-500 hover:text-white disabled:opacity-30 transition-colors">
                      <ChevronUp class="w-4 h-4" />
                    </button>
                    <button @click="moveButton(index, 1)" :disabled="index === activeToolbarButtons.length - 1" class="text-neutral-500 hover:text-white disabled:opacity-30 transition-colors">
                      <ChevronDown class="w-4 h-4" />
                    </button>
                  </div>

                  <!-- Icon preview -->
                  <div class="p-2 bg-neutral-800 rounded text-neutral-400 shrink-0">
                    <component :is="getIconComponent(button.icon)" class="w-4 h-4" />
                  </div>

                  <div class="flex-1 flex items-center gap-3">
                    <div class="flex-1">
                      <input
                        v-model="button.label"
                        class="bg-black/50 border border-neutral-800 text-xs text-white rounded px-3 py-1.5 w-full focus:outline-none focus:border-synth-neon"
                      />
                      <span class="text-[10px] text-neutral-600 font-mono ml-1">{{ button.id }}</span>
                    </div>
                    <select
                      v-model="button.icon"
                      class="bg-black/50 border border-neutral-800 text-xs text-neutral-400 rounded px-2 py-1 focus:outline-none focus:border-synth-neon w-32"
                    >
                      <option v-for="iconName in AVAILABLE_ICONS" :key="iconName" :value="iconName">{{ iconName }}</option>
                    </select>

                    <!-- FAB Target -->
                    <select
                      v-model="button.fab"
                      class="bg-black/50 border border-neutral-800 text-xs text-synth-neon rounded px-2 py-1 focus:outline-none focus:border-synth-neon w-24 font-mono font-bold"
                    >
                      <option value="main">MAIN</option>
                      <option value="settings">SETT</option>
                    </select>
                    <!-- Remove -->
                    <button
                      @click="removeButton(index)"
                      title="Remove from toolbar"
                      class="text-neutral-600 hover:text-red-400 transition-colors shrink-0"
                    >
                      <X class="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Add Function -->
              <div v-if="addableButtons.length > 0" class="flex items-center gap-2 pt-2 border-t border-neutral-800/60">
                <span class="text-[10px] font-mono text-neutral-500 shrink-0">Add function</span>
                <select
                  @change="e => { const fn = KNOWN_TOOLBAR_FUNCTIONS.find(f => f.id === e.target.value); if (fn) addButton(fn); e.target.value = '' }"
                  class="flex-1 bg-black border border-neutral-800 text-[10px] text-neutral-400 rounded px-2 py-1 focus:outline-none focus:border-synth-neon font-mono"
                >
                  <option value="">— pick a function —</option>
                  <option v-for="fn in addableButtons" :key="fn.id" :value="fn.id">
                    {{ fn.label }} ({{ fn.id }})
                  </option>
                </select>
              </div>
            </div>
          </div>

        </template>
      </div>

      <!-- ── FOOTER ── -->
      <div class="shrink-0 p-5 border-t border-neutral-900 bg-black/50 backdrop-blur-xl space-y-3">
        <div v-if="error" class="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-2 text-red-400 text-xs">
          <AlertCircle class="w-4 h-4 shrink-0" />
          <span>{{ error }}</span>
        </div>
        <div class="flex gap-3">
          <button
            @click="handleLoadDefaults"
            class="flex-1 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-400 font-bold uppercase py-3 rounded-xl text-[10px] tracking-widest transition-all"
          >
            Defaults
          </button>
          <button
            @click="emit('close')"
            class="flex-1 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 font-bold uppercase py-3 rounded-xl text-[10px] tracking-widest transition-all"
          >
            Discard
          </button>
          <button
            @click="handleSaveConfig"
            :disabled="isSaving"
            class="flex-[2] bg-synth-neon hover:bg-white text-black font-black uppercase py-3 rounded-xl text-[10px] tracking-widest transition-all flex items-center justify-center gap-2 shadow-xl shadow-synth-neon/10 active:scale-[0.98] disabled:opacity-60"
          >
            <Loader2 v-if="isSaving" class="w-4 h-4 animate-spin" />
            <template v-else>
              <Save class="w-4 h-4" />
              <span>Sync Configuration</span>
            </template>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
