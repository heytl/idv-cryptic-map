<script setup lang="ts">
// 页面骨架：标题/版本、全局错误横幅、视图切换、固定保存条
import { NAlert, NButton, NSpin, NTabPane, NTabs, useMessage } from 'naive-ui';
import { onMounted, ref } from 'vue';
import { load, save, store } from '../store';
import HistoryView from './HistoryView.vue';
import MapTable from './MapTable.vue';
import V2Workspace from './V2Workspace.vue';
import { storeV2 } from '../store-v2';

const view = ref('list');
const message = useMessage();

onMounted(load);

async function onSave() {
  const err = await save();
  if (err) message.error(err, { duration: 8000, closable: true });
  else message.success(`已保存并生效（v${store.version}）`);
}

// 有未保存改动时提醒（关标签页/刷新）
window.addEventListener('beforeunload', (e) => {
  if (store.dirty || storeV2.dirty) e.preventDefault();
});
</script>

<template>
  <header class="page-head">
    <h1>加页手记 · 地图管理</h1>
    <span v-if="view !== 'v2'" class="muted">正式 V1 · v{{ store.version }} · {{ store.updatedAt || '—' }}</span>
    <span v-else class="muted">V2 重构工作区（独立数据）</span>
  </header>

  <n-tabs v-model:value="view" type="line">
    <n-tab-pane name="list" tab="正式地图（V1）">
      <n-alert v-if="store.fatal" type="error" style="margin-bottom: 14px">
        {{ store.fatal }}
        <n-button size="small" style="margin-left: 10px" @click="load">重试</n-button>
      </n-alert>
      <div v-else-if="store.loading" class="loading-wrap"><n-spin /></div>
      <template v-else>
        <n-alert v-if="store.version === 0" type="warning" style="margin-bottom: 14px">
          KV 中还没有 V1 配置数据。
        </n-alert>
        <MapTable />
      </template>
    </n-tab-pane>
    <n-tab-pane name="history" tab="V1 版本历史">
      <HistoryView v-if="!store.loading && !store.fatal" />
    </n-tab-pane>
    <n-tab-pane name="v2" tab="V2 开发工作区"><V2Workspace /></n-tab-pane>
  </n-tabs>

  <div v-if="view !== 'v2' && !store.loading && !store.fatal" class="savebar">
    <span class="hint">{{ store.dirty ? 'V1 有未保存的改动' : 'V1 已是最新' }}</span>
    <n-button type="primary" :disabled="!store.dirty" :loading="store.saving" @click="onSave">保存 V1 并生效</n-button>
  </div>
</template>
