<template>
  <div
    v-show="uiStore.isMidiControllerDesignerOpen"
    :style="panelStyle"
    class="fixed flex flex-col bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl"
    @mousedown="bringToFront"
  >
    <!-- Title bar -->
    <div
      class="flex items-center justify-between px-3 py-2 bg-neutral-900 border-b border-neutral-800 cursor-move select-none shrink-0"
      @mousedown.self="onDragStart"
    >
      <div class="flex items-center gap-2 pointer-events-none">
        <Cpu class="w-3.5 h-3.5 text-violet-400" />
        <span class="text-[11px] font-black uppercase tracking-[0.2em] text-white">Controller Designer</span>
        <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">{{ activePreset?.name }}</span>
      </div>
      <div class="flex items-center gap-1">
        <button @click.stop="toggleMinimize" class="p-1 text-neutral-500 hover:text-white transition-colors" title="Minimize">
          <Minus class="w-3 h-3" />
        </button>
        <button @click.stop="uiStore.isMidiControllerDesignerOpen = false" class="p-1 text-neutral-500 hover:text-red-400 transition-colors">
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- Minimized bar -->
    <div v-if="isMinimized" class="px-3 py-1.5 text-[10px] text-neutral-500 font-mono">
      Controller Designer · {{ activePreset?.controls.length ?? 0 }} controls
    </div>

    <template v-if="!isMinimized">

      <!-- Toolbar -->
      <div class="flex items-center gap-2 px-3 py-2 bg-neutral-900/60 border-b border-neutral-800 shrink-0 flex-wrap">
        <!-- Control type palette -->
        <div class="flex items-center gap-1">
          <button
            v-for="ct in CONTROL_TYPES" :key="ct.type"
            @click="selectedTool = ct.type"
            :title="ct.label"
            :class="[
              'px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border transition-colors',
              selectedTool === ct.type
                ? 'bg-violet-600 border-violet-500 text-white'
                : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-violet-500/50 hover:text-white'
            ]"
          >{{ ct.label }}</button>
        </div>

        <div class="w-px h-4 bg-neutral-700 mx-1" />

        <!-- Color palette -->
        <div class="flex items-center gap-1">
          <button
            v-for="c in COLOR_PALETTE" :key="c"
            @click="activeColor = c"
            :style="{ background: c }"
            :title="c"
            :class="[
              'w-5 h-5 rounded border-2 transition-all',
              activeColor === c ? 'border-white scale-125' : 'border-transparent hover:border-neutral-400'
            ]"
          />
        </div>

        <div class="w-px h-4 bg-neutral-700 mx-1" />

        <!-- Device selector -->
        <select
          v-model="assignedDevice"
          class="bg-neutral-800 border border-neutral-700 rounded text-[10px] text-neutral-300 px-2 py-1 focus:outline-none focus:border-violet-500"
          title="Assign to MIDI device"
        >
          <option value="">— No device —</option>
          <option v-for="d in midiStore.inputs" :key="d.name" :value="d.name">{{ d.name }}</option>
        </select>

        <div class="w-px h-4 bg-neutral-700 mx-1" />

        <!-- Preset controls -->
        <select
          v-model="activePresetId"
          class="bg-neutral-800 border border-neutral-700 rounded text-[10px] text-neutral-300 px-2 py-1 focus:outline-none focus:border-violet-500 max-w-[120px]"
        >
          <option v-for="p in presets" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <button @click="newPreset" class="p-1 text-neutral-500 hover:text-violet-400 transition-colors" title="New preset">
          <Plus class="w-3.5 h-3.5" />
        </button>
        <button @click="savePresets" :disabled="saving" class="p-1 text-neutral-500 hover:text-emerald-400 transition-colors" title="Save presets">
          <Save class="w-3.5 h-3.5" />
        </button>

        <div class="w-px h-4 bg-neutral-700 mx-1" />

        <!-- Selection controls -->
        <button
          v-if="selectedControlId && !isDesignMode"
          @click="deleteSelected"
          class="p-1 text-neutral-500 hover:text-red-400 transition-colors"
          title="Delete selected control"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
        <button
          @click="clearCanvas"
          class="p-1 text-neutral-500 hover:text-red-400 transition-colors"
          title="Clear all controls"
        >
          <LayoutTemplate class="w-3.5 h-3.5" />
        </button>

        <div class="w-px h-4 bg-neutral-700 mx-1" />

        <!-- Design mode toggle -->
        <button
          @click="toggleDesignMode"
          :class="[
            'flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-wider transition-colors',
            isDesignMode
              ? 'bg-amber-500/20 border-amber-500/60 text-amber-400'
              : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-amber-500/40 hover:text-amber-400'
          ]"
          title="Toggle design mode"
        >
          <MousePointer2 class="w-3 h-3" />
          Design
        </button>
      </div>

      <!-- Bulk action bar (design mode) -->
      <div
        v-if="isDesignMode"
        class="flex items-center gap-2 px-3 py-1.5 bg-amber-950/30 border-b border-amber-800/30 shrink-0 flex-wrap"
      >
        <span class="text-[9px] text-amber-400 font-bold uppercase tracking-wider">
          {{ selectedIds.size > 0 ? selectedIds.size + ' selected' : 'Click or drag to select' }}
        </span>
        <template v-if="selectedIds.size > 0">
          <div class="w-px h-4 bg-neutral-700" />
          <button @click="selectAll" class="text-[9px] text-neutral-400 hover:text-white transition-colors">All</button>
          <div class="w-px h-4 bg-neutral-700" />
          <div class="flex items-center gap-1">
            <span class="text-[9px] text-neutral-500">Color</span>
            <input
              type="color"
              :value="COLOR_PALETTE[0]"
              @input="e => bulkSetColor(e.target.value)"
              class="w-6 h-6 rounded border border-neutral-700 cursor-pointer bg-transparent p-0"
            />
          </div>
          <div class="flex items-center gap-1">
            <span class="text-[9px] text-neutral-500">W</span>
            <input
              type="number" min="40" max="400" placeholder="—"
              @change="e => bulkSetSize('w', +e.target.value)"
              class="bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 text-[10px] text-white w-14 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div class="flex items-center gap-1">
            <span class="text-[9px] text-neutral-500">H</span>
            <input
              type="number" min="40" max="400" placeholder="—"
              @change="e => bulkSetSize('h', +e.target.value)"
              class="bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 text-[10px] text-white w-14 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div class="w-px h-4 bg-neutral-700" />
          <button @click="bulkDuplicate" class="p-1 text-neutral-500 hover:text-violet-400 transition-colors" title="Duplicate selected">
            <Plus class="w-3.5 h-3.5" />
          </button>
          <button @click="bulkDelete" class="p-1 text-neutral-500 hover:text-red-400 transition-colors" title="Delete selected">
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </template>
      </div>

      <!-- Canvas + Drawer row -->
      <div class="flex flex-1 overflow-hidden">

      <!-- Canvas -->
      <div
        ref="canvasRef"
        class="relative flex-1 overflow-hidden bg-neutral-950"
        :class="isDesignMode ? 'cursor-default' : 'cursor-crosshair'"
        style="min-height: 300px"
        @mousedown="onCanvasMouseDown"
      >
        <!-- Grid dots -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="ctrl-grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.5" fill="#404040" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#ctrl-grid)" />
        </svg>

        <!-- Controls -->
        <div
          v-for="ctrl in controls"
          :key="ctrl.id"
          :style="{
            position: 'absolute',
            left: ctrl.x + 'px',
            top: ctrl.y + 'px',
            width: ctrl.w + 'px',
            height: ctrl.h + 'px',
            zIndex: selectedControlId === ctrl.id ? 10 : 1,
          }"
          class="group"
          @mousedown.stop="isDesignMode ? onDesignMouseDown($event, ctrl) : onControlMouseDown($event, ctrl)"
          @contextmenu.prevent="!isDesignMode && openMenu($event, { name: ctrlParamName(ctrl), label: ctrl.label })"
        >
          <!-- Pad Switch -->
          <template v-if="ctrl.type === 'pad-switch'">
            <button
              @click.stop="togglePadSwitch(ctrl)"
              :style="{ background: ctrl.value ? ctrl.color : 'transparent' }"
              :class="[
                'w-full h-full rounded-lg border-2 flex items-center justify-center select-none transition-colors text-[10px] font-bold uppercase tracking-wider',
                ctrl.value ? 'border-transparent text-white shadow-lg' : 'border-neutral-600 text-neutral-400 hover:border-neutral-500',
                isDesignMode ? (selectedIds.has(ctrl.id) ? 'ring-2 ring-amber-400/80' : '') : (selectedControlId === ctrl.id ? 'ring-2 ring-violet-400/80' : ''),
                mappingStore.mappedParams?.has(ctrlParamName(ctrl)) ? 'ring-1 ring-amber-500/60' : '',
              ]"
            >{{ ctrl.label }}</button>
          </template>

          <!-- Pad Momentary -->
          <template v-else-if="ctrl.type === 'pad-momentary'">
            <button
              @mousedown="onPadMomentaryDown(ctrl)"
              @mouseup="onPadMomentaryUp(ctrl)"
              @mouseleave="onPadMomentaryUp(ctrl)"
              :style="{ background: ctrl.value ? ctrl.color : 'transparent' }"
              :class="[
                'w-full h-full rounded-lg border-2 flex items-center justify-center select-none transition-colors text-[10px] font-bold uppercase tracking-wider',
                ctrl.value ? 'border-transparent text-white shadow-lg' : 'border-neutral-600 text-neutral-400 hover:border-neutral-500',
                isDesignMode ? (selectedIds.has(ctrl.id) ? 'ring-2 ring-amber-400/80' : '') : (selectedControlId === ctrl.id ? 'ring-2 ring-violet-400/80' : ''),
                mappingStore.mappedParams?.has(ctrlParamName(ctrl)) ? 'ring-1 ring-amber-500/60' : '',
              ]"
            >{{ ctrl.label }}</button>
          </template>

          <!-- Slider -->
          <template v-else-if="ctrl.type === 'slider'">
            <div
              :class="[
                'w-full h-full rounded-lg border-2 border-neutral-600 bg-neutral-900 flex flex-col items-center justify-end overflow-hidden relative',
                isDesignMode ? (selectedIds.has(ctrl.id) ? 'border-amber-400/80' : '') : (selectedControlId === ctrl.id ? 'border-violet-400/80' : ''),
                mappingStore.mappedParams?.has(ctrlParamName(ctrl)) ? 'ring-1 ring-amber-500/60' : '',
              ]"
            >
              <div
                class="absolute bottom-0 left-0 right-0 transition-none rounded-b-lg"
                :style="{ height: ((ctrl.value ?? 0) / 127 * 100) + '%', background: ctrl.color, opacity: 0.7 }"
              />
              <span class="relative z-10 text-[9px] font-mono text-neutral-300 mb-1">{{ ctrl.value ?? 0 }}</span>
              <span class="relative z-10 text-[8px] font-bold uppercase tracking-wider text-neutral-400 mb-0.5">{{ ctrl.label }}</span>
              <input
                type="range" min="0" max="127" :value="ctrl.value ?? 0"
                @input.stop="onSliderInput(ctrl, $event)"
                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                style="writing-mode: vertical-lr; direction: rtl"
              />
            </div>
          </template>

          <!-- Encoder -->
          <template v-else-if="ctrl.type === 'encoder'">
            <!-- Drag handle — sits above the encoder circle -->
            <div
              class="absolute top-0.5 left-1/2 -translate-x-1/2 w-7 h-4 z-30 cursor-move flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              :class="selectedControlId === ctrl.id ? '!opacity-100' : ''"
              @mousedown.stop="onControlMouseDown($event, ctrl)"
              @click.stop
            >
              <GripHorizontal class="w-4 h-3 text-neutral-500 pointer-events-none" />
            </div>
            <div
              :class="[
                'w-full h-full rounded-full border-2 border-neutral-600 bg-neutral-900 flex items-center justify-center relative cursor-ns-resize select-none',
                isDesignMode ? (selectedIds.has(ctrl.id) ? 'border-amber-400/80' : '') : (selectedControlId === ctrl.id ? 'border-violet-400/80' : ''),
                mappingStore.mappedParams?.has(ctrlParamName(ctrl)) ? 'ring-1 ring-amber-500/60' : '',
              ]"
              @mousedown.stop="onEncoderMouseDown($event, ctrl)"
            >
              <!-- Indicator line -->
              <div
                class="absolute w-0.5 rounded-full pointer-events-none"
                :style="{
                  height: '40%',
                  background: ctrl.color,
                  top: '10%',
                  left: '50%',
                  transformOrigin: 'bottom center',
                  transform: `translateX(-50%) rotate(${((ctrl.value ?? 0) / 127 * 270) - 135}deg)`,
                }"
              />
              <span class="text-[8px] font-bold uppercase tracking-wider text-neutral-400 mt-4">{{ ctrl.label }}</span>
            </div>
          </template>

          <!-- MIDI learn orange dot -->
          <span
            v-if="mappingStore.learningParamName === ctrlParamName(ctrl)"
            class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse z-50 pointer-events-none"
          />

          <!-- Resize handle (bottom-right) -->
          <div
            v-if="selectedControlId === ctrl.id && !isDesignMode"
            class="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize bg-violet-500/60 rounded-tl"
            @mousedown.stop="onResizeHandleMouseDown($event, ctrl)"
          />
        </div>

        <!-- Lasso selection rect -->
        <div
          v-if="lassoRect"
          class="absolute pointer-events-none border border-amber-400 bg-amber-400/10"
          :style="{ left: lassoRect.x + 'px', top: lassoRect.y + 'px', width: lassoRect.w + 'px', height: lassoRect.h + 'px' }"
        />
      </div>

      <!-- Right drawer -->
      <div
        v-if="drawerControl"
        class="w-56 flex flex-col bg-neutral-900 border-l border-neutral-800 overflow-hidden shrink-0"
      >
        <!-- Drawer header -->
        <div class="flex items-center justify-between px-3 py-2 border-b border-neutral-800 shrink-0">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="text-[10px] font-bold text-white truncate">{{ drawerControl.label }}</span>
            <span class="text-[8px] text-neutral-500 uppercase tracking-wider shrink-0">{{ drawerControl.type }}</span>
          </div>
          <button @click="selectedControlId = null; selectedIds = new Set()" class="p-0.5 text-neutral-500 hover:text-white shrink-0">
            <X class="w-3 h-3" />
          </button>
        </div>

        <!-- Current assignment -->
        <div v-if="drawerControl.assignment" class="flex items-center justify-between px-3 py-1.5 bg-violet-900/20 border-b border-violet-800/30 shrink-0">
          <span class="text-[9px] text-violet-300 truncate leading-tight">{{ drawerControl.assignment.label }}</span>
          <button @click="clearAssignment(drawerControl)" class="p-0.5 text-neutral-500 hover:text-red-400 shrink-0 ml-1">
            <X class="w-3 h-3" />
          </button>
        </div>

        <!-- Drawer tabs -->
        <div class="flex border-b border-neutral-800 shrink-0">
          <button
            @click="drawerTab = 'actions'"
            :class="['flex-1 text-[9px] uppercase tracking-wider py-1.5 transition-colors font-bold', drawerTab === 'actions' ? 'text-violet-400 border-b-2 border-violet-400' : 'text-neutral-500 hover:text-white']"
          >Actions</button>
          <button
            @click="drawerTab = 'app'"
            :class="['flex-1 text-[9px] uppercase tracking-wider py-1.5 transition-colors font-bold', drawerTab === 'app' ? 'text-violet-400 border-b-2 border-violet-400' : 'text-neutral-500 hover:text-white']"
          >App</button>
        </div>

        <!-- Drawer content -->
        <div class="flex-1 overflow-y-auto custom-scrollbar">

          <!-- MIDI Actions tab -->
          <template v-if="drawerTab === 'actions'">
            <template v-for="(actions, group) in MIDI_ACTION_GROUPS" :key="group">
              <button
                @click="collapsedActions.has(group) ? collapsedActions.delete(group) : collapsedActions.add(group); collapsedActions = new Set(collapsedActions)"
                class="w-full flex items-center justify-between px-3 py-1 text-[8px] uppercase tracking-widest text-amber-500/80 font-bold bg-neutral-900 sticky top-0 hover:text-amber-400 transition-colors"
              >
                {{ group }}
                <ChevronDown class="w-3 h-3 transition-transform shrink-0" :class="collapsedActions.has(group) ? '-rotate-90' : ''" />
              </button>
              <template v-if="!collapsedActions.has(group)">
                <button
                  v-for="action in actions" :key="action"
                  @click="assignToMidiAction(drawerControl, action)"
                  :class="[
                    'w-full text-left px-3 py-1.5 text-[10px] transition-colors leading-tight',
                    drawerControl.assignment?.action === action
                      ? 'text-violet-400 bg-violet-900/20'
                      : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
                  ]"
                >{{ APP_ACTION_LABELS[action] }}</button>
              </template>
            </template>
          </template>

          <!-- App Controls tab -->
          <template v-else>
            <template v-for="section in APP_SECTIONS" :key="section.key">
              <button
                @click="collapsedApp.has(section.key) ? collapsedApp.delete(section.key) : collapsedApp.add(section.key); collapsedApp = new Set(collapsedApp)"
                class="w-full flex items-center justify-between px-3 py-1 text-[8px] uppercase tracking-widest text-amber-500/80 font-bold bg-neutral-900 sticky top-0 hover:text-amber-400 transition-colors"
              >
                {{ section.label }}
                <ChevronDown class="w-3 h-3 transition-transform shrink-0" :class="collapsedApp.has(section.key) ? '-rotate-90' : ''" />
              </button>
              <template v-if="!collapsedApp.has(section.key)">
                <button
                  v-for="item in section.items" :key="item.paramName ?? item.action"
                  @click="item.paramName ? assignToAppParam(drawerControl, item.paramName, item.label) : assignToMidiAction(drawerControl, item.action)"
                  :class="[
                    'w-full text-left px-3 py-1.5 text-[10px] transition-colors',
                    (drawerControl.assignment?.paramName && drawerControl.assignment.paramName === item.paramName) ||
                    (drawerControl.assignment?.action && drawerControl.assignment.action === item.action)
                      ? 'text-violet-400 bg-violet-900/20'
                      : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
                  ]"
                >{{ item.label }}</button>
              </template>
            </template>
          </template>

        </div>
      </div>

      <!-- End canvas+drawer row -->
      </div>

      <!-- Selected control editor -->
      <div v-if="selectedControl" class="flex items-center gap-3 px-3 py-2 bg-neutral-900/60 border-t border-neutral-800 shrink-0 flex-wrap">
        <span class="text-[9px] uppercase tracking-widest text-neutral-500 font-bold">{{ selectedControl.type }}</span>
        <input
          v-model="selectedControl.label"
          @input="debouncedSave"
          class="bg-neutral-800 border border-neutral-700 rounded px-2 py-0.5 text-[10px] text-white w-20 focus:outline-none focus:border-violet-500"
          placeholder="Label"
        />
        <div class="flex items-center gap-1">
          <span class="text-[9px] text-neutral-500">Color</span>
          <input
            type="color"
            :value="selectedControl.color"
            @input="e => { selectedControl.color = e.target.value; debouncedSave() }"
            class="w-6 h-6 rounded border border-neutral-700 cursor-pointer bg-transparent p-0"
          />
        </div>
        <div class="flex items-center gap-1">
          <span class="text-[9px] text-neutral-500">CC</span>
          <input
            type="number" min="0" max="127"
            :value="selectedControl.ccNumber ?? ''"
            @change="e => { selectedControl.ccNumber = e.target.value ? +e.target.value : undefined; debouncedSave() }"
            class="bg-neutral-800 border border-neutral-700 rounded px-2 py-0.5 text-[10px] text-white w-12 focus:outline-none focus:border-violet-500"
            placeholder="CC#"
          />
        </div>
        <div class="flex items-center gap-1">
          <span class="text-[9px] text-neutral-500">Note</span>
          <input
            type="number" min="0" max="127"
            :value="selectedControl.noteNumber ?? ''"
            @change="e => { selectedControl.noteNumber = e.target.value ? +e.target.value : undefined; debouncedSave() }"
            class="bg-neutral-800 border border-neutral-700 rounded px-2 py-0.5 text-[10px] text-white w-12 focus:outline-none focus:border-violet-500"
            placeholder="Note#"
          />
        </div>
        <div class="flex items-center gap-1">
          <span class="text-[9px] text-neutral-500">CH</span>
          <input
            type="number" min="1" max="16"
            :value="selectedControl.channel ?? 1"
            @change="e => { selectedControl.channel = +e.target.value; debouncedSave() }"
            class="bg-neutral-800 border border-neutral-700 rounded px-2 py-0.5 text-[10px] text-white w-12 focus:outline-none focus:border-violet-500"
          />
        </div>
        <span
          class="text-[9px] ml-1"
          :class="selectedControl.ccNumber != null ? 'text-cyan-500/70' : selectedControl.noteNumber != null ? 'text-violet-400/70' : 'text-neutral-500'"
        >
          {{ selectedControl.ccNumber != null ? `CC ${selectedControl.ccNumber}` : selectedControl.noteNumber != null ? `Note ${selectedControl.noteNumber}` : 'Set CC or Note#' }}
          · Right-click to MIDI Learn
        </span>
      </div>

      <!-- Resize handle -->
      <div
        class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-0 hover:opacity-100"
        @mousedown.stop="e => onResizeStart(e, 'se')"
      />
    </template>
  </div>

  <MidiMapContextMenu />
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Cpu, Minus, X, Plus, Save, Trash2, LayoutTemplate, GripHorizontal, ChevronDown, MousePointer2 } from 'lucide-vue-next'
import { useUiStore }            from '@/stores/useUiStore'
import { useMidiStore }          from '@/stores/useMidiStore'
import { useMappingStore }       from '@/stores/useMappingStore'
import { midiService }           from '@/core/midi/MidiService'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import { useMidiContextMenu }    from '@/composables/useMidiContextMenu'
import MidiMapContextMenu        from '@/components/ui/MidiMapContextMenu.vue'
import {
  loadControllerPresets,
  persistControllerPresets,
  createControllerPreset,
  createControl,
} from '@/lib/midi-controller-presets'
import { APP_ACTION_LABELS, MIDI_ACTION_GROUPS } from '@/lib/app-midi-actions'

