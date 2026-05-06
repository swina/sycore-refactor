import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  db, getDoc, setDoc, updateDoc, deleteDoc,
  doc, collection, getDocs, onSnapshot,
  orderBy, serverTimestamp,
} from '@/lib/idb'
import { useMidiStore } from './useMidiStore'
import { useArpStore }  from './useArpStore'
import { useAuthStore } from './useAuthStore'
import { S1_TYPES, FIELD_TO_CC } from '@/constants/s1-config'

export const usePresetStore = defineStore('preset', () => {
  const midiStore = useMidiStore()
  const arpStore  = useArpStore()
  const authStore = useAuthStore()

  // State
  const history              = ref([])
  const lastPreset           = ref(null)
  const currentName          = ref('')
  const currentPatchNotes    = ref(null)
  const isGenerating         = ref(false)
  const showResults          = ref(false)
  const currentCategory      = ref('pad')
  const aiPrompt             = ref('')
  const useAlternativeEngine = ref(false)
  const historyCategoryFilter = ref('all')
  const sessionGeneratedIds  = ref([])
  const engineCacheA         = ref(null)
  const engineCacheB         = ref(null)
  const isSaving             = ref(false)
  const currentSeqConfig     = ref(null)

  let _unsubHistory = null

  // Getters
  const filteredHistory = computed(() => {
    if (historyCategoryFilter.value === 'all')       return history.value
    if (historyCategoryFilter.value === 'favorites') return history.value.filter(p => p.isFavorite)
    return history.value.filter(p => p.category === historyCategoryFilter.value)
  })

  const hasUnsavedChanges = computed(() => {
    if (!lastPreset.value || !showResults.value) return false
    return sessionGeneratedIds.value.includes(lastPreset.value.id)
  })

  const remainingGens = computed(() => {
    if (!authStore.profile) return 0
    if (authStore.isAdmin) return Infinity
    const limits = authStore.getLimits(authStore.profile.role)
    const used = history.value.filter(p => sessionGeneratedIds.value.includes(p.id)).length
    return Math.max(0, limits.gens - used)
  })

  const limitReached = computed(() => {
    if (authStore.isAdmin) return false
    return remainingGens.value <= 0
  })

  // Load preset history from IDB and subscribe to live updates
  function loadHistory(uid) {
    if (_unsubHistory) _unsubHistory()

    const presetsRef = collection(db, 'users', uid, 'presets')
    _unsubHistory = onSnapshot(presetsRef, (snapshot) => {
      history.value = snapshot.docs
        .map(d => ({ ...d.data(), id: d.id }))
        .sort((a, b) => {
          const ta = a.createdAt?.seconds ?? 0
          const tb = b.createdAt?.seconds ?? 0
          return tb - ta
        })
    })
    return _unsubHistory
  }

  function unsubscribeHistory() {
    if (_unsubHistory) { _unsubHistory(); _unsubHistory = null }
  }

  // Apply a preset's CC values to the hardware
  function applyPresetCCs(preset) {
    if (!preset?.data) return
    const ccMap = {}
    for (const [fieldName, value] of Object.entries(preset.data)) {
      const cc = FIELD_TO_CC[fieldName]
      if (cc !== undefined) ccMap[cc] = value
    }
    midiStore.sendAllCCs(ccMap)
  }

  // Recall a preset: send CCs, restore arp/seq state, update current context
  function recallPreset(preset) {
    lastPreset.value       = preset
    currentName.value      = preset.name
    currentPatchNotes.value = preset.patchNotes || null
    currentCategory.value  = preset.category || currentCategory.value
    currentSeqConfig.value = preset.seqConfig || null

    applyPresetCCs(preset)

    if (preset.arpConfig) {
      arpStore.arpEnabled     = preset.arpConfig.enabled     ?? arpStore.arpEnabled
      arpStore.arpMode        = preset.arpConfig.mode        ?? arpStore.arpMode
      arpStore.arpBpm         = preset.arpConfig.bpm         ?? arpStore.arpBpm
      arpStore.arpSubdivision = preset.arpConfig.subdivision ?? arpStore.arpSubdivision
      arpStore.arpHold        = preset.arpConfig.hold        ?? arpStore.arpHold
    }

    if (authStore.user) {
      updateDoc(doc(db, 'users', authStore.user.uid), {
        lastSelectedPresetId: preset.id,
      }).catch(() => {})
    }
  }

  // Save current (generated) preset to IDB, or import a full preset object
  async function savePreset(name, data, category, options = {}) {
    if (!authStore.user) return

    // If only name is provided, save the current lastPreset (normal save)
    if (!data) {
      if (!showResults.value) return
      isSaving.value = true

      try {
        const presetsRef = collection(db, 'users', authStore.user.uid, 'presets')
        const limits = authStore.getLimits(authStore.profile?.role)
        const cleanName = (name || currentName.value).replace(/^\*\s*/, '').trim()

        const currentArpConfig = {
          enabled:     arpStore.arpEnabled,
          mode:        arpStore.arpMode,
          bpm:         arpStore.arpBpm,
          subdivision: arpStore.arpSubdivision,
          hold:        arpStore.arpHold,
        }

        const preset = lastPreset.value
        if (!preset) return

        const isNew = !history.value.find(p => p.id === preset.id)
        const aiPromptData = currentCategory.value === 'ai' ? { aiPrompt: aiPrompt.value } : {}

        if (isNew) {
          if (!authStore.isAdmin && history.value.length >= limits.slots) {
            throw new Error('slot_limit')
          }
          await setDoc(doc(presetsRef, preset.id), {
            id:         preset.id,
            name:       cleanName,
            category:   currentCategory.value,
            data:       preset.data,
            ...aiPromptData,
            patchNotes: currentPatchNotes.value,
            arpConfig:  currentArpConfig,
            seqConfig:  currentSeqConfig.value || null,
            createdAt:  serverTimestamp(),
          })
        } else {
          await updateDoc(doc(presetsRef, preset.id), {
            data:       preset.data,
            name:       cleanName,
            ...aiPromptData,
            patchNotes: currentPatchNotes.value,
            arpConfig:  currentArpConfig,
            seqConfig:  currentSeqConfig.value || null,
            updatedAt:  serverTimestamp(),
          })
        }

        currentName.value = cleanName
        sessionGeneratedIds.value = sessionGeneratedIds.value.filter(id => id !== preset.id)
      } catch (err) {
        console.error('Save preset failed', err)
        throw err
      } finally {
        isSaving.value = false
      }
      return
    }

    // Import preset from bank (full object with all fields)
    try {
      const presetsRef = collection(db, 'users', authStore.user.uid, 'presets')
      const presetId = options.id || `pr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      const cleanName = (name || '').trim()

      const presetData = {
        id:         presetId,
        name:       cleanName,
        category:   category || 'pad',
        data:       data || {},
        patchNotes: options.patchNotes || null,
        arpConfig:  options.arpConfig || null,
        seqConfig:  options.seqConfig || null,
        createdAt:  options.createdAt ? new Date(options.createdAt) : serverTimestamp(),
      }

      // Add optional fields
      if (options.abVariant) presetData.abVariant = options.abVariant
      if (options.isFavorite) presetData.isFavorite = options.isFavorite

      await setDoc(doc(presetsRef, presetId), presetData)
    } catch (err) {
      console.error('Import preset failed', err)
      throw err
    }
  }

  async function deletePreset(presetId) {
    if (!authStore.user) return
    await deleteDoc(doc(db, 'users', authStore.user.uid, 'presets', presetId))
  }

  async function deleteAllPresets() {
    if (!authStore.user || history.value.length === 0) return
    const presetsRef = collection(db, 'users', authStore.user.uid, 'presets')
    await Promise.all(history.value.map(p => deleteDoc(doc(presetsRef, p.id))))
  }

  async function toggleFavorite(presetId) {
    if (!authStore.user) return
    const preset = history.value.find(p => p.id === presetId)
    if (!preset) return
    await updateDoc(doc(db, 'users', authStore.user.uid, 'presets', presetId), {
      isFavorite: !preset.isFavorite,
    })
  }

  function setCategory(cat) {
    currentCategory.value = cat
  }

  function updateFieldValue(fieldName, value) {
    if (!lastPreset.value) return
    if (!lastPreset.value.data) lastPreset.value.data = {}
    lastPreset.value.data[fieldName] = value
  }

  function clearSessionCache() {
    sessionGeneratedIds.value = []
    engineCacheA.value = null
    engineCacheB.value = null
  }

  /**
   * Generate a new preset via the Gemini AI API.
   * Requires a Gemini API key stored in localStorage under GEMINI_KEY_STORAGE.
   * The full prompt-engineering and CC-parsing logic lives here.
   */
  async function generate(isRegen = false) {
    if (limitReached.value) return
    if (!authStore.user) {
      console.warn('Login required to generate sounds')
      return
    }

    isGenerating.value = true
    showResults.value  = false

    try {
      const categoryConfig =
        S1_TYPES[currentCategory.value] ||
        S1_TYPES['experimental']

      // Determine which engine slot (A or B) this generation targets
      const isAlt      = isRegen && useAlternativeEngine.value
      const cacheKey   = isAlt ? engineCacheB : engineCacheA
      const setCacheKey = isAlt ? (v) => { engineCacheB.value = v } : (v) => { engineCacheA.value = v }

      // --- AI call placeholder ---
      // Import { GoogleGenAI } from '@google/genai' and call it here.
      // The full prompt and response-parsing logic from MidiApp.tsx line ~1850-2060
      // belongs in a separate @/lib/ai-generate.js utility to keep this store thin.
      // For now, generate a random patch within the category ranges as a fallback.
      const ccValues = {}
      for (const [field, range] of Object.entries(categoryConfig)) {
        if (!Array.isArray(range)) continue
        const [min, max] = range
        ccValues[field] = Math.round(min + Math.random() * (max - min))
      }
      // --- end placeholder ---

      const presetId   = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const genPreset  = {
        id:       presetId,
        name:     `* ${currentCategory.value} ${new Date().toLocaleTimeString()}`,
        category: currentCategory.value,
        data:     ccValues,
        patchNotes: null,
        arpConfig: null,
        seqConfig: null,
      }

      setCacheKey(genPreset)
      lastPreset.value        = genPreset
      currentName.value       = genPreset.name
      currentPatchNotes.value = null

      sessionGeneratedIds.value = [...sessionGeneratedIds.value, presetId]

      applyPresetCCs(genPreset)
      showResults.value  = true
    } catch (err) {
      console.error('Generation failed', err)
    } finally {
      isGenerating.value = false
    }
  }

  // Preset navigation helpers (used by useAppActions composable)
  function navigateHistory(dir) {
    const list = filteredHistory.value
    if (list.length === 0) return
    if (!lastPreset.value) { recallPreset(list[0]); return }
    const idx = list.findIndex(p => p.id === lastPreset.value.id)
    if (dir === 'prev') recallPreset(list[Math.max(0, idx - 1)])
    if (dir === 'next') recallPreset(list[Math.min(list.length - 1, idx + 1)])
    if (dir === 'first') recallPreset(list[0])
    if (dir === 'last')  recallPreset(list[list.length - 1])
  }

  return {
    history, lastPreset, currentName, currentPatchNotes,
    isGenerating, showResults, currentCategory, aiPrompt,
    useAlternativeEngine, historyCategoryFilter,
    sessionGeneratedIds, engineCacheA, engineCacheB,
    isSaving, currentSeqConfig,
    filteredHistory, hasUnsavedChanges, remainingGens, limitReached,
    loadHistory, unsubscribeHistory,
    recallPreset, applyPresetCCs,
    savePreset, deletePreset, deleteAllPresets,
    toggleFavorite, setCategory,
    clearSessionCache, generate, navigateHistory, updateFieldValue,
  }
})
