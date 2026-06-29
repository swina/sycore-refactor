import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { useConfigStore } from './stores/useConfigStore'
import { useAuthStore } from './stores/useAuthStore'
import { useUiStore } from './stores/useUiStore'
import { runStartupMigrations } from './lib/idb'
import { dispatch } from '@/types/events'
import './assets/main.css'
import App from './App.vue'
import SynthApp from './views/SynthApp.vue'
import HomeView from './views/HomeView.vue'
import MainPage from './views/MainPage.vue'

// Bridge for internal service logs to reach the UI Logger Panel
window.SY_LOG = (msg) => {
  window.dispatchEvent(new CustomEvent('app-system-log', { detail: msg }));
};

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: MainPage },
    { path: '/workspace', component: SynthApp },
    { path: '/home', component: HomeView },
  ]
})

let initialNavDone = false
router.beforeEach((to, _from, next) => {
  if (!initialNavDone) {
    initialNavDone = true
    if (to.path !== '/') return next('/')
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

// Initialize critical stores asynchronously
console.log('[Main] Starting store initialization...')
configStore.init().then(() => {
  console.log('[Main] ConfigStore ready.')
  authStore.init()
  uiStore.isAppInitializing = false
}).catch(err => {
  console.error('[Main] Initialization failed', err)
  uiStore.isAppInitializing = false // Still clear the screen
})

console.log('[Main] Mounting app...')
app.use(router)
app.mount('#app')
console.log('[Main] App mounted.')