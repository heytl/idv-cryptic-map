<script setup lang="ts">
// 页脚「离线缓存」入口：一键预热全部地图图片，断网也能查图
import { useOfflineCache } from '../composables/useOfflineCache';

const { phase, done, total, error, warm } = useOfflineCache();
</script>

<template>
  <span class="offline-cache">
    <span v-if="phase === 'running'" class="offline-running">缓存中 {{ done }}/{{ total }}…</span>
    <button
      v-else
      class="offline-btn"
      :title="error || '把全部地图图片存到本机，断网也能查图（首次约 13MB）'"
      @click="warm"
    >
      <template v-if="phase === 'done'">✓ 已可离线使用 · 复查</template>
      <template v-else-if="phase === 'error'">离线缓存未完成 · 重试</template>
      <template v-else>离线缓存全部地图</template>
    </button>
  </span>
</template>

<style scoped>
.offline-btn {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  cursor: pointer;
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.offline-btn:hover {
  opacity: 0.8;
}
.offline-running {
  font-variant-numeric: tabular-nums;
}
</style>
