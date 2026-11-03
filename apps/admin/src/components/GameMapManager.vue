<script setup lang="ts">
import { computed, h, ref, watch } from "vue";
import { GAME_MODES, MODE_LABELS, ENTRANCE_TYPES, ENTRANCE_LABELS, availableModes, completeEntrance, legacyEntranceRules, type GameMap, type GameMode, type EntranceType } from "@idv-map/shared";
import { NButton, NCard, NCollapse, NCollapseItem, NEmpty, NForm, NFormItem, NInput, NInputNumber, NMenu, NPopconfirm, NSelect, NSwitch, NTable, useMessage } from "naive-ui";
import { storeV2, markDirtyV2 } from "../store-v2";

const message = useMessage();
const selectedId = ref("");
const creating = ref(false);
const name = ref("");
const mapId = ref("");
const submitted = ref(false);
const idPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;
type EntryUsage = "unused" | "recording" | "open";
const usageOptions = [{ label: "不使用", value: "unused" }, { label: "仅录入", value: "recording" }, { label: "开放", value: "open" }];
const maps = computed(() => storeV2.gameMaps.filter(m => !m.deletedAt).sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id)));
const retiredMaps = computed(() => storeV2.gameMaps.filter(m => m.deletedAt));
const selected = computed(() => maps.value.find(m => m.id === selectedId.value));
const mapOptions = computed(() => maps.value.map(map => ({ label: map.name || "未命名地图", value: map.id })));
const menuOptions = computed(() => maps.value.map(map => ({
  key: map.id,
  label: () => h("span", { class: "map-directory-label" }, [
    h("span", map.name || "未命名地图"),
    h("small", { class: { published: map.published && availableModes(map).length > 0 } }, !map.published ? "草稿" : availableModes(map).length ? "已发布" : "已隐藏"),
  ]),
})));
const defaultOptions = (map: GameMap, mode: GameMode) => map.entranceRules![mode].enabled.map(type => ({ label: ENTRANCE_LABELS[type], value: type }));
const createError = computed(() => {
  if (!name.value.trim()) return "请输入地图名称";
  if (!idPattern.test(mapId.value.trim())) return "标识需为 1–64 位小写字母、数字或连字符，并以字母或数字开头";
  if (storeV2.gameMaps.some(m => m.id === mapId.value.trim())) return "地图标识已存在，包括回收站中的地图";
  return "";
});
watch(maps, value => {
  if (!value.some(m => m.id === selectedId.value)) selectedId.value = value[0]?.id ?? "";
}, { immediate: true });

