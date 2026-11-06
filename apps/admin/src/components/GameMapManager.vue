<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NAlert, NButton, NCard, NEmpty, NForm, NFormItem, NInput, NInputNumber, NModal, NPageHeader, NSelect, NSpace, NSwitch, NTable, NTabPane, NTabs, NTag, useDialog, useMessage } from 'naive-ui';
import { definitionReferences, purgeGameMap, type Definition, type EntranceFilter, type GameMap, type FloorDefinition, type MapDifficulty, type MapConfigV3 } from '@idv-map/shared/dynamic';
import { storeV2, markDirtyV2, saveImmediateV2 } from '../store-v2';
import DictionaryManager from './DictionaryManager.vue';

const message = useMessage(), dialog = useDialog();
const section = ref('maps'), search = ref(''), selectedId = ref(''), selectedMode = ref('');
const mapDraft = ref<GameMap | null>(null), newMap = ref(false), mapError = ref('');
const floorDraft = ref<FloorDefinition | null>(null), newFloor = ref(false), floorError = ref('');
const addingDifficulty = ref(false), difficultyId = ref<string | null>(null);
const filterDraft = ref<{ mapId: string; mode: string; type: string; filter: EntranceFilter } | null>(null), filterError = ref('');
const maps = computed(() => storeV2.gameMaps.filter(m => !m.deletedAt && !m.purgedAt).sort((a,b) => a.sort-b.sort));
const retired = computed(() => storeV2.gameMaps.filter(m => m.deletedAt && !m.purgedAt).sort((a,b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '')));
const filteredMaps = computed(() => maps.value.filter(m => m.name.toLowerCase().includes(search.value.trim().toLowerCase())));
const selected = computed(() => maps.value.find(m => m.id === selectedId.value));
const modes = computed(() => selected.value?.difficulties.filter(d => !d.deletedAt).sort((a,b) => a.sort-b.sort) ?? []);
const difficulty = computed(() => modes.value.find(d => d.difficultyId === selectedMode.value));
const floors = computed(() => difficulty.value?.floors.filter(f => !f.deletedAt).sort((a,b) => a.sort-b.sort) ?? []);
const modeName = (id: string) => storeV2.difficulties.find(d => d.id === id)?.name ?? id;
const available = computed(() => storeV2.difficulties.filter(d => !d.deletedAt && !d.archived && !modes.value.some(n => n.difficultyId === d.id)).sort((a,b) => a.sort-b.sort).map(d => ({ label: d.name, value: d.id })));
const entryDefinitions = computed(() => storeV2.entranceTypes.filter(e => !e.deletedAt && (!e.archived || difficulty.value?.entranceRules.allowed.includes(e.id))).sort((a,b) => a.sort-b.sort));
const references = computed(() => definitionReferences({ gameMaps: storeV2.gameMaps, layouts: storeV2.maps }));
const layoutCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const l of storeV2.maps) if (!l.deletedAt) counts.set(l.gameMapId, (counts.get(l.gameMapId) ?? 0) + 1);
  return counts;
});
watch(maps, list => { if (selectedId.value && !list.some(m => m.id === selectedId.value)) selectedId.value = ''; });
watch(modes, list => { if (!list.some(d => d.difficultyId === selectedMode.value)) selectedMode.value = list[0]?.difficultyId ?? ''; }, { immediate: true });
watch(section, () => { search.value = ''; });
function openMap(m: GameMap) { selectedId.value = m.id; }
function editMap(map?: GameMap) {
  newMap.value = !map;
  mapDraft.value = map ? JSON.parse(JSON.stringify(map)) : { id: `map-${crypto.randomUUID()}`, name: '', sort: Math.max(0, ...maps.value.map(m => m.sort)) + 10, published: false, difficulties: [] };
  mapError.value = '';
}
function commitMap() {
  const draft = mapDraft.value;
  if (!draft) return;
  if (!draft.name.trim() || !Number.isFinite(draft.sort)) { mapError.value = '请填写地图名称和有效排序'; return; }
  if (newMap.value) {
    storeV2.gameMaps.push({ ...draft, name: draft.name.trim() });
    selectedId.value = draft.id;
  } else {
    const map = storeV2.gameMaps.find(m => m.id === draft.id)!;
    Object.assign(map, { name: draft.name.trim(), sort: draft.sort, published: draft.published });
  }
  mapDraft.value = null;
  markDirtyV2();
}
async function saveMapAction(map: GameMap, change: (config: MapConfigV3, target: GameMap) => void, success: string) {
  const source: GameMap = JSON.parse(JSON.stringify(map));
  const failure = await saveImmediateV2(config => {
    let target = config.gameMaps.find(m => m.id === source.id);
    // A newly created local map can go straight to the recycle bin.
    if (!target) { target = JSON.parse(JSON.stringify(source)) as GameMap; config.gameMaps.push(target); }
    change(config, target);
  });
  if (failure) { message.error(failure, { duration: 10000, closable: true }); return false; }
  message.success(success);
  return true;
}
function recycle(map: GameMap) {
  const timestamp = new Date().toISOString();
  dialog.warning({ title: '移入回收站', content: `将「${map.name}」移入回收站？确认后立即对玩家隐藏，可在回收站恢复。`, positiveText: '移入回收站', negativeText: '取消', onPositiveClick() {
    return saveMapAction(map, (_config, target) => { target.deletedAt = timestamp; target.published = false; }, '已移入回收站');
  } });
}
async function restore(map: GameMap) {
  if (await saveMapAction(map, (_config, target) => { target.deletedAt = null; target.published = false; }, '地图已恢复')) {
    selectedId.value = map.id; section.value = 'maps';
  }
}
function purge(map: GameMap) {
  const now = new Date();
  dialog.warning({ title: '删除地图', content: `删除「${map.name}」及其关联布局？删除后无法从回收站恢复，历史统计保留。`, positiveText: '删除', negativeText: '取消', onPositiveClick() {
    return saveMapAction(map, (config, target) => { purgeGameMap(config, target.id, now); }, '地图已删除');
  } });
}
function addDifficulty() {
  const map = selected.value, id = difficultyId.value;
  if (!map || !id || !available.value.some(d => d.value === id)) return;
  const old = map.difficulties.find(d => d.difficultyId === id);
  if (old) { old.deletedAt = null; old.visible = false; }
  else map.difficulties.push({ difficultyId: id, sort: Math.max(0, ...modes.value.map(d => d.sort)) + 10, visible: false, floors: [], entranceRules: { allowed: [], enabled: [] } });
  selectedMode.value = id; addingDifficulty.value = false; difficultyId.value = null; markDirtyV2();
}
function removeDifficulty() {
  const d = difficulty.value;
  if (!d) return;
  if (storeV2.maps.some(l => l.gameMapId === selectedId.value && l.mode === d.difficultyId)) {
    message.warning('仍有关联布局，请先隐藏此难度'); return;
  }
  dialog.warning({ title: '移除难度', content: `从「${selected.value!.name}」移除「${modeName(d.difficultyId)}」？`, positiveText: '移除', negativeText: '取消', onPositiveClick() { d.deletedAt = new Date().toISOString(); d.visible = false; markDirtyV2(); } });
}
function showDifficulty(value: boolean) {
  if (!difficulty.value) return;
  if (value && !difficulty.value.entranceRules.enabled.length) { message.warning('请先在入口设置中配置一个开放入口'); return; }
  difficulty.value.visible = value; markDirtyV2();
}
function editFloor(floor?: FloorDefinition) {
  newFloor.value = !floor;
  floorDraft.value = floor ? { ...floor } : { id: `floor-${crypto.randomUUID()}`, name: '', sort: Math.max(0, ...floors.value.map(f => f.sort)) + 10, visible: true };
  floorError.value = '';
}
function commitFloor() {
  const draft = floorDraft.value, d = difficulty.value;
  if (!draft || !d) return;
  if (!draft.name.trim() || !Number.isFinite(draft.sort)) { floorError.value = '请填写楼层名称和有效排序'; return; }
  const result = { ...draft, name: draft.name.trim() };
  if (newFloor.value) d.floors.push(result);
  else Object.assign(d.floors.find(f => f.id === draft.id)!, result);
  floorDraft.value = null; markDirtyV2();
}
function removeFloor(floor: FloorDefinition) {
  const key = `${selectedId.value}/${selectedMode.value}/${floor.id}`;
  const unused = () => {
    const count = references.value.floors.get(key) ?? 0;
    if (count) message.warning(`仍有 ${count} 个布局使用此楼层（含草稿和回收站），请先移除图片或区域，或编辑为隐藏`);
    return !count;
  };
  if (!unused()) return;
  dialog.warning({
    title: '删除楼层', content: `确定删除「${floor.name}」？保存地图后生效。`,
    positiveText: '删除', negativeText: '取消', positiveButtonProps: { type: 'error' },
    onPositiveClick() {
      if (!unused()) return false;
      floor.deletedAt = new Date().toISOString(); floor.visible = false; markDirtyV2();
      return true;
    },
  });
}
function usage(d: MapDifficulty, type: string) { return d.entranceRules.enabled.includes(type) ? 'open' : d.entranceRules.allowed.includes(type) ? 'recording' : 'unused'; }
function setUsage(d: MapDifficulty, type: string, value: string) {
  if (value === 'unused' && storeV2.maps.some(l => !l.deletedAt && l.gameMapId === selectedId.value && l.mode === d.difficultyId && l.entrances.some(e => !e.deletedAt && e.type === type))) { message.warning('仍有布局引用此入口，可先设为仅录入'); return; }
  if (value !== 'open' && d.visible && d.entranceRules.enabled.length === 1 && d.entranceRules.enabled[0] === type) { message.warning('请先隐藏此难度，或配置其他开放入口'); return; }
  d.entranceRules.enabled = d.entranceRules.enabled.filter(t => t !== type);
  d.entranceRules.allowed = d.entranceRules.allowed.filter(t => t !== type);
  if (value !== 'unused') d.entranceRules.allowed.push(type);
  if (value === 'open') d.entranceRules.enabled.push(type);
  markDirtyV2();
}
const readyCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const l of storeV2.maps) if (l.gameMapId === selectedId.value && l.mode === selectedMode.value && l.published && !l.deletedAt && l.floorImages.full)
    for (const e of l.entrances) if (!e.deletedAt && e.image) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  return counts;
});
function setDefault(id: string) { if (difficulty.value) { difficulty.value.entranceRules.enabled = [id, ...difficulty.value.entranceRules.enabled.filter(t => t !== id)]; markDirtyV2(); } }
function editFilter(type: string) {
  if (!selected.value || !difficulty.value) return;
  filterDraft.value = { mapId: selected.value.id, mode: difficulty.value.difficultyId, type, filter: JSON.parse(JSON.stringify(difficulty.value.entranceFilters?.[type] ?? { filterLabel: '', filterOptions: [] })) };
  filterError.value = '';
}
function filterUsage(id: string) {
  const draft = filterDraft.value;
  return draft ? references.value.filterOptions.get(`${draft.mapId}/${draft.mode}/${draft.type}/${id}`) ?? 0 : 0;
}
function addFilterOption() {
  const filter = filterDraft.value?.filter;
  if (filter) filter.filterOptions.push({ id: `option-${crypto.randomUUID()}`, name: '', sort: Math.max(0, ...filter.filterOptions.map(o => o.sort)) + 10, archived: false });
}
function removeFilterOption(option: Definition) {
  const draft = filterDraft.value;
  if (!draft || storeV2.saving) return;
  const unused = () => {
    const count = filterUsage(option.id);
    if (count) message.warning(`仍有 ${count} 项引用（含草稿和回收站），请先解除引用，或设为停用`);
    return !count;
  };
  if (!unused()) return;
  dialog.warning({ title: '删除分类值', content: `确定删除「${option.name.trim() || '新分类值'}」？保存地图后生效。`, positiveText: '删除', negativeText: '取消', positiveButtonProps: { type: 'error' }, onPositiveClick() {
    if (filterDraft.value !== draft || storeV2.saving || !unused()) return false;
    const original = storeV2.gameMaps.find(m => m.id === draft.mapId)?.difficulties.find(d => d.difficultyId === draft.mode)?.entranceFilters?.[draft.type]?.filterOptions.find(o => o.id === option.id);
    if (!original) draft.filter.filterOptions = draft.filter.filterOptions.filter(o => o.id !== option.id);
    else Object.assign(option, { name: original.name, sort: original.sort, deletedAt: new Date().toISOString(), archived: true });
    return true;
  } });
}
function commitFilter() {
  const draft = filterDraft.value;
  if (!draft || storeV2.saving) return;
  const d = storeV2.gameMaps.find(m => m.id === draft.mapId)?.difficulties.find(d => d.difficultyId === draft.mode);
  if (!d || d.deletedAt) { filterError.value = '地图或难度已移除，请重新打开'; return; }
  const filter = draft.filter;
  if ((filter.filterOptions.length && !filter.filterLabel.trim()) || filter.filterOptions.some(o => !o.name.trim() || !Number.isFinite(o.sort))) { filterError.value = '请填写分类类型、值和有效排序'; return; }
  d.entranceFilters ??= {};
  d.entranceFilters[draft.type] = { filterLabel: filter.filterLabel.trim(), filterOptions: filter.filterOptions.map(o => ({ ...o, name: o.name.trim() })) };
  filterDraft.value = null;
  markDirtyV2();
}
const usages = [{ label: '不使用', value: 'unused' }, { label: '仅录入', value: 'recording' }, { label: '对玩家开放', value: 'open' }];
</script>

