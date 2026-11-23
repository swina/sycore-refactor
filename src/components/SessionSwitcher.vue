<template>
  <!-- the footer's Session chip: opens the Session Browser (SessionBrowserPanel.vue) -->
  <button v-if="sessionsLoaded && current"
          class="flex items-center gap-1 max-w-[160px] px-2 py-1 rounded-full border text-[9px] font-black font-mono uppercase tracking-wider transition-colors"
          :class="pending ? 'bg-amber-500/15 border-amber-400/50 text-amber-200 animate-pulse' : ui.isSessionBrowserOpen ? 'bg-sky-500/25 border-sky-400/60 text-sky-100' : 'bg-sky-500/10 border-sky-500/40 text-sky-200 hover:bg-sky-500/20'"
          :title="pending ? `Session ${pendingName} loads at the next stop` : `Session: ${current.name} — click: the Session Browser (sessions, songs, the song open)`"
          @click="ui.togglePanel('session-browser')">
    <Disc3 class="w-3 h-3 shrink-0" />
    <span class="truncate">{{ pending ? `→ ${pendingName}` : current.name }}</span>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { Disc3 } from 'lucide-vue-next'
import { sessions, currentSession, sessionsLoaded, pendingSession } from '@/core/sessions'
import { useUiStore } from '@/stores/useUiStore'

const ui = useUiStore()
const current = computed(() => currentSession.value)
const pending = computed(() => pendingSession.value)
const pendingName = computed(() => sessions.value.find(s => s.id === pending.value?.sessionId)?.name ?? '')
</script>
