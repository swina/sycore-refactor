import { onMounted } from 'vue'
import { seedConfigIfNeeded } from '@/lib/seedConfig'

/**
 * Seeds the IDB system config on first run, then updates useConfigStore.
 * Call once from SynthApp.vue's setup().
 */
export function useSeedConfig(configStore) {
  onMounted(async () => {
    try {
      await seedConfigIfNeeded()
      // Reload config from IDB after seeding so stores reflect seeded values
      if (configStore) await configStore.init()
    } catch (e) {
      console.error('Seed config failed', e)
    }
  })
}
