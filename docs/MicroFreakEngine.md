```
const FREAK_DATABASE = {
    pad: {
        cc: { 9: [105, 115], 23: [40, 75], 83: [0, 40], 105: [75, 120], 106: [80, 110], 29: [90, 127], 118: [64, 127], 119: [60, 100] }, // Cloud Grains, Unison 3-4 Voci, Chorus
        nrpn: { 12: [70, 95] } // LFO -> Timbre
    },
    lead: {
        cc: { 9: [12, 16], 23: [70, 115], 83: [20, 60], 105: [0, 15], 106: [40, 80], 29: [70, 100], 110: [40, 75], 118: [32, 63] }, // SuperWave, Attack veloce, Unison leggero
        nrpn: { 5: [68, 85] } // Envelope -> Pitch (Slight Pitch Kick)
    },
    key: {
        cc: { 9: [34, 38], 23: [60, 90], 83: [10, 30], 105: [2, 10], 106: [50, 80], 29: [20, 50], 119: [30, 70] }, // Virtual Analog, Decay percussivo naturale
        nrpn: { 8: [75, 95] } // Envelope -> Cutoff
    },
    bass: {
        cc: { 9: [78, 82], 23: [25, 55], 83: [15, 50], 105: [0, 5], 106: [30, 65], 29: [40, 80], 110: [10, 40], 118: [32, 63] }, // Bass Engine nativo, Sub presente, Unison stretto
        nrpn: { 8: [80, 110] } // Envelope -> Cutoff spinto
    },
    drone: {
        cc: { 9: [17, 22], 23: [30, 70], 83: [40, 90], 105: [100, 127], 29: [127, 127], 118: [96, 127], 119: [80, 127] }, // Wavetable, Filtro risonante fisso, Sustain Massimo, Chorus Totale
        nrpn: { 11: [20, 50], 13: [10, 45] } // LFO muove Wave e Cutoff in opposizione
    },
    ambient: {
        cc: { 9: [111, 115], 23: [40, 70], 105: [80, 127], 106: [90, 127], 29: [100, 127], 119: [90, 127] }, // Cloud Grains, Transienti morbidissimi
        nrpn: { 12: [68, 90] }
    },
    texture: {
        cc: { 9: [100, 104], 23: [50, 95], 83: [30, 70], 105: [40, 90], 117: [70, 120], 119: [50, 110] }, // Sample Engine, Dispersione stereo
        nrpn: { 16: [80, 115] } // Pressure -> Wave
    },
    bell: {
        cc: { 9: [45, 49], 23: [65, 100], 83: [30, 70], 105: [0, 2], 106: [60, 95], 29: [0, 10], 119: [50, 90] }, // Two Op FM, Attacco metallico nullo, Decay lungo
        nrpn: { 7: [75, 105] } // Envelope -> Timbre (FM amount decrescente)
    },
    arp: {
        cc: { 9: [23, 27], 23: [50, 95], 83: [20, 55], 105: [0, 4], 106: [25, 55], 29: [0, 30], 110: [0, 30] }, // Harmonic Engine, Decay molto scattante
        nrpn: { 23: [80, 110] } // Key/Arp -> Cutoff (Note alte aprono il filtro)
    },
    percussion: {
        cc: { 9: [72, 77], 23: [40, 110], 83: [10, 80], 105: [0, 0], 106: [10, 40], 29: [0, 0], 118: [0, 31] }, // Noise Engine, No Unison, No Sustain
        nrpn: { 3: [90, 127] } // Cycling Env -> Cutoff (Inviluppo ultra rapido sul filtro)
    },
    strings: {
        cc: { 9: [12, 16], 23: [50, 80], 83: [5, 25], 105: [50, 85], 106: [70, 100], 29: [85, 115], 118: [96, 127] }, // SuperWave, Attacco orchestrale, Unison massimo
        nrpn: { 10: [66, 75] } // LFO -> Pitch (Vibrato leggero)
    },
    orchestra: {
        cc: { 9: [89, 93], 23: [45, 85], 105: [45, 80], 106: [60, 95], 29: [75, 105], 118: [64, 95], 119: [40, 80] }, // Harm Engine, Suono denso ottonato/sinfonico
        nrpn: { 8: [70, 90] }
    },
    organ: {
        cc: { 9: [23, 27], 23: [80, 120], 83: [0, 15], 105: [0, 5], 106: [90, 127], 29: [127, 127], 119: [60, 100] }, // Harmonic, Attacco immediato, Sustain pieno, Chorus (simulazione Leslie)
        nrpn: { 12: [65, 85] } // LFO lento su Timbre per simulare drawbars in movimento
    },
    brass: {
        cc: { 9: [50, 55], 23: [40, 80], 83: [20, 45], 105: [20, 45], 106: [50, 85], 29: [60, 95] }, // Formant/Poly Analog, Attacco tipico a "gonfio"
        nrpn: { 8: [85, 115] } // Envelope -> Cutoff fondamentale per il "brass swell"
    },
    piano: {
        cc: { 9: [34, 38], 23: [70, 95], 83: [5, 20], 105: [0, 3], 106: [55, 85], 29: [0, 20], 119: [20, 50] }, // Virtual Analog per piani elettrici/corposi
        nrpn: { 22: [70, 90] } // Key/Arp -> Timbre (Velocity controlla la brillantezza)
    },
    synth: {
        cc: { 9: [0, 11], 23: [60, 105], 83: [10, 50], 105: [5, 25], 106: [45, 85], 29: [50, 90], 118: [32, 63] }, // Basic Waves, Suono polivalente classico, Unison standard
        nrpn: { 13: [65, 85] }
    },
    pluck: {
        cc: { 9: [28, 33], 23: [50, 90], 83: [15, 45], 105: [0, 2], 106: [20, 45], 29: [0, 5], 119: [40, 80] }, // Karplus Strong, Chiusura netta, No Sustain
        nrpn: { 1: [85, 120] } // CycEnv -> Wave (Schiocco metallico iniziale sulla corda pizzicata)
    },
    acid: {
        cc: { 9: [34, 38], 23: [20, 60], 83: [95, 127], 105: [0, 3], 106: [35, 70], 29: [10, 45], 118: [0, 31] }, // Virtual Analog, Risonanza quasi al massimo, No Unison (monofonico nativo)
        nrpn: { 8: [95, 127] } // Envelope -> Cutoff estremo per modulazioni 303-style
    },
    experimental: {
        cc: { 9: [122, 127], 23: [30, 110], 83: [40, 100], 105: [10, 60], 106: [30, 100], 118: [32, 127], 119: [60, 127] }, // Vocoder / Motori instabili, Unison e FX casuali
        nrpn: { 11: [0, 127], 13: [0, 127], 14: [0, 127] } // Modulazioni caotiche e imprevedibili su tutta la matrice
    }
};
```

