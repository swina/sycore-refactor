import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { useConfigStore } from './stores/useConfigStore'
import { useAuthStore } from './stores/useAuthStore'
import { useUiStore } from './stores/useUiStore'
import { runStartupMigrations } from './lib/idb'
import { dispatch } from '@/types/events'
import { readStoredTheme, applyTheme } from '@/lib/theme'
import { IS_DEMO, seedDemoRouting } from '@/lib/demo'
import { useMidiStore } from './stores/useMidiStore'
import { MidiSource } from '@/types/midi'
import './assets/main.css'

// Applied synchronously, before any Vue/Pinia work, so the correct theme is
// set before first paint — avoids a flash of the wrong theme on load.
applyTheme(readStoredTheme())
import App from './App.vue'
import SynthApp from './views/SynthApp.vue'
import HomeView from './views/HomeView.vue'
import MainPageOptimized from './views/MainPageOptimized.vue'

// Bridge for internal service logs to reach the UI Logger Panel
window.SY_LOG = (msg) => {
  window.dispatchEvent(new CustomEvent('app-system-log', { detail: msg }));
};

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/workspace' },
    { path: '/new', component: MainPageOptimized },
    { path: '/workspace', component: SynthApp },
    { path: '/home', component: HomeView },
  ]
})

let initialNavDone = false
router.beforeEach((to, _from, next) => {
  if (!initialNavDone) {
    initialNavDone = true
    if (to.path !== '/' && to.path !== '/workspace') return next('/')
  }
  next()
})

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)

const configStore = useConfigStore(pinia)
const authStore = useAuthStore(pinia)
const uiStore = useUiStore(pinia)

// Run one-time DB migrations before store initialization
runStartupMigrations().catch(err => console.error('[Main] Migration failed', err))

// Panels open at startup: MIDI Flow (applies the routing), the Deck and the
// Chord Progression sequencer.
function openStartupPanels() {
  uiStore.isMidiFlowOpen = true
  uiStore.isInstrumentCockpitOpen = true
  uiStore.isChordProgOpen = true
  // demo build: Chord Progression → FM-1 Emulator (routing seeded on the first visit)
  if (IS_DEMO) {
    seedDemoRouting(useMidiStore(pinia), MidiSource.CHORD_PROG)
    uiStore.isFm1EmulatorOpen = true
  }
}

// Initialize critical stores asynchronously
console.log('[Main] Starting store initialization...')
configStore.init().then(() => {
  console.log('[Main] ConfigStore ready.')
  authStore.init()
  uiStore.isAppInitializing = false
  openStartupPanels()
}).catch(err => {
  console.error('[Main] Initialization failed', err)
  uiStore.isAppInitializing = false
  openStartupPanels()
})

console.log('[Main] Mounting app...')
app.use(router)
app.mount('#app')
console.log('[Main] App mounted.')