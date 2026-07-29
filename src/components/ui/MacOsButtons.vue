<script setup>
defineEmits(['close', 'minimize', 'maximize'])
</script>

<template>
  <div class="flex items-center gap-1.5 shrink-0 group/traffic">
    <button
      class="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors flex items-center justify-center"
      title="Close"
      @click.stop="$emit('close')"
    >
      <svg class="w-1.5 h-1.5 opacity-0 group-hover/traffic:opacity-100 transition-opacity" viewBox="0 0 8 8" fill="none">
        <path d="M1 1l6 6M7 1l-6 6" stroke="rgba(0,0,0,0.6)" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>

    <button
      class="w-3 h-3 rounded-full bg-yellow-400/80 hover:bg-yellow-400 transition-colors flex items-center justify-center"
      title="Minimize"
      @click.stop="$emit('minimize')"
    >
      <svg class="w-1.5 h-1.5 opacity-0 group-hover/traffic:opacity-100 transition-opacity" viewBox="0 0 8 8" fill="none">
        <path d="M1 4h6" stroke="rgba(0,0,0,0.6)" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>

    <button
      class="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-500 transition-colors flex items-center justify-center"
      title="Maximize / Restore"
      @click.stop="$emit('maximize')"
    >
      <svg class="w-1.5 h-1.5 opacity-0 group-hover/traffic:opacity-100 transition-opacity" viewBox="0 0 8 8" fill="none">
        <path d="M1 7L7 1M5 1h2v2M3 7H1V5" stroke="rgba(0,0,0,0.6)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  </div>
</template>
