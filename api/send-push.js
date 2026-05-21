import webpush from 'web-push'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { subscription, payload } = req.body

  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Missing subscription' })
  }

  const vapidPublicKey  = process.env.VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY

  if (!vapidPublicKey || !vapidPrivateKey) {
    return res.status(500).json({ error: 'VAPID keys not configured' })
  }

  webpush.setVapidDetails(
    'mailto:swina.allen@gmail.com',
    vapidPublicKey,
    vapidPrivateKey
  )

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
        return res.status(410).json({ error: 'Subscription expired' })
      }
      const text = await response.text()
      return res.status(response.status).json({
        error: `Push service returned ${response.status}: ${text.slice(0, 200)}`,
      })
    }

    return res.status(200).json({ success: true })
  } catch (e) {
    console.error('Push send failed', e)
    return res.status(500).json({ error: 'Push send failed: ' + e.message })
  }
}