<template>
  <section class="map-workspace">
    <n-tabs v-model:value="section" type="line" size="large" :animated="false" pane-style="padding-top: 24px">
      <n-tab-pane name="maps" tab="地图" display-directive="show">
        <template v-if="selected">
          <n-page-header :title="selected.name" @back="selectedId = ''" class="map-detail-heading">
            <template #back><n-button quaternary size="small" aria-label="返回地图">←</n-button></template>
            <template #extra><n-space align="center" :size="12">
              <n-tag :type="selected.published ? 'success' : 'default'" :bordered="false">{{ selected.published ? '已发布' : '草稿' }}</n-tag>
              <n-button @click="editMap(selected)">编辑地图</n-button><n-button quaternary type="error" :disabled="storeV2.saving" @click="recycle(selected)">移入回收站</n-button>
            </n-space></template>
          </n-page-header>
          <n-card :bordered="false" class="difficulty-panel">
            <n-tabs v-if="modes.length" v-model:value="selectedMode" type="card" :animated="false" class="difficulty-tabs" pane-style="padding:0">
              <n-tab-pane v-for="d in modes" :key="d.difficultyId" :name="d.difficultyId" :tab="modeName(d.difficultyId)" />
              <template #suffix><n-button size="small" type="primary" secondary @click="difficultyId = null; addingDifficulty = true">添加难度</n-button></template>
            </n-tabs>
            <div v-else class="empty-difficulty-heading"><h3>难度</h3><n-button type="primary" secondary @click="difficultyId = null; addingDifficulty = true">添加难度</n-button></div>
            <template v-if="difficulty">
              <div class="difficulty-controls">
                <label>前台显示 <n-switch :value="difficulty.visible" aria-label="前台显示" @update:value="showDifficulty" /></label>
                <n-button size="small" quaternary type="error" @click="removeDifficulty">移除难度</n-button>
              </div>
              <section class="map-config-section" aria-labelledby="floor-heading">
                <header><h3 id="floor-heading">楼层</h3><n-button size="small" @click="editFloor()">新增楼层</n-button></header>
                <div class="map-table-scroll"><n-table :bordered="false" class="floor-list">
                  <thead><tr><th>名称</th><th>顺序</th><th>显示</th><th>操作</th></tr></thead>
                  <tbody>
                    <tr><td>全图</td><td>默认</td><td><n-tag size="small" :bordered="false">始终显示</n-tag></td><td></td></tr>
                    <tr v-for="f in floors" :key="f.id"><td>{{ f.name }}</td><td>{{ f.sort }}</td><td><n-tag size="small" :type="f.visible ? 'success' : 'default'" :bordered="false">{{ f.visible ? '显示' : '隐藏' }}</n-tag></td><td><n-space :wrap="false" :size="8"><n-button size="small" secondary :aria-label="`编辑楼层${f.name}`" @click="editFloor(f)">编辑</n-button><n-button size="small" quaternary type="error" :aria-label="`删除楼层${f.name}`" @click="removeFloor(f)">删除</n-button></n-space></td></tr>
                  </tbody>
                </n-table></div>
              </section>
              <section class="map-config-section" aria-labelledby="entrance-heading">
                <header><h3 id="entrance-heading">入口</h3></header>
                <div class="map-table-scroll"><n-table :bordered="false" class="entrance-list">
                  <thead><tr><th>入口</th><th>使用方式</th><th>分类类型</th><th>分类值</th><th>可用布局</th><th>操作</th></tr></thead>
                  <tbody><tr v-for="e in entryDefinitions" :key="e.id"><td>{{ e.name }}</td><td><n-select role="combobox" :value="usage(difficulty,e.id)" :options="usages" :aria-label="`${e.name}使用方式`" @update:value="setUsage(difficulty!,e.id,$event)" /></td><td>{{ difficulty.entranceFilters?.[e.id]?.filterLabel || '—' }}</td><td>{{ difficulty.entranceFilters?.[e.id]?.filterOptions.filter(o => !o.deletedAt && !o.archived).sort((a,b) => a.sort-b.sort).map(o => o.name).join('、') || '—' }}</td><td>{{ readyCounts.get(e.id) ?? 0 }}</td><td><n-button size="small" secondary :aria-label="`配置${e.name}分类`" @click="editFilter(e.id)">配置</n-button></td></tr></tbody>
                </n-table></div>
                <div v-if="difficulty.entranceRules.enabled.length > 1" class="default-entry"><label>默认入口</label><n-select role="combobox" :value="difficulty.entranceRules.enabled[0]" :options="difficulty.entranceRules.enabled.map(id => ({ value: id, label: storeV2.entranceTypes.find(e => e.id === id)?.name ?? id }))" aria-label="默认入口" @update:value="setDefault" /></div>
              </section>
            </template>
            <n-empty v-else description="添加难度开始配置" class="map-empty" />
          </n-card>
        </template>
        <n-card v-else :bordered="false" class="map-list-panel">
          <template #header>地图</template>
          <template #header-extra><n-space :size="12" align="center"><n-input v-model:value="search" clearable placeholder="搜索地图" :input-props="{ 'aria-label': '搜索地图' }" class="map-search" /><n-button type="primary" @click="editMap()">新增地图</n-button></n-space></template>
          <div v-if="filteredMaps.length" class="map-table-scroll"><n-table :bordered="false" class="map-list-table">
            <thead><tr><th>地图</th><th>已关联难度</th><th>布局</th><th>状态</th><th>操作</th></tr></thead>
            <tbody><tr v-for="m in filteredMaps" :key="m.id">
              <td><n-button text type="primary" @click="openMap(m)">{{ m.name }}</n-button></td>
              <td><n-space :size="6"><n-tag v-for="d in m.difficulties.filter(d => !d.deletedAt).sort((a,b) => a.sort-b.sort)" :key="d.difficultyId" size="small" :bordered="false">{{ modeName(d.difficultyId) }}</n-tag><span v-if="!m.difficulties.some(d => !d.deletedAt)">—</span></n-space></td>
              <td>{{ layoutCounts.get(m.id) ?? 0 }}</td><td><n-tag size="small" :type="m.published ? 'success' : 'default'" :bordered="false">{{ m.published ? '已发布' : '草稿' }}</n-tag></td>
              <td><n-space :size="8" :wrap="false"><n-button size="small" secondary :aria-label="`配置地图${m.name}`" @click="openMap(m)">配置</n-button><n-button size="small" quaternary :aria-label="`编辑地图${m.name}`" @click="editMap(m)">编辑</n-button><n-button size="small" quaternary type="error" :disabled="storeV2.saving" :aria-label="`回收地图${m.name}`" @click="recycle(m)">移入回收站</n-button></n-space></td>
            </tr></tbody>
          </n-table></div>
          <n-empty v-else :description="search ? '没有匹配的地图' : '暂无地图'" class="map-empty" />
        </n-card>
      </n-tab-pane>
      <n-tab-pane name="modes" tab="难度字典" display-directive="show"><DictionaryManager kind="modes" /></n-tab-pane>
      <n-tab-pane name="entries" tab="入口字典" display-directive="show"><DictionaryManager kind="entries" /></n-tab-pane>
      <n-tab-pane name="trash" tab="回收站" display-directive="show">
        <n-card title="回收站" :bordered="false">
          <div v-if="retired.length" class="map-table-scroll"><n-table :bordered="false" class="recycle-list">
            <thead><tr><th>地图</th><th>移入时间</th><th>操作</th></tr></thead>
            <tbody><tr v-for="m in retired" :key="m.id"><td>{{ m.name }}</td><td>{{ new Date(m.deletedAt!).toLocaleString('zh-CN', { hour12: false }) }}</td><td><n-space :wrap="false"><n-button size="small" secondary :disabled="storeV2.saving" :aria-label="`恢复地图${m.name}`" @click="restore(m)">恢复</n-button><n-button size="small" quaternary type="error" :disabled="storeV2.saving" :aria-label="`删除回收地图${m.name}`" @click="purge(m)">删除</n-button></n-space></td></tr></tbody>
          </n-table></div>
          <n-empty v-else description="回收站为空" class="map-empty" />
        </n-card>
      </n-tab-pane>
    </n-tabs>

    <n-modal :show="!!filterDraft" preset="card" :title="`${storeV2.entranceTypes.find(e => e.id === filterDraft?.type)?.name ?? ''}分类`" style="width:760px;max-width:calc(100vw - 32px)" :mask-closable="false" :closable="!storeV2.saving" :close-on-esc="!storeV2.saving" @update:show="value => { if (!value && !storeV2.saving) filterDraft = null }">
      <n-form v-if="filterDraft" label-placement="top" :disabled="storeV2.saving" @submit.prevent="commitFilter">
        <n-form-item label="分类类型"><n-input v-model:value="filterDraft.filter.filterLabel" :input-props="{ 'aria-label': '分类类型' }" placeholder="例如：方向、通道、颜色" /></n-form-item>
        <div class="option-heading"><h3>分类值</h3><n-button size="small" :disabled="storeV2.saving" @click="addFilterOption">添加值</n-button></div>
        <div class="map-table-scroll"><n-table size="small" :bordered="false" class="option-table">
          <thead><tr><th>值</th><th>顺序</th><th>停用</th><th>引用</th><th>操作</th></tr></thead>
          <tbody><tr v-for="option in filterDraft.filter.filterOptions.filter(o => !o.deletedAt).sort((a,b) => a.sort-b.sort)" :key="option.id">
            <td><n-input v-model:value="option.name" :input-props="{ 'aria-label': '分类值' }" placeholder="请输入值" /></td>
            <td><n-input-number v-model:value="option.sort" :input-props="{ 'aria-label': '分类值排序' }" /></td>
            <td><n-switch v-model:value="option.archived" :aria-label="`${option.name || '新分类值'}停用`" /></td><td>{{ filterUsage(option.id) }}</td>
            <td><n-button size="small" quaternary type="error" :disabled="storeV2.saving" :aria-label="`删除分类值${option.name || '新分类值'}`" @click="removeFilterOption(option)">删除</n-button></td>
          </tr></tbody>
        </n-table></div>
        <n-alert v-if="filterError" type="error" :show-icon="false">{{ filterError }}</n-alert>
      </n-form>
      <template #footer><n-space justify="end"><n-button :disabled="storeV2.saving" @click="filterDraft = null">取消</n-button><n-button type="primary" :disabled="storeV2.saving" @click="commitFilter">确定</n-button></n-space></template>
    </n-modal>
    <n-modal :show="!!mapDraft" preset="card" :title="newMap ? '新增地图' : '编辑地图'" style="width:480px;max-width:calc(100vw - 32px)" :mask-closable="false" @update:show="value => { if (!value) mapDraft = null }">
      <n-form v-if="mapDraft" label-placement="top" @submit.prevent="commitMap">
        <n-form-item label="地图名称" required><n-input v-model:value="mapDraft.name" :input-props="{ 'aria-label': '地图名称' }" placeholder="请输入地图名称" autofocus /></n-form-item>
        <n-form-item label="显示顺序"><n-input-number v-model:value="mapDraft.sort" :input-props="{ 'aria-label': '地图显示顺序' }" /></n-form-item>
        <n-form-item label="地图发布"><n-switch v-model:value="mapDraft.published" aria-label="地图发布" /></n-form-item>
        <p v-if="mapError" role="alert" class="form-error">{{ mapError }}</p>
      </n-form>
      <template #footer><n-space justify="end"><n-button @click="mapDraft = null">取消</n-button><n-button type="primary" @click="commitMap">确定</n-button></n-space></template>
    </n-modal>
    <n-modal v-model:show="addingDifficulty" preset="card" title="添加难度" style="width:480px;max-width:calc(100vw - 32px)" :mask-closable="false">
      <n-form label-placement="top"><n-form-item label="难度" required><n-select role="combobox" v-model:value="difficultyId" :options="available" placeholder="选择难度" aria-label="选择关联难度" /></n-form-item></n-form>
      <n-button text type="primary" @click="addingDifficulty = false; section = 'modes'">新建难度字典</n-button>
      <template #footer><n-space justify="end"><n-button @click="addingDifficulty = false">取消</n-button><n-button type="primary" :disabled="!difficultyId" @click="addDifficulty">添加</n-button></n-space></template>
    </n-modal>
    <n-modal :show="!!floorDraft" preset="card" :title="newFloor ? '新增楼层' : '编辑楼层'" style="width:480px;max-width:calc(100vw - 32px)" :mask-closable="false" @update:show="value => { if (!value) floorDraft = null }">
      <n-form v-if="floorDraft" label-placement="top" @submit.prevent="commitFloor">
        <n-form-item label="楼层名称" required><n-input v-model:value="floorDraft.name" :input-props="{ 'aria-label': '楼层名称' }" placeholder="例如：负四楼" autofocus /></n-form-item>
        <n-form-item label="显示顺序"><n-input-number v-model:value="floorDraft.sort" :input-props="{ 'aria-label': '楼层顺序' }" /></n-form-item>
        <n-form-item label="前台显示"><n-switch v-model:value="floorDraft.visible" aria-label="楼层显示" /></n-form-item>
        <p v-if="floorError" role="alert" class="form-error">{{ floorError }}</p>
      </n-form>
      <template #footer><n-space justify="end"><n-button @click="floorDraft = null">取消</n-button><n-button type="primary" @click="commitFloor">确定</n-button></n-space></template>
    </n-modal>
  </section>
