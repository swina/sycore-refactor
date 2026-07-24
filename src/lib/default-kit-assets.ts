// Static pool of bundled audio files an admin can assign to Drum Machine's
// Default Kit slots (see DrumMachine.vue + useConfigStore's defaultDrumKit).
// Drop any .wav/.mp3/.ogg/.m4a/.flac file into src/assets/default-kit/ and
// it's automatically discoverable here — no manifest to maintain. Unlike
// per-user uploads (local-only, browser IndexedDB), these ship with the app
// build, so every user's browser can fetch and cache them.
const modules = import.meta.glob('/src/assets/default-kit/*.{wav,mp3,ogg,m4a,flac}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

export interface DefaultKitAsset {
  fileName: string
  url: string
}

export const defaultKitAssets: DefaultKitAsset[] = Object.entries(modules)
  .map(([path, url]) => ({ fileName: path.split('/').pop() as string, url }))
  .sort((a, b) => a.fileName.localeCompare(b.fileName))

export function resolveDefaultKitAssetUrl(fileName: string): string | undefined {
  return defaultKitAssets.find(a => a.fileName === fileName)?.url
}
