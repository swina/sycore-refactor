import { ref } from 'vue'
import {
  Zap, Cpu, Cable, Music, Layers, Mic, Clock, ListMusic, Radio, Globe,
  Database, Wifi, ArrowRight, Check, Sparkles, Network, Disc3, Play,
  SlidersHorizontal, Repeat, Gauge, Workflow, Infinity as InfinityIcon,
  Search, Download, MonitorSmartphone, GitBranch, Menu, X,
  Gift, CodeXml, Heart, ListPlus, Grid3x3, AudioWaveform, Drum, Piano, GithubIcon, Youtube,
  BookOpen
} from 'lucide-vue-next'
import GuidesPanel from './components/GuidesPanel.vue'

const isMobileNavOpen = ref(false)
const showGuides = ref(false)
const fullscreenImage = ref(null)
const appUrl = 'https://sycore.app'
const githubUrl = 'https://github.com/swina/sycore-refactor'
const youtubeChannelUrl = 'https://www.youtube.com/@SYCORE-app'
const youtubePlaylistId = 'PLDF__YESXZuE'
const youtubePlaylistEmbedUrl = `https://www.youtube.com/embed/videoseries?list=${youtubePlaylistId}`

function closeFullscreen() { fullscreenImage.value = null }
function openDocs() { showGuides.value = true; isMobileNavOpen.value = false }

function onPageClick(e) {
  if (e.target.tagName === 'IMG') fullscreenImage.value = e.target.src
}

const navLinks = [
  { label: 'Sound Engine', href: '#sound-engine' },
  { label: 'MIDI', href: '#midi' },
  { label: 'Live', href: '#live' },
  { label: 'Audio', href: '#audio' },
  { label: 'Freesound', href: '#freesound' },
  { label: 'Video', href: '#video' },
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
    text: 'Assign the sound to a Loop Pad, with optional BPM override. Right-click a slot for instant MIDI Learn — your controller LED tracks play state.',
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
    text: 'If SY.CORE powers your sets, you can support its development with a donation. That\'s it — the software stays free for everyone, forever.',
  },
]

const soundEngineFeatures = [
  { icon: Sparkles, title: 'Generative Sound Creation', text: 'Instantly synthesize Pads, Leads, Basses, Experimental and more — up to 18 sound types with unique flavour variations. Every result is distinct, balanced, and performance-ready.' },
  { icon: GitBranch, title: 'Auto A/B Variations', text: 'Every generated sound ships with an automatic variation for instant comparison. Keep the one that moves you.' },
  { icon: Cable, title: 'Bi-Directional Hardware Sync', text: 'Every knob turn on the Roland S-1 is reflected in the UI. Every UI tweak hits the synth with zero perceptible latency. One hybrid instrument, fully in sync.' },
  { icon: Repeat, title: 'Extra 2 LFOs', text: 'Two fully configurable software LFOs assignable to any hardware parameter — modulation your synth was never born with.' },
  { icon: Gauge, title: 'Velocity Mapping', text: 'Map velocity to any hardware parameter for expressive, dynamic playing.' },
  { icon: SlidersHorizontal, title: 'Contextual MIDI Learn', text: 'Right-click any parameter to enter MIDI Learn. Map physical controllers to anything, instantly — with Pass Thru / Consume logic.' },
]

const midiCapabilities = [
  { title: 'Auto-Discovery', text: 'Devices appear automatically on connection. True plug and play — no drivers, ever.' },
  { title: 'MIDI Flow', text: 'Flow canvas: drag-and-drop device↔app / app↔app routing, note-range splits, multi-channel fanout, saved configs' },
  { title: 'MIDI Controller Design', text: 'Visual canvas for designing custom MIDI controller layouts with draggable controls, real-time feedback, and preset management — including full hardware navigation mapping for DECK.' },
  { title: 'MIDI Monitor', text: 'Live MIDI traffic inspector for fast on-stage debugging.' },
]

