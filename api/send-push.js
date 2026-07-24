import { Redis } from '@upstash/redis'
import webpush from 'web-push'

const redis = new Redis({
  url:
    process.env.UPSTASH_REDIS_REST_KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    '',
  token:
    process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    '',
})

const SUBSCRIBERS_KEY = 'push:subscribers'
const SENT_KEY        = 'push:sent'
const MAX_SENT        = 100

export default async function handler(req, res) {
  const vapidPublicKey  = process.env.VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY

  // ── GET: list subscribers OR sent history ─────────────────────────────────
  if (req.method === 'GET') {
    // ?history=1 → return sent notification history
    if (req.query.history) {
      try {
        const items = await redis.lrange(SENT_KEY, 0, MAX_SENT - 1)
        const list = (items || []).map((item) =>
          typeof item === 'string' ? JSON.parse(item) : item
        )
        return res.json(list)
      } catch (e) {
        console.error('[send-push] GET history failed', e)
        return res.status(500).json({ error: 'Failed to fetch history' })
      }
    }

    // Default → return subscriber list
    try {
      const subs = await redis.hgetall(SUBSCRIBERS_KEY)
      if (!subs) return res.json([])
      const list = Object.entries(subs).map(([hash, data]) => ({
        hash,
        ...(typeof data === 'string' ? JSON.parse(data) : data),
      }))
      return res.json(list)
    } catch (e) {
      console.error('[send-push] GET subscribers failed', e)
      return res.status(500).json({ error: 'Failed to list subscribers' })
    }
  }

  // ── DELETE: remove a subscriber ───────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { hash } = req.body
    if (!hash) return res.status(400).json({ error: 'Missing hash' })
    try {
      await redis.hdel(SUBSCRIBERS_KEY, hash)
      return res.json({ success: true })
    } catch (e) {
      console.error('[send-push] DELETE failed', e)
      return res.status(500).json({ error: 'Failed to remove subscriber' })
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!vapidPublicKey || !vapidPrivateKey) {
    return res.status(500).json({ error: 'VAPID keys not configured' })
  }

  webpush.setVapidDetails('mailto:swina.allen@gmail.com', vapidPublicKey, vapidPrivateKey)

  const { subscription, payload, email, userAgent, sendToAll } = req.body

  // ── POST sendToAll: broadcast to every stored subscriber ──────────────────
  if (sendToAll) {
    let subs
    try {
      subs = await redis.hgetall(SUBSCRIBERS_KEY)
    } catch (e) {
      return res.status(500).json({ error: 'Failed to read subscribers' })
    }

    if (!subs) return res.json({ success: true, sent: 0, failed: 0, total: 0 })

    const entries = Object.entries(subs)

    const results = await Promise.allSettled(
      entries.map(async ([hash, data]) => {
        const subData = typeof data === 'string' ? JSON.parse(data) : data
        if (!subData.endpoint || !subData.keys) {
          throw new Error('No push keys stored for this subscriber')
        }
        const pushSub = { endpoint: subData.endpoint, keys: subData.keys }
        const details = webpush.generateRequestDetails(
          pushSub,
          JSON.stringify(payload || { title: 'SY.CORE', body: '' }),
          { TTL: 300 }
        )
        const response = await fetch(details.endpoint, {
          method: 'POST',
          headers: details.headers,
          body: details.body,
        })
        if (!response.ok) {
          if (response.status === 410 || response.status === 404) {
            await redis.hdel(SUBSCRIBERS_KEY, hash).catch(() => {})
          }
          const text = await response.text()
          throw new Error(`Push returned ${response.status}: ${text.slice(0, 100)}`)
        }
      })
    )

    const sent   = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length

    await _saveSentRecord({ payload, email, sent, failed, total: entries.length })

    return res.json({ success: true, sent, failed, total: entries.length })
  }

  // ── POST single: send to the caller's own subscription ───────────────────
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Missing subscription' })
  }

  try {
    const details = webpush.generateRequestDetails(
      subscription,
      JSON.stringify(payload || { title: 'SY.CORE', body: '' }),
      { TTL: 300 }
    )

    const response = await fetch(details.endpoint, {
      method: 'POST',
      headers: details.headers,
      body: details.body,
    })

    if (!response.ok) {
      if (response.status === 410 || response.status === 404) {
        const hash = simpleHash(subscription.endpoint)
        await redis.hdel(SUBSCRIBERS_KEY, hash)
        return res.status(410).json({ error: 'Subscription expired, removed' })
      }
      const text = await response.text()
      return res.status(response.status).json({
        error: `Push service returned ${response.status}: ${text.slice(0, 200)}`,
      })
    }

    // Store / update subscriber record, now including push keys
    const hash = simpleHash(subscription.endpoint)
    await redis.hset(SUBSCRIBERS_KEY, {
      [hash]: JSON.stringify({
        email:        email || 'unknown',
        endpoint:     subscription.endpoint,
        keys:         subscription.keys || null,
        subscribedAt: new Date().toISOString(),
        userAgent:    userAgent || '',
      }),
    })

    await _saveSentRecord({ payload, email, sent: 1, failed: 0, total: 1 })

    return res.status(200).json({ success: true })
  } catch (e) {
    console.error('[send-push] POST single failed', e)
    return res.status(500).json({ error: 'Push send failed: ' + e.message })
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function _saveSentRecord({ payload, email, sent, failed, total }) {
  const record = {
    title:   payload?.title || 'SY.CORE',
    body:    payload?.body  || '',
    image:   payload?.image || null,
    url:     payload?.data?.url || null,
    sentAt:  new Date().toISOString(),
    sentBy:  email || 'unknown',
    sent,
    failed,
    total,
  }
  try {
    await redis.lpush(SENT_KEY, JSON.stringify(record))
    await redis.ltrim(SENT_KEY, 0, MAX_SENT - 1)
  } catch (e) {
    console.error('[send-push] Failed to save sent record', e)
  }
}

function simpleHash(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return 'sub_' + Math.abs(hash).toString(36)
}
