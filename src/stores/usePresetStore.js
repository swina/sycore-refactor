import { ref, computed, watch, toRaw } from 'vue'
import { defineStore } from 'pinia'
import { db, doc, collection, query, onSnapshot, getDocs, setDoc, updateDoc, deleteDoc, deleteDocs, clearCollectionRange, serverTimestamp } from '@/lib/idb'
import { useAuthStore } from './useAuthStore'
import { useMidiStore } from './useMidiStore'
import { useMappingStore } from './useMappingStore'
import { useLfoStore } from './useLfoStore'
import { useArpStore } from './useArpStore'
import { useUiStore } from './useUiStore'
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
    let list = history.value

    if (historyCategoryFilter.value === 'favorites') {
      list = list.filter(p => p.isFavorite)
    } else if (historyCategoryFilter.value && historyCategoryFilter.value !== 'all') {
      list = list.filter(p => p.category === historyCategoryFilter.value)
    }

    // Fix: If the current preset is newly generated (not in history), 
    // prepend it to the list so navigation (NEXT/PREV) works immediately.
    if (lastPreset.value && !list.some(p => p.id === lastPreset.value.id)) {
      list = [lastPreset.value, ...list]
    }

    return list
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
          // Use recallPreset to ensure all store states (Arp, LFO, etc.) are properly restored
          recallPreset(preset, false)
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
        ...d.data(),
        id: d.id
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
            // Ensure the filter includes this preset so nav buttons are active
            if (historyCategoryFilter.value !== 'all' && historyCategoryFilter.value !== synced.category) {
              historyCategoryFilter.value = 'all'
            }
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

  function _captureCurrentMetadata() {
    return {
      arpConfig: {
        enabled: useArpStore().arpEnabled,
        mode: useArpStore().arpMode,
        bpm: useArpStore().arpBpm,
        subdivision: useArpStore().arpSubdivision,
        hold: useArpStore().arpHold
      },
      seqConfig: useUiStore().seqCurrentConfig || null,
      lfo1Config: { ...useLfoStore().lfo1, lastSentValue: null },
      lfo2Config: { ...useLfoStore().lfo2, lastSentValue: null },
      velocityConfig: {
        active: useMappingStore().velocityConfig.active,
        targetParameter: useMappingStore().velocityConfig.targetParameter,
        amount: useMappingStore().velocityConfig.amount,
        curve: useMappingStore().velocityConfig.curve
      }
    }
  }

  function _createVariant(data, patchNotes = '') {
    const meta = _captureCurrentMetadata()
    return {
      data: data || {},
      patchNotes: patchNotes || '',
      arpConfig: meta.arpConfig,
      seqConfig: meta.seqConfig,
      velocityConfig: meta.velocityConfig,
      lfo1Config: meta.lfo1Config,
      lfo2Config: meta.lfo2Config
    }
  }

  function _applyMetadataToStores(variant) {
    if (!variant) return
    
    // Arp
    const arpStore = useArpStore()
    if (variant.arpConfig) {
      arpStore.arpEnabled = variant.arpConfig.enabled ?? variant.arpConfig.active ?? false
      arpStore.arpMode = variant.arpConfig.mode || 'up'
      // arpStore.arpBpm = variant.arpConfig.bpm || 120 // Removed to prevent overriding global tempo
      arpStore.arpSubdivision = variant.arpConfig.subdivision || '1/8'
      arpStore.arpHold = variant.arpConfig.hold || false
    } else {
      arpStore.arpEnabled = false
    }
    
    // LFOs
    const lfoStore = useLfoStore()
    if (variant.lfo1Config) {
      Object.assign(lfoStore.lfo1, variant.lfo1Config)
    } else {
      lfoStore.lfo1.active = false
    }
    
    if (variant.lfo2Config) {
      Object.assign(lfoStore.lfo2, variant.lfo2Config)
    } else {
      lfoStore.lfo2.active = false
    }
    
    // Velocity
    const mappingStore = useMappingStore()
    if (variant.velocityConfig) {
      mappingStore.velocityConfig.active = variant.velocityConfig.active ?? variant.velocityConfig.enabled ?? false
      if (variant.velocityConfig.targetParameter) mappingStore.velocityConfig.targetParameter = variant.velocityConfig.targetParameter
      if (variant.velocityConfig.amount !== undefined) mappingStore.velocityConfig.amount = variant.velocityConfig.amount
      if (variant.velocityConfig.curve) mappingStore.velocityConfig.curve = variant.velocityConfig.curve
    } else {
      mappingStore.velocityConfig.active = false
    }

    // Sequencer
    const uiStore = useUiStore()
    if (variant.seqConfig) {
      uiStore.seqCurrentConfig = variant.seqConfig
    } else {
      uiStore.seqCurrentConfig = null
    }
  }

  function recallPreset(preset, shouldAutoPlay = true) {
    // Compatibility Layer: Migrate old structure to new symmetric A/B structure
    if (!preset.aVariant) {
      console.log(`[PresetStore] Migrating preset ${preset.id} to new symmetric structure`)
      const aData = preset.data || {}
      const aMeta = {
        arpConfig: preset.arpConfig || null,
        velocityConfig: preset.velocityConfig || null,
        lfo1Config: preset.lfo1Config || null,
        lfo2Config: preset.lfo2Config || null
      }
      
      preset.aVariant = {
        data: aData,
        patchNotes: preset.patchNotes || '',
        ...aMeta,
        seqConfig: preset.seqConfig || null
      }

      if (preset.abVariant) {
        preset.bVariant = {
          data: preset.abVariant.data || {},
          patchNotes: preset.abVariant.patchNotes || preset.patchNotes || '',
          arpConfig: preset.abVariant.arpConfig || preset.arpConfig || null,
          velocityConfig: preset.abVariant.velocityConfig || preset.velocityConfig || null,
          lfo1Config: preset.abVariant.lfo1Config || preset.lfo1Config || null,
          lfo2Config: preset.abVariant.lfo2Config || preset.lfo2Config || null,
          seqConfig: preset.abVariant.seqConfig || preset.seqConfig || null
        }
      } else {
        // Create B as a clone of A if it doesn't exist
        preset.bVariant = JSON.parse(JSON.stringify(preset.aVariant))
      }

      // Cleanup old fields
      delete preset.data
      delete preset.abVariant
      delete preset.arpConfig
      delete preset.velocityConfig
      delete preset.lfo1Config
      delete preset.lfo2Config
      delete preset.seqConfig
    }

    lastPreset.value = preset
    currentName.value = preset.name
    currentPatchNotes.value = preset.patchNotes
    currentCategory.value = preset.category || 'pad'
    useAlternativeEngine.value = false

    // Trigger auto-play on recall only if explicitly requested (not during navigation)
    if (shouldAutoPlay) {
      window.dispatchEvent(new CustomEvent('toggle-sequencer', { detail: { play: true } }))
    }
    
    // Sync all metadata from aVariant (default)
    _applyMetadataToStores(preset.aVariant)

    applyPresetCCs(preset.aVariant)
    
    // Save to local cache for refresh persistence
    localStorage.setItem('sycore_last_session', JSON.stringify(preset))

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

    // Ensure lfoSync (CC#106) is sent first as it defines the sync mode for lfoRate (CC#3)
    if (preset.data.lfoSync !== undefined) {
      midiStore.sendControlValue('lfoSync', preset.data.lfoSync)
    }

    Object.entries(preset.data).forEach(([field, value]) => {
      // Skip lfoSync as it was already sent
      if (field === 'lfoSync') return
      midiStore.sendControlValue(field, value)
    })
  }

  function selectEngine(type) {
    if (!lastPreset.value) return
    const isAlt = type === 'B'
    if (useAlternativeEngine.value === isAlt && initialLoadDone) return
    
    // 1. Capture current metadata into the active engine slot before switching
    const currentMeta = _captureCurrentMetadata()
    const activeVariant = useAlternativeEngine.value ? lastPreset.value.bVariant : lastPreset.value.aVariant
    if (activeVariant) {
      Object.assign(activeVariant, currentMeta)
    }
    
    // 2. Switch engine state
    useAlternativeEngine.value = isAlt
    
    // 3. Load target data
    const target = isAlt ? lastPreset.value.bVariant : lastPreset.value.aVariant
    if (target) {
      if (target.data) {
        applyPresetCCs({ data: target.data })
      }
      if (target.patchNotes) currentPatchNotes.value = target.patchNotes
      
      // 4. Restore target metadata to stores
      _applyMetadataToStores(target)
      
      // 5. Update session cache
      localStorage.setItem('sycore_last_session', JSON.stringify(lastPreset.value))
    }
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
        
        // Always capture current state into the active engine slot before saving
        const currentMeta = _captureCurrentMetadata()
        const activeVariant = useAlternativeEngine.value ? preset.bVariant : preset.aVariant
        if (activeVariant) {
          Object.assign(activeVariant, currentMeta)
        }

        // Use toRaw to ensure we are saving a plain object to IndexedDB/Firebase
        const rawPreset = toRaw(preset)

        if (!isExisting) {
          const presetData = {
            id: rawPreset.id,
            name: cleanName,
            category: category || currentCategory.value,
            aVariant: rawPreset.aVariant,
            bVariant: rawPreset.bVariant,
            patchNotes: options.patchNotes || currentPatchNotes.value || rawPreset.patchNotes,
            createdAt: serverTimestamp()
          }
          await setDoc(presetRef, presetData)
        } else {
          await updateDoc(presetRef, {
            name: cleanName,
            category: category || rawPreset.category,
            aVariant: rawPreset.aVariant,
            bVariant: rawPreset.bVariant,
            patchNotes: options.patchNotes !== undefined ? options.patchNotes : (currentPatchNotes.value || rawPreset.patchNotes),
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
        patchNotes: options.patchNotes || null,
        aVariant: options.aVariant || _createVariant(data || {}, options.patchNotes),
        bVariant: options.bVariant || _createVariant(data || {}, options.patchNotes),
        createdAt: options.createdAt ? options.createdAt : serverTimestamp(),
        isFavorite: options.isFavorite || false,
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
    const activeVariant = useAlternativeEngine.value ? lastPreset.value.bVariant : lastPreset.value.aVariant
    const targetData = activeVariant?.data;

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

  function _generatePatchNotes(data) {
    const traits = []
    const cat = currentCategory.value
    
    // Filter / Timbre
    if (data.cutoff < 45) traits.push('Dark')
    else if (data.cutoff > 95) traits.push('Bright')
    
    if (data.res > 70) traits.push('Resonant')
    if (data.res > 100) traits.push('Acidic')
    
    // Envelopes
    if (data.attack > 50) traits.push('Swelling')
    else if (data.decay < 40 && data.sustain < 40) traits.push('Percussive')
    if (data.release > 85) traits.push('Long-tail')
    
    // Oscillators
    const hasSaw = data.oscSaw > 60
    const hasSq = data.oscSq > 60
    if (hasSaw && hasSq) traits.push('Rich')
    else if (hasSaw) traits.push('Saw-driven')
    else if (hasSq) traits.push('Square-focused')
    
    if (data.oscSub > 80) traits.push('Deep')
    if (data.oscNoise > 40) traits.push('Gritty')
    
    // Effects
    if (data.reverb > 70) traits.push('Spacey')
    if (data.delayLvl > 50) traits.push('Echoing')
    if (data.chorusMode > 0) traits.push('Wide')
    
    // S-1 unique
    if (data.oscChopOvertone > 60 || data.oscChopComb > 60) traits.push('Complex')

    const description = traits.length > 0 
      ? traits.slice(0, 3).join(', ') 
      : 'Balanced'
      
    return `${description} ${cat} patch.`
  }

  function _createPreset(data) {
    const presetId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const notes = _generatePatchNotes(data)
    const variant = _createVariant(data, notes)
    
    return {
      id: presetId,
      name: generateRandomName(currentCategory.value),
      category: currentCategory.value,
      aVariant: variant,
      bVariant: JSON.parse(JSON.stringify(variant)), // Symmetric B
      patchNotes: notes,
      createdAt: new Date().toISOString()
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

        const notesA = _generatePatchNotes(dataA)
        const notesB = _generatePatchNotes(dataB)

        const newPreset = {
          id: `gen_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: generateRandomName(currentCategory.value),
          category: currentCategory.value,
          aVariant: _createVariant(dataA, notesA),
          bVariant: _createVariant(dataB, notesB),
          patchNotes: notesA, // Default to A's notes
          createdAt: new Date().toISOString()
        }

        engineCacheA.value = newPreset.aVariant
        engineCacheB.value = newPreset.bVariant

        useAlternativeEngine.value = false
        lastPreset.value = newPreset
        currentName.value = newPreset.name
        currentPatchNotes.value = newPreset.patchNotes
        
        sessionGeneratedIds.value = [...sessionGeneratedIds.value, newPreset.id]
        
        // Restore A's metadata to stores
        _applyMetadataToStores(newPreset.aVariant)
        applyPresetCCs(newPreset.aVariant)
        
        // Save to cache
        localStorage.setItem('sycore_last_session', JSON.stringify(newPreset))
      } else {
        // REGENERATION
        if (!lastPreset.value) return

        const isAlt = useAlternativeEngine.value
        const newData = _generateData(categoryConfig, variation)
        const newNotes = _generatePatchNotes(newData)
        const newVariant = _createVariant(newData, newNotes)

        if (!isAlt) {
          lastPreset.value.aVariant = newVariant
          engineCacheA.value = newVariant
        } else {
          lastPreset.value.bVariant = newVariant
          engineCacheB.value = newVariant
        }

        // Apply changes to hardware/stores
        _applyMetadataToStores(newVariant)
        applyPresetCCs(newVariant)
        
        currentPatchNotes.value = newNotes
        // currentName remains as it was on lastPreset (Fixes disappearing name bug)
        
        // Mark as modified if not already a session preset
        if (!sessionGeneratedIds.value.includes(lastPreset.value.id)) {
           sessionGeneratedIds.value = [...sessionGeneratedIds.value, lastPreset.value.id]
        }

        // Update session cache
        localStorage.setItem('sycore_last_session', JSON.stringify(lastPreset.value))
      }

      showResults.value = true
    } catch (err) {
      console.error('Generation failed', err)
    } finally {
      isGenerating.value = false
    }
  }

  function navigateHistory(direction) {
    let list = filteredHistory.value
    let idx = list.findIndex(p => p.id === lastPreset.value?.id)
    
    // Fallback to full history if not found in filtered list
    if (idx === -1) {
      list = history.value
      idx = list.findIndex(p => p.id === lastPreset.value?.id)
    }
    
    if (idx === -1 && direction !== 'first' && direction !== 'last') return
    if (list.length === 0) return

    let nextIdx = -1
    if (direction === 'first') {
      nextIdx = list.length - 1 // Oldest preset in newest-first list
    } else if (direction === 'last') {
      nextIdx = 0 // Newest preset in newest-first list
    } else if (direction === 'next') {
      nextIdx = idx - 1 // Go towards newer preset (lower index)
    } else if (direction === 'prev') {
      nextIdx = idx + 1 // Go towards older preset (higher index)
    }

    if (nextIdx < 0 || nextIdx >= list.length) return

    recallPreset(list[nextIdx], false)
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
    loadHistory, recallPreset, applyPresetCCs, selectEngine, savePreset, importPreset,
    deletePreset, deleteAllPresets, toggleFavorite, setCategory,
    updateFieldValue, clearSessionCache, generate, navigateHistory, init,
    seedDefaultBank
  }
})
