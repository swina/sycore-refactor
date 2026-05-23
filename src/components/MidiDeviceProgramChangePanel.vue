<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { X, Music2, Search, Send, ChevronDown, AlertTriangle, Loader2, Zap } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import catalogIndex from '@/data/program_change/program_change.json'

const emit = defineEmits(['close'])
const midiStore = useMidiStore()

// ── Device list (left column) ───────────────────────────────────
const devices = computed(() => {
  if (!midiStore.routingConfig?.registrations) return []
  return Object.values(midiStore.routingConfig.registrations)
    .filter(r => r.outEnabled)
    .map(r => ({ ...r, isOnline: midiStore.outputs.some(o => o.name === r.name) }))
    .sort((a, b) => b.isOnline - a.isOnline || a.name.localeCompare(b.name))
})

const selectedDeviceName = ref('')

// Auto-select first online PC-enabled device on open
onMounted(() => {
  const first = devices.value.find(d => d.pcEnabled && d.isOnline) ?? devices.value[0]
  if (first) selectedDeviceName.value = first.name
})

const selectedReg = computed(() =>
  selectedDeviceName.value ? midiStore.routingConfig.registrations[selectedDeviceName.value] : null
)

const isDeviceOffline = computed(() =>
  selectedDeviceName.value && !midiStore.outputs.some(o => o.name === selectedDeviceName.value)
)

// ── Catalog match ───────────────────────────────────────────────
const catalogDevice = computed(() => {
  const dn = selectedDeviceName.value?.toLowerCase() ?? ''
  if (!dn) return null
  return Object.keys(catalogIndex).find(k =>
    dn.includes(k.toLowerCase()) || k.toLowerCase().includes(dn)
  ) ?? null
})

const availableBanks = computed(() => {
  if (!catalogDevice.value) return []
  return Object.keys(catalogIndex[catalogDevice.value])
})

const selectedBank = ref('')
watch([catalogDevice, selectedDeviceName], () => {
  // restore last-used bank if available, else reset
  const reg = selectedReg.value
  if (reg?.pcBank && availableBanks.value.includes(reg.pcBank)) {
    selectedBank.value = reg.pcBank
  } else {
    selectedBank.value = ''
    sounds.value = []
  }
})

const bankConfig = computed(() => {
  if (!catalogDevice.value || !selectedBank.value) return null
  return catalogIndex[catalogDevice.value][selectedBank.value]
})

// ── Lazy-load sound list ────────────────────────────────────────
const sounds    = ref([])
const isLoading = ref(false)

