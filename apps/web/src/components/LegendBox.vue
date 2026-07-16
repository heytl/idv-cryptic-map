<script setup lang="ts">
// public/ 下的图标用字符串绑定而非模板字面量 src：
// 绝对路径 src 会被资产转换层当作模块解析，在 Windows 下的 vitest 中直接报错
const treasureUrl = import.meta.env.BASE_URL + 'icons/treasure.webp';
</script>

<template>
  <div class="legend-box">
    <h4 class="legend-title">图示说明</h4>
    <div class="legend-grid">
      <div class="legend-item">
        <span class="legend-label">主要路线</span>
        <span class="legend-line red"></span>
      </div>
      <div class="legend-item">
        <span class="legend-label">次要路线</span>
        <span class="legend-line blue"></span>
      </div>
      <div class="legend-item">
        <span class="legend-label">金箱点</span>
        <span class="legend-symbol gold-chest"><img :src="treasureUrl" alt="金箱"></span>
      </div>
      <div class="legend-item">
        <span class="legend-label">上/下层移动</span>
        <span class="legend-arrow">⇅</span>
      </div>
      <div class="legend-item">
        <span class="legend-label">起点</span>
        <span class="legend-shape green-triangle">▲</span>
      </div>
      <div class="legend-item">
        <span class="legend-label">终点</span>
        <span class="legend-shape green-circle">●</span>
      </div>
    </div>
  </div>
</template>
