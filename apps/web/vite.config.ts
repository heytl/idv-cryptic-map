import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        // 地图源文件是中文名（如 左-Y门.webp），产物统一用纯 hash 命名，
        // 规避非 ASCII URL 在 CDN / 工具链上的兼容问题
        assetFileNames: 'assets/[hash][extname]',
      },
    },
  },
});
