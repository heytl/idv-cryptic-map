<script setup lang="ts">
defineOptions({ options: { virtualHost: true } });
withDefaults(defineProps<{
  name: "comfort" | "compact" | "expand" | "compress" | "rotate" | "reset" | "plus" | "minus" | "close" | "book" | "arrow-left" | "arrow-up-right" | "globe" | "copy" | "check" | "message" | "chevron" | "scan";
  tone?: "brass" | "ink" | "light";
  size?: number;
}>(), { tone: "brass", size: 18 });
</script>

<template>
  <image :src="`/static/icons/${name}-${tone}.png`" mode="aspectFit" aria-hidden="true"
    :style="{ display: 'block', width: `${size}px`, height: `${size}px`, flex: 'none', pointerEvents: 'none' }" />
</template>
