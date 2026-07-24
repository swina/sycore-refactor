import { Redis } from '@upstash/redis'
import { randomBytes } from 'crypto'

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

const IMAGE_TTL = 60 * 60 * 24 * 7 // 7 days
const MAX_BYTES = 2 * 1024 * 1024   // 2 MB base64 (~1.5 MB original)

export default async function handler(req, res) {
  // GET: serve stored image by id
  if (req.method === 'GET') {
    const { id } = req.query
    if (!id || !/^[a-f0-9]{16}$/.test(id)) {
      return res.status(400).json({ error: 'Invalid id' })
    }
    try {
      const stored = await redis.get(`push:image:${id}`)
      if (!stored) return res.status(404).json({ error: 'Image not found' })
      const { data, type } = typeof stored === 'string' ? JSON.parse(stored) : stored
      const buffer = Buffer.from(data, 'base64')
      res.setHeader('Content-Type', type || 'image/jpeg')
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
      return res.end(buffer)
    } catch (e) {
      console.error('[push-image] GET failed', e)
      return res.status(500).json({ error: 'Failed to serve image' })
    }
  }

  // POST: upload and store image
  if (req.method === 'POST') {
    const { data, type, name } = req.body || {}
    if (!data || typeof data !== 'string') {
      return res.status(400).json({ error: 'Missing base64 data' })
    }
    if (data.length > MAX_BYTES) {
      return res.status(413).json({ error: 'Image too large (max ~1.5 MB)' })
    }
    if (!type?.startsWith('image/')) {
      return res.status(400).json({ error: 'Not an image type' })
    }
    try {
      const id = randomBytes(8).toString('hex')
      await redis.set(`push:image:${id}`, JSON.stringify({ data, type, name: name || '' }), { ex: IMAGE_TTL })
      return res.json({ id, url: `/api/push-image?id=${id}` })
    } catch (e) {
      console.error('[push-image] POST failed', e)
      return res.status(500).json({ error: 'Failed to store image' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
