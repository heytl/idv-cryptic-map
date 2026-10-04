<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fitScale, type FloorSource } from '@idv-map/shared';

const props = defineProps<{ source: FloorSource; width: number; height: number }>();
const naturalSize = ref({ width: props.source.imageWidth ?? 0, height: props.source.imageHeight ?? 0 });
watch(() => props.source.url, () => { naturalSize.value = { width: props.source.imageWidth ?? 0, height: props.source.imageHeight ?? 0 }; });
const size = computed(() => props.source.region ?? naturalSize.value);
const ratio = computed(() => size.value.width && size.value.height
  ? fitScale(size.value, { width: props.width, height: props.height }) : 0);
const clipStyle = computed(() => ({
  width: `${size.value.width * ratio.value}px`, height: `${size.value.height * ratio.value}px`,
  left: `${(props.width - size.value.width * ratio.value) / 2}px`,
  top: `${(props.height - size.value.height * ratio.value) / 2}px`,
}));
const imageStyle = computed(() => ({
  width: `${naturalSize.value.width * ratio.value}px`, height: `${naturalSize.value.height * ratio.value}px`,
  left: `${-(props.source.region?.x ?? 0) * ratio.value}px`, top: `${-(props.source.region?.y ?? 0) * ratio.value}px`,
}));
function loaded(event: Event) {
  const image = event.target as HTMLImageElement;
  naturalSize.value = { width: image.naturalWidth, height: image.naturalHeight };
}
</script>

<template>
  <div class="floor-still" aria-hidden="true">
    <div class="still-clip" :style="clipStyle">
      <img :src="source.url" :style="imageStyle" alt="" draggable="false" @load="loaded" />
    </div>
  </div>
</template>

<style scoped>
.floor-still { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.still-clip { position: absolute; overflow: hidden; }
.still-clip img { position: absolute; max-width: none; }
</style>
