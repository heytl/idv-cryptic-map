<script setup lang="ts">
import { watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import { mapsUpdatedAt } from './data/maps';

const route = useRoute();

// 旧站通过 body.strategy-view-active 调整整体布局，保持该约定
watchEffect(() => {
  document.body.classList.toggle('strategy-view-active', route.name === 'map');
});
</script>

<template>
  <!-- 提灯光晕背景 -->
  <div class="glow-bg"></div>

  <div class="app-container">
    <!-- 头部栏 -->
    <header class="app-header">
      <div class="header-decoration left-deco"></div>
      <h1 class="app-title"><span class="en-font">CRYPTIC HANDBOOK</span><br>加页手记解密手册</h1>
      <div class="header-decoration right-deco"></div>
    </header>

    <router-view />

    <!-- 页脚 -->
    <footer class="app-footer">
      <p>© 2026 OUU 第五人格“加页手记”解密手册 | 地图数据源自<a href="https://space.bilibili.com/8618005" target="_blank" class="author-link">凉哈皮</a> </p>
      <p class="footer-meta">
        <span class="update-time">地图数据更新于 {{ mapsUpdatedAt }}</span>
        <span class="footer-divider">·</span>
        <a href="https://github.com/heytl/idv-cryptic-map" target="_blank" class="author-link github-link">
          <svg class="github-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
          GitHub 开源
        </a>
        <span class="footer-divider">·</span>
        <span class="footer-slogan">本项目开源免费，欢迎 Star 与反馈</span>
      </p>
    </footer>
  </div>
</template>
