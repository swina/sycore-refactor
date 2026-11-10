<script setup>
// /ableton-live — SY.CORE with Ableton Live: SY.CORE Link and the Rig Controller.
import { onMounted } from 'vue'
import {
  Play, BookOpen, ArrowLeft, Zap, Cable, Clock, Grid3x3, SlidersHorizontal, Sparkles,
  Music, Drum, Timer, CircleDot, Square, KeyRound, Layers, Check, Ban, Globe, ShieldCheck, RefreshCw, Cpu,
} from 'lucide-vue-next'

const props = defineProps({ appUrl: { type: String, required: true } })
const emit = defineEmits(['open-guide'])

onMounted(() => {
  document.title = 'SY.CORE for Ableton Live — generate while you play'
})

const compare = [
  ['Generate a clip, drag it into Live, launch it', 'Generate and play at once, without leaving the stage'],
  ['A variation means going back to the editor', 'GEN makes a new drum pattern, chord progression or sequence on the fly, from the Launchpad'],
  ['A fill has to be written in advance', 'Fill plays a fill on the next bar: the same one until you generate another, or a new one every time'],
  ['A break needs other clips', 'Density thins drums and sequencer out with one knob: build-ups, breaks and drops with nothing else prepared'],
  ['The chords are the clip\'s chords', 'Pick an exact key (Cm, Bb…) and generate progressions in it, live'],
]

const liveTerms = [
  ['Launching a clip in Session View', 'Launch slots A–H of Drum, Chord and Seq from the Launchpad'],
  ['Global Launch Quantization', 'Trigger sync per track: now, 1 beat, 2 beats, bar'],
  ['Pressing a playing clip to stop it', 'The playing slot\'s pad stops the app, in time'],
  ['Launching a clip with the transport stopped', 'The pad arms the slot: it starts with Live\'s Play'],
  ['The transport\'s Stop', 'Live\'s Stop stops every SY.CORE app'],
  ['A Macro on a Rack', 'Density, Intensity, Mute and Solo per track, on any controller via MIDI Learn'],
]

const features = [
  { icon: Timer, title: 'Trigger sync', text: 'Each track launches, switches and stops on Live\'s grid: at once, on the next beat, half bar or bar.' },
  { icon: CircleDot, title: 'Armed slots', text: 'With Live stopped, a pad arms its slot. Press Play in Live and every armed part starts on the first downbeat, together.' },
  { icon: Square, title: 'Live\'s Stop', text: 'Stop Live and the Drum Machine, Chord Prog and Sequencer stop with it. No orphan notes.' },
  { icon: SlidersHorizontal, title: 'Density', text: 'One knob from the full pattern to the downbeat alone. The weakest steps go first, the groove stays recognizable.' },
  { icon: Layers, title: 'Fill', text: 'A Drum Machine fill on the next bar, from a pad. Keep the same fill, or get a new one every time.' },
  { icon: Sparkles, title: 'GEN', text: 'New drums, chords or sequences into the playing slot. Chords built-in or with AI; the Sequencer follows the chords\' key.' },
  { icon: KeyRound, title: 'Exact key', text: 'Cm, Bb, F#m: move the key and switch major/minor from the Launchpad, then generate in it.' },
  { icon: Grid3x3, title: 'Launchpad Rig mode', text: 'The Launchpad becomes the rig: slots, sections, fill, GEN, key and transport, with LEDs that follow the music.' },
]

const notAPlugin = [
  { icon: Globe, title: 'Opens from a URL', text: 'SY.CORE runs in Chrome or Edge. No installer, no plugin folder, no rescan of your plugins.' },
  { icon: ShieldCheck, title: 'Nothing to authorize', text: 'No license manager, no iLok, no activation per machine.' },
  { icon: RefreshCw, title: 'Always up to date', text: 'Reload the page and you have the latest version, on every computer.' },
  { icon: Cpu, title: 'Outside Live\'s audio engine', text: 'Generation runs in the browser, not inside Live\'s audio processing: Live only receives the notes.' },
]

const steps = [
  { n: '1', title: 'Drop SY.CORE Link into your set', text: 'One free Max for Live device — not a plugin — bridges SY.CORE and Live. No virtual MIDI ports, no routing.' },
  { n: '2', title: 'One receiver per part', text: 'SY.CORE Link Receive on a track, click its channel: Drums on 10, Chords on 1. Your Drum Racks and synths play the notes.' },
  { n: '3', title: 'Follow Live, and play', text: 'Pick Live as SY.CORE\'s clock and output. Press Play in Live: you\'re performing.' },
]

