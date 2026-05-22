<script setup>
// variant: primary | ghost | danger | icon
// size:    sm | md | lg
const props = defineProps({
  variant:  { type: String,  default: 'primary' },
  size:     { type: String,  default: 'md' },
  loading:  { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  type:     { type: String,  default: 'button' },
})

const textSizeClasses = {
  sm: 'px-3 py-1.5 text-[9px]',
  md: 'px-4 py-2 text-[10px]',
  lg: 'px-6 py-3 text-xs',
}

const iconSizeClasses = {
  sm: 'w-7 h-7',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
}

const variantClasses = {
  primary: 'bg-synth-neon text-black hover:bg-white shadow-sm',
  ghost:   'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-white',
  danger:  'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white',
  icon:    'text-neutral-400 hover:text-white hover:bg-neutral-800',
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="[
      'inline-flex items-center justify-center gap-2 font-black uppercase tracking-widest rounded-lg transition-all',
      'disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 disabled:active:scale-100',
      variant === 'icon' ? (iconSizeClasses[size] ?? iconSizeClasses.md) : (textSizeClasses[size] ?? textSizeClasses.md),
      variantClasses[variant] ?? variantClasses.primary,
    ]"
  >
    <span v-if="loading" class="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
    <slot />
  </button>
</template>
