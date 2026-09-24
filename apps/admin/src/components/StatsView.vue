<script setup lang="ts">
import { computed, h, onMounted, ref } from "vue";
import {
  NButton,
  NCard,
  NDataTable,
  NDatePicker,
  NEmpty,
  NProgress,
  NSelect,
  NSpin,
  NTag,
  type DataTableColumns,
} from "naive-ui";
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
import { API_BASE, request } from "../api-v2";
import { storeV2 } from "../store-v2";

type NamedStatRow = StatRow & { label: string };
const today = beijingDay();
const from = ref(dayOffset(today, -6));
const to = ref(today);
const gameMapId = ref<string | null>(null);
const mode = ref<string | null>(null);
const report = ref<StatsReport | null>(null);
const busy = ref(false);
const exporting = ref(false);
const error = ref("");
const activeDay = ref<string | null>(null);
const localApi =
  ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
  (!API_BASE || API_BASE.includes("localhost") || API_BASE.includes("127.0.0.1"));

const mapOptions = computed(() =>
  storeV2.gameMaps.map((map) => ({
    label: map.deletedAt ? `${map.name}（已移除）` : map.name,
    value: map.id,
  })),
);
const fromDate = computed<number | null>({
  get: () => dateValue(from.value),
  set: (value) => {
    if (value != null) from.value = dateKey(value);
  },
});
const toDate = computed<number | null>({
  get: () => dateValue(to.value),
  set: (value) => {
    if (value != null) to.value = dateKey(value);
  },
});

function dateValue(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year!, month! - 1, day!).getTime();
}
function dateKey(value: number): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function dateDisabled(value: number, min: string, max: string): boolean {
  const key = dateKey(value);
  return key < min || key > max;
}
function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

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
  try {
    report.value = await request<StatsReport>(`/api/admin/stats?${params()}`);
    activeDay.value = null;
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
  exporting.value = true;
  error.value = "";
  try {
    const data = await request(`/api/admin/stats/export?${params()}`);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `visits-${from.value}-${to.value}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "导出失败";
  } finally {
    exporting.value = false;
  }
}

function layoutLabel(row: StatRow): string {
  const layout = storeV2.maps.find((item) => String(item.id) === row.key);
  if (!layout) return `布局 #${row.key}`;
  const gameMap = storeV2.gameMaps.find((item) => item.id === layout.gameMapId);
  return `${layout.displayName || layout.name} · ${gameMap?.name ?? layout.gameMapId}`;
}

const mapRows = computed<NamedStatRow[]>(() =>
  (report.value?.gameMaps ?? []).map((row) => ({
    ...row,
    label: storeV2.gameMaps.find((map) => map.id === row.key)?.name ?? `地图 ${row.key}`,
  })),
);
const layoutRows = computed<NamedStatRow[]>(() =>
  (report.value?.layouts ?? []).map((row) => ({ ...row, label: layoutLabel(row) })),
);
const modeRows = computed<NamedStatRow[]>(() =>
  (report.value?.modes ?? []).map((row) => ({
    ...row,
    label: MODE_LABELS[row.key as GameMode] || row.key,
  })),
);
const entranceRows = computed<NamedStatRow[]>(() =>
  (report.value?.entrances ?? []).map((row) => ({
    ...row,
    label: ENTRANCE_LABELS[row.key as EntranceType] || row.key,
  })),
);
const average = computed(() => {
  const days = report.value?.daily.length ?? 0;
  return days ? ((report.value?.total ?? 0) / days).toFixed(1) : "0";
});
const peakDay = computed(() =>
  [...(report.value?.daily ?? [])].sort((a, b) => b.count - a.count)[0],
);

const chartPoints = computed(() => {
  const days = report.value?.daily ?? [];
  if (!days.length) return [];
  const rawMax = Math.max(0, ...days.map((day) => day.count));
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, rawMax)));
  const max = rawMax <= 5 ? 5 : Math.ceil((rawMax / magnitude) * 2) / 2 * magnitude;
  const left = 54;
  const right = 890;
  const top = 24;
  const bottom = 244;
  const width = right - left;
  const height = bottom - top;
  return days.map((day, index) => ({
    day,
    x: days.length === 1 ? (left + right) / 2 : left + (index / (days.length - 1)) * width,
    y: bottom - (day.count / max) * height,
    peak: day.count > 0 && day.count === rawMax,
    max,
    left,
    right,
    top,
    bottom,
  }));
});
const chartMax = computed(() => chartPoints.value[0]?.max ?? 1);
const chartTicks = computed(() =>
  Array.from({ length: 5 }, (_, index) => ({
    value: (chartMax.value * (4 - index)) / 4,
    y: 24 + ((244 - 24) * index) / 4,
  })),
);
const trendPath = computed(() =>
  chartPoints.value
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" "),
);
const trendArea = computed(() => {
  const points = chartPoints.value;
  if (!points.length) return "";
  return `${trendPath.value} L${points[points.length - 1]!.x.toFixed(1)},244 L${points[0]!.x.toFixed(1)},244 Z`;
});
const xLabels = computed(() => {
  const points = chartPoints.value;
  const every = Math.max(1, Math.ceil(points.length / 12));
  return points.filter((_, index) => index === 0 || index === points.length - 1 || index % every === 0);
});
const activePoint = computed(
  () => chartPoints.value.find((point) => point.day.key === activeDay.value) ?? chartPoints.value.at(-1),
);

