<script setup>
import { ref } from 'vue'
import { Save, Upload, Download, History, AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { exportSession, importSession } from '@/lib/session-manager'

const uiStore = useUiStore()
const isExporting = ref(false)
const isImporting = ref(false)
const status = ref({ type: '', message: '' })
const fileInput = ref(null)

const handleExport = async () => {
  isExporting.value = true
  status.value = { type: '', message: '' }
  try {
    await exportSession()
    status.value = { type: 'success', message: 'Session exported successfully' }
  } catch (err) {
    status.value = { type: 'error', message: 'Error exporting session !' }
  } finally {
    isExporting.value = false
  }
}

const triggerImport = () => {
  fileInput.value.click()
}

const handleImport = async (event) => {
  const file = event.target.files[0]
  if (!file) return

  isImporting.value = true
  status.value = { type: '', message: '' }

  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const result = await importSession(e.target.result)
      status.value = { 
        type: 'success', 
        message: `Session imported : ${result.count} patches loaded` 
      }
      // Optional: close after a delay
      setTimeout(() => uiStore.isSessionOpen = false, 2000)
    } catch (err) {
      status.value = { type: 'error', message: 'Error importing session !' }
    } finally {
      isImporting.value = false
      event.target.value = '' // Reset input
    }
  }
  reader.readAsText(file)
}
</script>

<template>
  <div v-if="uiStore.isSessionOpen" class="fixed inset-0 z-[110] flex items-center justify-center p-4">
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="uiStore.isSessionOpen = false"></div>

    <!-- Modal Content -->
    <div class="relative w-full max-w-md bg-neutral-900/90 border border-white/10 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in duration-300">
      
      <!-- Header -->
      <div class="p-6 border-b border-white/5 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-synth-neon/10 rounded-lg">
            <History class="w-6 h-6 text-synth-neon" />
          </div>
          <div>
            <h2 class="text-xl font-bold text-white tracking-tight">User Session</h2>
            <p class="text-[10px] text-white/40 uppercase tracking-widest">Backup & Restore</p>
          </div>
        </div>
        <button @click="uiStore.isSessionOpen = false" class="p-2 hover:bg-white/5 rounded-full transition-colors">
          <X class="w-5 h-5 text-white/60" />
        </button>
      </div>

      <!-- Body -->
      <div class="p-8 space-y-8">
        
        <!-- Info Box -->
        <div class="p-4 bg-white/5 border border-white/10 rounded-2xl flex gap-4">
          <AlertTriangle class="w-5 h-5 text-yellow-500 shrink-0" />
          <p class="text-xs text-white/70 leading-relaxed">
            Exporting the session will save all your <strong>presets</strong>, <strong>MIDI mappings</strong> and <strong>settings</strong> in a single file. Loading a session will overwrite the current data.
          </p>
        </div>

        <!-- Actions -->
        <div class="grid grid-cols-2 gap-4">
          <!-- Export -->
          <button 
            @click="handleExport"
            :disabled="isExporting"
            class="group flex flex-col items-center justify-center gap-3 p-6 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 hover:border-synth-neon/50 transition-all active:scale-95 disabled:opacity-50"
          >
            <div class="p-3 bg-synth-neon/20 rounded-xl group-hover:scale-110 transition-transform">
              <Download v-if="!isExporting" class="w-6 h-6 text-synth-neon" />
              <Loader2 v-else class="w-6 h-6 text-synth-neon animate-spin" />
            </div>
            <span class="text-xs font-bold text-white tracking-widest uppercase">Export</span>
          </button>

          <!-- Import -->
          <button 
            @click="triggerImport"
            :disabled="isImporting"
            class="group flex flex-col items-center justify-center gap-3 p-6 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 hover:border-purple-500/50 transition-all active:scale-95 disabled:opacity-50"
          >
            <div class="p-3 bg-purple-500/20 rounded-xl group-hover:scale-110 transition-transform">
              <Upload v-if="!isImporting" class="w-6 h-6 text-purple-400" />
              <Loader2 v-else class="w-6 h-6 text-purple-400 animate-spin" />
            </div>
            <span class="text-xs font-bold text-white tracking-widest uppercase">Import</span>
          </button>
        </div>

        <!-- Hidden Input -->
        <input 
          type="file" 
          ref="fileInput" 
          class="hidden" 
          accept=".json" 
          @change="handleImport"
        />

        <!-- Status Message -->
        <div 
          v-if="status.message" 
          :class="[
            'p-4 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-2',
            status.type === 'success' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
          ]"
        >
          <CheckCircle2 v-if="status.type === 'success'" class="w-4 h-4" />
          <AlertTriangle v-else class="w-4 h-4" />
          <span class="text-xs font-medium">{{ status.message }}</span>
        </div>

      </div>

      <!-- Footer -->
      <div class="p-4 bg-black/40 border-t border-white/5 text-center">
        <p class="text-[9px] text-white/20 uppercase tracking-[0.2em]">Sycore Session Snapshot Protocol v1.0</p>
      </div>

    </div>
  </div>
</template>

<style scoped>
.text-synth-neon {
  color: #00ffcc;
  text-shadow: 0 0 10px rgba(0, 255, 204, 0.3);
}
.bg-synth-neon\/20 {
  background-color: rgba(0, 255, 204, 0.2);
}
</style>
