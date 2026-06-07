// Freesound REST API wrapper using fetch.
// The freesound npm package (freesound.js) uses CJS + eval() + XHR which conflicts
// with Vite's ESM bundler, so we call the REST API directly — same endpoints,
// same results, no compatibility issues.
// API key: stored per-user in Firestore profile.freesoundApiKey (set via User Profile modal).
// Falls back to VITE_FREESOUND_API_KEY env var for development.

import { useAuthStore } from '@/stores/useAuthStore'

const BASE = 'https://freesound.org/apiv2'
const FIELDS = 'id,name,previews,duration,username,tags,license,ac_analysis'

function getToken() {
  try {
    const profile = useAuthStore().profile
    if (profile?.freesoundApiKey) return profile.freesoundApiKey
  } catch {}
  return import.meta.env.VITE_FREESOUND_API_KEY || ''
}

export function hasFreesoundApiKey() {
  return !!getToken()
}

function mapSound(s) {
  const ac = s.ac_analysis || {}
  const rawBpm = ac.ac_tempo
  const bpm = rawBpm != null && rawBpm > 0 ? Math.round(rawBpm) : null
  return {
    id: `freesound_${s.id}`,
    freesoundId: s.id,
    url: s.previews?.['preview-hq-mp3'] || s.previews?.['preview-lq-mp3'] || '',
    label: s.name,
    genre: 'Freesound',
    author: s.username,
    duration: s.duration || 0,
    tags: s.tags || [],
    license: s.license || '',
    previews: s.previews || {},
    bpm,
    isLoop: ac.ac_loop === true,
  }
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Freesound API error ${res.status}`)
  return res.json()
}

export async function searchSounds(query, { page = 1, pageSize = 15, minDuration, maxDuration, cc0Only = false } = {}) {
  const token = getToken()
  if (!token) throw new Error('Freesound API key not configured')

  const filters = []
  if (minDuration != null && maxDuration != null) filters.push(`duration:[${minDuration} TO ${maxDuration}]`)
  else if (minDuration != null) filters.push(`duration:[${minDuration} TO *]`)
  else if (maxDuration != null) filters.push(`duration:[* TO ${maxDuration}]`)
  if (cc0Only) filters.push(`license:"http://creativecommons.org/publicdomain/zero/1.0/"`)
  const filter = filters.join(' ')

  const params = new URLSearchParams({
    query: query || ' ',
    token,
    fields: FIELDS,
    page,
    page_size: pageSize,
    ...(filter ? { filter } : {}),
  })

  const data = await fetchJson(`${BASE}/search/text/?${params}`)
  return {
    results: (data.results || []).map(mapSound),
    count: data.count || 0,
    nextUrl: data.next || null,
    previousUrl: data.previous || null,
  }
}

export async function fetchPage(url) {
  // Freesound pagination URLs omit the token — re-attach it
  const token = getToken()
  const paged = new URL(url)
  if (token && !paged.searchParams.has('token')) paged.searchParams.set('token', token)
  const data = await fetchJson(paged.toString())
  return {
    results: (data.results || []).map(mapSound),
    count: data.count || 0,
    nextUrl: data.next || null,
    previousUrl: data.previous || null,
  }
}
