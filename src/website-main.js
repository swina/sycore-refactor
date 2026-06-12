import { createApp } from 'vue'
import './assets/main.css'
import WebsiteView from './views/WebsiteView.vue'

// Standalone marketing site — no Pinia, no router, no service worker.
createApp(WebsiteView).mount('#app')
