<script setup>
import { ref } from 'vue'
import { Copy } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/useAuthStore'
import ModalShell from '@/components/ui/ModalShell.vue'
import SyButton from '@/components/ui/SyButton.vue'

const emit = defineEmits(['close'])

const authStore = useAuthStore()
const copied = ref(false)

function copyToClipboard(text) {
  navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function logout() {
  authStore.logout()
  emit('close')
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

    </div>

    <template #footer>
      <div class="p-4 border-t border-neutral-900 bg-neutral-900/50">
        <SyButton variant="danger" size="lg" class="w-full" @click="logout">Logout</SyButton>
      </div>
    </template>

  </ModalShell>
</template>
