import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    // VitePWA({
    //   registerType: 'autoUpdate',
    //   includeAssets: ['favicon.svg', 'icons.svg'],
    //   manifest: {
    //     name: 'AIO System — Office Asset Inventory',
    //     short_name: 'AIO',
    //     description: 'Office asset inventory management system',
    //     theme_color: '#0f172a',
    //     background_color: '#ffffff',
    //     display: 'standalone',
    //     scope: '/',
    //     start_url: '/',
    //     icons: [
    //       { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
    //       { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
    //       { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    //     ],
    //   },
    //   workbox: {
    //     globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
    //     runtimeCaching: [
    //       {
    //         urlPattern: /^\/api\/(auth\/me|dashboard|assets\?)/,
    //         handler: 'NetworkFirst',
    //         options: { cacheName: 'api-data', expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 } },
    //       },
    //     ],
    //   },
    // }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3001/aio-system', changeOrigin: true },
    },
  },
  base: '/aio-system/',
  build: {
    outDir: '../server/public',
    emptyOutDir: true,
  },
});
