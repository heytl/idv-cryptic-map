<script setup lang="ts">
import { computed, ref } from "vue";
import { changelog } from "../../data/handbook";
import { returnToHandbookPage } from "../../services/handbook-navigation";
import ChangelogContent from "../../components/ChangelogContent.vue";
import UpdateMeta from "../../components/UpdateMeta.vue";
import UiIcon from "../../components/UiIcon.vue";

const batchSize = 10;
const visibleCount = ref(batchSize);
const visibleEntries = computed(() => changelog.slice(0, visibleCount.value));
const remainingCount = computed(() => Math.max(0, changelog.length - visibleCount.value));
const expanded = ref(new Set(changelog[0] ? [changelog[0].id] : []));
function toggleEntry(id: string) {
  if (expanded.value.has(id)) expanded.value.delete(id);
  else expanded.value.add(id);
}
</script>

<template>
  <view class="changelog-page">
    <view class="log-navigation">
      <button class="back-link" hover-class="link-pressed" @tap="returnToHandbookPage('about')"><UiIcon name="arrow-left" :size="20" /><text>关于手册</text></button>
    </view>
    <text class="page-title" role="heading" aria-level="1">更新日志</text>
    <view class="updates-list">
      <view v-for="(entry, index) in visibleEntries" :key="entry.id" class="update-entry">
        <view class="timeline-dot" :class="{ latest: index === 0 }" aria-hidden="true" />
        <button class="update-toggle" hover-class="entry-pressed" :aria-label="`${expanded.has(entry.id) ? '收起' : '展开'}${entry.version}：${entry.title}`" :aria-expanded="expanded.has(entry.id)" @tap="toggleEntry(entry.id)">
          <view class="update-summary">
            <UpdateMeta :entry="entry" archive />
            <text class="update-title" role="heading" aria-level="2">{{ entry.title }}</text>
          </view>
          <view class="update-chevron" :class="{ expanded: expanded.has(entry.id) }"><UiIcon name="chevron" tone="light" :size="18" /></view>
        </button>
        <ChangelogContent v-if="expanded.has(entry.id)" :blocks="entry.blocks" />
      </view>
    </view>
    <text v-if="!changelog.length" class="empty-log">暂无更新记录。</text>
    <button v-if="remainingCount" class="load-more" hover-class="link-pressed" @tap="visibleCount += batchSize">加载更多（剩余 {{ remainingCount }} 条）</button>
  </view>
</template>

<style>
page { background: #0a0b0d; background-image: radial-gradient(circle at 50% 10%, #c3a16814, transparent 70%); }
</style>

<style scoped>
.changelog-page { width: 100%; max-width: 872px; margin: 0 auto; padding: 12px 16px calc(36px + env(safe-area-inset-bottom)); }
.log-navigation { margin-bottom: 18px; }
.back-link { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; padding: 0; background: transparent; border: 0; border-radius: 0; color: var(--gold); font-family: inherit; text-align: left; }
.link-pressed { color: #e5c38c; }
.page-title { display: block; font-size: 24px; font-weight: 600; color: #d1c7b7; }
.updates-list { margin-top: 24px; padding-top: 24px; border-top: 1px solid #36352e; }
.update-entry { position: relative; margin-left: 5px; padding: 0 0 24px 20px; border-left: 1px solid #36352e; }
.update-entry:last-child { padding-bottom: 0; }
.update-toggle { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 60px; padding: 4px 0 8px; border: 0; border-radius: 0; background: transparent; font-family: inherit; text-align: left; }
.timeline-dot { position: absolute; left: -4px; top: 14px; width: 7px; height: 7px; background: #938370; border-radius: 50%; }
.timeline-dot.latest { background: var(--gold); box-shadow: 0 0 0 4px #c3a16816; }
.update-summary { flex: 1; min-width: 0; }
.update-title { display: block; margin-top: 10px; color: #d1c7b7; font-size: 17px; line-height: 1.6; font-weight: 500; overflow-wrap: anywhere; }
.entry-pressed .update-title { color: #e5c38c; }
.update-chevron { flex: none; transition: transform 160ms; }
.update-chevron.expanded { transform: rotate(180deg); }
.load-more { min-height: 44px; margin: 30px auto 0; padding: 10px 22px; border: 1px solid var(--gold-dark); border-radius: 3px; background: #16191b; color: var(--gold); font-family: inherit; }
.empty-log { display: block; margin-top: 24px; color: #afa99b; }
@media (min-width: 681px) { .log-navigation { margin-bottom: 24px; } .page-title { font-size: 30px; } .updates-list { margin-top: 32px; } .update-entry { padding-left: 26px; } .update-toggle { gap: 20px; } .update-title { font-size: 18px; } }
@media (prefers-reduced-motion: reduce) { .update-chevron { transition: none; } }
</style>
