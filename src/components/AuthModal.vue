<script setup>
import { ref } from 'vue'
import { X, Mail, Lock } from 'lucide-vue-next'
import { auth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from '@/lib/auth'
import { userKey } from '@/lib/userKey'
import { usePresetStore } from '@/stores/usePresetStore'

const emit = defineEmits(['close'])
const presetStore = usePresetStore()

const isLogin           = ref(true)
const email             = ref('')
const password          = ref('')
const confirmPassword   = ref('')
const error             = ref(null)
const loading           = ref(false)
const showStarterPrompt  = ref(false)
const loadingStarter     = ref(false)
const starterPresetCount = ref(0)

async function handleSubmit() {
  error.value   = null
  loading.value = true
  try {
    if (isLogin.value) {
      await signInWithEmailAndPassword(auth, email.value, password.value)
      emit('close')
    } else {
      if (password.value !== confirmPassword.value) {
        error.value   = 'Passwords do not match.'
        loading.value = false
        return
      }
      if (password.value.length < 6) {
        error.value   = 'Password must be at least 6 characters long.'
        loading.value = false
        return
      }
      await createUserWithEmailAndPassword(auth, email.value, password.value)
      // Block the auto-seed (BANK_DEFAULT) so it doesn't race with our prompt
      localStorage.setItem(userKey('sycore_bank_seeded'), 'true')
      const meta = await fetch('/sycore-session-startup.json').then(r => r.json()).catch(() => null)
      starterPresetCount.value = meta?.presets?.length ?? 0
      showStarterPrompt.value = true
    }
  } catch (err) {
    if (err.code === 'auth/email-already-in-use')         error.value = 'Email already in use.'
    else if (err.code === 'auth/user-not-found' ||
             err.code === 'auth/wrong-password' ||
             err.code === 'auth/invalid-credential')       error.value = 'Invalid email or password.'
    else if (err.code === 'auth/weak-password')            error.value = 'Password must be at least 6 characters.'
    else if (err.code === 'auth/operation-not-allowed')    error.value = 'Google Sign-In is not available in offline mode.'
    else                                                   error.value = err.message || 'Authentication error.'
  } finally {
    loading.value = false
  }
}

async function loadStarterPresets() {
  loadingStarter.value = true
  try {
    const data = await fetch('/sycore-session-startup.json').then(r => r.json())
    for (const preset of data.presets) {
      await presetStore.importPreset(preset.name, null, preset.category, {
        id: preset.id,
        aVariant: preset.aVariant,
        bVariant: preset.bVariant,
        isFavorite: preset.isFavorite || false,
        createdAt: preset.createdAt,
      })
    }
  } finally {
    loadingStarter.value = false
    emit('close')
  }
}
</script>

<template>
  <div class="fixed inset-0 z-[1000] flex items-center justify-center p-4">
    <!-- Backdrop -->
    <Transition name="sy-modal">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="emit('close')" />
    </Transition>

    <!-- Card -->
    <Transition name="sy-modal" appear>
      <div class="relative w-full max-w-sm bg-neutral-900 border border-neutral-800 p-6 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-10">
        <button @click="emit('close')" :disabled="loadingStarter" class="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors disabled:opacity-30">
          <X class="w-5 h-5" />
        </button>

        <!-- Step 2: Starter preset confirmation -->
        <template v-if="showStarterPrompt">
          <div class="text-center mb-6">
            <h2 class="text-xl font-black text-white mb-2 tracking-tight">Profile Created</h2>
            <p class="text-sm text-neutral-400">Load the starter preset library?</p>
            <p class="text-xs text-neutral-600 mt-1">{{ starterPresetCount }} presets · can be deleted anytime</p>
          </div>
          <div class="flex flex-col gap-3">
            <button @click="loadStarterPresets" :disabled="loadingStarter"
              class="w-full bg-synth-neon text-black font-bold uppercase tracking-widest text-xs py-3 rounded-lg hover:bg-white transition-colors disabled:opacity-50">
              {{ loadingStarter ? 'Loading...' : 'Yes, Load Presets' }}
            </button>
            <button @click="emit('close')" :disabled="loadingStarter"
              class="w-full border border-neutral-700 text-neutral-400 font-bold uppercase tracking-widest text-xs py-3 rounded-lg hover:bg-neutral-800 transition-colors disabled:opacity-30">
              Skip
            </button>
          </div>
        </template>

        <!-- Step 1: Login / Register form -->
        <template v-else>
          <div class="text-center mb-6">
            <h2 class="text-xl font-black text-white mb-2 tracking-tight">
              {{ isLogin ? 'Welcome Back' : 'Create Profile' }}
            </h2>
            <p class="text-sm text-neutral-400">
              {{ isLogin ? 'Sign in to your profile' : 'Sign up for a new profile' }}
            </p>
          
          </div>

          <div v-if="error" class="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-500 text-xs font-bold">
            {{ error }}
          </div>

          <form @submit.prevent="handleSubmit" class="flex flex-col gap-4">
            <div class="flex flex-col gap-1.5">
              
              <label for="email" class="text-[10px] font-bold text-neutral-500 uppercase tracking-widest px-1">Email Address</label>
              <div class="relative">
                <Mail class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  id="email"
                  v-model="email"
                  type="email" placeholder="Email address" required
                  class="w-full bg-black border border-neutral-800 rounded-lg py-2.5 pl-10 pr-3 text-sm text-white focus:outline-none focus:border-synth-neon transition-colors"
                />
              </div>
            </div>

            <div class="flex flex-col gap-1.5">
              <label for="password" class="text-[10px] font-bold text-neutral-500 uppercase tracking-widest px-1">Password</label>
              <div class="relative">
                <Lock class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  id="password"
                  v-model="password"
                  type="password" placeholder="Password" required minlength="6"
                  class="w-full bg-black border border-neutral-800 rounded-lg py-2.5 pl-10 pr-3 text-sm text-white focus:outline-none focus:border-synth-neon transition-colors"
                />
              </div>
            </div>

            <Transition name="sy-modal">
              <div v-if="!isLogin" class="flex flex-col gap-1.5">
                <label for="confirmPassword" class="text-[10px] font-bold text-neutral-500 uppercase tracking-widest px-1">Confirm Password</label>
                <div class="relative">
                  <Lock class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                  <input
                    id="confirmPassword"
                    v-model="confirmPassword"
                    type="password" placeholder="Confirm password" required minlength="6"
                    class="w-full bg-black border border-neutral-800 rounded-lg py-2.5 pl-10 pr-3 text-sm text-white focus:outline-none focus:border-synth-neon transition-colors"
                  />
                </div>
              </div>
            </Transition>

            <button
              type="submit" :disabled="loading"
              class="w-full bg-synth-neon text-black font-bold uppercase tracking-widest text-xs py-3 rounded-lg hover:bg-white transition-colors disabled:opacity-50 mt-2"
            >
              {{ loading ? 'Processing...' : isLogin ? 'Sign In' : 'Sign Up' }}
            </button>
          </form>

          <div class="mt-6 pt-5 border-t border-neutral-800 flex flex-col gap-3 text-center">
            <p class="text-lg text-neutral-500">{{ isLogin ? "Don't have a profile?" : "Already have a profile?" }}</p>
            
            <button
              type="button"
              @click="isLogin = !isLogin"
              class="w-full border font-bold uppercase tracking-widest text-xs py-3 rounded-lg transition-colors"
              :class="isLogin
                ? 'border-synth-neon text-synth-neon hover:bg-synth-neon hover:text-black'
                : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'"
            >
              {{ isLogin ? 'Create a Profile' : 'Sign In Instead' }}
            </button>
            <div class="text-xs text-neutral-400 bg-rose-800 p-1 rounded-lg mb-1 border border-rose-200 text-center">
                To create a profile is only necessary in order to protect your data and preferences locally. No data is ever sent to a server or published anywhere.<div>If you choose to subscribe to notifications, you will receive updates about new features and improvements. </div>
              </div>
          </div>
        </template>
      </div>
    </Transition>
  </div>
</template>
