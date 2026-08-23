<script setup lang="ts">
import {
  DIRECTIONS_V2,
  DIRECTION_LABELS,
  ENTRANCE_LABELS,
  ENTRANCE_TYPES,
  FLOOR_LABELS,
  FLOOR_ORDER,
  PASSAGE_LABELS,
  PASSAGES_V2,
  publicationIssues,
  type EntranceV2,
  type EntranceType,
  type FloorType,
  type GameMode,
  type MapItemV2,
} from '@idv-map/shared';
import {
  NAlert,
  NButton,
  NFormItem,
  NImage,
  NInput,
  NModal,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSwitch,
  useMessage,
} from 'naive-ui';
import { computed, reactive, ref } from 'vue';
import { uploadImageV2 } from '../api-v2';
import { fileToWebp, makeThumb, type V2CropOutput } from '../imageTools';
import CropSingle from './CropSingle.vue';
import CropWorkbenchV2 from './CropWorkbenchV2.vue';

const props = defineProps<{ map: MapItemV2; isNew?: boolean }>();
const emit = defineEmits<{ apply: [map: MapItemV2]; cancel: [] }>();
const message = useMessage();
// props 来自 Vue reactive store，structuredClone 不能复制 Proxy；先转成普通 JSON 数据。
const cloneMap = (map: MapItemV2): MapItemV2 => JSON.parse(JSON.stringify(map)) as MapItemV2;
const draft = reactive<MapItemV2>(cloneMap(props.map));
// 正门的物理入口固定为南门，后台不再要求管理员重复选择。
for (const entrance of draft.entrances) {
  if (entrance.type === 'front') entrance.direction = 'south';
}
const busy = ref('');
const workbench = ref<{
  source: File;
  entranceIndex: number;
  entranceLabel: string;
} | null>(null);
const recrop = ref<
  | { target: 'floor'; floor: FloorType; label: string; currentSrc?: string; fullSrc?: string; initialFull?: boolean }
  | { target: 'entrance'; entranceIndex: number; label: string; currentSrc?: string; fullSrc?: string; initialFull?: boolean }
  | null
>(null);
const wholeCropEntranceId = ref(draft.entrances[0]?.id ?? '');

const floorSlots = computed(() =>
  FLOOR_ORDER.filter((floor) => {
    if (floor === 'basement') return draft.mode === 'nightmare' || !!draft.layout.basement;
    return true;
  }),
);
const issues = computed(() => publicationIssues(draft));
const missingEntranceTypes = computed(() => {
  const expected: readonly EntranceType[] = draft.mode === 'hard' ? ENTRANCE_TYPES : ['front', 'upstairs'];
  return expected.filter((type) => !draft.entrances.some((entrance) => entrance.type === type));
});
const directionOptions = DIRECTIONS_V2.map((value) => ({ label: DIRECTION_LABELS[value], value }));
const passageOptions = PASSAGES_V2.map((value) => ({ label: PASSAGE_LABELS[value], value }));
const entranceOptions = computed(() =>
  draft.entrances.map((entrance) => ({ label: ENTRANCE_LABELS[entrance.type], value: entrance.id })),
);

function mediaUrl(key: string): string {
  return `/r2/${key}`;
}

function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    const finish = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.onchange = () => finish(input.files?.[0] ?? null);
    input.oncancel = () => finish(null);
    document.body.append(input);
    input.click();
  });
}

async function replaceFloor(floor: FloorType): Promise<void> {
  const file = await pickImage();
  if (!file) return;
  busy.value = `正在上传${FLOOR_LABELS[floor]}…`;
  try {
    const webp = await fileToWebp(file);
    const result = await uploadImageV2(floor, webp);
    draft.layout[floor] = result.asset;
  } catch (error) {
    message.error(error instanceof Error ? error.message : '图片上传失败');
  } finally {
    busy.value = '';
  }
}