watch(selectedBank, async (bank) => {
  if (!bank || !bankConfig.value) { sounds.value = []; return }
  isLoading.value = true
  try {
    const match = bankConfig.value.data.match(/^\.\/([^/]+)\/(.+)$/)
    if (!match) throw new Error('Bad data path')
    const [, folder, filename] = match
    const res = await fetch(`/src/data/program_change/${folder}/${filename}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    sounds.value = await res.json()
  } catch (e) {
    console.error('[DevicePCPanel] Failed to load sounds', e)
    sounds.value = []
  } finally {
    isLoading.value = false
  }
})

// ── Filters ─────────────────────────────────────────────────────
const searchQuery      = ref('')
const selectedCategory = ref('')

watch(selectedBank, () => { selectedCategory.value = ''; searchQuery.value = '' })

const categories = computed(() => {
  const field = bankConfig.value?.category_field ?? 'category'
  return [...new Set(sounds.value.map(s => s[field]))].filter(Boolean).sort()
})

const filteredSounds = computed(() => {
  let list = sounds.value
  if (selectedCategory.value) {
    const field = bankConfig.value?.category_field ?? 'category'
    list = list.filter(s => s[field] === selectedCategory.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(s => s.name?.toLowerCase().includes(q))
  }
  return list
})

// ── Active sound tracking ───────────────────────────────────────
const activeSound = ref(null)
const lastSent    = ref(null)

watch(selectedDeviceName, () => { activeSound.value = null; lastSent.value = null })

// ── Send from catalog ───────────────────────────────────────────
function selectSound(sound) {
  activeSound.value = sound
  sendCatalogSound(sound)
}

function sendCatalogSound(sound) {
  const reg = selectedReg.value
  if (!reg) return
  const port = midiStore.outputs.find(o => o.name === selectedDeviceName.value)
  if (!port) return

  const cfg    = bankConfig.value
  const ch     = reg.pcChannel ?? 0
  const pField = cfg?.program_field ?? 'program'
  const prog   = sound[pField] ?? 0
  let progNum  = prog >= 128 ? prog % 128 : prog
  progNum      = Math.max(0, Math.min(127, progNum + cfg.program_base))
  const msb    = cfg.msb ? (sound.msb ?? 0) : Math.floor(prog / 128)
  const lsb    = cfg.lsb ? (sound.lsb ?? 0) : 0

  port.send([0xB0 | ch, 0,  msb])
  port.send([0xB0 | ch, 32, lsb])
  port.send([0xC0 | ch, progNum])

  lastSent.value = sound

  // Persist last-used state into registration
  midiStore.updateRegistration(selectedDeviceName.value, 'pcProgram', progNum)
  midiStore.updateRegistration(selectedDeviceName.value, 'pcBank', selectedBank.value)

  const msg = `[Device PC] → ${selectedDeviceName.value} ch${ch + 1}: MSB=${msb} LSB=${lsb} PC=${progNum} | ${sound.name}`
  if (window.SY_LOG) window.SY_LOG(msg); else console.log(msg)

  if (midiStore.sendClock) {
    setTimeout(() => midiStore.startClock(), 100)
  }
}

// ── Manual fallback ─────────────────────────────────────────────
const manualMsb  = ref(0)
const manualLsb  = ref(0)
const manualProg = ref(1)
const sendMsb    = ref(false)
const sendLsb    = ref(false)

function sendManual() {
  const reg = selectedReg.value
  if (!reg) return
  const port = midiStore.outputs.find(o => o.name === selectedDeviceName.value)
  if (!port) return
  const ch = reg.pcChannel ?? 0
  if (sendMsb.value) port.send([0xB0 | ch, 0,  manualMsb.value])
  if (sendLsb.value) port.send([0xB0 | ch, 32, manualLsb.value])
  const prog = Math.max(0, Math.min(127, manualProg.value - 1))
  port.send([0xC0 | ch, prog])
  midiStore.updateRegistration(selectedDeviceName.value, 'pcProgram', prog)
  lastSent.value = { name: `PC ${manualProg.value}` }
}

// ── Channel helper ──────────────────────────────────────────────
function setChannel(ch) {
  midiStore.updateRegistration(selectedDeviceName.value, 'pcChannel', ch - 1)
}
</script>

<template>
  <div class="fixed inset-0 z-[650] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
    <Transition name="performance" appear>
      <div class="bg-neutral-950 border border-violet-500/30 rounded-3xl w-full max-w-5xl overflow-hidden shadow-[0_0_50px_rgba(139,92,246,0.15)] flex flex-col max-h-[90vh]">

        <!-- Header -->
        <div class="px-6 py-5 border-b border-neutral-900 flex items-center justify-between bg-gradient-to-r from-violet-950/40 to-transparent shrink-0">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Music2 class="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h2 class="text-sm font-black uppercase tracking-[0.2em] text-white leading-none mb-1">Device Program Change</h2>
              <p class="text-[9px] font-mono text-violet-500/60 uppercase tracking-widest">Per-Device Bank & Preset Browser</p>
            </div>
          </div>
          <button @click="emit('close')" class="p-2 text-neutral-500 hover:text-white transition-colors rounded-full hover:bg-white/5">
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Body: two columns -->
        <div class="flex flex-1 overflow-hidden">

          <!-- ── LEFT: device list ── -->
          <div class="w-64 shrink-0 border-r border-neutral-900 flex flex-col overflow-y-auto custom-scrollbar">
            <div class="px-4 py-3 border-b border-neutral-900">
              <span class="text-[8px] font-mono text-neutral-600 uppercase tracking-widest">Output Devices</span>
            </div>

            <div v-if="devices.length === 0" class="flex-1 flex items-center justify-center p-6 text-center">
              <p class="text-[10px] font-mono text-neutral-600 italic">No output devices registered</p>
            </div>

            <button
              v-for="dev in devices"
              :key="dev.name"
              @click="selectedDeviceName = dev.name"
              :class="[
                'w-full text-left px-4 py-3 border-b border-neutral-900/60 transition-all group',
                selectedDeviceName === dev.name
                  ? 'bg-violet-500/10 border-l-2 border-l-violet-500'
                  : 'hover:bg-white/[0.03] border-l-2 border-l-transparent'
              ]"
            >
              <div class="flex items-center gap-2.5">
                <div :class="['w-1.5 h-1.5 rounded-full shrink-0 mt-0.5', dev.isOnline ? 'bg-emerald-500' : 'bg-neutral-700']" />
                <div class="flex flex-col min-w-0 flex-1">
                  <span class="text-[11px] font-bold text-white truncate leading-tight">{{ dev.name }}</span>
                  <div class="flex items-center gap-1.5 mt-0.5">
                    <span v-if="dev.pcEnabled" class="text-[7px] font-black uppercase tracking-tighter px-1 py-0.5 rounded bg-violet-500/20 text-violet-400 border border-violet-500/30">PC ON</span>
                    <span v-else class="text-[7px] font-mono text-neutral-700 uppercase">PC off</span>
                    <span v-if="dev.pcEnabled" class="text-[7px] font-mono text-neutral-500">CH{{ (dev.pcChannel ?? 0) + 1 }}</span>
                  </div>
                </div>
                <!-- PC toggle -->
                <button
                  @click.stop="midiStore.updateRegistration(dev.name, 'pcEnabled', !dev.pcEnabled)"
                  :class="[
                    'w-6 h-4 rounded-full relative transition-all shrink-0',
                    dev.pcEnabled ? 'bg-violet-500' : 'bg-neutral-800'
                  ]"
                  title="Toggle Program Change"
                >
                  <div :class="['absolute top-0.5 bottom-0.5 w-3 bg-white rounded-full transition-transform', dev.pcEnabled ? 'translate-x-2.5' : 'translate-x-0.5']" />
                </button>
              </div>
            </button>
          </div>

          <!-- ── RIGHT: browser ── -->
          <div class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">

            <!-- No device selected -->
            <div v-if="!selectedDeviceName" class="h-full flex flex-col items-center justify-center gap-3 min-h-[300px]">
              <Music2 class="w-10 h-10 text-neutral-700" />
              <p class="text-[10px] font-mono text-neutral-600 text-center">Select a device on the left<br>to browse its preset catalog</p>
            </div>

            <template v-else>
              <!-- Device + Channel row -->
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div :class="['w-2 h-2 rounded-full', isDeviceOffline ? 'bg-neutral-700' : 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]']" />
                  <span class="text-sm font-black text-white uppercase tracking-wider">{{ selectedDeviceName }}</span>
                  <span v-if="isDeviceOffline" class="text-[8px] font-black bg-amber-950/40 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full uppercase">Offline</span>
                </div>

                <!-- Channel selector -->
                <div class="flex items-center gap-2">
                  <span class="text-[9px] font-mono text-neutral-500 uppercase">Channel</span>
                  <div class="relative">
                    <select
                      :value="(selectedReg?.pcChannel ?? 0) + 1"
                      @change="e => setChannel(parseInt(e.target.value))"
                      class="appearance-none bg-black/60 border border-neutral-800 rounded-lg px-3 py-1.5 text-violet-300 font-mono text-[11px] outline-none focus:border-violet-500/50 pr-7 cursor-pointer"
                    >
                      <option v-for="ch in 16" :key="ch" :value="ch" class="bg-black">CH {{ ch }}</option>
                    </select>
                    <ChevronDown class="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600 pointer-events-none" />
                  </div>
                </div>
              </div>

              <!-- Offline warning -->
              <div v-if="isDeviceOffline" class="bg-amber-950/30 border border-amber-500/30 rounded-xl px-4 py-2.5 flex items-center gap-2">
                <AlertTriangle class="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span class="text-[9px] font-mono text-amber-400">Device offline — messages will not transmit</span>
              </div>

              <!-- ── Catalog browser ── -->
              <template v-if="catalogDevice">

                <!-- Bank selector -->
                <div>
                  <label class="block text-[9px] font-mono text-neutral-500 uppercase tracking-widest mb-2">Bank</label>
                  <div class="flex gap-2 flex-wrap">
                    <button
                      v-for="bank in availableBanks"
                      :key="bank"
                      @click="selectedBank = bank"
                      :class="[
                        'px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border',
                        selectedBank === bank
                          ? 'bg-violet-500/20 border-violet-500/40 text-violet-300 shadow-[0_0_8px_rgba(139,92,246,0.15)]'
                          : 'bg-black/40 border-neutral-800 text-neutral-500 hover:border-neutral-600 hover:text-neutral-300'
                      ]"
                    >
                      {{ bank }}
                    </button>
                  </div>
                </div>

                <template v-if="selectedBank">
                  <!-- Search + Category -->
                  <div class="flex gap-2 items-center">
                    <div class="relative flex-1">
                      <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600" />
                      <input
                        v-model="searchQuery"
                        type="text"
                        placeholder="Search presets…"
                        class="w-full bg-black/50 border border-neutral-800 rounded-xl pl-7 pr-3 py-1.5 text-[11px] text-neutral-300 font-mono outline-none focus:border-violet-500/50 placeholder:text-neutral-700"
                      />
                      <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-white">
                        <X class="w-3 h-3" />
                      </button>
                    </div>
                    <div class="relative">
                      <select
                        v-model="selectedCategory"
                        class="appearance-none bg-black/50 border border-neutral-800 rounded-xl px-3 py-1.5 text-[10px] text-neutral-400 font-mono outline-none focus:border-violet-500/50 pr-6 cursor-pointer"
                      >
                        <option value="" class="bg-black">All categories</option>
                        <option v-for="cat in categories" :key="cat" :value="cat" class="bg-black">{{ cat }}</option>
                      </select>
                      <ChevronDown class="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600 pointer-events-none" />
                    </div>
                  </div>

                  <!-- Loading -->
                  <div v-if="isLoading" class="flex items-center justify-center py-12 gap-2">
                    <Loader2 class="w-5 h-5 text-violet-400 animate-spin" />
                    <span class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Loading catalog…</span>
                  </div>

                  <!-- Preset list -->
                  <div v-else-if="filteredSounds.length > 0" class="space-y-0.5">
                    <div class="flex items-center justify-between mb-2 px-1">
                      <span class="text-[8px] font-mono text-neutral-600 uppercase tracking-widest">{{ filteredSounds.length }} presets</span>
                      <span v-if="lastSent" class="flex items-center gap-1 text-[8px] font-mono text-violet-400 uppercase tracking-widest">
                        <Zap class="w-2.5 h-2.5" />
                        {{ lastSent.name }}
                      </span>
                    </div>

                    <button
                      v-for="sound in filteredSounds"
                      :key="sound.no ?? sound.name"
                      @click="selectSound(sound)"
                      :class="[
                        'w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all group text-left',
                        activeSound?.no === sound.no && activeSound?.name === sound.name
                          ? 'bg-violet-500/15 border-violet-500/30 shadow-[0_0_10px_rgba(139,92,246,0.1)]'
                          : 'bg-black/20 border-transparent hover:border-neutral-800 hover:bg-white/[0.03]'
                      ]"
                    >
                      <div class="flex items-center gap-2.5 min-w-0">
                        <span :class="[
                          'shrink-0 w-7 text-center text-[8px] font-black font-mono rounded px-1 py-0.5',
                          activeSound?.no === sound.no && activeSound?.name === sound.name
                            ? 'bg-violet-500 text-black'
                            : 'bg-neutral-900 text-neutral-600 group-hover:bg-neutral-800 group-hover:text-neutral-400'
                        ]">
                          {{ sound[bankConfig?.program_field ?? 'program'] ?? 0 }}
                        </span>
                        <span :class="[
                          'text-[11px] font-medium truncate',
                          activeSound?.no === sound.no && activeSound?.name === sound.name
                            ? 'text-violet-200'
                            : 'text-neutral-400 group-hover:text-neutral-200'
                        ]">
                          {{ sound.name }}
                        </span>
                      </div>
                      <div class="flex items-center gap-1.5 shrink-0 ml-2">
                        <span
                          v-if="sound[bankConfig?.category_field ?? 'category']"
                          class="text-[8px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-500 border border-neutral-800/50"
                        >
                          {{ sound[bankConfig?.category_field ?? 'category'] }}
                        </span>
                        <Send v-if="activeSound?.no === sound.no && activeSound?.name === sound.name" class="w-2.5 h-2.5 text-violet-400" />
                      </div>
                    </button>
                  </div>

                  <!-- Empty -->
                  <div v-else-if="!isLoading" class="flex flex-col items-center justify-center py-12 gap-2">
                    <Music2 class="w-6 h-6 text-neutral-700" />
                    <span class="text-[10px] font-mono text-neutral-600">No presets found</span>
                  </div>
                </template>

              </template>

              <!-- ── Manual fallback (no catalog) ── -->
              <template v-else>
                <div class="bg-neutral-900/30 border border-neutral-800 rounded-2xl p-5 space-y-4">
                  <p class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Manual Bank / Program Change</p>

                  <div class="grid grid-cols-2 gap-3">
                    <div class="bg-black/40 border border-neutral-800 rounded-xl p-3 space-y-2">
                      <label class="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" v-model="sendMsb" class="w-3.5 h-3.5 accent-violet-500" />
                        <span class="text-[9px] font-black uppercase text-neutral-400">Bank MSB (CC 0)</span>
                      </label>
                      <input
                        type="number" min="0" max="127" v-model.number="manualMsb" :disabled="!sendMsb"
                        class="w-full bg-black border border-neutral-700 rounded-lg px-3 py-1.5 text-neutral-300 font-mono text-[11px] outline-none focus:border-violet-500 disabled:opacity-30 text-center"
                      />
                    </div>
                    <div class="bg-black/40 border border-neutral-800 rounded-xl p-3 space-y-2">
                      <label class="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" v-model="sendLsb" class="w-3.5 h-3.5 accent-violet-500" />
                        <span class="text-[9px] font-black uppercase text-neutral-400">Bank LSB (CC 32)</span>
                      </label>
                      <input
                        type="number" min="0" max="127" v-model.number="manualLsb" :disabled="!sendLsb"
                        class="w-full bg-black border border-neutral-700 rounded-lg px-3 py-1.5 text-neutral-300 font-mono text-[11px] outline-none focus:border-violet-500 disabled:opacity-30 text-center"
                      />
                    </div>
                  </div>

                  <div class="bg-black/40 border border-neutral-800 rounded-xl p-3 space-y-2">
                    <div class="flex items-center justify-between">
                      <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Program (1–128)</span>
                      <input
                        type="number" min="1" max="128" v-model.number="manualProg"
                        class="w-14 bg-black border border-neutral-700 rounded px-2 py-0.5 text-center text-violet-300 font-mono text-[11px] focus:border-violet-400 outline-none"
                      />
                    </div>
                    <input type="range" min="1" max="128" v-model.number="manualProg" class="w-full accent-violet-500 h-1 bg-black rounded-lg cursor-pointer" />
                  </div>

                  <button
                    @click="sendManual"
                    :disabled="!selectedDeviceName || isDeviceOffline"
                    class="w-full bg-violet-500 text-black rounded-xl py-3 font-black tracking-widest uppercase text-[10px] flex items-center justify-center gap-2 hover:bg-violet-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-500/20"
                  >
                    <Send class="w-3.5 h-3.5" />
                    Send Program Change
                  </button>
                </div>
              </template>

            </template>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-3 bg-black/40 border-t border-neutral-900 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
            <span class="text-[9px] font-mono text-violet-500/60 uppercase tracking-widest">Program Change Browser · SY.CORE</span>
          </div>
          <span class="text-[9px] font-mono text-neutral-700 uppercase tracking-widest">
            {{ devices.filter(d => d.pcEnabled).length }} device(s) PC-enabled
          </span>
        </div>

      </div>
    </Transition>
  </div>
</template>

<style scoped>
.performance-enter-active,
.performance-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.performance-enter-from,
.performance-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.98);
}
</style>
