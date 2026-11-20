<script setup>
// The key / scale the Chord Prog's progression sits in (detected from its chords: the chain when on,
// else the slot), as the Sequencer uses it — and AUTO SEQ: the Sequencer's lanes generate again
// when it changes.
import { useChordProgStore } from '@/stores/useChordProgStore'
import { useUiStore } from '@/stores/useUiStore'

const store = useChordProgStore()
const uiStore = useUiStore()
</script>

<template>
  <div class="flex items-center gap-1 shrink-0" @pointerdown.stop @mousedown.stop>
    <span class="px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-900 font-mono text-[10px] font-bold text-purple-200 whitespace-nowrap"
          :title="`Key / scale of the progression (from its chords${store.chainEnabled ? ', the chain' : ''}): what the Sequencer's Key: CP, the Rig's GEN and AUTO SEQ use`">
      <span class="text-neutral-500">Key</span> {{ store.detectedKey?.label ?? '—' }}
    </span>
    <button type="button"
            :class="['px-1.5 py-0.5 rounded border font-mono text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors',
              uiStore.seqAutoRegen ? 'bg-amber-500 border-amber-300 text-black' : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white']"
            title="AUTO SEQ: when the progression's key / scale changes, the Sequencer's lanes in use (Main / Bass / Arp) generate again in it"
            @click.stop="uiStore.seqAutoRegen = !uiStore.seqAutoRegen">Auto Seq {{ uiStore.seqAutoRegen ? 'On' : 'Off' }}</button>
  </div>
</template>
