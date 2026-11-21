<template>
  <div class="relative" ref="root">
    <button
      class="flex items-center gap-1 px-2 py-1 rounded-full border text-[9px] font-black font-mono uppercase tracking-wider transition-colors"
      :class="isLive ? 'bg-amber-500/20 border-amber-400/60 text-amber-200' : 'bg-neutral-900/60 border-neutral-800/60 text-emerald-300'"
      :title="isLive ? `Live mode: ${liveNames || 'no controller'} belong to Ableton Live (SY.CORE ignores them, no LEDs). Click for settings` : 'Performance mode: every controller works with SY.CORE\'s mappings and LEDs. Click for settings'"
      @click="open = !open"
    >
      <SlidersHorizontal class="w-3 h-3 shrink-0" />
      {{ isLive ? 'Live' : 'Perf' }}
    </button>
    <Transition name="popup">
      <div v-if="open"
           class="absolute bottom-full left-0 mb-1 flex flex-col gap-2 bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-2 shadow-xl z-[1060] w-[260px] text-[10px] text-neutral-300">
        <span class="text-[8px] text-neutral-500 uppercase tracking-wider font-bold">Controllers · Live / Performance</span>

        <div class="flex gap-1">
          <button v-for="m in MODES" :key="m.id"
                  class="flex-1 px-2 py-1 rounded border font-bold uppercase"
                  :class="controllerMode === m.id ? m.on : 'border-white/15 text-neutral-400 hover:bg-white/10'"
                  @click="setControllerMode(m.id)">{{ m.label }}</button>
        </div>
        <p class="text-[9px] text-neutral-500 leading-snug">
          Live: the controllers ticked below are Live's Control Surface. SY.CORE ignores them and sends them no LEDs.
          Performance: they work with your mappings, with LEDs.
        </p>

        <div class="flex items-center gap-1">
          <span class="uppercase tracking-widest text-neutral-500 text-[8px] font-bold">Key</span>
          <button class="px-1.5 py-0.5 rounded border font-bold font-mono"
                  :class="learningProfileKey ? 'bg-amber-500 border-amber-300 text-black animate-pulse' : profileSettings.key ? 'border-emerald-400/50 text-emerald-300 hover:bg-white/10' : 'border-white/15 text-neutral-400 hover:bg-white/10'"
                  :title="profileSettings.key ? toggleLabel(profileSettings.key) + ' · click to learn again' : 'Click, then press a button on any controller'"
                  @click="toggleLearn">{{ learningProfileKey ? 'Press a button…' : keyLabel }}</button>
          <button v-if="profileSettings.key && !learningProfileKey" class="px-0.5 text-neutral-500 hover:text-white" title="Forget the key" @click="updateProfile({ key: null })">✕</button>
        </div>

        <label class="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" class="w-3 h-3 accent-amber-500" :checked="profileSettings.autoLive" @change="updateProfile({ autoLive: $event.target.checked })" />
          <span>Follow the clock: Live while an external clock (CLK SYS / Link) is followed</span>
        </label>

        <div class="flex flex-col gap-0.5">
          <span class="uppercase tracking-widest text-neutral-500 text-[8px] font-bold">Live's controllers</span>
          <label v-for="name in inputNames" :key="name" class="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" class="w-3 h-3 accent-amber-500" :checked="isLiveDevice(profileSettings, name)" @change="toggleLiveDevice(name, $event.target.checked, inputNames)" />
            <span class="font-mono truncate">{{ name }}</span>
          </label>
          <span v-if="!inputNames.length" class="text-neutral-500 italic">No MIDI input connected</span>
          <span v-if="profileSettings.liveDevices === null" class="text-[9px] text-neutral-500">Default: any MIDImix.</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { SlidersHorizontal } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { controllerMode, profileSettings, learningProfileKey, setControllerMode, updateProfile, toggleLiveDevice } from '@/core/midi/controller-profiles'
import { isLiveDevice } from '@/lib/controller-profile'
import { toggleLabel, toggleShortLabel } from '@/lib/rig-toggle'

const MODES = [
  { id: 'performance', label: 'Performance', on: 'bg-emerald-500/80 border-emerald-300 text-black' },
  { id: 'live', label: 'Live', on: 'bg-amber-500/80 border-amber-300 text-black' },
]

const midiStore = useMidiStore()
const open = ref(false)
const root = ref(null)

const isLive = computed(() => controllerMode.value === 'live')
const inputNames = computed(() => [...new Set(midiStore.inputs.map(i => i.name).filter(Boolean))])
const liveNames = computed(() => inputNames.value.filter(n => isLiveDevice(profileSettings.value, n)).join(', '))
const keyLabel = computed(() => profileSettings.value.key ? `${profileSettings.value.key.device} · ${toggleShortLabel(profileSettings.value.key)}` : 'Learn')

const toggleLearn = () => { learningProfileKey.value = !learningProfileKey.value }
const onDoc = e => { if (open.value && root.value && !root.value.contains(e.target)) { open.value = false; learningProfileKey.value = false } }
onMounted(() => document.addEventListener('pointerdown', onDoc))
onUnmounted(() => document.removeEventListener('pointerdown', onDoc))
</script>

<style scoped>
.popup-enter-active, .popup-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.popup-enter-from, .popup-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
