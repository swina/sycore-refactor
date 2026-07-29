<template>
  <div
    v-show="uiStore.isMidiControllerDesignerOpen && !isMinimized"
    :style="panelStyle"
    class="fixed flex flex-col bg-neutral-950 border border-synth-neon/30 rounded-xl overflow-hidden shadow-2xl"
    @mousedown.capture="bringToFront"
  >
    <!-- Title bar -->
    <div
      class="flex items-center justify-between px-3 py-4 bg-neutral-900 border-b border-synth-neon/30 cursor-move select-none shrink-0"
      @mousedown.self="onDragStart"
    >
      <div class="flex items-center gap-2 pointer-events-none">
        <Gamepad2 class="w-4.5 h-4.5 text-synth-neon" />
        <span class="text-xs font-black uppercase tracking-widest text-synth-neon ">Controller Designer</span>
        <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">{{ activePreset?.name }}</span>
      </div>
      <div class="flex items-center gap-1">
        <button @click.stop="deletePreset" :disabled="!activePreset || activePreset.name === 'Default'" class="p-1 text-neutral-500 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title="Delete preset">
          <Trash2 class="w-4 h-4 mr-2" />
        </button>
        <MacOsButtons @close="uiStore.isMidiControllerDesignerOpen = false" @minimize="toggleMinimize" @maximize="maximize" />
      </div>
    </div>

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

        <!-- Generate layout button — visible when device has a known template -->
        <button
          v-if="matchedLayout"
          @click="generateLayout"
          class="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono border border-violet-700 hover:border-violet-400 text-violet-400 hover:text-violet-200 transition-colors"
          :title="`Generate ${matchedLayout.label} surface`"
        >
          <LayoutTemplate class="w-3 h-3" />
          Generate
        </button>

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
        <button @click="duplicatePreset" :disabled="!activePreset" class="p-1 text-neutral-500 hover:text-violet-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title="Duplicate preset">
          <Copy class="w-3.5 h-3.5" />
        </button>
        <button @click="savePresets" :disabled="saving" class="p-1 text-neutral-500 hover:text-emerald-400 transition-colors" title="Save presets">
          <Save class="w-3.5 h-3.5" />
        </button>
        <button @click="exportCsv" class="p-1 text-neutral-500 hover:text-cyan-400 transition-colors" title="Export presets as CSV">
          <Download class="w-3.5 h-3.5" />
        </button>
        <button @click="exportMappingCatalogCsv" class="p-1 text-neutral-500 hover:text-amber-400 transition-colors" title="Export mapping catalog (all actions & app params)">
          <Download class="w-3.5 h-3.5" />
        </button>

        <div class="w-px h-4 bg-neutral-700 mx-1" />

        <button @click="showMidiMappingList = !showMidiMappingList" class="p-1 text-neutral-500 hover:text-sky-400 transition-colors" title="List all MIDI mapped controls">
          <List class="w-3.5 h-3.5" />
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

        <div class="w-full flex">
        <!-- Simulate mode toggle -->
        <button
          @click="toggleSimulateMode"
          :class="[
            'flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-wider transition-colors',
            isSimulateMode
              ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400'
              : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-emerald-500/40 hover:text-emerald-400'
          ]"
          title="Toggle simulate mode — controls fire their assigned actions"
        >
          <Zap class="w-3 h-3" />
          Simulate
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

        

        <div class="w-px h-4 bg-neutral-700 mx-1" />

        <!-- MIDI monitor toggle -->
        <button
          @click="showMidiMonitor = !showMidiMonitor"
          :class="[
            'flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-wider transition-colors',
            showMidiMonitor
              ? 'bg-sky-500/20 border-sky-500/60 text-sky-400'
              : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-sky-500/40 hover:text-sky-400'
          ]"
          title="Toggle MIDI monitor"
        >
          <Activity class="w-3 h-3" />
          Monitor
        </button>

        <div class="w-px h-4 bg-neutral-700 mx-1" />

        <!-- Sweep mode toggle -->
        <button
          @click="showSweep = !showSweep"
          :class="[
            'flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-wider transition-colors',
            showSweep
              ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-400'
              : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-cyan-500/40 hover:text-cyan-400'
          ]"
          title="Sweep MIDI controls to auto-discover pads, sliders, and encoders"
        >
          <Radio class="w-3 h-3" />
          Sweep
        </button>

        <div class="w-px h-4 bg-neutral-700 mx-1" />

        <!-- Background reference image -->
        <input ref="bgImageInputRef" type="file" accept="image/*" class="hidden" @change="onBgImageFileChange" />
        <button
          @click="bgImageInputRef?.click()"
          class="flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-wider transition-colors bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-violet-500/40 hover:text-violet-400"
          title="Upload a reference image behind the controls"
        >
          <ImagePlus class="w-3 h-3" />
          Image
        </button>
        <button
          v-if="activePreset?.backgroundImage"
          @click="removeBgImage"
          class="p-1 text-neutral-500 hover:text-red-400 transition-colors"
          title="Remove background image"
        >
          <ImageOff class="w-3.5 h-3.5" />
        </button>
        </div>
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
              v-model="bulkColor"
              @input="bulkSetColor(bulkColor)"
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
          <div class="flex items-center gap-1">
            <span class="text-[9px] text-neutral-500">Type</span>
            <select
              @change="e => bulkSetType(e.target.value)"
              class="bg-neutral-800 border border-neutral-700 rounded text-[10px] text-neutral-300 px-1.5 py-0.5 focus:outline-none focus:border-amber-500"
            >
              <option value="">—</option>
              <option v-for="ct in CONTROL_TYPES" :key="ct.type" :value="ct.type">{{ ct.label }}</option>
            </select>
          </div>
          <div class="w-px h-4 bg-neutral-700" />
          <button @click="bulkDuplicate" class="p-1 text-neutral-500 hover:text-violet-400 transition-colors" title="Duplicate selected">
            <Plus class="w-3.5 h-3.5" />
          </button>
          <button @click="bulkDelete" class="p-1 text-neutral-500 hover:text-red-400 transition-colors" title="Delete selected">
            <Trash2 class="w-3.5 h-3.5" />
          </button>
          <div class="w-px h-4 bg-neutral-700" />
          <span class="text-[9px] text-neutral-500">Align</span>
          <button @click="alignLeft" class="text-[9px] text-neutral-400 hover:text-white transition-colors" title="Align left">L</button>
          <button @click="alignRight" class="text-[9px] text-neutral-400 hover:text-white transition-colors" title="Align right">R</button>
          <button @click="alignTop" class="text-[9px] text-neutral-400 hover:text-white transition-colors" title="Align top">T</button>
          <button @click="alignBottom" class="text-[9px] text-neutral-400 hover:text-white transition-colors" title="Align bottom">B</button>
        </template>
      </div>

      <!-- Simulate mode info strip -->
      <div
        v-if="isSimulateMode"
        class="flex items-center gap-2 px-3 py-1.5 bg-emerald-950/30 border-b border-emerald-800/30 shrink-0"
      >
        <Zap class="w-3 h-3 text-emerald-400 shrink-0" />
        <span class="text-[9px] text-emerald-400 font-bold uppercase tracking-wider">
          Simulate — interact with controls to fire assigned actions
        </span>
      </div>

      <!-- Canvas + Drawer row -->
      <div class="flex flex-1 overflow-hidden">

      <!-- Canvas -->
      <div
        ref="canvasRef"
        class="relative flex-1 overflow-auto custom-scrollbar bg-neutral-950"
        :class="isDesignMode ? 'cursor-default' : isSimulateMode ? 'cursor-pointer' : 'cursor-crosshair'"
        style="min-height: 300px"
        @mousedown="onCanvasMouseDown"
      >
        <!-- Grid dots -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="ctrl-grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.5" fill="#212121" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#ctrl-grid)" />
        </svg>

        <!-- Background reference image — sits below the controls layer -->
        <div
          v-if="activePreset?.backgroundImage"
          :style="{
            position: 'absolute',
            left: activePreset.backgroundImage.x + 'px',
            top: activePreset.backgroundImage.y + 'px',
            width: activePreset.backgroundImage.w + 'px',
            height: activePreset.backgroundImage.h + 'px',
            zIndex: 0,
          }"
          class="group/bgimg"
          @mousedown.stop="onBgImageMouseDown"
        >
          <img
            :src="activePreset.backgroundImage.url"
            draggable="false"
            class="w-full h-full object-contain select-none pointer-events-none"
            :class="isBgImageSelected ? 'outline outline-2 outline-violet-400/60' : ''"
          />
          <!-- Resize handle (bottom-right) -->
          <div
            v-if="isBgImageSelected && !isDesignMode"
            class="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize bg-violet-500/60 rounded-tl"
            @mousedown.stop="onBgImageResizeMouseDown"
          />
        </div>

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
                'w-full h-full rounded-lg border-2 flex items-center justify-center select-none transition-colors text-[9px] font-mono uppercase tracking-wider',
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
        v-if="showSweep"
        class="w-72 flex flex-col bg-neutral-950 border-l border-neutral-800 overflow-hidden shrink-0"
      >
        <MidiControlSweep @add="onSweepAdd" @close="showSweep = false" />
      </div>
      <div
        v-else-if="drawerControl"
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

          <!-- Pending assignment confirmation panel -->
          <template v-if="pendingAssignment">
            <div class="p-3 space-y-3">

              <!-- Selected item -->
              <div class="bg-violet-900/20 border border-violet-700/40 rounded-lg px-2.5 py-2">
                <p class="text-[9px] text-violet-300 font-bold leading-tight">{{ pendingAssignment.label }}</p>
              </div>

              <!-- Target channel (virtual instrument CC entries only) — the CC
                   table is shared across every channel of a multitimbral
                   instrument, so which channel a control actually targets is
                   chosen per-assignment, not baked into the CC table entry. -->
              <div v-if="isViCcSelected">
                <p class="text-[9px] text-neutral-500 uppercase tracking-widest mb-1.5">Target Channel</p>
                <select
                  v-model.number="viCcChannel"
                  class="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-[10px] font-mono text-neutral-200 outline-none focus:border-violet-500"
                >
                  <option v-for="ch in 16" :key="ch" :value="ch">CH {{ ch }}</option>
                </select>
              </div>

              <!-- Trigger mode (actions only, not continuous) -->
              <template v-if="pendingAssignment.type === 'action' && !isContinuousSelected">
                <div>
                  <p class="text-[9px] text-neutral-500 uppercase tracking-widest mb-1.5">Trigger on value</p>
                  <div class="flex flex-col gap-1">
                    <button
                      @click="triggerMode = 'any'"
                      :class="['px-2 py-1 rounded text-[9px] font-bold uppercase border transition-colors', triggerMode === 'any' ? 'bg-violet-500/20 border-violet-500/50 text-violet-300' : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-600']"
                    >Any &gt; 63</button>
                    <div class="flex items-center gap-1.5">
                      <button
                        @click="triggerMode = 'min'"
                        :class="['flex-1 px-2 py-1 rounded text-[9px] font-bold uppercase border transition-colors', triggerMode === 'min' ? 'bg-violet-500/20 border-violet-500/50 text-violet-300' : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-600']"
                      >Min ≥</button>
                      <input
                        type="number" min="1" max="127" :value="minValue"
                        @click.stop="triggerMode = 'min'"
                        @input="e => { triggerMode = 'min'; minValue = Math.max(1, Math.min(127, +e.target.value || 1)) }"
                        class="w-12 bg-black border border-neutral-600 rounded px-1 py-0.5 text-center text-violet-300 font-mono text-[9px] focus:outline-none focus:border-violet-400"
                      />
                    </div>
                    <div class="flex items-center gap-1.5">
                      <button
                        @click="triggerMode = 'exact'"
                        :class="['flex-1 px-2 py-1 rounded text-[9px] font-bold uppercase border transition-colors', triggerMode === 'exact' ? 'bg-violet-500/20 border-violet-500/50 text-violet-300' : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-600']"
                      >Exact =</button>
                      <input
                        type="number" min="0" max="127" :value="exactValue"
                        @click.stop="triggerMode = 'exact'"
                        @input="e => { triggerMode = 'exact'; exactValue = Math.max(0, Math.min(127, +e.target.value || 0)) }"
                        class="w-12 bg-black border border-neutral-600 rounded px-1 py-0.5 text-center text-violet-300 font-mono text-[9px] focus:outline-none focus:border-violet-400"
                      />
                    </div>
                  </div>
                </div>
              </template>
              <p v-else-if="isContinuousSelected" class="text-[9px] text-violet-400/70 font-mono">Continuous — full CC range</p>

              <!-- Consume -->
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="consume" class="w-3.5 h-3.5 accent-violet-500 rounded" />
                <span class="text-[9px] text-neutral-400 uppercase tracking-wider font-bold">Consume MIDI</span>
              </label>

              <!-- LED Feedback (actions only) -->
              <template v-if="pendingAssignment.type === 'action'">
                <div class="border-t border-neutral-800 pt-2">
                  <label class="flex items-center gap-2 cursor-pointer mb-2">
                    <input type="checkbox" v-model="hasFeedback" class="w-3.5 h-3.5 accent-violet-500 rounded" />
                    <span class="text-[9px] text-neutral-400 uppercase tracking-wider font-bold">LED Feedback</span>
                  </label>
                  <template v-if="hasFeedback">
                    <div class="grid grid-cols-2 gap-1.5 mb-1.5">
                      <div class="bg-black/40 rounded px-2 py-1 border border-neutral-700/50 flex items-center justify-between gap-1">
                        <span class="text-[8px] text-green-500 font-black uppercase">ON</span>
                        <input type="number" min="0" max="127" v-model.number="fbOn" class="w-10 bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 text-center text-[9px] font-mono text-white focus:border-green-500 outline-none" />
                      </div>
                      <div class="bg-black/40 rounded px-2 py-1 border border-neutral-700/50 flex items-center justify-between gap-1">
                        <span class="text-[8px] text-red-500 font-black uppercase">OFF</span>
                        <input type="number" min="0" max="127" v-model.number="fbOff" class="w-10 bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 text-center text-[9px] font-mono text-white focus:border-red-500 outline-none" />
                      </div>
                    </div>
                    <button
                      @click="testFeedback({ device: assignedDevice, note: drawerControl?.noteNumber, cc: drawerControl?.ccNumber, channel: (drawerControl?.channel ?? 1) - 1, feedbackOn: fbOn, feedbackOff: fbOff })"
                      class="w-full bg-neutral-800 border border-neutral-700 rounded py-1 text-[8px] font-black uppercase text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors"
                    >Test LED</button>
                  </template>
                </div>
              </template>

              <!-- Confirm / Cancel -->
              <div class="flex gap-1.5 pt-1">
                <button @click="cancelAssignment" class="flex-1 py-1.5 text-[9px] font-black uppercase tracking-wider bg-neutral-800 border border-neutral-700 rounded text-neutral-400 hover:text-white transition-colors">Cancel</button>
                <button @click="confirmAssignment" class="flex-1 py-1.5 text-[9px] font-black uppercase tracking-wider bg-violet-500 rounded text-white hover:bg-violet-400 transition-colors">Confirm</button>
              </div>
            </div>
          </template>

          <!-- MIDI Actions tab -->
          <template v-else-if="drawerTab === 'actions'">
            <template v-for="(actions, group) in actionGroups" :key="group">
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
                    isActionAssigned(drawerControl, action)
                      ? 'text-violet-400 bg-violet-900/20'
                      : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
                  ]"
                >{{ actionLabel(action, midiStore.virtualInstruments) }}</button>
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

      <!-- Preset settings drawer (shown when no control is selected) -->
      <div
        v-else
        class="w-56 flex flex-col bg-neutral-900 border-l border-neutral-800 overflow-hidden shrink-0"
      >
        <div class="px-3 py-2 border-b border-neutral-800 shrink-0">
          <span class="text-[9px] uppercase tracking-widest text-neutral-500 font-bold">Preset Settings</span>
        </div>
        <div class="flex flex-col gap-3 px-3 py-3 overflow-y-auto">
          <!-- Auto-generate layout -->
          <div v-if="matchedLayout" class="flex flex-col gap-1.5">
            <label class="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">Surface Template</label>
            <p class="text-[8px] text-neutral-500 leading-relaxed">{{ matchedLayout.label }} layout detected.</p>
            <button
              @click="generateLayout"
              class="self-start text-[9px] font-mono px-2.5 py-1 rounded border border-violet-700 hover:border-violet-400 text-violet-400 hover:text-violet-200 transition-colors"
            >Generate Layout</button>
            <p v-if="generateMessage" class="text-[8px] text-emerald-400">{{ generateMessage }}</p>
          </div>

          <!-- SysEx features hidden — code preserved, set v-if="true" to restore
          <div v-if="matchedLayout" class="w-full h-px bg-neutral-800" />
          <div class="flex flex-col gap-1.5">
            <label class="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">SysEx Dump Request</label>
            <textarea v-model="sysexInit" rows="2" placeholder="F0 43 20 00 F7"
              class="w-full text-[10px] font-mono bg-black/40 border border-neutral-700 rounded px-2 py-1.5 text-neutral-200 placeholder-neutral-600 resize-none focus:outline-none focus:border-violet-500 leading-relaxed" />
            <p class="text-[8px] text-neutral-600 leading-relaxed">Hex · 0x-prefixed · or decimal. Multi-line = multiple messages.</p>
            <div v-if="sysexInit" class="flex flex-col gap-1.5">
              <button v-if="assignedDevice" @click="handleSendSysEx" :disabled="captureActive"
                class="self-start text-[9px] font-mono px-2.5 py-1 rounded border border-neutral-700 hover:border-violet-500/60 hover:text-violet-400 text-neutral-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >{{ captureActive ? 'Listening…' : 'Send &amp; Capture' }}</button>
              <p v-else class="text-[8px] text-amber-500">Assign a device to enable Send.</p>
              <p v-if="sysexSendResult?.ok" class="text-[8px] text-emerald-400">Sent {{ sysexSendResult.sent }} message(s) — waiting for device response…</p>
              <p v-else-if="sysexSendResult && !sysexSendResult.ok" class="text-[8px] text-red-400">{{ sysexSendResult.error }}</p>
            </div>
          </div>
          <div v-if="capturedDump || captureActive" class="flex flex-col gap-1.5">
            <div class="flex items-center gap-1.5">
              <label class="text-[9px] font-mono text-neutral-400 uppercase tracking-wider">Captured Dump</label>
              <span v-if="captureActive" class="text-[8px] text-violet-400 animate-pulse">● listening</span>
              <span v-else-if="capturedDump" class="text-[8px] text-emerald-400">{{ capturedDump.split('\n').length }} msg(s)</span>
            </div>
            <textarea :value="capturedDump" readonly rows="4" placeholder="Waiting for device response…"
              class="w-full text-[9px] font-mono bg-black/60 border border-neutral-800 rounded px-2 py-1.5 text-emerald-300 placeholder-neutral-600 resize-none leading-relaxed" />
            <button v-if="capturedDump && !captureActive" @click="sysexInit = capturedDump; capturedDump = ''"
              class="self-start text-[9px] font-mono px-2.5 py-1 rounded border border-emerald-800 hover:border-emerald-500 text-emerald-500 hover:text-emerald-300 transition-colors"
            >Use as Init (auto-restore)</button>
          </div>
          -->
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
          <button
            v-for="c in COLOR_PALETTE" :key="c"
            @click="selectedControl.color = c; debouncedSave()"
            :style="{ background: c }"
            :class="[
              'w-4 h-4 rounded border-2 transition-all',
              selectedControl.color === c ? 'border-white scale-125' : 'border-transparent hover:border-neutral-400'
            ]"
          />
          <input
            type="color"
            :value="selectedControl.color"
            @input="e => { selectedControl.color = e.target.value; debouncedSave() }"
            class="w-4 h-4 rounded border border-neutral-700 cursor-pointer bg-transparent p-0"
            title="Custom color"
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

      <!-- MIDI monitor -->
      <div
        v-if="showMidiMonitor"
        class="shrink-0 border-t border-sky-900/40 bg-black/60 flex flex-col"
        style="max-height: 130px"
      >
        <div class="flex items-center justify-between px-3 py-1 border-b border-neutral-800 shrink-0">
          <div class="flex items-center gap-1.5">
            <Activity class="w-3 h-3 text-sky-400" />
            <span class="text-[9px] font-black uppercase tracking-widest text-sky-400">MIDI Monitor</span>
          </div>
          <button @click="midiLog = []" class="text-[8px] text-neutral-600 hover:text-neutral-300 uppercase tracking-wider">Clear</button>
        </div>
        <div class="overflow-y-auto flex-1 custom-scrollbar px-2 py-1 space-y-0.5">
          <div
            v-if="midiLog.length === 0"
            class="text-[9px] text-neutral-600 italic py-2 text-center"
          >Waiting for MIDI…</div>
          <div
            v-for="(entry, i) in midiLog"
            :key="i"
            class="flex items-center gap-2 font-mono text-[9px] leading-tight"
          >
            <span
              :class="[
                'shrink-0 px-1 rounded font-black uppercase text-[8px]',
                entry.type === 'cc'               ? 'bg-violet-900/60 text-violet-300' :
                entry.type?.startsWith('note')    ? 'bg-emerald-900/60 text-emerald-300' :
                                                    'bg-neutral-800 text-neutral-500'
              ]"
            >{{ entry.type }}</span>
            <span class="text-neutral-500 shrink-0">ch{{ entry.channel }}</span>
            <span class="text-neutral-300 truncate">{{ entry.decoded }}</span>
            <span class="text-neutral-600 truncate text-[8px]">{{ entry.device }}</span>
          </div>
        </div>
      </div>

      <!-- Resize handle -->
      <div
        class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-0 hover:opacity-100"
        @mousedown.stop="e => onResizeStart(e, 'se')"
      />
  </div>

  <MidiMapContextMenu />

  <MidiAppMappingList v-if="showMidiMappingList" @close="showMidiMappingList = false" />
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Cpu, Minus, X, Plus, Gamepad2, Save, Copy, Trash2, LayoutTemplate, GripHorizontal, ChevronDown, MousePointer2, Zap, Activity, Radio, Download, List, ImagePlus, ImageOff } from 'lucide-vue-next'
import { useUiStore }            from '@/stores/useUiStore'
import { useMidiStore }          from '@/stores/useMidiStore'
import { useMappingStore }       from '@/stores/useMappingStore'
import { useAuthStore }          from '@/stores/useAuthStore'
import { midiService }           from '@/core/midi/midi-service'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import { useMidiContextMenu }    from '@/composables/useMidiContextMenu'
import MidiMapContextMenu        from '@/components/ui/MidiMapContextMenu.vue'
import MidiControlSweep          from '@/components/MidiControlSweep.vue'
import MidiAppMappingList       from '@/components/ui/MidiAppMappingList.vue'
import {
  loadControllerPresets,
  persistControllerPresets,
  createControllerPreset,
  createControl,
} from '@/lib/midi-controller-presets'
import { MIDI_ACTION_GROUPS, isContinuousAction, actionLabel, parseViCcAction } from '@/lib/app-midi-actions'
import { findLayoutForDevice } from '@/lib/controller-layout-library'
import { useMidiFeedback } from '@/composables/useMidiFeedback'
import { applyParamValue } from '@/composables/useMidiCCListener'
import { useAppActions } from '@/composables/useAppActions'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'

