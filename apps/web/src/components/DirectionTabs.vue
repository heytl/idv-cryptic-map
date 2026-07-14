<script setup lang="ts">
import { DIRECTIONS } from '../data/maps';

defineProps<{ filter: string }>();
defineEmits<{ change: [dir: string] }>();

const tabs = ['all', ...DIRECTIONS] as const;

function label(tab: string) {
  return tab === 'all' ? '全部' : tab;
}
</script>

<template>
  <div class="tabs">
    <button
      v-for="tab in tabs"
      :key="tab"
      class="tab-btn"
      :class="{ active: filter === tab }"
      :data-filter="tab"
      @click="$emit('change', tab)"
    >
      <span class="btn-texture"></span>{{ label(tab) }}
    </button>
  </div>
</template>
