import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import './assets/main.css'
import App from './App.vue'
import SynthApp from './views/SynthApp.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', component: SynthApp }]
})

createApp(App).use(createPinia()).use(router).mount('#app')