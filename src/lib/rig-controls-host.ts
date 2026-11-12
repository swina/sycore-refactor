/**
 * The Rig Controls panel (Performance): the Rig Controller's controls — Transport / Clock,
 * Performance, Safety, Controller template, Play — in their own window. The Rig panel keeps the
 * state and the actions; it teleports the controls into this panel's body while both are open.
 */
import { shallowRef, type InjectionKey } from 'vue'

/** The Rig Controls panel's body, while it is open (null: closed). */
export const rigControlsHost = shallowRef<HTMLElement | null>(null)

/** What RigControlSections reads from the Rig panel (its refs, computeds and actions). */
export const RIG_CONTROLS_CTX: InjectionKey<Record<string, any>> = Symbol('rig-controls')
