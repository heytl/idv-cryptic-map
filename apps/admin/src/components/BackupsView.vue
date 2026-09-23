<script setup lang="ts">
import { onMounted, ref } from "vue";
import { NAlert, NButton, NPopconfirm, useMessage } from "naive-ui";
import { request } from "../api-v2";
import { storeV2, loadV2 } from "../store-v2";
const backups = ref<{ key: string; uploaded: string }[]>([]);
const error = ref("");
const busy = ref(false);
const message = useMessage();
async function load() {
  try {
    backups.value = (
      await request<{ backups: typeof backups.value }>("/api/admin/v3/backups")
    ).backups;
  } catch (e) {
    error.value = String(e);
  }
}
async function restore(key: string) {
  busy.value = true;
  try {
    await request("/api/admin/v3/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, baseVersion: storeV2.version }),
    });
    await loadV2();
    await load();
    message.success("已恢复为新版本");
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <n-alert type="info"
    >恢复前自动备份当前版本。恢复不会改变访问统计，也不会复用已移除的布局
    ID。完整配置与图片迁移使用仓库中的 content-transfer 工具。</n-alert
  >
  <n-alert v-if="storeV2.dirty" type="warning"
    >请先保存或撤销未保存的内容，再恢复历史版本。</n-alert
  >
  <n-alert v-if="error" type="error">{{ error }}</n-alert>
  <p v-if="!backups.length">暂无历史备份，首次保存后生成。</p>
  <article v-for="item in backups" :key="item.key" class="map-card">
    <div class="meta">
      <strong>{{ item.key }}</strong>
      <div>{{ item.uploaded }}</div>
    </div>
    <n-popconfirm @positive-click="restore(item.key)"
      ><template #trigger
        ><n-button :disabled="storeV2.dirty || busy">恢复</n-button></template
      >将此备份恢复为新版本？</n-popconfirm
    >
  </article>
</template>
