<script setup>
import { defineProps, computed } from 'vue'
import { useMidiStore } from '@/stores/useMidiStore'
import { usePresetStore } from '@/stores/usePresetStore'

const midiStore = useMidiStore()
const presetStore = usePresetStore()

const props = defineProps({
  cat: { type: Object, required: true },
})

// Use the same active data source as ResultsPanel
const activeData = computed(() => {
  if (presetStore.useAlternativeEngine && presetStore.lastPreset?.abVariant) {
    return presetStore.lastPreset.abVariant.data || {}
  }
  return presetStore.lastPreset?.data || {}
})

function getVal(cfg) {
  const name = typeof cfg === 'string' ? cfg : cfg.name
  const min = typeof cfg === 'object' ? (Number(cfg.min) || 0) : 0
  const max = typeof cfg === 'object' ? (Number(cfg.max) || 127) : 127
  const val = activeData.value?.[name] ?? min
  // Strict clamping to respect configured hardware bounds
  return Math.max(min, Math.min(max, Number(val)))
}

function getPercent(cfg) {
  const min = Number(cfg.min) || 0
  const max = Number(cfg.max) || 127
  const val = getVal(cfg)
  if (max === min) return 0
  return ((val - min) / (max - min)) * 100
}

function getActiveOption(cfg) {
  const val = getVal(cfg)
  const options = cfg.options || []
  return options.find(o => o.value === val) || { label: val.toString(), value: val }
}

function handleValueUpdate(cfg, rawValue) {
  const min = Number(cfg.min) || 0
  const max = Number(cfg.max) || 127
  const clamped = Math.max(min, Math.min(max, Math.round(rawValue)))
  
  presetStore.updateFieldValue(cfg.name, clamped)
  midiStore.sendCC(cfg.cc, clamped)
}

function handleKeyNudge(cfg, event) {
  const cur = getVal(cfg)
  const step = cfg.step ?? 1
  const min = Number(cfg.min) || 0
  const max = Number(cfg.max) || 127
  let next = cur
  if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
    next = cur - step
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
    next = cur + step
  } else {
    return
  }
  event.preventDefault()
  handleValueUpdate(cfg, next)
}

