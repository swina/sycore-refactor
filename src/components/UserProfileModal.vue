<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Copy, Eye, EyeOff, Check, Bell } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/useAuthStore'
import { usePushNotifications } from '@/composables/usePushNotifications'
import ModalShell from '@/components/ui/ModalShell.vue'
import SyButton from '@/components/ui/SyButton.vue'

const emit = defineEmits(['close'])

const authStore = useAuthStore()
const router    = useRouter()
const copied = ref(false)

const { isSupported, isSubscribed, permissionState, subscribe, unsubscribe } = usePushNotifications()

const freesoundKey      = ref(authStore.profile?.freesoundApiKey || '')
const freesoundKeyVisible = ref(false)
const freesoundSaving   = ref(false)
const freesoundSaved    = ref(false)

async function saveFreesoundKey() {
  freesoundSaving.value = true
  try {
    await authStore.saveFreesoundApiKey(freesoundKey.value)
    freesoundSaved.value = true
    setTimeout(() => { freesoundSaved.value = false }, 2000)
  } finally {
    freesoundSaving.value = false
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function logout() {
  authStore.logout()
  emit('close')
  router.push('/')
}
</script>

<template>
  <ModalShell title="User Profile" z-class="z-[640]" @close="emit('close')">

    <div class="p-6 space-y-6">

      <div v-if="authStore.user" class="space-y-2">
        <div class="text-xs font-mono text-neutral-500 uppercase tracking-widest">Email</div>
        <div class="text-sm font-mono text-white break-all">{{ authStore.user.email }}</div>
      </div>

      <div v-if="authStore.profile" class="space-y-2">
        <div class="text-xs font-mono text-neutral-500 uppercase tracking-widest">Role</div>
        <div class="text-sm font-mono text-synth-neon uppercase font-bold">{{ authStore.profile.role }}</div>
      </div>

      <div v-if="authStore.user" class="border-t border-neutral-800 pt-4">
        <div class="text-xs font-mono text-neutral-500 uppercase tracking-widest mb-2">User ID</div>
        <div class="flex items-center gap-2">
          <code class="flex-1 text-[10px] font-mono text-neutral-400 bg-neutral-900 px-2 py-1 rounded overflow-hidden text-ellipsis">
            {{ authStore.user.uid }}
          </code>
          <button @click="copyToClipboard(authStore.user.uid)" class="p-2 text-neutral-400 hover:text-synth-neon transition-colors">
            <Copy class="w-4 h-4" />
          </button>
        </div>
        <p v-if="copied" class="text-[10px] text-synth-neon mt-1">Copied!</p>
      </div>

      <!-- Freesound API Key -->
      <div v-if="authStore.user" class="border-t border-neutral-800 pt-4 space-y-2">
        <div class="text-xs font-mono text-neutral-500 uppercase tracking-widest">Freesound API Key</div>
        <p class="text-[10px] font-mono text-neutral-600 leading-relaxed">
          Required to use the Freesound Browser. Get a free key at
          <span class="text-cyan-500">freesound.org/apiv2/apply</span>
        </p>
        <div class="flex items-center gap-2">
          <div class="relative flex-1">
            <input
              v-model="freesoundKey"
              :type="freesoundKeyVisible ? 'text' : 'password'"
              placeholder="Paste your API key…"
              class="w-full bg-black border border-neutral-800 rounded px-2 py-1.5 text-[11px] font-mono text-white placeholder-neutral-700 focus:border-cyan-500/60 outline-none pr-8"
            />
            <button
              @click="freesoundKeyVisible = !freesoundKeyVisible"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
            >
              <EyeOff v-if="freesoundKeyVisible" class="w-3.5 h-3.5" />
              <Eye v-else class="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            @click="saveFreesoundKey"
            :disabled="freesoundSaving"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-black uppercase tracking-widest hover:bg-cyan-500/20 transition-colors disabled:opacity-40"
          >
            <Check v-if="freesoundSaved" class="w-3 h-3" />
            {{ freesoundSaved ? 'Saved' : freesoundSaving ? '…' : 'Save' }}
          </button>
        </div>
        <p v-if="authStore.profile?.freesoundApiKey" class="text-[10px] font-mono text-emerald-500">
          API key configured
        </p>
      </div>

      <!-- Push Notifications -->
      <div v-if="authStore.user" class="border-t border-neutral-800 pt-4 space-y-2">
        <div class="text-xs font-mono text-neutral-500 uppercase tracking-widest flex items-center gap-1.5">
          <Bell class="w-3.5 h-3.5" /> Push Notifications
        </div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-[10px] font-mono">
            <span v-if="!isSupported" class="text-red-400">Not supported in this browser</span>
            <span v-else-if="isSubscribed" class="text-synth-neon">Subscribed</span>
            <span v-else-if="permissionState === 'denied'" class="text-red-400">Permission denied — allow it in your browser's site settings</span>
            <span v-else class="text-neutral-500">Not subscribed</span>
          </span>
          <button
            v-if="isSupported && !isSubscribed && permissionState !== 'denied'"
            @click="subscribe"
            class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded bg-synth-neon/10 border border-synth-neon/30 text-synth-neon text-[10px] font-black uppercase tracking-widest hover:bg-synth-neon/20 transition-colors"
          >
            Subscribe
          </button>
          <button
            v-if="isSubscribed"
            @click="unsubscribe"
            class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-colors"
          >
            Unsubscribe
          </button>
        </div>
      </div>

    </div>

    <template #footer>
      <div class="p-4 border-t border-neutral-900 bg-neutral-900/50">
        <SyButton variant="danger" size="lg" class="w-full" @click="logout">Logout</SyButton>
      </div>
    </template>

  </ModalShell>
</template>
