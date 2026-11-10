<script setup>
// The operating modes of SY.CORE with Ableton Live, for /ableton-live: controllers → SY.CORE (browser)
// → Live, the four flows (clock, notes, Rig, Map), and the two ways to connect (SY.CORE Link / MIDI ports).
const C = {
  line: '#3f3f46', box: '#0a0a0a', inner: '#141414', ink: '#f5f5f5', muted: '#a3a3a3', dim: '#737373',
  brand: '#00A370', soft: '#33D6A8', accent: '#00C2FF', amber: '#F59E0B', violet: '#A78BFA',
}
// the four flows: colour, label, the badge's place
const flows = [
  { n: 1, color: C.accent, title: 'Clock', text: "Live's tempo, position, Play and Stop: SY.CORE follows Live." },
  { n: 2, color: C.brand, title: 'Generate and play', text: "The apps' notes reach your tracks on Live's beat; your instruments play them, Arrangement records them." },
  { n: 3, color: C.amber, title: 'Perform with the Rig', text: 'The Launchpad launches slots and sections like clips; the SY.CORE Rig device shows the grid in Live.' },
  { n: 4, color: C.violet, title: 'Map', text: "Your knobs drive the selected track's instrument: mapped once, on every track." },
]
</script>

<template>
  <div>
    <div class="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950">
      <svg viewBox="0 0 1100 520" class="block w-full min-w-[760px]" role="img"
           aria-label="SY.CORE with Ableton Live: controllers, SY.CORE in the browser and Live, with the clock, notes, Rig and Map flows through SY.CORE Link">
        <defs>
          <marker v-for="f in flows" :id="'arrow' + f.n" :key="f.n" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" :fill="f.color" />
          </marker>
        </defs>
        <g font-family="ui-monospace, SFMono-Regular, Menlo, monospace">
          <!-- columns -->
          <text x="30" y="40" :fill="C.muted" font-size="12" letter-spacing="3">YOUR CONTROLLERS</text>
          <text x="330" y="40" :fill="C.muted" font-size="12" letter-spacing="3">SY.CORE · IN THE BROWSER</text>
          <text x="790" y="40" :fill="C.muted" font-size="12" letter-spacing="3">ABLETON LIVE</text>

          <rect x="20" y="56" width="220" height="440" rx="12" :fill="C.box" :stroke="C.line" />
          <rect x="320" y="56" width="350" height="440" rx="12" :fill="C.box" :stroke="C.brand" stroke-opacity="0.6" />
          <rect x="780" y="56" width="300" height="440" rx="12" :fill="C.box" :stroke="C.line" />

          <!-- the bridge between SY.CORE and Live -->
          <rect x="690" y="56" width="70" height="440" rx="8" :fill="C.inner" :stroke="C.line" stroke-dasharray="4 4" />
          <text x="725" y="34" :fill="C.soft" font-size="11" text-anchor="middle" letter-spacing="2">SY.CORE</text>
          <text x="725" y="48" :fill="C.soft" font-size="11" text-anchor="middle" letter-spacing="2">LINK</text>
          <text x="725" y="480" :fill="C.dim" font-size="10" text-anchor="middle">WebSocket</text>
          <text x="725" y="492" :fill="C.dim" font-size="10" text-anchor="middle">localhost</text>

          <!-- 1 · Clock -->
          <rect x="340" y="80" width="310" height="60" rx="8" :fill="C.inner" />
          <text x="356" y="106" :fill="C.ink" font-size="14" font-weight="700">Clock · Transport</text>
          <text x="356" y="126" :fill="C.muted" font-size="12">follows Live: tempo, bar, Play / Stop</text>
          <rect x="800" y="80" width="260" height="60" rx="8" :fill="C.inner" />
          <text x="816" y="106" :fill="C.ink" font-size="14" font-weight="700">SY.CORE Link</text>
          <text x="816" y="126" :fill="C.muted" font-size="12">the bridge: one per set</text>
          <line x1="800" y1="110" x2="652" y2="110" :stroke="C.accent" stroke-width="2.5" :marker-end="'url(#arrow1)'" />

          <!-- 3 · Rig -->
          <rect x="40" y="170" width="180" height="70" rx="8" :fill="C.inner" />
          <text x="56" y="198" :fill="C.ink" font-size="14" font-weight="700">Launchpad</text>
          <text x="56" y="220" :fill="C.muted" font-size="12">pads: slots, sections</text>
          <rect x="340" y="170" width="310" height="70" rx="8" :fill="C.inner" />
          <text x="356" y="198" :fill="C.ink" font-size="14" font-weight="700">Rig Controller</text>
          <text x="356" y="220" :fill="C.muted" font-size="12">slots A–H, sections, GEN, Fill</text>
          <rect x="800" y="170" width="260" height="70" rx="8" :fill="C.inner" />
          <text x="816" y="198" :fill="C.ink" font-size="14" font-weight="700">SY.CORE Rig</text>
          <text x="816" y="220" :fill="C.muted" font-size="12">the grid in Live, clickable</text>
          <line x1="220" y1="205" x2="338" y2="205" :stroke="C.amber" stroke-width="2.5" :marker-end="'url(#arrow3)'" />
          <line x1="652" y1="205" x2="798" y2="205" :stroke="C.amber" stroke-width="2.5" :marker-start="'url(#arrow3)'" :marker-end="'url(#arrow3)'" />
          <line x1="495" y1="240" x2="495" y2="268" :stroke="C.amber" stroke-width="2.5" :marker-end="'url(#arrow3)'" />

          <!-- 2 · Apps → tracks -->
          <rect x="340" y="270" width="310" height="96" rx="8" :fill="C.inner" />
          <text x="356" y="298" :fill="C.ink" font-size="14" font-weight="700">Generative apps</text>
          <text x="356" y="320" :fill="C.muted" font-size="12">Drum Machine · Bass line</text>
          <text x="356" y="338" :fill="C.muted" font-size="12">Chord Prog · Sequencer · Arp</text>
          <text x="356" y="356" :fill="C.dim" font-size="12">built-in or AI generation, live</text>
          <rect x="800" y="270" width="260" height="96" rx="8" :fill="C.inner" />
          <text x="816" y="298" :fill="C.ink" font-size="14" font-weight="700">Link Receive</text>
          <text x="816" y="320" :fill="C.muted" font-size="12">one per track, by channel</text>
          <text x="816" y="338" :fill="C.muted" font-size="12">→ your Drum Racks, synths</text>
          <text x="816" y="356" :fill="C.dim" font-size="12">record in Arrangement</text>
          <line x1="652" y1="318" x2="798" y2="318" :stroke="C.brand" stroke-width="2.5" :marker-end="'url(#arrow2)'" />

          <!-- 4 · Map -->
          <rect x="40" y="396" width="180" height="80" rx="8" :fill="C.inner" />
          <text x="56" y="424" :fill="C.ink" font-size="14" font-weight="700">Knobs, encoders</text>
          <text x="56" y="446" :fill="C.muted" font-size="12">MIDImix, Launchkey…</text>
          <text x="56" y="464" :fill="C.dim" font-size="12">enabled in SY.CORE only</text>
          <rect x="340" y="396" width="310" height="80" rx="8" :fill="C.inner" />
          <text x="356" y="424" :fill="C.ink" font-size="14" font-weight="700">SY.CORE Map</text>
          <text x="356" y="446" :fill="C.muted" font-size="12">encoder n → slot n, pickup</text>
          <text x="356" y="464" :fill="C.dim" font-size="12">mapped once, in SY.CORE</text>
          <rect x="800" y="396" width="260" height="80" rx="8" :fill="C.inner" />
          <text x="816" y="424" :fill="C.ink" font-size="14" font-weight="700">SY.CORE Map device</text>
          <text x="816" y="446" :fill="C.muted" font-size="12">the selected track's instrument</text>
          <text x="816" y="464" :fill="C.dim" font-size="12">parameters, Rack Macros</text>
          <line x1="220" y1="436" x2="338" y2="436" :stroke="C.violet" stroke-width="2.5" :marker-end="'url(#arrow4)'" />
          <line x1="652" y1="436" x2="798" y2="436" :stroke="C.violet" stroke-width="2.5" :marker-end="'url(#arrow4)'" />

          <!-- badges -->
          <g v-for="b in [{ n: 1, x: 726, y: 110 }, { n: 3, x: 279, y: 205 }, { n: 2, x: 726, y: 318 }, { n: 4, x: 279, y: 436 }]" :key="b.n">
            <circle :cx="b.x" :cy="b.y" r="13" :fill="C.box" :stroke="flows[b.n - 1].color" stroke-width="2" />
            <text :x="b.x" :y="b.y + 5" text-anchor="middle" :fill="flows[b.n - 1].color" font-size="14" font-weight="800">{{ b.n }}</text>
          </g>
        </g>
      </svg>
    </div>

    <!-- the four flows -->
    <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div v-for="f in flows" :key="f.n" class="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <div class="flex items-center gap-2">
          <span class="flex h-6 w-6 items-center justify-center rounded-full border-2 font-mono text-xs font-black" :style="{ borderColor: f.color, color: f.color }">{{ f.n }}</span>
          <h3 class="font-mono text-xs font-black uppercase tracking-[0.15em]">{{ f.title }}</h3>
        </div>
        <p class="mt-2 text-sm text-neutral-400">{{ f.text }}</p>
      </div>
    </div>

    <!-- two ways to connect -->
    <div class="mt-6 grid gap-4 md:grid-cols-2">
      <div class="rounded-xl border border-synth-neon/40 bg-neutral-950 p-5">
        <p class="font-mono text-[10px] uppercase tracking-widest text-synth-neon">Recommended</p>
        <h3 class="mt-1 font-mono text-sm font-black uppercase tracking-[0.15em]">SY.CORE Link · Max for Live</h3>
        <ul class="mt-3 space-y-1.5 text-sm text-neutral-400">
          <li>No virtual MIDI ports, no routing to set up</li>
          <li>Notes placed on Live's beat, transport read from Live</li>
          <li>All four flows: clock, notes, the SY.CORE Rig and Map devices</li>
        </ul>
      </div>
      <div class="rounded-xl border border-neutral-800 bg-neutral-950 p-5">
        <p class="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Without Max for Live</p>
        <h3 class="mt-1 font-mono text-sm font-black uppercase tracking-[0.15em]">MIDI ports</h3>
        <ul class="mt-3 space-y-1.5 text-sm text-neutral-400">
          <li>Loopback ports (Windows MIDI Services, IAC on macOS)</li>
          <li>Live's MIDI clock in, SY.CORE's notes out to MIDI tracks</li>
          <li>Clock, notes and the Rig Controller in SY.CORE; no Rig or Map device in Live</li>
        </ul>
      </div>
    </div>
  </div>
</template>
