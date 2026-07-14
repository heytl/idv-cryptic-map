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
        <span class="legend-symbol gold-chest"><img src="/icons/treasure.webp" alt="金箱"></span>
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
