<script setup lang="ts">
import type { PublicEntranceV2, PublicLayout } from "@idv-map/shared/dynamic";
import { useRouter } from "vue-router";
import { entranceFilterLabelV2 } from "../data/maps-v2";
import { navState } from "../navState";

const props = defineProps<{ map: PublicLayout; entrance: PublicEntranceV2 }>();
const router = useRouter();

function open() {
  navState.enteredFromCatalog = true;
  router.push(
    `/maps/${props.map.gameMapId}/${props.map.mode}/${props.entrance.type}/layout/${props.map.id}`,
  );
}
</script>

<template>
  <button
    type="button"
    class="map-card-item"
    :data-filter="entrance.filterValue"
    @click="open"
  >
    <div class="img-wrapper">
      <img
        :src="entrance.thumbUrl"
        :alt="`${map.displayName} · ${entrance.typeLabel}`"
        loading="lazy"
      />
    </div>
    <div class="map-card-info">
      <div class="map-card-name">{{ map.displayName }}</div>
      <div class="map-card-dir">
        {{ entrance.typeLabel }}<template v-if="entranceFilterLabelV2(entrance)"> · {{ entranceFilterLabelV2(entrance) }}</template>
      </div>
    </div>
  </button>
</template>
