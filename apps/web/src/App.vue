<script setup lang="ts">
// Phase 1 占位壳：引用数据层验证资源管线，Phase 2 起替换为目录/攻略双视图
import { maps, mapsUpdatedAt } from './data/maps';
</script>

<template>
  <h1>加页手记解密手册（重构中）</h1>
  <p>共 {{ maps.length }} 张地图 · 数据更新于 {{ mapsUpdatedAt }}</p>
</template>
