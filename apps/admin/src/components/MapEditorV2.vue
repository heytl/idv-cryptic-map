<script setup lang="ts">
import {
  DIRECTIONS_V2,
  DIRECTION_LABELS,
  ENTRANCE_LABELS,
  REQUIRED_ENTRANCES,
  REQUIRED_LAYOUTS,
  FLOOR_LABELS,
  FLOOR_ORDER,
  PASSAGE_LABELS,
  PASSAGES_V2,
  layoutPublicationIssues,
  type EntranceV2,
  type EntranceType,
  type FloorType,
  type GameMode,
  type Layout,
  type RegionFloor,
  type PixelRect,
} from "@idv-map/shared";
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
} from "naive-ui";
import { computed, reactive, ref, onBeforeUnmount } from "vue";
import { API_BASE, uploadImageV2 } from "../api-v2";
import { fileToWebp, makeThumb } from "../imageTools";
import CropSingle from "./CropSingle.vue";
import RegionEditor, { type RegionItem, type RegionResult } from "./RegionEditor.vue";
import RegionPreview from "./RegionPreview.vue";

const props = defineProps<{ map: Layout; isNew?: boolean }>();
const emit = defineEmits<{ apply: [map: Layout]; cancel: [] }>();
const message = useMessage();
// props 来自 Vue reactive store，structuredClone 不能复制 Proxy；先转成普通 JSON 数据。
const cloneMap = (map: Layout): Layout =>
  JSON.parse(JSON.stringify(map)) as Layout;
const draft = reactive<Layout>(cloneMap(props.map));
// 正门的物理入口固定为南门，后台不再要求管理员重复选择。
for (const entrance of draft.entrances) {
  if (entrance.type === "front") entrance.direction = "south";
}
const busy = ref("");
const regionJob = ref<{ source: string; candidate?: Blob; initialId?: string; items: RegionItem[]; required: string[] } | null>(null);
function closeRegions() {
  if (regionJob.value?.candidate) URL.revokeObjectURL(regionJob.value.source);
  regionJob.value = null;
}
onBeforeUnmount(closeRegions);
const recrop = ref<
  | {
      target: "floor";
      floor: FloorType;
      label: string;
      currentSrc?: string;
      fullSrc?: string;
      initialFull?: boolean;
    }
  | {
      target: "entrance";
      entranceIndex: number;
      label: string;
      currentSrc?: string;
      fullSrc?: string;
      initialFull?: boolean;
    }
  | null
>(null);

const floorSlots = computed(() =>
  FLOOR_ORDER.filter((floor) => {
    return (
      REQUIRED_LAYOUTS[draft.mode].includes(floor) || !!draft.floorImages[floor] || (floor !== "full" && !!draft.floorRegions?.regions[floor])
    );
  }),
);
const issues = computed(() => layoutPublicationIssues(draft));
const missingEntranceTypes = computed(() => {
  const expected: readonly EntranceType[] = REQUIRED_ENTRANCES[draft.mode];
  return expected.filter(
    (type) => !draft.entrances.some((entrance) => entrance.type === type),
  );
});
const directionOptions = DIRECTIONS_V2.map((value) => ({
  label: DIRECTION_LABELS[value],
  value,
}));
const passageOptions = PASSAGES_V2.map((value) => ({
  label: PASSAGE_LABELS[value],
  value,
}));
function mediaUrl(key: string): string {
  return `${API_BASE}/r2/${key}`;
}

function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.position = "fixed";
    input.style.left = "-9999px";
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

function floorRect(floor: FloorType): PixelRect | undefined {
  return floor === 'full' ? undefined : draft.floorRegions?.regions[floor];
}
function regionItems(): RegionItem[] {
  return floorSlots.value.filter(f => f !== 'full').map(f => ({
    id: f, label: FLOOR_LABELS[f], rect: floorRect(f),
    reference: draft.floorImages[f] ? mediaUrl(draft.floorImages[f]!.key) : undefined,
  }));
}
function openRegions(floor?: FloorType, candidate?: Blob) {
  if (!candidate && !draft.floorImages.full) return;
  regionJob.value = {
    source: candidate ? URL.createObjectURL(candidate) : mediaUrl(draft.floorImages.full!.key), candidate,
    initialId: floor === 'full' ? undefined : floor,
    items: regionItems(), required: candidate ? Object.keys(draft.floorRegions?.regions ?? {}) : [],
  };
}
async function uploadFull() {
  const file = await pickImage();
  if (!file) return;
  busy.value = '正在准备全图…';
  try { openRegions(undefined, await fileToWebp(file)); }
  catch (e) { message.error(e instanceof Error ? e.message : '图片读取失败'); }
  finally { busy.value = ''; }
}
async function applyRegions(result: RegionResult) {
  const job = regionJob.value;
  if (!job) return;
  busy.value = '正在应用区域…';
  try {
    const asset = job.candidate ? (await uploadImageV2('full', job.candidate)).asset : draft.floorImages.full!;
    // Commit image + rectangles together only after upload succeeds.
    draft.floorImages.full = asset;
    draft.floorRegions = { sourceKey: asset.key, imageWidth: result.imageWidth, imageHeight: result.imageHeight, regions: result.regions };
    for (const floor of Object.keys(result.regions) as RegionFloor[]) delete draft.floorImages[floor];
    closeRegions();
    message.success('区域已应用到布局草稿，还需应用布局并保存内容');
  } catch (e) { message.error(e instanceof Error ? e.message : '应用失败，区域已保留，可重试'); }
  finally { busy.value = ''; }
}
function removeFloor(floor: FloorType) {
  delete draft.floorImages[floor];
  if (floor === 'full') delete draft.floorRegions;
  else if (draft.floorRegions) delete draft.floorRegions.regions[floor];
}
async function replaceEntrance(index: number): Promise<void> {
  const file = await pickImage();
  if (!file) return;
  const entrance = draft.entrances[index];
  busy.value = `正在上传${ENTRANCE_LABELS[entrance.type]}…`;
  try {
    const webp = await fileToWebp(file);
    const [image, thumb] = await Promise.all([
      uploadImageV2("entrance", webp),
      makeThumb(webp).then((blob) => uploadImageV2("entranceThumb", blob)),
    ]);
    entrance.image = image.asset;
    entrance.thumb = thumb.asset;
  } catch (error) {
    message.error(error instanceof Error ? error.message : "入口图上传失败");
  } finally {
    busy.value = "";
  }
}

