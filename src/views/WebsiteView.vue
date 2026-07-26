<script setup>
import { ref } from 'vue'
import {
  Zap, Cpu, Cable, Music, Layers, Mic, Clock, ListMusic, Radio, Globe,
  Database, Wifi, ArrowRight, Check, Sparkles, Network, Disc3, Play,
  SlidersHorizontal, Repeat, Gauge, Workflow, Infinity as InfinityIcon,
  Search, Download, MonitorSmartphone, GitBranch, Menu, X,
  Gift, CodeXml, Heart, ListPlus, Grid3x3, AudioWaveform, Drum, GithubIcon
} from 'lucide-vue-next'

const isMobileNavOpen = ref(false)

// URL of the PWA app deployment — set VITE_APP_URL at build time.
const appUrl = import.meta.env.VITE_APP_URL || '/'
const patreonUrl = 'https://www.patreon.com/cw/moodgiver/membership'
const githubUrl = 'https://github.com/swina/sycore-refactor'

// Every screenshot below lives in public/help/guides and is referenced by a
// root-relative path — that only resolves correctly when the site is served
// from the domain root. Vite doesn't rewrite hardcoded "/foo.png" strings in
// template bindings with the configured `base`, so under GitHub Pages
// (base: /sycore-refactor/) they'd 404 unless explicitly prefixed here.
const withBase = (path) => import.meta.env.BASE_URL + path.replace(/^\//, '')

// Scroll-reveal directive: fades/slides elements in when they enter the viewport.
// Binding value = transition delay in ms (for staggered grids).
const vReveal = {
  mounted(el, binding) {
    el.classList.add('reveal')
    if (binding.value) el.style.transitionDelay = `${binding.value}ms`
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('reveal-visible')
          io.disconnect()
        }
      },
      { threshold: 0.12 }
    )
    io.observe(el)
  },
}

function launchApp() {
  window.location.href = appUrl
}

const navLinks = [
  { label: 'Sound Engine', href: '#sound-engine' },
  { label: 'MIDI', href: '#midi' },
  { label: 'Live', href: '#live' },
  { label: 'Audio', href: '#audio' },
  { label: 'Freesound', href: '#freesound' },
  { label: 'Technology', href: '#technology' },
  { label: 'Free & Open', href: '#free' },
]

const heroBadges = ['100% Free & Open Source', 'Zero Installation', 'No Drivers', 'Works Fully Offline', 'Stage-Ready']

const freesoundActions = [
  {
    icon: ListPlus,
    title: 'Add → Playlist',
    text: 'One click appends the sound to the Backing Track Playlist. Playback starts at the next natural cue — or immediately if nothing is playing.',
  },
  {
    icon: Grid3x3,
    title: 'Pad → Live Set',
    text: 'Assign the sound to any of the 16 Loop Pads, with optional BPM override. Right-click a slot for instant MIDI Learn — your controller LED tracks play state.',
  },
  {
    icon: AudioWaveform,
    title: 'Capture → Editor',
    text: 'Send the full audio into Audio Capture with automatic loop-point discovery. Confirming the BPM updates the global clock everywhere — arpeggiator, footer, MIDI clock out.',
  },
]

const freeCards = [
  {
    icon: Gift,
    title: 'Completely Free',
    text: 'No license fees. No subscriptions. No feature paywalls. Every tool — Sound Engine, MIDI hub, looper, sequencers — is yours from the first launch.',
  },
  {
    icon: CodeXml,
    title: 'Open Source',
    text: 'The code is open. Inspect it, learn from it, extend it, contribute to it. No black boxes between you and your rig.',
  },
  {
    icon: Heart,
    title: 'Donationware',
    text: 'If SY.CORE powers your sets, you can support its development with a donation. That’s it — the software stays free for everyone, forever.',
  },
]

const soundEngineFeatures = [
  {
    icon: Sparkles,
    title: 'Generative Sound Creation',
    text: 'Instantly synthesize Pads, Leads, Basses, Experimental and more — up to 18 sound types with unique flavour variations. Every result is distinct, balanced, and performance-ready.',
  },
  {
    icon: GitBranch,
    title: 'Auto A/B Variations',
    text: 'Every generated sound ships with an automatic variation for instant comparison. Keep the one that moves you.',
  },
  {
    icon: Cable,
    title: 'Bi-Directional Hardware Sync',
    text: 'Every knob turn on the Roland S-1 is reflected in the UI. Every UI tweak hits the synth with zero perceptible latency. One hybrid instrument, fully in sync.',
  },
  {
    icon: Repeat,
    title: 'Extra 2 LFOs',
    text: 'Two fully configurable software LFOs assignable to any hardware parameter — modulation your synth was never born with.',
  },
  {
    icon: Gauge,
    title: 'Velocity Mapping',
    text: 'Map velocity to any hardware parameter for expressive, dynamic playing.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Contextual MIDI Learn',
    text: 'Right-click any parameter to enter MIDI Learn. Map physical controllers to anything, instantly — with Pass Thru / Consume logic.',
  },
]

const midiCapabilities = [
  { title: 'Auto-Discovery', text: 'Devices appear automatically on connection. True plug and play — no drivers, ever.' },
  { title: 'MIDI Flow', text: 'Flow canvas: drag-and-drop device↔app / app↔app routing, note-range splits, multi-channel fanout, saved configs' },
  { title: 'MIDI Controller Design', text: 'Visual canvas for designing custom MIDI controller layouts with draggable controls, real-time feedback, and preset management.' },
  // { title: 'MIDI Mapping', text: 'Assign any CC to any function with Pass Thru / Consume logic.' },
  // { title: 'MIDI Actions', text: 'Trigger platform events from incoming MIDI — start the sequencer, toggle the looper, change presets from your pedalboard.' },
  // { title: 'MIDI Sync', text: 'Cross-subsystem transport synchronization locked to a master clock.' },
  { title: 'MIDI Monitor', text: 'Live MIDI traffic inspector for fast on-stage debugging.' },
  // { title: 'Config Export / Import', text: 'Save and restore your entire MIDI setup — your rig travels with you.' },
]

