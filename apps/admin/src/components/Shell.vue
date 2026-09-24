<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from "vue";
import {
  NButton,
  NAlert,
  NEmpty,
  NLayout,
  NLayoutContent,
  NLayoutHeader,
  NLayoutSider,
  NMenu,
  NSpace,
  NSpin,
  NTag,
  useMessage,
  type MenuOption,
} from "naive-ui";
import { formatUpdatedAt } from "@idv-map/shared";
import { loadV2, saveV2, storeV2 } from "../store-v2";
import { useIsNarrow } from "../ui";

const V2Workspace = defineAsyncComponent(() => import("./V2Workspace.vue"));
const GameMapManager = defineAsyncComponent(() => import("./GameMapManager.vue"));
const StatsView = defineAsyncComponent(() => import("./StatsView.vue"));
const BackupsView = defineAsyncComponent(() => import("./BackupsView.vue"));
const shortLabels: Record<string, string> = {
  layouts: "布局",
  maps: "地图",
  statistics: "统计",
  backups: "备份",
};

const sections = [
  { label: "布局管理", key: "layouts" },
  { label: "地图管理", key: "maps" },
  { label: "访问统计", key: "statistics" },
  { label: "备份与恢复", key: "backups" },
];
const viewFromHash = () => {
  const key = window.location.hash.slice(1);
  return sections.some((item) => item.key === key) ? key : "layouts";
};
const view = ref(viewFromHash());
const narrow = useIsNarrow();
const message = useMessage();
const dataStatus = computed(() =>
  storeV2.fatal
    ? "读取失败"
    : storeV2.loaded
      ? "配置已加载"
      : storeV2.loading
        ? "正在读取配置"
        : "等待配置",
);
const title = computed(
  () => sections.find((item) => item.key === view.value)?.label ?? "内容管理",
);
const description = computed(() => {
  const copy: Record<string, string> = {
    layouts: "整理地图布局、入口图片与发布状态。",
    maps: "管理地图目录、标识和前台可见状态。",
    statistics: "查看正式主站的访问趋势与分布。",
    backups: "浏览历史版本，并在需要时恢复内容。",
  };
  return copy[view.value] ?? "管理地图内容与发布。";
});
const menuOptions = computed<MenuOption[]>(() =>
  sections.map((item) => ({
    ...item,
    label: narrow.value
      ? (shortLabels[item.key] ?? item.label)
      : item.label,
  })),
);

function selectView(key: string): void {
  view.value = key;
  if (window.location.hash !== `#${key}`)
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${key}`);
}

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!storeV2.dirty) return;
  event.preventDefault();
  event.returnValue = "";
}

async function save(): Promise<void> {
  const error = await saveV2();
  if (error) message.error(error, { duration: 10000, closable: true });
  else message.success(`内容已保存（v${storeV2.version}）`);
}

onMounted(() => {
  if (!storeV2.loaded && !storeV2.loading) void loadV2();
  window.addEventListener("beforeunload", onBeforeUnload);
});
onBeforeUnmount(() => window.removeEventListener("beforeunload", onBeforeUnload));
</script>

<template>
  <n-layout has-sider class="admin-layout">
    <n-layout-sider v-if="!narrow" bordered :width="232" :native-scrollbar="false" class="admin-sidebar">
      <div class="brand-lockup">
        <div class="brand-mark" aria-hidden="true">CM</div>
        <div>
          <strong>加页手记</strong>
          <span>内容工作台</span>
        </div>
      </div>
      <div class="sidebar-caption">工作区</div>
      <n-menu :value="view" :options="menuOptions" @update:value="selectView" />
      <div class="sidebar-footer">
        <span class="status-light" :class="{ error: !!storeV2.fatal, loading: storeV2.loading }" aria-hidden="true"></span>
        <span>{{ dataStatus }}</span>
        <small>V3 · {{ storeV2.version }}</small>
      </div>
    </n-layout-sider>

    <n-layout class="admin-main-layout">
      <n-layout-header bordered class="admin-topbar">
        <div class="topbar-heading">
          <div class="mobile-brand" v-if="narrow">
            <div class="brand-mark" aria-hidden="true">CM</div>
            <strong>加页手记</strong>
          </div>
          <h1>{{ title }}</h1>
          <p>{{ description }}</p>
        </div>
        <n-space class="topbar-actions" align="center" :size="12">
          <div class="save-state" role="status" aria-live="polite">
            <span class="status-light" :class="{ dirty: storeV2.dirty }" aria-hidden="true"></span>
            <span>{{ storeV2.saving ? "正在保存" : storeV2.dirty ? "有未保存修改" : "已保存" }}</span>
          </div>
          <n-tag size="small" :bordered="false" class="version-tag">v{{ storeV2.version }}</n-tag>
          <n-button type="primary" :loading="storeV2.saving" :disabled="!storeV2.dirty" @click="save">
            保存修改
          </n-button>
        </n-space>
        <n-menu
          v-if="narrow"
          class="mobile-nav"
          :value="view"
          :options="menuOptions"
          mode="horizontal"
          @update:value="selectView"
        />
      </n-layout-header>

      <n-layout-content class="admin-content" :native-scrollbar="false">
        <div class="content-inner">
          <p class="updated-meta">最后更新：{{ formatUpdatedAt(storeV2.updatedAt) }}</p>
          <n-spin :show="storeV2.loading" class="config-loading">
            <template v-if="storeV2.loaded">
              <V2Workspace v-if="view === 'layouts'" />
              <GameMapManager v-else-if="view === 'maps'" />
              <StatsView v-else-if="view === 'statistics'" />
              <BackupsView v-else />
            </template>
            <n-alert v-else-if="storeV2.fatal" type="error" :show-icon="true">
              无法读取当前配置：{{ storeV2.fatal }}
              <n-button size="small" style="margin-left: 10px" @click="loadV2">重新读取</n-button>
            </n-alert>
            <n-empty v-else description="正在读取地图配置" />
          </n-spin>
        </div>
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>
