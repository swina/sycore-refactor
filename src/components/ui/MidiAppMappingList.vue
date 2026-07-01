<script setup>
import { X } from 'lucide-vue-next'
import { useMappingStore } from '@/stores/useMappingStore'
import { APP_ACTION_LABELS } from '@/lib/app-midi-actions'

const emit = defineEmits(['close'])
const mappingStore = useMappingStore()

function remove(id) {
  const filtered = mappingStore.appMidiMappings.filter(m => m.id !== id)
  mappingStore.saveAppMidiMappings(filtered)
}
</script>

<template>
  <div class="fixed inset-0 z-[160] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4" @click.self="emit('close')">
    <div class="bg-neutral-900 border border-synth-neon/30 rounded-2xl p-5 w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
      <div class="flex items-center justify-between border-b border-neutral-800 pb-3 mb-3">
        <h2 class="text-xs font-black text-white tracking-widest uppercase">MIDI Mapped Controls</h2>
        <button @click="emit('close')" class="text-neutral-500 hover:text-rose-500 transition-colors p-1">
          <X class="w-4 h-4" />
        </button>
      </div>

      <div v-if="mappingStore.appMidiMappings.length === 0" class="text-neutral-500 text-xs italic text-center py-8">
        No MIDI mapped controls.
      </div>

      <div v-else class="overflow-y-auto custom-scrollbar">
        <table class="w-full text-[10px] font-mono">
          <thead>
            <tr class="text-neutral-500 uppercase tracking-wider text-[9px] border-b border-neutral-800">
              <th class="text-left py-2 px-1 font-bold">Device</th>
              <th class="text-left py-2 px-1 font-bold">CC / Note</th>
              <th class="text-left py-2 px-1 font-bold">Channel</th>
              <th class="text-left py-2 px-1 font-bold">Action / Param</th>
              <th class="py-2 px-1 w-8"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in mappingStore.appMidiMappings" :key="m.id" class="border-b border-neutral-800/50 hover:bg-neutral-800/30">
              <td class="py-2 px-1 text-neutral-400">{{ m.device || 'Any' }}</td>
              <td class="py-2 px-1">
                <span class="text-cyan-400">{{ m.cc != null ? 'CC ' + m.cc : 'Note ' + m.note }}</span>
              </td>
              <td class="py-2 px-1 text-violet-400">{{ m.channel === -1 ? 'Any' : 'CH ' + (m.channel + 1) }}</td>
              <td class="py-2 px-1 text-neutral-200">{{ APP_ACTION_LABELS[m.action] || m.action }}</td>
              <td class="py-2 px-1 text-center">
                <button @click="remove(m.id)" class="text-neutral-500 hover:text-red-400 transition-colors p-0.5">
                  <X class="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
