<script setup lang="ts">
// V2 整体裁剪：一张原图按模式导出楼层、当前入口、入口缩略图与自动合成全图。
import type { GameMode } from '@idv-map/shared';
import { NButton, NCheckbox, NModal, useMessage } from 'naive-ui';
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { createBoxDrag } from '../cropBox';
import { composeFull, crop, loadImage, makeThumb, type Rect, type V2CropOutput } from '../imageTools';

const props = defineProps<{ source: Blob; mode: GameMode; entranceLabel: string }>();
const emit = defineEmits<{ done: [blobs: V2CropOutput]; cancel: [] }>();

type BoxKey = 'basement' | 'floor1' | 'floor2' | 'entrance';
const LABELS: Record<BoxKey, string> = {
  basement: '地下室',
  floor1: '一楼',
  floor2: '二楼',
  entrance: '入口',
};

const message = useMessage();
const imgEl = ref<HTMLImageElement>();
const entranceLocked = ref(true);
const exporting = ref(false);
const layoutKeys = computed<Exclude<BoxKey, 'entrance'>[]>(() =>
  props.mode === 'nightmare' ? ['basement', 'floor1', 'floor2'] : ['floor1', 'floor2'],
);
const activeKeys = computed<BoxKey[]>(() => [...layoutKeys.value, 'entrance']);

let natural = { w: 0, h: 0 };
const boxes = reactive<Record<BoxKey, Rect>>({
  basement: { x: 0, y: 0, w: 0, h: 0 },
  floor1: { x: 0, y: 0, w: 0, h: 0 },
  floor2: { x: 0, y: 0, w: 0, h: 0 },
  entrance: { x: 0, y: 0, w: 0, h: 0 },
});

const objectUrl = URL.createObjectURL(props.source);
onBeforeUnmount(() => URL.revokeObjectURL(objectUrl));

function onImgLoad(): void {
  const image = imgEl.value!;
  natural = { w: image.naturalWidth, h: image.naturalHeight };

  // 困难默认左右二等分；噩梦默认三等分。框可任意拖动、重叠和缩放。
  const width = natural.w / layoutKeys.value.length;
  layoutKeys.value.forEach((key, index) => {
    Object.assign(boxes[key], { x: width * index, y: 0, w: width, h: natural.h });
  });
  const size = Math.max(40, Math.round(Math.min(natural.w, natural.h) * 0.3));
  Object.assign(boxes.entrance, {
    x: Math.round((natural.w - size) / 2),
    y: Math.round((natural.h - size) / 2),
    w: size,
    h: size,
  });
}

const { onPointerDown, boxStyle } = createBoxDrag<BoxKey>({
  boxes,
  natural: () => natural,
  scale: () => (imgEl.value ? imgEl.value.clientWidth / natural.w : 1),
  lockSquare: (key) => key === 'entrance' && entranceLocked.value,
});

async function exportAll(): Promise<void> {
  exporting.value = true;
  try {
    const image = await loadImage(props.source);
    const entrance = await crop(image, boxes.entrance);
    const result: V2CropOutput = {
      entrance,
      entranceThumb: await makeThumb(entrance),
      floor1: await crop(image, boxes.floor1),
      floor2: await crop(image, boxes.floor2),
      full: await composeFull(image, boxes.floor1, boxes.floor2),
    };
    if (props.mode === 'nightmare') result.basement = await crop(image, boxes.basement);
    emit('done', result);
  } catch (error) {
    message.error(error instanceof Error ? error.message : '裁剪导出失败');
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <n-modal
    :show="true"
    preset="card"
    :title="`V2 整体裁剪 · ${entranceLabel}`"
    class="workbench-modal"
    :mask-closable="false"
    @update:show="(value: boolean) => value || emit('cancel')"
    @close="emit('cancel')"
  >
    <p class="muted" style="margin-top: 0">
      拖动框体调整位置，拖右下角手柄调整大小。全图由一楼和二楼自动纵向合成；地下室保持单独图片。
    </p>
    <div class="workbench-stage">
      <img ref="imgEl" :src="objectUrl" alt="V2 裁剪原图" @load="onImgLoad" />
      <div
        v-for="key in activeKeys"
        :key="key"
        class="crop-box"
        :class="key"
        :style="boxStyle(key)"
        @pointerdown="onPointerDown($event, key, 'move')"
      >
        <span class="tag">{{ key === 'entrance' ? entranceLabel : LABELS[key] }}</span>
        <span class="handle" @pointerdown="onPointerDown($event, key, 'resize')"></span>
      </div>
    </div>
    <div class="dialog-actions">
      <n-checkbox v-model:checked="entranceLocked">入口框锁定 1:1</n-checkbox>
      <span class="muted">将生成 {{ mode === 'nightmare' ? 6 : 5 }} 张图</span>
      <span class="spacer"></span>
      <n-button @click="emit('cancel')">取消</n-button>
      <n-button type="primary" :loading="exporting" @click="exportAll">裁剪、生成并上传</n-button>
    </div>
  </n-modal>
</template>
