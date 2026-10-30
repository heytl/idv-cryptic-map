import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import vue from "@vitejs/plugin-vue";

// 后台构建到 apps/web/dist/admin，随同一个 Worker 的静态资源一起部署（挂 /admin 路径）。
// 根 build 脚本保证顺序：先 web（会清空 dist）后 admin。
export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, process.cwd(), "").ADMIN_PROXY_TARGET || "http://127.0.0.1:8787";
  const proxy: ProxyOptions = {
    target,
    changeOrigin: true,
    configure(server) {
      server.on("proxyReq", (proxyReq, req) => {
        // 仅转发同源浏览器请求，保留后端的跨站请求防护。
        if (req.headers.origin === `http://${req.headers.host}`) proxyReq.setHeader("Origin", new URL(target).origin);
      });
    },
  };
  return {
  base: "/admin/",
  plugins: [vue()],
  build: {
    outDir: "../web/dist/admin",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": proxy,
      "/r2": proxy,
      "/auth": proxy,
      "^/admin/login(?:\\?.*)?$": proxy,
    },
  },
  };
});
