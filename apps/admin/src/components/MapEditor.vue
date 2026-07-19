<script setup lang="ts">
// 编辑/新增地图：元数据表单 + 四张图（整体裁剪 or 单张替换）
// 图片上传即入 R2（哈希命名，废弃对象无害），但配置要点底部「保存」才生效
import {
  NButton,
  NForm,
  NFormItem,
  NImage,
  NInput,
  NModal,
  NRadioButton,
  NRadioGroup,
  NSwitch,
  useMessage,
  type FormInst,
  type FormItemRule,
  type FormRules,
} from 'naive-ui';
import { computed, reactive, ref } from 'vue';
import { uploadImages } from '../api';
import { fileToWebp, makeThumb } from '../imageTools';
import { DIRECTIONS, missingImages, type Direction, type ImgKind, type StoredMap } from '../types';
import CropSingle from './CropSingle.vue';
import CropWorkbench from './CropWorkbench.vue';

const props = defineProps<{ map: StoredMap }>();
const emit = defineEmits<{ apply: [map: StoredMap]; cancel: [] }>();

const message = useMessage();

// 编辑副本，点「应用」才写回列表
const draft = reactive<StoredMap>(JSON.parse(JSON.stringify(props.map)));

const busy = ref('');
const cropSource = ref<Blob | null>(null);
const cropFromArchive = ref(false); // 留档原图重裁时不再重复上传原图
const recrop = ref<{ kind: ImgKind; label: string; src: string } | null>(null);
const formRef = ref<FormInst | null>(null);

const requiredRule = (label: string): FormItemRule => ({
  required: true,
  trigger: ['input', 'blur'],
  validator: (_r: FormItemRule, v: string) => (v?.trim() ? true : new Error(`${label}不能为空`)),
});
const rules: FormRules = { name: requiredRule('逻辑名'), displayName: requiredRule('展示名') };

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
  if (!file) return;
  cropFromArchive.value = false;
  cropSource.value = file;
}

/** 留档原图二次裁剪：从 R2 拉回原图，重开三框工作台重出 5 张 */
async function recropArchive() {
  if (!draft.sourceKey) return;
  busy.value = '加载留档原图…';
  try {
    const res = await fetch(`/r2/${draft.sourceKey}`);
    if (!res.ok) throw new Error(`留档原图加载失败（${res.status}）`);
    cropFromArchive.value = true;
    cropSource.value = await res.blob();
  } catch (e) {
    message.error(e instanceof Error ? e.message : '留档原图加载失败');
  } finally {
    busy.value = '';
  }
}

async function onCropped(blobs: Partial<Record<ImgKind, Blob>>) {
  const source = cropFromArchive.value ? undefined : (cropSource.value as File);
  cropSource.value = null;
  await doUpload(blobs, source);
}

/** 单图二次裁剪：打开当前图；完成后上传替换（入口图顺带重生成缩略图） */
function openRecrop(kind: ImgKind, label: string) {
  const src = draft.images?.[kind];
  if (src) recrop.value = { kind, label, src };
}

async function onRecropped(blob: Blob) {
  const kind = recrop.value!.kind;
  recrop.value = null;
  try {
    const blobs: Partial<Record<ImgKind, Blob>> = { [kind]: blob };
    if (kind === 'entry') {
      busy.value = '生成缩略图…';
      blobs.entryThumb = await makeThumb(blob);
    }
    await doUpload(blobs);
  } catch (e) {
    message.error(e instanceof Error ? e.message : '处理失败');
  } finally {
    busy.value = '';
  }
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
    message.error(e instanceof Error ? e.message : '处理失败');
  } finally {
    busy.value = '';
  }
}

async function doUpload(blobs: Partial<Record<ImgKind, Blob>>, source?: File) {
  busy.value = '上传图片…';
  try {
    const res = await uploadImages(blobs, { source, mapId: draft.id });
    draft.images = { ...draft.images, ...res.images };
    if (res.sourceKey) draft.sourceKey = res.sourceKey;
  } catch (e) {
    message.error(e instanceof Error ? e.message : '上传失败');
  } finally {
    busy.value = '';
  }
}

async function apply() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  emit('apply', JSON.parse(JSON.stringify(draft)));
}
</script>

<template>
  <n-modal
    :show="true"
    preset="card"
    class="editor-modal"
    :title="`#${draft.id} · ${draft.displayName || '新增地图'}`"
    :mask-closable="false"
    @update:show="(v: boolean) => v || emit('cancel')"
    @close="emit('cancel')"
  >
    <n-form ref="formRef" :model="draft" :rules="rules" label-placement="top" :show-require-mark="false">
      <div class="form-cols">
        <n-form-item label="逻辑名" path="name">
          <n-input v-model:value="draft.name" placeholder="如 左-Y门（稳定标识，改名请改展示名）" />
        </n-form-item>
        <n-form-item label="展示名" path="displayName">
          <n-input v-model:value="draft.displayName" placeholder="可带「（新）」等后缀" />
        </n-form-item>
        <n-form-item label="方向">
          <n-radio-group :value="draft.direction" @update:value="(v: string) => (draft.direction = v as Direction)">
            <n-radio-button v-for="d in DIRECTIONS" :key="d" :value="d">{{ d }}</n-radio-button>
          </n-radio-group>
        </n-form-item>
        <n-form-item label="发布">
          <n-switch :value="draft.published !== false" @update:value="(v: boolean) => (draft.published = v)" />
          <span class="muted" style="margin-left: 10px">出现在前台（草稿不下发）</span>
        </n-form-item>
        <n-form-item label="备注" class="full">
          <n-input v-model:value="draft.remarks" type="textarea" :rows="2" placeholder="入口墙体结构特征" />
        </n-form-item>
      </div>
    </n-form>

    <div class="img-slots">
      <div v-for="s in SLOTS" :key="s.kind" class="img-slot" :class="{ missing: missing.includes(s.kind) }">
        <div class="frame">
          <n-image v-if="draft.images?.[s.kind]" :src="draft.images[s.kind]" object-fit="contain" lazy />
          <span v-else class="muted">缺失</span>
        </div>
        <div class="k">{{ s.label }}</div>
        <div class="row-actions" style="justify-content: center">
          <n-button size="tiny" :disabled="!!busy" @click="replaceOne(s.kind)">换图</n-button>
          <n-button size="tiny" :disabled="!!busy || !draft.images?.[s.kind]" @click="openRecrop(s.kind, s.label)">
            裁剪
          </n-button>
        </div>
      </div>
    </div>

    <div class="dialog-actions">
      <n-button :disabled="!!busy" @click="openWorkbench">上传原图整体裁剪（1楼/2楼/入口 → 自动出 5 张）</n-button>
      <n-button v-if="draft.sourceKey" :disabled="!!busy" @click="recropArchive">重新裁剪留档原图</n-button>
      <span v-if="draft.sourceKey" class="muted">原图留档: {{ draft.sourceKey }}</span>
      <span class="spacer"></span>
      <span v-if="busy" class="muted">{{ busy }}</span>
      <n-button @click="emit('cancel')">取消</n-button>
      <n-button type="primary" :loading="!!busy" @click="apply">应用（还需底部保存生效）</n-button>
    </div>

    <CropWorkbench v-if="cropSource" :source="cropSource" @done="onCropped" @cancel="cropSource = null" />
    <CropSingle
      v-if="recrop"
      :src="recrop.src"
      :label="recrop.label"
      :lock-square="recrop.kind === 'entry'"
      @done="onRecropped"
      @cancel="recrop = null"
    />
  </n-modal>
</template>
