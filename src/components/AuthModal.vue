<script setup>
import { ref } from 'vue'
import { X, Mail, Lock, Chrome } from 'lucide-vue-next'
import { auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup } from '@/lib/auth'

const emit = defineEmits(['close'])

const isLogin         = ref(true)
const email           = ref('')
const password        = ref('')
const confirmPassword = ref('')
const error           = ref(null)
const loading         = ref(false)

async function handleSubmit() {
  error.value   = null
  loading.value = true
  try {
    if (isLogin.value) {
      await signInWithEmailAndPassword(auth, email.value, password.value)
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
    }
    emit('close')
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

async function handleGoogleLogin() {
  error.value = null
  try {
    await signInWithPopup(auth, {})
    emit('close')
  } catch (err) {
    error.value = err.message || 'Google login failed.'
  }
}
</script>

<template>
  <div class="fixed inset-0 z-[1000] flex items-center justify-center p-4">
    <!-- Backdrop -->
    <Transition name="modal">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="emit('close')" />
    </Transition>

    <!-- Card -->
    <Transition name="modal-card" appear>
      <div class="relative w-full max-w-sm bg-neutral-900 border border-neutral-800 p-6 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-10">
        <button @click="emit('close')" class="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors">
          <X class="w-5 h-5" />
        </button>

        <div class="text-center mb-6">
          <h2 class="text-xl font-black text-white mb-2 tracking-tight">
            {{ isLogin ? 'Welcome Back' : 'Create Account' }}
          </h2>
          <p class="text-sm text-neutral-400">
            {{ isLogin ? 'Sign in to your account' : 'Sign up for a new account' }}
          </p>
        </div>

        <div v-if="error" class="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-500 text-xs font-bold">
          {{ error }}
        </div>

        <form @submit.prevent="handleSubmit" class="flex flex-col gap-4">
          <div class="relative">
            <Mail class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              v-model="email"
              type="email" placeholder="Email address" required
              class="w-full bg-black border border-neutral-800 rounded-lg py-2.5 pl-10 pr-3 text-sm text-white focus:outline-none focus:border-synth-neon transition-colors"
            />
          </div>

          <div class="relative">
            <Lock class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              v-model="password"
              type="password" placeholder="Password" required minlength="6"
              class="w-full bg-black border border-neutral-800 rounded-lg py-2.5 pl-10 pr-3 text-sm text-white focus:outline-none focus:border-synth-neon transition-colors"
            />
          </div>

          <Transition name="modal-card">
            <div v-if="!isLogin" class="relative">
              <Lock class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input
                v-model="confirmPassword"
                type="password" placeholder="Confirm password" required minlength="6"
                class="w-full bg-black border border-neutral-800 rounded-lg py-2.5 pl-10 pr-3 text-sm text-white focus:outline-none focus:border-synth-neon transition-colors"
              />
            </div>
          </Transition>

          <button
            type="submit" :disabled="loading"
            class="w-full bg-synth-neon text-black font-bold uppercase tracking-widest text-xs py-3 rounded-lg hover:bg-white transition-colors disabled:opacity-50 mt-2"
          >
            {{ loading ? 'Processing...' : isLogin ? 'Sign In' : 'Sign Up' }}
          </button>
        </form>

        <div class="my-6 flex items-center gap-3">
          <div class="h-px flex-1 bg-neutral-800" />
          <span class="text-xs font-bold text-neutral-500 uppercase tracking-widest">OR</span>
          <div class="h-px flex-1 bg-neutral-800" />
        </div>

        <button
          type="button" @click="handleGoogleLogin"
          class="w-full bg-black border border-neutral-800 text-white font-bold uppercase tracking-widest text-xs py-3 rounded-lg hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
        >
          <Chrome class="w-4 h-4" /> Continue with Google
        </button>

        <div class="mt-6 text-center text-xs text-neutral-400">
          {{ isLogin ? "Don't have an account? " : "Already have an account? " }}
          <button @click="isLogin = !isLogin" class="text-synth-neon hover:text-white font-bold transition-colors">
            {{ isLogin ? 'Sign Up' : 'Sign In' }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
