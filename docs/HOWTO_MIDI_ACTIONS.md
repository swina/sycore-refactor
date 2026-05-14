# Guide to Creating MIDI ACTIONS

**MIDI ACTIONS** are application commands (e.g., "Open Matrix", "Change BPM", "Toggle Sequencer") that can be mapped to external hardware controllers. Follow this guide to add new actions independently.

---

## 1. Action Definition (Type & Label)
The first step is to register the action in the type system and assign it a readable label.

**File:** `src/lib/app-midi-actions.ts`

1.  Add the action key to the `AppAction` type:
    ```typescript
    export type AppAction = 
      | 'prev_preset'
      | 'my_new_action' // <-- Add here
    ```

2.  Add the descriptive label in `APP_ACTION_LABELS`:
    ```typescript
    export const APP_ACTION_LABELS: Record<AppAction, string> = {
      // ...
      my_new_action: 'My New Functionality', // <-- Name that will appear in the menu
    };
    ```

---

## 2. Logic Implementation
Now you need to tell the application what to do when it receives that command.

**File:** `src/composables/useAppActions.js`

Add a new `case` in the `dispatchAction` function:
```javascript
export function useAppActions() {
  const uiStore = useUiStore()
  // ...

  function dispatchAction(action, ccVal = 0) {
    switch (action) {
      // ...
      case 'my_new_action':
        // Custom logic:
        uiStore.isMyWindowOpen = !uiStore.isMyWindowOpen;
        break;
    }
  }
}
```

---

## 3. Continuous Actions (Optional)
If your action needs to respond to the full range of the potentiometer (0-127) instead of acting as a simple button (on/off):

1.  Add it to the `CONTINUOUS_ACTIONS` set in `src/lib/app-midi-actions.ts`.
2.  Use the `ccVal` parameter in `useAppActions.js` to calculate the value:
    ```javascript
    case 'my_continuous_value':
      // Example: map 0-127 to a 0-100% range
      const percent = (ccVal / 127) * 100;
      store.value = percent;
      break;
    ```

---

## Common Logic Examples
- **Toggle UI**: `uiStore.variableName = !uiStore.variableName`
- **Navigation**: `presetStore.navigateHistory('next')`
- **Global Events**: If you need to control a component that listens for custom events:
  ```javascript
  window.dispatchEvent(new CustomEvent('my-event', { detail: { value: ccVal } }));
  ```

---

## Result
After saving the files, the new action will immediately appear in the "Select Action" dropdown menu of the **MIDI ACTIONS** panel (MIDI Matrix) and can be learned via the **MIDI LEARN** button.
