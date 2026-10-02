import { defineConfig, loadEnv } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const origin = env.VITE_MAP_API_BASE_URL?.replace(/\/$/, "");
  if (!origin || !/^https:\/\/[^/]+$/.test(origin)) {
    throw new Error("Set VITE_MAP_API_BASE_URL to the HTTPS API origin (see .env.example).");
  }
  // A release build must explicitly select production; never silently ship the test dataset.
  if (mode === "production" && origin === "https://idv-map-dev.321666.xyz") {
    throw new Error("Production builds must not use the development API. Use build:preview for test builds.");
  }
  const appId = env.WECHAT_APP_ID;
  if ((appId && !/^wx[0-9a-f]{16}$/i.test(appId)) || (mode === "production" && !appId)) {
    throw new Error("Set WECHAT_APP_ID to a real WeChat AppID in .env.production.local.");
  }
  return { plugins: [uni(), {
    name: "wechat-project-appid", enforce: "post",
    generateBundle(_options, bundle) {
      if (!appId) return;
      const project = bundle["project.config.json"];
      if (!project || project.type !== "asset") throw new Error("WeChat project configuration was not generated.");
      const config = JSON.parse(String(project.source));
      config.appid = appId;
      project.source = JSON.stringify(config, null, 2);
    },
  }] };
});