</template>

<style scoped>
.map-workspace { min-width:0; }
.map-table-scroll { overflow-x:auto; }
.map-list-table { min-width:690px; }
.map-list-table td:first-child { min-width:120px; }
.map-list-table td:nth-child(2) { max-width:320px; }
.map-list-table td:nth-child(n+3), .map-list-table th:nth-child(n+3) { white-space:nowrap; }
.map-list-table td:last-child { width:220px; }
.map-search { width:200px; }
.map-detail-heading { margin-bottom:24px; }
.difficulty-controls { display:flex; align-items:center; justify-content:space-between; padding:16px 0; border-bottom:1px solid var(--border); }
.empty-difficulty-heading { display:flex; align-items:center; justify-content:space-between; }
.empty-difficulty-heading h3 { margin:0; font-size:16px; }
.difficulty-controls label { display:flex; align-items:center; gap:12px; }
.map-config-section { margin-top:24px; }
.map-config-section + .map-config-section { padding-top:24px; border-top:1px solid var(--border); }
.map-config-section header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
.map-config-section h3 { margin:0; font-size:16px; font-weight:600; }
.floor-list { min-width:460px; }
.floor-list td:last-child { width:136px; }
.floor-list td:first-child { min-width:120px; }
.floor-list th:not(:first-child), .floor-list td:not(:first-child) { white-space:nowrap; }
.entrance-list { min-width:780px; }
.entrance-list td:nth-child(2) { width:180px; }
.entrance-list th { white-space:nowrap; }
.option-heading { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
.option-heading h3 { margin:0; font-size:14px; }
.option-table { min-width:570px; }
.option-table td:first-child { min-width:140px; }
.option-table td:nth-child(2) { width:120px; }
.option-table td:nth-child(n+3) { white-space:nowrap; }
.default-entry { display:flex; align-items:center; gap:16px; margin-top:20px; }
.default-entry :deep(.n-select) { width:200px; }
.recycle-list { min-width:510px; }
.recycle-list td:last-child { width:160px; }
.map-empty { padding:48px 0; }
.form-error { color:var(--error, #e88080); }
@media(max-width:700px) {
  .map-list-panel :deep(.n-card-header) { align-items:flex-start; gap:16px; flex-direction:column; }
  .map-list-panel :deep(.n-card-header__extra) { margin-left:0; }
  .map-search { width:160px; }
  .map-detail-heading :deep(.n-page-header__extra) { margin-top:16px; }
  .difficulty-panel :deep(.n-card__content) { padding:16px; }
}
</style>