const liveTools = [
  {
    icon: Clock,
    title: 'Live Timeline',
    tag: 'Arrangement',
    img: withBase('/help/guides/sycore-timeline.png'),
    text: 'A visual arrangement timeline for live performance. Sequence backing-track segments, fire MIDI and UI events at exact time positions with markers, and drive MIDI transport sync independently of the player.',
  },
  {
    icon: Drum,
    title: 'Drum Machine',
    tag: 'Rhythm',
    img: withBase('/help/guides/sycore-drum-machine.png'),
    text: 'An 8-track step sequencer with style-based generation (House, Techno, Jazz, EDM, Pop and more), per-step velocity and accent, fill mode, autofill scheduling, 8-slot pattern chain with BPM-synced sequential playback, and full preset save/load with per-preset tempo.',
  },
  {
    icon: ListMusic,
    title: 'Live Set',
    tag: 'Show Mode',
    img: withBase('/help/guides/sycore-live-set.png'),
    text: 'The dedicated show-mode control center: 16 Soundset pads for one-touch multi-device preset recall, 16 backing-track pads, 16 loop pads, and a per-device MIDI CC volume mixer. Every pad and fader is mappable to your hardware controller. Save layouts as Snapshots.',
  },
  {
    icon: Layers,
    title: 'Chord Progression Sequencer',
    tag: 'Harmony',
    img: withBase('/help/guides/sycore-chord-progression.png'),
    text: 'Up to 16 steps, each carrying a full chord — or an arpeggio. Per-step duration, velocity, gate and transpose, plus a built-in progression library organised by key and genre, and algorithmic generation.',
  },
  {
    icon: Music,
    title: 'Step Sequencer',
    tag: 'Algorithmic',
    img: withBase('/help/guides/sycore-step-sequencer.png'),
    text: 'Style-based generation — House, Techno, Acid, Minimal, Drum&Bass, Funk, Ambient and more — locked to key and scale. Up to 64 steps, native polyphony, per-step parameter locks (2 CCs), gate and tie control.',
  },
  {
    icon: Cpu,
    title: 'Sampler',
    tag: 'Beta',
    img: withBase('/help/guides/sycore-sampler.png'),
    text: '8-pad, multi-bank sample player with MIDI velocity, chromatic pitch-shifting, polyphonic voice management, per-pad ADSR envelopes, lo-fi downsampling, dual granular synthesis (pads 7 & 8), and full MIDI input filtering and mapping.',
  },
  {
    icon: Repeat,
    title: 'Samples Machine',
    tag: 'Loops',
    img: withBase('/help/guides/sycore-loop-machine.png'),
    text: '24 pads of simultaneous, gapless loops — fed from local files or Freesound. Sync-quantized starts locked to a master loop, automatic global BPM retune, an always-on 24-channel mixer, one-touch Performance Sets, and auto-recording of your jam via Audio Capture. Every pad, fader and toggle is MIDI-learnable.',
  },
  {
    icon: InfinityIcon,
    title: 'Audio Looper',
    tag: 'Beta',
    img: withBase('/help/guides/sycore-looper.png'),
    text: 'A sample-accurate 8-track looper with BPM-aligned recording, MIDI-triggered hands-free capture, autosync, autolimiting, a touch-optimized mixer, and one-tap rendering into your playlist.',
  }
]

const audioCaptureFeatures = [
  {
    title: 'Record Anything',
    text: 'Capture from any audio interface with a live oscilloscope and level meter. Arm via MIDI Sync and recording fires on your first note — hands-free.',
  },
  {
    title: 'Append Mode',
    text: 'Stack takes instead of replacing them: each new recording is decoded and merged onto the last, building a single WAV — a rough composite without a DAW.',
  },
  {
    title: 'Waveform Editor',
    text: 'Loop start/end and play-start markers, a BPM-derived bar grid with snap-to-grid, and independent horizontal/vertical zoom with pan for sample-accurate loop points.',
  },
  {
    title: 'Crossfade Looping',
    text: 'Gapless hard-cut loops, or blended loops with up to 5 seconds of crossfade — a dual-element audio engine swaps seamlessly at the loop boundary.',
  },
  {
    title: 'Normalize: Ceiling + Gate',
    text: 'One-click normalization with a configurable peak ceiling (down to −0.1 dBFS) and a noise-gate threshold that zeroes the floor before peak detection.',
  },
  {
    title: 'Export & Inject',
    text: 'Export as 192 kbps MP3 or 16-bit WAV with a loop-point sidecar file, send the cropped region to the playlist with repeat counts, or assign it straight to a Live Set loop pad.',
  },
]

const audioTools = [
  {
    icon: Disc3,
    title: 'Backing Track Player',
    text: 'A dual-slot playback engine for gapless playback and crossfades. Full playlist system with per-track repeats, global loop, tempo sync, clock sync, and MIDI START/STOP transport integration.',
    points: ['mp3 / ogg / wav library', 'Crossfade & gapless pre-loading', 'MIDI transport sync'],
  },
  {
    icon: Search,
    title: 'Freesound Browser',
    text: 'Over 600,000 freely licensed sounds from freesound.org — search, preview, and inject directly into your playlist, a Live Set loop pad, or the Audio Capture editor without leaving the app.',
    points: ['Search & preview in-app', 'Find-similar & sound analysis', 'One-click inject to pads'],
  },
  {
    icon: Cable,
    title: 'MIDI Capture — Piano Roll',
    text: 'Record live MIDI into an interactive piano roll. Edit pitch, velocity and duration, crop, quantize, play back through any output, export as .mid, or send straight into the Step Sequencer.',
    points: ['Real-time note capture', 'Quantize & edit', '.mid export'],
  },
]

const techStack = [
  {
    icon: Cable,
    name: 'Web MIDI API',
    role: 'Hardware device communication',
    advantage: 'Direct routing with near-zero latency. Talks straight to Windows MIDI Services and CoreMIDI — no ASIO, no proprietary drivers, no conflicts.',
  },
  {
    icon: Workflow,
    name: 'Web Audio API',
    role: 'Synthesis & audio processing',
    advantage: 'A modular, high-performance node graph powered by the browser audio engine — sample-accurate where it counts.',
  },
  {
    icon: Wifi,
    name: 'Service Workers (PWA)',
    role: 'Asset & resource management',
    advantage: 'Full offline functionality and near-instant loading. Once saved to your device, SY.CORE launches with zero internet.',
  },
  {
    icon: Database,
    name: 'IndexedDB',
    role: 'Local data persistence',
    advantage: 'Mappings, patterns, presets and sessions live on your device, not a server — saved automatically, recalled on launch.',
  },
]