// Index recording availability independently of the mode's public visibility.
const inventory = computed(() => {
  const result = new Map<string, { layouts: number; ready: Partial<Record<EntranceType, number>> }>();
  for (const layout of storeV2.maps) if (!layout.deletedAt) {
    const key = `${layout.gameMapId}/${layout.mode}`;
    if (!result.has(key)) result.set(key, { layouts: 0, ready: {} });
    const entry = result.get(key)!;
    entry.layouts++;
    if (layout.published) for (const entrance of layout.entrances) if (completeEntrance(entrance))
      entry.ready[entrance.type] = (entry.ready[entrance.type] ?? 0) + 1;
  }
  return result;
});
const modeInventory = (mode: GameMode) => inventory.value.get(`${selectedId.value}/${mode}`);
const readyCount = (mode: GameMode, type: EntranceType) => modeInventory(mode)?.ready[type] ?? 0;
function modeProblem(map: GameMap, mode: GameMode): string {
  if (!map.modeVisibility![mode]) return "";
  const types = map.entranceRules![mode].enabled;
  if (!types.length) return "请选择至少一个开放入口，或关闭此难度显示";
  if (!map.published) return "";
  const missing = types.filter(type => !readyCount(mode, type));
  return missing.length ? `${missing.map(type => ENTRANCE_LABELS[type]).join("、")}暂无已发布的完整资料` : "";
}
function selectMap(id: string) { selectedId.value = id; creating.value = false; }
function beginCreate() {
  if (!creating.value) {
    name.value = "";
    mapId.value = `map-${crypto.randomUUID().slice(0, 8)}`;
    submitted.value = false;
  }
  creating.value = true;
}
function add() {
  submitted.value = true;
  if (createError.value) return;
  const id = mapId.value.trim();
  storeV2.gameMaps.push({
    id, name: name.value.trim(), sort: Math.max(0, ...maps.value.map(m => m.sort)) + 10,
    published: false, entranceRules: legacyEntranceRules(), modeVisibility: { hard: false, nightmare: false },
  });
  markDirtyV2();
  selectMap(id);
}
function remove(map: GameMap) {
  map.published = false;
  map.deletedAt = new Date().toISOString();
  for (const layout of storeV2.maps.filter(l => l.gameMapId === map.id)) layout.published = false;
  markDirtyV2();
}
function restore(map: GameMap) {
  map.deletedAt = null;
  map.published = false;
  markDirtyV2();
  selectMap(map.id);
}
function setVisibility(map: GameMap, mode: GameMode, value: boolean) {
  map.modeVisibility![mode] = value;
  markDirtyV2();
}
function entryUsage(map: GameMap, mode: GameMode, type: EntranceType): EntryUsage {
  const rule = map.entranceRules![mode];
  return rule.enabled.includes(type) ? "open" : rule.allowed.includes(type) ? "recording" : "unused";
}
function setUsage(map: GameMap, mode: GameMode, type: EntranceType, usage: EntryUsage) {
  const rule = map.entranceRules![mode];
  if (usage === "unused") {
    const referenced = storeV2.maps.filter(l => l.gameMapId === map.id && l.mode === mode && !l.deletedAt && l.entrances.some(e => e.type === type));
    if (referenced.length) {
      message.warning(`仍被布局 ${referenced.map(l => `#${l.id}`).join("、")} 使用；可先关闭对玩家开放`);
      return;
    }
    rule.enabled = rule.enabled.filter(t => t !== type);
    rule.allowed = rule.allowed.filter(t => t !== type);
  } else {
    if (!rule.allowed.includes(type)) rule.allowed.push(type);
    if (usage === "open" && !rule.enabled.includes(type)) rule.enabled.push(type);
    if (usage === "recording") rule.enabled = rule.enabled.filter(t => t !== type);
  }
  markDirtyV2();
}
function setDefault(map: GameMap, mode: GameMode, type: EntranceType) {
  const rule = map.entranceRules![mode];
  rule.enabled = [type, ...rule.enabled.filter(t => t !== type)];
  markDirtyV2();
}
</script>

<template>
  <section class="map-manager">
    <aside class="map-directory" aria-label="选择地图">
      <header class="map-directory-heading">
        <h2>地图 <span>{{ maps.length }}</span></h2>
        <n-button size="small" :aria-pressed="creating" @click="beginCreate">新增地图</n-button>
      </header>
      <n-select class="map-directory-select" :value="creating ? null : selectedId" :options="mapOptions" placeholder="选择地图" filterable role="combobox" aria-label="选择地图" @update:value="selectMap" />
      <n-menu class="map-directory-items" :value="creating ? null : selectedId" :options="menuOptions" :indent="12" :root-indent="12" aria-label="地图列表" @update:value="selectMap" />
      <p v-if="!maps.length" class="map-directory-empty">还没有地图</p>
      <n-collapse v-if="retiredMaps.length" class="map-recycle">
        <n-collapse-item name="recycle" :title="`回收站 ${retiredMaps.length}`">
        <div v-for="map in retiredMaps" :key="map.id" class="map-recycle-row">
          <span>{{ map.name }}</span><n-button size="small" quaternary :aria-label="`恢复${map.name}`" @click="restore(map)">恢复</n-button>
        </div>
        </n-collapse-item>
      </n-collapse>
    </aside>

    <n-card v-if="creating" class="map-settings map-create" aria-labelledby="map-create-title">
      <header class="map-settings-heading"><h2 id="map-create-title">新建地图</h2></header>
      <n-form class="map-create-form" @submit.prevent="add">
        <n-form-item label="地图名称" :show-feedback="false"><n-input v-model:value="name" :input-props="{ 'aria-label': '新地图名称' }" placeholder="例如：遗忘之境" autofocus /></n-form-item>
        <n-form-item label="地图标识" :show-feedback="false"><n-input v-model:value="mapId" :input-props="{ 'aria-label': '新地图标识' }" placeholder="new-map" /></n-form-item>
        <p v-if="submitted && createError" class="map-settings-error" role="alert">{{ createError }}</p>
        <div class="map-create-actions"><n-button type="primary" attr-type="submit">创建地图</n-button><n-button @click="creating = false">取消</n-button></div>
      </n-form>
    </n-card>

    <n-card v-else-if="selected && selected.entranceRules && selected.modeVisibility" class="map-settings" :aria-label="`${selected.name}地图设置`">
      <header class="map-settings-heading">
        <h2>{{ selected.name || '未命名地图' }}</h2>
        <label class="map-publish-control"><span>地图发布</span><n-switch v-model:value="selected.published" :aria-label="`${selected.name}发布状态`" @update:value="markDirtyV2" /></label>
      </header>
      <div class="map-basics">
        <n-form-item label="地图名称" :show-feedback="false"><n-input v-model:value="selected.name" :input-props="{ 'aria-label': '地图名称' }" @update:value="markDirtyV2" /></n-form-item>
        <n-form-item label="显示顺序" :show-feedback="false"><n-input-number v-model:value="selected.sort" :input-props="{ 'aria-label': '地图显示顺序' }" :min="0" @update:value="markDirtyV2" /></n-form-item>
      </div>

      <section v-for="mode in GAME_MODES" :key="mode" class="map-mode" :aria-label="`${MODE_LABELS[mode]}设置`">
        <header class="map-mode-heading">
          <div><h3>{{ MODE_LABELS[mode] }}</h3><span>{{ modeInventory(mode)?.layouts ?? 0 }} 个布局</span></div>
          <label class="map-publish-control"><span>前台显示</span><n-switch :value="selected.modeVisibility[mode]" :aria-label="`${selected.name}${MODE_LABELS[mode]}前台显示`" @update:value="setVisibility(selected, mode, $event)" /></label>
        </header>
        <n-table class="map-entry-table" :bordered="false" :single-line="true" size="small">
          <thead><tr><th scope="col">入口</th><th scope="col">使用方式</th><th scope="col">可用布局</th></tr></thead>
          <tbody><tr v-for="type in ENTRANCE_TYPES" :key="type">
            <th scope="row">{{ ENTRANCE_LABELS[type] }}</th>
            <td><n-select :value="entryUsage(selected, mode, type)" :options="usageOptions" role="combobox" :aria-label="`${selected.name}${MODE_LABELS[mode]}${ENTRANCE_LABELS[type]}使用方式`" @update:value="setUsage(selected, mode, type, $event)" /></td>
            <td>{{ readyCount(mode, type) }}</td>
          </tr></tbody>
        </n-table>
        <div v-if="selected.entranceRules[mode].enabled.length > 1" class="map-default-entrance">
          <span>默认入口</span><n-select :value="selected.entranceRules[mode].enabled[0]" :options="defaultOptions(selected, mode)" role="combobox" :aria-label="`${MODE_LABELS[mode]}默认入口`" @update:value="setDefault(selected, mode, $event)" />
        </div>
        <p v-if="modeProblem(selected, mode)" class="map-settings-error" role="alert">{{ modeProblem(selected, mode) }}</p>
      </section>

      <footer class="map-settings-footer">
        <n-collapse class="map-advanced"><n-collapse-item name="advanced" title="高级设置"><div class="map-identity"><span>地图标识</span><code>{{ selected.id }}</code></div></n-collapse-item></n-collapse>
        <n-popconfirm positive-text="移入回收站" negative-text="取消" @positive-click="remove(selected)">
          <template #trigger><n-button quaternary type="error">移入回收站</n-button></template>
          移除「{{ selected.name }}」及其全部布局？保存后从前台隐藏，可从回收站恢复。
        </n-popconfirm>
      </footer>
    </n-card>
    <div v-else class="map-manager-empty"><n-empty description="选择一张地图，或创建新地图" /></div>
  </section>
</template>