const uiStore      = useUiStore()
const midiStore    = useMidiStore()
const mappingStore = useMappingStore()
const { openMenu } = useMidiContextMenu()

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront } =
  useDraggableResizable({
    storageKey:    'SYCORE_MIDI_CTRL_DESIGNER',
    initialWidth:  800,
    initialHeight: 560,
    minWidth:      480,
    minHeight:     320,
    minimizeLabel: 'Controller Designer',
  })

// ─── State ────────────────────────────────────────────────────────────────────

const CONTROL_TYPES = [
  { type: 'pad-switch',    label: 'Switch' },
  { type: 'pad-momentary', label: 'Moment' },
  { type: 'slider',        label: 'Slider' },
  { type: 'encoder',       label: 'Encoder' },
]

const COLOR_PALETTE = [
  '#7c3aed', // violet
  '#2563eb', // blue
  '#0891b2', // cyan
  '#059669', // emerald
  '#65a30d', // lime
  '#d97706', // amber
  '#dc2626', // red
  '#db2777', // pink
]

const presets       = ref([])
const activePresetId = ref('')
const saving        = ref(false)
const selectedTool  = ref('pad-switch')
const activeColor   = ref(COLOR_PALETTE[0])
const drawerTab = ref('actions')

const _DM_TRACKS = ['Kick', 'Snare', 'Closed HH', 'Open HH', 'Clap', 'Tom 1', 'Tom 2', 'Cymbal']

