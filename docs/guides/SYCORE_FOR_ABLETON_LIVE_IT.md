# SY.CORE per Ableton Live
## Accordi, pattern e groove generati mentre suoni. A tempo con Live, dentro il tuo set.

*English version: [SY.CORE for Ableton Live](./SYCORE_FOR_ABLETON_LIVE.md)*

> *Non generi prima e suoni dopo. Generi, lanci e trasformi la musica mentre la stai suonando.*

---

## Il problema

Gli strumenti che generano MIDI sono ormai tanti, e quasi tutti funzionano allo stesso modo: **prima generi, poi suoni**.

Scrivi un prompt o premi un pulsante, ottieni una clip, la **trascini** su una traccia di Live, la metti nella Session View e solo allora la puoi lanciare. Molti generatori di MIDI, anche quelli basati sull'AI, lavorano così: a monte della performance. Le alternative "live" richiedono di solito un device Max for Live che fa tutto il lavoro dentro Live, con i suoi limiti di interfaccia e di potenza.

Il risultato è sempre lo stesso: la parte creativa sta in studio, sul palco porti clip già fatte. Se a metà set vuoi un'altra progressione, un pattern di batteria diverso o un break che non avevi preparato, devi fermarti e tornare all'editor.

**SY.CORE nasce per suonare, non per preparare.**

---

## Cos'è SY.CORE con Live

SY.CORE è un ambiente di performance che gira nel browser e **suona dentro il tuo set di Live**:

- una **Drum Machine** con pattern, bass line e fill generativi;
- un **Chord Prog** con progressioni di accordi, strum e arpeggi;
- un **Sequencer** a step per linee melodiche e bassi;
- un **Rig Controller** che li comanda dal Launchpad come se fossero clip.

Tutto arriva a Live su tracce MIDI normali, attraverso un piccolo device Max for Live, **SY.CORE Link**: niente porte MIDI virtuali e niente routing da configurare. Le note le suonano i tuoi strumenti: i tuoi Drum Rack, i tuoi synth, i tuoi arpeggiatori.

> **Non è un plugin VST o AU.** Niente da installare, scansionare o autorizzare: SY.CORE si apre nel browser, e in Live aggiungi solo un device Max for Live. Niente installer, niente gestore di licenze, sempre l'ultima versione.

---

## Generare *durante* la performance

Qui SY.CORE si stacca dagli altri.

| Con un generatore di clip | Con SY.CORE |
|---|---|
| Generi una clip, la trascini in Live, la lanci | Generi e suoni subito, senza lasciare il palco |
| Per una variazione torni all'editor | **Generate** crea al volo un nuovo pattern di batteria o una nuova progressione di accordi, dal Launchpad |
| Il fill va scritto prima | **Fill** suona un fill alla battuta successiva: lo stesso finché non ne generi uno nuovo, oppure nuovo ogni volta |
| Per un break servono altre clip | **Density** sfoltisce batteria e sequencer in tempo reale con una manopola: crescendo, break e drop senza preparare altro |
| Gli accordi sono quelli della clip | Il **Chord Prog** genera progressioni (algoritmiche o con l'AI) e le suoni un accordo alla volta dai pad |

E tutto quello che generi lo puoi **registrare in Live come normali clip MIDI**: resta nel set, lo modifichi, lo riusi. SY.CORE non ti chiude dentro il browser.

---

## Parla la lingua di Live

Non devi imparare un nuovo modo di lavorare. Il Rig Controller si comporta come la Session View:

| In Live sei abituato a… | In SY.CORE |
|---|---|
| Lanciare una clip dalla Session View | Lanci gli slot A–H di Drum, Chord e Seq dai pad del Launchpad |
| Global Launch Quantization | **Trigger sync** per traccia: subito, 1 beat, 2 beat, battuta |
| Premere una clip che suona per fermarla | Il pad dello slot che suona ferma l'app, a tempo |
| Lanciare una clip a transport fermo | Il pad mette lo slot **in attesa**: parte con il Play di Live |
| Lo Stop del transport | Lo Stop di Live ferma tutte le app di SY.CORE |
| Un Macro su un Rack | **Density**, **Intensity** (volume e velocity), Mute e Solo per traccia, anche da un controller via MIDI Learn |

Arrivi al concerto con una progressione in attesa e la batteria pronta, premi Play in Live e partono insieme sul primo battere.

---

## A tempo davvero

Un generatore che suona fuori tempo non serve sul palco. Il timing di SY.CORE Link è stato misurato su registrazioni reali in Live 12, a 120 BPM:

- **scarto medio dalla griglia: meno di 1 ms**;
- scarti tipici di **±5 ms**, cioè la risoluzione con cui Live registra le note;
- durate delle note costanti, come scritte nel pattern.

SY.CORE segue tempo e posizione di Live, quindi resta agganciato anche se cambi tempo o sposti il punto di riproduzione.

---

## Il setup, in tre passi

1. **Trascina `sycore-link.amxd`** su una traccia MIDI del set. È il ponte tra SY.CORE e Live.
2. **Metti `sycore-link-receive.amxd`** su una traccia per ogni parte e scegli il canale dalla griglia: Drums sul 10, Chords sull'1, e così via. Le tracce che suonano prendono il MIDI da queste.
3. **In SY.CORE scegli "Live (M4L)"** come uscita delle app. Fatto.

I device hanno lo stile di SY.CORE e ti dicono a colpo d'occhio cosa succede: il LED di stato diventa verde quando SY.CORE è collegato, e il LED MIDI lampeggia sulla traccia che sta ricevendo.

---

## Pensato per chi suona dal vivo

- **Suoni, non premi Play e aspetti.** Scegli la progressione, lanci gli accordi uno alla volta, apri e chiudi la batteria, chiudi la frase con un fill.
- **Usa i controller che hai.** Il Launchpad diventa il pannello del Rig, gli encoder di un controller qualsiasi pilotano Density e Intensity, e il resto del tuo setup resta mappato su Live come prima.
- **Niente installazioni.** SY.CORE si apre da un indirizzo nel browser: niente driver e niente plugin da aggiornare.

---

## Una demo in 60 secondi

1. Live è fermo. Dal Launchpad metti in attesa la progressione B e il pattern di batteria A.
2. Premi Play in Live: accordi e batteria partono insieme sul primo battere.
3. Cambi accordi a tempo di battuta, poi lanci un **Fill**.
4. Abbassi **Density** per il break, la riapri per il drop.
5. Generi una nuova progressione dal Launchpad e la suoni subito.
6. Premi Stop in Live: si ferma tutto.
7. In Arrangement trovi tutto registrato, come normali clip MIDI.

---

## Requisiti e note

- Ableton Live con Max for Live (Suite, o Standard con Max for Live).
- Un browser con Web MIDI (Chrome o Edge).
- Il **Launchpad** usato dal Rig non va impostato come Control Surface di Live, altrimenti Live lancia le sue clip insieme a SY.CORE.
- La griglia di sync conta battute in 4/4.
- La prima nota dopo il Play può arrivare con qualche decina di ms di ritardo: un **Count-In di 1 battuta** in Live lo evita.

---

**SY.CORE: la parte generativa non resta in studio, sale sul palco con te.**