function startHDrag(cfg, event) {
  event.preventDefault()
  const rect = event.currentTarget.getBoundingClientRect()
  const min = Number(cfg.min) || 0
  const max = Number(cfg.max) || 127
  const update = (e) => {
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
    const rawVal = min + (x / rect.width) * (max - min)
    handleValueUpdate(cfg, rawVal)
  }
  update(event)
  const onMove = (e) => update(e)
  const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function startVDrag(cfg, event) {
  event.preventDefault()
  const rect = event.currentTarget.getBoundingClientRect()
  const min = Number(cfg.min) || 0
  const max = Number(cfg.max) || 127
  const update = (e) => {
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
    const rawVal = min + (1 - y / rect.height) * (max - min)
    handleValueUpdate(cfg, rawVal)
  }
  update(event)
  const onMove = (e) => update(e)
  const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
</script>

<template>
    <div v-if="cat" v-for="cfg in cat.controllers" :key="cfg.id || cfg.cc" class="mb-2">
        <!-- SWITCH -->
        <div
            v-if="cfg.type === 'SWITCH' || (cfg.max <= 1 && cfg.min === 0 && !cfg.type)"
            tabindex="0"
            @click="handleValueUpdate(cfg, getVal(cfg) >= 1 ? 0 : 1)"
            @keydown="handleKeyNudge(cfg, $event)"
            class="bg-black/60 border border-neutral-900 rounded-xl p-3 flex items-center justify-between cursor-pointer outline-none focus:ring-1 select-none hover:border-neutral-700 transition-colors"
            :style="{ '--tw-ring-color': cat.color }"
        >
            <span class="text-[12px] font-mono font-bold text-white uppercase truncate pr-2">{{ cfg.label }}</span>
            <div
            :class="['px-2 py-0.5 rounded border text-[8px] font-black uppercase transition-all', getVal(cfg) >= 1 ? 'text-black' : 'bg-neutral-900 border-neutral-800 text-white']"
            :style="getVal(cfg) >= 1 ? { backgroundColor: cat.color, borderColor: cat.color, boxShadow: `0 0 10px ${cat.color}55` } : {}"
            >{{ getVal(cfg) >= 1 ? 'ON' : 'OFF' }}</div>
        </div>

        <!-- MULTI -->
        <div
            v-else-if="cfg.type === 'MULTI'"
            class="bg-black/60 border border-neutral-900 rounded-xl p-3 space-y-2.5"
        >
            <div class="flex justify-between items-center">
                <span class="text-[12px] font-mono font-bold text-white uppercase truncate pr-2">{{ cfg.label }}</span>
                <span class="text-[10px] font-mono font-bold px-1 rounded uppercase"
                    :style="{ color: cat.color, backgroundColor: cat.color + '1A' }">
                    {{ getActiveOption(cfg).label }}
                </span>
            </div>
            <div class="flex flex-wrap gap-1">
                <template v-if="(cfg.options || []).length > 0">
                    <button
                    v-for="opt in cfg.options" :key="opt.value"
                    @click="handleValueUpdate(cfg, opt.value)"
                    :class="['min-w-[40px] h-6 px-2 rounded border text-[8px] font-mono font-bold uppercase transition-all', getActiveOption(cfg).value === opt.value ? 'text-black' : 'bg-neutral-900/50 border-neutral-800 text-white hover:border-neutral-700']"
                    :style="getActiveOption(cfg).value === opt.value ? { backgroundColor: cat.color, borderColor: cat.color } : {}"
                    >{{ opt.label }}</button>
                </template>
                <template v-else>
                    <button
                    v-for="i in (Number(cfg.max) + 1)" :key="i - 1"
                    @click="handleValueUpdate(cfg, i - 1)"
                    :class="['min-w-[24px] h-6 px-1 rounded border text-[9px] font-mono font-bold transition-all', getVal(cfg) === i - 1 ? 'text-black' : 'bg-neutral-900/50 border-neutral-800 text-white hover:border-neutral-700']"
                    :style="getVal(cfg) === i - 1 ? { backgroundColor: cat.color, borderColor: cat.color } : {}"
                    >{{ i - 1 }}</button>
                </template>
            </div>
        </div>

        <!-- VERTICAL SLIDER -->
        <div
            v-else-if="cfg.type === 'SLIDER_V'"
            class="bg-black/60 border border-neutral-900 rounded-xl p-3 flex flex-col items-center gap-3"
        >
            <div class="w-full flex justify-between items-center bg-neutral-900/40 rounded px-1.5 py-0.5">
            <span class="text-[12px] font-mono font-bold text-white uppercase truncate pr-2">{{ cfg.label }}</span>
            <span class="text-[12px] font-mono font-bold" :style="{ color: cat.color }">{{ Math.round(getVal(cfg)) }}</span>
            </div>
            <div
            class="h-32 w-8 bg-neutral-950 rounded-lg relative overflow-hidden border border-neutral-900 cursor-ns-resize shadow-inner select-none hover:border-neutral-700 transition-colors"
            @mousedown="startVDrag(cfg, $event)"
            >
            <div class="absolute inset-x-0 h-full flex flex-col justify-between py-2 pointer-events-none opacity-20">
                <div v-for="n in 5" :key="n" class="w-full h-px bg-white/20" />
            </div>
            <div
                class="absolute bottom-0 left-0 w-full border-t border-white/30 transition-all duration-75"
                :style="{ height: getPercent(cfg) + '%', backgroundColor: cat.color, boxShadow: `0 0 15px ${cat.color}66` }"
            >
                <div class="w-full h-1 bg-white/40 absolute top-0" />
            </div>
            </div>
        </div>

        <!-- HORIZONTAL SLIDER (default) -->
        <div
            v-else
            tabindex="0"
            @mousedown="startHDrag(cfg, $event)"
            @keydown="handleKeyNudge(cfg, $event)"
            class="bg-black/60 border border-neutral-900 rounded-xl p-3 flex flex-col gap-2 outline-none focus:ring-1 focus:ring-white/20 cursor-ew-resize select-none hover:border-neutral-700 transition-colors"
            :style="{ '--tw-ring-color': cat.color }"
        >
            <div class="flex justify-between items-center">
            <span class="text-[12px] font-mono font-bold text-white uppercase truncate pr-2">{{ cfg.label }}</span>
            <span class="text-[12px] font-mono font-bold" :style="{ color: cat.color }">{{ Math.round(getVal(cfg)) }}</span>
            </div>
            <div class="h-3 bg-neutral-950 rounded-full overflow-hidden border border-neutral-900 pointer-events-none p-[2px]">
            <div class="h-full rounded-full transition-all duration-75" :style="{ width: getPercent(cfg) + '%', backgroundColor: cat.color, boxShadow: `0 0 8px ${cat.color}99` }" />
            </div>
        </div>
    </div>
</template>