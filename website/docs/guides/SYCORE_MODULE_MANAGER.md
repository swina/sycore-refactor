# Module Manager & AI Settings

> Configure which modules are visible and set up AI-powered features.

---

## Module Manager

<img src="../../help/guides/sycore-modules-manager.png"/>

The **Module Manager** (admin-only panel) controls which modules appear in the application launcher, toolbar, MIDI mappings, and keyboard shortcuts. Disabling a module hides it from the UI **but does not remove its code or data** — it can be re-enabled at any time.

### How to Open

The Module Manager is available from the **Settings** panel (gear icon) when you are logged in as admin.

### Overview

| Feature | Description |
|---|---|
| **Module Cards** | Every module is shown as a card with its icon, label, optional badge (e.g. "Beta"), and internal ID. |
| **Category Groups** | Modules are organised into categories — MIDI, Audio, Live Performance, Utility, Tools — each with a distinct colour accent. |
| **Toggle Switch** | Click the pill-shaped toggle to enable or disable a module. Changes save immediately. |
| **Self-Protection** | The Module Manager module itself cannot be disabled — it is the only way to re-enable hidden modules. |
| **Live Count** | The header shows how many modules are currently enabled out of the total. |

### What Happens When You Disable a Module

- The module is removed from the **Launcher** (main page tiles).
- It is removed from the **Toolbar** (top bar module switcher).
- Its **MIDI mappings** and **keyboard shortcuts** are deactivated.
- The module's **data and configuration** are preserved — nothing is deleted.
- Other modules that depend on the disabled module may be affected (e.g. disabling MIDI Flow will also disable the MIDI Monitor).

---

## AI Settings

<img src="../../help/guides/sycore-ai-settings.png"/>

The **AI Settings** panel lets you configure which AI provider the app uses for features like:
- **AI Generate** in the Chord Progression Sequencer
- **AI Generate** in the Drum Machine
- **AI Generate** in the Step Sequencer

### Supported Providers

| Provider | Requires API Key | Default Model |
|----------|-----------------|---------------|
| Zen | No | `opencode-zen` |
| OpenCode Go | No | — |
| OpenRouter | Yes | `openai/gpt-4o-mini` |
| OpenAI | Yes | `gpt-4o-mini` |
| Anthropic | Yes | `claude-sonnet-4-20250514` |
| Google (Gemini) | Yes | `gemini-2.0-flash-001` |
| Custom | — | — |

### How to Configure

1. **Select a Provider** — Choose from the dropdown. The endpoint URL and default model are auto-filled.
2. **Choose a Model** — If the provider has a predefined model list, select from the dropdown, or type a custom model name in the text input.
3. **Set the Endpoint** — The base URL is pre-filled from the provider. You can override it if needed (useful for local or self-hosted endpoints).
4. **Enter API Key** — For providers that require one, type your key in the password-masked field. The key is saved securely to your user profile (not to IndexedDB).
5. **Test Connection** — Click "Test Connection" to verify the provider is reachable. A green "Connected" status confirms everything works.

### Notes

- **Free providers** (Zen, OpenCode Go) require no API key — select one of these if you want to test AI features without any configuration.
- **Custom provider** lets you use any OpenAI-compatible endpoint. Set your own `baseUrl` and model name.
- The API key is stored in your **auth profile**, separate from the rest of the configuration. It is never saved to IndexedDB.
- AI features work offline? No — a network connection is required when using remote providers.

---

*Last updated: 2026-08-31*