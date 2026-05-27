# SOUND - SEQUENCES

When a sound has an associated sequence the behavior should be:

1. At the first note on received it will autostart the step sequencer. 
2. The step sequencer will run as defined, transposing the sequence based on the notes played
3. The button Step Sequencer will have a background purple indicating that the sound has a sequence associated
4. The button Play Sequencer will controll the play/stop of the sequencer and remove the call to functions playPreview()/stopPreview()
5. Add a tag SEQ in the header, under the sound name, after the polyMode if the sound has a sequence associated.
