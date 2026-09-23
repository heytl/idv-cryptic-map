<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { NAlert, NButton, NSelect, NSpin } from "naive-ui";
import {
  beijingDay,
  dayOffset,
  MODE_LABELS,
  ENTRANCE_LABELS,
  type StatsReport,
  type StatRow,
  type GameMode,
  type EntranceType,
} from "@idv-map/shared";
import { request } from "../api-v2";
import { storeV2 } from "../store-v2";
const today = beijingDay();
const from = ref(dayOffset(today, -6));
const to = ref(today);
const gameMapId = ref<string | null>(null);
const mode = ref<string | null>(null);
const report = ref<StatsReport | null>(null);
const busy = ref(false);
const error = ref("");
const mapOptions = computed(() =>
  storeV2.gameMaps.map((m) => ({ label: m.name, value: m.id })),
);
const params = () =>
  new URLSearchParams({
    from: from.value,
    to: to.value,
    ...(gameMapId.value ? { gameMapId: gameMapId.value } : {}),
    ...(mode.value ? { mode: mode.value } : {}),
  });
async function load() {
  busy.value = true;
  error.value = "";
  report.value = null;
  try {
    report.value = await request<StatsReport>(`/api/admin/stats?${params()}`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "统计加载失败";
  } finally {
    busy.value = false;
  }
}
function range(days: number) {
  to.value = today;
  from.value = dayOffset(today, 1 - days);
  void load();
}
async function download() {
  try {
    const data = await request(`/api/admin/stats/export?${params()}`);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `visits-${from.value}-${to.value}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "导出失败";
  }
}
const groups = computed(() =>
  report.value
    ? [
        {
          title: report.value.query.gameMapId ? "当前地图访问" : "地图排行",
          rows: report.value.gameMaps,
        },
        {
          title: report.value.query.gameMapId ? "当前地图布局排行" : "布局排行（全部地图）",
          rows: report.value.layouts,
        },
        {
          title: "模式分布",
          rows: report.value.modes.map((r) => ({
            ...r,
            label: MODE_LABELS[r.key as GameMode] || r.key,
          })),
        },
        {
          title: "首次进入入口",
          rows: report.value.entrances.map((r) => ({
            ...r,
            label: entranceLabel(r),
          })),
        },
      ]
    : [],
);
function entranceLabel(r: StatRow) {
  return ENTRANCE_LABELS[r.key as EntranceType] || r.key;
}
onMounted(load);
</script>
<template>
  <n-alert type="info"
    >仅统计正式主站在线查阅次数，不代表游戏内布局出现概率。刷新、重新进入分别计数；不统计
    UV。北京时间按日汇总，明细保留 90 天。</n-alert
  >
  <form class="toolbar stats-filters" @submit.prevent="load">
    <n-button :disabled="busy" @click="range(7)">近 7 天</n-button
    ><n-button :disabled="busy" @click="range(30)">近 30 天</n-button>
    <label
      >开始
      <input
        type="date"
        v-model="from"
        :min="dayOffset(today, -89)"
        :max="to"
        required
    /></label>
    <label
      >结束 <input type="date" v-model="to" :min="from" :max="today" required
    /></label>
    <n-select
      v-model:value="gameMapId"
      clearable
      placeholder="全部地图"
      aria-label="统计地图"
      :options="mapOptions"
      style="width: 180px"
    />
    <n-select
      v-model:value="mode"
      clearable
      placeholder="全部模式"
      aria-label="统计模式"
      :options="[
        { label: '困难', value: 'hard' },
        { label: '噩梦', value: 'nightmare' },
      ]"
      style="width: 140px"
    />
    <n-button attr-type="submit" :loading="busy">查询</n-button
    ><n-button :disabled="busy" @click="download">导出明细</n-button>
  </form>
  <n-alert v-if="error" type="error">{{ error }}</n-alert
  ><n-spin v-if="busy" />
  <template v-if="report">
    <h2>{{ report.total.toLocaleString() }} 次访问</h2>
    <p class="muted">
      统计始于
      {{
        report.startedAt
          ? new Date(report.startedAt).toLocaleString("zh-CN", {
              timeZone: "Asia/Shanghai",
            })
          : "尚无记录"
      }}
      · {{ report.query.from }} 至 {{ report.query.to }} ·
      占比基于当前筛选总次数
    </p>
    <p v-if="report.total === 0" role="status">所选范围暂无访问记录。</p>
    <section class="stats-panel">
      <h3>每日访问</h3>
      <div class="trend" aria-label="每日访问趋势">
        <div
          v-for="day in report.daily"
          :key="day.key"
          class="trend-day"
          :title="`${day.key}：${day.count} 次`"
        >
          <div
            class="trend-bar"
            :style="{
              height: `${Math.max(1, (day.count / Math.max(1, ...report.daily.map((d) => d.count))) * 100)}px`,
            }"
          ></div>
          <small>{{ day.key.slice(5) }}</small
          ><span>{{ day.count }}</span>
        </div>
      </div>
    </section>
    <div class="stats-grid">
      <section v-for="group in groups" :key="group.title" class="stats-panel">
        <h3>{{ group.title }}</h3>
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>次数</th>
              <th>占比</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in group.rows" :key="row.key">
              <td>{{ row.label || row.key }}</td>
              <td>{{ row.count }}</td>
              <td>{{ (row.share * 100).toFixed(1) }}%</td>
            </tr>
          </tbody>
        </table>
        <p v-if="!group.rows.length">暂无数据</p>
      </section>
    </div>
  </template>
</template>
<style scoped>
.stats-filters {
  flex-wrap: wrap;
}
.stats-filters input {
  color: inherit;
  background: #222;
  border: 1px solid #666;
  border-radius: 4px;
  padding: 7px;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 18px;
}
.stats-panel {
  padding: 18px;
  border: 1px solid #444;
  border-radius: 8px;
  margin: 16px 0;
  overflow: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  text-align: left;
  padding: 9px;
  border-bottom: 1px solid #444;
}
th:not(:first-child),
td:not(:first-child) {
  text-align: right;
  white-space: nowrap;
}
.trend {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  overflow: auto;
}
.trend-day {
  min-width: 42px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}
.trend-bar {
  background: #b89762;
  width: 24px;
  border-radius: 3px 3px 0 0;
}
</style>
