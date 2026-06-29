<script setup>
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useMidiStore } from '@/stores/useMidiStore'
import { useMappingStore } from '@/stores/useMappingStore'
import { midiService } from '@/core/midi/midi-service'
import { ChevronUp, ChevronDown, Layers, Radio, X, CheckCircle2 } from 'lucide-vue-next'
import { APP_ACTION_LABELS } from '@/lib/app-midi-actions'

const midiStore    = useMidiStore()
const mappingStore = useMappingStore()

const currentChannel = computed(() => midiStore.midiChannel)

function nextChannel() {
  const next = currentChannel.value >= 16 ? 1 : currentChannel.value + 1
  midiStore.setMidiChannel(next)
}

function prevChannel() {
  const prev = currentChannel.value <= 1 ? 16 : currentChannel.value - 1
  midiStore.setMidiChannel(prev)
}

function setChannel(ch) {
  midiStore.setMidiChannel(ch)
}

// ── Contextual MIDI Learn ─────────────────────────────────────────
const CHANNEL_ACTIONS = ['channel_up', 'channel_down', 'channel_cc']

const menuVisible    = ref(false)
const menuX          = ref(0)
const menuY          = ref(0)
const learningAction = ref(null)   // which action is being learned
const learnSuccess   = ref(null)   // label of last confirmed action
let _unsubLearn      = null
let _successTimer    = null

function openContextMenu(e) {
  e.preventDefault()
  menuX.value    = Math.min(e.clientX, window.innerWidth - 216)  // w-52 + margin
  menuY.value    = e.clientY
  menuVisible.value = true
  learningAction.value = null
}

// Keep the menu fully on-screen: opened from the footer the cursor sits at
// the bottom edge, so re-clamp the top after render whenever the menu opens
// or its content changes height (learn / success states are taller).
const menuEl = ref(null)
const topPx  = ref(0)

watch(
  [menuVisible, menuY, learningAction, learnSuccess],
  async () => {
    if (!menuVisible.value) return
    topPx.value = menuY.value
    await nextTick()
    const el = menuEl.value
    if (!el) return
    const maxTop = window.innerHeight - el.offsetHeight - 8
    if (topPx.value > maxTop) topPx.value = Math.max(8, maxTop)
  },
  { immediate: true }
)

function closeMenu() {
  cancelLearn()
  menuVisible.value = false
}

function startLearn(action) {
  learningAction.value = action
  if (_unsubLearn) { _unsubLearn(); _unsubLearn = null }

  _unsubLearn = midiService.addRawListener((event) => {
    if (!event.data || event.data.length < 3) return
    const status  = event.data[0]
    const type    = status & 0xF0
    if (type !== 0xB0 && !(type === 0x90 && event.data[2] > 0)) return

    const inputId   = event.target?.id
    const inputPort = midiService.getInputs().find(i => i.id === inputId)
    const device    = inputPort?.name || 'Unknown Device'
    const channel   = status & 0x0F
    const isCC      = type === 0xB0
    const ccNum     = isCC ? event.data[1] : null
    const noteNum   = !isCC ? event.data[1] : null

    confirmLearn(action, device, channel, ccNum, noteNum)
  })
}

function confirmLearn(action, device, midiChannel, cc, note) {
  if (_unsubLearn) { _unsubLearn(); _unsubLearn = null }
  learningAction.value = null

  const id = `${device}:${cc != null ? cc : 'NOTE' + note}:${midiChannel}:${Date.now()}`
  const newMapping = {
    id,
    device,
    cc:      cc  ?? undefined,
    note:    note ?? undefined,
    channel: midiChannel,
    value:   action === 'channel_cc' ? -1 : -1,
    action,
    consume: false,
  }
  mappingStore.saveAppMidiMappings([...mappingStore.appMidiMappings, newMapping])

  learnSuccess.value = APP_ACTION_LABELS[action]
  clearTimeout(_successTimer)
  _successTimer = setTimeout(() => {
    learnSuccess.value = null
    closeMenu()
  }, 1200)
}

function cancelLearn() {
  if (_unsubLearn) { _unsubLearn(); _unsubLearn = null }
  learningAction.value = null
}

function onKey(e) {
  if (e.key === 'Escape') closeMenu()
}

onMounted(()  => window.addEventListener('keydown', onKey))
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  cancelLearn()
  clearTimeout(_successTimer)
})
</script>

