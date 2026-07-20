import type { Component } from 'vue'

/** Section groupings — used by both MainPageOptimized.vue's launcher and ModuleManagerPanel.vue */
export type ModuleCategory =
  | 'midi-config'
  | 'sound-design'
  | 'midi-tools'
  | 'audio-tools'
  | 'performance'
  | 'system'

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
   * Whether this module gets a launcher card on MainPageOptimized.vue.
   * Defaults to true when unset. Toolbar/footer-only utilities (Profile,
   * Help, Admin, Panic, ...) set this to false — they're still fully
   * tracked in ModuleManagerPanel.vue and AppFooter/MainMenuDial, just not
   * shown as launcher tiles (many already have bespoke launcher UI, e.g.
   * the dedicated Profile/Help/About/Admin cards).
   */
  showOnLauncher?: boolean
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
