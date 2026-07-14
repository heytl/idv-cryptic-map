<script setup lang="ts">
const compact = defineModel<boolean>({ required: true });
</script>

<template>
  <!-- 卡片密度切换器 (标准/紧凑, 复用楼层切换的滑块设计语言) -->
  <div
    id="density-switch"
    class="density-switch"
    :class="{ 'compact-active': compact }"
    role="group"
    aria-label="卡片密度切换"
  >
    <button
      class="density-opt"
      :class="{ active: !compact }"
      data-density="comfort"
      title="标准视图"
      :aria-pressed="!compact"
      @click="compact = false"
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <rect x="1" y="1" width="6" height="6" rx="1"/>
        <rect x="9" y="1" width="6" height="6" rx="1"/>
        <rect x="1" y="9" width="6" height="6" rx="1"/>
        <rect x="9" y="9" width="6" height="6" rx="1"/>
      </svg>
    </button>
    <button
      class="density-opt"
      :class="{ active: compact }"
      data-density="compact"
      title="紧凑视图：一行显示更多卡片"
      :aria-pressed="compact"
      @click="compact = true"
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <rect x="1" y="1" width="4" height="4" rx="0.5"/>
        <rect x="6" y="1" width="4" height="4" rx="0.5"/>
        <rect x="11" y="1" width="4" height="4" rx="0.5"/>
        <rect x="1" y="6" width="4" height="4" rx="0.5"/>
        <rect x="6" y="6" width="4" height="4" rx="0.5"/>
        <rect x="11" y="6" width="4" height="4" rx="0.5"/>
        <rect x="1" y="11" width="4" height="4" rx="0.5"/>
        <rect x="6" y="11" width="4" height="4" rx="0.5"/>
        <rect x="11" y="11" width="4" height="4" rx="0.5"/>
      </svg>
    </button>
    <div class="density-slider"></div>
  </div>
</template>
