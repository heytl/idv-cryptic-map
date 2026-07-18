import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

const MAPS_JSON = fileURLToPath(new URL('./src/data/maps.json', import.meta.url));
const MAPS_SNAPSHOT = fileURLToPath(new URL('./src/data/maps.snapshot.json', import.meta.url));
const MAPS_ASSETS_DIR = fileURLToPath(new URL('./src/assets/maps', import.meta.url));

// 静态 /maps.json 的数据源：Cron 快照存在时优先（滞后 ≤1 天），否则用 maps.json。
// 快照里的 images 是 /r2 相对 URL，纯静态场景（Vercel 镜像 / Worker 摘除 / vite dev）
// 不可达——本地资源齐全的记录删掉 images，让前端按逻辑名走产物图；只有产物里
// 没有的新图保留 /r2 URL。快照不合法时整份退回 maps.json。
function readMapsJson(): string {
  if (!existsSync(MAPS_SNAPSHOT)) return readFileSync(MAPS_JSON, 'utf-8');
  try {
    const snapshot = JSON.parse(readFileSync(MAPS_SNAPSHOT, 'utf-8')) as {
      maps?: { name?: string; images?: unknown }[];
    };
    if (!Array.isArray(snapshot.maps) || snapshot.maps.length === 0) throw new Error('快照为空');
    for (const m of snapshot.maps) {
      const kinds = ['entry', 'floor1', 'floor2', 'full'];
      if (kinds.every((k) => existsSync(join(MAPS_ASSETS_DIR, k, `${m.name}.webp`)))) {
        delete m.images;
      }
    }
    return JSON.stringify(snapshot, null, 2) + '\n';
  } catch {
    return readFileSync(MAPS_JSON, 'utf-8');
  }
}

// 向 dist 输出 /maps.json 静态快照（与打包进 JS 的兜底数据同源）：
// Worker 未接管或 KV 无数据时，该 URL 由静态资源服务，前端 fetch 路径始终闭环；
// dev 下用中间件模拟同一 URL，保证开发态与线上数据流一致
function mapsJsonSnapshot(): Plugin {
  return {
    name: 'maps-json-snapshot',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'maps.json', source: readMapsJson() });
    },
    configureServer(server) {
      server.middlewares.use('/maps.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(readMapsJson());
      });
    },
  };
}

export default defineConfig({
  plugins: [
    vue(),
    mapsJsonSnapshot(),
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
          {
            // Phase 2：R2 直出的地图图片（img.<domain>/maps/**，内容哈希文件名），
            // 规则按路径匹配、与主机名无关，域名定了无需再改
            urlPattern: /\/maps\/(entry|entry-thumb|floor1|floor2|full)\/[^/]+\.webp$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-images-r2',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 地图配置：在线永远走网络拿最新；离线回落到最近一次成功拉取的版本
            // （比打包快照更新），彻底断网首次访问则由 JS 内嵌兜底数据接管
            urlPattern: /\/maps\.json$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'maps-config', networkTimeoutSeconds: 3 },
          },
        ],
        // 前台是纯 hash 路由（createWebHashHistory），真实 pathname 永远只有 "/"——
        // 用白名单而非黑名单兜底导航：只有 "/" 允许被 SW 接管离线兜底，其余一律放行给网络，
        // 天然免疫 /admin、/api、/r2、/cdn-cgi（Access 登录回调）等任何现在或未来的系统路径，
        // 不必逐个记黑名单（History 曾因漏记 /cdn-cgi 导致 Access 登录回调被 SW 缓存壳子劫持）
        navigateFallbackAllowlist: [/^\/$/],
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
