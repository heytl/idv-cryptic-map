<script setup lang="ts">
import type { ChangelogEntry } from "@idv-map/shared";
defineProps<{ entry: ChangelogEntry; archive?: boolean }>();
</script>

<template>
  <view class="update-meta" :class="{ archive }">
    <text class="version">{{ entry.version }}</text>
    <text class="version-status">{{ entry.status }}</text>
    <text class="update-date">{{ entry.date.split('-').join('.') }}</text>
  </view>
</template>

<style scoped>
.update-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.version { color: var(--gold); font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
.version-status { padding: 0 5px; border: 1px solid var(--gold-dark); border-radius: 2px; color: #d1c7b7; font-size: 10.5px; line-height: 1.4; }
.update-date { margin-left: auto; color: #afa99b; font-size: 12px; font-variant-numeric: tabular-nums; }
.archive .update-date { width: 100%; margin-left: 0; font-size: 13px; }
@media (max-width: 360px) { .update-date { width: 100%; margin-left: 0; } }
@media (min-width: 681px) { .archive .update-date { width: auto; margin-left: auto; } .archive .version { font-size: 16px; } }
</style>
