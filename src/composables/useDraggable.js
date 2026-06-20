import { ref } from 'vue'
import { userKey } from '@/lib/userKey'

export function useDraggable(defaultX, defaultY, storageKey = null) {
  function readSaved() {
    if (!storageKey) return null
    try { return JSON.parse(localStorage.getItem(userKey(storageKey))) } catch { return null }
  }

  const saved = readSaved()
  const clampX = v => Math.max(0, Math.min(window.innerWidth  - 120, v))
  const clampY = v => Math.max(0, Math.min(window.innerHeight -  60, v))

  const x = ref(clampX(saved?.x ?? defaultX))
  const y = ref(clampY(saved?.y ?? defaultY))

  let _mx = 0, _my = 0, _ox = 0, _oy = 0

  function onMove(e) {
    x.value = clampX(_ox + e.clientX - _mx)
    y.value = clampY(_oy + e.clientY - _my)
  }

  function onUp() {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    if (storageKey) localStorage.setItem(userKey(storageKey), JSON.stringify({ x: x.value, y: y.value }))
  }

  function startDrag(e) {
    if (e.button !== 0) return
    e.preventDefault()
    _mx = e.clientX; _my = e.clientY
    _ox = x.value;  _oy = y.value
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return { x, y, startDrag }
}
