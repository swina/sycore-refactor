import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { auth, onAuthStateChanged, type LocalUser } from '@/lib/auth'
import { db, getDoc, getDocs, collection, query, doc, setDoc } from '@/lib/idb'
import { DEFAULT_ROLES_CONFIG, type RoleConfig } from '@/lib/roles'
import type { UserProfile, UserRole } from '@/types/user'

const ADMIN_EMAIL = 'swina.allen@gmail.com'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<LocalUser | null>(null)
  const profile = ref<UserProfile | null>(null)
  const loadingAuth = ref(true)

  const isAdmin = computed(() => user.value?.email === ADMIN_EMAIL)

  function getLimits(role?: UserRole): RoleConfig {
    const r = role || profile.value?.role || 'demo'
    const rolesConfig = DEFAULT_ROLES_CONFIG
    return rolesConfig[r as keyof typeof rolesConfig] || rolesConfig.demo
  }

  async function loadProfile(firebaseUser: LocalUser | null): Promise<void> {
    if (!firebaseUser) {
      profile.value = null
      loadingAuth.value = false
      return
    }
    try {
      const userRef  = doc(db, 'users', firebaseUser.uid)
      const userSnap = await getDoc(userRef)

      if (userSnap.exists()) {
        profile.value = userSnap.data() as UserProfile
      } else {
        const usersCol = await getDocs(query(collection(db, 'users')))
        const isFirstUser = usersCol.docs.length === 0

        const newProfile: UserProfile = {
          uid:   firebaseUser.uid,
          email: firebaseUser.email || '',
          role:  isFirstUser ? 'admin' : 'demo',
          createdAt: new Date().toISOString(),
          id: firebaseUser.uid,
          generationsCount: 0,
        }
        await setDoc(userRef, newProfile as any)
        profile.value = newProfile
        console.log(`[AuthStore] New profile created. Role: ${newProfile.role}`)
      }
    } catch (e) {
      console.error('Failed to load profile', e)
      profile.value = null
    } finally {
      loadingAuth.value = false
    }
  }

  function init(): () => void {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      user.value = firebaseUser as LocalUser | null
      await loadProfile(firebaseUser as LocalUser | null)
    })
    return unsubscribe
  }

  async function saveFreesoundApiKey(key: string): Promise<void> {
    if (!user.value) return
    const trimmed = (key || '').trim()
    const userRef = doc(db, 'users', user.value.uid)
    await setDoc(userRef, { freesoundApiKey: trimmed } as any, { merge: true })
    if (profile.value) profile.value = { ...profile.value, freesoundApiKey: trimmed } as any
  }

  async function saveAiApiKey(key: string): Promise<void> {
    if (!user.value) return
    const trimmed = (key || '').trim()
    const userRef = doc(db, 'users', user.value.uid)
    await setDoc(userRef, { aiApiKey: trimmed } as any, { merge: true })
    if (profile.value) profile.value = { ...profile.value, aiApiKey: trimmed } as any
  }

  async function logout(): Promise<void> {
    await auth.signOut()
    user.value    = null
    profile.value = null
  }

  return {
    user, profile, loadingAuth,
    isAdmin,
    getLimits, init, logout, saveFreesoundApiKey, saveAiApiKey,
  }
})