int the bank each presets have the following structure:
- id: univoque ID
- name: name of the preset
- category: category of the preset (sound type)
- data: object containing the preset data where the key is the controller name and the value the controller value
- patchNotes: the notes created during generation
- arpConfig : {
    enabled: boolean,
    mode: string (up, down, up&down , random )
    bpm: number (60 - 240)
    subdivision: string (1/4, 1/8, 1/16, etc.)
    hold: boolean (send CC64 or not)
    steps: number (1 - 64)
}
- seqConfig: {} sequencer configuration
- abVariant: { name: string, data: array of controllers values like data }
- createdAt: Date (format 2026-05-04T10:40:36.556Z)
- updatedAt: Date (format 2026-05-04T10:40:36.556Z)
- isFavorite: boolean