FLAVORS 
```
const FLAVOUR_MODIFIERS = {
    DARK: {
        cc: { 23: [15, 45], 83: [0, 15], 119: [10, 40] } // Chiude drasticamente il filtro, abbassa gli effetti
    },
    BRIGHT: {
        cc: { 23: [90, 125], 13: [80, 120] } // Spinge al massimo l'apertura e lo Shape dell'onda
    },
    FAT_UNISON: {
        cc: { 118: [96, 127], 110: [70, 110], 117: [80, 127] } // Forza l'unison a 4 voci con un detune pesante e largo
    },
    SPACE_CHORUS: {
        cc: { 119: [100, 127], 117: [90, 127] } // Attiva la massima spazializzazione del chorus analogico
    }
};
```

PROCEDURA DI GENERAZIONE
```
function generateConstrainedValue(range) {
    if (!range) return Math.floor(Math.random() * 128);
    return Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
}

function generateAdvancedPatch(category, flavour = null) {
    let finalPatch = { cc: {}, nrpn: {} };
    const targetCat = FREAK_DATABASE[category.toLowerCase()];
    const targetFlav = flavour ? FLAVOUR_MODIFIERS[flavour.toUpperCase()] : null;

    if (!targetCat) {
        console.warn(`Categoria ${category} non riconosciuta. Genero patch d'emergenza.`);
        return null;
    }

    // 1. Inizializzazione CC Standard di base del MicroFreak
    const standardCCList = [10, 12, 13, 93, 102, 103, 105, 106, 28, 29, 23, 83, 110, 117, 118, 119];
    standardCCList.forEach(cc => { finalPatch.cc[cc] = Math.floor(Math.random() * 128); });

    // 2. Iniezione vincoli strutturali della Categoria
    finalPatch.cc[9] = generateConstrainedValue(targetCat.cc[9]); // Seleziona il motore oscillatore corretto
    Object.keys(targetCat.cc).forEach(cc => {
        finalPatch.cc[cc] = generateConstrainedValue(targetCat.cc[cc]);
    });
    Object.keys(targetCat.nrpn).forEach(lsb => {
        finalPatch.nrpn[lsb] = generateConstrainedValue(targetCat.nrpn[lsb]);
    });

    // 3. Sovrascrittura Modificatori di Flavour (Es. se chiedi un "BASS" ma con flavour "FAT_UNISON")
    if (targetFlav) {
        Object.keys(targetFlav.cc).forEach(cc => {
            finalPatch.cc[cc] = generateConstrainedValue(targetFlav.cc[cc]);
        });
    }

    return finalPatch;
}

