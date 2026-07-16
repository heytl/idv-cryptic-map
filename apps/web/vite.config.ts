import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      // 后台发现新版本自动激活（配合下方 skipWaiting），保证“部署即生效”
      registerType: 'autoUpdate',
      manifest: {
        name: '加页手记解密手册',
        short_name: '加页手记',
        description: '第五人格“加页手记”侧门入口解密攻略手册',
        lang: 'zh-CN',
        theme_color: '#1a1410',
        background_color: '#1a1410',
        display: 'standalone',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // precache 只放“壳子”：HTML/JS/CSS/字体/图标/入口缩略图（t- 前缀），
        // 13MB 的楼层/全图大图不预缓存，避免首次访问强制全量下载
        globPatterns: ['**/*.{js,css,html,woff2,png}', 'icons/*.webp', 'assets/t-*.webp'],
        runtimeCaching: [
          {
            // 地图大图：访问过才缓存（URL 带内容哈希，天然 immutable，CacheFirst 安全）
            urlPattern: /\/assets\/(?!t-).*\.webp$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-images',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        navigateFallbackDenylist: [/^\/_vercel\//],
      },
    }),
  ],
  server: {
    port: 5210,
  },
  build: {
    // 禁用小资源 base64 内联：缩略图保持独立文件，
    // 改一张图只失效一个文件的缓存，也便于 PWA 按名精确 precache
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // 地图源文件是中文名（如 左-Y门.webp），产物统一用纯 hash 命名，
        // 规避非 ASCII URL 在 CDN / 工具链上的兼容问题；
        // 入口缩略图加 t- 前缀以便 PWA precache 与大图区分
        assetFileNames: (info) => {
          const original = info.originalFileNames?.[0] ?? '';
          return original.includes('entry-thumb')
            ? 'assets/t-[hash][extname]'
            : 'assets/[hash][extname]';
        },
      },
    },
  },
});