function openFullCrop() {
  if (!draft.floorImages.full) return;
  recrop.value = { target: 'floor', floor: 'full', label: '全图', currentSrc: mediaUrl(draft.floorImages.full.key) };
}
function openEntranceRecrop(entranceIndex: number): void {
  const entrance = draft.entrances[entranceIndex];
  const full = draft.floorImages.full;
  if (!entrance.image && !full) return;
  recrop.value = {
    target: "entrance",
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
  busy.value = `正在上传${target.label}裁剪结果…`;
  try {
    if (target.target === "floor") {
      openRegions(undefined, blob);
    } else {
      const entrance = draft.entrances[target.entranceIndex];
      const [image, thumb] = await Promise.all([
        uploadImageV2("entrance", blob),
        makeThumb(blob).then((result) =>
          uploadImageV2("entranceThumb", result),
        ),
      ]);
      entrance.image = image.asset;
      entrance.thumb = thumb.asset;
    }
    recrop.value = null;
  } catch (error) {
    message.error(error instanceof Error ? error.message : "裁剪结果上传失败");
  } finally {
    busy.value = "";
  }
}

function addEntrance(type: EntranceType): void {
  const entrance: EntranceV2 = {
    id: `${draft.id}-${type}`,
    type,
    ...(type === "front" ? { direction: "south" as const } : {}),
  };
  draft.entrances.push(entrance);
}

function removeEntrance(index: number): void {
  draft.entrances.splice(index, 1);
}

function changeMode(mode: GameMode): void {
  draft.mode = mode;
  if (!props.isNew) return;

  const expected: readonly EntranceType[] = REQUIRED_ENTRANCES[mode];
  const existing = new Map(
    draft.entrances.map((entrance) => [entrance.type, entrance]),
  );
  draft.entrances = expected.map((type) => {
    const entrance: EntranceV2 = existing.get(type) ?? {
      id: `${draft.id}-${type}`,
      type,
    };
    if (type === "front") entrance.direction = "south";
    return entrance;
  });

}

function setPublished(value: boolean): void {
  if (value && issues.value.length > 0) {
    message.warning(`还不能发布：${issues.value.join("；")}`, {
      duration: 8000,
      closable: true,
    });
    return;
  }
  draft.published = value;
}

function apply(): void {
  if (!draft.name.trim() || !draft.displayName.trim()) {
    message.warning("逻辑名和展示名都要填写");
    return;
  }
  if (draft.published && issues.value.length > 0) {
    message.warning(`还不能发布：${issues.value.join("；")}`, {
      duration: 8000,
      closable: true,
    });
    return;
  }
  emit("apply", cloneMap(draft));
}
</script>

<template>
  <n-modal
    :show="true"
    preset="card"
    class="editor-modal"
    :title="`布局 · #${draft.id} · ${draft.displayName || '新增地图'}`"
    :mask-closable="false"
    @update:show="(value: boolean) => value || emit('cancel')"
    @close="emit('cancel')"
  >
    <div class="form-cols">
      <n-form-item label="模式">
        <n-radio-group
          :value="draft.mode"
          @update:value="(value: string) => changeMode(value as GameMode)"
        >
          <n-radio-button value="hard">困难</n-radio-button>
          <n-radio-button value="nightmare">噩梦</n-radio-button>
        </n-radio-group>
      </n-form-item>
      <n-form-item label="发布">
        <n-switch :value="draft.published" @update:value="setPublished" />
        <span class="muted" style="margin-left: 10px"
          >草稿可以缺图；发布时才完整检查</span
        >
      </n-form-item>
      <n-form-item label="逻辑名">
        <n-input
          v-model:value="draft.name"
          placeholder="稳定标识，如 front-left"
        />
      </n-form-item>
      <n-form-item label="展示名">
        <n-input
          v-model:value="draft.displayName"
          placeholder="前台和小程序展示的名称"
        />
      </n-form-item>
      <n-form-item label="备注" class="full">
        <n-input v-model:value="draft.remarks" type="textarea" :rows="2" />
      </n-form-item>
    </div>

    <h3 class="section-title">全图与楼层区域</h3>
    <p class="muted">上传完整全图，在图上选择楼层范围。楼层保存像素坐标，不再生成图片。</p>
    <div class="whole-crop-toolbar">
      <n-button type="primary" :disabled="!!busy" @click="uploadFull">上传全图并设置区域</n-button>
      <span class="muted">旧楼层可逐张转换；新全图需要重新确认已转换区域。</span>
    </div>
    <div class="img-slots">
      <div v-for="floor in floorSlots" :key="floor" class="img-slot" :class="{ missing: !draft.floorImages[floor] && !floorRect(floor) }">
        <div class="frame">
          <RegionPreview v-if="floorRect(floor) && draft.floorRegions && draft.floorImages.full" :src="mediaUrl(draft.floorImages.full.key)" :width="draft.floorRegions.imageWidth" :height="draft.floorRegions.imageHeight" :rect="floorRect(floor)!" :label="FLOOR_LABELS[floor]" />
          <n-image v-else-if="draft.floorImages[floor]" :src="mediaUrl(draft.floorImages[floor]!.key)" object-fit="contain" lazy />
          <span v-else class="muted">尚未设置</span>
        </div>
        <div class="k">{{ FLOOR_LABELS[floor] }}{{ floor === 'full' ? '（默认）' : floorRect(floor) ? ' · 区域' : draft.floorImages[floor] ? ' · 待转换' : '' }}</div>
        <div class="row-actions" style="justify-content: center">
          <template v-if="floor === 'full'">
            <n-button :disabled="!!busy" @click="uploadFull">换图</n-button>
            <n-button :disabled="!!busy || !draft.floorImages.full" @click="openFullCrop">裁切全图</n-button>
          </template>
          <n-button v-else :disabled="!!busy || !draft.floorImages.full" @click="openRegions(floor)">{{ floorRect(floor) ? '调整区域' : '选择区域' }}</n-button>
          <n-button :disabled="!!busy || (!draft.floorImages[floor] && !floorRect(floor))" @click="removeFloor(floor)">移除</n-button>
        </div>
      </div>
    </div>

    <h3 class="section-title">入口选项图</h3>
    <div class="entrance-admin-list">
      <div
        v-for="(entrance, index) in draft.entrances"
        :key="entrance.id"
        class="entrance-admin-row"
      >
        <div class="entrance-admin-preview">
          <n-image
            v-if="entrance.image"
            :src="mediaUrl(entrance.image.key)"
            object-fit="cover"
            lazy
          />
          <span v-else class="muted">缺图</span>
        </div>
        <strong>{{ ENTRANCE_LABELS[entrance.type] }}</strong>
        <div class="entrance-classifier">
          <span class="entrance-field-label">{{
            entrance.type === "front" ? "通道类型" : "入口方向"
          }}</span>
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
          <span v-if="entrance.type === 'front'" class="entrance-field-hint"
            >正门固定为南门，无需选择方向</span
          >
        </div>
        <div class="entrance-admin-actions">
          <n-button
            size="small"
            :disabled="!!busy"
            @click="replaceEntrance(index)"
            >换图</n-button
          >
          <n-button
            size="small"
            :disabled="!!busy || !(entrance.image || draft.floorImages.full)"
            @click="openEntranceRecrop(index)"
          >
            裁剪
          </n-button>
          <n-button
            size="small"
            tertiary
            type="error"
            :disabled="!!busy"
            @click="removeEntrance(index)"
          >
            移除入口
          </n-button>
        </div>
      </div>
      <div v-if="missingEntranceTypes.length" class="toolbar">
        <span class="muted">补充当前模式需要的入口：</span>
        <n-button
          v-for="type in missingEntranceTypes"
          :key="type"
          size="small"
          @click="addEntrance(type)"
        >
          + {{ ENTRANCE_LABELS[type] }}
        </n-button>
      </div>
    </div>

    <n-alert v-if="issues.length" type="warning" style="margin-top: 16px">
      <div>当前可以保存为草稿；要发布还需处理：</div>
      <ul class="issue-list">
        <li v-for="issue in issues" :key="issue">{{ issue }}</li>
      </ul>
    </n-alert>

    <div class="dialog-actions">
      <span v-if="busy" class="muted">{{ busy }}</span>
      <span class="spacer"></span>
      <n-button @click="emit('cancel')">取消</n-button>
      <n-button type="primary" :disabled="!!busy" @click="apply"
        >应用（还需保存内容）</n-button
      >
    </div>

    <RegionEditor v-if="regionJob" :source="regionJob.source" :items="regionJob.items" :initial-id="regionJob.initialId" :required-confirmation="regionJob.required" :pending-source="!!regionJob.candidate" :busy="!!busy" @done="applyRegions" @cancel="closeRegions" />
    <CropSingle
      v-if="recrop"
      :busy="!!busy"
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