const APP_SECTIONS = [
  {
    key: 'menu', label: 'Main Menu',
    items: [
      { action: 'toggle_main_menu', label: 'Toggle Main Menu' },
    ],
  },
  {
    key: 'lpp', label: 'Live Performance Pad',
    items: [
      { action: 'open_lpp', label: 'Open Live Pad' },
      ...Array.from({ length: 16 }, (_, i) => ({ paramName: `lpp_set_${i}`,  label: `Set Pad ${i + 1}` })),
      ...Array.from({ length: 8 },  (_, i) => ({ paramName: `lpp_loop_${i}`, label: `Loop Pad ${i + 1}` })),
      ...Array.from({ length: 8 },  (_, i) => ({ paramName: `lpp_bt_${i}`,   label: `BT Pad ${i + 1}` })),
      { paramName: 'lpp_playstop', label: 'Play / Stop' },
    ],
  },
  {
    key: 'sampler', label: 'Sampler',
    items: [
      { action: 'open_sampler', label: 'Open Sampler' },
      ...['A','B','C','D','E','F','G','H'].map(b => ({ paramName: `sampler_bank_${b}`, label: `Bank ${b}` })),
      ...Array.from({ length: 7 }, (_, i) => ({ paramName: `sampler_pad_${i}`, label: `Pad ${i + 1}` })),
    ],
  },
  {
    key: 'dm', label: 'Drum Machine',
    items: [
      { action: 'open_drum_machine', label: 'Open Drum Machine' },
      { paramName: 'dm_play_stop',    label: 'Play / Stop' },
      { paramName: 'dm_generate',     label: 'Generate' },
      { paramName: 'dm_repeat',       label: 'Repeat' },
      { paramName: 'dm_fill',         label: 'Fill' },
      { paramName: 'dm_level_master', label: 'Master Volume' },
      ...['a','b','c','d','e','f'].map(s => ({ paramName: `dm_seq_${s}`, label: `Seq ${s.toUpperCase()}` })),
      ..._DM_TRACKS.map((lbl, i) => ({ paramName: `dm_pad_${i}`, label: `Pad: ${lbl}` })),
      ..._DM_TRACKS.map((lbl, i) => ({ paramName: `dm_vol_${i}`, label: `Vol: ${lbl}` })),
    ],
  },
  {
    key: 'chord', label: 'Chord Prog Sequencer',
    items: [
      { action: 'open_chord_prog', label: 'Open Chord Prog' },
      { action: 'seq_play',        label: 'Play' },
      { action: 'seq_stop',        label: 'Stop' },
      { action: 'seq_gen_trigger', label: 'Generate' },
      { action: 'seq_select_1',    label: 'Select Seq 1' },
      { action: 'seq_select_2',    label: 'Select Seq 2' },
      { action: 'seq_bpm_cc',      label: 'BPM via CC' },
    ],
  },
]

