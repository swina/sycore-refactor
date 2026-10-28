// Audio file format detection for library tracks (mp3, wav, flac, ogg, …).
// Tracks store either an http(s) URL, a data: URL (local files saved as base64)
// or a blob: URL, so the format is derived from the file name extension or the
// data URL's MIME type.

const KNOWN_EXTS = new Set([
  'mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'mp4', 'webm', 'aif', 'aiff', 'wma',
])

const MIME_TO_FORMAT: Record<string, string> = {
  'mpeg': 'mp3', 'mp3': 'mp3', 'x-mp3': 'mp3', 'mpeg3': 'mp3', 'x-mpeg-3': 'mp3',
  'wav': 'wav', 'x-wav': 'wav', 'wave': 'wav', 'vnd.wave': 'wav',
  'flac': 'flac', 'x-flac': 'flac',
  'ogg': 'ogg', 'vorbis': 'ogg', 'x-vorbis+ogg': 'ogg',
  'opus': 'opus',
  'mp4': 'm4a', 'x-m4a': 'm4a', 'm4a': 'm4a',
  'aac': 'aac', 'x-aac': 'aac', 'aacp': 'aac',
  'webm': 'webm',
  'aiff': 'aiff', 'x-aiff': 'aiff',
  'x-ms-wma': 'wma',
}

/** Format from a file name or URL path extension, e.g. "song.FLAC" → "flac". */
export function formatFromName(name: string | null | undefined): string | null {
  if (!name) return null
  const m = /\.([a-z0-9]{2,5})$/i.exec(name.trim())
  if (!m) return null
  const ext = m[1].toLowerCase()
  if (ext === 'oga') return 'ogg'
  if (ext === 'aif') return 'aiff'
  return KNOWN_EXTS.has(ext) ? ext : null
}

/** Format of a track URL: data: MIME type, else the URL path's extension. */
export function formatFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith('data:')) {
    const m = /^data:audio\/([^;,]+)/i.exec(url)
    if (!m) return null
    const sub = m[1].toLowerCase()
    return MIME_TO_FORMAT[sub] ?? null
  }
  if (url.startsWith('blob:')) return null
  let path = url
  try { path = decodeURIComponent(new URL(url).pathname) } catch { path = url.split(/[?#]/)[0] }
  return formatFromName(path)
}

/** Display format of a library track: stored `format` field wins over URL detection. */
export function trackFormat(track: { format?: string | null; url?: string | null }): string | null {
  return track.format || formatFromUrl(track.url)
}
