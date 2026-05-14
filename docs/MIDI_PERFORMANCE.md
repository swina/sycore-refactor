# SY.CORE MIDI PERFORMANCE

Il **MIDI Performance Panel** è il cuore pulsante del routing e della gestione MIDI dal vivo di SY.CORE. Permette di definire in tempo reale quali flussi di messaggi passano tra i vari controller e sintetizzatori hardware/software collegati al sistema, offrendo un'interfaccia intuitiva (Matrix o Flow) e funzionalità generative uniche come lo *Smart Latch*.

## Funzionalità Principali

### 1. Viste Avanzate (Grid vs Flow)
L'interfaccia offre due modalità intercambiabili:
- **Grid View (Matrix):** Una matrice M x N dove le righe rappresentano gli input MIDI (controller, tastiere, motori interni come Arpeggiator e Sequencer) e le colonne i device hardware in output. I checkbox permettono collegamenti rapidi ed incrociati.
- **Flow View:** Una visualizzazione grafica dei flussi (dagli Input agli Output), indicando le connessioni attive in modo chiaro e organico. Perfetta per il colpo d'occhio rapido in scenari live.

### 2. Broadcast Mode
Una modalità globale ("Master Thru") che, quando attivata, permette a tutti gli input registrati di inviare dati a tutti gli output registrati contemporaneamente, sorpassando le configurazioni della matrice. Ottima per i "Panic Mode" o per setup molto rapidi e generici dove tutti controllano tutto.

### 3. Filtri Intelligenti in Ingress
Il routing è ottimizzato e mostra solo le righe dei device che hanno effettivamente capacità "MIDI IN" attive ed espone le colonne solo per i device con "MIDI OUT" attivi (secondo la registrazione effettuata nel pannello MIDI MATRIX Settings). Dispositivi virtuali come lo Step Sequencer, l'Arpeggiatore o il pulsante di sistema (MIDI START/STOP) vengono inclusi di base.

### 4. Smart Latch (Intelligent Note Hold)
Lo *Smart Latch* è una funzionalità performativa avanzata per mettere in pausa/trattenere "in hold" le note in modo generativo senza utilizzare un pedale sustain fisico convenzionale. Caratteristiche chiave:

- **Routing Selettivo (Per-Output):** Dalla Grid View, è possibile abilitare il Latch *solo* verso specifici sintetizzatori hardware cliccando sulla relativa "icona a forma di lucchetto".
- **Master Toggle:** L'attivazione principale dello Smart Latch può avvenire dal pannello o mappandola a un pad/knob hardware tramite `app-midi-actions` (`smart_latch_cc`). Attivando il Master, tutti i synth configurati col lucchetto tratterranno le note, gli altri no.
- **Politica FIFO:** È presente una coda in cui puoi configurare quante note trattenere (da 1 a 8).
- **Modalità "Replace":** Se spuntata, la FIFO entra in modalità circolare: superato il limite di note stabilito (es. 4 note), una 5a nota scalzerà e rimpiazzerà la più vecchia inviando un `Note Off` unicamente per quest'ultima. Se invece è disattivata, ogni nuova nota eccedente il limite verrà scartata (utile per bloccare droning chords complessi senza inquinarli per errore).

### 5. Controllo "Pass Thru"
Per controller mappati con il MIDI MAPPER di SY.CORE per controllare parametri UI, l'azione `pass_thru` permette ai comandi o Note di passare indenni, pur garantendo l'ascolto delle azioni interne. È altresì suggerito utilizzare il flag `CONSUME` sui controlli dedicati all'App (come il bottone hardware dello Smart Latch) in modo da nascondere/bloccare il relativo segnale ai synth hardware, non causando sgraditi scatti di parametri MIDI.

### 6. Mappatura START / STOP
I classici controlli globali di Trasporto MIDI (Start / Stop) presenti nell'UI principale sono inseriti esplicitamente tra le sorgenti MIDI della Performance Matrix, così potrai configurare selettivamente a quale batteria elettronica / drum machine o synth passare il sync di clock senza spammare la tua intera workstation.

## Sicurezza del Segnale
Ogni modifica al Latch o ai filtri ha impatto immediato nei buffer di Note On/Off: la disattivazione chirurgica dello Smart Latch avvia un automatico "Garbage Collection" inviando i *Note Off* esatti per le note che erano rimaste impiccate, impedendo qualsiasi freeze degli oscillatori delle macchine fisiche.