const collapsedActions = ref(new Set(Object.keys(MIDI_ACTION_GROUPS)))
const collapsedApp     = ref(new Set(APP_SECTIONS.map(s => s.key)))

const selectedControlId = ref(null)
const canvasRef         = ref(null)
const isDesignMode      = ref(false)
const selectedIds       = ref(new Set())
const lassoStart        = ref(null)
const lassoEnd          = ref(null)

const lassoRect = computed(() => {
  if (!lassoStart.value || !lassoEnd.value) return null
  const x1 = Math.min(lassoStart.value.x, lassoEnd.value.x)
  const y1 = Math.min(lassoStart.value.y, lassoEnd.value.y)
  const x2 = Math.max(lassoStart.value.x, lassoEnd.value.x)
  const y2 = Math.max(lassoStart.value.y, lassoEnd.value.y)
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
})

const activePreset = computed(() => presets.value.find(p => p.id === activePresetId.value) ?? null)
const controls     = computed(() => activePreset.value?.controls ?? [])
const assignedDevice = computed({
  get: () => activePreset.value?.assignedDevice ?? '',
  set: (v) => { if (activePreset.value) { activePreset.value.assignedDevice = v; debouncedSave() } },
})
const selectedControl = computed(() => controls.value.find(c => c.id === selectedControlId.value) ?? null)

