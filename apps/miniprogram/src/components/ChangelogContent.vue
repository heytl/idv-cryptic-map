<script setup lang="ts">
import type { ChangelogBlock } from "@idv-map/shared";
defineProps<{ blocks: ChangelogBlock[]; headingLevel?: 3 | 4 }>();
</script>

<template>
  <view class="update-content">
    <view v-for="(block, blockIndex) in blocks" :key="blockIndex" class="content-block">
      <view v-if="block.type === 'list'" class="content-list">
        <view v-for="(item, itemIndex) in block.items" :key="itemIndex" class="content-item">
          <text class="list-marker" aria-hidden="true">•</text>
          <text class="item-copy" selectable>{{ item }}</text>
        </view>
      </view>
      <text v-else-if="block.type === 'heading'" class="content-heading" role="heading" :aria-level="headingLevel || 3" selectable>{{ block.text }}</text>
      <text v-else class="content-paragraph" selectable>{{ block.text }}</text>
    </view>
  </view>
</template>

<style scoped>
.update-content { color: #d1c7b7; font-size: 14px; line-height: 1.85; overflow-wrap: anywhere; }
.content-block + .content-block { margin-top: 12px; }
.content-heading { display: block; color: var(--gold); font-size: 15px; font-weight: 500; }
.content-paragraph { display: block; }
.content-item { display: flex; align-items: flex-start; margin: 5px 0; }
.content-item:first-child { margin-top: 0; }
.content-item:last-child { margin-bottom: 0; }
.list-marker { flex: none; width: 23px; padding-left: 4px; color: var(--gold-dark); }
.item-copy { flex: 1; min-width: 0; }
</style>
