<script setup lang="ts">
import {
  allowedEntranceTypes,
  entranceFilterFor,
  layoutPublicationIssues,
  type EntranceV2,
  type EntranceType,
  type FloorType,
  type GameMode,
  type Layout,
  type RegionFloor,
  type PixelRect,
} from "@idv-map/shared/dynamic";
import {
  NAlert,
  NButton,
  NFormItem,
  NImage,
  NInput,
  NModal,
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
import { storeV2 } from "../store-v2";

const props = defineProps<{ map: Layout; isNew?: boolean }>();
const emit = defineEmits<{ apply: [map: Layout]; cancel: [] }>();
const message = useMessage();
// props 来自 Vue reactive store，structuredClone 不能复制 Proxy；先转成普通 JSON 数据。
const cloneMap = (map: Layout): Layout =>
  JSON.parse(JSON.stringify(map)) as Layout;
const draft = reactive<Layout>(cloneMap(props.map));
// A first publication can finish while this editor holds an older draft.
const modeLocked = computed(() => draft.modeLocked || props.map.modeLocked);
const busy = ref("");
const previewFloor = ref<FloorType | null>(null);
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

const gameMap = computed(() => storeV2.gameMaps.find(m => m.id === draft.gameMapId));
const modeOptions = computed(() => gameMap.value?.difficulties.filter(d => !d.deletedAt).map(d => ({ value: d.difficultyId, label: storeV2.difficulties.find(v => v.id === d.difficultyId)?.name ?? d.difficultyId })) ?? []);
const configuredFloors = computed(() => gameMap.value?.difficulties.find(d => d.difficultyId === draft.mode)?.floors.filter(f => !f.deletedAt) ?? []);
const floorSlots = computed(() => [...new Set(['full', ...[...configuredFloors.value].sort((a,b) => a.sort-b.sort).map(f=>f.id), ...Object.keys(draft.floorImages), ...Object.keys(draft.floorRegions?.regions ?? {})])]);
const floorLabels = computed<Record<string,string>>(() => Object.fromEntries([['full','全图'], ...(gameMap.value?.difficulties.flatMap(d => d.floors.map(f => [f.id,f.name])) ?? []), ...configuredFloors.value.map(f=>[f.id,f.name])]));
const floorOrigins = reactive<Record<string,string>>(Object.fromEntries(configuredFloors.value.map(f => [f.id,f.name])));
const floorConflicts = computed(() => configuredFloors.value.filter(f => (draft.floorImages[f.id] || draft.floorRegions?.regions[f.id]) && floorOrigins[f.id] && floorOrigins[f.id] !== f.name));
function confirmFloorReuse() { for (const f of floorConflicts.value) floorOrigins[f.id] = f.name; }
const entryLabels = computed<Record<string,string>>(() => Object.fromEntries(storeV2.entranceTypes.map(e=>[e.id,e.name])));
const entryDefinition = (id:string) => entranceFilterFor(gameMap.value, draft.mode, id);
const filterOptions = (id:string) => entryDefinition(id)?.filterOptions.filter(f=>!f.deletedAt && (!f.archived || draft.entrances.some(e=>e.type===id && e.filterValue===f.id))).sort((a,b)=>a.sort-b.sort).map(f=>({label:f.name,value:f.id})) ?? [];
const activeEntrances = computed(() => draft.entrances.flatMap((entrance,index)=>entrance.deletedAt?[]:[{entrance,index}]));
const issues = computed(() => {
  const result = layoutPublicationIssues(draft, gameMap.value);
  for (const id of [...Object.keys(draft.floorImages), ...Object.keys(draft.floorRegions?.regions ?? {})]) if (id !== 'full' && !configuredFloors.value.some(f => f.id === id)) result.push(`${floorLabels.value[id] ?? id}不属于目标难度，请移除或切回原难度`);
  for (const e of draft.entrances) if (!e.deletedAt && !allowedEntranceTypes(gameMap.value, draft.mode).includes(e.type))
    result.push(`${entryLabels.value[e.type]}不允许录入，请移除或调整难度`);
  return result;
});
const missingEntranceTypes = computed(() => {
  const expected = allowedEntranceTypes(gameMap.value, draft.mode);
  return expected.filter(
    (type) => !draft.entrances.some((entrance) => !entrance.deletedAt && entrance.type === type),
  );
});
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
    id: f, label: floorLabels.value[f], rect: floorRect(f),
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
    for (const id of Object.keys(result.regions)) floorOrigins[id] = configuredFloors.value.find(f => f.id === id)?.name ?? id;
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
  busy.value = `正在上传${entryLabels.value[entrance.type]}…`;
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
    label: `${entryLabels.value[entrance.type]}入口图`,
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
  const entrance: EntranceV2 = { id: `entry-${crypto.randomUUID()}`, type };
  draft.entrances.push(entrance);
}

