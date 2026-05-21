<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { X, ChevronLeft, ChevronRight, Play, Pause, Maximize2, Minimize2 } from 'lucide-vue-next'
import slidesData from '@/data/slides.json'
import helpSlidesData from '@/data/help_first_start.json'

const props = defineProps({
  isOpen: { type: Boolean, required: true },
  source: { type: String, default: 'default' },
})

const emit = defineEmits(['close'])

const rawData = computed(() => {
  if (props.source === 'help') return helpSlidesData
  return slidesData.slides || []
})

const slides = computed(() => {
  const data = rawData.value
  if (props.source === 'help') {
    return data.map((item) => ({
      src: item.slide.replace('./public/', '/'),
      title: item.title,
    }))
  }
  return data.map((src) => ({ src, title: '' }))
})

const currentIndex = ref(0)
const isPlaying = ref(false)
const isFullscreen = ref(false)
const slideshowInterval = ref(null)
const slideshowRef = ref(null)

function nextSlide() {
  if (slides.value.length === 0) return
  currentIndex.value = (currentIndex.value + 1) % slides.value.length
}

function prevSlide() {
  if (slides.value.length === 0) return
  currentIndex.value = (currentIndex.value - 1 + slides.value.length) % slides.value.length
}

function goToSlide(index) {
  currentIndex.value = index
}

function togglePlay() {
  isPlaying.value = !isPlaying.value
  if (isPlaying.value) startAutoplay()
  else stopAutoplay()
}

function startAutoplay() {
  stopAutoplay()
  slideshowInterval.value = setInterval(() => nextSlide(), 4000)
}

function stopAutoplay() {
  if (slideshowInterval.value) {
    clearInterval(slideshowInterval.value)
    slideshowInterval.value = null
  }
}

function toggleFullscreen() {
  if (!slideshowRef.value) return
  if (!document.fullscreenElement) {
    slideshowRef.value.requestFullscreen().then(() => { isFullscreen.value = true }).catch(() => {})
  } else {
    document.exitFullscreen()
    isFullscreen.value = false
  }
}

function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}

const currentSlide = computed(() => slides.value[currentIndex.value])

function handleKeyDown(e) {
  if (!props.isOpen) return
  if (e.key === 'ArrowRight') { nextSlide(); stopAutoplay(); isPlaying.value = false }
  else if (e.key === 'ArrowLeft') { prevSlide(); stopAutoplay(); isPlaying.value = false }
  else if (e.key === 'Escape') {
    if (document.fullscreenElement) document.exitFullscreen()
    else emit('close')
  }
  else if (e.key === ' ') { e.preventDefault(); togglePlay() }
}

function preloadImages() {
  slides.value.forEach((s) => { const img = new Image(); img.src = s.src })
}

watch(() => props.isOpen, (open) => {
  if (open) {
    currentIndex.value = 0
    isPlaying.value = false
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    preloadImages()
  } else {
    stopAutoplay()
    isPlaying.value = false
    document.removeEventListener('keydown', handleKeyDown)
    document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }
})

onMounted(() => {
  if (props.isOpen) {
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
  }
})

onUnmounted(() => {
  stopAutoplay()
  document.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
})
</script>

<template>
  <Transition name="fade">
    <div v-if="isOpen" class="fixed inset-0 z-[800] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 md:p-8">

      <!-- Close Button -->
      <button
        @click="emit('close')"
        class="absolute top-4 right-4 z-[110] p-3 text-neutral-400 hover:text-white bg-neutral-900/80 hover:bg-neutral-800 rounded-full border border-neutral-800 transition-all shadow-lg"
        title="Close (Esc)"
      >
        <X class="w-6 h-6" />
      </button>

      <!-- Slideshow Container -->
      <div
        ref="slideshowRef"
        class="relative w-full max-w-5xl aspect-[16/9] bg-neutral-950 rounded-2xl border border-neutral-800 overflow-hidden shadow-2xl flex items-center justify-center group"
      >
        <!-- Slide Image with Title -->
        <div class="relative w-full h-full">
          <Transition name="slide-fade" mode="out-in">
            <div :key="currentIndex" class="w-full h-full">
              <img
                :src="currentSlide?.src"
                :alt="currentSlide?.title || 'Slideshow Slide'"
                class="w-full h-full object-contain select-none"
              />
              <div v-if="currentSlide?.title" class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-12 pb-6 px-8">
                <h2 class="text-lg md:text-xl font-black uppercase tracking-widest text-synth-neon drop-shadow-lg">
                  {{ currentSlide.title }}
                </h2>
              </div>
            </div>
          </Transition>
        </div>

        <!-- Left navigation arrow -->
        <button
          @click="prevSlide(); stopAutoplay(); isPlaying = false"
          class="absolute left-4 p-3 rounded-full bg-black/60 hover:bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white transition-all opacity-0 group-hover:opacity-100 shadow-md backdrop-blur-sm"
          title="Previous Slide"
        >
          <ChevronLeft class="w-6 h-6" />
        </button>

        <!-- Right navigation arrow -->
        <button
          @click="nextSlide(); stopAutoplay(); isPlaying = false"
          class="absolute right-4 p-3 rounded-full bg-black/60 hover:bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white transition-all opacity-0 group-hover:opacity-100 shadow-md backdrop-blur-sm"
          title="Next Slide"
        >
          <ChevronRight class="w-6 h-6" />
        </button>

        <!-- Top Panel: Slide Info & Control Buttons -->
        <div class="absolute top-4 left-4 right-4 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
          <div class="px-4 py-1.5 rounded-full bg-black/60 border border-neutral-800 text-xs font-mono text-neutral-300 backdrop-blur-sm">
            {{ currentIndex + 1 }} / {{ slides.length }}
          </div>
          <div class="flex items-center gap-2">
            <button
              @click="togglePlay"
              class="p-2 rounded-lg bg-black/60 hover:bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white transition-all backdrop-blur-sm"
              :title="isPlaying ? 'Pause Autoplay (Space)' : 'Start Autoplay (Space)'"
            >
              <Pause v-if="isPlaying" class="w-4 h-4" />
              <Play v-else class="w-4 h-4" />
            </button>
            <button
              @click="toggleFullscreen"
              class="p-2 rounded-lg bg-black/60 hover:bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white transition-all backdrop-blur-sm"
              :title="isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'"
            >
              <Minimize2 v-if="isFullscreen" class="w-4 h-4" />
              <Maximize2 v-else class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Progress Bar (Autoplay) -->
        <div
          v-if="isPlaying"
          :key="`progress-${currentIndex}`"
          class="absolute bottom-0 left-0 h-1 bg-synth-neon animate-progress"
        />

        <!-- Dots indicators -->
        <div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-black/40 border border-neutral-800/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
          <button
            v-for="(slide, idx) in slides"
            :key="idx"
            @click="goToSlide(idx); stopAutoplay(); isPlaying = false"
            class="w-2.5 h-2.5 rounded-full transition-all duration-300"
            :class="idx === currentIndex ? 'bg-synth-neon scale-125 shadow-[0_0_8px_rgba(0,163,112,0.8)]' : 'bg-neutral-600 hover:bg-neutral-400'"
            :title="`Slide ${idx + 1}`"
          />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease-out;
}
.slide-fade-enter-from {
  opacity: 0;
  transform: translateX(10px);
}
.slide-fade-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

@keyframes progress {
  from { width: 0%; }
  to { width: 100%; }
}
.animate-progress {
  animation: progress 4s linear forwards;
}
</style>