// In design mode with exactly 1 control selected, the drawer shows that control
const drawerControl = computed(() => {
  if (selectedControl.value) return selectedControl.value
  if (isDesignMode.value && selectedIds.value.size === 1) {
    const id = [...selectedIds.value][0]
    return controls.value.find(c => c.id === id) ?? null
  }
  return null
})

function ctrlParamName(ctrl) {
  return `ctrl_designer_${ctrl.id}`
}

// ─── Presets ──────────────────────────────────────────────────────────────────

onMounted(async () => {
  const loaded = await loadControllerPresets()
  if (loaded.length > 0) {
    presets.value = loaded
    activePresetId.value = loaded[0].id
  } else {
    const p = createControllerPreset('Default')
    presets.value = [p]
    activePresetId.value = p.id
  }
})

async function savePresets() {
  if (saving.value) return
  saving.value = true
  try {
    await persistControllerPresets(presets.value)
  } finally {
    saving.value = false
  }
}

let _saveTimer = null
function debouncedSave() {
  clearTimeout(_saveTimer)
  _saveTimer = setTimeout(savePresets, 1500)
}

function newPreset() {
  const name = prompt('Preset name:')
  if (!name) return
  const p = createControllerPreset(name)
  presets.value.push(p)
  activePresetId.value = p.id
  debouncedSave()
}

