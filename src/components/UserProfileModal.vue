<script setup>
import { ref } from 'vue'
import { X, Copy, Eye, EyeOff } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/useAuthStore'

const emit = defineEmits(['close'])

const authStore = useAuthStore()
const copied = ref(false)
const showKey = ref(false)
const geminiKey = ref('')

function copyToClipboard(text) {
  navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function saveGeminiKey() {
  localStorage.setItem('GEMINI_KEY_STORAGE', geminiKey.value)
  showKey.value = false
}

function logout() {
  authStore.logout()
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 z-[180] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <Transition name="modal-card" appear>
      <div class="bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

        <!-- Header -->
        <div class="p-6 border-b border-neutral-900 flex justify-between items-center bg-neutral-900/50">
          <h2 class="text-lg font-black uppercase tracking-widest text-white">User Profile</h2>
          <button @click="emit('close')" class="p-1 text-neutral-400 hover:text-white transition-colors">
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Content -->
        <div class="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">

          <!-- User info -->
          <div v-if="authStore.user" class="space-y-2">
            <div class="text-xs font-mono text-neutral-500 uppercase tracking-widest">Email</div>
            <div class="text-sm font-mono text-white break-all">{{ authStore.user.email }}</div>
          </div>

          <div v-if="authStore.profile" class="space-y-2">
            <div class="text-xs font-mono text-neutral-500 uppercase tracking-widest">Role</div>
            <div class="text-sm font-mono text-synth-neon uppercase font-bold">{{ authStore.profile.role }}</div>
          </div>

          <!-- Gemini API Key -->
          <div class="border-t border-neutral-800 pt-4">
            <div class="flex justify-between items-center mb-3">
              <label class="text-xs font-mono text-neutral-500 uppercase tracking-widest">Gemini API Key</label>
              <button @click="showKey = !showKey" class="p-1 text-neutral-400 hover:text-white transition-colors">
                <component :is="showKey ? EyeOff : Eye" class="w-4 h-4" />
              </button>
            </div>
            <div v-if="!showKey" class="text-xs text-neutral-600 italic">
              ••••••••••••••••••
            </div>
            <div v-else class="space-y-2">
              <input
                v-model="geminiKey"
                type="password"
                placeholder="sk-..."
                class="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-synth-neon outline-none"
              />
              <button @click="saveGeminiKey"
                class="w-full px-3 py-2 bg-synth-neon text-black rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-white transition-colors"
              >Save Key</button>
            </div>
          </div>

          <!-- User ID -->
          <div v-if="authStore.user" class="border-t border-neutral-800 pt-4">
            <div class="text-xs font-mono text-neutral-500 uppercase tracking-widest mb-2">User ID</div>
            <div class="flex items-center gap-2">
              <code class="flex-1 text-[10px] font-mono text-neutral-400 bg-neutral-900 px-2 py-1 rounded overflow-hidden text-ellipsis">
                {{ authStore.user.uid }}
              </code>
              <button @click="copyToClipboard(authStore.user.uid)"
                class="p-2 text-neutral-400 hover:text-synth-neon transition-colors"
              >
                <Copy class="w-4 h-4" />
              </button>
            </div>
            <p v-if="copied" class="text-[10px] text-synth-neon mt-1">Copied!</p>
          </div>

        </div>

        <!-- Footer -->
        <div class="p-4 border-t border-neutral-900 bg-neutral-900/50">
          <button @click="logout"
            class="w-full px-4 py-3 bg-red-950/40 text-red-400 hover:bg-red-500 hover:text-white border border-red-900/50 rounded-lg font-black text-xs uppercase tracking-widest transition-all"
          >Logout</button>
        </div>

      </div>
    </Transition>
  </div>
</template>