const audiences = [
  {
    icon: Radio,
    title: 'Live Electronic Artists',
    text: 'A rock-solid, integrated alternative to fragile DAW setups on stage. One window, every tool, fully offline.',
  },
  {
    icon: Sparkles,
    title: 'Sound Designers',
    text: 'An algorithmic, generative approach to hardware sound creation — with visual feedback for every parameter.',
  },
  {
    icon: Cpu,
    title: 'Dawless & Hardware Enthusiasts',
    text: 'Unlock the full potential of your MIDI synthesizers through software that speaks hardware natively. No computer-music workflow required — the browser is just the brain of your rig.',
  },
]
</script>

<template>
  <div class="h-screen overflow-y-auto overflow-x-hidden bg-neutral-950 text-white font-sans scroll-smooth">

    <!-- ============ NAV ============ -->
    <header class="sticky top-0 z-50 border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur-md">
      <nav class="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <a href="#top" class="font-mono text-xl font-black uppercase tracking-tight">
          <span class="text-white">SY.</span><span class="text-synth-neon">CORE</span>
        </a>
        <div class="hidden items-center gap-6 md:flex">
          <a
            v-for="link in navLinks" :key="link.href" :href="link.href"
            class="font-mono text-[11px] uppercase tracking-widest text-neutral-400 transition-colors hover:text-synth-neon"
          >
            {{ link.label }}
          </a>
        </div>
        <div class="flex items-center gap-2 sm:gap-3">
          <button
            @click="launchApp"
            class="flex shrink-0 items-center gap-1.5 rounded-lg bg-synth-neon px-3 py-1.5 font-mono text-[11px] font-black uppercase tracking-[0.2em] text-black transition-all hover:bg-white active:scale-95 sm:px-4"
          >
            <Play class="h-3 w-3 fill-current" />
            Launch App
          </button>
          <button
            class="-mr-2 p-2 text-neutral-400 md:hidden"
            aria-label="Toggle navigation menu"
            @click="isMobileNavOpen = !isMobileNavOpen"
          >
            <Menu v-if="!isMobileNavOpen" class="h-5 w-5" />
            <X v-else class="h-5 w-5" />
          </button>
        </div>
      </nav>
      <div v-if="isMobileNavOpen" class="border-t border-neutral-800 bg-neutral-950 px-5 py-3 md:hidden">
        <a
          v-for="link in navLinks" :key="link.href" :href="link.href"
          @click="isMobileNavOpen = false"
          class="block py-2.5 font-mono text-xs uppercase tracking-widest text-neutral-400 hover:text-synth-neon"
        >
          {{ link.label }}
        </a>
      </div>
    </header>

    <!-- ============ HERO ============ -->
    <section id="top" class="relative overflow-hidden ">
      <div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-neutral-950/40 to-neutral-950"></div>
      <div class="relative mx-auto max-w-6xl px-5 pb-16 pt-20 text-center  bg-your-rig">
        <p class="hero-fade hero-fade-1 mb-4 font-mono text-[11px] uppercase tracking-[0.4em] text-synth-cyan">
          Performance Tools &amp; Sound Design Ecosystem
        </p>
        <h1 class="hero-fade hero-fade-2 mx-auto max-w-3xl text-4xl font-extrabold leading-tight md:text-6xl">
          Your hardware rig,<br>
          <span class="glow-flicker text-synth-neon text-glow-neon">orchestrated.</span>
        </h1>
        <p class="hero-fade hero-fade-3 mx-auto mt-6 max-w-2xl text-base text-neutral-400 md:text-lg">
          SY.CORE is a local-first, web-native platform for music producers, synth lovers and dawless
          performers. Generative sound design for <span class="font-bold text-synth-neon">ROLAND S-1</span>, granular MIDI control, audio tools and live performance
          surfaces — in one always-reliable environment. Launch from a URL, go fully offline, and perform.
          <span class="font-bold text-neutral-200">Completely free, open source, donationware.</span>
        </p>
        <div class="hero-fade hero-fade-4 mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            @click="launchApp"
            class="cta-pulse flex items-center gap-2 rounded-lg bg-synth-neon px-6 py-3 font-mono text-xs font-black uppercase tracking-[0.2em] text-black transition-all hover:bg-white active:scale-95"
          >
            <Zap class="h-4 w-4" />
            Start Performing
          </button>
          <a
            href="#sound-engine"
            class="flex items-center gap-2 rounded-lg border border-neutral-700 px-6 py-3 font-mono text-xs font-bold uppercase tracking-[0.2em] text-neutral-300 transition-colors hover:border-synth-cyan/50 hover:text-synth-cyan hover:bg-synth-cyan/30 active:scale-95"
          >
            Explore Features
            <ArrowRight class="h-4 w-4" />
          </a>
        </div>
        <div class="hero-fade hero-fade-5 mt-8 flex flex-wrap items-center justify-center gap-2">
          <span
            v-for="badge in heroBadges" :key="badge"
            class="flex items-center gap-1.5 rounded-md border border-synth-cyan/30 bg-synth-cyan/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-synth-neon"
          >
            <Check class="h-3 w-3" />
            {{ badge }}
          </span>
        </div>
        <div class="hero-fade hero-fade-6 mt-14">
          <img
            :src="withBase('/help/guides/sycore-refactor-mainpage.png')"
            alt="SY.CORE workspace"
            class="img-float mx-auto w-full max-w-4xl rounded-xl border border-neutral-800 shadow-[0_0_60px_rgba(0,163,112,0.15)]"
            loading="eager"
          />
        </div>
      </div>
    </section>

    <!-- ============ PROBLEM ============ -->
    <section class="border-y border-neutral-800/60 bg-neutral-900/30">
      <div class="mx-auto max-w-6xl px-5 py-16 md:flex md:items-center md:gap-12">
        <div v-reveal class="md:w-1/2">
          <p class="font-mono text-[11px] uppercase tracking-[0.4em] text-synth-cyan">The Problem</p>
          <h2 class="mt-3 text-3xl font-extrabold md:text-4xl">Every electronic musician knows it.</h2>
        </div>
        <div v-reveal="150" class="mt-6 md:mt-0 md:w-1/2">
          <p class="text-neutral-400">
            You've invested in premium hardware synths. You've spent hours designing sounds. But on stage —
            or in the studio — managing MIDI routing, syncing gear, triggering backing tracks, and keeping
            everything locked still means juggling fragile DAW setups, driver conflicts, and too many open windows.
          </p>
          <p class="mt-4 font-mono text-sm font-bold uppercase tracking-widest text-synth-neon">
            SY.CORE was built to fix this.
          </p>
        </div>
      </div>
    </section>

    <!-- ============ TWO WORKFLOWS ============ -->
    <section class="mx-auto max-w-6xl px-5 py-20">
      <div v-reveal class="text-center">
        <p class="font-mono text-[11px] uppercase tracking-[0.4em] text-synth-cyan">Two Workflows. One Platform.</p>
        <h2 class="mt-3 text-3xl font-extrabold md:text-4xl">Built around the two moments that matter.</h2>
      </div>
      <div class="mt-12 grid gap-6 md:grid-cols-2">
        <div v-reveal="100" class="card-lift rounded-xl border border-neutral-800 bg-neutral-900/40 p-8 transition-colors hover:border-synth-neon/40">
          <Zap class="h-8 w-8 text-synth-neon" />
          <h3 class="mt-4 font-mono text-lg font-black uppercase tracking-[0.2em]">Sound Design</h3>
          <p class="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">Studio · Rehearsal · Exploration</p>
          <p class="mt-4 text-sm text-neutral-400">
            Generate and sculpt unique sounds beyond hardware limits — adaptive synthesis, visual
            feedback for every parameter, and a library that travels with you.
          </p>
        </div>
        <div v-reveal="250" class="card-lift rounded-xl border border-neutral-800 bg-neutral-900/40 p-8 transition-colors hover:border-synth-cyan/40">
          <Radio class="h-8 w-8 text-synth-cyan" />
          <h3 class="mt-4 font-mono text-lg font-black uppercase tracking-[0.2em]">Performance</h3>
          <p class="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">On Stage · Live Sets · Sessions</p>
          <p class="mt-4 text-sm text-neutral-400">
            Control, trigger, and synchronize everything in real time — MIDI hub, audio tools,
            live pads, timeline, and mixer, locked to a rock-solid master clock.
          </p>
        </div>
      </div>
    </section>

    <!-- ============ SOUND ENGINE ============ -->
    <section id="sound-engine" class="border-y border-neutral-800/60 bg-neutral-900/30 scroll-mt-16">
      <div class="mx-auto max-w-6xl px-5 py-20">
        <p v-reveal class="font-mono text-[11px] uppercase tracking-[0.4em] text-synth-cyan">Adaptive Sound Engine</p>
        <h2 class="mt-3 max-w-2xl text-3xl font-extrabold md:text-4xl">
          Not a preset browser. A <span class="text-synth-neon">generative intelligence layer.</span>
        </h2>
        <p class="mt-4 max-w-2xl text-neutral-400">
          SY.CORE's proprietary synthesis orchestration algorithm — purpose-built for the
          <strong class="text-neutral-200">Roland S-1</strong> (more hardware targets on the roadmap) —
          computes mathematically balanced, stage-ready sounds on demand. Every parameter change sends an
          immediate MIDI CC to the hardware. The panel <em>is</em> the sound.
        </p>

        <img
          v-reveal
          :src="withBase('/help/guides/sycore-sound-engine-01.png')"
          alt="SY.CORE Sound Engine"
          class="img-zoom mt-10 w-full rounded-xl border border-neutral-800"
          loading="lazy"
        />

        <div class="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="(feature, i) in soundEngineFeatures" :key="feature.title"
            v-reveal="(i % 3) * 100"
            class="card-lift rounded-xl border border-neutral-800 bg-neutral-950/60 p-6 transition-colors hover:border-synth-neon/40"
          >
            <component :is="feature.icon" class="h-6 w-6 text-synth-neon" />
            <h3 class="mt-3 font-mono text-sm font-black uppercase tracking-widest">{{ feature.title }}</h3>
            <p class="mt-2 text-sm text-neutral-400">{{ feature.text }}</p>
          </div>
        </div>

        <div class="mt-10 grid gap-6 md:grid-cols-2">
          <img
            v-reveal
            :src="withBase('/help/guides/sycore-sound-engine-visualizer.png')"
            alt="Sound parameter visualizers"
            class="img-zoom w-full rounded-xl border border-neutral-800"
            loading="lazy"
          />
          <div v-reveal="150" class="flex flex-col justify-center">
            <h3 class="font-mono text-sm font-black uppercase tracking-widest text-synth-neon">Sound Parameters Visualizer</h3>
            <p class="mt-3 text-sm text-neutral-400">
              Understand your sound at a glance. Graphical visualizers for Flow, LFO, Oscillator, Filter,
              EFX and more turn raw CC values into something you can read like a waveform — plus a dedicated
              arpeggiator engine integrated directly into the sound design flow, and full export/import of
              your custom sound banks.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ MIDI ============ -->
    <section id="midi" class="mx-auto max-w-6xl px-5 py-20 scroll-mt-16">
      <p v-reveal class="font-mono text-[11px] uppercase tracking-[0.4em] text-synth-cyan">MIDI Command Center</p>
      <h2 class="mt-3 max-w-2xl text-3xl font-extrabold md:text-4xl">
        Granular. Stable. <span class="text-synth-cyan">Intuitive.</span>
      </h2>
      <p class="mt-4 max-w-2xl text-neutral-400">
        From a single synth to a complex multi-device rig — the <span class="text-synth-cyan font-mono">MIDI FLOW</span> with a true visual patch-cable UX consolidates routing,
        mapping, filtering, the <span class="text-synth-cyan font-mono">MIDI Controller Designer</span> delivers actions and sync thru MIDI and the <span class="text-synth-cyan font-mono">MIDI Monitor</span> to monitoring anything about your MIDI setup.
      </p>

      <div class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div
          v-for="(cap, i) in midiCapabilities" :key="cap.title"
          v-reveal="(i % 4) * 80"
          class="card-lift rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 transition-colors hover:border-synth-cyan/40"
        >
          <h3 class="font-mono text-xs font-black uppercase tracking-widest text-synth-cyan">{{ cap.title }}</h3>
          <p class="mt-2 text-[13px] text-neutral-400">{{ cap.text }}</p>
        </div>
      </div>

      <div class="relative">
        <img
          v-reveal
          :src="withBase('/help/guides/sycore-midi-flow.png')"
          alt="MIDI flow canvas"
          class="img-zoom my-10 w-full rounded-xl border border-neutral-800"
          loading="lazy"
        />
        <div class="hidden md:flex absolute inset-0 top-1/2 -m-10 left-2/3 h-24 mx-3 rounded-lg items-center justify-center bg-synth-neon/20 font-mono uppercase z-10">
          <span>true visual patch-cable UX</span>
        </div>
      </div>
      <div class="mt-10 grid gap-6 md:grid-cols-2">
        <div class="flex flex-col">
          <span class="py-2 font-mono text-sm font-black uppercase tracking-widest text-synth-neon">AUTO-DISCOVERY</span>
          <img
            v-reveal="150"
            :src="withBase('/help/guides/sycore-midi-devices.png')"
            alt="MIDI Manager"
            class="img-zoom w-full rounded-xl border border-neutral-800"
            loading="lazy"
          />
        </div>
        <div class="flex flex-col">
          <!-- <span class="py-2 font-mono text-sm font-black uppercase tracking-widest text-synth-neon">CONTROLLER DESIGNER</span>
          <img
            v-reveal="150"
            :src="withBase('/help/guides/sycore-midi-controller-designer.png')"
            alt="MIDI Controller Designer"
            class="img-zoom w-full rounded-xl border border-neutral-800"
            loading="lazy"
          /> -->
          <span class="py-2 font-mono text-sm font-black uppercase tracking-widest text-synth-neon">MIDI MONITOR</span>
          <img
          v-reveal="150"
          :src="withBase('/help/guides/sycore-midi-monitor.png')"
          alt="MIDI Monitor"
          class="img-zoom w-full rounded-xl border border-neutral-800"
          loading="lazy"
        />
        </div>
      </div>

      <div class="mt-12 grid gap-6 md:grid-cols-2">
        <div v-reveal class="card-lift rounded-xl border border-neutral-800 bg-neutral-900/40 p-6">
          <Network class="h-6 w-6 text-synth-neon" />
          <h3 class="mt-3 font-mono text-sm font-black uppercase tracking-widest">Multi Sound — Program Change Browser</h3>
          <p class="mt-2 text-sm text-neutral-400">
            Manage presets across hardware via Program Change with auto-populated libraries — including
            <strong class="text-neutral-200">Arturia MicroFreak</strong> (.mfprojz import, category filters) and
            <strong class="text-neutral-200">Yamaha SEQTRAK</strong> (multitimbral with channel selector).
            Bundle device presets into <strong class="text-neutral-200">Performance Sets</strong> and load your
            entire multi-device configuration in a single click.
          </p>
          <img
          v-reveal="150"
          :src="withBase('/help/guides/sycore-multi-sound-program-change.png')"
          alt="MIDI Monitor"
          class="mt-2 img-zoom w-full rounded-xl border border-neutral-800"
          loading="lazy"
        />
        </div>
        <div v-reveal="150" class="card-lift rounded-xl border border-neutral-800 bg-neutral-900/40 p-6">
          <Cpu class="h-6 w-6 text-synth-neon" />
          <h3 class="mt-3 font-mono text-sm font-black uppercase tracking-widest">Use the app as a controller — backwards</h3>
          <p class="mt-2 text-sm text-neutral-400">
            MIDI Actions turn any incoming CC or Note into a high-level SY.CORE action: start the sequencer,
            toggle the looper, change a preset. Supports continuous (0–127) and trigger (push) control —
            your pedalboard becomes the front panel of the whole platform.
          </p>
           <img
            v-reveal="150"
            :src="withBase('/help/guides/sycore-midi-controller-designer.png')"
            alt="MIDI Controller Designer"
            class="mt-2 img-zoom w-full rounded-xl border border-neutral-800"
            loading="lazy"
          />
        </div>
      </div>
    </section>

    <!-- ============ LIVE PERFORMANCE ============ -->
    <section id="live" class="border-y border-neutral-800/60 bg-neutral-900/30 scroll-mt-16">
      <div class="mx-auto max-w-6xl px-5 py-20">
        <p class="font-mono text-[11px] uppercase tracking-[0.4em] text-synth-cyan">Live Performance</p>
        <h2 class="mt-3 max-w-2xl text-3xl font-extrabold md:text-4xl">
          Professional orchestration <span class="text-synth-neon">at your fingertips.</span>
        </h2>

        <div class="mt-12 flex flex-col gap-12">
          <div
            v-for="(tool, i) in liveTools" :key="tool.title"
            v-reveal
            class="grid items-center gap-8 md:grid-cols-2"
          >
            <div :class="i % 2 === 1 ? 'md:order-2' : ''">
              <div class="flex items-center gap-3">
                <component :is="tool.icon" class="h-7 w-7 text-synth-neon" />
                <h3 class="font-mono text-lg font-black uppercase tracking-[0.2em]">{{ tool.title }}</h3>
                <span class="rounded-md border border-synth-cyan/30 bg-synth-cyan/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-synth-cyan">
                  {{ tool.tag }}
                </span>
              </div>
              <p class="mt-4 text-sm text-neutral-400">{{ tool.text }}</p>
            </div>
            <img
              :src="tool.img"
              :alt="tool.title"
              :class="['img-zoom w-full rounded-xl border border-neutral-800', i % 2 === 1 ? 'md:order-1' : '']"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- ============ AUDIO TOOLS ============ -->
    <section id="audio" class="mx-auto max-w-6xl px-5 py-20 scroll-mt-16">
      <p v-reveal class="font-mono text-[11px] uppercase tracking-[0.4em] text-synth-cyan">Audio Toolkit</p>
      <h2 class="mt-3 max-w-2xl text-3xl font-extrabold md:text-4xl">
        Record. Capture. <span class="text-synth-cyan">Inject.</span>
      </h2>
      <p class="mt-4 max-w-2xl text-neutral-400">
        Everything audio flows into everything else: capture a take, crop it, push it to a loop pad
        or the playlist — without ever leaving the app.
      </p>

      <!-- Featured: Audio Capture -->
      <div class="mt-10 rounded-xl border border-neutral-800 bg-neutral-900/40 p-6 md:p-8">
        <div v-reveal class="flex flex-wrap items-center gap-3">
          <Mic class="h-7 w-7 text-synth-neon" />
          <h3 class="font-mono text-lg font-black uppercase tracking-[0.2em]">Audio Capture</h3>
          <span class="rounded-md border border-synth-neon/30 bg-synth-neon/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-synth-neon">
            Recorder / Editor
          </span>
        </div>
        <p v-reveal class="mt-3 max-w-3xl text-sm text-neutral-400">
          The heart of the audio toolkit: a full in-app recorder <em>and</em> waveform editor.
          Record from any input, sculpt the take with loop markers and normalization, then push the
          result anywhere — playlist, loop pad, or disk.
        </p>
        <img
          v-reveal
          :src="withBase('/help/guides/sycore-audio-capture.png')"
          alt="Audio Capture recorder and waveform editor"
          class="img-zoom mt-8 m-auto rounded-xl border border-neutral-800"
          loading="lazy"
        />
        <div class="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="(feature, i) in audioCaptureFeatures" :key="feature.title"
            v-reveal="(i % 3) * 100"
            class="rounded-lg border border-neutral-800/80 bg-neutral-950/60 p-5"
          >
            <h4 class="flex items-center gap-2 font-mono text-xs font-black uppercase tracking-widest text-synth-neon">
              <Check class="h-3.5 w-3.5 flex-none" />
              {{ feature.title }}
            </h4>
            <p class="mt-2 text-[13px] text-neutral-400">{{ feature.text }}</p>
          </div>
        </div>
      </div>

      <div class="mt-10 grid gap-6 md:grid-cols-3">
        <div
          v-for="(tool, i) in audioTools" :key="tool.title"
          v-reveal="(i % 3) * 120"
          class="card-lift rounded-xl border border-neutral-800 bg-neutral-900/40 p-6 transition-colors hover:border-synth-neon/40"
        >
          <component :is="tool.icon" class="h-6 w-6 text-synth-neon" />
          <h3 class="mt-3 font-mono text-sm font-black uppercase tracking-widest">{{ tool.title }}</h3>
          <p class="mt-2 text-sm text-neutral-400">{{ tool.text }}</p>
          <ul class="mt-4 flex flex-col gap-1.5">
            <li
              v-for="point in tool.points" :key="point"
              class="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-neutral-500"
            >
              <Check class="h-3 w-3 flex-none text-synth-neon" />
              {{ point }}
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- ============ FREESOUND ============ -->
    <section id="freesound" class="relative overflow-hidden border-y border-neutral-800/60 bg-neutral-900/30 scroll-mt-16">
      <div class="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-synth-cyan/5 blur-3xl"></div>
      <div class="relative mx-auto max-w-6xl px-5 py-20">
        <p v-reveal class="font-mono text-[11px] uppercase tracking-[0.4em] text-synth-cyan">Freesound Integration</p>
        <h2 class="mt-3 max-w-3xl text-3xl font-extrabold md:text-4xl">
          <span class="counter-glow text-synth-neon">600,000+</span> sounds,
          <span class="text-synth-cyan">zero detours.</span>
        </h2>
        <p class="mt-4 max-w-2xl text-neutral-400">
          The <strong class="text-neutral-200">Freesound Browser</strong> connects SY.CORE to the entire
          <a href="https://freesound.org" target="_blank" rel="noopener" class="text-synth-cyan underline decoration-synth-cyan/40 underline-offset-2 hover:text-white">freesound.org</a>
          library of freely licensed sounds. Search, filter, and stream previews in a floating, draggable panel —
          then inject any sound into your rig with one click. Your free personal API key, saved once in your profile, unlocks everything.
        </p>

        <img
          v-reveal
          :src="withBase('/help/guides/sycore-freesound.org-browser.png')"
          alt="Freesound Browser"
          class="img-zoom mt-10 m-auto rounded-xl border border-neutral-800"
          loading="lazy"
        />

        <div class="mt-10 grid gap-6 md:grid-cols-3">
          <div
            v-for="(action, i) in freesoundActions" :key="action.title"
            v-reveal="i * 120"
            class="card-lift rounded-xl border border-neutral-800 bg-neutral-950/60 p-6 transition-colors hover:border-synth-cyan/40"
          >
            <component :is="action.icon" class="h-6 w-6 text-synth-cyan" />
            <h3 class="mt-3 font-mono text-sm font-black uppercase tracking-widest">{{ action.title }}</h3>
            <p class="mt-2 text-sm text-neutral-400">{{ action.text }}</p>
          </div>
        </div>

        <div class="mt-10 grid items-center gap-8 md:grid-cols-2">
          <div v-reveal>
            <h3 class="font-mono text-sm font-black uppercase tracking-widest text-synth-neon">Smart search, performer-grade</h3>
            <ul class="mt-4 flex flex-col gap-2.5">
              <li class="flex items-start gap-2 text-sm text-neutral-400">
                <Check class="mt-0.5 h-4 w-4 flex-none text-synth-neon" />
                <span><strong class="text-neutral-200">BPM &amp; sound analysis</strong> — results show duration, tags, license, and BPM from Freesound's acoustic analysis; find-similar surfaces related sounds instantly.</span>
              </li>
              <li class="flex items-start gap-2 text-sm text-neutral-400">
                <Check class="mt-0.5 h-4 w-4 flex-none text-synth-neon" />
                <span><strong class="text-neutral-200">CC0-only filter</strong> — restrict results to public-domain sounds, safe for commercial releases.</span>
              </li>
              <li class="flex items-start gap-2 text-sm text-neutral-400">
                <Check class="mt-0.5 h-4 w-4 flex-none text-synth-neon" />
                <span><strong class="text-neutral-200">Duration filters</strong> — zero in on one-shots or long atmospheres in seconds.</span>
              </li>
              <li class="flex items-start gap-2 text-sm text-neutral-400">
                <Check class="mt-0.5 h-4 w-4 flex-none text-synth-neon" />
                <span><strong class="text-neutral-200">Local cache</strong> — downloaded sounds play from your device, so your loop pads keep working with no internet on stage.</span>
              </li>
            </ul>
          </div>
          <img
            v-reveal="150"
            :src="withBase('/help/guides/sycore-freesound.org-browser-actions.png')"
            alt="Freesound per-sound actions"
            class="img-zoom w-full rounded-xl border border-neutral-800"
            loading="lazy"
          />
        </div>
      </div>
    </section>

    <!-- ============ TECHNOLOGY ============ -->
    <section id="technology" class="border-y border-neutral-800/60 bg-grid-neon scroll-mt-16">
      <div class="mx-auto max-w-6xl px-5 py-20">
        <p v-reveal class="font-mono text-[11px] uppercase tracking-[0.4em] text-synth-cyan">Platform Architecture</p>
        <h2 class="mt-3 max-w-2xl text-3xl font-extrabold md:text-4xl">
          Web-native. <span class="text-synth-neon">Local-first.</span>
        </h2>
        <p class="mt-4 max-w-2xl text-neutral-400">
          SY.CORE runs on the latest evolution of browser-based music technology — a lightweight,
          driver-free alternative to traditional desktop software. Stage environments are unpredictable;
          your performance never depends on a network connection.
        </p>

        <div class="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div
            v-for="(tech, i) in techStack" :key="tech.name"
            v-reveal="(i % 4) * 100"
            class="card-lift rounded-xl border border-neutral-800 bg-neutral-950/70 p-6"
          >
            <component :is="tech.icon" class="h-6 w-6 text-synth-cyan" />
            <h3 class="mt-3 font-mono text-sm font-black uppercase tracking-widest text-white">{{ tech.name }}</h3>
            <p class="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">{{ tech.role }}</p>
            <p class="mt-3 text-[13px] text-neutral-400">{{ tech.advantage }}</p>
          </div>
        </div>

        <div class="mt-10 grid gap-4 sm:grid-cols-3">
          <div class="flex items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-950/70 p-5">
            <Wifi class="mt-0.5 h-5 w-5 flex-none text-synth-neon" />
            <div>
              <h4 class="font-mono text-xs font-black uppercase tracking-widest">Works Fully Offline</h4>
              <p class="mt-1 text-[13px] text-neutral-400">Once saved as a PWA, SY.CORE launches and operates with zero internet.</p>
            </div>
          </div>
          <div class="flex items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-950/70 p-5">
            <Zap class="mt-0.5 h-5 w-5 flex-none text-synth-neon" />
            <div>
              <h4 class="font-mono text-xs font-black uppercase tracking-widest">Instant Boot</h4>
              <p class="mt-1 text-[13px] text-neutral-400">No cloud round-trips. Sounds, presets and tracks ready as fast as your hardware.</p>
            </div>
          </div>
          <div class="flex items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-950/70 p-5">
            <MonitorSmartphone class="mt-0.5 h-5 w-5 flex-none text-synth-neon" />
            <div>
              <h4 class="font-mono text-xs font-black uppercase tracking-widest">Universal via PWA</h4>
              <p class="mt-1 text-[13px] text-neutral-400">Full-screen, system-integrated experience on Windows, macOS, Linux and Android.</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ AUDIENCES ============ -->
    <section class="mx-auto max-w-6xl px-5 py-20">
      <div v-reveal class="text-center">
        <p class="font-mono text-[11px] uppercase tracking-[0.4em] text-synth-cyan">Who It's For</p>
        <h2 class="mt-3 text-3xl font-extrabold md:text-4xl">Made for people who make machines sing.</h2>
      </div>
      <div class="mt-12 grid gap-6 md:grid-cols-3">
        <div
          v-for="(audience, i) in audiences" :key="audience.title"
          v-reveal="i * 120"
          class="card-lift rounded-xl border border-neutral-800 bg-neutral-900/40 p-8 text-center transition-colors hover:border-synth-neon/40"
        >
          <component :is="audience.icon" class="mx-auto h-8 w-8 text-synth-neon" />
          <h3 class="mt-4 font-mono text-sm font-black uppercase tracking-widest">{{ audience.title }}</h3>
          <p class="mt-3 text-sm text-neutral-400">{{ audience.text }}</p>
        </div>
      </div>
    </section>

    <!-- ============ FREE / OPEN SOURCE / DONATIONWARE ============ -->
    <section id="free" class="border-t border-neutral-800/60 bg-neutral-900/30 scroll-mt-16">
      <div class="mx-auto max-w-6xl px-5 py-20">
        <div v-reveal class="text-center">
          <p class="font-mono text-[11px] uppercase tracking-[0.4em] text-synth-cyan">No Catch</p>
          <h2 class="mt-3 text-3xl font-extrabold md:text-4xl">
            Free. <span class="text-synth-neon">Open Source.</span> Donationware.
          </h2>
          <p class="mx-auto mt-4 max-w-2xl text-neutral-400">
            SY.CORE is built by musicians, for musicians. There is no pro tier, no trial countdown,
            and no locked features — just a tool we want on every stage.
          </p>
        </div>
        <div class="mt-12 grid gap-6 md:grid-cols-3">
          <div
            v-for="(card, i) in freeCards" :key="card.title"
            v-reveal="i * 120"
            class="card-lift rounded-xl border border-neutral-800 bg-neutral-950/60 p-8 text-center transition-colors hover:border-synth-neon/40"
          >
            <component
              :is="card.icon"
              :class="['mx-auto h-8 w-8 text-synth-neon', card.icon === Heart ? 'heart-beat' : '']"
            />
            <h3 class="mt-4 font-mono text-sm font-black uppercase tracking-widest">{{ card.title }}</h3>
            <p class="mt-3 text-sm text-neutral-400">{{ card.text }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ FINAL CTA ============ -->
    <section class="border-t border-neutral-800/60 bg-grid-neon">
      <div class="mx-auto max-w-6xl px-5 py-24 text-center">
        <h2 v-reveal class="mx-auto max-w-2xl text-3xl font-extrabold md:text-5xl">
          No installation. No drivers. No price tag.<br>
          <span class="glow-flicker text-synth-neon text-glow-neon">Just a URL between you and the stage.</span>
        </h2>
        <button
          v-reveal="150"
          @click="launchApp"
          class="cta-pulse mt-10 inline-flex items-center gap-2 rounded-lg bg-synth-neon px-8 py-4 font-mono text-sm font-black uppercase tracking-[0.2em] text-black transition-all hover:bg-white active:scale-95"
        >
          <Play class="h-4 w-4 fill-current" />
          Launch SY.CORE
        </button>
      </div>
    </section>

    <!-- ============ FOOTER ============ -->
    <footer class="border-t border-neutral-800/80 bg-neutral-950">
      <div class="mx-auto max-w-6xl px-5 py-12">
        <div class="flex flex-col items-start justify-between gap-8 md:flex-row">
          <div class="max-w-md">
            <span class="font-mono text-lg font-black uppercase">
              <span class="text-white">SY.</span><span class="text-synth-neon">CORE</span>
              <span class="ml-2 text-[10px] font-bold tracking-widest text-neutral-600">LAB</span>
            </span>
            <p class="mt-3 text-[13px] text-neutral-500">
              A research and development collective operating at the intersection of Music Technology,
              Adaptive Algorithms, and Human-Instrument Interaction. Our mission: build tools that feel
              like instruments, not software.
            </p>
            <p class="mt-3 font-mono text-[10px] uppercase tracking-widest text-synth-neon">
              Completely free · Open source · Donationware
            </p>
            <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
              <a
                :href="patreonUrl"
                target="_blank"
                rel="noopener"
                class="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-neutral-500 hover:text-pink-400 transition-colors"
              >
                <Heart class="h-3 w-3" />
                Support on Patreon
              </a>
              <a
                :href="githubUrl"
                target="_blank"
                rel="noopener"
                class="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-neutral-500 hover:text-synth-neon transition-colors"
              >
                <GithubIcon class="h-3 w-3" />
                View Source on GitHub
              </a>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-x-12 gap-y-2">
            <a
              v-for="link in navLinks" :key="link.href" :href="link.href"
              class="font-mono text-[11px] uppercase tracking-widest text-neutral-500 hover:text-synth-neon"
            >
              {{ link.label }}
            </a>
            <button
              @click="launchApp"
              class="text-left font-mono text-[11px] uppercase tracking-widest text-synth-neon hover:text-white"
            >
              Launch App
            </button>
          </div>
        </div>
        <div class="mt-10 border-t border-neutral-900 pt-6 text-center font-mono text-[10px] uppercase tracking-widest text-neutral-600">
          SY.CORE — Made with Precision &amp; Neural Magic. © SY.CORE Lab. All rights reserved.
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* ---- Scroll reveal (driven by the v-reveal directive) ---- */
.reveal {
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 0.7s ease, transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform;
}
.reveal-visible {
  opacity: 1;
  transform: translateY(0);
}

/* ---- Hero entrance ---- */
@keyframes hero-fade-up {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
.hero-fade { animation: hero-fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) both; }
.hero-fade-1 { animation-delay: 0.05s; }
.hero-fade-2 { animation-delay: 0.15s; }
.hero-fade-3 { animation-delay: 0.3s; }
.hero-fade-4 { animation-delay: 0.45s; }
.hero-fade-5 { animation-delay: 0.6s; }
.hero-fade-6 { animation-delay: 0.75s; }

/* ---- Neon flicker on key headlines ---- */
@keyframes glow-flicker {
  0%, 100% { text-shadow: 0 0 10px rgba(0, 255, 204, 0.5); }
  45%      { text-shadow: 0 0 18px rgba(0, 255, 204, 0.85), 0 0 42px rgba(0, 255, 204, 0.35); }
  48%      { text-shadow: 0 0 6px rgba(0, 255, 204, 0.3); }
  52%      { text-shadow: 0 0 20px rgba(0, 255, 204, 0.9); }
}
.glow-flicker { animation: glow-flicker 4s ease-in-out infinite; }

.counter-glow { animation: glow-flicker 3s ease-in-out infinite; }

/* ---- Pulsing CTA glow ---- */
@keyframes cta-pulse {
  0%, 100% { box-shadow: 0 0 16px rgba(0, 255, 204, 0.35); }
  50%      { box-shadow: 0 0 32px rgba(0, 255, 204, 0.65); }
}
.cta-pulse { animation: cta-pulse 2.4s ease-in-out infinite; }

/* ---- Hero screenshot slow float ---- */
@keyframes img-float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-8px); }
}
.img-float { animation: img-float 7s ease-in-out infinite; }

/* ---- Screenshot hover zoom ---- */
.img-zoom {
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.5s ease;
}
.img-zoom:hover {
  transform: scale(1.015);
  box-shadow: 0 0 40px rgba(0, 255, 204, 0.12);
}

/* ---- Card hover lift ---- */
.card-lift {
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.35s ease, box-shadow 0.35s ease;
}
.card-lift:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}

/* ---- Donationware heart ---- */
@keyframes heart-beat {
  0%, 30%, 100% { transform: scale(1); }
  10%           { transform: scale(1.2); }
  20%           { transform: scale(1.05); }
}
.heart-beat { animation: heart-beat 1.8s ease-in-out infinite; }

/* ---- Accessibility: respect reduced motion ---- */
@media (prefers-reduced-motion: reduce) {
  .reveal { opacity: 1; transform: none; transition: none; }
  .hero-fade,
  .glow-flicker,
  .counter-glow,
  .cta-pulse,
  .img-float,
  .heart-beat {
    animation: none;
  }
}
</style>
