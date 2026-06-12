import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

const resolveAlias = {
  alias: {
    '@': path.resolve(__dirname, './src'),
  },
};

const devServer = {
  port: 3094,
  host: '0.0.0.0',
  proxy: {
    '/freesound-api': {
      target: 'https://freesound.org/apiv2',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/freesound-api/, ''),
      secure: false,
    },
  },
};

export default defineConfig(({ mode }) => {
  // ── Website build: static marketing site, no PWA, no service worker ──
  // npm run build:website → dist-site/
  if (mode === 'website') {
    return {
      plugins: [
        vue(),
        {
          // Emit the website entry as index.html so dist-site deploys at /,
          // and a vercel.json marking the deploy as static (no install/build)
          // so Vercel project settings can't trigger a remote "vite build".
          name: 'website-html-as-index',
          enforce: 'post',
          generateBundle(_, bundle) {
            const html = bundle['website.html'];
            if (html) html.fileName = 'index.html';
            this.emitFile({
              type: 'asset',
              fileName: 'vercel.json',
              source: JSON.stringify(
                { framework: null, installCommand: '', buildCommand: '' },
                null,
                2
              ),
            });
          },
        },
      ],
      build: {
        outDir: 'dist-site',
        rollupOptions: {
          input: path.resolve(__dirname, 'website.html'),
        },
      },
      resolve: resolveAlias,
      server: devServer,
    };
  }

  // ── App build (default): the PWA, without the website ──
  return {
    plugins: [
      vue(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'public',
        filename: 'sw.js',
        registerType: 'autoUpdate',
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
          ],
        },
        manifest: {
          name: 'SY.CORE | Roland S-1 Tweak Synth',
          short_name: 'SY.CORE',
          description:
            'SY.CORE - The ultimate performance and sound design toolset for the Roland S-1 Tweak Synth.',
          theme_color: '#1a1a2e',
          background_color: '#0f0f1a',
          display: 'standalone',
          scope: '/',
          start_url: '/',
          screenshots: [
            {
              src: '/screenshot-wide.png',
              sizes: '1280x720',
              type: 'image/png',
              form_factor: 'wide',
              label: 'SY.CORE Desktop View',
            },
            {
              src: '/screenshot-narrow.png',
              sizes: '720x1280',
              type: 'image/png',
              label: 'SY.CORE Mobile View',
            },
          ],
          icons: [
            {
              src: '/icons/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/icons/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
          ],
        },
      }),
    ],
    resolve: resolveAlias,
    server: devServer,
  };
});
