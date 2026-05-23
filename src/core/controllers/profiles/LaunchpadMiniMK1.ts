import { ControllerProfile } from '../types'

/**
 * Native Driver for Novation Launchpad Mini MK1 / MK2
 * Standard MIDI Mode
 */
export const LaunchpadMiniMK1: ControllerProfile = {
    name: 'Launchpad Mini MK1',
    matchName: /Launchpad/i,

    onInit: (send) => {
        // Standard Init: Reset then XY Layout
        send([0xB0, 0, 0]);
        send([0xB0, 0, 1]);

        // Quick blink on top-right to confirm connection
        send([0xB0, 111, 60]);
        setTimeout(() => send([0xB0, 111, 0]), 200);
    },

    onMidi: (data, dispatch, state) => {
        const status = data[0];
        const type = status & 0xF0;
        const note = data[1];
        const val = data[2];

        if (val === 0) return true;

        if (type === 0xB0) {
            switch (note) {
                case 104: dispatch('toggle_visualizer', val); return true;
                case 105: dispatch('toggle_sequencer', val); return true;
                case 106: dispatch('toggle_arp', val); return true;
                case 107: dispatch('toggle_liveset', val); return true;
                case 108: dispatch('open_midi_matrix', val); return true;
                case 109: dispatch('toggle_audio_capture', val); return true;
                case 110: dispatch('toggle_looper', val); return true;
                case 111: dispatch('toggle_panel', val); return true;
            }
        }

        if (type === 0x90) {
            const row = Math.floor(note / 16);
            const col = note % 16;
            if (row < 8 && col < 8) {
                const padIdx = (row * 8) + col;
                dispatch('grid_pad_press', { index: padIdx, val });
                return true;
            }
        }

        return true;
    },

    updateFeedback: (send, state) => {
        const deviceName = 'Launchpad Mini';
        // Force Channel 1 (0x90/0xB0) as Launchpad hardware rarely responds to other channels for LEDs
        const noteOnStatus = 0x90;
        const ccStatus = 0xB0;

        const getGreen = (v) => v ? 60 : 0;

        // 1. Defaults for Top Row (if not overridden by user)
        const topRow = [104, 105, 106, 107, 108, 109, 110, 111];
        topRow.forEach(n => {
            // Only send default if there's no custom mapping for this CC
            const hasCustom = state.mappings?.some(m => m.device?.includes('Launchpad') && m.cc === n);
            if (!hasCustom) {
                let val = 0;
                if (n === 104) val = getGreen(state.ui.isVisualizerOpen);
                if (n === 105) val = getGreen(state.ui.isSequencerOpen);
                if (n === 106) val = getGreen(state.arp.arpEnabled);
                if (n === 107) val = getGreen(state.ui.isLiveSetOpen);
                if (n === 108) val = getGreen(state.ui.isMidiMatrixOpen);
                if (n === 109) val = getGreen(state.ui.isAudioCaptureOpen);
                if (n === 110) val = getGreen(state.ui.isLooperOpen);
                if (n === 111) val = getGreen(!state.ui.isPanelCollapsed);
                send([ccStatus, n, val]);
            }
        });

        // 2. Custom Mappings (Pads & Buttons)
        if (state.mappings && Array.isArray(state.mappings)) {
            state.mappings.forEach(m => {
                if (m.device?.includes('Launchpad') && m.feedbackOn !== undefined) {
                    const isActive = state.getActionStatus(m.action);
                    const color = isActive ? m.feedbackOn : (m.feedbackOff ?? 0);

                    if (m.note !== undefined) send([noteOnStatus, m.note, color]);
                    if (m.cc !== undefined) send([ccStatus, m.cc, color]);
                }
            });
        }

        // 3. MIDI-Learn note mappings for lpp_* pads (lpp_set_, lpp_devpc_, lpp_bt_)
        // amber (51) = active, off (0) = inactive
        if (state.midiMappings) {
            Object.values(state.midiMappings).forEach((m: any) => {
                if (
                    typeof m !== 'object' ||
                    m.note == null ||
                    !m.paramName?.startsWith('lpp_') ||
                    !m.device?.toLowerCase().includes('launchpad')
                ) return;
                const isActive = state.getActionStatus(m.paramName);
                send([noteOnStatus, m.note, isActive ? 51 : 0]);
            });
        }
    }
}