function topPercent(row: NamedStatRow, rows: NamedStatRow[]): number {
  const max = Math.max(1, ...rows.map((item) => item.count));
  return Math.max(2, (row.count / max) * 100);
}

const layoutColumns: DataTableColumns<NamedStatRow> = [
  {
    title: "排名",
    key: "rank",
    width: 72,
    render: (_row, index) =>
      h(NTag, { size: "small", bordered: false, type: index < 3 ? "info" : "default" }, {
        default: () => String(index + 1).padStart(2, "0"),
      }),
  },
  { title: "地图布局", key: "label", ellipsis: { tooltip: true } },
  {
    title: "访问次数",
    key: "count",
    width: 150,
    align: "right",
    sorter: (a, b) => a.count - b.count,
    render: (row) => row.count.toLocaleString(),
  },
  {
    title: "占比",
    key: "share",
    width: 210,
    align: "right",
    render: (row) =>
      h("div", { class: "stats-share-cell" }, [
        h("span", { class: "stats-share-track" }, [
          h("span", { style: { width: percent(row.share) } }),
        ]),
        h("strong", percent(row.share)),
      ]),
  },
];

onMounted(load);
</script>

<template>
  <section class="admin-page stats-page">
    <div class="stats-source-notice">
      <n-tag v-if="localApi" size="small" type="warning" :bordered="false">本地演示数据</n-tag>
      <n-tag v-else size="small" type="info" :bordered="false">正式主站数据</n-tag>
      <span v-if="localApi">仅用于预览交互与图表，不代表线上访问情况；服务重启后重置。</span>
      <span v-else>记录在线查阅次数，不代表游戏内布局出现概率；刷新、重新进入分别计数，不统计 UV。</span>
      <span class="stats-source-spacer"></span>
      <span>北京时间 · 明细保留 90 天</span>
    </div>

    <form class="stats-filters" @submit.prevent="load">
      <div class="quick-ranges" aria-label="快速选择日期范围">
        <n-button size="small" secondary :disabled="busy" @click="range(7)">近 7 天</n-button>
        <n-button size="small" secondary :disabled="busy" @click="range(30)">近 30 天</n-button>
      </div>
      <label class="stats-filter-field">
        <span>开始日期</span>
        <n-date-picker v-model:value="fromDate" type="date" :is-date-disabled="(value: number) => dateDisabled(value, dayOffset(today, -89), to)" />
      </label>
      <label class="stats-filter-field">
        <span>结束日期</span>
        <n-date-picker v-model:value="toDate" type="date" :is-date-disabled="(value: number) => dateDisabled(value, from, today)" />
      </label>
      <label class="stats-filter-field">
        <span>地图</span>
        <n-select v-model:value="gameMapId" :options="mapOptions" clearable placeholder="全部地图" aria-label="统计地图" />
      </label>
      <label class="stats-filter-field">
        <span>模式</span>
        <n-select
          v-model:value="mode"
          clearable
          placeholder="全部模式"
          aria-label="统计模式"
          :options="[{ label: '困难', value: 'hard' }, { label: '噩梦', value: 'nightmare' }]"
        />
      </label>
      <n-button attr-type="submit" type="primary" :loading="busy">查询</n-button>
      <n-button :disabled="busy || exporting || !report" :loading="exporting" @click="download">导出明细</n-button>
    </form>

    <n-alert v-if="error" type="error" :show-icon="true">{{ error }}</n-alert>
    <n-spin :show="busy" class="stats-spin">
      <template v-if="report">
        <div class="stats-kpis">
          <n-card class="surface-card stats-kpi" :bordered="false">
            <div class="stats-kpi-content">
              <span class="stats-kpi-label">总访问量</span>
              <strong>{{ report.total.toLocaleString() }}</strong>
              <span class="stats-kpi-foot">{{ report.query.from }} 至 {{ report.query.to }}</span>
            </div>
          </n-card>
          <n-card class="surface-card stats-kpi" :bordered="false">
            <div class="stats-kpi-content">
              <span class="stats-kpi-label">日均访问</span>
              <strong>{{ average }}</strong>
              <span class="stats-kpi-foot">按所选区间 {{ report.daily.length }} 天计算</span>
            </div>
          </n-card>
          <n-card class="surface-card stats-kpi" :bordered="false">
            <div class="stats-kpi-content">
              <span class="stats-kpi-label">访问峰值</span>
              <strong>{{ peakDay?.count.toLocaleString() ?? 0 }}</strong>
              <span class="stats-kpi-foot">{{ peakDay?.key ?? "暂无记录" }}</span>
            </div>
          </n-card>
          <n-card class="surface-card stats-kpi stats-kpi-start" :bordered="false">
            <div class="stats-kpi-content">
              <span class="stats-kpi-label">统计开始于</span>
              <strong>{{ report.startedAt ? new Date(report.startedAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }) : "—" }}</strong>
              <span class="stats-kpi-foot">访问明细保留 90 天</span>
            </div>
          </n-card>
        </div>

        <n-card class="surface-card stats-trend-card" :bordered="false">
          <template #header>
            <div class="stats-panel-heading">
              <div>
                <h2>访问趋势</h2>
                <p>按天汇总 · {{ report.query.from }} 至 {{ report.query.to }}</p>
              </div>
              <div v-if="activePoint" class="trend-readout" aria-live="polite">
                <span>{{ activePoint.day.key }}</span>
                <strong>{{ activePoint.day.count.toLocaleString() }} 次</strong>
              </div>
            </div>
          </template>
          <n-empty v-if="report.total === 0" description="所选日期范围暂无访问记录" />
          <div v-else class="trend-chart-wrap">
            <svg
              class="trend-chart"
              viewBox="0 0 920 300"
              role="img"
              :aria-label="`每日访问趋势图，共 ${report.total} 次访问`"
              @mouseleave="activeDay = null"
            >
              <defs>
                <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#7898ff" stop-opacity=".25" />
                  <stop offset="100%" stop-color="#7898ff" stop-opacity="0" />
                </linearGradient>
              </defs>
              <g v-for="tick in chartTicks" :key="tick.value" class="trend-gridline">
                <line x1="54" x2="890" :y1="tick.y" :y2="tick.y" />
                <text x="42" :y="tick.y + 4" text-anchor="end">{{ Math.round(tick.value) }}</text>
              </g>
              <path class="trend-area" :d="trendArea" />
              <path class="trend-line" :d="trendPath" />
              <g v-for="point in chartPoints" :key="point.day.key">
                <circle
                  class="trend-point"
                  :class="{ active: activeDay === point.day.key, peak: point.peak }"
                  :cx="point.x"
                  :cy="point.y"
                  :r="activeDay === point.day.key || point.peak ? 5 : 3.5"
                  tabindex="0"
                  :aria-label="`${point.day.key}：${point.day.count} 次访问`"
                  @mouseenter="activeDay = point.day.key"
                  @focus="activeDay = point.day.key"
                  @blur="activeDay = null"
                >
                  <title>{{ point.day.key }} · {{ point.day.count }} 次</title>
                </circle>
              </g>
              <text v-for="point in xLabels" :key="`label-${point.day.key}`" class="trend-x-label" :x="point.x" y="278" text-anchor="middle">
                {{ point.day.key.slice(5) }}
              </text>
            </svg>
          </div>
          <div class="trend-legend"><span></span>访问次数</div>
        </n-card>

        <div class="stats-rankings-grid">
          <n-card class="surface-card stats-ranking-card" :bordered="false">
            <template #header>
              <div class="stats-panel-heading">
                <div><h2>地图排行</h2><p>按访问量由高到低</p></div>
                <n-tag size="small" :bordered="false">{{ mapRows.length }} 张</n-tag>
              </div>
            </template>
            <div v-if="mapRows.length" class="compact-rank-list">
              <div v-for="(row, index) in mapRows" :key="row.key" class="compact-rank-row">
                <span class="rank-number">{{ String(index + 1).padStart(2, "0") }}</span>
                <div class="rank-main">
                  <div class="rank-label-line"><strong>{{ row.label }}</strong><span>{{ row.count.toLocaleString() }}</span></div>
                  <n-progress :percentage="topPercent(row, mapRows)" :show-indicator="false" :height="6" :border-radius="6" color="#7898ff" rail-color="#29364a" />
                </div>
                <span class="rank-share">{{ percent(row.share) }}</span>
              </div>
            </div>
            <n-empty v-else description="暂无地图访问" />
          </n-card>

          <n-card class="surface-card stats-ranking-card" :bordered="false">
            <template #header>
              <div class="stats-panel-heading">
                <div><h2>模式分布</h2><p>所选区间的访问组成</p></div>
                <n-tag size="small" :bordered="false">{{ modeRows.length }} 种</n-tag>
              </div>
            </template>
            <div v-if="modeRows.length" class="compact-rank-list">
              <div v-for="(row, index) in modeRows" :key="row.key" class="compact-rank-row">
                <span class="rank-number">{{ String(index + 1).padStart(2, "0") }}</span>
                <div class="rank-main">
                  <div class="rank-label-line"><strong>{{ row.label }}</strong><span>{{ row.count.toLocaleString() }}</span></div>
                  <n-progress :percentage="topPercent(row, modeRows)" :show-indicator="false" :height="6" :border-radius="6" color="#45c5a5" rail-color="#29364a" />
                </div>
                <span class="rank-share">{{ percent(row.share) }}</span>
              </div>
            </div>
            <n-empty v-else description="暂无模式数据" />
          </n-card>
        </div>

        <n-card class="surface-card stats-layout-card" :bordered="false">
          <template #header>
            <div class="stats-panel-heading">
              <div><h2>布局排行</h2><p>按布局 ID 聚合，名称关联当前内容配置</p></div>
              <n-tag size="small" :bordered="false">{{ layoutRows.length }} 个布局</n-tag>
            </div>
          </template>
          <n-data-table
            v-if="layoutRows.length"
            :columns="layoutColumns"
            :data="layoutRows"
            :row-key="(row: NamedStatRow) => row.key"
            :bordered="false"
            :single-line="false"
            :pagination="{ pageSize: 8 }"
            size="small"
          />
          <n-empty v-else description="暂无布局访问记录" />
        </n-card>

        <n-card class="surface-card stats-entrance-card" :bordered="false">
          <template #header>
            <div class="stats-panel-heading">
              <div><h2>入口分布</h2><p>用户首次进入时选择的入口类型</p></div>
              <n-tag size="small" :bordered="false">{{ entranceRows.length }} 类</n-tag>
            </div>
          </template>
          <div v-if="entranceRows.length" class="entrance-rank-grid">
            <div v-for="row in entranceRows" :key="row.key" class="entrance-rank-item">
              <div class="rank-label-line"><strong>{{ row.label }}</strong><span>{{ row.count.toLocaleString() }} · {{ percent(row.share) }}</span></div>
              <n-progress :percentage="topPercent(row, entranceRows)" :show-indicator="false" :height="7" :border-radius="7" color="#62b6d8" rail-color="#29364a" />
            </div>
          </div>
          <n-empty v-else description="暂无入口统计" />
        </n-card>
      </template>
      <n-card v-else-if="!busy" class="surface-card" :bordered="false">
        <n-empty description="选择日期范围后查询访问统计" />
      </n-card>
    </n-spin>
  </section>
</template>
