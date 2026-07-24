<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { Bell, Users, Clock, Send, Image, X, RefreshCw, Download, Upload, CheckCircle2, XCircle, AlertCircle } from 'lucide-vue-next'
import { usePushNotifications } from '@/composables/usePushNotifications'
import { useDraggableResizable } from '@/composables/useDraggableResizable'
import { useUiStore } from '@/stores/useUiStore'
import MacOsButtons from '@/components/ui/MacOsButtons.vue'

const emit = defineEmits(['close'])
const uiStore = useUiStore()

const {
  isSubscribed, permissionState, isSupported, isSuperAdmin,
  apiAvailable,
  subscribers, subscribe, unsubscribe,
  sendPush, sendToAll,
  fetchSubscribers, removeSubscriber, exportSubscribers,
  sentNotifications, fetchSentNotifications,
  uploadImage,
} = usePushNotifications()

const { panelStyle, onDragStart, onResizeStart, isMinimized, toggleMinimize, bringToFront, maximize } =
  useDraggableResizable({
    storageKey:    'S1_PUSH_NOTIFS_DR',
    minimizeLabel: 'Push Notifications',
    openRef:       () => uiStore.isPushNotificationsOpen,
    initialWidth:  700,
    initialHeight: 580,
    minWidth:      420,
    minHeight:     400,
    zIndex:        200,
    panelId:       'push-notifications',
  })

// ── Tabs ─────────────────────────────────────────────────────────────────────

const activeTab = ref('compose')

const tabs = computed(() => [
  { id: 'compose',     label: 'Compose',     icon: Send  },
  { id: 'subscribers', label: `Subscribers`, icon: Users, badge: subscribers.value.length || null },
  { id: 'sent',        label: 'Sent',        icon: Clock, badge: sentNotifications.value.length || null },
])

watch(activeTab, (tab) => {
  if (tab === 'subscribers') fetchSubscribers()
  if (tab === 'sent')        fetchSentNotifications()
})

// ── Compose form ──────────────────────────────────────────────────────────────

const pushTitle    = ref('')
const pushBody     = ref('')
const pushImageUrl = ref('')
const pushUrl      = ref('')
const isSending    = ref(false)
const sendResult   = ref(null) // { sent, failed, total } | null
const imagePreviewOk = ref(true)

const fileInputRef  = ref(null)
const isUploading   = ref(false)
const uploadError   = ref('')

async function onFileSelect(e) {
  const file = e.target.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) { uploadError.value = 'Only image files allowed'; return }
  if (file.size > 1.5 * 1024 * 1024) { uploadError.value = 'File too large (max 1.5 MB)'; return }

  uploadError.value = ''
  isUploading.value = true
  try {
    const url = await uploadImage(file)
    pushImageUrl.value = url
    imagePreviewOk.value = true
  } catch (err) {
    uploadError.value = err.message || 'Upload failed'
  } finally {
    isUploading.value = false
    e.target.value = ''
  }
}

async function handleSendToAll() {
  if (!isSuperAdmin.value || isSending.value) return
  sendResult.value = null
  isSending.value = true
  try {
    const result = await sendToAll({
      title: pushTitle.value || 'SY.CORE',
      body:  pushBody.value  || '',
      image: pushImageUrl.value || undefined,
      data:  pushUrl.value   ? { url: pushUrl.value } : undefined,
    })
    sendResult.value = result
  } finally {
    isSending.value = false
  }
}

async function handleSendToMe() {
  if (!isSubscribed.value || isSending.value) return
  sendResult.value = null
  isSending.value = true
  try {
    await sendPush({
      title: pushTitle.value || 'SY.CORE',
      body:  pushBody.value  || '',
      image: pushImageUrl.value || undefined,
      data:  pushUrl.value   ? { url: pushUrl.value } : undefined,
    })
    sendResult.value = { sent: 1, failed: 0, total: 1 }
  } finally {
    isSending.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function uaShort(ua = '') {
  if (ua.includes('Chrome'))  return 'Chrome'
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('Safari'))  return 'Safari'
  if (ua.includes('Edge'))    return 'Edge'
  return 'Browser'
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  fetchSubscribers()
  fetchSentNotifications()
})
</script>