const uiStore      = useUiStore()
const midiStore    = useMidiStore()
const mappingStore = useMappingStore()
const authStore    = useAuthStore()
const uid          = computed(() => authStore.user?.uid)
const { openMenu } = useMidiContextMenu()
const { testFeedback } = useMidiFeedback()
const { dispatchAction } = useAppActions()

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } =
  useDraggableResizable({
    storageKey:    'SYCORE_MIDI_CTRL_DESIGNER',
    initialWidth:  800,
    initialHeight: 560,
    minWidth:      480,
    minHeight:     320,
    minimizeLabel: 'Controller Designer',
    openRef:       () => uiStore.isMidiControllerDesignerOpen,
    panelId:       'controller-designer',
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
const bulkColor     = ref(COLOR_PALETTE[0])
const drawerTab = ref('actions')

const _DM_TRACKS = ['Kick', 'Snare', 'Closed HH', 'Open HH', 'Clap', 'Tom 1', 'Tom 2', 'Cymbal']

const APP_SECTIONS = [
  {
    key: 'audio_mixer', label: 'Audio Mixer',
    items: [
      { action: 'toggle_audio_mixer',    label: 'Toggle Audio Mixer' },
      { action: 'mixer_master_volume_cc', label: 'Master Volume via CC' },
    ],
  },
  {
    key: 'backing_tracks', label: 'Backing Tracks',
    items: [
      { action: 'open_tracks_player', label: 'Toggle Tracks Library' },
    ],
  },
  {
    key: 'chord', label: 'Chord Prog Sequencer',
    items: [
      { action: 'open_chord_prog', label: 'Toggle Chord Prog' },
      { action: 'seq_play',        label: 'Play' },
      { action: 'seq_stop',        label: 'Stop' },
      { action: 'seq_gen_trigger', label: 'Generate' },
      { action: 'seq_select_1',    label: 'Select Seq 1' },
      { action: 'seq_select_2',    label: 'Select Seq 2' },
      { action: 'seq_bpm_cc',      label: 'BPM via CC' },
    ],
  },
  {
    key: 'cockpit_nav', label: 'DECK Navigation',
    items: [
      { paramName: 'cockpit_nav_next_zone',    label: 'Next Zone' },
      { paramName: 'cockpit_nav_prev_zone',    label: 'Prev Zone' },
      { paramName: 'cockpit_nav_zone_encoder', label: 'Zone Encoder' },
      { paramName: 'cockpit_nav_next_item',    label: 'Next Item' },
      { paramName: 'cockpit_nav_prev_item',    label: 'Prev Item' },
      { paramName: 'cockpit_nav_item_encoder', label: 'Item Encoder' },
      { paramName: 'cockpit_nav_select',       label: 'Select' },
    ],
  },
  {
    key: 'dm', label: 'Drum Machine',
    items: [
      { action: 'open_drum_machine', label: 'Toggle Drum Machine' },
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
    key: 'lpp', label: 'Live Performance Pad',
    items: [
      { action: 'open_lpp', label: 'Toggle Live Pad' },
      ...Array.from({ length: 16 }, (_, i) => ({ paramName: `lpp_set_${i}`,  label: `Set Pad ${i + 1}` })),
      ...Array.from({ length: 8 },  (_, i) => ({ paramName: `lpp_loop_${i}`, label: `Loop Pad ${i + 1}` })),
      ...Array.from({ length: 8 },  (_, i) => ({ paramName: `lpp_bt_${i}`,   label: `BT Pad ${i + 1}` })),
      { paramName: 'lpp_playstop', label: 'Play / Stop' },
    ],
  },
  {
    key: 'live_timeline', label: 'Live Timeline',
    items: [
      { action: 'open_live_timeline', label: 'Toggle Live Timeline' },
    ],
  },
  {
    key: 'loop_machine', label: 'Loop Machine',
    items: [
      { action: 'open_loop_machine', label: 'Toggle Samples Machine' },
      ...Array.from({ length: 24 }, (_, i) => ({ paramName: `lm_pad_${i}`, label: `Pad ${i + 1}` })),
      ...Array.from({ length: 24 }, (_, i) => ({ paramName: `lm_vol_${i}`, label: `Vol ${i + 1}` })),
    ],
  },
  {
    key: 'menu', label: 'Main Menu',
    items: [
      { action: 'toggle_main_menu', label: 'Toggle Main Menu' },
    ],
  },
  {
    key: 'sampler', label: 'Sampler',
    items: [
      { action: 'open_sampler', label: 'Toggle Sampler' },
      ...['A','B','C','D','E','F','G','H'].map(b => ({ paramName: `sampler_bank_${b}`, label: `Bank ${b}` })),
      ...Array.from({ length: 7 }, (_, i) => ({ paramName: `sampler_pad_${i}`, label: `Pad ${i + 1}` })),
    ],
  },
  {
    key: 'transport', label: 'Transport',
    items: [
      { action: 'transport_play_all', label: 'Play All (Synced)' },
      { action: 'transport_stop_all', label: 'Stop All' },
    ],
  },
]

const collapsedActions = ref(new Set(Object.keys(MIDI_ACTION_GROUPS)))
const collapsedApp     = ref(new Set(APP_SECTIONS.map(s => s.key)))

// MIDI_ACTION_GROUPS plus one dynamic group per virtual instrument that has a
// named CC table — those entries can't be pre-declared as static AppAction
// literals since instruments/tables are user-defined and open-ended.
const actionGroups = computed(() => {
  const groups = { ...MIDI_ACTION_GROUPS }
  midiStore.virtualInstruments.forEach(vi => {
    if (vi.ccTable?.length) {
      groups[`Virtual: ${vi.name}`] = vi.ccTable.map(row => `vi_cc:${vi.name}:${row.cc}`)
    }
  })
  return groups
})

// Pending assignment — set when user clicks an action/param, confirmed before saving
const pendingAssignment = ref(null) // { type: 'action'|'param', action?, paramName?, paramLabel?, label }
const triggerMode       = ref('any')
const exactValue        = ref(127)
const minValue          = ref(1)
const consume           = ref(true)
const hasFeedback       = ref(false)
const fbOn              = ref(127)
const fbOff             = ref(0)
const viCcChannel       = ref(1) // 1-16 display; the channel a vi_cc: assignment will send on

const isContinuousSelected = computed(() =>
  pendingAssignment.value?.action != null && isContinuousAction(pendingAssignment.value.action)
)

const isViCcSelected = computed(() =>
  pendingAssignment.value?.action != null && parseViCcAction(pendingAssignment.value.action) != null
)

const selectedControlId = ref(null)
const canvasRef         = ref(null)
const bgImageInputRef   = ref(null)
const isBgImageSelected = ref(false)
const isDesignMode      = ref(false)
const isSimulateMode    = ref(false)
const showMidiMonitor   = ref(false)
const showSweep              = ref(false)
const showMidiMappingList    = ref(false)
const midiLog           = ref([])   // max 40 entries, newest first
const selectedIds       = ref(new Set())
const lassoStart        = ref(null)
const lassoEnd          = ref(null)
const _sweepCol         = ref(0)
const _sweepRow         = ref(0)
const _sweepBaseY       = ref(0)

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

const enabledPresets = computed(() =>
  presets.value.filter(p => uiStore.enabledControllerDesignerPresetIds.includes(p.id))
)
const assignedDevice = computed({
  get: () => activePreset.value?.assignedDevice ?? '',
  set: (v) => { if (activePreset.value) { activePreset.value.assignedDevice = v; debouncedSave() } },
})
const sysexInit = computed({
  get: () => activePreset.value?.sysexInit ?? '',
  set: (v) => { if (activePreset.value) { activePreset.value.sysexInit = v || undefined; debouncedSave() } },
})
const matchedLayout = computed(() => assignedDevice.value ? findLayoutForDevice(assignedDevice.value) : null)
const generateMessage = ref('')

function generateLayout() {
  if (!activePreset.value || !matchedLayout.value) return
  const layout = matchedLayout.value
  if (controls.value.length > 0) {
    if (!confirm(`Replace ${controls.value.length} existing control(s) with the ${layout.label} template?`)) return
  }
  activePreset.value.controls = layout.controls
  debouncedSave()
  generateMessage.value = `Generated ${layout.controls.length} controls`
  setTimeout(() => { generateMessage.value = '' }, 3000)
}

const sysexSendResult = ref(null) // null | { ok: boolean, error?: string, sent?: number }
const captureActive = ref(false)
const capturedDump = ref('') // hex lines, one SysEx message per line
let _sysexResultTimer = null
let _stopSysexCapture = null
let _captureTimer = null

function startSysexCapture(deviceName) {
  if (_stopSysexCapture) { _stopSysexCapture(); _stopSysexCapture = null }
  if (_captureTimer) { clearTimeout(_captureTimer); _captureTimer = null }
  captureActive.value = true
  const received = []

  function finish() {
    if (_stopSysexCapture) { _stopSysexCapture(); _stopSysexCapture = null }
    if (_captureTimer) { clearTimeout(_captureTimer); _captureTimer = null }
    captureActive.value = false
    capturedDump.value = received.join('\n')
  }

  function resetSilenceTimer() {
    if (_captureTimer) clearTimeout(_captureTimer)
    _captureTimer = setTimeout(finish, 700)
  }

  // Max 15s regardless
  const maxTimer = setTimeout(finish, 15000)

  _stopSysexCapture = midiService.addMonitorListener((entry) => {
    if (entry.direction !== 'in' || entry.type !== 'sysex') return
    if (entry.device !== deviceName) return
    const hex = entry.data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
    received.push(hex)
    resetSilenceTimer()
  })

  resetSilenceTimer()
  return () => { clearTimeout(maxTimer); finish() }
}

async function handleSendSysEx() {
  if (!sysexInit.value || !assignedDevice.value) return
  if (_sysexResultTimer) clearTimeout(_sysexResultTimer)
  sysexSendResult.value = null
  capturedDump.value = ''
  // Start capture before sending so we don't miss a fast response
  startSysexCapture(assignedDevice.value)
  const result = await midiService.sendSysEx(assignedDevice.value, sysexInit.value)
  sysexSendResult.value = result
  if (!result.ok) {
    captureActive.value = false
    if (_stopSysexCapture) { _stopSysexCapture(); _stopSysexCapture = null }
  }
  _sysexResultTimer = setTimeout(() => { sysexSendResult.value = null }, 5000)
}
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

watch(drawerControl, () => { pendingAssignment.value = null })

watch(activePresetId, () => {
  const preset = activePreset.value
  if (preset?.sysexInit && preset.assignedDevice) {
    midiService.sendSysEx(preset.assignedDevice, preset.sysexInit).then(r => {
      if (!r.ok) console.warn('[SysEx auto-init] Failed:', r.error)
    })
  }
})

watch(showSweep, (on) => { if (!on) { _sweepCol.value = 0; _sweepRow.value = 0; _sweepBaseY.value = 0 } })

watch(showMidiMonitor, (on) => {
  if (on) {
    midiLog.value = []
    _removeMonitorListener = midiService.addMonitorListener((entry) => {
      if (entry.direction !== 'in') return
      if (entry.type === 'clock') return
      midiLog.value.unshift(entry)
      if (midiLog.value.length > 40) midiLog.value.length = 40
    })
  } else {
    _removeMonitorListener?.()
    _removeMonitorListener = null
    midiLog.value = []
  }
})

// When MIDI Learn completes for a designer control (via context menu), the learned
// CC/Note is stored in mappingStore.midiMappings but ctrl.ccNumber is never updated.
// Back-propagate so onIncomingCC/onIncomingNote can match the control.
watch(() => mappingStore.lastMappedParam, (paramName) => {
  if (!paramName?.startsWith('ctrl_designer_')) return
  const ctrl = controls.value.find(c => ctrlParamName(c) === paramName)
  if (!ctrl) return
  const mapping = Object.values(mappingStore.midiMappings).find(m => {
    const name = typeof m === 'object' ? m.paramName : m
    return name === paramName
  })
  if (!mapping || typeof mapping !== 'object') return
  if (mapping.cc != null) {
    ctrl.ccNumber   = mapping.cc
    ctrl.noteNumber = undefined
    ctrl.channel    = (mapping.channel ?? 0) + 1
  } else if (mapping.note != null) {
    ctrl.noteNumber = mapping.note
    ctrl.ccNumber   = undefined
    ctrl.channel    = (mapping.channel ?? 0) + 1
  }
  debouncedSave()
})

function ctrlParamName(ctrl) {
  return `ctrl_designer_${ctrl.id}`
}

// ─── Presets ──────────────────────────────────────────────────────────────────

watch(uid, async (newUid) => {
  if (!newUid) {
    const p = createControllerPreset('Default')
    presets.value = [p]
    activePresetId.value = p.id
    uiStore.enabledControllerDesignerPresetIds = [p.id]
    return
  }
  const loaded = await loadControllerPresets()
  if (loaded.length > 0) {
    presets.value = loaded
    activePresetId.value = loaded[0].id
    // Enable any presets that don't have an enabled state yet (first-time load)
    if (uiStore.enabledControllerDesignerPresetIds.length === 0) {
      uiStore.enabledControllerDesignerPresetIds = loaded.map(p => p.id)
    }
  } else {
    const p = createControllerPreset('Default')
    presets.value = [p]
    activePresetId.value = p.id
    uiStore.enabledControllerDesignerPresetIds = [p.id]
  }
}, { immediate: true })

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
  if (!uiStore.enabledControllerDesignerPresetIds.includes(p.id)) {
    uiStore.enabledControllerDesignerPresetIds.push(p.id)
  }
  debouncedSave()
}

function duplicatePreset() {
  if (!activePreset.value) return
  const name = prompt('Duplicate preset name:', activePreset.value.name + ' (copy)')
  if (!name) return
  const p = createControllerPreset(name, {
    assignedDevice: activePreset.value.assignedDevice,
    controls: activePreset.value.controls.map(c => ({ ...c, id: Math.random().toString(36).slice(2, 11) })),
  })
  presets.value.push(p)
  activePresetId.value = p.id
  if (!uiStore.enabledControllerDesignerPresetIds.includes(p.id)) {
    uiStore.enabledControllerDesignerPresetIds.push(p.id)
  }
  debouncedSave()
}

function deletePreset() {
  if (!activePreset.value) return
  if (activePreset.value.name === 'Default') return
  if (!confirm(`Delete preset "${activePreset.value.name}"?`)) return
  const id = activePreset.value.id
  const idx = presets.value.findIndex(p => p.id === id)
  if (idx === -1) return
  presets.value.splice(idx, 1)
  uiStore.enabledControllerDesignerPresetIds = uiStore.enabledControllerDesignerPresetIds.filter(pid => pid !== id)
  activePresetId.value = presets.value[0]?.id ?? ''
}

// ─── Canvas interaction ───────────────────────────────────────────────────────

function onCanvasMouseDown(e) {
  if (e.button !== 0) return
  if (isSimulateMode.value) return
  isBgImageSelected.value = false
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
  isBgImageSelected.value = false
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

// Background reference image — move/resize, separate from _dragging/_multiDrag
// above since it isn't a control and never belongs to selectedIds.
let _imgDragging = null

function onBgImageMouseDown(e) {
  if (e.button !== 0) return
  if (isSimulateMode.value) return
  const img = activePreset.value?.backgroundImage
  if (!img) return
  selectedControlId.value = null
  isBgImageSelected.value = true
  _imgDragging = {
    img,
    startX: e.clientX - img.x,
    startY: e.clientY - img.y,
    mode: 'move',
  }
  e.preventDefault()
}

function onBgImageResizeMouseDown(e) {
  const img = activePreset.value?.backgroundImage
  if (!img) return
  _imgDragging = {
    img,
    startX: e.clientX,
    startY: e.clientY,
    startW: img.w,
    startH: img.h,
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
  if (_imgDragging) {
    const { img, mode } = _imgDragging
    if (mode === 'move') {
      img.x = Math.max(0, Math.round((e.clientX - _imgDragging.startX) / 10) * 10)
      img.y = Math.max(0, Math.round((e.clientY - _imgDragging.startY) / 10) * 10)
    } else if (mode === 'resize') {
      img.w = Math.max(40, Math.round((_imgDragging.startW + e.clientX - _imgDragging.startX) / 10) * 10)
      img.h = Math.max(40, Math.round((_imgDragging.startH + e.clientY - _imgDragging.startY) / 10) * 10)
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
  if (_multiDrag)   { _multiDrag   = null; debouncedSave(); return }
  if (_imgDragging) { _imgDragging = null; debouncedSave(); return }
  if (_dragging)    { _dragging    = null; debouncedSave() }
}

function onBgImageFileChange(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file || !activePreset.value) return
  const reader = new FileReader()
  reader.onload = () => {
    activePreset.value.backgroundImage = {
      url: reader.result,
      x: 0,
      y: 0,
      w: 300,
      h: 200,
    }
    debouncedSave()
  }
  reader.readAsDataURL(file)
}

function removeBgImage() {
  if (!activePreset.value) return
  activePreset.value.backgroundImage = undefined
  isBgImageSelected.value = false
  debouncedSave()
}

let _removeCCListener      = null
let _removeNoteListener    = null
let _removeMonitorListener = null

function applyIncoming(ctrl, isHigh, velocity = 127) {
  if (ctrl.type === 'pad-switch') {
    ctrl.value = isHigh ? 127 : 0
  } else if (ctrl.type === 'pad-momentary') {
    ctrl.value = isHigh ? velocity : 0
  } else {
    ctrl.value = velocity
  }
}

function fireAssignment(ctrl) {
  if (!ctrl.assignment) return
  const { type, action, paramName } = ctrl.assignment
  if (type === 'midi-action') dispatchAction(action, ctrl.value)
  else if (type === 'app-param') applyParamValue(paramName, ctrl.value)
}

function resolveInputName(inputId) {
  return midiService.getInputs().find(i => i.id === inputId)?.name ?? null
}

function onIncomingCC(cc, val, chan, inputId) {
  const inputName = resolveInputName(inputId)
  for (const preset of enabledPresets.value) {
    for (const ctrl of preset.controls) {
      if (ctrl.ccNumber !== cc) continue
      const ctrlCh = (ctrl.channel ?? 1) - 1
      if (ctrlCh !== chan) continue
      if (preset.assignedDevice && inputName && inputName !== preset.assignedDevice) continue
      applyIncoming(ctrl, val > 0, val)
      fireAssignment(ctrl)
    }
  }
}

function onIncomingNote(type, note, velocity, chan, inputId) {
  const inputName = resolveInputName(inputId)
  const isOn = type === 'on' && velocity > 0
  for (const preset of enabledPresets.value) {
    for (const ctrl of preset.controls) {
      if (ctrl.noteNumber !== note) continue
      const ctrlCh = (ctrl.channel ?? 1) - 1
      if (ctrlCh !== chan) continue
      if (preset.assignedDevice && inputName && inputName !== preset.assignedDevice) continue
      applyIncoming(ctrl, isOn, velocity)
      fireAssignment(ctrl)
    }
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
  if (_removeCCListener)      _removeCCListener()
  if (_removeNoteListener)    _removeNoteListener()
  if (_removeMonitorListener) _removeMonitorListener()
  clearTimeout(_saveTimer)
})

// ─── Control interactions ─────────────────────────────────────────────────────

function togglePadSwitch(ctrl) {
  ctrl.value = ctrl.value ? 0 : 127
  sendControl(ctrl, ctrl.value)
  simulateCtrl(ctrl, ctrl.value)
  debouncedSave()
}

function onPadMomentaryDown(ctrl) {
  ctrl.value = 127
  sendControl(ctrl, 127)
  simulateCtrl(ctrl, 127)
}
function onPadMomentaryUp(ctrl) {
  if (!ctrl.value) return
  ctrl.value = 0
  sendControl(ctrl, 0)
  simulateCtrl(ctrl, 0)
}

function onSliderInput(ctrl, e) {
  ctrl.value = +e.target.value
  sendControl(ctrl, ctrl.value)
  simulateCtrl(ctrl, ctrl.value)
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
    sendControl(_encoderDrag.ctrl, _encoderDrag.ctrl.value)
    simulateCtrl(_encoderDrag.ctrl, _encoderDrag.ctrl.value)
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

// Picker options for a vi_cc: entry are channel-less, but a confirmed
// assignment has a channel appended — compare by instrument+cc so the
// picker still highlights the right entry regardless of which channel
// was chosen for it.
function isActionAssigned(ctrl, action) {
  const assigned = ctrl.assignment?.action
  if (!assigned) return false
  if (assigned === action) return true
  const viCc = parseViCcAction(action)
  const assignedViCc = parseViCcAction(assigned)
  return !!viCc && !!assignedViCc && viCc.instrumentName === assignedViCc.instrumentName && viCc.cc === assignedViCc.cc
}

function assignToMidiAction(ctrl, action) {
  if (!ctrl) return
  pendingAssignment.value = {
    type: 'action',
    action,
    label: `Action: ${actionLabel(action, midiStore.virtualInstruments)}`,
  }
  triggerMode.value = 'any'
  exactValue.value  = 127
  minValue.value    = 1
  consume.value     = true
  hasFeedback.value = false

  const viCc = parseViCcAction(action)
  if (viCc) {
    // Default to the currently-assigned channel if re-picking the same base
    // entry, else the instrument's own configured channel.
    const existing = parseViCcAction(ctrl.assignment?.action ?? '')
    const sameEntry = existing && existing.instrumentName === viCc.instrumentName && existing.cc === viCc.cc
    const vi = midiStore.virtualInstruments.find(v => v.name === viCc.instrumentName)
    viCcChannel.value = (sameEntry && existing.channel != null ? existing.channel : (vi?.channel ?? 0)) + 1
  }
}

function assignToAppParam(ctrl, paramName, paramLabel) {
  if (!ctrl) return
  pendingAssignment.value = {
    type: 'param',
    paramName,
    paramLabel,
    label: `→ ${paramLabel}`,
  }
  consume.value     = true
  hasFeedback.value = false
}

function confirmAssignment() {
  const ctrl = drawerControl.value
  if (!ctrl || !pendingAssignment.value) return
  const pa = pendingAssignment.value

  if (pa.type === 'action') {
    // vi_cc: entries carry the target channel as part of the action id itself
    // (chosen via the Target Channel selector), appended only now — the
    // picker list stays channel-less since one CC table is shared across a
    // multitimbral instrument's channels.
    const finalAction = isViCcSelected.value ? `${pa.action}:${viCcChannel.value - 1}` : pa.action
    const finalLabel = isViCcSelected.value
      ? `Action: ${actionLabel(finalAction, midiStore.virtualInstruments)}`
      : pa.label
    if (ctrl.ccNumber != null || ctrl.noteNumber != null) {
      const stableId = `designer_ctrl_${ctrl.id}`
      const ch = (ctrl.channel ?? 1) - 1
      const isNote = ctrl.noteNumber != null
      const isContinuous = isContinuousAction(finalAction)
      const mappingValue = isContinuous ? -1 : (triggerMode.value === 'exact' ? exactValue.value : -1)
      // Filter out any previous entry for this control (by stable ID or same device+cc/note)
      const existing = mappingStore.appMidiMappings.filter(m => {
        if (m.id === stableId) return false
        const mDev = (m.device || '').toLowerCase()
        const aDev = (assignedDevice.value || '').toLowerCase()
        if (mDev !== aDev) return true
        return isNote ? m.note !== ctrl.noteNumber : m.cc !== ctrl.ccNumber
      })
      existing.push({
        id: stableId,
        device: assignedDevice.value, // '' matches any device in useControllerManager
        ...(isNote ? { note: ctrl.noteNumber } : { cc: ctrl.ccNumber }),
        channel: ch,
        value: mappingValue,
        minValue: (!isContinuous && triggerMode.value === 'min') ? minValue.value : undefined,
        action: finalAction,
        feedbackOn:  hasFeedback.value ? fbOn.value  : undefined,
        feedbackOff: hasFeedback.value ? fbOff.value : undefined,
        consume: consume.value,
      })
      mappingStore.saveAppMidiMappings(existing)
    }
    ctrl.assignment = { type: 'midi-action', action: finalAction, label: finalLabel }
  } else {
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
      mappingStore.confirmLearn(pa.paramName)
    }
    ctrl.assignment = { type: 'app-param', paramName: pa.paramName, label: pa.label }
  }

  pendingAssignment.value = null
  debouncedSave()
}

function cancelAssignment() {
  pendingAssignment.value = null
}

function _removeCtrlFromAppMappings(ctrl) {
  const stableId = `designer_ctrl_${ctrl.id}`
  const filtered = mappingStore.appMidiMappings.filter(m => m.id !== stableId)
  if (filtered.length !== mappingStore.appMidiMappings.length) {
    mappingStore.saveAppMidiMappings(filtered)
  }
}

function clearAssignment(ctrl) {
  if (!ctrl) return
  _removeCtrlFromAppMappings(ctrl)
  ctrl.assignment = undefined
  debouncedSave()
}

// ─── Simulate mode ────────────────────────────────────────────────────────────

function simulateCtrl(ctrl, value) {
  if (!isSimulateMode.value || !ctrl?.assignment) return
  const { type, action, paramName } = ctrl.assignment
  if (type === 'midi-action') {
    dispatchAction(action, value)
  } else if (type === 'app-param') {
    applyParamValue(paramName, value)
  }
}

function toggleSimulateMode() {
  isSimulateMode.value = !isSimulateMode.value
  if (isSimulateMode.value) {
    isDesignMode.value = false
    selectedIds.value  = new Set()
    selectedControlId.value = null
  }
}

// ─── Design mode ──────────────────────────────────────────────────────────────

function toggleDesignMode() {
  isDesignMode.value = !isDesignMode.value
  if (isDesignMode.value) isSimulateMode.value = false
  selectedIds.value  = new Set()
  selectedControlId.value = null
}

function onDesignMouseDown(e, ctrl) {
  if (e.button !== 0) return
  isBgImageSelected.value = false
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

function bulkSetType(type) {
  for (const ctrl of controls.value) {
    if (selectedIds.value.has(ctrl.id)) ctrl.type = type
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
  const toDelete = controls.value.filter(c => selectedIds.value.has(c.id))
  toDelete.forEach(_removeCtrlFromAppMappings)
  activePreset.value.controls = activePreset.value.controls.filter(c => !selectedIds.value.has(c.id))
  selectedIds.value = new Set()
  debouncedSave()
}

function _selectedControls() {
  return controls.value.filter(c => selectedIds.value.has(c.id))
}

function alignLeft() {
  const sel = _selectedControls()
  if (sel.length < 2) return
  const minX = Math.min(...sel.map(c => c.x))
  sel.forEach(c => c.x = minX)
  debouncedSave()
}

function alignRight() {
  const sel = _selectedControls()
  if (sel.length < 2) return
  const maxRight = Math.max(...sel.map(c => c.x + c.w))
  sel.forEach(c => c.x = maxRight - c.w)
  debouncedSave()
}

function alignTop() {
  const sel = _selectedControls()
  if (sel.length < 2) return
  const minY = Math.min(...sel.map(c => c.y))
  sel.forEach(c => c.y = minY)
  debouncedSave()
}

function alignBottom() {
  const sel = _selectedControls()
  if (sel.length < 2) return
  const maxBottom = Math.max(...sel.map(c => c.y + c.h))
  sel.forEach(c => c.y = maxBottom - c.h)
  debouncedSave()
}

// ─── Editing ──────────────────────────────────────────────────────────────────

function deleteSelected() {
  if (!activePreset.value || !selectedControlId.value) return
  const ctrl = controls.value.find(c => c.id === selectedControlId.value)
  if (ctrl) _removeCtrlFromAppMappings(ctrl)
  activePreset.value.controls = activePreset.value.controls.filter(c => c.id !== selectedControlId.value)
  selectedControlId.value = null
  debouncedSave()
}

function clearCanvas() {
  if (!activePreset.value) return
  if (!confirm('Clear all controls?')) return
  controls.value.forEach(_removeCtrlFromAppMappings)
  activePreset.value.controls = []
  selectedControlId.value = null
  debouncedSave()
}

function onSweepAdd(ctrl) {
  if (!activePreset.value) return

  if (_sweepBaseY.value === 0) {
    let lowest = 10
    for (const c of controls.value) {
      const bottom = c.y + c.h
      if (bottom > lowest) lowest = bottom
    }
    _sweepBaseY.value = lowest
  }

  ctrl.x = 10 + _sweepCol.value * (ctrl.w + 10)
  ctrl.y = _sweepBaseY.value + 10 + _sweepRow.value * (ctrl.h + 10)

  activePreset.value.controls.push(ctrl)
  selectedControlId.value = ctrl.id
  selectedTool.value = ctrl.type

  _sweepCol.value++
  if (_sweepCol.value >= 8) {
    _sweepCol.value = 0
    _sweepRow.value++
  }

  debouncedSave()
}

function exportCsv() {
  const BOM = '\uFEFF'
  const rows = [['Preset','Assigned Device','Control ID','Type','Label','X','Y','Width','Height','Color','CC','Note','Channel','Assignment Type','Assignment Action','Assignment Param','Assignment Label']]
  for (const preset of presets.value) {
    for (const ctrl of preset.controls) {
      rows.push([
        preset.name,
        preset.assignedDevice ?? '',
        ctrl.id,
        ctrl.type,
        ctrl.label,
        ctrl.x,
        ctrl.y,
        ctrl.w,
        ctrl.h,
        ctrl.color,
        ctrl.ccNumber ?? '',
        ctrl.noteNumber ?? '',
        ctrl.channel ?? 1,
        ctrl.assignment?.type ?? '',
        ctrl.assignment?.action ?? '',
        ctrl.assignment?.paramName ?? '',
        ctrl.assignment?.label ?? '',
      ])
    }
  }
  const csv = BOM + rows.map(r => r.map(v => String(v).replace(/"/g, '""')).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'midi-controller-presets.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function exportMappingCatalogCsv() {
  const BOM = '\uFEFF'
  const rows = [['Type','Section','Action / Param Name','Label','Continuous']]

  for (const [group, actions] of Object.entries(actionGroups.value)) {
    for (const action of actions) {
      rows.push([
        'Action',
        group,
        action,
        actionLabel(action, midiStore.virtualInstruments),
        isContinuousAction(action) ? 'Yes' : '',
      ])
    }
  }

  for (const section of APP_SECTIONS) {
    for (const item of section.items) {
      const name = item.action ?? item.paramName ?? ''
      rows.push([
        item.action ? 'Action' : 'App Param',
        section.label,
        name,
        item.label,
        item.action && isContinuousAction(item.action) ? 'Yes' : '',
      ])
    }
  }

  const csv = BOM + rows.map(r => r.map(v => String(v).replace(/"/g, '""')).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'midi-mapping-catalog.csv'
  a.click()
  URL.revokeObjectURL(url)
}
</script>
