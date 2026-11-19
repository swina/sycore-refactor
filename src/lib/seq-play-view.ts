// The Sequencer play view's step view, shared by its header (the View selector) and the view itself:
// 'notes' (every step with its note name) or 'lanes' (bars at their pitch, up to 16 steps). Per browser.
import { ref } from 'vue'

export type SeqPlayView = 'notes' | 'lanes'
const KEY = 'SYCORE_SEQ_PLAY_VIEW'
const read = (): SeqPlayView => { try { const v = localStorage.getItem(KEY); return v && v !== 'notes' ? 'lanes' : 'notes' } catch { return 'notes' } }

export const seqPlayView = ref<SeqPlayView>(read())
export function setSeqPlayView(v: SeqPlayView) {
  seqPlayView.value = v
  try { localStorage.setItem(KEY, v) } catch {}
}
/** Re-read (tests, account switch). */
export function reloadSeqPlayView() { seqPlayView.value = read() }