// ─── Canvas interaction ───────────────────────────────────────────────────────

function onCanvasMouseDown(e) {
  if (e.button !== 0) return
  if (isDesignMode.value) {
    if (!e.shiftKey) selectedIds.value = new Set()
    const rect = canvasRef.value.getBoundingClientRect()
    lassoStart.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    lassoEnd.value   = { ...lassoStart.value }
    return
  }
  selectedControlId.value = null
  const rect = canvasRef.value.getBoundingClientRect()
  const x = Math.round((e.clientX - rect.left) / 10) * 10
  const y = Math.round((e.clientY - rect.top) / 10) * 10
  if (!activePreset.value) return
  const ctrl = createControl(selectedTool.value, x, y, { color: activeColor.value })
  activePreset.value.controls.push(ctrl)
  selectedControlId.value = ctrl.id
  debouncedSave()
}

// Control drag-move
let _dragging   = null
let _multiDrag  = null

function onControlMouseDown(e, ctrl) {
  if (e.button !== 0) return
  selectedControlId.value = ctrl.id
  _dragging = {
    ctrl,
    startX: e.clientX - ctrl.x,
    startY: e.clientY - ctrl.y,
    mode: 'move',
  }
  e.preventDefault()
}

function onResizeHandleMouseDown(e, ctrl) {
  selectedControlId.value = ctrl.id
  _dragging = {
    ctrl,
    startX: e.clientX,
    startY: e.clientY,
    startW: ctrl.w,
    startH: ctrl.h,
    mode: 'resize',
  }
  e.preventDefault()
  e.stopPropagation()
}

