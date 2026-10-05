<script setup lang="ts">
import { computed, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import { formatUpdatedAt } from "@idv-map/shared";
import OfflineCache from "./components/OfflineCache.vue";
import { mapsV2UpdatedAt } from "./data/maps-v2";
import { projectInfo } from "./data/project-info";

const route = useRoute();
const router = useRouter();
const isAppendix = computed(() =>
  ["about", "changelog"].includes(String(route.name)),
);
const showProjectEntry = computed(() =>
  ["game-maps", "catalog-v2"].includes(String(route.name)),
);
const mapsUpdatedAt = computed(() => {
  const value = mapsV2UpdatedAt.value;
  if (!value) return "";
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+08:00` : value,
  );
  if (Number.isNaN(date.getTime())) return "时间未知";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join(".");
});

const goHome = () => {
  router.push("/");
};

// 页面级布局状态：详情页占满高度，目录页使用紧凑页头。
watchEffect(() => {
  document.body.classList.toggle(
    "strategy-view-active",
    route.name === "map-v2",
  );
  document.body.classList.toggle(
    "catalog-v2-view-active",
    route.name === "catalog-v2",
  );
  document.body.classList.toggle("about-view-active", isAppendix.value);
});
</script>

<template>
  <!-- 提灯光晕背景 -->
  <div class="glow-bg"></div>

  <div class="app-container">
    <!-- 头部栏 -->
    <header class="app-header">
      <div class="header-decoration left-deco"></div>
      <h1 class="app-title" @click="goHome">
        <span class="en-font">CRYPTIC HANDBOOK</span>
        <span>{{ projectInfo.name }}</span>
      </h1>
      <div class="header-decoration right-deco"></div>
    </header>

    <router-view />

    <!-- 页脚 -->
    <footer v-if="!isAppendix" class="app-footer">
      <div class="footer-copyright">
        <span>© 2026 OUU 第五人格</span>
        <span class="footer-copyright-title">
          <span aria-hidden="true">·</span>
          <span>{{ projectInfo.name }}</span>
        </span>
        <span v-if="showProjectEntry" class="footer-about-entry">
          <span aria-hidden="true">·</span>
          <RouterLink to="/about" class="footer-link">关于手册</RouterLink>
        </span>
      </div>
      <div class="footer-meta">
        <span class="footer-source"
          >素材来源<a
            :href="projectInfo.authorUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="footer-link"
            >凉哈皮</a
          ></span
        >
        <span v-if="mapsUpdatedAt" class="footer-divider" aria-hidden="true"
          >·</span
        >
        <span
          v-if="mapsUpdatedAt"
          class="update-time"
          :title="`北京时间 ${formatUpdatedAt(mapsV2UpdatedAt)}`"
          >数据更新
          <time :datetime="mapsV2UpdatedAt">{{ mapsUpdatedAt }}</time></span
        >
        <span
          v-if="route.params.gameMapId"
          class="footer-divider"
          aria-hidden="true"
          >·</span
        >
        <OfflineCache v-if="route.params.gameMapId" />
      </div>
    </footer>
  </div>
</template>

<style scoped>
@media (max-width: 768px) {
  .app-header .app-title {
    font-size: 1rem;
  }
  .app-header .app-title .en-font {
    font-size: 0.5rem;
    letter-spacing: 1px;
  }
}
</style>
