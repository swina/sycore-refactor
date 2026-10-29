// Demo build (`npm run build:demo`, VITE_DEMO=1): a SY.CORE to try without the local
// login — a guest session is created on first visit — that opens on Chord Progression routed
// to the FM-1 Emulator in MIDI Flow. Everything else is the regular app.
import type { LocalUser } from '@/lib/auth'

export const IS_DEMO = import.meta.env.VITE_DEMO === '1'

export const DEMO_FM1_OUTPUT = 'FM-1 Emulator'
const SEEDED_KEY = 'SYCORE_DEMO_SEEDED'

export function demoGuestUser(): LocalUser {
  return {
    uid: 'demo-guest',
    email: 'guest@demo.sycore',
    emailVerified: true,
    isAnonymous: true,
    displayName: 'Guest',
    providerData: [{ providerId: 'demo', displayName: 'Guest', email: 'guest@demo.sycore' }],
  }
}

interface DemoMidiStore {
  routingConfig: { registrations: Record<string, any> }
  addRegistration(name: string): void
  updateRegistration(name: string, field: string, value: any): void
  setRouting(source: string, outputNames: string[]): void
}

/**
 * First visit only: Chord Progression → FM-1 Emulator, so MIDI Flow builds that canvas from
 * the routing state. Later visits keep whatever the visitor changed.
 */
export function seedDemoRouting(midiStore: DemoMidiStore, chordProgSource: string, storageKey: string = SEEDED_KEY): boolean {
  try { if (localStorage.getItem(storageKey)) return false } catch {}
  if (!midiStore.routingConfig.registrations[DEMO_FM1_OUTPUT]) {
    midiStore.addRegistration(DEMO_FM1_OUTPUT)
    midiStore.updateRegistration(DEMO_FM1_OUTPUT, 'inEnabled', false)
  }
  midiStore.setRouting(chordProgSource, [DEMO_FM1_OUTPUT])
  try { localStorage.setItem(storageKey, '1') } catch {}
  return true
}
