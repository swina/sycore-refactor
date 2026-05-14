# STARTUP: Robust Bootstrapping & Local-First Initialization

This document summarizes the architectural improvements implemented to resolve application startup deadlocks and ensure a consistent user experience for both new and existing users.

## 1. Deterministic Startup Sequence
Previously, the application suffered from a "blank screen" deadlock when the local database was empty, as the UI attempted to render components using uninitialized store data.

- **Pre-Mount Initialization**: Refactored `src/main.js` to use top-level `await` for `configStore.init()`. The Vue application now only mounts *after* critical system configuration is fully loaded into memory.
- **Synchronized Auth**: Initialized `authStore` early in the lifecycle to restore sessions and determine user roles before the first render.

## 2. Centralized System Seeding
To eliminate the need for manual setup, we implemented an automated seeding utility within the configuration store.

- **Defensive Seeding**: The `init()` method in `useConfigStore.js` now detects an empty `system` collection in IndexedDB.
- **Master Schema**: It automatically populates the database using `src/data/system_config.json`, covering MIDI CC mappings, UI categories, toolbar layouts, and global app settings.

## 3. Local-First User Experience
The application has transitioned from a cloud-dependent model to a robust local-first architecture.

- **First-User Admin Elevation**: Implemented logic in `useAuthStore.js` that automatically assigns the `admin` role to the very first user registered in the local system. This allows immediate access to administrative panels without manual database intervention.
- **Persistent Profiles**: User profiles and preferences are now fully persisted in IndexedDB, ensuring offline capability and faster load times.

## 4. Factory Sound Bank Population
New users are now greeted with a rich set of demonstration sounds to facilitate immediate exploration of the synth engine.

- **Automated Bank Seeding**: `usePresetStore.js` now checks for an empty sound library during initialization.
- **Factory Presets**: If empty, it automatically imports a curated set of factory sounds from `BANK_DEFAULT.json`, complete with categories, metadata, and engine configurations.

## 5. UI/UX Stability
- **Cleanup**: Removed redundant and conflicting seeding logic from individual components (`SynthApp.vue`, `PresetHistoryPanel.vue`).
- **Deterministic State**: Components now receive valid, seeded data on their first render, eliminating UI flickers and "stuck" loading states.

---
> [!TIP]
> To reset the application to its base state for testing, clear the IndexedDB (`sycore-db`) in the browser's Developer Tools and refresh the page. The system will automatically re-run the entire bootstrap sequence.
