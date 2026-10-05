<script setup lang="ts">
import type { ChangelogBlock } from "../data/parse-changelog";

const { blocks, headingLevel = 3 } = defineProps<{
  blocks: ChangelogBlock[];
  headingLevel?: 3 | 4;
}>();
</script>

<template>
  <div class="update-content">
    <template v-for="(block, blockIndex) in blocks" :key="blockIndex">
      <ul v-if="block.type === 'list'">
        <li v-for="(item, itemIndex) in block.items" :key="itemIndex">
          {{ item }}
        </li>
      </ul>
      <component
        :is="`h${headingLevel}`"
        v-else-if="block.type === 'heading'"
        >{{ block.text }}</component
      >
      <p v-else>{{ block.text }}</p>
    </template>
  </div>
</template>

<style scoped>
.update-content {
  color: var(--text-light);
  font-size: 14px;
  line-height: 1.85;
}
.update-content > * + * {
  margin-top: 12px;
}
.update-content h3,
.update-content h4 {
  color: var(--gold);
  font-size: 15px;
  font-weight: 500;
}
.update-content ul {
  padding-left: 19px;
}
.update-content li {
  padding-left: 4px;
  margin: 5px 0;
}
.update-content li:first-child {
  margin-top: 0;
}
.update-content li:last-child {
  margin-bottom: 0;
}
.update-content li::marker {
  color: var(--gold-dark);
}
</style>
