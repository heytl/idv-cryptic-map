<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { NModal, useMessage } from 'naive-ui';
import { crop, loadImage } from '../imageTools';
import RegionEditor, { type RegionResult } from './RegionEditor.vue';
const props = defineProps<{ currentSrc?: string | Blob; fullSrc?: string | Blob; initialFull?: boolean; label: string; lockSquare?: boolean; busy?: boolean }>();
const emit = defineEmits<{ done: [blob: Blob]; cancel: [] }>();
const message = useMessage();
const selected = ref<'current' | 'full' | null>(props.currentSrc && props.fullSrc ? null : props.fullSrc ? 'full' : 'current');
const currentUrl = props.currentSrc instanceof Blob ? URL.createObjectURL(props.currentSrc) : props.currentSrc;
const fullUrl = props.fullSrc instanceof Blob ? URL.createObjectURL(props.fullSrc) : props.fullSrc;
const source = computed(() => selected.value === 'full' ? fullUrl : currentUrl);
const exporting = ref(false);
async function done(result: RegionResult) {
  if (!source.value) return;
  exporting.value = true;
  try {
    const r = result.regions.single!;
    const blob = await crop(await loadImage(source.value), { x: r.x, y: r.y, w: r.width, h: r.height });
    emit('done', blob);
  } catch (e) { message.error(e instanceof Error ? e.message : '裁剪失败，选框已保留'); }
  finally { exporting.value = false; }
}
onBeforeUnmount(() => {
  if (props.currentSrc instanceof Blob && currentUrl) URL.revokeObjectURL(currentUrl);
  if (props.fullSrc instanceof Blob && fullUrl) URL.revokeObjectURL(fullUrl);
});
</script>
<template>
  <n-modal v-if="!selected" :show="true" preset="card" title="选择裁剪来源" style="width: min(420px, 94vw)" @close="emit('cancel')" @update:show="v => !v && emit('cancel')">
    <div class="crop-source-picker"><button @click="selected = 'current'">当前图片</button><button @click="selected = 'full'">从全图裁剪</button></div>
  </n-modal>
  <RegionEditor v-else-if="source" :source="source" :title="`裁剪 · ${label}`" :items="[{ id: 'single', label }]" :square="lockSquare" :allow-square="!!lockSquare" :busy="busy || exporting" @done="done" @cancel="emit('cancel')" />
</template>
<style scoped>
.crop-source-picker { display: flex; gap: 12px; } button { min-height: 44px; padding: 10px 18px; color: inherit; background: #233750; border: 1px solid #6a809b; border-radius: 8px; cursor: pointer; }
</style>