<template>
  <div
    class="flex items-center gap-2 bg-neutral-900/60 border border-neutral-800 rounded-full px-2 py-1 group hover:border-emerald-500/30 transition-all"
    @contextmenu="openContextMenu"
  >
    <div class="flex items-center gap-2 pr-2 border-r border-neutral-800">
      <Layers class="w-3 h-3 text-emerald-500" />
      <!-- <span class="text-[9px] font-black text-neutral-500 uppercase tracking-tighter">PART</span> -->
    </div>

    <div class="flex items-center gap-2">
      <button @click="prevChannel" title="Multi Device: MIDI Channel" class="text-neutral-600 hover:text-white transition-colors">
        <ChevronDown class="w-3 h-3" />
      </button>

      <div class="relative flex items-center justify-center w-3 h-4 overflow-hidden">
        <Transition name="slide-up" mode="out-in">
          <span :key="currentChannel" class="text-[11px] font-mono font-bold text-emerald-400">
            {{ currentChannel }}
          </span>
        </Transition>
      </div>

      <button @click="nextChannel" title="Multi Device: MIDI Channel" class="text-neutral-600 hover:text-white transition-colors">
        <ChevronUp class="w-3 h-3" />
      </button>
    </div>

    <!-- Quick Dropdown / Matrix (Optional Expansion) -->
    <!-- <div class="hidden group-hover:flex items-center gap-1 pl-2 border-l border-neutral-800 animate-in fade-in slide-in-from-left-2 duration-300">
      <button
        v-for="ch in [1, 2, 3, 4, 5, 6, 7,8,9,10,11,12,13,14,15,16]" :key="ch"
        @click="setChannel(ch)"
        :class="[
          'w-4 h-4 rounded-sm flex items-center justify-center text-[8px] font-bold transition-all',
          currentChannel === ch ? 'bg-emerald-500 text-black shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'
        ]"
        :title="`Switch to Ch ${ch}`"
      >
        {{ ch }}
      </button> -->

      <!-- MIDI Learn hint -->
      <!-- <button
        @click.stop="openContextMenu($event)"
        class="ml-1 w-4 h-4 rounded-sm flex items-center justify-center text-neutral-700 hover:text-orange-400 hover:bg-orange-500/10 transition-all"
        title="MIDI Learn (right-click for options)"
      >
        <Radio class="w-2.5 h-2.5" />
      </button>
    </div> -->
  </div>

  <!-- Context Menu (Teleported to body) -->
  <Teleport to="body">
    <div
      v-if="menuVisible"
      class="fixed inset-0 z-[1090]"
      @click="closeMenu"
      @contextmenu.prevent="closeMenu"
    />

    <Transition name="ctx-menu">
      <div
        v-if="menuVisible"
        ref="menuEl"
        class="fixed z-[1091] w-52 max-h-[calc(100vh-16px)] overflow-y-auto bg-neutral-950 border border-neutral-800 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
        :style="{ left: menuX + 'px', top: topPx + 'px' }"
      >
        <!-- Header -->
        <div class="px-3 pt-2.5 pb-2 border-b border-neutral-800/80">
          <p class="text-[8px] font-mono text-neutral-600 uppercase tracking-widest leading-none mb-0.5">MIDI Learn</p>
          <p class="text-[11px] font-black text-white uppercase tracking-tight">MIDI Channel</p>
        </div>

        <!-- Success state -->
        <template v-if="learnSuccess">
          <div class="px-3 py-4 flex flex-col items-center gap-2">
            <CheckCircle2 class="w-6 h-6 text-emerald-400" />
            <p class="text-[10px] font-black text-emerald-400 uppercase tracking-widest text-center">Mapped!</p>
            <p class="text-[9px] font-mono text-neutral-500 text-center truncate max-w-full">{{ learnSuccess }}</p>
          </div>
        </template>

        <!-- Learning state -->
        <template v-else-if="learningAction">
          <div class="px-3 py-4 flex flex-col items-center gap-3">
            <div class="relative flex items-center justify-center w-10 h-10">
              <span class="absolute inset-0 rounded-full bg-orange-500/20 animate-ping" />
              <Radio class="w-5 h-5 text-orange-400 relative z-10" />
            </div>
            <p class="text-[10px] font-black text-orange-400 uppercase tracking-widest text-center leading-tight">
              Move a controller…
            </p>
            <p class="text-[8px] font-mono text-neutral-500 text-center leading-tight">
              {{ APP_ACTION_LABELS[learningAction] }}
            </p>
            <button
              @click.stop="cancelLearn"
              class="mt-1 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-500 text-[10px] font-bold uppercase tracking-widest hover:border-neutral-500 hover:text-neutral-300 transition-colors"
            >
              <X class="w-3 h-3" /> Cancel
            </button>
          </div>
        </template>

        <!-- Action list -->
        <template v-else>
          <div class="py-1">
            <button
              v-for="action in CHANNEL_ACTIONS"
              :key="action"
              @click.stop="startLearn(action)"
              class="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-bold text-orange-400 hover:bg-orange-500/10 transition-colors"
            >
              <Radio class="w-3.5 h-3.5 shrink-0" />
              {{ APP_ACTION_LABELS[action] }}
            </button>
          </div>
        </template>

      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.2s ease;
}
.slide-up-enter-from {
  opacity: 0;
  transform: translateY(5px);
}
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}
.ctx-menu-enter-active, .ctx-menu-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}
.ctx-menu-enter-from, .ctx-menu-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-4px);
}
</style>
