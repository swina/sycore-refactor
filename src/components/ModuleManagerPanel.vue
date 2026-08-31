<script setup>
import { ref, computed } from 'vue'
import { X, LayoutGrid, AlertCircle } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/useAuthStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { moduleRegistry, modulesByCategory, CATEGORY_META } from '@/core/modules/registry'

const props = defineProps({ isOpen: Boolean })
const emit = defineEmits(['close'])

const authStore = useAuthStore()
const configStore = useConfigStore()

const savingIds = ref(new Set())
const errorId = ref(null)

// Module Manager can't list (and disable) itself — it's the only UI for
// re-enabling a disabled module, so toggling it off here would permanently
// lock it out (see useConfigStore.isModuleEnabled).
const groups = computed(() =>
  modulesByCategory()
    .map(({ category, items }) => ({
      category,
      title: CATEGORY_META[category]?.title || category,
      icon: CATEGORY_META[category]?.icon,
      items: items.filter(m => m.id !== 'module-manager'),
    }))
    .filter(g => g.items.length > 0)
)

const enabledCount = computed(() =>
  moduleRegistry.filter(m => configStore.isModuleEnabled(m.id)).length
)

async function toggleModule(mod) {
  const next = !configStore.isModuleEnabled(mod.id)
  savingIds.value = new Set(savingIds.value).add(mod.id)
  errorId.value = null
  try {
    await configStore.setModuleEnabled(mod.id, next, { label: mod.label })
  } catch (e) {
    console.error('[ModuleManagerPanel] Failed to save module state', e)
    errorId.value = mod.id
  } finally {
    const next2 = new Set(savingIds.value)
    next2.delete(mod.id)
    savingIds.value = next2
  }
}
</script>

<template>
  <Transition name="sy-drawer">
    <div
      v-if="isOpen && authStore.isAdmin"
      class="fixed inset-0 w-full max-w-full bg-neutral-950 border-l border-neutral-900 shadow-2xl z-[460] overflow-hidden flex flex-col"
    >
      <!-- Header -->
      <div class="p-6 border-b border-neutral-900 flex items-center justify-between bg-black/50 backdrop-blur-xl shrink-0">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-synth-neon/10 rounded-lg">
            <LayoutGrid class="w-5 h-5 text-synth-neon" />
          </div>
          <div>
            <h2 class="text-xl font-black uppercase tracking-tight">Module Manager</h2>
            <p class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
              {{ enabledCount }} / {{ moduleRegistry.length }} modules enabled — controls the launcher, toolbar, footer &amp; dial
            </p>
          </div>
        </div>
        <button @click="emit('close')" class="p-2 hover:bg-neutral-900 rounded-lg text-neutral-500 hover:text-white transition-colors">
          <X class="w-6 h-6" />
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 w-3/4 m-auto overflow-y-auto p-6 space-y-8 custom-scrollbar">
        <section v-for="group in groups" :key="group.category">
          <div class="flex items-center gap-2 mb-3 px-1">
            <component :is="group.icon" class="w-4 h-4 text-synth-neon" />
            <h3 class="text-[11px] font-black uppercase tracking-[0.3em] text-neutral-500 font-mono">
              {{ group.title }}
            </h3>
            <div class="flex-1 h-px bg-neutral-800/60" />
          </div>

          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <div
              v-for="mod in group.items"
              :key="mod.id"
              class="group relative rounded-xl border overflow-hidden transition-all duration-200"
              :class="configStore.isModuleEnabled(mod.id)
                ? 'border-neutral-800/80 bg-neutral-900/40 hover:border-synth-neon/30'
                : 'border-neutral-900 bg-neutral-950/60 opacity-50 hover:opacity-75'"
              :style="{ backgroundImage: mod.bg ? `linear-gradient(to bottom, rgba(10,10,10,0.55), rgba(10,10,10,0.75)), url(${mod.bg})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }"
            >
              <div class="p-3 flex flex-col gap-3 min-h-[104px]">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <component :is="mod.icon" class="w-4 h-4 text-synth-neon shrink-0" />
                    <span class="text-[10px] font-bold uppercase tracking-[0.1em] text-neutral-200 truncate">
                      {{ mod.label }}
                    </span>
                  </div>
                  <span
                    v-if="mod.badge"
                    class="text-[7px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0"
                  >
                    {{ mod.badge }}
                  </span>
                </div>

                <div class="mt-auto flex items-center justify-between">
                  <span class="text-[8px] font-mono text-neutral-500 truncate">{{ mod.id }}</span>
                  <button
                    :disabled="savingIds.has(mod.id)"
                    @click="toggleModule(mod)"
                    :class="['w-9 h-5 rounded-full transition-colors relative shrink-0 disabled:opacity-50',
                      configStore.isModuleEnabled(mod.id) ? 'bg-synth-neon' : 'bg-neutral-700']"
                  >
                    <span :class="['absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform shadow',
                      configStore.isModuleEnabled(mod.id) ? 'translate-x-4 bg-black' : 'translate-x-0 bg-white']" />
                  </button>
                </div>
              </div>

              <div v-if="errorId === mod.id" class="absolute inset-x-0 bottom-0 bg-red-950/90 border-t border-red-500/40 px-2 py-1 flex items-center gap-1">
                <AlertCircle class="w-3 h-3 text-red-400 shrink-0" />
                <span class="text-[8px] text-red-400 font-mono truncate">Save failed</span>
              </div>
            </div>
          </div>
        </section>

        <p class="text-[10px] font-mono text-neutral-600 leading-relaxed">
          Disabling a module hides it from the launcher and every toolbar entry point immediately, and blocks it
          from being opened via MIDI action mappings or keyboard shortcuts. It does not remove the module's code
          from the app. Changes save immediately and share the same configuration as Admin Panel's Toolbar Settings.
        </p>
      </div>
    </div>
  </Transition>
</template>
