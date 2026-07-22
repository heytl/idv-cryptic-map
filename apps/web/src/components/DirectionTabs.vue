<script setup lang="ts">
import { computed } from 'vue';
import { DIRECTIONS, maps } from '../data/maps';

const props = defineProps<{
  filter: string;
  counts?: Record<string, number>;
}>();

defineEmits<{ change: [dir: string] }>();

const tabs = ['all', ...DIRECTIONS] as const;

const defaultCounts = computed(() => {
  const mapCounts: Record<string, number> = {
    all: maps.length,
  };
  for (const dir of DIRECTIONS) {
    mapCounts[dir] = maps.filter((m) => m.direction === dir).length;
  }
  return mapCounts;
});

function tabCount(tab: string): number {
  return (props.counts ?? defaultCounts.value)[tab] ?? 0;
}

function label(tab: string): string {
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
      <span class="btn-texture"></span>
      <span class="tab-text">
        {{ label(tab) }}<span v-if="filter === tab" class="tab-count-num"> ({{ tabCount(tab) }})</span>
      </span>
    </button>
  </div>
</template>
