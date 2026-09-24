<script setup lang="ts">
import { ref } from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NEmpty,
  NFormItem,
  NInput,
  NInputNumber,
  NPopconfirm,
  NSpace,
  NSwitch,
  NTag,
  useMessage,
} from "naive-ui";
import { storeV2, markDirtyV2 } from "../store-v2";

const name = ref("");
const mapId = ref("");
const message = useMessage();
const idPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;

function add() {
  const id = mapId.value.trim();
  if (!name.value.trim()) return;
  if (!idPattern.test(id)) {
    message.error("地图标识需为 1–64 位小写字母、数字或连字符，且以字母或数字开头");
    return;
  }
  if (storeV2.gameMaps.some((map) => map.id === id)) {
    message.error("地图标识已存在（包括回收站中的地图），请换一个标识");
    return;
  }
  storeV2.gameMaps.push({
    id,
    name: name.value.trim(),
    sort: (storeV2.gameMaps.length + 1) * 10,
    published: false,
  });
  name.value = "";
  mapId.value = "";
  markDirtyV2();
}

function remove(id: string) {
  const map = storeV2.gameMaps.find((item) => item.id === id);
  if (!map) return;
  map.published = false;
  map.deletedAt = new Date().toISOString();
  for (const layout of storeV2.maps.filter((item) => item.gameMapId === id)) {
    layout.published = false;
  }
  markDirtyV2();
}

function restore(id: string) {
  const map = storeV2.gameMaps.find((item) => item.id === id);
  if (!map) return;
  map.deletedAt = null;
  markDirtyV2();
}
</script>

<template>
  <section class="admin-page">
    <n-card class="surface-card" :bordered="false">
      <template #header>
        <div class="card-title-row">
          <div>
            <h2>地图目录</h2>
            <p>创建地图并管理标识、排序和前台发布状态。</p>
          </div>
          <n-tag :bordered="false">{{ storeV2.gameMaps.filter((item) => !item.deletedAt).length }} 张地图</n-tag>
        </div>
      </template>

      <n-alert type="info" :show-icon="true">
        新增地图默认为草稿。地图标识用于 URL 与数据关联；移除地图会连同布局移入回收站，保存后从前台隐藏，历史访问记录保留。
      </n-alert>

      <form class="map-manager-create" @submit.prevent="add">
        <n-form-item label="地图名称" required>
          <n-input v-model:value="name" placeholder="例如：遗忘之境" autocomplete="off" />
        </n-form-item>
        <n-form-item label="地图标识" required feedback="1–64 位小写字母、数字或连字符，例如 new-map">
          <n-input v-model:value="mapId" placeholder="new-map" autocomplete="off" />
        </n-form-item>
        <n-button type="primary" attr-type="submit" :disabled="!name.trim() || !mapId.trim()">新增地图</n-button>
      </form>

      <div v-if="storeV2.gameMaps.some((item) => !item.deletedAt)" class="map-manager-list">
        <article
          v-for="map in storeV2.gameMaps.filter((item) => !item.deletedAt)"
          :key="map.id"
          class="map-card map-manager-row"
        >
          <div class="map-manager-name">
            <n-input v-model:value="map.name" aria-label="地图名称" @update:value="markDirtyV2" />
            <small>{{ map.id }}</small>
          </div>
          <n-form-item label="排序" :show-feedback="false" class="map-sort-field">
            <n-input-number v-model:value="map.sort" aria-label="地图排序" :min="0" @update:value="markDirtyV2" />
          </n-form-item>
          <n-space align="center" :size="8">
            <span class="muted">发布</span>
            <n-switch v-model:value="map.published" :aria-label="`${map.name}发布状态`" @update:value="markDirtyV2" />
          </n-space>
          <n-popconfirm positive-text="移入回收站" negative-text="取消" @positive-click="remove(map.id)">
            <template #trigger>
              <n-button type="error" secondary>移除</n-button>
            </template>
            移除「{{ map.name }}」及其全部布局？保存后会从前台隐藏，可在回收站恢复。
          </n-popconfirm>
        </article>
      </div>
      <n-empty v-else description="还没有地图，请在上方创建" />
    </n-card>

    <n-card v-if="storeV2.gameMaps.some((item) => item.deletedAt)" class="surface-card" :bordered="false">
      <template #header>
        <div class="card-title-row">
          <div>
            <h2>回收站</h2>
            <p>恢复后地图与原布局仍为草稿，不会自动重新发布。</p>
          </div>
          <n-tag type="warning" :bordered="false">{{ storeV2.gameMaps.filter((item) => item.deletedAt).length }}</n-tag>
        </div>
      </template>
      <div class="map-manager-list">
        <article v-for="map in storeV2.gameMaps.filter((item) => item.deletedAt)" :key="`deleted-${map.id}`" class="map-card map-manager-restore">
          <div class="map-manager-name"><strong>{{ map.name }}</strong><small>{{ map.id }}</small></div>
          <n-button @click="restore(map.id)">恢复地图</n-button>
        </article>
      </div>
    </n-card>

  </section>
</template>