const demo = [
  'Live is stopped. From the Launchpad, arm progression B and drum pattern A.',
  'Press Play in Live: chords and drums start together on the first downbeat.',
  'Change chords on the bar, then launch a Fill.',
  'Pull Density down for the break, open it again for the drop.',
  'GEN a new progression in Cm and play it straight away.',
  'Stop Live: everything stops. Recording? Arrangement View holds it all, as ordinary MIDI clips.',
]
</script>

<template>
  <div class="h-screen overflow-y-auto overflow-x-hidden bg-neutral-950 text-white font-sans scroll-smooth">
    <!-- Header -->
    <header class="sticky top-0 z-50 border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur-md">
      <nav class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
        <a href="/" class="flex items-center gap-2 font-mono text-xl font-black uppercase tracking-tight">
          <ArrowLeft class="h-4 w-4 text-neutral-500" />
          <span class="text-white">SY.</span><span class="text-synth-neon">CORE</span>
        </a>
        <div class="flex items-center gap-2 sm:gap-3">
          <button
            @click="emit('open-guide')"
            class="hidden font-mono text-[11px] uppercase tracking-widest text-neutral-400 transition-colors hover:text-synth-neon sm:block"
          >Full guide</button>
          <a
            :href="props.appUrl"
            class="flex shrink-0 items-center gap-1.5 rounded-lg bg-synth-neon px-3 py-1.5 font-mono text-[11px] font-black uppercase tracking-[0.2em] text-black transition-all hover:bg-white active:scale-95 sm:px-4"
          >
            <Play class="h-3 w-3 fill-current" />
            Launch App
          </a>
        </div>
      </nav>
    </header>

    <!-- Hero -->
    <section class="relative overflow-hidden border-b border-neutral-800/60 bg-grid-neon">
      <div class="mx-auto max-w-6xl px-5 pb-20 pt-20 text-center">
        <p class="mb-4 font-mono text-[11px] uppercase tracking-[0.4em] text-synth-cyan">SY.CORE × Ableton Live</p>
        <h1 class="mx-auto max-w-3xl text-4xl font-extrabold leading-tight md:text-6xl">
          Generate while you play.<br />
          <span class="text-synth-neon">In time with Live.</span>
        </h1>
        <p class="mx-auto mt-6 max-w-2xl text-base text-neutral-400 md:text-lg">
          Chords, drum patterns and sequences, generated and launched during the performance — on Live's grid,
          played by your own instruments, recorded as ordinary MIDI clips.
        </p>
        <!-- Not a plugin -->
        <div class="mx-auto mt-8 inline-flex max-w-2xl flex-col items-center gap-3 rounded-xl border border-synth-cyan/40 bg-synth-cyan/10 px-6 py-4 sm:flex-row sm:text-left">
          <Ban class="h-8 w-8 shrink-0 text-synth-cyan" />
          <p class="text-sm text-neutral-200">
            <span class="font-mono font-black uppercase tracking-widest text-synth-cyan">Not a VST plugin.</span>
            Nothing to install, scan or authorize: SY.CORE opens in your browser.
            In Live you only drop in one free Max for Live device.
          </p>
        </div>
        <div class="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a :href="props.appUrl" class="flex items-center gap-2 rounded-lg bg-synth-neon px-6 py-3 font-mono text-xs font-black uppercase tracking-[0.2em] text-black transition-all hover:bg-white">
            <Play class="h-4 w-4 fill-current" /> Launch SY.CORE
          </a>
          <button @click="emit('open-guide')" class="flex items-center gap-2 rounded-lg border border-neutral-700 px-6 py-3 font-mono text-xs font-black uppercase tracking-[0.2em] text-neutral-200 transition-colors hover:border-synth-neon hover:text-synth-neon">
            <BookOpen class="h-4 w-4" /> Read the guide
          </button>
        </div>
      </div>
    </section>

    <!-- The problem -->
    <section class="mx-auto max-w-6xl px-5 py-20">
      <p class="font-mono text-[11px] uppercase tracking-[0.4em] text-synth-cyan">The problem</p>
      <h2 class="mt-3 max-w-3xl text-3xl font-extrabold md:text-4xl">
        Most MIDI generators work upstream: <span class="text-neutral-500">generate first, play later.</span>
      </h2>
      <p class="mt-6 max-w-3xl text-neutral-400">
        You get a clip, drag it onto a track, drop it in Session View — and only then can you launch it.
        The "live" alternatives need a Max for Live device that does all the work inside Live.
        Either way the creative part stays in the studio, and on stage you bring finished clips.
        <span class="text-white">SY.CORE is built for playing, not for preparing.</span>
      </p>

      <div class="mt-12 overflow-hidden rounded-xl border border-neutral-800">
        <div class="grid grid-cols-2 border-b border-neutral-800 bg-neutral-900/60 font-mono text-[10px] uppercase tracking-widest">
          <div class="px-4 py-3 text-neutral-500">With a clip generator</div>
          <div class="px-4 py-3 text-synth-neon">With SY.CORE</div>
        </div>
        <div v-for="row in compare" :key="row[0]" class="grid grid-cols-2 border-b border-neutral-800/60 text-sm last:border-b-0">
          <div class="px-4 py-3 text-neutral-500">{{ row[0] }}</div>
          <div class="flex gap-2 px-4 py-3 text-neutral-200"><Check class="mt-0.5 h-4 w-4 shrink-0 text-synth-neon" />{{ row[1] }}</div>
        </div>
      </div>
    </section>

    <!-- Not a plugin -->
    <section class="mx-auto max-w-6xl px-5 pb-20">
      <div class="grid gap-6 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-8 md:grid-cols-[1fr_2fr] md:p-12">
        <div>
          <p class="font-mono text-[11px] uppercase tracking-[0.4em] text-synth-cyan">No plugin, no installer</p>
          <h2 class="mt-3 text-3xl font-extrabold">Not a VST.<br /><span class="text-synth-neon">Not an AU.</span></h2>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div v-for="p in notAPlugin" :key="p.title" class="flex gap-3">
            <component :is="p.icon" class="mt-0.5 h-5 w-5 shrink-0 text-synth-neon" />
            <div>
              <h3 class="font-mono text-xs font-black uppercase tracking-[0.15em]">{{ p.title }}</h3>
              <p class="mt-1 text-sm text-neutral-400">{{ p.text }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- How it works -->
    <section class="border-y border-neutral-800/60 bg-neutral-900/30">
      <div class="mx-auto max-w-6xl px-5 py-20">
        <p class="font-mono text-[11px] uppercase tracking-[0.4em] text-synth-cyan">How it works</p>
        <h2 class="mt-3 max-w-2xl text-3xl font-extrabold md:text-4xl">Three steps. <span class="text-synth-neon">No virtual ports.</span></h2>
        <div class="mt-12 grid gap-6 md:grid-cols-3">
          <div v-for="st in steps" :key="st.n" class="rounded-xl border border-neutral-800 bg-neutral-950 p-6">
            <div class="font-mono text-3xl font-black text-synth-neon">{{ st.n }}</div>
            <h3 class="mt-3 font-mono text-sm font-black uppercase tracking-[0.15em]">{{ st.title }}</h3>
            <p class="mt-3 text-sm text-neutral-400">{{ st.text }}</p>
          </div>
        </div>
        <div class="mt-10 grid gap-4 font-mono text-[11px] uppercase tracking-widest text-neutral-400 md:grid-cols-3">
          <div class="flex items-center gap-2"><Cable class="h-4 w-4 text-synth-cyan" /> Notes sent with the Live beat they play on</div>
          <div class="flex items-center gap-2"><Clock class="h-4 w-4 text-synth-cyan" /> Follows Live's tempo, position, Play and Stop</div>
          <div class="flex items-center gap-2"><Music class="h-4 w-4 text-synth-cyan" /> Your Drum Racks and synths play the parts</div>
        </div>
      </div>
    </section>

    <!-- Timing -->
    <section class="mx-auto max-w-6xl px-5 py-20">
      <p class="font-mono text-[11px] uppercase tracking-[0.4em] text-synth-cyan">Really in time</p>
      <h2 class="mt-3 max-w-2xl text-3xl font-extrabold md:text-4xl">Measured on real recordings in Live.</h2>
      <div class="mt-10 grid gap-4 sm:grid-cols-3">
        <div class="rounded-xl border border-neutral-800 p-6">
          <div class="font-mono text-4xl font-black text-synth-neon">&lt;1 ms</div>
          <p class="mt-2 text-sm text-neutral-400">average offset from the grid</p>
        </div>
        <div class="rounded-xl border border-neutral-800 p-6">
          <div class="font-mono text-4xl font-black text-white">±5 ms</div>
          <p class="mt-2 text-sm text-neutral-400">typical deviation — Live's own recording resolution</p>
        </div>
        <div class="rounded-xl border border-neutral-800 p-6">
          <div class="font-mono text-4xl font-black text-white">MIDI clips</div>
          <p class="mt-2 text-sm text-neutral-400">what you record: edit, quantize, reuse</p>
        </div>
      </div>
      <p class="mt-4 font-mono text-[10px] uppercase tracking-widest text-neutral-600">Live 12 · 120 BPM · 34-bar take</p>
    </section>

    <!-- Rig Controller -->
    <section class="border-y border-neutral-800/60 bg-neutral-900/30">
      <div class="mx-auto max-w-6xl px-5 py-20">
        <p class="font-mono text-[11px] uppercase tracking-[0.4em] text-synth-cyan">Rig Controller</p>
        <h2 class="mt-3 max-w-3xl text-3xl font-extrabold md:text-4xl">
          It speaks Live's language. <span class="text-synth-neon">Nothing new to learn.</span>
        </h2>
        <div class="mt-12 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
          <div class="grid grid-cols-2 border-b border-neutral-800 bg-neutral-900/60 font-mono text-[10px] uppercase tracking-widest">
            <div class="px-4 py-3 text-neutral-500">In Live you're used to…</div>
            <div class="px-4 py-3 text-synth-cyan">In SY.CORE</div>
          </div>
          <div v-for="row in liveTerms" :key="row[0]" class="grid grid-cols-2 border-b border-neutral-800/60 text-sm last:border-b-0">
            <div class="px-4 py-3 text-neutral-400">{{ row[0] }}</div>
            <div class="px-4 py-3 text-neutral-100">{{ row[1] }}</div>
          </div>
        </div>

        <div class="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div v-for="f in features" :key="f.title" class="rounded-xl border border-neutral-800 bg-neutral-950 p-5">
            <component :is="f.icon" class="h-6 w-6 text-synth-neon" />
            <h3 class="mt-3 font-mono text-xs font-black uppercase tracking-[0.15em]">{{ f.title }}</h3>
            <p class="mt-2 text-sm text-neutral-400">{{ f.text }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Demo -->
    <section class="mx-auto max-w-6xl px-5 py-20">
      <p class="font-mono text-[11px] uppercase tracking-[0.4em] text-synth-cyan">A 60-second set</p>
      <h2 class="mt-3 max-w-2xl text-3xl font-extrabold md:text-4xl">From an armed pad to a recorded take.</h2>
      <ol class="mt-10 grid gap-3 md:grid-cols-2">
        <li v-for="(d, i) in demo" :key="i" class="flex gap-4 rounded-xl border border-neutral-800 p-4">
          <span class="font-mono text-lg font-black text-synth-neon">{{ String(i + 1).padStart(2, '0') }}</span>
          <span class="text-sm text-neutral-300">{{ d }}</span>
        </li>
      </ol>
    </section>

    <!-- Requirements + CTA -->
    <section class="border-t border-neutral-800/60 bg-grid-neon">
      <div class="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-2">
        <div>
          <p class="font-mono text-[11px] uppercase tracking-[0.4em] text-synth-cyan">Requirements</p>
          <ul class="mt-6 space-y-3 text-sm text-neutral-300">
            <li class="flex gap-2"><Check class="mt-0.5 h-4 w-4 shrink-0 text-synth-neon" /> Ableton Live with Max for Live (Suite, or Standard + Max for Live)</li>
            <li class="flex gap-2"><Check class="mt-0.5 h-4 w-4 shrink-0 text-synth-neon" /> Chrome or Edge (Web MIDI)</li>
            <li class="flex gap-2"><Check class="mt-0.5 h-4 w-4 shrink-0 text-synth-neon" /> Optional: a Launchpad Mini for Rig mode, any controller for Density and Intensity</li>
            <li class="flex gap-2 text-neutral-500"><Zap class="mt-0.5 h-4 w-4 shrink-0" /> Perform in Session View, record in Arrangement View (its clips play along on Play)</li>
            <li class="flex gap-2 text-neutral-500"><Zap class="mt-0.5 h-4 w-4 shrink-0" /> Sync grid in 4/4 · use a 1-bar Count-In when recording</li>
          </ul>
        </div>
        <div class="flex flex-col justify-center gap-4 rounded-xl border border-neutral-800 bg-neutral-950/80 p-8">
          <div class="flex items-center gap-3">
            <Drum class="h-6 w-6 text-synth-neon" />
            <h2 class="text-2xl font-extrabold">The generative part goes on stage with you.</h2>
          </div>
          <div class="flex flex-col gap-3 sm:flex-row">
            <a :href="props.appUrl" class="flex items-center justify-center gap-2 rounded-lg bg-synth-neon px-6 py-3 font-mono text-xs font-black uppercase tracking-[0.2em] text-black transition-all hover:bg-white">
              <Play class="h-4 w-4 fill-current" /> Launch SY.CORE
            </a>
            <button @click="emit('open-guide')" class="flex items-center justify-center gap-2 rounded-lg border border-neutral-700 px-6 py-3 font-mono text-xs font-black uppercase tracking-[0.2em] text-neutral-200 transition-colors hover:border-synth-neon hover:text-synth-neon">
              <BookOpen class="h-4 w-4" /> Full guide
            </button>
          </div>
        </div>
      </div>
    </section>

    <footer class="border-t border-neutral-800/60 px-5 py-8 text-center font-mono text-[10px] uppercase tracking-widest text-neutral-600">
      <a href="/" class="hover:text-synth-neon">SY.CORE</a> · Ableton and Live are trademarks of Ableton AG. SY.CORE is not affiliated with Ableton.
    </footer>
  </div>
</template>
