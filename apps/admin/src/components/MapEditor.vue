<script setup lang="ts">
// 编辑/新增地图：元数据表单 + 四张图（整体裁剪 or 单张替换）
// 图片上传即入 R2（哈希命名，废弃对象无害），但配置要点底部「保存」才生效
import { computed, reactive, ref } from 'vue';
import { uploadImages } from '../api';
import { fileToWebp, makeThumb } from '../imageTools';
import { DIRECTIONS, missingImages, type ImgKind, type StoredMap } from '../types';
import CropWorkbench from './CropWorkbench.vue';

const props = defineProps<{ map: StoredMap }>();
const emit = defineEmits<{ apply: [map: StoredMap]; cancel: [] }>();

// 编辑副本，点「应用」才写回列表
const draft = reactive<StoredMap>(JSON.parse(JSON.stringify(props.map)));

const busy = ref('');
const error = ref('');
const cropSource = ref<File | null>(null);

const SLOTS: { kind: ImgKind; label: string }[] = [
  { kind: 'entry', label: '入口' },
  { kind: 'floor1', label: '1楼' },
  { kind: 'floor2', label: '2楼' },
  { kind: 'full', label: '全图' },
];

const missing = computed(() => missingImages(draft));

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

async function openWorkbench() {
  const file = await pickFile('image/*');
  if (file) cropSource.value = file;
}

async function onCropped(blobs: Partial<Record<ImgKind, Blob>>) {
  const source = cropSource.value!;
  cropSource.value = null;
  await doUpload(blobs, source);
}

/** 单张替换：任意格式转 WebP；换入口图时自动重生成缩略图 */
async function replaceOne(kind: ImgKind) {
  const file = await pickFile('image/*');
  if (!file) return;
  busy.value = `处理 ${kind} …`;
  try {
    const webp = await fileToWebp(file);
    const blobs: Partial<Record<ImgKind, Blob>> = { [kind]: webp };
    if (kind === 'entry') blobs.entryThumb = await makeThumb(webp);
    await doUpload(blobs);
  } catch (e) {
    error.value = e instanceof Error ? e.message : '处理失败';
  } finally {
    busy.value = '';
  }
}

async function doUpload(blobs: Partial<Record<ImgKind, Blob>>, source?: File) {
  busy.value = '上传图片…';
  error.value = '';
  try {
    const res = await uploadImages(blobs, { source, mapId: draft.id });
    draft.images = { ...draft.images, ...res.images };
    if (res.sourceKey) draft.sourceKey = res.sourceKey;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '上传失败';
  } finally {
    busy.value = '';
  }
}

function apply() {
  if (!draft.name.trim() || !draft.displayName.trim()) {
    error.value = '逻辑名与展示名不能为空';
    return;
  }
  emit('apply', JSON.parse(JSON.stringify(draft)));
}
</script>

<template>
  <div class="overlay">
    <div class="dialog">
      <h2>{{ draft.id }} · {{ draft.displayName || '新增地图' }}</h2>

      <div class="form-grid">
        <label>逻辑名</label>
        <input v-model="draft.name" placeholder="如 左-Y门（稳定标识，改名请改展示名）" />
        <label>展示名</label>
        <input v-model="draft.displayName" placeholder="可带「（新）」等后缀" />
        <label>方向</label>
        <select v-model="draft.direction">
          <option v-for="d in DIRECTIONS" :key="d" :value="d">{{ d }}</option>
        </select>
        <label>发布</label>
        <label class="muted"><input v-model="draft.published" type="checkbox" :true-value="true" :false-value="false" /> 出现在前台（草稿不下发）</label>
        <label>备注</label>
        <textarea v-model="draft.remarks" class="wide" rows="2" placeholder="入口墙体结构特征"></textarea>
      </div>

      <div class="img-slots">
        <div v-for="s in SLOTS" :key="s.kind" class="img-slot" :class="{ missing: missing.includes(s.kind) }">
          <img v-if="draft.images?.[s.kind]" :src="draft.images[s.kind]" :alt="s.label" loading="lazy" />
          <div v-else style="aspect-ratio: 1; display: flex; align-items: center; justify-content: center" class="muted">缺失</div>
          <div class="k">{{ s.label }}</div>
          <button class="small" :disabled="!!busy" @click="replaceOne(s.kind)">换图</button>
        </div>
      </div>

      <div class="toolbar">
        <button :disabled="!!busy" @click="openWorkbench">上传原图整体裁剪（1楼/2楼/入口 → 自动出 5 张）</button>
        <span v-if="draft.sourceKey" class="muted">原图留档: {{ draft.sourceKey }}</span>
        <span class="spacer"></span>
        <span v-if="busy" class="muted">{{ busy }}</span>
        <span v-if="error" class="muted" style="color: var(--danger)">{{ error }}</span>
        <button @click="emit('cancel')">取消</button>
        <button class="primary" :disabled="!!busy" @click="apply">应用（还需底部保存生效）</button>
      </div>
    </div>

    <CropWorkbench v-if="cropSource" :source="cropSource" @done="onCropped" @cancel="cropSource = null" />
  </div>
</template>
