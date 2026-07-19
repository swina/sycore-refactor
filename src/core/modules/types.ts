import type { Component } from 'vue'

/** Launcher section groupings — mirrors the section titles on MainPageOptimized.vue */
export type ModuleCategory =
  | 'midi-config'
  | 'sound-design'
  | 'midi-tools'
  | 'audio-tools'
  | 'performance'

export interface ModuleManifest {
  /** Canonical id — matches configStore.toolbarConfig ids and useUiStore's PANEL_ID_REF_LOOKUP keys */
  id: string
  label: string
  icon: Component
  category: ModuleCategory
  badge?: string
  /** Launcher card background image (MainPageOptimized.vue) */
  bg?: string
  /**
   * Lazy-loaded panel component. Optional for now — most modules still mount
   * from hand-written blocks in SynthApp.vue/App.vue. Populated as modules
   * are migrated in later phases (see docs/plans/modular-panel-system.md).
   */
  component?: () => Promise<Component>
  panelMode?: 'modal' | 'drawer' | 'singleton'
  /** Optional key into authStore.profile.features gating this module */
  featureFlag?: string
}
