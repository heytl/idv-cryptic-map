<script setup lang="ts">
import type { PixelRect } from '@idv-map/shared';
import { useId } from 'vue';
defineProps<{ src: string; width: number; height: number; rect: PixelRect; label?: string }>();
const clipId = useId();
</script>
<template>
  <svg class="region-preview" :viewBox="`${rect.x} ${rect.y} ${rect.width} ${rect.height}`" role="img" :aria-label="label || '区域预览'">
    <defs><clipPath :id="clipId" clipPathUnits="userSpaceOnUse"><rect :x="rect.x" :y="rect.y" :width="rect.width" :height="rect.height" /></clipPath></defs>
    <image :href="src" :width="width" :height="height" :clip-path="`url(#${clipId})`" />
  </svg>
</template>
<style scoped>
.region-preview { display: block; width: 100%; height: 100%; overflow: hidden; }
</style>
