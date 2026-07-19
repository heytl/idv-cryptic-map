<script setup lang="ts">
// 裁剪工作台：一张原图 → 三个可调框（1楼/2楼/入口）→ 导出 5 张 WebP
// （entry/entryThumb/floor1/floor2/full，全图由 1楼+2楼 自动纵向合成）
// 框体拖拽用 Pointer Events + touch-action:none，鼠标/触屏（iPad）通用
import { NButton, NCheckbox, NModal, useMessage } from 'naive-ui';
import { onBeforeUnmount, reactive, ref } from 'vue';
import { composeFull, crop, loadImage, makeThumb, type Rect } from '../imageTools';
import type { ImgKind } from '../types';

const props = defineProps<{ source: File }>();
const emit = defineEmits<{
  done: [blobs: Partial<Record<ImgKind, Blob>>];
  cancel: [];
}>();

type BoxKey = 'floor1' | 'floor2' | 'entry';
const LABELS: Record<BoxKey, string> = { floor1: '1楼', floor2: '2楼', entry: '入口' };

const message = useMessage();
const imgEl = ref<HTMLImageElement>();
const entryLocked = ref(true); // 入口小图默认锁 1:1（现有 28 张 entry 实测均约 1:1）
const exporting = ref(false);

let natural = { w: 0, h: 0 };
const boxes = reactive<Record<BoxKey, Rect>>({
  floor1: { x: 0, y: 0, w: 0, h: 0 },
  floor2: { x: 0, y: 0, w: 0, h: 0 },
  entry: { x: 0, y: 0, w: 0, h: 0 },
});

const objectUrl = URL.createObjectURL(props.source);
onBeforeUnmount(() => URL.revokeObjectURL(objectUrl));

function onImgLoad() {
  const img = imgEl.value!;
  natural = { w: img.naturalWidth, h: img.naturalHeight };
  // 预置框：左半=1楼、右半=2楼（对应 1280×720 横版素材），入口取中部方形
  Object.assign(boxes.floor1, { x: 0, y: 0, w: natural.w / 2, h: natural.h });
  Object.assign(boxes.floor2, { x: natural.w / 2, y: 0, w: natural.w / 2, h: natural.h });
  const s = Math.round(natural.h * 0.3);
  Object.assign(boxes.entry, { x: Math.round((natural.w - s) / 2), y: Math.round((natural.h - s) / 2), w: s, h: s });
}

/** 显示坐标 = 自然坐标 × scale */
function scale(): number {
  return imgEl.value ? imgEl.value.clientWidth / natural.w : 1;
}

function boxStyle(key: BoxKey) {
  const s = scale();
  const b = boxes[key];
  return { left: `${b.x * s}px`, top: `${b.y * s}px`, width: `${b.w * s}px`, height: `${b.h * s}px` };
}

// 指针拖拽：move（框体）或 resize（右下角手柄）
let drag: { key: BoxKey; mode: 'move' | 'resize'; startX: number; startY: number; orig: Rect } | null = null;

function onPointerDown(e: PointerEvent, key: BoxKey, mode: 'move' | 'resize') {
  e.preventDefault();
  e.stopPropagation();
  drag = { key, mode, startX: e.clientX, startY: e.clientY, orig: { ...boxes[key] } };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp, { once: true });
}

function onPointerMove(e: PointerEvent) {
  if (!drag) return;
  const s = scale();
  const dx = (e.clientX - drag.startX) / s;
  const dy = (e.clientY - drag.startY) / s;
  const b = boxes[drag.key];
  const o = drag.orig;
  if (drag.mode === 'move') {
    b.x = clamp(o.x + dx, 0, natural.w - b.w);
    b.y = clamp(o.y + dy, 0, natural.h - b.h);
  } else {
    b.w = clamp(o.w + dx, 40, natural.w - b.x);
    b.h = drag.key === 'entry' && entryLocked.value ? b.w : clamp(o.h + dy, 40, natural.h - b.y);
    if (b.y + b.h > natural.h) b.h = natural.h - b.y;
    if (drag.key === 'entry' && entryLocked.value) b.w = b.h; // 高度被钳制时保持方形
  }
}

function onPointerUp() {
  drag = null;
  window.removeEventListener('pointermove', onPointerMove);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

async function exportAll() {
  exporting.value = true;
  try {
    const img = await loadImage(props.source);
    const entry = await crop(img, boxes.entry);
    const blobs: Partial<Record<ImgKind, Blob>> = {
      entry,
      entryThumb: await makeThumb(entry),
      floor1: await crop(img, boxes.floor1),
      floor2: await crop(img, boxes.floor2),
      full: await composeFull(img, boxes.floor1, boxes.floor2),
    };
    emit('done', blobs);
  } catch (e) {
    message.error(e instanceof Error ? e.message : '导出失败');
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <n-modal
    :show="true"
    preset="card"
    title="裁剪工作台"
    class="workbench-modal"
    :mask-closable="false"
    @update:show="(v: boolean) => v || emit('cancel')"
    @close="emit('cancel')"
  >
    <p class="muted" style="margin-top: 0">拖动框体调整位置，拖右下角手柄调整大小（触屏可直接拖）。全图与缩略图会自动生成。</p>
    <div class="workbench-stage">
      <img ref="imgEl" :src="objectUrl" alt="原图" @load="onImgLoad" />
      <div
        v-for="key in (['floor1', 'floor2', 'entry'] as const)"
        :key="key"
        class="crop-box"
        :class="key"
        :style="boxStyle(key)"
        @pointerdown="onPointerDown($event, key, 'move')"
      >
        <span class="tag">{{ LABELS[key] }}</span>
        <span class="handle" @pointerdown="onPointerDown($event, key, 'resize')"></span>
      </div>
    </div>
    <div class="dialog-actions">
      <n-checkbox v-model:checked="entryLocked">入口框锁定 1:1</n-checkbox>
      <span class="spacer"></span>
      <n-button @click="emit('cancel')">取消</n-button>
      <n-button type="primary" :loading="exporting" @click="exportAll">生成 5 张图</n-button>
    </div>
  </n-modal>
</template>
