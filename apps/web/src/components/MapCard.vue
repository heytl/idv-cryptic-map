<script setup lang="ts">
import { useRouter } from 'vue-router';
import type { MapItem } from '../data/maps';
import { navState } from '../navState';

const props = defineProps<{ map: MapItem }>();
const router = useRouter();

function open() {
  navState.enteredFromCatalog = true;
  router.push(`/map/${props.map.name}`);
}
</script>

<template>
  <div class="map-card-item" :data-dir="map.direction" @click="open">
    <div class="img-wrapper">
      <img :src="map.entryImg" :alt="map.displayName" loading="lazy">
    </div>
    <div class="map-card-info">
      <div class="map-card-name">{{ map.displayName }}</div>
      <div class="map-card-dir">{{ map.direction }}侧入口</div>
    </div>
  </div>
</template>
