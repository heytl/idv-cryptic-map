<script setup lang="ts">
// 单图裁剪：可裁剪当前成品，也可切换到全图重新框选。
// 入口图默认锁 1:1；导出仍是 WebP，入口图由调用方顺带重生成缩略图。
import { NButton, NCheckbox, NModal, useMessage } from 'naive-ui';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { createBoxDrag } from '../cropBox';
import { crop, loadImage, type Rect } from '../imageTools';

const props = defineProps<{
  currentSrc?: string | Blob;
  fullSrc?: string | Blob;
  initialFull?: boolean;
  label: string;
  lockSquare?: boolean;
}>();
const emit = defineEmits<{ done: [blob: Blob]; cancel: [] }>();

const message = useMessage();
const imgEl = ref<HTMLImageElement>();
const locked = ref(props.lockSquare ?? false);
const exporting = ref(false);
const usingFull = ref(props.initialFull ?? !props.currentSrc);
const currentObjectUrl = props.currentSrc instanceof Blob ? URL.createObjectURL(props.currentSrc) : '';
const fullObjectUrl = props.fullSrc instanceof Blob ? URL.createObjectURL(props.fullSrc) : '';
const displaySrc = computed(() => {
  const value = usingFull.value ? props.fullSrc : props.currentSrc;
  if (typeof value === 'string') return value;
  return usingFull.value ? fullObjectUrl : currentObjectUrl;
});
const activeSrc = computed(() => usingFull.value ? props.fullSrc : props.currentSrc);
onBeforeUnmount(() => {
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  if (fullObjectUrl) URL.revokeObjectURL(fullObjectUrl);
});

let natural = { w: 0, h: 0 };
const boxes = reactive<{ box: Rect }>({ box: { x: 0, y: 0, w: 0, h: 0 } });

function initBox() {
  if (locked.value) {
    const s = Math.min(natural.w, natural.h);
    Object.assign(boxes.box, { x: Math.round((natural.w - s) / 2), y: Math.round((natural.h - s) / 2), w: s, h: s });
  } else {
    Object.assign(boxes.box, { x: 0, y: 0, w: natural.w, h: natural.h });
  }
}

function onImgLoad() {
  const img = imgEl.value!;
  natural = { w: img.naturalWidth, h: img.naturalHeight };
  initBox();
}

// 切换锁定时把当前框收成合法的正方形
watch(locked, (v) => {
  if (!v || natural.w === 0) return;
  const b = boxes.box;
  const s = Math.min(b.w, b.h);
  b.w = s;
  b.h = s;
});

const { onPointerDown, boxStyle } = createBoxDrag<'box'>({
  boxes,
  natural: () => natural,
  scale: () => (imgEl.value ? imgEl.value.clientWidth / natural.w : 1),
  lockSquare: () => locked.value,
});

async function exportOne() {
  if (!activeSrc.value) return;
  exporting.value = true;
  try {
    const img = await loadImage(activeSrc.value);
    emit('done', await crop(img, boxes.box));
  } catch (e) {
    message.error(e instanceof Error ? e.message : '裁剪失败');
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <n-modal
    :show="true"
    preset="card"
    :title="`裁剪 · ${label}`"
    class="workbench-modal"
    :mask-closable="false"
    @update:show="(v: boolean) => v || emit('cancel')"
    @close="emit('cancel')"
  >
    <p class="muted" style="margin-top: 0">拖动框体调整位置，拖右下角手柄调整大小。</p>
    <div v-if="fullSrc" class="crop-source-actions">
      <span class="muted">裁剪来源：</span>
      <n-button v-if="currentSrc" size="small" :type="usingFull ? 'default' : 'primary'" @click="usingFull = false">
        当前图片
      </n-button>
      <n-button size="small" :type="usingFull ? 'primary' : 'default'" @click="usingFull = true">
        从全图裁剪
      </n-button>
    </div>
    <div class="workbench-stage">
      <img :key="displaySrc" ref="imgEl" :src="displaySrc" alt="待裁剪图" @load="onImgLoad" />
      <div class="crop-box single" :style="boxStyle('box')" @pointerdown="onPointerDown($event, 'box', 'move')">
        <span class="tag">{{ label }}</span>
        <span class="handle" @pointerdown="onPointerDown($event, 'box', 'resize')"></span>
      </div>
    </div>
    <div class="dialog-actions">
      <n-checkbox v-model:checked="locked">锁定 1:1</n-checkbox>
      <n-button size="small" @click="initBox">重置框选</n-button>
      <span class="spacer"></span>
      <n-button @click="emit('cancel')">取消</n-button>
      <n-button type="primary" :loading="exporting" @click="exportOne">裁剪并保存</n-button>
    </div>
  </n-modal>
</template>
