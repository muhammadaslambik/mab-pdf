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
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // data bahasa OCR & pustaka AI diunduh sekali lalu tersedia offline
        runtimeCaching: [
          { urlPattern: /^https:\/\/(cdn\.jsdelivr\.net|tessdata\.projectnaptha\.com)\//, handler: 'CacheFirst', options: { cacheName: 'mab-cdn', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 180 } } }
        ]
      }
    })
  ],
  // pra-bundel pustaka yang dimuat malas agar dev server tidak memuat ulang halaman saat alat pertama dibuka
  optimizeDeps: { include: ['pptxgenjs', 'tesseract.js'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 }
});
