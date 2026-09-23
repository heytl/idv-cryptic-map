<script setup lang="ts">
import { ref } from "vue";
import {
  NAlert,
  NButton,
  NInput,
  NInputNumber,
  NSwitch,
  useMessage,
} from "naive-ui";
import { storeV2, markDirtyV2, saveV2 } from "../store-v2";
const name = ref("");
const message = useMessage();
function add() {
  if (!name.value.trim()) return;
  storeV2.gameMaps.push({
    id: `map-${crypto.randomUUID()}`,
    name: name.value.trim(),
    sort: (storeV2.gameMaps.length + 1) * 10,
    published: false,
  });
  name.value = "";
  markDirtyV2();
}
async function save() {
  const error = await saveV2();
  if (error) message.error(error);
  else message.success("已保存");
}
function remove(id: string) {
  if (storeV2.maps.some((l) => l.gameMapId === id)) {
    message.warning("仍有关联布局，请使用下架");
    return;
  }
  const m = storeV2.gameMaps.find((m) => m.id === id)!;
  m.published = false;
  m.deletedAt = new Date().toISOString();
  markDirtyV2();
}
</script>
<template>
  <n-alert type="info"
    >新增地图默认为草稿。地图下架后，其全部布局会从前台隐藏；历史访问记录保留。</n-alert
  >
  <div class="toolbar">
    <n-input
      v-model:value="name"
      aria-label="新地图名称"
      placeholder="新地图名称"
      style="max-width: 300px"
      @keyup.enter="add"
    /><n-button @click="add" :disabled="!name.trim()">新增地图</n-button>
  </div>
  <article
    v-for="map in storeV2.gameMaps.filter((m) => !m.deletedAt)"
    :key="map.id"
    class="map-card"
  >
    <div class="meta">
      <n-input
        v-model:value="map.name"
        aria-label="地图名称"
        @update:value="markDirtyV2"
      /><small>{{ map.id }}</small>
    </div>
    <label
      >排序<n-input-number
        v-model:value="map.sort"
        aria-label="地图排序"
        @update:value="markDirtyV2"
        style="width: 110px"
    /></label>
    <label
      >发布
      <n-switch
        v-model:value="map.published"
        :aria-label="`${map.name}发布状态`"
        @update:value="markDirtyV2"
    /></label>
    <n-button
      :disabled="storeV2.maps.some((l) => l.gameMapId === map.id)"
      @click="remove(map.id)"
      >移除空地图</n-button
    >
  </article>
  <div class="savebar">
    <span>{{ storeV2.dirty ? "有未保存的改动" : "已保存" }}</span
    ><n-button
      type="primary"
      :loading="storeV2.saving"
      :disabled="!storeV2.dirty"
      @click="save"
      >保存内容</n-button
    >
  </div>
</template>