const liveTools = [
  { icon: Sparkles, title: 'DECK', tag: 'Console', img: '/help/guides/sycore-cockpit.png', text: 'A live console view of your entire MIDI Flow rig: Controllers and Apps in side columns, routed Instruments docked along the bottom, and a central Display with shared BPM, per-channel patch names, and a mini oscilloscope. Hover any controller or app to trace its live routing straight through to the instruments it reaches. The newest addition is full hardware navigation — seven mappable actions drive the whole console, zone by zone, from a physical controller, no mouse required.' },
  { icon: Clock, title: 'Live Timeline', tag: 'Arrangement', img: '/help/guides/sycore-timeline.png', text: 'A visual arrangement timeline for live performance. Sequence backing-track segments and fire any of 26 marker types at exact time positions — tempo and program changes, Performance Set recall, crossfades, Drum Machine and Samples Machine transport, Audio Capture macros — with MIDI clock and transport sync independent of playback. Save and recall full arrangements as Timeline Sets.' },
  { icon: Drum, title: 'Drum Machine', tag: 'Rhythm', img: '/help/guides/sycore-drum-machine.png', text: 'An 11-track step sequencer with style-based generation (House, Techno, Jazz, EDM, Pop and more), per-step velocity and accent, fill mode, autofill scheduling, up to 16-slot pattern chain with BPM-synced sequential playback, algorithmic basslines from reassigned pad slots, and full preset save/load with per-preset tempo. Any track can send MIDI Out instead — trigger your own hardware or app drum machine with its own sounds. AI Generator: generate a full drum pattern from a text prompt, or a single track from a MIDI input.' },
  { icon: ListMusic, title: 'Live Set', tag: 'Show Mode', img: '/help/guides/sycore-live-set.png', text: 'The dedicated show-mode control center: 16 Performance Set pads for one-touch multi-device preset recall, 16 backing-track pads, and 16 loop pads. Every pad is mappable to your hardware controller, and layouts save as Snapshots you can recall instantly between songs.' },
  { icon: Layers, title: 'Chord Progression Sequencer', tag: 'Harmony', img: '/help/guides/sycore-chord-progression.png', text: 'Up to 16 steps, each carrying a full chord — or an arpeggio, with a per-step rate override. Per-step duration, velocity, gate and transpose, a built-in progression library organised by key and genre, algorithmic generation, and Custom Chord Assignment — capture any chord live from a MIDI keyboard or the on-screen piano, auto-detected across 18 chord qualities. AI Generator: generate a full progression from a text prompt, or a single chord from a MIDI input.' },
  { icon: Music, title: 'Sequencer', tag: 'Algorithmic', img: '/help/guides/SY.CORE-Sequencer.png', text: 'Style-based generation — House, Techno, Acid, Minimal, Drum&Bass, Funk, Ambient and more — locked to key and scale. Up to 16 steps, 8 Patterns, 8 Slots Pattern Chain, native polyphony, per-step parameter locks (2 CCs), gate and tie control, play direction (Up, Down, UpDown, Random) with custom timing by tempo divisions. AI Generator: generate a full pattern from a text prompt, or a single step from a MIDI input.' },
  { icon: Cpu, title: 'Sampler', tag: 'Beta', img: '/help/guides/sycore-sampler.png', text: '8-pad, multi-bank sample player with MIDI velocity, chromatic pitch-shifting, polyphonic voice management, per-pad ADSR envelopes, lo-fi downsampling, dual granular synthesis (pads 7 & 8), and full MIDI input filtering and mapping.' },
  { icon: Repeat, title: 'Samples Machine', tag: 'Loops', img: '/help/guides/sycore-loop-machine.png', text: '24 pads of simultaneous, gapless loops — fed from local files or Freesound. Sync-quantized starts locked to a master loop, an always-on 24-channel mixer, one-touch Performance Sets, and session-wide BPM retune plus hands-free jam recording via Audio Capture, both MIDI-mappable. Every pad, fader and toggle is MIDI-learnable.' },
  { icon: InfinityIcon, title: 'Audio Looper', tag: 'Beta', img: '/help/guides/sycore-looper.png', text: 'A sample-accurate 8-track looper with BPM-aligned recording, MIDI-triggered hands-free capture, autosync, autolimiting, a touch-optimized mixer, and one-tap rendering into your playlist.' },
]

const audioCaptureFeatures = [
  { title: 'Record Anything', text: 'Capture from any audio interface with a live oscilloscope and level meter. Arm via MIDI Sync and recording fires on your first note — hands-free.' },
  { title: 'Append Mode', text: 'Stack takes instead of replacing them: each new recording is decoded and merged onto the last, building a single WAV — a rough composite without a DAW.' },
  { title: 'Waveform Editor', text: 'Loop start/end and play-start markers, a BPM-derived bar grid with snap-to-grid, and independent horizontal/vertical zoom with pan for sample-accurate loop points.' },
  { title: 'Crossfade Looping', text: 'Gapless hard-cut loops, or blended loops with up to 5 seconds of crossfade — a dual-element audio engine swaps seamlessly at the loop boundary.' },
  { title: 'Normalize: Ceiling + Gate', text: 'One-click normalization with a configurable peak ceiling (0 to −12 dBFS) and a noise-gate threshold that zeroes the floor before peak detection.' },
  { title: 'Export & Inject', text: 'Export as 192 kbps MP3 or 16-bit WAV with a loop-point sidecar file, send the cropped region to the playlist with repeat counts, or assign it straight to a Live Set loop pad.' },
]