<template>
  <div
    v-show="!isMinimized"
    :style="panelStyle"
    class="fixed flex flex-col bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl"
    @mousedown="bringToFront"
  >

    <!-- ── Title bar ─────────────────────────────────────────────────────── -->
    <div
      class="flex items-center gap-3 px-3 py-2 bg-neutral-900/80 border-b border-neutral-800 cursor-move select-none shrink-0"
      @mousedown.self="onDragStart"
    >
      <MacOsButtons @close="emit('close')" @minimize="toggleMinimize" @maximize="maximize" />

      <div class="flex items-center gap-2 pointer-events-none">
        <Bell class="w-3.5 h-3.5 text-synth-neon" />
        <span class="text-[11px] font-black uppercase tracking-[0.18em] text-white">Push Notifications</span>
        <!-- Subscription status dot -->
        <span
          :class="[
            'w-1.5 h-1.5 rounded-full',
            isSubscribed ? 'bg-synth-neon shadow-[0_0_4px_var(--color-synth-neon)]' :
            permissionState === 'denied' ? 'bg-red-500' : 'bg-yellow-500'
          ]"
        />
      </div>
    </div>

    <!-- ── Tab bar ───────────────────────────────────────────────────────── -->
    <div class="flex shrink-0 border-b border-neutral-800 bg-neutral-900/40 px-1">
      <button
        v-for="tab in tabs" :key="tab.id"
        @click="activeTab = tab.id"
        :class="[
          'flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-colors',
          activeTab === tab.id
            ? 'border-synth-neon text-synth-neon'
            : 'border-transparent text-neutral-500 hover:text-neutral-300'
        ]"
      >
        <component :is="tab.icon" class="w-3 h-3" />
        {{ tab.label }}
        <span
          v-if="tab.badge"
          :class="[
            'text-[9px] font-mono px-1.5 py-0.5 rounded-full',
            activeTab === tab.id ? 'bg-synth-neon/20 text-synth-neon' : 'bg-neutral-800 text-neutral-500'
          ]"
        >{{ tab.badge }}</span>
      </button>
    </div>

    <!-- ── API unavailable banner (local vite dev without `vercel dev`) ── -->
    <div
      v-if="!apiAvailable"
      class="shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-[10px] font-mono text-amber-400"
    >
      <AlertCircle class="w-3 h-3 shrink-0" />
      Push API unavailable — run <code class="bg-amber-500/10 px-1 rounded">vercel dev</code> or deploy to Vercel to enable server features.
    </div>

    <!-- ── Content ───────────────────────────────────────────────────────── -->
    <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">

      <!-- ═══ COMPOSE ═══════════════════════════════════════════════════════ -->
      <div v-show="activeTab === 'compose'" class="p-4 space-y-3">

        <!-- Browser push status -->
        <div class="flex items-center justify-between bg-black/30 border border-neutral-800 rounded-lg px-4 py-3">
          <div class="flex flex-col gap-0.5">
            <span class="text-[10px] font-black uppercase tracking-widest text-neutral-400">Browser Push</span>
            <span class="text-[11px] font-mono">
              <span v-if="!isSupported" class="text-red-400">Not supported in this browser</span>
              <span v-else-if="isSubscribed" class="text-synth-neon">Subscribed — notifications active</span>
              <span v-else-if="permissionState === 'denied'" class="text-red-400">Permission denied</span>
              <span v-else class="text-yellow-400">Not subscribed</span>
            </span>
          </div>
          <button
            v-if="isSupported && !isSubscribed"
            @click="subscribe"
            class="bg-synth-neon/10 border border-synth-neon/20 hover:bg-synth-neon/20 text-synth-neon text-[10px] font-black uppercase tracking-widest py-1.5 px-3 rounded-lg transition-all"
          >Subscribe</button>
          <button
            v-if="isSubscribed"
            @click="unsubscribe"
            class="bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest py-1.5 px-3 rounded-lg transition-all"
          >Unsubscribe</button>
        </div>

        <!-- Compose form (superadmin only) -->
        <template v-if="isSuperAdmin">
          <div class="h-px bg-neutral-800" />

          <!-- Title + Body -->
          <div class="space-y-2">
            <label class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Title</label>
            <input
              v-model="pushTitle"
              type="text"
              placeholder="SY.CORE"
              class="w-full bg-black/60 border border-neutral-800 focus:border-synth-neon rounded-lg px-3 py-2 text-xs text-white outline-none transition-colors"
            />
          </div>

          <div class="space-y-2">
            <label class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Body</label>
            <textarea
              v-model="pushBody"
              placeholder="Notification message…"
              rows="3"
              class="w-full bg-black/60 border border-neutral-800 focus:border-synth-neon rounded-lg px-3 py-2 text-xs text-white outline-none transition-colors resize-none custom-scrollbar"
            />
          </div>

          <!-- Image section -->
          <div class="space-y-2">
            <label class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Image (optional)</label>
            <div class="flex gap-2">
              <input
                v-model="pushImageUrl"
                type="url"
                placeholder="https://… or upload →"
                class="flex-1 bg-black/60 border border-neutral-800 focus:border-synth-neon rounded-lg px-3 py-2 text-xs text-white outline-none transition-colors font-mono"
                @input="imagePreviewOk = true"
              />
              <!-- Hidden file input -->
              <input
                ref="fileInputRef"
                type="file"
                accept="image/*"
                class="hidden"
                @change="onFileSelect"
              />
              <button
                @click="fileInputRef?.click()"
                :disabled="isUploading"
                class="flex items-center gap-1.5 bg-neutral-800/60 border border-neutral-700 hover:border-synth-neon/40 text-neutral-400 hover:text-synth-neon text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-lg transition-all disabled:opacity-50"
                title="Upload image file (max 1.5 MB)"
              >
                <Upload v-if="!isUploading" class="w-3 h-3" />
                <svg v-else class="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="30 70" />
                </svg>
                {{ isUploading ? 'Uploading…' : 'Upload' }}
              </button>
            </div>

            <!-- Upload error -->
            <p v-if="uploadError" class="text-[10px] text-red-400 font-mono">{{ uploadError }}</p>

            <!-- Image preview -->
            <div
              v-if="pushImageUrl"
              class="relative overflow-hidden rounded-lg border border-neutral-800 bg-black/40 h-24"
            >
              <img
                :src="pushImageUrl"
                alt="Image preview"
                class="w-full h-full object-cover"
                @error="imagePreviewOk = false"
                @load="imagePreviewOk = true"
              />
              <div
                v-if="!imagePreviewOk"
                class="absolute inset-0 flex items-center justify-center gap-2 text-[10px] text-neutral-500"
              >
                <AlertCircle class="w-3.5 h-3.5" /> Cannot load image
              </div>
              <button
                @click="pushImageUrl = ''; imagePreviewOk = true"
                class="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/70 text-neutral-400 hover:text-white transition-colors"
              >
                <X class="w-3 h-3" />
              </button>
            </div>
          </div>

          <!-- Click URL -->
          <div class="space-y-2">
            <label class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Click URL (optional)</label>
            <input
              v-model="pushUrl"
              type="url"
              placeholder="https://…"
              class="w-full bg-black/60 border border-neutral-800 focus:border-synth-neon rounded-lg px-3 py-2 text-xs text-white outline-none transition-colors font-mono"
            />
          </div>

          <!-- Notification preview -->
          <div class="space-y-2">
            <label class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Preview</label>
            <div class="bg-neutral-900/60 border border-neutral-800 rounded-xl p-3 flex gap-3">
              <img src="/icons/pwa-192x192.png" alt="" class="w-9 h-9 rounded-lg shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="text-xs font-bold text-white truncate">{{ pushTitle || 'SY.CORE' }}</div>
                <div class="text-[11px] text-neutral-400 line-clamp-2 mt-0.5">{{ pushBody || 'Notification preview' }}</div>
              </div>
              <div v-if="pushImageUrl && imagePreviewOk" class="shrink-0">
                <img :src="pushImageUrl" alt="" class="w-16 h-12 object-cover rounded" />
              </div>
            </div>
          </div>

          <!-- Send result -->
          <div v-if="sendResult" class="flex items-center gap-2 text-[11px] font-mono">
            <CheckCircle2 class="w-3.5 h-3.5 text-synth-neon shrink-0" />
            <span class="text-synth-neon">Sent {{ sendResult.sent }}/{{ sendResult.total }}</span>
            <span v-if="sendResult.failed" class="text-red-400">· {{ sendResult.failed }} failed</span>
          </div>

          <!-- Send buttons -->
          <div class="flex gap-2 pt-1">
            <button
              @click="handleSendToAll"
              :disabled="isSending || subscribers.length === 0"
              class="flex-1 flex items-center justify-center gap-2 bg-synth-neon/10 border border-synth-neon/20 hover:bg-synth-neon/20 text-synth-neon text-[10px] font-black uppercase tracking-widest py-2.5 rounded-lg transition-all disabled:opacity-40"
            >
              <Send class="w-3 h-3" />
              Send to All ({{ subscribers.length }})
            </button>
            <button
              @click="handleSendToMe"
              :disabled="isSending || !isSubscribed"
              class="flex items-center gap-2 bg-neutral-800/60 border border-neutral-700 hover:border-neutral-600 text-neutral-300 hover:text-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-lg transition-all disabled:opacity-40"
              title="Test: send to your own subscription only"
            >
              Test
            </button>
          </div>
        </template>

        <!-- Non-admin note -->
        <div v-else-if="isSubscribed" class="text-[10px] font-mono text-neutral-600 text-center py-2">
          Compose is available to admins only.
        </div>

      </div>

      <!-- ═══ SUBSCRIBERS ══════════════════════════════════════════════════ -->
      <div v-show="activeTab === 'subscribers'" class="flex flex-col h-full">
        <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-900">
          <span class="text-[10px] font-black uppercase tracking-widest text-neutral-400">
            {{ subscribers.length }} Subscriber{{ subscribers.length !== 1 ? 's' : '' }}
          </span>
          <div class="flex items-center gap-3">
            <button
              v-if="subscribers.length > 0"
              @click="exportSubscribers"
              class="flex items-center gap-1 text-[9px] font-mono text-neutral-500 hover:text-synth-neon uppercase tracking-wider transition-colors"
            >
              <Download class="w-3 h-3" /> CSV
            </button>
            <button
              @click="fetchSubscribers"
              class="flex items-center gap-1 text-[9px] font-mono text-neutral-500 hover:text-synth-neon uppercase tracking-wider transition-colors"
            >
              <RefreshCw class="w-3 h-3" /> Refresh
            </button>
          </div>
        </div>

        <div v-if="subscribers.length === 0" class="flex-1 flex items-center justify-center">
          <span class="text-[11px] font-mono text-neutral-700">No subscribers yet</span>
        </div>

        <div v-else class="flex-1 overflow-y-auto custom-scrollbar divide-y divide-neutral-900">
          <div
            v-for="sub in subscribers" :key="sub.hash"
            class="flex items-center gap-3 px-4 py-3 hover:bg-neutral-900/40 transition-colors"
          >
            <!-- Avatar placeholder -->
            <div class="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center shrink-0">
              <span class="text-[10px] font-black text-neutral-500 uppercase">
                {{ (sub.email?.[0] || '?') }}
              </span>
            </div>

            <div class="flex-1 min-w-0">
              <div class="text-[11px] font-bold text-neutral-200 truncate">{{ sub.email }}</div>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="text-[9px] font-mono text-neutral-600">{{ formatDate(sub.subscribedAt) }}</span>
                <span class="text-[8px] font-mono bg-neutral-800 text-neutral-500 px-1.5 py-0.5 rounded">
                  {{ uaShort(sub.userAgent) }}
                </span>
                <span v-if="sub.keys" class="text-[8px] font-mono bg-synth-neon/10 text-synth-neon px-1.5 py-0.5 rounded">
                  pushable
                </span>
              </div>
            </div>

            <button
              @click="removeSubscriber(sub.hash)"
              class="text-neutral-700 hover:text-red-500 transition-colors shrink-0"
              title="Remove subscriber"
            >
              <X class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <!-- ═══ SENT ══════════════════════════════════════════════════════════ -->
      <div v-show="activeTab === 'sent'" class="flex flex-col h-full">
        <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-900">
          <span class="text-[10px] font-black uppercase tracking-widest text-neutral-400">
            {{ sentNotifications.length }} Sent
          </span>
          <button
            @click="fetchSentNotifications"
            class="flex items-center gap-1 text-[9px] font-mono text-neutral-500 hover:text-synth-neon uppercase tracking-wider transition-colors"
          >
            <RefreshCw class="w-3 h-3" /> Refresh
          </button>
        </div>

        <div v-if="sentNotifications.length === 0" class="flex-1 flex items-center justify-center">
          <span class="text-[11px] font-mono text-neutral-700">No notifications sent yet</span>
        </div>

        <div v-else class="flex-1 overflow-y-auto custom-scrollbar divide-y divide-neutral-900">
          <div
            v-for="(notif, i) in sentNotifications" :key="i"
            class="flex items-start gap-3 px-4 py-3 hover:bg-neutral-900/40 transition-colors"
          >
            <!-- Image or icon -->
            <div class="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-neutral-900 flex items-center justify-center border border-neutral-800">
              <img
                v-if="notif.image"
                :src="notif.image"
                alt=""
                class="w-full h-full object-cover"
              />
              <Bell v-else class="w-4 h-4 text-neutral-700" />
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2">
                <span class="text-[11px] font-bold text-neutral-200 truncate">{{ notif.title }}</span>
                <span class="text-[9px] font-mono text-neutral-600 shrink-0">{{ formatDate(notif.sentAt) }}</span>
              </div>
              <div class="text-[10px] text-neutral-500 truncate mt-0.5">{{ notif.body }}</div>
              <div class="flex items-center gap-2 mt-1">
                <span class="flex items-center gap-1 text-[9px] font-mono text-synth-neon">
                  <CheckCircle2 class="w-2.5 h-2.5" /> {{ notif.sent }}/{{ notif.total }}
                </span>
                <span v-if="notif.failed" class="flex items-center gap-1 text-[9px] font-mono text-red-400">
                  <XCircle class="w-2.5 h-2.5" /> {{ notif.failed }} failed
                </span>
                <span class="text-[9px] font-mono text-neutral-700">{{ notif.sentBy }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div><!-- end content -->

    <!-- ── Resize handle ─────────────────────────────────────────────────── -->
    <div
      class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-20 hover:opacity-60 transition-opacity"
      @mousedown.stop="onResizeStart($event, 'se')"
    >
      <svg viewBox="0 0 8 8" fill="none" class="w-4 h-4">
        <path d="M8 2L2 8M5 2L2 5M8 5L5 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="text-neutral-400" />
      </svg>
    </div>

  </div>
</template>
