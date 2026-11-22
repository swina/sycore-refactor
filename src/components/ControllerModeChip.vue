<template>
  <div class="relative" ref="root">
    <button
      class="flex items-center gap-1 max-w-[140px] px-2 py-1 rounded-full border text-[9px] font-black font-mono uppercase tracking-wider transition-colors"
      :class="isLive ? 'bg-amber-500/20 border-amber-400/60 text-amber-200' : 'bg-neutral-900/60 border-neutral-800/60 text-emerald-300'"
      :title="set ? `Control set: ${set.name}${isLive ? ' · Live\'s: ' + liveNames : ''}. Click to switch` : 'No project'"
      @click="open = !open"
    >
      <SlidersHorizontal class="w-3 h-3 shrink-0" />
      <span class="truncate">{{ set?.name ?? 'Perf' }}</span>
    </button>
    <Transition name="popup">
      <div v-if="open && project"
           class="absolute bottom-full left-0 mb-1 flex flex-col gap-2 bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-2 shadow-xl z-[1060] w-[260px] text-[10px] text-neutral-300">
        <span class="text-[8px] text-neutral-500 uppercase tracking-wider font-bold">Control sets · {{ project.name }}</span>

        <div class="flex flex-col gap-0.5">
          <button v-for="s in project.control.sets" :key="s.id"
                  class="flex items-center justify-between gap-2 px-2 py-1 rounded border text-left"
                  :class="s.id === set?.id ? 'bg-violet-500/20 border-violet-400/60 text-white' : 'border-white/10 text-neutral-400 hover:bg-white/10'"
                  @click="switchSet(s.id)">
            <span class="font-bold truncate">{{ s.name }}</span>
            <span v-if="liveDevicesOf(s).length" class="shrink-0 text-[8px] px-1 rounded bg-amber-500/30 text-amber-200" :title="'Live\'s: ' + liveDevicesOf(s).join(', ')">LIVE</span>
          </button>
        </div>

        <p class="text-[9px] text-neutral-500 leading-snug">
          <template v-if="keySetNames">Key {{ keyLabel }}: {{ keySetNames }}.</template>
          <template v-else>No key set: choose it in Control.</template>
        </p>

        <button class="self-start flex items-center gap-1 px-2 py-1 rounded border border-violet-500/40 text-violet-300 text-[9px] font-black uppercase tracking-wider hover:bg-violet-500/15"
                @click="openControl">Open Control →</button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
// The footer chip: the current project's active control set (amber when it gives a controller to
// Live). Switch from it; sets, roles, the key: in MIDI Flow → Control.
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { SlidersHorizontal } from 'lucide-vue-next'
import { currentProject, currentSet, switchSet } from '@/core/projects'
import { liveDevicesOf } from '@/lib/projects'
import { profileSettings } from '@/core/midi/controller-profiles'
import { toggleShortLabel } from '@/lib/rig-toggle'
import { useUiStore } from '@/stores/useUiStore'

const uiStore = useUiStore()
const open = ref(false)
const root = ref(null)

const project = computed(() => currentProject.value)
const set = computed(() => currentSet.value)
const liveNames = computed(() => liveDevicesOf(set.value).join(', '))
const isLive = computed(() => liveDevicesOf(set.value).length > 0)
const keyLabel = computed(() => profileSettings.value.key ? `(${profileSettings.value.key.device} · ${toggleShortLabel(profileSettings.value.key)})` : '(not learned)')
const keySetNames = computed(() => {
  const ks = project.value?.control.keySets
  if (!ks) return ''
  const name = id => project.value.control.sets.find(s => s.id === id)?.name ?? '?'
  return `${name(ks[0])} ↔ ${name(ks[1])}`
})

function openControl() {
  uiStore.midiFlowTab = 'control'
  uiStore.isMidiFlowOpen = true
  open.value = false
}

const onDoc = e => { if (open.value && root.value && !root.value.contains(e.target)) open.value = false }
onMounted(() => document.addEventListener('pointerdown', onDoc))
onUnmounted(() => document.removeEventListener('pointerdown', onDoc))
</script>
