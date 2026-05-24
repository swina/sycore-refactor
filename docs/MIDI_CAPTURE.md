# MIDI CAPTURE

The scope of MIDI Capture is to record MIDI NOTES EVENTS and perform some actions iwth captured one.
The MIDI Capture will be a new panel that overwrite the file F:\Projects\sy.core\sy.core-app\src\components\MidiCapture.vue
Keep the current midicapture key to manage in the toolbar settings.
## WORKFLOW

- Capture will be activated by a START/STOP button
- Events to be captured:
    - MIDI NOTES (note,velocity)
- At STOP the captured events will be rendered on a Piano Roll preview with time subdivision from 1/16.
- Events can be deleted and moved. To update/modify an event add a contextual menu that open a dialog with the event data editor
- Use can set the start/end points of the capture and then cut all other events out of the range start/end
- The captured events (cropped) can be sent to a new sequence of the Step Sequencer or exported as MIDI file.