function onWindowMouseMove(e) {
  if (lassoStart.value && canvasRef.value) {
    const rect = canvasRef.value.getBoundingClientRect()
    lassoEnd.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    return
  }
  if (_multiDrag) {
    const dx = Math.round((e.clientX - _multiDrag.mouseX) / 10) * 10
    const dy = Math.round((e.clientY - _multiDrag.mouseY) / 10) * 10
    for (const { ctrl, ox, oy } of _multiDrag.starts) {
      ctrl.x = Math.max(0, ox + dx)
      ctrl.y = Math.max(0, oy + dy)
    }
    return
  }
  if (!_dragging) return
  const { ctrl, mode } = _dragging
  if (mode === 'move') {
    ctrl.x = Math.max(0, Math.round((e.clientX - _dragging.startX) / 10) * 10)
    ctrl.y = Math.max(0, Math.round((e.clientY - _dragging.startY) / 10) * 10)
  } else if (mode === 'resize') {
    ctrl.w = Math.max(40, Math.round((_dragging.startW + e.clientX - _dragging.startX) / 10) * 10)
    ctrl.h = Math.max(40, Math.round((_dragging.startH + e.clientY - _dragging.startY) / 10) * 10)
  }
}

function onWindowMouseUp() {
  if (lassoStart.value) {
    const r = lassoRect.value
    if (r && (r.w > 5 || r.h > 5)) {
      for (const ctrl of controls.value) {
        if (ctrl.x < r.x + r.w && ctrl.x + ctrl.w > r.x &&
            ctrl.y < r.y + r.h && ctrl.y + ctrl.h > r.y) {
          selectedIds.value.add(ctrl.id)
        }
      }
      selectedIds.value = new Set(selectedIds.value)
    }
    lassoStart.value = null
    lassoEnd.value   = null
    return
  }
  if (_multiDrag) { _multiDrag = null; debouncedSave(); return }
  if (_dragging)  { _dragging  = null; debouncedSave() }
}

let _removeCCListener   = null
let _removeNoteListener = null

function applyIncoming(ctrl, isHigh, velocity = 127) {
  if (ctrl.type === 'pad-switch') {
    // Toggle controllers send a high+0 pair on every press — only react to the rising edge
    if (isHigh) ctrl.value = ctrl.value ? 0 : 127
    // 0 is intentionally ignored here
  } else if (ctrl.type === 'pad-momentary') {
    ctrl.value = isHigh ? velocity : 0
  } else {
    // slider / encoder: pass the raw value
    ctrl.value = isHigh ? velocity : 0
  }
}

function onIncomingCC(cc, val, chan, inputId) {
  if (!activePreset.value) return
  for (const ctrl of controls.value) {
    if (ctrl.ccNumber !== cc) continue
    const ctrlCh = (ctrl.channel ?? 1) - 1
    if (ctrlCh !== chan) continue
    if (assignedDevice.value && inputId && inputId !== assignedDevice.value) continue
    applyIncoming(ctrl, val > 0, val)
  }
}

function onIncomingNote(type, note, velocity, chan, inputId) {
  if (!activePreset.value) return
  const isOn = type === 'on' && velocity > 0
  for (const ctrl of controls.value) {
    if (ctrl.noteNumber !== note) continue
    const ctrlCh = (ctrl.channel ?? 1) - 1
    if (ctrlCh !== chan) continue
    if (assignedDevice.value && inputId && inputId !== assignedDevice.value) continue
    applyIncoming(ctrl, isOn, velocity)
  }
}

onMounted(() => {
  window.addEventListener('mousemove', onWindowMouseMove)
  window.addEventListener('mouseup', onWindowMouseUp)
  _removeCCListener   = midiService.addCCListener(onIncomingCC)
  _removeNoteListener = midiService.addNoteListener(onIncomingNote)
})
onUnmounted(() => {
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)
  if (_removeCCListener)   _removeCCListener()
  if (_removeNoteListener) _removeNoteListener()
  clearTimeout(_saveTimer)
})

// ─── Control interactions ─────────────────────────────────────────────────────

function togglePadSwitch(ctrl) {
  ctrl.value = ctrl.value ? 0 : 127
  sendControl(ctrl, ctrl.value)
  debouncedSave()
}

function onPadMomentaryDown(ctrl) {
  ctrl.value = 127
  sendControl(ctrl, 127)
}
function onPadMomentaryUp(ctrl) {
  if (!ctrl.value) return
  ctrl.value = 0
  sendControl(ctrl, 0)
}

function onSliderInput(ctrl, e) {
  ctrl.value = +e.target.value
  sendControl(ctrl, ctrl.value)
}

