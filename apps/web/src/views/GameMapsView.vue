<script setup lang="ts">
import { useRouter } from "vue-router";
import { gameMaps, mapsV2, mapsV2Error, ensureMapsV2 } from "../data/maps-v2";
import { preferredCatalogPath } from "../catalogPreferences";
const router = useRouter();
async function retry() {
  await ensureMapsV2();
  const path = preferredCatalogPath(gameMaps);
  if (path) router.replace(path);
}
</script>
<template>
  <main class="view-panel active">
    <section class="parchment-card">
      <div class="card-inner">
        <h2>选择地图</h2>
        <p>选择本局地图，再按模式、入口与特征查找对应布局。</p>
        <div class="game-map-grid">
          <button
            v-for="map in gameMaps"
            :key="map.id"
            class="gothic-btn game-map-choice"
            @click="router.push(`/maps/${map.id}/hard/side`)"
          >
            <strong>{{ map.name }}</strong
            ><span
              >{{
                mapsV2.filter((l) => l.gameMapId === map.id).length
              }}
              个布局</span
            >
          </button>
        </div>
        <p v-if="!gameMaps.length" role="status">
          {{ mapsV2Error || "暂时没有已发布地图。" }}
        </p>
        <button v-if="mapsV2Error" class="gothic-btn" @click="retry">
          重新加载
        </button>
      </div>
    </section>
  </main>
</template>
<style scoped>
.game-map-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
  margin: 24px 0;
}
.game-map-choice {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 32px;
  text-align: left;
  min-height: 140px;
}
.game-map-choice strong {
  font-size: 24px;
}
.game-map-choice span {
  font-size: 14px;
  opacity: 0.8;
}
</style>
