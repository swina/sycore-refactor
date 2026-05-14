import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { db, doc, collection, query, onSnapshot, getDocs, setDoc, updateDoc, deleteDoc, deleteDocs, clearCollectionRange, serverTimestamp } from '@/lib/idb'
import { useAuthStore } from './useAuthStore'
import { useMidiStore } from './useMidiStore'
import { useMappingStore } from './useMappingStore'
import { useLfoStore } from './useLfoStore'
import { S1_TYPES } from '@/constants/s1-config'
import BANK_DEFAULT from '@/data/BANK_DEFAULT.json'

export const usePresetStore = defineStore('preset', () => {
  const authStore = useAuthStore()

  // --- State ---
  const history = ref([])
  const historyCategoryFilter = ref('all')
  const currentCategory = ref('pad')
  const lastPreset = ref(null)
  const isGenerating = ref(false)
  const isSaving = ref(false)
  const showResults = ref(false)
  
  const engineCacheA = ref(null) 
  const engineCacheB = ref(null) 
  const useAlternativeEngine = ref(false) 
  
  const sessionGeneratedIds = ref([])
  
  const currentName = ref('')
  const currentPatchNotes = ref(null)
  const lastModifiedField = ref(null)
  const currentVariation = ref(null)

  // --- Getters ---
  const filteredHistory = computed(() => {
    if (historyCategoryFilter.value === 'all') return history.value
    if (historyCategoryFilter.value === 'favorites') return history.value.filter(p => p.isFavorite)
    return history.value.filter(p => p.category === historyCategoryFilter.value)
  })

  const hasUnsavedChanges = computed(() => {
    if (!lastPreset.value || !showResults.value) return false
    return sessionGeneratedIds.value.includes(lastPreset.value.id)
  })

  const remainingGens = ref(10)
  const limitReached = computed(() => remainingGens.value <= 0)

  // --- Actions ---
  let initialLoadDone = false

  function restoreSession() {
    const cached = localStorage.getItem('sycore_last_session')
    if (cached) {
      try {
        const preset = JSON.parse(cached)
        if (preset) {
          lastPreset.value = preset
          currentName.value = preset.name
          currentPatchNotes.value = preset.patchNotes
          currentCategory.value = preset.category || 'pad'
          showResults.value = true
          
          // Restore filter if it was saved
          const savedFilter = localStorage.getItem('sycore_history_filter')
          if (savedFilter) {
            historyCategoryFilter.value = savedFilter
          }
        }
      } catch (e) {
        console.error("Failed to load cached session", e)
      }
    }
  }

  // Watch for filter changes to persist
  watch(historyCategoryFilter, (val) => {
    localStorage.setItem('sycore_history_filter', val)
  })

  let historyUnsubscribe = null
  function loadHistory(uid) {
    if (historyUnsubscribe) historyUnsubscribe()
    
    const colRef = collection(db, 'users', uid, 'presets')
    historyUnsubscribe = onSnapshot(colRef, async (snapshot) => {
      const presets = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })).sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime()
        const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime()
        return dateB - dateA
      })
      
      history.value = presets

      // Auto-load the last preset on startup IF not already restored from cache
      if (!initialLoadDone && presets.length > 0) {
        if (!lastPreset.value) {
          recallPreset(presets[0])
          showResults.value = true
        } else {
          // If we have a cached preset, try to find it in the new history to sync the object reference
          const synced = presets.find(p => p.id === lastPreset.value.id)
          if (synced) {
            lastPreset.value = synced
            // If the synced preset has a category, ensure our filter matches if it's 'all'
            // or if the user expects to stay in that category's flow
          }
        }
        initialLoadDone = true
      }

      // Auto-seed if empty and not already seeded in this session
      const seededFlag = localStorage.getItem('sycore_bank_seeded')
      
      if (presets.length === 0 && !seededFlag) {
        await seedDefaultBank(uid)
      }
    })
  }

  async function seedDefaultBank(uid, force = false) {
    if (!force && localStorage.getItem('sycore_bank_seeded')) {
      console.log('[PresetStore] Default bank already seeded (flag found), skipping auto-seed.');
      return;
    }
    
    console.log(`[PresetStore] Seeding default bank for user: ${uid}`)
    localStorage.setItem('sycore_bank_seeded', 'true')
    
    if (Array.isArray(BANK_DEFAULT)) {
      for (const preset of BANK_DEFAULT) {
        await importPreset(preset.name, preset.data, preset.category, {
          id: preset.id,
          patchNotes: preset.patchNotes,
          arpConfig: preset.arpConfig,
          seqConfig: preset.seqConfig,
          abVariant: preset.abVariant,
          isFavorite: preset.isFavorite,
          createdAt: preset.createdAt
        })
      }
      console.log(`[PresetStore] Successfully seeded ${BANK_DEFAULT.length} presets`)
    }
  }

  function init() {
    restoreSession()
    // Watch for auth changes to load history
    watch(() => authStore.user, (user) => {
      initialLoadDone = false // Reset on user change
      if (user) {
        loadHistory(user.uid)
      } else {
        if (historyUnsubscribe) {
          historyUnsubscribe()
          historyUnsubscribe = null
        }
        history.value = []
      }
    }, { immediate: true })
  }

  function recallPreset(preset) {
    lastPreset.value = preset
    currentName.value = preset.name
    currentPatchNotes.value = preset.patchNotes
    useAlternativeEngine.value = false
    
    // Sync Velocity Modulation State from Preset
    if (preset.velocityConfig) {
      const mappingStore = useMappingStore()
      mappingStore.velocityConfig.active = preset.velocityConfig.active ?? preset.velocityConfig.enabled ?? false
      if (preset.velocityConfig.targetParameter) {
        mappingStore.velocityConfig.targetParameter = preset.velocityConfig.targetParameter
      }
      if (preset.velocityConfig.amount !== undefined) {
        mappingStore.velocityConfig.amount = preset.velocityConfig.amount
      }
      if (preset.velocityConfig.curve) {
        mappingStore.velocityConfig.curve = preset.velocityConfig.curve
      }
    } else {
      const mappingStore = useMappingStore()
      mappingStore.velocityConfig = {
        active: false,
        targetParameter: 'cutoff',
        amount: 0,
        curve: 'linear'
      }
    }

    applyPresetCCs(preset)
    
    // Save to local cache for refresh persistence
    localStorage.setItem('sycore_last_session', JSON.stringify(preset))

    // Sync LFO settings
    const lfoStore = useLfoStore()
    if (preset.lfo1Config) {
      Object.assign(lfoStore.lfo1, preset.lfo1Config)
    } else {
      lfoStore.lfo1.active = false
    }
    if (preset.lfo2Config) {
      Object.assign(lfoStore.lfo2, preset.lfo2Config)
    } else {
      lfoStore.lfo2.active = false
    }

    // Send Program Change if provided
    if (preset.pc !== undefined && preset.pc !== null) {
      const midiStore = useMidiStore()
      if (typeof midiStore.sendProgramChange === 'function') {
        midiStore.sendProgramChange(preset.pc)
      } else if (typeof midiStore.sendPC === 'function') {
        midiStore.sendPC(preset.pc)
      }
    }
  }

  function applyPresetCCs(preset) {
    if (!preset?.data) return
    const midiStore = useMidiStore()
    Object.entries(preset.data).forEach(([field, value]) => {
      midiStore.sendControlValue(field, value)
    })
  }

  async function savePreset(name, data, category, options = {}) {
    if (!authStore.user) return
    
    // Check limits
    const limits = authStore.getLimits()
    if (history.value.length >= limits.maxPresets && !lastPreset.value?.createdAt) {
       throw new Error('slot_limit')
    }

    isSaving.value = true

    try {
      const uid = authStore.user.uid
      const preset = lastPreset.value
      const cleanName = (name || currentName.value || 'Untitled').trim()

      if (preset) {
        const isExisting = history.value.some(p => p.id === preset.id)
        const presetRef = doc(db, 'users', uid, 'presets', preset.id)
        
        if (!isExisting) {
          const presetData = {
            id: preset.id,
            name: cleanName,
            category: category || currentCategory.value,
            data: data || preset.data,
            patchNotes: options.patchNotes || currentPatchNotes.value,
            arpConfig: options.arpConfig || preset.arpConfig || null,
            seqConfig: options.seqConfig || preset.seqConfig || null,
            velocityConfig: {
              active: useMappingStore().velocityConfig.active,
              targetParameter: useMappingStore().velocityConfig.targetParameter,
              amount: useMappingStore().velocityConfig.amount,
              curve: useMappingStore().velocityConfig.curve
            },
            lfo1Config: { ...useLfoStore().lfo1, lastSentValue: null },
            lfo2Config: { ...useLfoStore().lfo2, lastSentValue: null },
            createdAt: serverTimestamp(),
            ...(sessionGeneratedIds.value.includes(preset.id) && engineCacheA.value?.id === preset.id && engineCacheB.value
              ? { abVariant: { data: engineCacheB.value.data } }
              : {}),
            ...(sessionGeneratedIds.value.includes(preset.id) && engineCacheB.value?.id === preset.id && engineCacheA.value
              ? { abVariant: { data: engineCacheA.value.data } }
              : {}),
          }
          await setDoc(presetRef, presetData)
        } else {
          await updateDoc(presetRef, {
            name: cleanName,
            category: category || preset.category,
            data: data || preset.data,
            patchNotes: options.patchNotes !== undefined ? options.patchNotes : preset.patchNotes,
            arpConfig: options.arpConfig || preset.arpConfig || null,
            seqConfig: options.seqConfig || preset.seqConfig || null,
            velocityConfig: {
              active: useMappingStore().velocityConfig.active,
              targetParameter: useMappingStore().velocityConfig.targetParameter,
              amount: useMappingStore().velocityConfig.amount,
              curve: useMappingStore().velocityConfig.curve
            },
            ...(sessionGeneratedIds.value.includes(preset.id) && engineCacheA.value?.id === preset.id && engineCacheB.value
              ? { abVariant: { data: engineCacheB.value.data } }
              : {}),
            ...(sessionGeneratedIds.value.includes(preset.id) && engineCacheB.value?.id === preset.id && engineCacheA.value
              ? { abVariant: { data: engineCacheA.value.data } }
              : {}),
            lfo1Config: { ...useLfoStore().lfo1, lastSentValue: null },
            lfo2Config: { ...useLfoStore().lfo2, lastSentValue: null },
            updatedAt: serverTimestamp(),
          })
        }

        const otherId = engineCacheA.value?.id === preset.id ? engineCacheB.value?.id : engineCacheA.value?.id
        sessionGeneratedIds.value = sessionGeneratedIds.value.filter(id => id !== preset.id && id !== otherId)
        currentName.value = cleanName
      }
    } catch (err) {
      console.error('Save preset failed', err)
      throw err
    } finally {
      isSaving.value = false
    }
  }

  async function importPreset(name, data, category, options = {}) {
    if (!authStore.user) return
    try {
      const uid = authStore.user.uid
      const presetId = options.id || `pr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      const presetRef = doc(db, 'users', uid, 'presets', presetId)
      
      const presetData = {
        id: presetId,
        name: name || 'Imported Preset',
        category: category || 'pad',
        data: data || {},
        patchNotes: options.patchNotes || null,
        arpConfig: options.arpConfig || null,
        seqConfig: options.seqConfig || null,
        createdAt: options.createdAt ? options.createdAt : serverTimestamp(),
        abVariant: options.abVariant || null,
        isFavorite: options.isFavorite || false,
        velocityConfig: options.velocityConfig || null,
        lfo1Config: options.lfo1Config || null,
        lfo2Config: options.lfo2Config || null
      }
      await setDoc(presetRef, presetData)
    } catch (err) {
      console.error('Import preset failed', err)
    }
  }

  async function deletePreset(id) {
    if (!authStore.user) return
    try {
      const uid = authStore.user.uid
      await deleteDoc(doc(db, 'users', uid, 'presets', id))
      if (lastPreset.value?.id === id) {
        lastPreset.value = null
        showResults.value = false
      }
    } catch (err) {
      console.error('Delete preset failed', err)
    }
  }

  async function deleteAllPresets() {
    if (!authStore.user) return
    try {
      const uid = authStore.user.uid
      const presetsToDelete = [...history.value]
      if (presetsToDelete.length === 0) return 0

      console.log(`[Store] Initiating bulk delete for ${presetsToDelete.length} presets for user: ${uid}`);
      
      await clearCollectionRange('user_presets', uid)

      lastPreset.value = null
      showResults.value = false
      return presetsToDelete.length
    } catch (err) {
      console.error('Delete all failed', err)
    }
  }

  async function toggleFavorite(presetId) {
    if (!authStore.user) return
    let preset = history.value.find(p => p.id === presetId)
    
    // If it's a session preset (not saved yet), save it first
    if (!preset && sessionGeneratedIds.value.includes(presetId)) {
      await savePreset()
      // Re-fetch from history after save
      preset = history.value.find(p => p.id === presetId)
    }

    if (!preset) return
    const uid = authStore.user.uid
    await updateDoc(doc(db, 'users', uid, 'presets', presetId), {
      isFavorite: !preset.isFavorite,
    })
  }

  function setCategory(cat) {
    currentCategory.value = cat
  }

  function updateFieldValue(fieldName, value) {
    if (!lastPreset.value) return
    
    // Target the correct data object based on current engine
    const targetData = (useAlternativeEngine.value && lastPreset.value.abVariant?.data)
      ? lastPreset.value.abVariant.data
      : lastPreset.value.data;

    if (!targetData) return;
    targetData[fieldName] = value;

    // Set last modified for visual feedback
    lastModifiedField.value = fieldName
    
    // Update cache
    localStorage.setItem('sycore_last_session', JSON.stringify(lastPreset.value))

    // Clear after a short delay
    const currentField = fieldName
    setTimeout(() => {
      if (lastModifiedField.value === currentField) {
        lastModifiedField.value = null
      }
    }, 1500)
  }

  function clearSessionCache() {
    sessionGeneratedIds.value = []
    engineCacheA.value = null
    engineCacheB.value = null
  }

  function _generateData(categoryConfig, variation = null) {
    const ccValues = {}
    for (const [field, range] of Object.entries(categoryConfig)) {
      if (!Array.isArray(range)) continue
      const [min, max] = range
      
      // Special handling for transpose: must be octaves (40, 52, 64, 76, 88)
      if (field === 'transpose') {
        if (variation && variation.values && variation.values[field] !== undefined) {
          ccValues[field] = variation.values[field]
        } else {
          const octaves = [40, 52, 64, 76, 88].filter(v => v >= min && v <= max)
          ccValues[field] = octaves.length > 0 
            ? octaves[Math.floor(Math.random() * octaves.length)] 
            : 64
        }
        continue
      }

      // If a variation is provided, use its value as base
      if (variation && variation.values && variation.values[field] !== undefined) {
        // We add a tiny bit of drift (±2) to keep it generative but close to the intent
        const base = variation.values[field]
        const drift = Math.floor(Math.random() * 5) - 2 
        ccValues[field] = Math.max(0, Math.min(127, base + drift))
      } else {
        ccValues[field] = Math.round(min + Math.random() * (max - min))
      }
    }
    return ccValues
  }

  function _createPreset(data) {
    const presetId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    return {
      id: presetId,
      name: `${generateRandomName(currentCategory.value)}`,
      category: currentCategory.value,
      data: data,
      patchNotes: null,
      arpConfig: null,
      seqConfig: null,
      velocityConfig: {
        active: false,
        targetParameter: 'cutoff',
        amount: 0,
        curve: 'linear'
      },
      lfo1Config: {
        active: false,
        targetParameter: 'cutoff',
        waveform: 'sine',
        mode: 'free',
        rate: 0.5,
        syncDivision: '1/4',
        depth: 30,
        offset: 64
      },
      lfo2Config: {
        active: false,
        targetParameter: 'cutoff',
        waveform: 'sine',
        mode: 'free',
        rate: 0.5,
        syncDivision: '1/4',
        depth: 30,
        offset: 64
      }
    }
  }

  async function generate(isRegen = false) {
    if (limitReached.value) return
    if (!authStore.user) return

    isGenerating.value = true
    showResults.value = false

    try {
      const categoryConfig = S1_TYPES[currentCategory.value] || S1_TYPES['experimental']
      const variation = currentVariation.value

      if (!isRegen) {
        const dataA = _generateData(categoryConfig, variation)
        const dataB = _generateData(categoryConfig, variation)

        const presetA = _createPreset(dataA)
        const presetB = _createPreset(dataB)

        engineCacheA.value = presetA
        engineCacheB.value = presetB

        presetA.abVariant = { data: presetB.data }
        presetB.abVariant = { data: presetA.data }

        useAlternativeEngine.value = false
        lastPreset.value = presetA
        currentName.value = presetA.name

        sessionGeneratedIds.value = [...sessionGeneratedIds.value, presetA.id, presetB.id]
        applyPresetCCs(presetA)
        
        // Save to cache
        localStorage.setItem('sycore_last_session', JSON.stringify(presetA))
      } else {
        const isAlt = useAlternativeEngine.value
        const newData = _generateData(categoryConfig, variation)

        if (!isAlt) {
          if (engineCacheA.value) {
            engineCacheA.value.data = newData
            if (engineCacheB.value) {
              engineCacheA.value.abVariant = { data: engineCacheB.value.data }
              engineCacheB.value.abVariant = { data: newData }
            }
          } else {
            engineCacheA.value = _createPreset(newData)
          }
          lastPreset.value = engineCacheA.value
          applyPresetCCs(engineCacheA.value)
        } else {
          if (engineCacheB.value) {
            engineCacheB.value.data = newData
            if (engineCacheA.value) {
              engineCacheB.value.abVariant = { data: engineCacheA.value.data }
              engineCacheA.value.abVariant = { data: newData }
            }
          } else {
            engineCacheB.value = _createPreset(newData)
          }
          lastPreset.value = engineCacheB.value
          applyPresetCCs(engineCacheB.value)
        }
        currentName.value = lastPreset.value.name
      }

      showResults.value = true
    } catch (err) {
      console.error('Generation failed', err)
    } finally {
      isGenerating.value = false
    }
  }

  function navigateHistory(direction) {
    const idx = filteredHistory.value.findIndex(p => p.id === lastPreset.value?.id)
    if (idx === -1) return

    let nextIdx = direction === 'next' ? idx + 1 : idx - 1
    if (nextIdx < 0 || nextIdx >= filteredHistory.value.length) return

    recallPreset(filteredHistory.value[nextIdx])
  }

  function generateRandomName(cat) {
    const adjectives = ['Deep', 'Warm', 'Bright', 'Crunchy', 'Smooth', 'Sharp', 'Dirty', 'Clean', 'Cyber', 'Analog', 'Unit']
    const nouns = ['Bass', 'Lead', 'Pad', 'Pluck', 'Bell', 'Key', 'Synth', 'Atmosphere', 'Mix', 'Res', 'Raw']
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
    const noun = nouns[Math.floor(Math.random() * nouns.length)]
    const catName = cat.charAt(0).toUpperCase() + cat.slice(1)
    if (currentVariation.value) {
      return `${currentVariation.value.name} ${adj}${noun}`
    }
    return `${catName} ${adj}${noun}`
  }

  return {
    history, filteredHistory, historyCategoryFilter, currentCategory, lastPreset,
    isGenerating, isSaving, showResults, engineCacheA, engineCacheB, useAlternativeEngine,
    sessionGeneratedIds, currentName, currentPatchNotes, hasUnsavedChanges, lastModifiedField,
    currentVariation,
    remainingGens, limitReached,
    loadHistory, recallPreset, applyPresetCCs, savePreset, importPreset,
    deletePreset, deleteAllPresets, toggleFavorite, setCategory,
    updateFieldValue, clearSessionCache, generate, navigateHistory, init,
    seedDefaultBank
  }
})