function removeEntrance(index: number): void {
  draft.entrances[index].deletedAt = new Date().toISOString();
}

function changeMode(mode: GameMode): void {
  if (modeLocked.value || draft.published) return;
  draft.mode = mode;
  if (issues.value.length) message.info('请检查并移除不属于目标难度的楼层和入口；取消可保留原布局');
}
function changeGameMap(id: string) {
  if (!props.isNew || modeLocked.value) return;
  draft.gameMapId = id;
  draft.mode = gameMap.value?.difficulties.find(d => !d.deletedAt)?.difficultyId ?? '';
  message.info('请检查目标地图的难度、楼层和入口；原布局不会改变');
}
async function uploadFloor(floor: string) {
  const file = await pickImage(); if (!file) return;
  busy.value = '正在上传楼层图…';
  try { const asset = (await uploadImageV2('floor', await fileToWebp(file))).asset; draft.floorImages[floor] = asset; floorOrigins[floor] = configuredFloors.value.find(f => f.id === floor)?.name ?? floor; if (draft.floorRegions) delete draft.floorRegions.regions[floor]; }
  catch (error) { message.error(error instanceof Error ? error.message : '上传失败'); }
  finally { busy.value = ''; }
}

function setPublished(value: boolean): void {
  const publicationIssues = [...new Set([...issues.value, ...layoutPublicationIssues(draft, gameMap.value)])];
  if (value && publicationIssues.length > 0) {
    message.warning(`还不能发布：${publicationIssues.join("；")}`, {
      duration: 8000,
      closable: true,
    });
    return;
  }
  draft.published = value;
}

