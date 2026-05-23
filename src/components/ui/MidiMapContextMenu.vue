<script setup>
import { computed, onMounted, onUnmounted, watch, ref } from 'vue'
import { Radio, X, Trash2, Loader2 } from 'lucide-vue-next'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'
import { useMappingStore }    from '@/stores/useMappingStore'
import { midiService }        from '@/core/midi/MidiService'

const menu         = useMidiContextMenu()
const mappingStore = useMappingStore()

// ── Mappings for the current control ─────────────────────────────
const controlMappings = computed(() => {
  if (!menu.control.value) return []
  return Object.entries(mappingStore.midiMappings)
    .filter(([, m]) => {
      const name = typeof m === 'object' ? m.paramName : m
      return name === menu.control.value.name
    })
    .map(([key, m]) => ({
      key,
      cc:      typeof m === 'object' ? m.cc      : null,
      note:    typeof m === 'object' ? m.note    : null,
      channel: typeof m === 'object' ? m.channel : null,
      device:  typeof m === 'object' ? m.device  : null,
      nrpn:    typeof m === 'object' ? m.nrpn    : null,
    }))
})

const isLearningThis = computed(() =>
  mappingStore.isMidiLearning &&
  mappingStore.learningParamName === menu.control.value?.name
)

// ── Actions ───────────────────────────────────────────────────────
function triggerLearn() {
  if (!menu.control.value) return
  mappingStore.learnForParam(menu.control.value.name)
  // keep menu open — it now shows the waiting state
}

function cancelLearn() {
  mappingStore.cancelLearn()
}

function removeAll() {
  controlMappings.value.forEach(m => mappingStore.removeMapping(m.key))
}

// Auto-close 700ms after a mapping is confirmed for this control
watch(() => mappingStore.lastMappedParam, (name) => {
  if (name && name === menu.control.value?.name) {
    setTimeout(() => menu.closeMenu(), 700)
  }
})

// ── Raw MIDI listener — active only during context-menu learn ─────
let _unsubLearn = null

watch(() => mappingStore.learningParamName, (name) => {
  if (_unsubLearn) { _unsubLearn(); _unsubLearn = null }
  if (!name) return
  _unsubLearn = midiService.addRawListener((event) => {
    if (!event.data || event.data.length < 3) return
    const status  = event.data[0]
    const type    = status & 0xF0
    const channel = status & 0x0F
    const inputId   = event.target?.id
    const inputPort = midiService.getInputs().find(i => i.id === inputId)
    const device    = inputPort?.name || 'Unknown Device'
    if (type === 0xB0) {
      mappingStore.incomingCC(event.data[1], device, channel)
    } else if (type === 0x90 && event.data[2] > 0) {
      // Note On with velocity > 0 (velocity 0 = implicit Note Off)
      mappingStore.incomingNote(event.data[1], device, channel)
    }
  })
}, { immediate: true })

onUnmounted(() => { if (_unsubLearn) _unsubLearn() })

// ── Close on Escape ───────────────────────────────────────────────
function onKey(e) {
  if (e.key === 'Escape') {
    if (mappingStore.learningParamName) mappingStore.cancelLearn()
    menu.closeMenu()
  }
}
onMounted(()  => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <!-- Click-outside backdrop — blocked during learning to avoid accidental close -->
    <div
      v-if="menu.visible.value"
      class="fixed inset-0 z-[979]"
      @click="isLearningThis ? null : menu.closeMenu()"
      @contextmenu.prevent="isLearningThis ? null : menu.closeMenu()"
    />

    <!-- Menu -->
    <Transition name="ctx-menu">
      <div
        v-if="menu.visible.value"
        class="fixed z-[980] w-56 bg-neutral-950 border border-neutral-800 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden"
        :style="{ left: menu.x.value + 'px', top: menu.y.value + 'px' }"
      >
        <!-- Header -->
        <div class="px-3 pt-2.5 pb-2 border-b border-neutral-800/80">
          <p class="text-[8px] font-mono text-neutral-600 uppercase tracking-widest leading-none mb-0.5">MIDI Map</p>
          <p class="text-[11px] font-black text-white uppercase tracking-tight truncate leading-tight">
            {{ menu.control.value?.label }}
          </p>
        </div>

        <!-- ── WAITING FOR INPUT STATE ── -->
        <template v-if="isLearningThis">
          <div class="px-3 py-4 flex flex-col items-center gap-3">
            <!-- Animated pulse ring -->
            <div class="relative flex items-center justify-center w-10 h-10">
              <span class="absolute inset-0 rounded-full bg-orange-500/20 animate-ping" />
              <Radio class="w-5 h-5 text-orange-400 relative z-10" />
            </div>
            <p class="text-[10px] font-black text-orange-400 uppercase tracking-widest text-center leading-tight">
              Move a controller…
            </p>
            <p class="text-[8px] font-mono text-neutral-600 uppercase tracking-widest text-center">
              Press any CC on your device
            </p>
            <button
              @click="cancelLearn"
              class="mt-1 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-500 text-[10px] font-bold uppercase tracking-widest hover:border-neutral-500 hover:text-neutral-300 transition-colors"
            >
              <X class="w-3 h-3" /> Cancel
            </button>
          </div>
        </template>

        <!-- ── NORMAL STATE ── -->
        <template v-else>
          <div class="py-1">

            <!-- MIDI Learn -->
            <button
              @click="triggerLearn"
              class="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-bold text-orange-400 hover:bg-orange-500/10 transition-colors"
            >
              <Radio class="w-3.5 h-3.5 shrink-0" />
              MIDI Learn
            </button>

            <!-- Current mappings section -->
            <template v-if="controlMappings.length > 0">
              <div class="border-t border-neutral-800/80 mx-2 my-1" />
              <p class="px-3 pt-1 pb-0.5 text-[8px] font-mono text-neutral-600 uppercase tracking-widest">Mapped to</p>
              <div class="px-3 pb-1 space-y-1">
                <div
                  v-for="m in controlMappings" :key="m.key"
                  class="flex items-center justify-between group"
                >
                  <span class="text-[9px] font-mono text-violet-300 leading-none truncate">
                    <template v-if="m.nrpn">NRPN {{ m.nrpn.msb }}:{{ m.nrpn.lsb }}</template>
                    <template v-else-if="m.note != null">NOTE{{ m.note }}</template>
                    <template v-else>CC{{ m.cc }}</template>
                    <span class="text-neutral-600 mx-0.5">·</span>CH{{ (m.channel ?? 0) + 1 }}
                    <span v-if="m.device" class="text-neutral-700 ml-0.5">· {{ m.device.split(' ')[0] }}</span>
                  </span>
                  <button
                    @click.stop="mappingStore.removeMapping(m.key)"
                    class="shrink-0 ml-1 text-neutral-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                    title="Remove this mapping"
                  >
                    <X class="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div class="border-t border-neutral-800/80 mx-2 my-1" />
              <button
                @click="removeAll"
                class="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-bold text-red-500/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 class="w-3.5 h-3.5 shrink-0" />
                Remove All Mappings
              </button>
            </template>

            <!-- No mappings -->
            <p v-else class="px-3 py-2 text-[9px] font-mono text-neutral-700 italic">No mappings yet</p>

          </div>
        </template>

      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ctx-menu-enter-active, .ctx-menu-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}
.ctx-menu-enter-from, .ctx-menu-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-4px);
}
</style>
