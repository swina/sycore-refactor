import { ref } from 'vue'

export function useResizable(defaultW, defaultH, storageKey = null) {
  function readSaved() {
    if (!storageKey) return null
    try { return JSON.parse(localStorage.getItem(storageKey)) } catch { return null }
  }

  const saved = readSaved()
  const clampW = v => Math.max(200, Math.min(window.innerWidth - 20, v))
  const clampH = v => Math.max(100, Math.min(window.innerHeight - 20, v))

  const width = ref(clampW(saved?.w ?? defaultW))
  const height = ref(clampH(saved?.h ?? defaultH))

  let _mx = 0, _my = 0, _ow = 0, _oh = 0

  function onMove(e) {
    width.value = clampW(_ow + e.clientX - _mx)
    height.value = clampH(_oh + e.clientY - _my)
  }

  function onUp() {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify({ w: width.value, h: height.value }))
    }
  }

  function startResize(e) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    _mx = e.clientX; _my = e.clientY
    _ow = width.value; _oh = height.value
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return { width, height, startResize }
}