async function replaceEntrance(index: number): Promise<void> {
  const file = await pickImage();
  if (!file) return;
  const entrance = draft.entrances[index];
  busy.value = `正在上传${ENTRANCE_LABELS[entrance.type]}…`;
  try {
    const webp = await fileToWebp(file);
    const [image, thumb] = await Promise.all([
      uploadImageV2('entrance', webp),
      makeThumb(webp).then((blob) => uploadImageV2('entranceThumb', blob)),
    ]);
    entrance.image = image.asset;
    entrance.thumb = thumb.asset;
  } catch (error) {
    message.error(error instanceof Error ? error.message : '入口图上传失败');
  } finally {
    busy.value = '';
  }
}

async function openWorkbench(): Promise<void> {
  let entranceIndex = draft.entrances.findIndex((entrance) => entrance.id === wholeCropEntranceId.value);
  if (entranceIndex < 0) entranceIndex = 0;
  const entrance = draft.entrances[entranceIndex];
  if (!entrance) {
    message.warning('请先添加至少一个入口');
    return;
  }
  const file = await pickImage();
  if (!file) return;
  workbench.value = {
    source: file,
    entranceIndex,
    entranceLabel: ENTRANCE_LABELS[entrance.type],
  };
}

async function onWorkbenchDone(blobs: V2CropOutput): Promise<void> {
  const job = workbench.value;
  if (!job) return;
  workbench.value = null;
  busy.value = `正在上传${job.entranceLabel}及楼层图片…`;
  try {
    const [full, floor1, floor2, basement, entranceImage, entranceThumb] = await Promise.all([
      uploadImageV2('full', blobs.full),
      uploadImageV2('floor1', blobs.floor1),
      uploadImageV2('floor2', blobs.floor2),
      blobs.basement ? uploadImageV2('basement', blobs.basement) : Promise.resolve(null),
      uploadImageV2('entrance', blobs.entrance),
      uploadImageV2('entranceThumb', blobs.entranceThumb),
    ]);
    draft.layout.full = full.asset;
    draft.layout.floor1 = floor1.asset;
    draft.layout.floor2 = floor2.asset;
    if (basement) draft.layout.basement = basement.asset;
    const entrance = draft.entrances[job.entranceIndex];
    entrance.image = entranceImage.asset;
    entrance.thumb = entranceThumb.asset;
    message.success(`已生成并上传${blobs.basement ? '6' : '5'}张图片`);
  } catch (error) {
    message.error(error instanceof Error ? error.message : '整体裁剪上传失败');
  } finally {
    busy.value = '';
  }
}

function openFloorRecrop(floor: FloorType): void {
  const asset = draft.layout[floor];
  const full = draft.layout.full;
  if (!asset && !full) return;
  recrop.value = {
    target: 'floor',
    floor,
    label: FLOOR_LABELS[floor],
    currentSrc: asset ? mediaUrl(asset.key) : undefined,
    fullSrc: floor !== 'full' && full ? mediaUrl(full.key) : undefined,
    initialFull: !asset,
  };
}

function openEntranceRecrop(entranceIndex: number): void {
  const entrance = draft.entrances[entranceIndex];
  const full = draft.layout.full;
  if (!entrance.image && !full) return;
  recrop.value = {
    target: 'entrance',
    entranceIndex,
    label: `${ENTRANCE_LABELS[entrance.type]}入口图`,
    currentSrc: entrance.image ? mediaUrl(entrance.image.key) : undefined,
    fullSrc: full ? mediaUrl(full.key) : undefined,
    initialFull: !entrance.image,
  };
}

async function onRecropped(blob: Blob): Promise<void> {
  const target = recrop.value;
  if (!target) return;
  recrop.value = null;
  busy.value = `正在上传${target.label}裁剪结果…`;
  try {
    if (target.target === 'floor') {
      const result = await uploadImageV2(target.floor, blob);
      draft.layout[target.floor] = result.asset;
    } else {
      const entrance = draft.entrances[target.entranceIndex];
      const [image, thumb] = await Promise.all([
        uploadImageV2('entrance', blob),
        makeThumb(blob).then((result) => uploadImageV2('entranceThumb', result)),
      ]);
      entrance.image = image.asset;
      entrance.thumb = thumb.asset;
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : '裁剪结果上传失败');
  } finally {
    busy.value = '';
  }
}

