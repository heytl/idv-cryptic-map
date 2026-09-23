<script setup lang="ts">
import { onMounted, ref } from "vue";
import { NTabPane, NTabs } from "naive-ui";
import V2Workspace from "./V2Workspace.vue";
import GameMapManager from "./GameMapManager.vue";
import StatsView from "./StatsView.vue";
import BackupsView from "./BackupsView.vue";
import { loadV2, storeV2 } from "../store-v2";
const view = ref("layouts");
onMounted(() => {
  if (!storeV2.loaded && !storeV2.loading) void loadV2();
});
window.addEventListener("beforeunload", (e) => {
  if (storeV2.dirty) e.preventDefault();
});
</script>
<template>
  <header class="page-head">
    <h1>加页手记 · 内容管理</h1>
    <span class="muted"
      >v{{ storeV2.version }} · {{ storeV2.updatedAt || "尚未保存" }}</span
    >
  </header>
  <n-tabs v-model:value="view" type="line">
    <n-tab-pane name="layouts" tab="布局管理"><V2Workspace /></n-tab-pane>
    <n-tab-pane name="maps" tab="地图管理"><GameMapManager /></n-tab-pane>
    <n-tab-pane name="statistics" tab="访问统计"><StatsView /></n-tab-pane>
    <n-tab-pane name="backups" tab="备份与恢复"><BackupsView /></n-tab-pane>
  </n-tabs>
</template>
