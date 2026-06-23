# MIDI WIZARD PLAN

The MIDI WIZARD is a component panel used to facilitate the user midi settings using the following workflow:

## MIDI CONTROLLERS

1. Select a MIDI INPUT DEVICE (source controller)
2. Select the MIDI OUTPUT DEVICE(s) (target(s)). Can be multiple.
3. Set the MIDI INPUT DEVICE MIDI Channel (OMNI, 1-16)
4. Set the MIDI OUTPUT DEVICE MIDI Channel (Input and Output)
5. Set the MIDI ROUTING for the MIDI OUTPUT DEVICE in order to ENABLE/DISABLE: SYNC, TRANSPORT, NOTE, CC, PC (Program Change). See the F:\sycore\src\components\MidiPortConfig.vue for reference.

This workflow can be repeated for each MIDI INPUT DEVICE (source controller) based on the user choice (ADD MIDI CONTROLLER).