const audioTools = [
  { icon: Disc3, title: 'Backing Track Player', text: 'A dual-slot playback engine for gapless playback and crossfades. Full playlist system with per-track repeats, global loop, tempo sync, clock sync, and MIDI START/STOP transport integration.', points: ['mp3 / ogg / wav library', 'Crossfade & gapless pre-loading', 'MIDI transport sync'] },
  { icon: Search, title: 'Freesound Browser', text: 'Over 600,000 freely licensed sounds from freesound.org — search, preview, and inject directly into your playlist, a Live Set loop pad, or the Audio Capture editor without leaving the app.', points: ['Search & preview in-app', 'Find-similar & sound analysis', 'One-click inject to pads'] },
  { icon: Cable, title: 'MIDI Capture — Piano Roll', text: 'Record live MIDI into an interactive piano roll. Edit pitch, velocity and duration, crop, quantize, play back through any output, export as .mid, or send straight into the Step Sequencer.', points: ['Real-time note capture', 'Quantize & edit', '.mid export'] },
]

const techStack = [
  { icon: Cable, name: 'Web MIDI API', role: 'Hardware device communication', advantage: 'Direct routing with near-zero latency. Talks straight to Windows MIDI Services and CoreMIDI — no ASIO, no proprietary drivers, no conflicts.' },
  { icon: Workflow, name: 'Web Audio API', role: 'Synthesis & audio processing', advantage: 'A modular, high-performance node graph powered by the browser audio engine — sample-accurate where it counts.' },
  { icon: Wifi, name: 'Service Workers (PWA)', role: 'Asset & resource management', advantage: 'Full offline functionality and near-instant loading. Once saved to your device, SY.CORE launches with zero internet.' },
  { icon: Database, name: 'IndexedDB', role: 'Local data persistence', advantage: 'Mappings, patterns, presets and sessions live on your device, not a server — saved automatically, recalled on launch.' },
]

const audiences = [
  { icon: Radio, title: 'Live Electronic Artists', text: 'A rock-solid, integrated alternative to fragile DAW setups on stage. One window, every tool, fully offline.' },
  { icon: Sparkles, title: 'Sound Designers', text: 'An algorithmic, generative approach to hardware sound creation — with visual feedback for every parameter.' },
  { icon: Cpu, title: 'Dawless & Hardware Enthusiasts', text: 'Unlock the full potential of your MIDI synthesizers through software that speaks hardware natively. No computer-music workflow required — the browser is just the brain of your rig.' },
]

const scenarios = [
  { icon: Cable, title: 'Just a MIDI Orchestrator', text: 'Turn off the Drum Machine, the Chord Progression Sequencer, and the Sound Engine. What is left is routing, mapping, and sync for a rig you already love.' },
  { icon: Layers, title: 'Just a Chord Progression Sequencer', text: 'Turn off everything else. Sketch progressions and send them out over MIDI — that is the whole workspace.' },
  { icon: Radio, title: 'Live Performance Rig', text: 'DECK, Drum Machine, Chord Progression Sequencer, Live Timeline and Live Set, with MIDI Flow underneath. The cockpit, not the workbench.' },
  { icon: AudioWaveform, title: 'Sound-Design Bench', text: 'Sound Engine, Sampler, Audio Visualizer and Sound Folder Browser. Patch generation and sound browsing, without a performance rig on the same screen.' },
  { icon: InfinityIcon, title: 'Everything', text: 'All 44 modules, at once, for whoever actually wants that. Nothing here is a locked-down "lite" version of anything.' },
  { icon: Piano, title: 'Virtual Instruments', text: 'Connect any standalone app to SY.CORE, create custom MIDI mappings, and use the Chord Progression Sequencer, Step Sequencer, or Drum Machine to drive it. The browser is just the brain of your rig.' },
]

const vReveal = {
  mounted(el, binding) {
    el.classList.add('reveal')
    if (binding.value) el.style.transitionDelay = `${binding.value}ms`
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { el.classList.add('reveal-visible'); io.disconnect() }
      },
      { threshold: 0.12 }
    )
    io.observe(el)
  },
}