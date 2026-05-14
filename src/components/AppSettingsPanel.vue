<script setup>
import { ref, computed } from 'vue'
import { X } from 'lucide-vue-next'
import { useMidiStore } from '@/stores/useMidiStore'
import { useConfigStore } from '@/stores/useConfigStore'

const emit = defineEmits(['close'])

const midiStore = useMidiStore()
const configStore = useConfigStore()

const midiChannel = ref(midiStore.midiChannel || 0)
const midiInputChannel = ref(midiStore.midiInputChannel || -1)
const activeTab = ref('app')
const isSaving = ref(false)

const enabledToolbarButtons = computed(() => {
  return configStore.toolbarConfig.filter(btn => btn.enabled).length
})

function saveMidiChannel() {
  midiStore.midiChannel = midiChannel.value
}

function saveMidiInputChannel() {
  midiStore.setMidiInputChannel(midiInputChannel.value)
}

function toggleToolbarButton(buttonId) {
  const button = configStore.toolbarConfig.find(b => b.id === buttonId)
  if (button) {
    button.enabled = !button.enabled
    saveAppSettings()
  }
}

async function saveAppSettings() {
  isSaving.value = true
  try {
    await configStore.saveAppSettings()
    console.log('App settings saved')
  } catch (err) {
    console.error('Failed to save app settings', err)
  } finally {
    isSaving.value = false
  }
}

async function handleIconSizeChange() {
  await saveAppSettings()
}
</script>

