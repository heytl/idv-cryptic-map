<script setup lang="ts">
// 版本历史：每次保存/恢复前的自动留档（R2 backups/，保留最近 50 份）
import { onMounted, ref } from 'vue';
import { fetchBackups, restoreBackup } from '../api';
import { load } from '../store';
import type { BackupItem } from '../types';

const backups = ref<BackupItem[]>([]);
const busy = ref(false);
const error = ref('');

async function refresh() {
  try {
    backups.value = (await fetchBackups()).backups;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  }
}
onMounted(refresh);

function describe(key: string): string {
  // backups/2026-07-16T05-00-00-000Z-v7.json → 2026-07-16 05:00 · v7
  const m = key.match(/backups\/(.+?)T(\d+)-(\d+)-.*-v(\d+)\.json/);
  return m ? `${m[1]} ${m[2]}:${m[3]}（保存前为 v${m[4]}）` : key;
}

async function doRestore(key: string) {
  if (!confirm(`恢复到 ${describe(key)}？当前版本会先自动留档。`)) return;
  busy.value = true;
  error.value = '';
  try {
    await restoreBackup(key);
    await load(); // 重载配置
    await refresh();
    alert('已恢复。前台用户刷新即可看到该版本。');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '恢复失败';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <p v-if="error" class="banner error">{{ error }}</p>
  <p v-if="backups.length === 0" class="muted">暂无历史版本（每次保存会自动留档）。</p>
  <table v-else>
    <thead>
      <tr><th>时间点</th><th style="width: 90px">大小</th><th style="width: 90px">操作</th></tr>
    </thead>
    <tbody>
      <tr v-for="b in backups" :key="b.key">
        <td>{{ describe(b.key) }}</td>
        <td class="muted">{{ (b.size / 1024).toFixed(1) }} KB</td>
        <td><button class="small" :disabled="busy" @click="doRestore(b.key)">恢复</button></td>
      </tr>
    </tbody>
  </table>
</template>
