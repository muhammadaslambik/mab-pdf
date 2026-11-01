import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base './' + routing berbasis hash => jalan di GitHub Pages (/mab-pdf/), Cloudflare Pages, Netlify, dsb.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'mab-pdf',
        short_name: 'mab-pdf',
        description: 'Alat PDF gratis. File diproses di perangkat Anda, tidak diunggah ke server.',
        lang: 'id',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f4f6f8',
        theme_color: '#14213d',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024
      }
    })
  ],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 }
});
