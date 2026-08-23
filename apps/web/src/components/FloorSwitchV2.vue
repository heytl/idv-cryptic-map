<script setup lang="ts">
import { FLOOR_LABELS, type FloorType } from '@idv-map/shared';

defineProps<{ floor: FloorType; floors: FloorType[] }>();
defineEmits<{ change: [floor: FloorType] }>();
</script>

<template>
  <div id="floor-switch-v2" class="floor-switch floor-switch-v2">
    <button
      v-for="item in floors"
      :key="item"
      class="switch-btn"
      :class="{ active: floor === item }"
      :data-floor="item"
      @click="$emit('change', item)"
    >{{ FLOOR_LABELS[item] }}</button>
  </div>
</template>
