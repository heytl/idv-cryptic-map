<script setup lang="ts">
export type Floor = 'full' | '1' | '2';

defineProps<{ floor: Floor }>();
defineEmits<{ change: [floor: Floor] }>();

const options: { value: Floor; label: string }[] = [
  { value: 'full', label: '全图' },
  { value: '1', label: '1楼' },
  { value: '2', label: '2楼' },
];
</script>

<template>
  <div
    id="floor-switch"
    class="floor-switch"
    :class="{ 'floor-1-active': floor === '1', 'floor-2-active': floor === '2' }"
  >
    <div
      v-for="opt in options"
      :key="opt.value"
      class="switch-btn"
      :class="{ active: floor === opt.value }"
      :data-floor="opt.value"
      @click="$emit('change', opt.value)"
    >{{ opt.label }}</div>
    <div class="switch-slider"></div>
  </div>
</template>
