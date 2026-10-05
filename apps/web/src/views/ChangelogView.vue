<script setup lang="ts">
import { computed, ref } from "vue";
import HandbookIcon from "../components/HandbookIcon.vue";
import ChangelogContent from "../components/ChangelogContent.vue";
import { changelog } from "../data/changelog";

const batchSize = 10;
const visibleCount = ref(batchSize);
const visibleEntries = computed(() => changelog.slice(0, visibleCount.value));
const remainingCount = computed(() =>
  Math.max(0, changelog.length - visibleCount.value),
);
</script>

<template>
  <main class="changelog-page view-panel active">
    <nav class="log-navigation" aria-label="页面导航">
      <RouterLink to="/about" class="back-link"
        ><HandbookIcon name="arrow-left" />关于手册</RouterLink
      >
    </nav>
    <h1>更新日志</h1>
    <div class="updates-list">
      <details
        v-for="(entry, index) in visibleEntries"
        :key="entry.id"
        class="update-entry"
        :open="index === 0"
      >
        <summary>
          <span class="timeline-dot" :class="{ latest: index === 0 }"></span>
          <span class="update-summary">
            <span class="update-meta"
              ><strong>{{ entry.version }}</strong
              ><span class="version-status">{{ entry.status }}</span
              ><time :datetime="entry.date">{{
                entry.date.replaceAll("-", ".")
              }}</time></span
            >
            <h2>{{ entry.title }}</h2>
          </span>
          <HandbookIcon name="chevron" class="update-chevron" />
        </summary>
        <ChangelogContent :blocks="entry.blocks" />
      </details>
    </div>
    <p v-if="!changelog.length" class="empty-log">暂无更新记录。</p>
    <button
      v-if="remainingCount"
      class="load-more"
      @click="visibleCount += batchSize"
    >
      加载更多（剩余 {{ remainingCount }} 条）
    </button>
  </main>
</template>

<style scoped>
.changelog-page {
  --log-border: #36352e;
  --log-muted: #afa99b;
  width: 100%;
  max-width: 840px;
  margin: 0 auto;
  padding-bottom: 36px;
}
.log-navigation {
  margin-bottom: 24px;
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  color: var(--gold);
  font-size: 14px;
  text-decoration: none;
}
.back-link:hover {
  color: var(--gold-hover);
}
h1 {
  font-size: 30px;
  font-weight: 600;
  color: var(--text-light);
}
.updates-list {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--log-border);
}
.update-entry {
  position: relative;
  margin-left: 5px;
  padding: 0 0 24px 26px;
  border-left: 1px solid var(--log-border);
}
.update-entry:last-child {
  padding-bottom: 0;
}
.update-entry summary {
  display: flex;
  align-items: center;
  gap: 20px;
  min-height: 60px;
  padding: 4px 0 8px;
  list-style: none;
  cursor: pointer;
}
.update-entry summary::-webkit-details-marker {
  display: none;
}
.update-entry summary:hover h2 {
  color: var(--gold-hover);
}
.timeline-dot {
  position: absolute;
  left: -4px;
  top: 14px;
  width: 7px;
  height: 7px;
  background: #938370;
  border-radius: 50%;
}
.timeline-dot.latest {
  background: var(--gold);
  box-shadow: 0 0 0 4px #c3a16816;
}
.update-summary {
  flex: 1;
  min-width: 0;
}
.update-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.update-meta strong {
  color: var(--gold);
  font-size: 16px;
  font-weight: 500;
}
.version-status {
  padding: 0 5px;
  border: 1px solid var(--gold-dark);
  border-radius: 2px;
  color: var(--text-light);
  font-size: 10.5px;
  line-height: 1.4;
}
.update-meta time {
  margin-left: auto;
  color: var(--log-muted);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.update-summary h2 {
  margin-top: 10px;
  font-size: 18px;
  line-height: 1.6;
  font-weight: 500;
  transition: color 160ms;
}
.update-chevron {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--log-muted);
  transition: transform 160ms;
}
.update-entry[open] .update-chevron {
  transform: rotate(180deg);
}
.load-more {
  display: block;
  min-height: 44px;
  margin: 30px auto 0;
  padding: 10px 22px;
  border: 1px solid var(--gold-dark);
  border-radius: 3px;
  background: var(--bg-mid);
  color: var(--gold);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.load-more:hover {
  color: var(--gold-hover);
  border-color: var(--gold);
}
.empty-log {
  margin-top: 24px;
  color: var(--log-muted);
}
@media (max-width: 680px) {
  .log-navigation {
    margin-bottom: 18px;
  }
  h1 {
    font-size: 24px;
  }
  .updates-list {
    margin-top: 24px;
  }
  .update-entry {
    padding-left: 20px;
  }
  .update-entry summary {
    gap: 10px;
  }
  .update-meta {
    gap: 8px;
  }
  .update-meta strong {
    font-size: 14px;
  }
  .update-meta time {
    width: 100%;
    margin-left: 0;
  }
  .update-summary h2 {
    font-size: 17px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .update-summary h2,
  .update-chevron {
    transition: none;
  }
}
</style>
