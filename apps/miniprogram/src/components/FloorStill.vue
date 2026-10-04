<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { fitScale, type FloorSource } from "@idv-map/shared";
import { imageCache } from "../services/images";
import ImageProbe from "./ImageProbe.vue";

const props = defineProps<{ source: FloorSource; width: number; height: number; alignTop?: boolean }>();
const dimensions = ref(imageCache.get(props.source.url));
const failed = ref(false);
const requestId = ref(0);
watch(() => props.source.url, () => { dimensions.value = imageCache.get(props.source.url); failed.value = false; requestId.value++; });
const imageSize = computed(() => dimensions.value ?? (props.source.imageWidth && props.source.imageHeight
  ? { width: props.source.imageWidth, height: props.source.imageHeight } : undefined));
const size = computed(() => props.source.region ?? imageSize.value ?? { width: 0, height: 0 });
const ratio = computed(() => fitScale(size.value, { width: props.width, height: props.height }, 0));
const clipStyle = computed(() => ({
  width: `${size.value.width * ratio.value}px`, height: `${size.value.height * ratio.value}px`,
  left: `${(props.width - size.value.width * ratio.value) / 2}px`,
  top: `${props.alignTop ? 0 : (props.height - size.value.height * ratio.value) / 2}px`,
}));
const imageStyle = computed(() => ({
  width: `${(imageSize.value?.width ?? 0) * ratio.value}px`, height: `${(imageSize.value?.height ?? 0) * ratio.value}px`,
  left: `${-(props.source.region?.x ?? 0) * ratio.value}px`, top: `${-(props.source.region?.y ?? 0) * ratio.value}px`,
}));
function loaded(id: number, url: string, width: number, height: number) {
  if (id === requestId.value && url === props.source.url) dimensions.value = imageCache.remember(url, width, height);
}
</script>
<template>
  <view class="still" aria-hidden="true">
    <ImageProbe v-if="!imageSize && !failed" :key="requestId" :url="source.url" :request-id="requestId" @loaded="loaded" @failed="failed = true" />
    <view v-if="imageSize && !failed" class="still-clip" :style="clipStyle"><image :src="source.url" :webp="true" :style="imageStyle" mode="scaleToFill" @error="failed = true" /></view>
    <text v-if="failed" class="still-message">切换后重试加载</text>
  </view>
</template>
<style scoped>
.still { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.still-clip { position: absolute; overflow: hidden; }
.still-clip image { position: absolute; max-width: none; }
.still-message { position: absolute; top: 45%; width: 100%; text-align: center; color: #b1a58f; }
</style>
