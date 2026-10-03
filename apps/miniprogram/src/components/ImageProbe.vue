<script setup lang="ts">
defineOptions({ options: { virtualHost: true } });
const props = defineProps<{ url: string; requestId: number }>();
const emit = defineEmits<{
  loaded: [requestId: number, url: string, width: number, height: number];
  failed: [requestId: number, url: string, detail: string];
}>();
// An old component's events must keep their original request identity.
const request = { url: props.url, id: props.requestId };
function loaded(event: Event | { detail: { width: number; height: number } }) {
  if ("detail" in event) emit("loaded", request.id, request.url, event.detail.width, event.detail.height);
  else emit("failed", request.id, request.url, "Missing native image dimensions");
}
function failed(event: Event | { detail: { errMsg?: string } }) {
  emit("failed", request.id, request.url, "detail" in event ? event.detail.errMsg ?? "Unknown image error" : "Unknown image error");
}
</script>
<template>
  <image class="image-probe" :src="url" :webp="true" mode="aspectFit" aria-hidden="true" @load="loaded" @error="failed" />
</template>
<style scoped>
.image-probe { position: absolute; left: 0; top: 0; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
</style>
