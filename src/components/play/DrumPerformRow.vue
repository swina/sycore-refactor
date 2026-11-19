<script setup>
// The Drum Machine's performance row (Performance play view; lib/drum-perform.ts): eight dials in a row —
// Drum CC 1–4 (a CC on the Drum Machine's channel through its MIDI Flow cables — in Live, map them to
// the Drum Rack's Macros), Dyn, Density, Humanize and Swing. Right-click a dial: MIDI Learn; double-click:
// its default. ⚙ opens the CC setup (each knob's name and CC number) in a modal of its own.
import { ref } from 'vue'
import KnobDial from '@/components/ui/KnobDial.vue'
import { drumPerform } from '@/lib/drum-perform'
import { setDrumCc } from '@/lib/drum-perform-send'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { useMidiContextMenu } from '@/composables/useMidiContextMenu'

const drumStore = useDrumMachineStore()
const { openMenu } = useMidiContextMenu()
const setupOpen = ref(false)
const learn = (e, name, label) => openMenu(e, { name, label: `Drum Machine: ${label}` })
const AMBER = '#f59e0b'
const SIZE = 36
const pct = v => `${Math.round(v)}%`
const int = v => `${Math.round(v)}`
const setCcNum = (k, v) => { k.cc = Math.max(0, Math.min(127, Math.round(Number(v) || 0))) }
</script>

<template>
  <div class="flex items-start gap-2 text-[10px] font-mono">
    <div class="flex-1 grid grid-cols-8 gap-1">
      <div v-for="(k, i) in drumPerform.knobs" :key="i" data-drum-cc
           class="flex flex-col items-center gap-0.5 min-w-0"
           :title="`${k.name}: CC ${k.cc} on the Drum Machine's MIDI channel (through its MIDI Flow cables) — right-click: MIDI Learn · ⚙: names and CCs`"
           @contextmenu.prevent="learn($event, `dm_cc_${i}`, `CC ${i + 1} (${k.name})`)">
        <KnobDial :model-value="k.value" :min="0" :max="127" :step="1" :size="SIZE" :color="AMBER" :format="int"
                  @change="v => setDrumCc(i, v)" />
        <span class="text-[9px] uppercase text-neutral-400 truncate max-w-full">{{ k.name }}</span>
      </div>
      <div class="flex flex-col items-center gap-0.5" data-drum-dial="dyn"
           title="Dyn: the velocities squeezed toward the middle (< 100 %) or spread (> 100 %) — ghost notes and accents · right-click: MIDI Learn"
           @contextmenu.prevent="learn($event, 'dm_dyn', 'Dynamics')">
        <KnobDial v-model="drumPerform.dynamics" :min="0" :max="200" :step="5" :default-val="100" :size="SIZE" :color="AMBER" :format="pct" />
        <span class="text-[9px] uppercase text-neutral-500">Dyn</span>
      </div>
      <div class="flex flex-col items-center gap-0.5" data-drum-dial="density"
           title="Density: the weakest steps of the bar go first (127: all) — with the Rig's Density the lower plays · right-click: MIDI Learn"
           @contextmenu.prevent="learn($event, 'dm_density', 'Density')">
        <KnobDial v-model="drumPerform.density" :min="0" :max="127" :step="1" :default-val="127" :size="SIZE" :color="AMBER" :format="int" />
        <span class="text-[9px] uppercase text-neutral-500">Dens</span>
      </div>
      <div class="flex flex-col items-center gap-0.5" data-drum-dial="humanize"
           title="Humanize: each hit a little off in time (up to ±8 ms) and velocity (up to ±12) · right-click: MIDI Learn"
           @contextmenu.prevent="learn($event, 'dm_humanize', 'Humanize')">
        <KnobDial v-model="drumPerform.humanize" :min="0" :max="100" :step="1" :default-val="0" :size="SIZE" :color="AMBER" :format="int" />
        <span class="text-[9px] uppercase text-neutral-500">Hum</span>
      </div>
      <div class="flex flex-col items-center gap-0.5" data-drum-dial="swing"
           title="Swing (the Drum Machine's) · right-click: MIDI Learn"
           @contextmenu.prevent="learn($event, 'dm_swing', 'Swing')">
        <KnobDial :model-value="drumStore.swing" :min="0" :max="80" :step="1" :default-val="0" :size="SIZE" :color="AMBER" :format="pct"
                  @change="v => (drumStore.swing = v)" />
        <span class="text-[9px] uppercase text-neutral-500">Swing</span>
      </div>
    </div>
    <button type="button" class="mt-2 px-1 rounded border border-neutral-800 text-neutral-500 hover:text-white"
            title="Drum CC: names and CC numbers" @click="setupOpen = true">⚙</button>

    <!-- CC setup: on the page, centred on the screen -->
    <Teleport to="body">
      <div v-if="setupOpen" class="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"
           @mousedown.self="setupOpen = false" @keydown.esc="setupOpen = false">
        <div data-drum-cc-setup class="w-full max-w-xs rounded-xl border border-amber-500/30 bg-neutral-950 p-4 flex flex-col gap-3 font-mono shadow-2xl">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-black uppercase tracking-[0.2em] text-amber-400">Drum CC</h3>
            <button type="button" class="text-neutral-500 hover:text-white" title="Close" @click="setupOpen = false">✕</button>
          </div>
          <p class="text-[9px] text-neutral-500 leading-snug">
            Each dial sends its CC on the Drum Machine's MIDI channel, through its MIDI Flow cables. In Live: MIDI Map them to the Drum Rack's Macros.
          </p>
          <div class="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2 gap-y-1.5 text-[11px]">
            <template v-for="(k, i) in drumPerform.knobs" :key="i">
              <span class="text-neutral-600">{{ i + 1 }}</span>
              <input v-model="k.name" maxlength="12" data-drum-cc-name placeholder="Name"
                     class="min-w-0 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-amber-200 outline-none focus:border-amber-500" />
              <span class="text-neutral-500 text-[10px]">CC</span>
              <input type="number" min="0" max="127" :value="k.cc" data-drum-cc-num
                     class="w-14 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-amber-200 outline-none focus:border-amber-500 [color-scheme:dark]"
                     @change="setCcNum(k, $event.target.value)" />
            </template>
          </div>
          <button type="button" class="self-end h-7 px-4 rounded bg-amber-500 text-black text-[10px] font-bold uppercase hover:bg-amber-300"
                  @click="setupOpen = false">Done</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
