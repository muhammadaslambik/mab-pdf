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
        name: 'MAB-PDF',
        short_name: 'MAB-PDF',
        description: 'Alat PDF gratis. File diproses di perangkat Anda, tidak diunggah ke server.',
        lang: 'id',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f0ede4',
        theme_color: '#f1eee6',
        file_handlers: [{ action: './', accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png', '.webp'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } }] as any,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webmanifest}'],
        // Berkas berat tidak ikut precache (hemat data di kunjungan pertama): diunduh sekali saat alatnya pertama dipakai, lalu disimpan.
        globIgnores: ['**/compress.worker*', '**/pdf.worker*', '**/pptxgen*'],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          { urlPattern: ({ url, sameOrigin }: any) => sameOrigin && /\/assets\/(pdf\.worker|pptxgen)/.test(url.pathname), handler: 'CacheFirst',
            options: { cacheName: 'mab-heavy', expiration: { maxEntries: 6, purgeOnQuotaError: true }, cacheableResponse: { statuses: [200] } } },
          // pustaka AI & mesin OCR (versi dikunci di kode). Bobot model AI dicache WebLLM sendiri; JANGAN di-cache ganda di sini.
          { urlPattern: /^https:\/\/cdn\.jsdelivr\.net\//, handler: 'CacheFirst',
            options: { cacheName: 'mab-cdn', expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365, purgeOnQuotaError: true }, cacheableResponse: { statuses: [200] } } }
        ]
      }
    })
  ],
  // pra-bundel pustaka yang dimuat malas agar dev server tidak memuat ulang halaman saat alat pertama dibuka
  optimizeDeps: { include: ['pptxgenjs', 'tesseract.js'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 }
});
