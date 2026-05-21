import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/useAuthStore'
import { db, doc, setDoc, getDoc, deleteDoc } from '@/lib/idb'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BLrViOUVhA5fTRfb4j0p06WeYdfYIbfuRV7_M5QQwgc652QNBHCDPcZD4xFuAiFL2EJHFe9A6D5dEjfIcRtlsao'

const isSubscribed = ref(false)
const subscription = ref(null)
const permissionState = ref(Notification.permission)
const isSupported = computed(() => 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window)
const isSuperAdmin = computed(() => {
  const auth = useAuthStore()
  return auth.user?.email === 'swina.allen@gmail.com'
})

let swRegistration = null

async function registerSW() {
  if (swRegistration) return swRegistration
  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    // Wait for the SW to be active
    if (swRegistration.active) return swRegistration
    return new Promise((resolve) => {
      swRegistration.addEventListener('updatefound', () => {
        const worker = swRegistration.installing
        if (!worker) { resolve(swRegistration); return }
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated') resolve(swRegistration)
        })
      })
    })
  } catch (e) {
    console.error('[PushNotifications] SW registration failed', e)
    return null
  }
}

async function subscribe() {
  if (!isSupported.value || !isSuperAdmin.value) return
  if (permissionState.value === 'denied') return

  const reg = await registerSW()
  if (!reg) return

  try {
    if (permissionState.value === 'default') {
      const perm = await Notification.requestPermission()
      permissionState.value = perm
      if (perm !== 'granted') return
    }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })

    subscription.value = sub
    isSubscribed.value = true

    // Persist subscription locally
    await setDoc(doc(db, 'system', 'push_subscription'), {
      endpoint: sub.endpoint,
      keys: sub.toJSON().keys,
      updatedAt: new Date().toISOString(),
    })
  } catch (e) {
    console.error('[PushNotifications] Subscribe failed', e)
  }
}

async function unsubscribe() {
  if (!subscription.value) return
  try {
    await subscription.value.unsubscribe()
    subscription.value = null
    isSubscribed.value = false
    await deleteDoc(doc(db, 'system', 'push_subscription'))
  } catch (e) {
    console.error('[PushNotifications] Unsubscribe failed', e)
  }
}

async function restoreSubscription() {
  if (!isSupported.value || !isSuperAdmin.value) return
  const reg = await registerSW()
  if (!reg) return

  try {
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      subscription.value = sub
      isSubscribed.value = true
      permissionState.value = 'granted'
    }
  } catch (e) {
    console.error('[PushNotifications] Restore failed', e)
  }
}

const subscribers = ref([])

async function fetchSubscribers() {
  try {
    const res = await fetch('/api/send-push')
    if (res.ok) {
      subscribers.value = await res.json()
    }
  } catch (e) {
    console.error('[PushNotifications] Fetch subscribers failed', e)
  }
}

async function removeSubscriber(hash) {
  try {
    await fetch('/api/send-push', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash }),
    })
    subscribers.value = subscribers.value.filter((s) => s.hash !== hash)
  } catch (e) {
    console.error('[PushNotifications] Remove subscriber failed', e)
  }
}

async function sendPush({ title, body, tag, data, actions } = {}) {
  if (!isSubscribed.value || !isSuperAdmin.value) {
    console.warn('[PushNotifications] Not subscribed or not superadmin')
    return
  }

  const auth = useAuthStore()
  const sub = subscription.value.toJSON()
  const payload = { title: title || 'SY.CORE', body: body || '', tag, data, actions }

  try {
    const res = await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub,
        payload,
        email: auth.user?.email || 'unknown',
        userAgent: navigator.userAgent,
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error('[PushNotifications] Send failed', res.status, err)
    }
  } catch (e) {
    console.error('[PushNotifications] Send error', e)
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export function usePushNotifications() {
  return {
    isSupported,
    isSubscribed,
    permissionState,
    isSuperAdmin,
    subscribers,
    subscribe,
    unsubscribe,
    restoreSubscription,
    sendPush,
    fetchSubscribers,
    removeSubscriber,
    exportSubscribers,
  }
}

export function exportSubscribers() {
  if (!subscribers.value.length) return
  const rows = subscribers.value.map((s) => ({
    email: s.email,
    subscribedAt: s.subscribedAt || '',
    endpoint: s.endpoint,
    userAgent: s.userAgent || '',
  }))
  const csv = [
    'email,subscribedAt,endpoint,userAgent',
    ...rows.map((r) =>
      `"${r.email}","${r.subscribedAt}","${r.endpoint}","${r.userAgent.replace(/"/g, '""')}"`
    ),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `push_subscribers_${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}