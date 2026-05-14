import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { auth, onAuthStateChanged } from '@/lib/auth'
import { db, getDoc, getDocs, collection, query, doc, setDoc } from '@/lib/idb'
import { DEFAULT_ROLES_CONFIG } from '@/lib/roles'

export const useAuthStore = defineStore('auth', () => {
  const user        = ref(null)
  const profile     = ref(null)
  const loadingAuth = ref(true)

  const isAdmin = computed(() => profile.value?.role === 'admin')

  function getLimits(role) {
    const r = role || profile.value?.role || 'demo'
    const rolesConfig = DEFAULT_ROLES_CONFIG
    return rolesConfig[r] || rolesConfig.demo
  }

  async function loadProfile(firebaseUser) {
    if (!firebaseUser) {
      profile.value = null
      loadingAuth.value = false
      return
    }
    try {
      const userRef  = doc(db, 'users', firebaseUser.uid)
      const userSnap = await getDoc(userRef)
      
      if (userSnap.exists()) {
        profile.value = userSnap.data()
      } else {
        // If this is the first user ever, make them admin
        const usersCol = await getDocs(query(collection(db, 'users')))
        const isFirstUser = usersCol.docs.length === 0
        
        const newProfile = {
          uid:   firebaseUser.uid,
          email: firebaseUser.email || '',
          role:  isFirstUser ? 'admin' : 'demo',
          createdAt: new Date().toISOString()
        }
        await setDoc(userRef, newProfile)
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

  function init() {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      user.value = firebaseUser
      await loadProfile(firebaseUser)
    })
    return unsubscribe
  }

  async function logout() {
    await auth.signOut()
    user.value    = null
    profile.value = null
  }

  return {
    user, profile, loadingAuth,
    isAdmin,
    getLimits, init, logout,
  }
})
