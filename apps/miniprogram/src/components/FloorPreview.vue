<script setup lang="ts">
import { getCurrentInstance, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { FloorSource } from "@idv-map/shared";
import { createFloorPreview, type PreviewCanvas } from "../services/floor-preview";
import { floorPreviewCache } from "../services/floor-preview-storage";
import { createPreviewIdle } from "../services/preview-idle";

const props = defineProps<{ sources: FloorSource[]; current: number; ready: boolean; interacting: boolean; foreground: boolean }>();
const idle = createPreviewIdle();
watch(() => props.ready, value => idle.setReady(value), { immediate: true });
watch(() => props.interacting, value => idle.setInteracting(value), { immediate: true });
watch(() => props.foreground, value => idle.setForeground(value), { immediate: true });
watch(() => props.current, () => idle.activity());

const instance = getCurrentInstance();
const mounted = ref(false);
let disposed = false;
let busy = false;
let cancelLoading: (() => void) | undefined;
const preview = createFloorPreview(async () => {
  mounted.value = true;
  await nextTick();
  return new Promise<PreviewCanvas>((resolve, reject) => {
    uni.createSelectorQuery().in(instance!.proxy).select("#floor-preview-canvas")
      .fields({ node: true, size: true }, result => {
        const node = (result as { node?: PreviewCanvas } | null)?.node;
        if (node) resolve(node);
        else reject(new Error("无法创建图片预览，请重试"));
      }).exec();
  });
}, canvas => new Promise<string>((resolve, reject) => {
  uni.canvasToTempFilePath({
    canvas, canvasId: "floor-preview-canvas", x: 0, y: 0,
    width: canvas.width, height: canvas.height,
    destWidth: canvas.width, destHeight: canvas.height, fileType: "png",
    success: result => resolve(result.tempFilePath),
    fail: () => reject(new Error("楼层预览生成失败，请重试")),
  }, instance!.proxy);
}), floorPreviewCache);

function warm() {
  if (disposed || busy || !props.ready || !props.foreground || !props.sources.some(source => source.region)) return;
  // Fail silently; a user-requested preview can retry the same work.
  void preview.prepare(props.sources, { current: props.current, waitForIdle: idle.wait }).catch(() => {});
}
watch(() => [props.sources, props.ready, props.foreground], warm, { flush: "post" });

async function open(sources: FloorSource[], current: number) {
  if (busy || disposed || !sources[current]) return;
  busy = true;
  idle.release();
  // Delay the HUD so cached previews open without a loading flash.
  let loadingShown = false;
  const loadingTimer = setTimeout(() => {
    loadingShown = true;
    uni.showLoading({ title: "正在准备楼层图", mask: true });
  }, 150);
  const stopLoading = () => {
    clearTimeout(loadingTimer);
    if (loadingShown) { uni.hideLoading(); loadingShown = false; }
  };
  cancelLoading = stopLoading;
  try {
    const urls = await preview.prepare(sources);
    stopLoading();
    if (disposed) return;
    uni.previewImage({
      urls, current: urls[current],
      fail: () => { if (!disposed) uni.showToast({ title: "无法打开图片预览，请重试", icon: "none" }); },
    });
  } catch (cause) {
    stopLoading();
    if (!disposed) uni.showToast({ title: cause instanceof Error ? cause.message : "图片预览失败，请重试", icon: "none" });
  } finally {
    stopLoading(); cancelLoading = undefined; busy = false;
  }
}
defineExpose({ open, activity: idle.activity });
onBeforeUnmount(() => { disposed = true; cancelLoading?.(); preview.dispose(); idle.dispose(); });
</script>

<template>
  <canvas v-if="mounted" id="floor-preview-canvas" canvas-id="floor-preview-canvas" type="2d" class="preview-canvas" aria-hidden="true" />
</template>

<style scoped>
.preview-canvas { position: fixed; left: -10px; top: -10px; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
</style>
