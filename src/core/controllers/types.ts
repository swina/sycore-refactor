export type ControllerFeedback = {
  note?: number;
  cc?: number;
  value: number;
  channel?: number;
};

export interface ControllerProfile {
  name: string;
  matchName: string | RegExp; // Used to identify the device
  
  // Initialization logic (e.g. clear LEDs, set mode)
  onInit: (send: (data: number[]) => void) => void;
  
  // Handle incoming MIDI from the device
  onMidi: (
    data: Uint8Array, 
    dispatch: (action: string, val: number) => void,
    state: any
  ) => boolean; // Return true if handled (consumed)

  // Update LEDs based on app state
  updateFeedback: (
    send: (data: number[]) => void,
    state: any
  ) => void;
}