function apply(): void {
  if (floorConflicts.value.length) { message.warning('请先核对并确认楼层素材归属'); return; }
  if (!gameMap.value?.difficulties.some(d => d.difficultyId === draft.mode && !d.deletedAt)) {
    message.warning('请先为目标地图添加难度'); return;
  }
  if (!draft.name.trim() || !draft.displayName.trim()) {
    message.warning("逻辑名和展示名都要填写");
    return;
  }
  if (draft.entrances.some(e => !e.deletedAt && !allowedEntranceTypes(gameMap.value, draft.mode).includes(e.type))) {
    message.warning("存在当前难度不允许的入口，请移除或调整难度");
    return;
  }
  if (issues.value.some(i => i.includes('不属于目标难度')) || (draft.published && issues.value.length > 0)) {
    message.warning(`还不能发布：${issues.value.join("；")}`, {
      duration: 8000,
      closable: true,
    });
    return;
  }
  emit("apply", { ...cloneMap(draft), modeLocked: modeLocked.value });
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
      <n-form-item label="所属地图"><n-select role="combobox" :value="draft.gameMapId" :disabled="!isNew" :options="storeV2.gameMaps.filter(m=>!m.deletedAt).map(m=>({label:m.name,value:m.id}))" aria-label="布局所属地图" @update:value="changeGameMap" /></n-form-item>
      <n-form-item label="模式">
        <n-select role="combobox" :value="draft.mode" :options="modeOptions" :disabled="modeLocked || draft.published" aria-label="布局难度" @update:value="changeMode" />
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

    <n-alert v-if="floorConflicts.length" type="warning">
      <div v-for="f in floorConflicts" :key="f.id">{{floorOrigins[f.id]}} → {{f.name}}</div>
      <n-button size="small" @click="confirmFloorReuse">确认沿用这些楼层素材</n-button>
    </n-alert>
    <h3 class="section-title">全图与楼层区域</h3>
    <p class="muted">上传完整全图，在图上选择楼层范围。楼层保存像素坐标，不再生成图片。</p>
    <div class="whole-crop-toolbar">
      <n-button type="primary" :disabled="!!busy" @click="uploadFull">上传全图并设置区域</n-button>
      <span class="muted">旧楼层可逐张转换；新全图需要重新确认已转换区域。</span>
    </div>
    <div class="img-slots">
      <div v-for="floor in floorSlots" :key="floor" class="img-slot" :class="{ missing: !draft.floorImages[floor] && !floorRect(floor) }">
        <div class="frame">
          <button v-if="floorRect(floor) && draft.floorRegions && draft.floorImages.full" class="region-preview-button" :aria-label="`预览${floorLabels[floor]}`" @click="previewFloor = floor"><RegionPreview :src="mediaUrl(draft.floorImages.full.key)" :width="draft.floorRegions.imageWidth" :height="draft.floorRegions.imageHeight" :rect="floorRect(floor)!" :label="floorLabels[floor]" /></button>
          <n-image v-else-if="draft.floorImages[floor]" :src="mediaUrl(draft.floorImages[floor]!.key)" object-fit="contain" lazy />
          <span v-else class="muted">尚未设置</span>
        </div>
        <div class="k">{{ floorLabels[floor] }}{{ floor === 'full' ? '（默认）' : floorRect(floor) ? ' · 区域' : draft.floorImages[floor] ? ' · 待转换' : '' }}</div>
        <div class="row-actions" style="justify-content: center">
          <template v-if="floor === 'full'">
            <n-button :disabled="!!busy" @click="uploadFull">换图</n-button>
            <n-button :disabled="!!busy || !draft.floorImages.full" @click="openFullCrop">裁切全图</n-button>
          </template>
          <n-button v-else :disabled="!!busy || !draft.floorImages.full" @click="openRegions(floor)">{{ floorRect(floor) ? '调整区域' : '选择区域' }}</n-button>
          <n-button v-if="floor !== 'full'" :disabled="!!busy" @click="uploadFloor(floor)">上传独立图片</n-button>
          <n-button :disabled="!!busy || (!draft.floorImages[floor] && !floorRect(floor))" @click="removeFloor(floor)">移除</n-button>
        </div>
      </div>
    </div>

    <h3 class="section-title">入口选项图</h3>
    <div class="entrance-admin-list">
      <div
        v-for="{ entrance, index } in activeEntrances"
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
        <strong>{{ entryLabels[entrance.type] }}</strong>
        <div v-if="filterOptions(entrance.type).length || entrance.filterValue" class="entrance-classifier">
          <span class="entrance-field-label">{{ entryDefinition(entrance.type)?.filterLabel }}</span>
          <n-select role="combobox" :value="entrance.filterValue ?? null" :options="filterOptions(entrance.type)" clearable placeholder="可后补" @update:value="value => entrance.filterValue = value ?? undefined" />
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
          + {{ entryLabels[type] }}
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

    <n-modal :show="!!previewFloor" preset="card" :title="previewFloor ? floorLabels[previewFloor] : ''" style="width: min(90vw, 900px)" @update:show="previewFloor = null">
      <div v-if="previewFloor && floorRect(previewFloor) && draft.floorRegions && draft.floorImages.full" class="region-preview-large"><RegionPreview :src="mediaUrl(draft.floorImages.full.key)" :width="draft.floorRegions.imageWidth" :height="draft.floorRegions.imageHeight" :rect="floorRect(previewFloor)!" :label="floorLabels[previewFloor]" /></div>
    </n-modal>
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
