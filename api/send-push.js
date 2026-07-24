import { Redis } from '@upstash/redis'
import webpush from 'web-push'

// Vercel's native "Vercel KV" product (which injected KV_REST_API_URL/
// KV_REST_API_TOKEN) is retired. A Marketplace Upstash integration injects
// its own prefixed variant instead — this project's actually got
// UPSTASH_REDIS_REST_KV_REST_API_URL/_TOKEN (confirmed via `vercel env ls`).
// Check every naming variant so this keeps working regardless of which
// prefix a given Upstash connection happens to use.
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

export default async function handler(req, res) {
  const vapidPublicKey  = process.env.VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY

  // ── GET: list subscribers ─────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const subs = await redis.hgetall(SUBSCRIBERS_KEY)
      if (!subs) return res.json([])
      const list = Object.entries(subs).map(([hash, data]) => ({
        hash,
        ...(typeof data === 'string' ? JSON.parse(data) : data),
      }))
      return res.json(list)
    } catch (e) {
      console.error('Failed to list subscribers', e)
      return res.status(500).json({ error: 'Failed to list subscribers' })
    }
  }

  // ── DELETE: remove a subscriber ───────────────────────────────────────
  if (req.method === 'DELETE') {
    const { hash } = req.body
    if (!hash) return res.status(400).json({ error: 'Missing hash' })
    try {
      await redis.hdel(SUBSCRIBERS_KEY, hash)
      return res.json({ success: true })
    } catch (e) {
      console.error('Failed to remove subscriber', e)
      return res.status(500).json({ error: 'Failed to remove subscriber' })
    }
  }

  // ── POST: send push + store subscriber ────────────────────────────────
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { subscription, payload, email, userAgent } = req.body

  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Missing subscription' })
  }

  if (!vapidPublicKey || !vapidPrivateKey) {
    return res.status(500).json({ error: 'VAPID keys not configured' })
  }

  webpush.setVapidDetails('mailto:swina.allen@gmail.com', vapidPublicKey, vapidPrivateKey)

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
        // Subscription expired — remove it
        const hash = simpleHash(subscription.endpoint)
        await redis.hdel(SUBSCRIBERS_KEY, hash)
        return res.status(410).json({ error: 'Subscription expired, removed' })
      }
      const text = await response.text()
      return res.status(response.status).json({
        error: `Push service returned ${response.status}: ${text.slice(0, 200)}`,
      })
    }

    // Store subscriber info
    try {
      const hash = simpleHash(subscription.endpoint)
      await redis.hset(SUBSCRIBERS_KEY, {
        [hash]: JSON.stringify({
          email: email || 'unknown',
          endpoint: subscription.endpoint,
          subscribedAt: new Date().toISOString(),
          userAgent: userAgent || '',
        }),
      })
    } catch (e) {
      console.error('Failed to store subscriber', e)
    }

    return res.status(200).json({ success: true })
  } catch (e) {
    console.error('Push send failed', e)
    return res.status(500).json({ error: 'Push send failed: ' + e.message })
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