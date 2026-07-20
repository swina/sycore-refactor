# EmulatorX3 - Program Change

This is a custom Virtual Instrument Device Program Change logic.

Given a virtual instrument from (only for virtual instruments!)

/home/antonio/personal/apps/refactor/sycore-refactor/src/components/MidiDeviceProgramChangePanel.vue

- user can assign to the instrument a bank import receipt of type : "EMULATOR X"
- upload the txt file exported by the Emulator X
    
The sample file is /home/antonio/personal/apps/refactor/sycore-refactor/src/data/program_change/emulatorX3/modulator-x3.txt

Logic to implement:
- the name of the imported banks is identified in the first line of the file by the filename with extension .exb
- the rows to collect data for the banks catalog are in the Presets section. 
- rows example:
    nr.         bank:PC         preset name                         category
    000     	000:000     	syn:Vintage                       	Synthesizer
    001     	000:001     	syn:Metasynth2                    	Synthesizer

- create a catalog by category
- list the presets and selecting the preset it will send the following MIDI messages
    MIDI CC64 = 0
    MIDI CC32 = bank
    MIDI PC = PC
