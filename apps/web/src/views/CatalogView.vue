<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { DIRECTIONS, maps } from '../data/maps';
import DirectionTabs from '../components/DirectionTabs.vue';
import DensitySwitch from '../components/DensitySwitch.vue';
import MapCard from '../components/MapCard.vue';
import { useDensity } from '../composables/useDensity';

const route = useRoute();
const router = useRouter();
const { compact } = useDensity();

// beforeEnter 只在进入路由记录时触发，同记录参数变化不会重跑守卫，
// 这里再兜底一次：非法方向按“全部”处理（与旧站 parseRoute 行为一致）
const filter = computed(() => {
  const dir = route.params.direction as string | undefined;
  return dir && (DIRECTIONS as readonly string[]).includes(dir) ? dir : 'all';
});

const filteredMaps = computed(() =>
  filter.value === 'all' ? maps : maps.filter((m) => m.direction === filter.value),
);

// 筛选写入 hash（replace：筛选状态可随刷新还原且不产生历史记录，与旧站一致）
function setFilter(dir: string) {
  router.replace(dir === 'all' ? '/' : `/dir/${dir}`);
}
</script>

<template>
  <main id="catalog-view" class="view-panel active">
    <div class="parchment-card">
      <div class="card-inner">
        <div class="corner-decor top-left"></div>
        <div class="corner-decor top-right"></div>
        <div class="corner-decor bottom-left"></div>
        <div class="corner-decor bottom-right"></div>

        <div class="catalog-intro">
          <p class="handwriting">庄园的侧门千变万化，寻找密码是唯一的生路。请根据您当前所处侧门入口的墙体结构，确认本局所在的地图...</p>
        </div>

        <!-- 方向过滤器 -->
        <div class="tabs-container">
          <div class="tabs-label">侧门入口方向过滤:</div>
          <DirectionTabs :filter="filter" @change="setFilter" />
          <DensitySwitch v-model="compact" />
        </div>

        <!-- 入口图网格 -->
        <div id="entry-grid" class="entry-grid" :class="{ compact }">
          <MapCard v-for="m in filteredMaps" :key="m.id" :map="m" />
        </div>
      </div>
    </div>
  </main>
</template>