// Encoder drag
let _encoderDrag = null
function onEncoderMouseDown(e, ctrl) {
  _encoderDrag = { ctrl, startY: e.clientY, startVal: ctrl.value ?? 0 }
  e.preventDefault()
  e.stopPropagation()
  const onMove = (mv) => {
    const delta = Math.round((_encoderDrag.startY - mv.clientY) / 2)
    _encoderDrag.ctrl.value = Math.max(0, Math.min(127, _encoderDrag.startVal + delta))
    sendCC(_encoderDrag.ctrl, _encoderDrag.ctrl.value)
  }
  const onUp = () => {
    _encoderDrag = null
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    debouncedSave()
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function sendControl(ctrl, value) {
  if (!assignedDevice.value) return
  const ch = (ctrl.channel ?? 1) - 1
  if (ctrl.ccNumber != null) {
    midiService.sendRawCC(assignedDevice.value, ctrl.ccNumber, value, ch)
  } else if (ctrl.noteNumber != null) {
    if (value > 0) {
      midiService.sendRawNote(assignedDevice.value, 'noteon', ctrl.noteNumber, value, ch)
    } else {
      midiService.sendRawNote(assignedDevice.value, 'noteoff', ctrl.noteNumber, 0, ch)
    }
  }
}

// ─── Assignment ───────────────────────────────────────────────────────────────

function assignToMidiAction(ctrl, action) {
  if (!ctrl) return
  const label = `Action: ${APP_ACTION_LABELS[action] ?? action}`
  if (assignedDevice.value && (ctrl.ccNumber != null || ctrl.noteNumber != null)) {
    const ch = (ctrl.channel ?? 1) - 1
    const isNote = ctrl.noteNumber != null
    const existing = mappingStore.appMidiMappings.filter(m => {
      if (m.device !== assignedDevice.value) return true
      return isNote ? m.note !== ctrl.noteNumber : m.cc !== ctrl.ccNumber
    })
    existing.push({
      id: Math.random().toString(36).slice(2, 11),
      device: assignedDevice.value,
      ...(isNote ? { note: ctrl.noteNumber } : { cc: ctrl.ccNumber }),
      channel: ch,
      value: -1,
      action,
    })
    mappingStore.saveAppMidiMappings(existing)
  }
  ctrl.assignment = { type: 'midi-action', action, label }
  debouncedSave()
}

function assignToAppParam(ctrl, paramName, paramLabel) {
  if (!ctrl) return
  if (ctrl.ccNumber != null || ctrl.noteNumber != null) {
    mappingStore.learnedDevice  = assignedDevice.value || null
    mappingStore.learnedChannel = (ctrl.channel ?? 1) - 1
    if (ctrl.ccNumber != null) {
      mappingStore.learnedCC   = ctrl.ccNumber
      mappingStore.learnedNote = null
    } else {
      mappingStore.learnedNote = ctrl.noteNumber
      mappingStore.learnedCC   = null
    }
    mappingStore.confirmLearn(paramName)
  }
  ctrl.assignment = { type: 'app-param', paramName, label: `→ ${paramLabel}` }
  debouncedSave()
}

function clearAssignment(ctrl) {
  if (!ctrl) return
  ctrl.assignment = undefined
  debouncedSave()
}

// ─── Design mode ──────────────────────────────────────────────────────────────

function toggleDesignMode() {
  isDesignMode.value = !isDesignMode.value
  selectedIds.value  = new Set()
  selectedControlId.value = null
}

function onDesignMouseDown(e, ctrl) {
  if (e.button !== 0) return
  if (!selectedIds.value.has(ctrl.id)) {
    if (!e.shiftKey) selectedIds.value = new Set()
    selectedIds.value.add(ctrl.id)
    selectedIds.value = new Set(selectedIds.value)
  }
  _multiDrag = {
    mouseX:  e.clientX,
    mouseY:  e.clientY,
    starts: [...selectedIds.value].map(id => {
      const ctrl = controls.value.find(c => c.id === id)
      return { ctrl, ox: ctrl.x, oy: ctrl.y }
    }).filter(s => s.ctrl),
  }
  e.preventDefault()
}

function selectAll() {
  selectedIds.value = new Set(controls.value.map(c => c.id))
}

function bulkSetColor(color) {
  for (const ctrl of controls.value) {
    if (selectedIds.value.has(ctrl.id)) ctrl.color = color
  }
  debouncedSave()
}

function bulkSetSize(dim, val) {
  if (!val || val < 40) return
  for (const ctrl of controls.value) {
    if (selectedIds.value.has(ctrl.id)) ctrl[dim] = val
  }
  debouncedSave()
}

function bulkDuplicate() {
  if (!activePreset.value || !selectedIds.value.size) return
  const newIds = new Set()
  const clones = controls.value
    .filter(c => selectedIds.value.has(c.id))
    .map(c => {
      const clone = { ...c, id: Math.random().toString(36).slice(2, 11), x: c.x + 20, y: c.y + 20, assignment: c.assignment ? { ...c.assignment } : undefined }
      newIds.add(clone.id)
      return clone
    })
  activePreset.value.controls.push(...clones)
  selectedIds.value = newIds
  debouncedSave()
}

function bulkDelete() {
  if (!activePreset.value) return
  activePreset.value.controls = activePreset.value.controls.filter(c => !selectedIds.value.has(c.id))
  selectedIds.value = new Set()
  debouncedSave()
}

// ─── Editing ──────────────────────────────────────────────────────────────────

function deleteSelected() {
  if (!activePreset.value || !selectedControlId.value) return
  activePreset.value.controls = activePreset.value.controls.filter(c => c.id !== selectedControlId.value)
  selectedControlId.value = null
  debouncedSave()
}

function clearCanvas() {
  if (!activePreset.value) return
  if (!confirm('Clear all controls?')) return
  activePreset.value.controls = []
  selectedControlId.value = null
  debouncedSave()
}
</script>
