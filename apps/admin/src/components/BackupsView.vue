<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NEmpty,
  NPopconfirm,
  NSpace,
  NSpin,
  NTag,
  useMessage,
} from "naive-ui";
import { request } from "../api-v2";
import { storeV2, loadV2 } from "../store-v2";

const backups = ref<{ key: string; uploaded: string }[]>([]);
const error = ref("");
const loading = ref(false);
const busy = ref(false);
const message = useMessage();

async function load() {
  loading.value = true;
  error.value = "";
  try {
    backups.value = (await request<{ backups: typeof backups.value }>("/api/admin/v3/backups")).backups;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "备份列表加载失败";
  } finally {
    loading.value = false;
  }
}

function uploadedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

async function restore(key: string) {
  busy.value = true;
  error.value = "";
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
    error.value = e instanceof Error ? e.message : "恢复失败";
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="admin-page">
    <n-card class="surface-card" :bordered="false">
      <template #header>
        <div class="card-title-row">
          <div>
            <h2>历史版本</h2>
            <p>恢复会创建一个新版本，当前内容会先自动备份。</p>
          </div>
          <n-space align="center" :size="10">
            <n-tag :bordered="false">{{ backups.length }} 个备份</n-tag>
            <n-button :loading="loading" @click="load">刷新列表</n-button>
          </n-space>
        </div>
      </template>

      <n-alert type="info" :show-icon="true">
        恢复不会改变访问统计，也不会复用已移除的布局 ID。完整配置与图片迁移使用仓库中的 content-transfer 工具。
      </n-alert>
      <n-alert v-if="storeV2.dirty" type="warning" :show-icon="true" style="margin-top: 12px">
        有未保存的内容。请先保存或刷新撤销修改，再恢复历史版本。
      </n-alert>
      <n-alert v-if="error" type="error" :show-icon="true" style="margin-top: 12px">{{ error }}</n-alert>

      <n-spin :show="loading || busy">
        <div v-if="backups.length" class="backup-list">
          <article v-for="item in backups" :key="item.key" class="backup-row">
            <div class="map-manager-name">
              <strong>{{ item.key }}</strong>
              <span class="backup-time">备份时间：{{ uploadedAt(item.uploaded) }}</span>
            </div>
            <n-popconfirm
              positive-text="恢复此版本"
              negative-text="取消"
              :disabled="storeV2.dirty || busy"
              @positive-click="restore(item.key)"
            >
              <template #trigger>
                <n-button type="primary" secondary :disabled="storeV2.dirty || busy">恢复</n-button>
              </template>
              将此版本恢复为新的当前版本？系统会先备份现在的内容。
            </n-popconfirm>
          </article>
        </div>
        <n-empty v-else-if="!loading" description="暂无历史备份，首次保存后生成" />
      </n-spin>
    </n-card>
  </section>
</template>