function addEntrance(type: EntranceType): void {
  const entrance: EntranceV2 = {
    id: `${draft.id}-${type}`,
    type,
    ...(type === 'front' ? { direction: 'south' as const } : {}),
  };
  draft.entrances.push(entrance);
  if (!wholeCropEntranceId.value) wholeCropEntranceId.value = entrance.id;
}

function removeEntrance(index: number): void {
  const [removed] = draft.entrances.splice(index, 1);
  if (removed?.id === wholeCropEntranceId.value) wholeCropEntranceId.value = draft.entrances[0]?.id ?? '';
}

function changeMode(mode: GameMode): void {
  draft.mode = mode;
  if (!props.isNew) return;

  const expected: readonly EntranceType[] = mode === 'hard' ? ENTRANCE_TYPES : ['front', 'upstairs'];
  const existing = new Map(draft.entrances.map((entrance) => [entrance.type, entrance]));
  draft.entrances = expected.map((type) => {
    const entrance: EntranceV2 = existing.get(type) ?? { id: `${draft.id}-${type}`, type };
    if (type === 'front') entrance.direction = 'south';
    return entrance;
  });
  if (!draft.entrances.some((entrance) => entrance.id === wholeCropEntranceId.value)) {
    wholeCropEntranceId.value = draft.entrances[0]?.id ?? '';
  }
}

function setPublished(value: boolean): void {
  if (value && issues.value.length > 0) {
    message.warning(`还不能发布：${issues.value.join('；')}`, { duration: 8000, closable: true });
    return;
  }
  draft.published = value;
}

function apply(): void {
  if (!draft.name.trim() || !draft.displayName.trim()) {
    message.warning('逻辑名和展示名都要填写');
    return;
  }
  if (draft.published && issues.value.length > 0) {
    message.warning(`还不能发布：${issues.value.join('；')}`, { duration: 8000, closable: true });
    return;
  }
  emit('apply', cloneMap(draft));
}
</script>