// Funzione principale richiamata dall'interfaccia dell'applicazione web
function buildComparisonPatches(selectedCategory, selectedFlavour = null) {
    return {
        A: generateAdvancedPatch(selectedCategory, selectedFlavour),
        B: generateAdvancedPatch(selectedCategory, selectedFlavour)
    };
}
```

CC MAP

```
const MICROFREAK_CC_MAP = {
    // SEZIONE OSCILLATORE / MOTORE DI SINTESI
    oscillator_type: { nome: "Oscillator Type", id: "oscillator_type", cc: 9 },
    wave:            { nome: "Wave",            id: "wave",            cc: 10 },
    timbre:          { nome: "Timbre",          id: "timbre",          cc: 12 },
    shape:           { nome: "Shape",           id: "shape",           cc: 13 },

    // SEZIONE FILTRO
    filter_cutoff:    { nome: "Filter Cutoff",    id: "filter_cutoff",    cc: 23 },
    filter_resonance: { nome: "Filter Resonance", id: "filter_resonance", cc: 83 },

    // SEZIONE INVILLEPPO STANDARD (Envelope)
    envelope_attack:  { nome: "Envelope Attack",  id: "envelope_attack",  cc: 105 },
    envelope_decay:   { nome: "Envelope Decay",   id: "envelope_decay",   cc: 106 },
    envelope_sustain: { nome: "Envelope Sustain", id: "envelope_sustain", cc: 29 },
    envelope_filter_amount: { nome: "Envelope Filter Amount", id: "envelope_filter_amount", cc: 26 },

    // SEZIONE CYCLING ENVELOPE
    cycling_env_rise:   { nome: "Cycling Env Rise",   id: "cycling_env_rise",   cc: 102 },
    cycling_env_fall:   { nome: "Cycling Env Fall",   id: "cycling_env_fall",   cc: 103 },
    cycling_env_hold:   { nome: "Cycling Env Hold",   id: "cycling_env_hold",   cc: 28 },
    cycling_env_amount: { nome: "Cycling Env Amount", id: "cycling_env_amount", cc: 24 },
    cycling_env_mode:   { nome: "Cycling Env Mode",   id: "cycling_env_mode",   cc: 25 }, // Envelop / Run / Loop

    // SEZIONE LFO
    lfo_rate: { nome: "LFO Rate", id: "lfo_rate", cc: 93 },
    lfo_wave: { nome: "LFO Wave", id: "lfo_wave", cc: 94 }, // Sine, Tri, Saw, Square, Random, SnH

    // SEZIONE TASTIERA / ESPRESSIVITÀ / UTILITY
    glide:          { nome: "Glide",          id: "glide",          cc: 5 },
    spice:          { nome: "Spice",          id: "spice",          cc: 107 },
    dice:           { nome: "Dice",           id: "dice",           cc: 108 },
    bend_range:     { nome: "Bend Range",     { id: "bend_range",   cc: 109 },

    // SEZIONE UNISON / CHORUS / EFFETTI (Firmware Recenti)
    unison_detune:  { nome: "Unison Detune",   id: "unison_detune",  cc: 110 },
    unison_spread:  { nome: "Unison Spread",   id: "unison_spread",  cc: 117 },
    unison_mode:    { nome: "Unison Mode",     id: "unison_mode",    cc: 118 }, // Voice count / Spento
    chorus_mix:     { nome: "Chorus/FX Mix",   id: "chorus_mix",     cc: 119 },

    // SEZIONE ARPEGGIATORE / SEQUENCER
    arp_seq_rate:   { nome: "Arp/Seq Rate",   id: "arp_seq_rate",   cc: 91 },
    arp_seq_gate:   { nome: "Arp/Seq Gate",   id: "arp_seq_gate",   cc: 92 },
    arp_seq_swing:  { nome: "Arp/Seq Swing",  id: "arp_seq_swing",  cc: 76 }
};

```