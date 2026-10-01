<script setup lang="ts">
import type { PixelRect } from '@idv-map/shared';
defineProps<{ src: string; width: number; height: number; rect: PixelRect; label?: string }>();
</script>
<template>
  <svg class="region-preview" :viewBox="`${rect.x} ${rect.y} ${rect.width} ${rect.height}`" role="img" :aria-label="label || '区域预览'">
    <image :href="src" :width="width" :height="height" />
  </svg>
</template>
<style scoped>
.region-preview { display: block; width: 100%; height: 100%; max-height: 200px; overflow: hidden; }
</style>
