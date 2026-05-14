<script setup>
import { X, ExternalLink, Github, Globe, Cpu, User, Package, Code, Settings } from 'lucide-vue-next'
import { useConfigStore } from '@/stores/useConfigStore'
import { useUiStore } from '@/stores/useUiStore'
import { usePresetStore } from '@/stores/usePresetStore'

const configStore = useConfigStore()
const uiStore = useUiStore()
const presetStore = usePresetStore()

const emit = defineEmits(['close'])

const techStack = [
  { name: 'Vue 3', version: '^3.5.0', link: 'https://vuejs.org/', description: 'The Progressive JavaScript Framework.' },
  { name: 'Pinia', version: '^3.0.0', link: 'https://pinia.vuejs.org/', description: 'The intuitive store library for Vue.' },
  { name: 'Tone.js', version: '^15.1.0', link: 'https://tonejs.github.io/', description: 'Web Audio framework for interactive music.' },
  { name: 'WebMIDI.js', version: '^3.1.0', link: 'https://webmidijs.org/', description: 'Simplifying Web MIDI API interactions.' },
  { name: 'Tailwind CSS', version: '^4.0.0', link: 'https://tailwindcss.com/', description: 'A utility-first CSS framework.' },
  { name: 'Vite', version: '^8.0.0', link: 'https://vitejs.dev/', description: 'Next generation frontend tooling.' },
  { name: 'Lucide Icons', version: '^1.0.0', link: 'https://lucide.dev/', description: 'Beautiful & consistent icon toolkit.' },
  { name: 'Lamejs', version: '^1.2.0', link: 'https://github.com/zhuker/lamejs', description: 'Pure JavaScript MP3 encoder.' }
]

function close() {
  uiStore.isAboutOpen = false
}

function resetToWelcome() {
  presetStore.lastPreset = null
  presetStore.showResults = false
  localStorage.removeItem('sycore_last_session')
  close()
}
</script>

<template>
  <div class="fixed inset-0 z-[600] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm" @click.self="close">
    <div class="relative w-full max-w-2xl bg-neutral-900/90 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
      
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-neutral-800 bg-neutral-950/50">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-synth-neon/10 flex items-center justify-center border border-synth-neon/20">
            <Cpu class="w-6 h-6 text-synth-neon" />
          </div>
          <div>
            <h2 
              @click="resetToWelcome" 
              class="text-xl font-black uppercase tracking-tighter text-white cursor-pointer hover:text-synth-neon transition-colors"
              title="Reset to Welcome Screen"
            >
              About {{ configStore.appName }}
            </h2>
            <p class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">{{ configStore.appSubtitle }}</p>
          </div>
        </div>
        <button @click="close" class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors">
          <X class="w-6 h-6" />
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6 space-y-8">
        
        <!-- System Settings Section -->
        <section>
          <div class="flex items-center gap-2 mb-4">
            <Settings class="w-4 h-4 text-synth-neon" />
            <h3 class="text-xs font-bold uppercase tracking-widest text-neutral-400">Product Details</h3>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div v-for="(value, key) in configStore.appSettings" :key="key" 
                 class="flex flex-col p-3 rounded-lg bg-neutral-950/50 border border-neutral-800/50">
              <span class="text-[9px] font-mono text-neutral-600 uppercase">{{ key.replace(/([A-Z])/g, ' $1') }}</span>
              <span class="text-xs font-bold text-neutral-300">{{ value || 'N/A' }}</span>
            </div>
          </div>
        </section>

        <!-- Author Section -->
        <section>
          <div class="flex items-center gap-2 mb-4">
            <User class="w-4 h-4 text-synth-neon" />
            <h3 class="text-xs font-bold uppercase tracking-widest text-neutral-400">Author & Development</h3>
          </div>
          <div class="p-4 rounded-xl bg-gradient-to-br from-neutral-950 to-neutral-900 border border-neutral-800 flex items-center justify-between">
            <div>
              <h4 class="text-lg font-black text-white italic tracking-tight">SY.CORE Labs</h4>
              <p class="text-xs text-neutral-500">Professional Audio Software & AI Orchestration</p>
            </div>
            <div class="flex gap-2">
              <a href="#" class="w-8 h-8 flex items-center justify-center rounded-lg bg-neutral-800 text-neutral-400 hover:text-synth-neon transition-colors">
                <Globe class="w-4 h-4" />
              </a>
              <a href="#" class="w-8 h-8 flex items-center justify-center rounded-lg bg-neutral-800 text-neutral-400 hover:text-white transition-colors">
                <Github class="w-4 h-4" />
              </a>
            </div>
          </div>
        </section>

        <!-- Open Source References -->
        <section>
          <div class="flex items-center gap-2 mb-4">
            <Package class="w-4 h-4 text-synth-neon" />
            <h3 class="text-xs font-bold uppercase tracking-widest text-neutral-400">Open Source Stack</h3>
          </div>
          <div class="space-y-2">
            <div v-for="tech in techStack" :key="tech.name" 
                 class="group flex items-center justify-between p-3 rounded-lg bg-neutral-950/30 border border-neutral-800/30 hover:border-neutral-700/50 hover:bg-neutral-950/50 transition-all">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded bg-neutral-900 flex items-center justify-center border border-neutral-800">
                  <Code class="w-4 h-4 text-neutral-500 group-hover:text-synth-neon transition-colors" />
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-bold text-neutral-200">{{ tech.name }}</span>
                    <span class="text-[9px] font-mono text-neutral-600 bg-neutral-900 px-1.5 py-0.5 rounded">{{ tech.version }}</span>
                  </div>
                  <p class="text-[10px] text-neutral-500 leading-tight">{{ tech.description }}</p>
                </div>
              </div>
              <a :href="tech.link" target="_blank" class="p-2 text-neutral-600 hover:text-synth-neon transition-colors">
                <ExternalLink class="w-4 h-4" />
              </a>
            </div>
          </div>
        </section>

      </div>

      <!-- Footer -->
      <div class="p-4 bg-neutral-950 border-t border-neutral-800 text-center">
        <p class="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">
          SY.CORE &copy; 2026 Moodgiver Labs &middot; Made with Precision & Neural Magic
        </p>
      </div>

    </div>
  </div>
</template>

<style scoped>
.text-synth-neon {
  color: #00ffcc;
}
.bg-synth-neon {
  background-color: #00ffcc;
}
.border-synth-neon {
  border-color: #00ffcc;
}

/* Custom scrollbar */
::-webkit-scrollbar {
  width: 4px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #262626;
  border-radius: 10px;
}
::-webkit-scrollbar-thumb:hover {
  background: #404040;
}
</style>
