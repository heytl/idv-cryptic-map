<script setup lang="ts">
import type { PublicEntranceV2, PublicMapV2 } from '@idv-map/shared';
import { useRouter } from 'vue-router';
import { entranceFilterLabelV2 } from '../data/maps-v2';
import { navState } from '../navState';

const props = defineProps<{ map: PublicMapV2; entrance: PublicEntranceV2 }>();
const router = useRouter();

function open() {
  navState.enteredFromCatalog = true;
  router.push(`/${props.map.mode}/${props.entrance.type}/map/${props.map.id}`);
}
</script>

<template>
  <div class="map-card-item" :data-dir="entrance.direction" @click="open">
    <div class="img-wrapper">
      <img :src="entrance.thumbUrl" :alt="`${map.displayName} · ${entrance.typeLabel}`" loading="lazy">
    </div>
    <div class="map-card-info">
      <div class="map-card-name">{{ map.displayName }}</div>
      <div class="map-card-dir">{{ entrance.typeLabel }} · {{ entranceFilterLabelV2(entrance) }}</div>
    </div>
  </div>
</template>
