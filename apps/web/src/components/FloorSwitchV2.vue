<script setup lang="ts">
import { FLOOR_LABELS, type FloorType } from '@idv-map/shared';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

const props = withDefaults(defineProps<{ floor: FloorType; floors: FloorType[]; motionIndex?: number | null; duration?: number }>(), { motionIndex: null, duration: 0 });
defineEmits<{ change: [floor: FloorType] }>();
const group = ref<HTMLElement | null>(null);
const boxes = ref<{ left: number; top: number; width: number; height: number }[]>([]);
const index = computed(() => props.motionIndex ?? Math.max(0, props.floors.indexOf(props.floor)));
function measure() {
  boxes.value = Array.from(group.value?.querySelectorAll<HTMLButtonElement>('.switch-btn') ?? [], button => ({
    left: button.offsetLeft, top: button.offsetTop, width: button.offsetWidth, height: button.offsetHeight,
  }));
}
const indicatorStyle = computed(() => {
  const value = Math.max(0, Math.min(boxes.value.length - 1, index.value));
  const first = boxes.value[Math.floor(value)];
  const second = boxes.value[Math.ceil(value)] ?? first;
  if (!first) return { visibility: 'hidden' as const };
  const fraction = value - Math.floor(value);
  return {
    width: `${first.width + (second.width - first.width) * fraction}px`, height: `${first.height}px`, top: `${first.top}px`,
    transform: `translateX(${first.left + (second.left - first.left) * fraction}px)`,
    transitionDuration: `${props.duration}ms`,
  };
});
let observer: ResizeObserver | undefined;
onMounted(() => {
  measure(); observer = new ResizeObserver(measure);
  if (group.value) observer.observe(group.value);
});
onUnmounted(() => observer?.disconnect());
watch(() => props.floors, async () => { await nextTick(); measure(); }, { deep: true });
</script>

<template>
  <div id="floor-switch-v2" ref="group" class="floor-switch floor-switch-v2">
    <div class="floor-indicator" :style="indicatorStyle" aria-hidden="true" />
    <button
      v-for="item in floors"
      :key="item"
      class="switch-btn"
      :class="{ active: Math.round(index) === floors.indexOf(item) }"
      :aria-pressed="floor === item"
      :data-floor="item"
      @click="$emit('change', item)"
    >{{ FLOOR_LABELS[item] }}</button>
  </div>
</template>

<style scoped>
.floor-indicator { position: absolute; left: 0; pointer-events: none; background: var(--detail-brass, var(--gold)); border-radius: 999px; box-shadow: inset 0 1px 0 #ead5aa; transition-property: transform, width; transition-timing-function: cubic-bezier(.22,.8,.24,1); }
.floor-switch-v2 .switch-btn.active { background: transparent; box-shadow: none; }
@media (prefers-reduced-motion: reduce) { .floor-indicator { transition: none; } }
</style>
