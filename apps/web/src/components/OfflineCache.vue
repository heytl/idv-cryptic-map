<script setup lang="ts">
// 页脚「离线缓存」入口：一键预热全部地图图片，断网也能查图；支持一键清除释放本地存储空间
import { useOfflineCache } from '../composables/useOfflineCache';

const { phase, done, total, error, warm, clear } = useOfflineCache();
</script>

<template>
  <span class="offline-cache">
    <span v-if="phase === 'running'" class="offline-running">缓存中 {{ done }}/{{ total }}…</span>
    <template v-else-if="phase === 'done'">
      <button
        class="offline-btn"
        title="重新校验并增量补全全部地图图片"
        @click="warm"
      >
        ✓ 已可离线使用 · 复查
      </button>
      <span class="footer-divider">·</span>
      <button
        class="offline-clear-btn"
        title="清除已存到本机的全部地图离线缓存，释放磁盘空间"
        @click="clear"
      >
        清除缓存
      </button>
    </template>
    <button
      v-else
      class="offline-btn"
      :title="error || '把全部地图图片存到本机，断网也能查图（首次约 13MB）'"
      @click="warm"
    >
      <template v-if="phase === 'error'">离线缓存未完成 · 重试</template>
      <template v-else>离线缓存全部地图</template>
    </button>
  </span>
</template>

<style scoped>
.offline-cache {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.offline-btn,
.offline-clear-btn {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  cursor: pointer;
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.offline-btn:hover,
.offline-clear-btn:hover {
  opacity: 0.8;
}
.offline-running {
  font-variant-numeric: tabular-nums;
}
.footer-divider {
  opacity: 0.5;
}
</style>