<template>
  <n-modal
    :show="true"
    preset="card"
    class="editor-modal"
    :title="`V2 · #${draft.id} · ${draft.displayName || '新增地图'}`"
    :mask-closable="false"
    @update:show="(value: boolean) => value || emit('cancel')"
    @close="emit('cancel')"
  >
    <div class="form-cols">
      <n-form-item label="模式">
        <n-radio-group :value="draft.mode" @update:value="(value: string) => changeMode(value as GameMode)">
          <n-radio-button value="hard">困难</n-radio-button>
          <n-radio-button value="nightmare">噩梦</n-radio-button>
        </n-radio-group>
      </n-form-item>
      <n-form-item label="发布">
        <n-switch :value="draft.published" @update:value="setPublished" />
        <span class="muted" style="margin-left: 10px">草稿可以缺图；发布时才完整检查</span>
      </n-form-item>
      <n-form-item label="逻辑名">
        <n-input v-model:value="draft.name" placeholder="稳定标识，如 front-left" />
      </n-form-item>
      <n-form-item label="展示名">
        <n-input v-model:value="draft.displayName" placeholder="前台和小程序展示的名称" />
      </n-form-item>
      <n-form-item label="备注" class="full">
        <n-input v-model:value="draft.remarks" type="textarea" :rows="2" />
      </n-form-item>
    </div>

    <h3 class="section-title">楼层地图</h3>
    <p class="muted">全图固定排在第一，并且是用户进入详情页时默认看到的图。</p>
    <div class="whole-crop-toolbar">
      <span class="muted">整体裁剪时同时生成入口：</span>
      <n-select
        v-model:value="wholeCropEntranceId"
        class="whole-crop-entrance"
        :options="entranceOptions"
        placeholder="选择入口"
      />
      <n-button type="primary" secondary :disabled="!!busy || !wholeCropEntranceId" @click="openWorkbench">
        上传原图整体裁剪
      </n-button>
      <span class="muted">其他图片点击“裁剪”后，可裁剪当前图片或从全图重新框选。</span>
    </div>
    <div class="img-slots">
      <div v-for="floor in floorSlots" :key="floor" class="img-slot" :class="{ missing: !draft.layout[floor] }">
        <div class="frame">
          <n-image v-if="draft.layout[floor]" :src="mediaUrl(draft.layout[floor]!.key)" object-fit="contain" lazy />
          <span v-else class="muted">缺失</span>
        </div>
        <div class="k">{{ FLOOR_LABELS[floor] }}{{ floor === 'full' ? '（默认）' : '' }}</div>
        <div class="row-actions" style="justify-content: center">
          <n-button size="tiny" :disabled="!!busy" @click="replaceFloor(floor)">换图</n-button>
          <n-button
            size="tiny"
            :disabled="!!busy || !(draft.layout[floor] || draft.layout.full)"
            @click="openFloorRecrop(floor)"
          >
            裁剪
          </n-button>
          <n-button
            size="tiny"
            :disabled="!!busy || !draft.layout[floor]"
            @click="delete draft.layout[floor]"
          >移除</n-button>
        </div>
      </div>
    </div>

    <h3 class="section-title">入口选项图</h3>
    <div class="entrance-admin-list">
      <div v-for="(entrance, index) in draft.entrances" :key="entrance.id" class="entrance-admin-row">
        <div class="entrance-admin-preview">
          <n-image v-if="entrance.image" :src="mediaUrl(entrance.image.key)" object-fit="cover" lazy />
          <span v-else class="muted">缺图</span>
        </div>
        <strong>{{ ENTRANCE_LABELS[entrance.type] }}</strong>
        <div class="entrance-classifier">
          <span class="entrance-field-label">{{ entrance.type === 'front' ? '通道类型' : '入口方向' }}</span>
          <n-select
            v-if="entrance.type === 'front'"
            v-model:value="entrance.passage"
            placeholder="选择通道（可后补）"
            :options="passageOptions"
          />
          <n-select
            v-else
            v-model:value="entrance.direction"
            placeholder="选择方向"
            :options="directionOptions"
          />
          <span v-if="entrance.type === 'front'" class="entrance-field-hint">正门固定为南门，无需选择方向</span>
        </div>
        <div class="entrance-admin-actions">
          <n-button size="small" :disabled="!!busy" @click="replaceEntrance(index)">换图</n-button>
          <n-button
            size="small"
            :disabled="!!busy || !(entrance.image || draft.layout.full)"
            @click="openEntranceRecrop(index)"
          >
            裁剪
          </n-button>
          <n-button size="small" tertiary type="error" :disabled="!!busy" @click="removeEntrance(index)">
            移除入口
          </n-button>
        </div>
      </div>
      <div v-if="missingEntranceTypes.length" class="toolbar">
        <span class="muted">补充当前模式需要的入口：</span>
        <n-button v-for="type in missingEntranceTypes" :key="type" size="small" @click="addEntrance(type)">
          + {{ ENTRANCE_LABELS[type] }}
        </n-button>
      </div>
    </div>

    <n-alert v-if="issues.length" type="warning" style="margin-top: 16px">
      <div>当前可以保存为草稿；要发布还需处理：</div>
      <ul class="issue-list"><li v-for="issue in issues" :key="issue">{{ issue }}</li></ul>
    </n-alert>

    <div class="dialog-actions">
      <span v-if="busy" class="muted">{{ busy }}</span>
      <span class="spacer"></span>
      <n-button @click="emit('cancel')">取消</n-button>
      <n-button type="primary" :disabled="!!busy" @click="apply">应用（还需保存 V2）</n-button>
    </div>

    <CropWorkbenchV2
      v-if="workbench"
      :source="workbench.source"
      :mode="draft.mode"
      :entrance-label="workbench.entranceLabel"
      @done="onWorkbenchDone"
      @cancel="workbench = null"
    />
    <CropSingle
      v-if="recrop"
      :current-src="recrop.currentSrc"
      :full-src="recrop.fullSrc"
      :initial-full="recrop.initialFull"
      :label="recrop.label"
      :lock-square="recrop.target === 'entrance'"
      @done="onRecropped"
      @cancel="recrop = null"
    />
  </n-modal>
</template>