<template>
  <div class="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div class="bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">

      <!-- Header -->
      <div class="p-6 border-b border-neutral-900 flex justify-between items-center">
        <h2 class="text-lg font-black uppercase tracking-widest text-white">App Settings</h2>
        <button @click="emit('close')" class="p-1 text-neutral-400 hover:text-white transition-colors">
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 border-b border-neutral-900 bg-neutral-900/50 px-4">
        <button
          @click="activeTab = 'app'"
          :class="['px-4 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors', activeTab === 'app' ? 'border-synth-neon text-synth-neon' : 'border-transparent text-neutral-400 hover:text-white']"
        >
          App Info
        </button>
        <button
          @click="activeTab = 'toolbar'"
          :class="['px-4 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors', activeTab === 'toolbar' ? 'border-synth-neon text-synth-neon' : 'border-transparent text-neutral-400 hover:text-white']"
        >
          Toolbar
        </button>
        <button
          @click="activeTab = 'midi'"
          :class="['px-4 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors', activeTab === 'midi' ? 'border-synth-neon text-synth-neon' : 'border-transparent text-neutral-400 hover:text-white']"
        >
          MIDI
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">

        <!-- App Info Tab -->
        <div v-if="activeTab === 'app'" class="space-y-6">
          <div class="grid grid-cols-2 gap-6">
            <div class="space-y-2">
              <label class="text-xs font-black uppercase tracking-widest text-neutral-400">App Name</label>
              <p class="text-lg font-bold text-white">{{ configStore.appName }}</p>
            </div>
            <div class="space-y-2">
              <label class="text-xs font-black uppercase tracking-widest text-neutral-400">Version</label>
              <p class="text-lg font-bold text-synth-neon font-mono">{{ configStore.appVersion }}</p>
            </div>
            <div class="space-y-2">
              <label class="text-xs font-black uppercase tracking-widest text-neutral-400">Engine</label>
              <p class="text-lg font-bold text-white">{{ configStore.appEngine }}</p>
            </div>
            <div class="space-y-2">
              <label class="text-xs font-black uppercase tracking-widest text-neutral-400">Target Device</label>
              <p class="text-sm font-mono text-neutral-300">{{ configStore.osTarget || 'ROLAND S-1' }}</p>
            </div>
          </div>

          <div class="bg-black/30 rounded-lg p-4 space-y-3">
            <h3 class="text-xs font-black uppercase tracking-widest text-neutral-400">App Description</h3>
            <p class="text-sm text-neutral-300">{{ configStore.appSubtitle }}</p>
          </div>
        </div>

        <!-- Toolbar Tab -->
        <div v-if="activeTab === 'toolbar'" class="space-y-4">
          <div class="flex items-center justify-between bg-black/30 rounded-lg p-4">
            <div>
              <h3 class="text-sm font-black uppercase tracking-widest text-neutral-400">Toolbar Buttons</h3>
              <p class="text-xs text-neutral-500 mt-1">{{ enabledToolbarButtons }} / {{ configStore.toolbarConfig.length }} enabled</p>
            </div>
            <div class="space-y-2">
              <label class="text-xs font-black uppercase tracking-widest text-neutral-400">Icon Size</label>
              <div class="flex items-center gap-2">
                <input
                  v-model.number="configStore.toolbarIconSize"
                  type="range"
                  min="4"
                  max="12"
                  class="w-24"
                  @change="handleIconSizeChange"
                />
                <span class="text-xs font-mono text-synth-neon">{{ configStore.toolbarIconSize }}px</span>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto custom-scrollbar">
            <button
              v-for="button in configStore.toolbarConfig"
              :key="button.id"
              @click="toggleToolbarButton(button.id)"
              :class="['p-3 rounded-lg border-2 transition-all text-left', button.enabled ? 'bg-synth-neon/10 border-synth-neon text-white' : 'bg-neutral-900 border-neutral-800 text-neutral-400']"
            >
              <div class="flex items-center gap-2">
                <div :class="['w-3 h-3 rounded transition-colors', button.enabled ? 'bg-synth-neon' : 'bg-neutral-700']" />
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-bold uppercase truncate">{{ button.label }}</p>
                  <p class="text-[10px] text-neutral-500 truncate">{{ button.id }}</p>
                </div>
              </div>
            </button>
          </div>
        </div>

        <!-- MIDI Tab -->
        <div v-if="activeTab === 'midi'" class="space-y-6">
          <!-- MIDI Output Channel -->
          <div class="space-y-3">
            <label class="text-sm font-black uppercase tracking-widest text-neutral-400">MIDI Output Channel</label>
            <div class="flex items-center gap-3">
              <input
                v-model.number="midiChannel"
                type="range"
                min="0"
                max="15"
                class="flex-1"
                @change="saveMidiChannel"
              />
              <span class="text-sm font-mono text-synth-neon font-bold w-16 text-right">Ch {{ midiChannel + 1 }}</span>
            </div>
            <p class="text-xs text-neutral-500">Select which MIDI channel to send note and CC data to</p>
          </div>

          <!-- MIDI Input Channel -->
          <div class="space-y-3">
            <label class="text-sm font-black uppercase tracking-widest text-neutral-400">MIDI Input Channel</label>
            <select
              v-model.number="midiInputChannel"
              @change="saveMidiInputChannel"
              class="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:border-synth-neon outline-none"
            >
              <option :value="-1">All Channels</option>
              <option v-for="ch in 16" :key="ch" :value="ch - 1">Channel {{ ch }}</option>
            </select>
            <p class="text-xs text-neutral-500">Listen for MIDI input on selected channel</p>
          </div>

          <!-- MIDI Status -->
          <div class="space-y-3 pt-4 border-t border-neutral-800">
            <h3 class="text-sm font-black uppercase tracking-widest text-neutral-400">MIDI Device Status</h3>
            <div class="grid grid-cols-2 gap-4">
              <div class="bg-black/30 rounded-lg p-4">
                <p class="text-xs text-neutral-500 mb-2">Connected Outputs</p>
                <p class="text-2xl font-black text-synth-neon">{{ midiStore.outputs?.length || 0 }}</p>
              </div>
              <div class="bg-black/30 rounded-lg p-4">
                <p class="text-xs text-neutral-500 mb-2">Connected Inputs</p>
                <p class="text-2xl font-black text-synth-neon">{{ midiStore.inputs?.length || 0 }}</p>
              </div>
            </div>

          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="p-6 border-t border-neutral-900 flex justify-between items-center">
        <div v-if="isSaving" class="text-xs text-neutral-400">
          Saving settings...
        </div>
        <div v-else class="text-xs text-neutral-500">
          Settings saved to database
        </div>
        <button
          @click="emit('close')"
          class="px-6 py-2 bg-synth-neon text-black rounded-lg font-black text-sm uppercase hover:bg-white transition-colors"
        >
          Done
        </button>
      </div>

    </div>
  </div>
</template>
