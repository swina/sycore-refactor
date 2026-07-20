import { idbHandleGet, idbHandlePut } from '@/lib/idb'

const HANDLE_KEY_PREFIX = 'fxpBanks:'
const FXP_RE = /\.fxp$/i

// Per the device's MIDI implementation: Bank Select is 0..127 (root = Bank 0,
// subfolders = Bank 1..127), and only the first 128 patches (Program 0..127)
// are addressable within any one bank.
const MAX_PRESETS_PER_BANK = 128
const MAX_BANK_INDEX = 127

/**
 * Scan a directory handle for .fxp preset banks per the design doc's
 * Bank/Preset numbering: root .fxp files = Bank 0, each subfolder
 * (alphabetical) = Bank 1, 2, 3, ...
 *
 * Returns: [{ bankIndex, bankName, presets: [{ name, program, msb, category }] }]
 */
export async function scanFxpBanksFolder(dirHandle) {
  const rootFiles = []
  const subdirs    = []

  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'file') {
      if (FXP_RE.test(name)) rootFiles.push({ name, handle })
    } else if (handle.kind === 'directory') {
      subdirs.push({ name, handle })
    }
  }

  const banks = []

  function toPresets(files) {
    return files
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_PRESETS_PER_BANK)
      .map(f => f.name.replace(FXP_RE, ''))
  }

  function buildBank(bankIndex, bankName, presetNames, category) {
    return {
      bankIndex,
      bankName,
      presets: presetNames.map((name, i) => ({
        name,
        program: i,
        msb: bankIndex,
        category,
      })),
    }
  }

  if (rootFiles.length > 0) {
    banks.push(buildBank(0, 'Root', toPresets(rootFiles), 'Root'))
  }

  subdirs.sort((a, b) => a.name.localeCompare(b.name))

  let bankIndex = 1
  for (const { name: dirName, handle: subHandle } of subdirs) {
    if (bankIndex > MAX_BANK_INDEX) break
    const subFiles = []
    for await (const [name, handle] of subHandle.entries()) {
      if (handle.kind === 'file' && FXP_RE.test(name)) subFiles.push({ name, handle })
    }
    if (subFiles.length === 0) continue
    banks.push(buildBank(bankIndex, dirName, toPresets(subFiles), dirName))
    bankIndex++
  }

  return banks
}

export async function pickFxpBanksFolder(deviceName) {
  if (typeof window === 'undefined' || !window.showDirectoryPicker) return null
  try {
    const handle = await window.showDirectoryPicker()
    await idbHandlePut(HANDLE_KEY_PREFIX + deviceName, handle)
    return await scanFxpBanksFolder(handle)
  } catch (e) {
    if (e?.name !== 'AbortError') console.error('[useFxpBankScanner] pickFxpBanksFolder failed', e)
    return null
  }
}

export async function restoreFxpBanksFolder(deviceName) {
  if (typeof window === 'undefined' || !window.showDirectoryPicker) return null
  try {
    const handle = await idbHandleGet(HANDLE_KEY_PREFIX + deviceName)
    if (!handle) return null
    const perm = await handle.queryPermission({ mode: 'read' })
    if (perm !== 'granted') return { needsPermission: true }
    return await scanFxpBanksFolder(handle)
  } catch (e) {
    console.error('[useFxpBankScanner] restoreFxpBanksFolder failed', e)
    return null
  }
}
