import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      // 后台发现新版本自动激活（配合下方 skipWaiting），保证“部署即生效”
      registerType: "autoUpdate",
      devOptions: {
        enabled: true, // 允许在 pnpm dev 开发模式下调试 PWA 和 Service Worker
      },
      manifest: {
        name: "加页手记解密手册",
        short_name: "加页手记",
        description: "第五人格“加页手记”多地图、多模式解密攻略手册",
        lang: "zh-CN",
        theme_color: "#1a1410",
        background_color: "#1a1410",
        display: "standalone",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // 预缓存应用壳和图标；地图图片按需缓存或通过离线包主动下载。
        globPatterns: ["**/*.{js,css,html,woff2,png}", "icons/*.webp"],
        runtimeCaching: [
          {
            // 地图大图：访问过才缓存（URL 带内容哈希，天然 immutable，CacheFirst 安全）
            urlPattern: /\/assets\/(?!t-).*\.webp$/,
            handler: "CacheFirst",
            options: {
              cacheName: "map-images",
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Phase 2：R2 直出的地图图片（img.<domain>/maps/**，内容哈希文件名），
            // 规则按路径匹配、与主机名无关，域名定了无需再改
            urlPattern:
              /\/maps\/(entry|entry-thumb|floor1|floor2|full|entrance|entrance-thumb|layout\/(?:full|basement|floor1|floor2))\/[^/]+\.webp$/,
            handler: "CacheFirst",
            options: {
              cacheName: "map-images-r2",
              expiration: {
                maxEntries: 600,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 地图配置：在线永远走网络拿最新；离线回落到最近一次成功拉取的版本
            // 首次离线且无缓存时展示加载失败状态，不内嵌旧版静态地图兜底。
            urlPattern: /\/(?:maps-v[23]\.json|api\/public\/v2\/maps)$/,
            handler: "NetworkFirst",
            options: { cacheName: "maps-config-v3", networkTimeoutSeconds: 3 },
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
    host: true, // 监听 0.0.0.0 开启局域网 IP 访问（手机可通过 http://192.168.x.x:5210 调试）
    // Local Worker provides content and media.
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/maps-v3.json": "http://127.0.0.1:8787",
      "/telemetry": "http://127.0.0.1:8787",
      "/maps-v2.json": "http://127.0.0.1:8787",
      "/r2": "http://127.0.0.1:8787",
    },
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
          const original = info.originalFileNames?.[0] ?? "";
          return original.includes("entry-thumb")
            ? "assets/t-[hash][extname]"
            : "assets/[hash][extname]";
        },
      },
    },
  },
});
