import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 后台构建到 apps/web/dist/admin，随同一个 Worker 的静态资源一起部署（挂 /admin 路径）。
// 根 build 脚本保证顺序：先 web（会清空 dist）后 admin。
export default defineConfig({
  base: '/admin/',
  plugins: [vue()],
  build: {
    outDir: '../web/dist/admin',
    emptyOutDir: true,
  },
  server: {
    // 本地联调：UI 走 vite 热更，数据走 wrangler dev（先起 `npx wrangler dev --env dev --local`）
    proxy: {
      '/api': 'http://localhost:8787',
      '/maps.json': 'http://localhost:8787',
      '/r2': 'http://localhost:8787',
    },
  },
});
