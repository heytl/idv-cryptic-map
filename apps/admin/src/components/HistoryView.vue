<script setup lang="ts">
// 版本历史：每次保存/恢复前的自动留档（R2 backups/，保留最近 50 份）
import { NButton, NEmpty, NPopconfirm, useMessage } from 'naive-ui';
import { onMounted, ref } from 'vue';
import { fetchBackups, restoreBackup } from '../api';
import { load } from '../store';
import type { BackupItem } from '../types';

const backups = ref<BackupItem[]>([]);
const busy = ref(false);
const message = useMessage();

async function refresh() {
  try {
    backups.value = (await fetchBackups()).backups;
  } catch (e) {
    message.error(e instanceof Error ? e.message : '加载失败');
  }
}
onMounted(refresh);

function describe(key: string): string {
  // backups/2026-07-16T05-00-00-000Z-v7.json → 2026-07-16 05:00 · v7
  const m = key.match(/backups\/(.+?)T(\d+)-(\d+)-.*-v(\d+)\.json/);
  return m ? `${m[1]} ${m[2]}:${m[3]}（保存前为 v${m[4]}）` : key;
}

async function doRestore(key: string) {
  busy.value = true;
  try {
    await restoreBackup(key);
    await load(); // 重载配置
    await refresh();
    message.success('已恢复。前台用户刷新即可看到该版本。');
  } catch (e) {
    message.error(e instanceof Error ? e.message : '恢复失败');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <n-empty v-if="backups.length === 0" description="暂无历史版本（每次保存会自动留档）" style="margin: 32px 0" />
  <div v-else class="card-list">
    <div v-for="b in backups" :key="b.key" class="map-card history-row">
      <span class="grow">{{ describe(b.key) }}</span>
      <span class="muted">{{ (b.size / 1024).toFixed(1) }} KB</span>
      <n-popconfirm @positive-click="doRestore(b.key)">
        <template #trigger>
          <n-button size="tiny" :disabled="busy">恢复</n-button>
        </template>
        恢复到该版本？当前版本会先自动留档。
      </n-popconfirm>
    </div>
  </div>
</template>
