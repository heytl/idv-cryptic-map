<script setup lang="ts">
import { ref } from "vue";
import HandbookIcon from "../components/HandbookIcon.vue";
import ChangelogContent from "../components/ChangelogContent.vue";
import { projectInfo } from "../data/project-info";
import { latestUpdate } from "../data/changelog";

const copyStatus = ref("");
async function copyWebsite() {
  try {
    await navigator.clipboard.writeText(projectInfo.website);
    copyStatus.value = "网址已复制";
  } catch {
    copyStatus.value = "复制未成功，请长按或选中上方网址复制。";
  }
}
</script>

<template>
  <main class="about-page view-panel active">
    <nav class="about-navigation" aria-label="页面导航">
      <RouterLink to="/" class="back-link"
        ><HandbookIcon name="arrow-left" />地图</RouterLink
      >
      <span class="about-navigation-label" aria-current="page">关于手册</span>
    </nav>

    <section class="about-cover" aria-labelledby="about-title">
      <div class="cover-copy">
        <h1 id="about-title" class="cover-brand">
          <span class="cover-brand-en en-font" lang="en">CRYPTIC HANDBOOK</span>
          <span class="cover-brand-zh">{{ projectInfo.name }}</span>
        </h1>
        <p class="cover-description">
          《第五人格》「加页手记」地图攻略工具。<br />按地图、模式与入口查找布局，支持全图与分层查看。
        </p>
        <div class="cover-tags">
          <span>玩家社区作品</span><span>开源免费</span>
        </div>
      </div>
      <div class="book-art" aria-hidden="true">
        <span class="art-orbit"></span>
        <div class="handbook-book">
          <span class="book-spine"></span>
          <div class="book-border">
            <HandbookIcon name="book" /><span class="book-name">加页手记</span
            ><span class="book-subtitle">解密手册</span
            ><span class="book-ornament">◇</span>
          </div>
          <span class="book-ribbon"></span>
        </div>
      </div>
    </section>

    <div class="about-columns">
      <div class="about-main">
        <section class="access-section" aria-labelledby="access-title">
          <div class="section-heading"><h2 id="access-title">网页地址</h2></div>
          <div class="website-row">
            <div class="section-icon"><HandbookIcon name="globe" /></div>
            <div class="website-copy">
              <a
                :href="projectInfo.website"
                target="_blank"
                rel="noopener noreferrer"
                class="website-address"
                >{{ projectInfo.websiteLabel
                }}<HandbookIcon name="arrow-up-right"
              /></a>
            </div>
            <button
              class="copy-button"
              :aria-label="
                copyStatus === '网址已复制'
                  ? '再次复制网页地址'
                  : '复制网页地址'
              "
              @click="copyWebsite"
            >
              <HandbookIcon
                :name="copyStatus === '网址已复制' ? 'check' : 'copy'"
              /><span>{{
                copyStatus === "网址已复制" ? "已复制" : "复制"
              }}</span>
            </button>
          </div>
          <p
            v-if="copyStatus && copyStatus !== '网址已复制'"
            class="access-note"
            role="status"
          >
            {{ copyStatus }}
          </p>
        </section>

        <section
          class="latest-changelog"
          aria-labelledby="latest-changelog-title"
        >
          <div class="section-heading">
            <h2 id="latest-changelog-title">更新日志</h2>
            <RouterLink to="/changelog" class="changelog-link"
              >查看全部<HandbookIcon name="chevron"
            /></RouterLink>
          </div>
          <article v-if="latestUpdate" class="latest-update">
            <div class="latest-meta">
              <strong>{{ latestUpdate.version }}</strong
              ><span class="latest-status">{{ latestUpdate.status }}</span
              ><time :datetime="latestUpdate.date">{{
                latestUpdate.date.replaceAll("-", ".")
              }}</time>
            </div>
            <h3>{{ latestUpdate.title }}</h3>
            <ChangelogContent
              :blocks="latestUpdate.blocks"
              :heading-level="4"
            />
          </article>
        </section>
      </div>

      <aside class="about-sidebar" aria-label="小程序与反馈">
        <section class="mini-section" aria-labelledby="mini-title">
          <div class="section-heading">
            <h2 id="mini-title">微信小程序</h2>
            <span class="availability">{{
              projectInfo.miniProgram.released ? "已上线" : "待发布"
            }}</span>
          </div>
          <p class="mini-name">{{ projectInfo.miniProgram.name }}</p>
          <div class="qr-frame">
            <img
              v-if="projectInfo.miniProgram.qrImageUrl"
              :src="projectInfo.miniProgram.qrImageUrl"
              :alt="`${projectInfo.miniProgram.name}微信小程序码`"
              class="mini-qr"
            />
            <div v-else class="qr-placeholder">
              <HandbookIcon name="scan" /><span>小程序码待补充</span>
            </div>
            <i class="qr-corner top-left"></i><i class="qr-corner top-right"></i
            ><i class="qr-corner bottom-left"></i
            ><i class="qr-corner bottom-right"></i>
          </div>
        </section>

        <section class="feedback-section" aria-labelledby="feedback-title">
          <div class="feedback-heading">
            <HandbookIcon name="message" />
            <h2 id="feedback-title">问题反馈</h2>
          </div>
          <button class="feedback-button" disabled>反馈入口暂未开放</button>
        </section>
      </aside>
    </div>

    <section class="credits-section" aria-labelledby="credits-title">
      <div>
        <h2 id="credits-title">素材与致谢</h2>
        <p>
          地图攻略素材来自
          <a
            :href="projectInfo.authorUrl"
            target="_blank"
            rel="noopener noreferrer"
            >凉哈皮<HandbookIcon name="arrow-up-right" /></a
          >，感谢整理与分享。游戏及地图版权归《第五人格》官方所有。
        </p>
      </div>
      <div class="open-source-info">
        <p>本项目开源免费，欢迎 Star 与反馈</p>
        <a
          :href="projectInfo.repository"
          target="_blank"
          rel="noopener noreferrer"
          class="source-link"
          >GitHub 开源<HandbookIcon name="arrow-up-right"
        /></a>
      </div>
    </section>
  </main>
</template>

<style scoped>
.about-page {
  --about-surface: #16191b;
  --about-border: #36352e;
  --about-muted: #afa99b;
  --paper-ink: #362b20;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
}
.about-page a {
  transition:
    color 160ms,
    background 160ms;
}
.about-navigation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
.about-navigation-label {
  color: var(--about-muted);
  font-size: 13px;
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
.back-link:hover,
.source-link:hover {
  color: var(--gold-hover);
}
.about-cover {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  align-items: center;
  padding: 36px 44px;
  border: 1px solid var(--parchment-dark);
  border-radius: 4px;
  background:
    radial-gradient(ellipse at 75% 0%, var(--parchment-light), transparent 65%),
    var(--parchment);
  color: var(--paper-ink);
  box-shadow: var(--gothic-shadow);
}
.about-cover::before {
  content: "";
  position: absolute;
  inset: 9px;
  border: 1px solid #9b8b6d;
  pointer-events: none;
}
.cover-copy {
  min-width: 0;
}
.cover-brand {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}
.cover-brand-en {
  max-width: 100%;
  color: var(--red-accent);
  font-size: clamp(11px, 1.2vw, 13px);
  line-height: 1.4;
  letter-spacing: 2px;
  overflow-wrap: anywhere;
}
.cover-brand-zh {
  color: var(--paper-ink);
  font-size: clamp(24px, 2.8vw, 34px);
  line-height: 1.4;
  font-weight: 700;
  letter-spacing: 2px;
  text-wrap: balance;
}
.cover-description {
  margin-top: 24px;
  font-size: 14px;
  line-height: 2;
}
.cover-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 22px;
}
.cover-tags span {
  padding: 4px 10px;
  border: 1px solid #a5916d;
  border-radius: 2px;
  font-size: 13px;
}
.book-art {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 0;
}
.art-orbit {
  position: absolute;
  width: 242px;
  height: 242px;
  border: 1px solid #ab997866;
  border-radius: 50%;
}
.art-orbit::after {
  content: "";
  position: absolute;
  inset: 14px;
  border: 1px dashed #ab997866;
  border-radius: 50%;
}
.handbook-book {
  position: relative;
  width: 155px;
  height: 208px;
  padding: 14px 12px 14px 20px;
  border: 1px solid #5b4c37;
  border-radius: 3px 7px 7px 3px;
  background: linear-gradient(110deg, #24272a, #343634);
  color: var(--gold);
  transform: rotate(-8deg);
  box-shadow:
    7px 5px 0 -2px #e3d6b6,
    9px 6px 0 -2px #7c6b50,
    15px 20px 22px #362b2033;
}
.book-spine {
  position: absolute;
  left: 9px;
  top: 0;
  bottom: 0;
  border-left: 1px solid #88735177;
}
.book-border {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-around;
  padding: 12px 0;
  border: 1px solid var(--gold-dark);
}
.book-border svg {
  width: 38px;
  height: 38px;
}
.book-name {
  font-size: 18px;
  letter-spacing: 3px;
}
.book-subtitle {
  font-size: 13px;
  letter-spacing: 2px;
}
.book-ornament {
  font-size: 15px;
}
.book-ribbon {
  position: absolute;
  right: 25px;
  bottom: -16px;
  width: 13px;
  height: 26px;
  background: var(--red-accent);
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 77%, 0 100%);
}
.about-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 310px;
  gap: 44px;
  margin-top: 40px;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.section-heading h2,
.feedback-heading h2 {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-light);
}
.website-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 22px;
  padding: 18px 0;
  border-top: 1px solid var(--about-border);
  border-bottom: 1px solid var(--about-border);
}
.section-icon {
  display: grid;
  place-items: center;
  flex: 0 0 42px;
  height: 42px;
  border: 1px solid var(--gold-dark);
  border-radius: 3px;
  color: var(--gold);
}
.website-copy {
  min-width: 0;
  flex: 1;
}
.website-address {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--gold);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 19px;
  text-decoration: none;
  overflow-wrap: anywhere;
}
.website-address:hover {
  color: var(--gold-hover);
}
.website-address svg {
  flex-shrink: 0;
  width: 15px;
  height: 15px;
}
.copy-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 74px;
  min-height: 44px;
  padding: 8px 10px;
  background: transparent;
  border: 1px solid var(--about-border);
  border-radius: 3px;
  color: var(--text-light);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color 160ms,
    color 160ms;
}
.copy-button:hover {
  color: var(--gold);
  border-color: var(--gold-dark);
}
.copy-button svg {
  width: 15px;
  height: 15px;
}
.access-note {
  margin-top: 12px;
  color: var(--about-muted);
  font-size: 13px;
  line-height: 1.8;
}
.latest-changelog {
  margin-top: 28px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--about-border);
}
.changelog-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  flex-shrink: 0;
  color: var(--gold);
  font-size: 13px;
  text-decoration: none;
}
.changelog-link svg {
  width: 16px;
  height: 16px;
  transform: rotate(-90deg);
}
.changelog-link:hover {
  color: var(--gold-hover);
}
.latest-update {
  margin-top: 12px;
}
.latest-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.latest-meta strong {
  color: var(--gold);
  font-size: 14px;
  font-weight: 500;
}
.latest-status {
  padding: 0 5px;
  border: 1px solid var(--gold-dark);
  border-radius: 2px;
  color: var(--text-light);
  font-size: 10.5px;
  line-height: 1.4;
}
.latest-meta time {
  margin-left: auto;
  color: var(--about-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.latest-update h3 {
  margin: 10px 0 8px;
  color: var(--text-light);
  font-size: 16px;
  line-height: 1.6;
  font-weight: 500;
}
.about-sidebar {
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.mini-section {
  padding: 24px;
  border: 1px solid var(--about-border);
  border-radius: 4px;
  background: var(--about-surface);
}
.mini-section h2 {
  font-size: 16px;
}
.availability {
  padding: 3px 7px;
  border: 1px solid var(--gold-dark);
  border-radius: 2px;
  color: var(--gold);
  font-size: 12px;
}
.mini-name {
  margin-top: 12px;
  color: var(--about-muted);
  font-size: 14px;
}
.qr-frame {
  position: relative;
  width: 174px;
  aspect-ratio: 1;
  margin: 24px auto 0;
  padding: 8px;
}
.qr-placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border: 1px dashed var(--about-border);
  background: #1e2121;
}
.qr-placeholder svg {
  width: 44px;
  height: 44px;
  color: var(--gold);
}
.qr-placeholder span {
  font-size: 13px;
  color: var(--text-light);
}
.mini-qr {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: white;
}
.qr-corner {
  position: absolute;
  width: 14px;
  height: 14px;
  border: solid var(--gold-dark);
}
.qr-corner.top-left {
  top: 0;
  left: 0;
  border-width: 1px 0 0 1px;
}
.qr-corner.top-right {
  top: 0;
  right: 0;
  border-width: 1px 1px 0 0;
}
.qr-corner.bottom-left {
  bottom: 0;
  left: 0;
  border-width: 0 0 1px 1px;
}
.qr-corner.bottom-right {
  bottom: 0;
  right: 0;
  border-width: 0 1px 1px 0;
}
.feedback-section {
  padding: 22px 24px;
  border: 1px solid var(--about-border);
  border-radius: 4px;
}
.feedback-heading {
  display: flex;
  align-items: center;
  gap: 10px;
}
.feedback-heading svg {
  color: var(--gold);
  width: 18px;
  height: 18px;
}
.feedback-heading h2 {
  font-size: 16px;
}
.feedback-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 44px;
  margin: 18px 0 0;
  padding: 10px 12px;
  color: var(--about-muted);
  font: inherit;
  font-size: 13px;
  border: 1px dashed #4b4639;
  border-radius: 3px;
  background: var(--about-surface);
  cursor: not-allowed;
}
.credits-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  margin-top: 40px;
  padding: 26px 0;
  border-top: 1px solid var(--about-border);
}
.credits-section h2 {
  font-size: 17px;
  font-weight: 500;
}
.credits-section p {
  max-width: 700px;
  margin-top: 12px;
  color: var(--about-muted);
  font-size: 13px;
  line-height: 1.9;
}
.credits-section p a {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--gold);
  text-decoration: none;
}
.credits-section p svg {
  width: 12px;
  height: 12px;
}
.source-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  flex-shrink: 0;
  color: var(--gold);
  font-size: 12px;
  text-decoration: none;
}
.source-link svg {
  width: 16px;
  height: 16px;
}
.open-source-info {
  flex-shrink: 0;
  text-align: right;
}
.open-source-info p {
  margin-top: 0;
}
@media (max-width: 900px) {
  .about-columns {
    grid-template-columns: minmax(0, 1fr) 275px;
    gap: 28px;
  }
  .about-cover {
    padding: 32px;
    grid-template-columns: minmax(0, 1fr) 210px;
  }
  .cover-brand-zh {
    font-size: 26px;
    letter-spacing: 1px;
  }
  .cover-description {
    font-size: 13px;
  }
  .art-orbit {
    width: 200px;
    height: 200px;
  }
  .website-row {
    gap: 10px;
  }
  .website-address {
    font-size: 16px;
  }
  .copy-button {
    min-width: 44px;
  }
  .copy-button span {
    display: none;
  }
}
@media (max-width: 680px) {
  .about-navigation {
    margin-bottom: 14px;
  }
  .about-cover {
    display: block;
    padding: 30px 24px;
  }
  .cover-brand {
    gap: 8px;
  }
  .cover-brand-en {
    font-size: 11px;
    letter-spacing: 1.6px;
  }
  .cover-brand-zh {
    font-size: clamp(20px, 5.5vw, 28px);
    letter-spacing: 1px;
  }
  .cover-description {
    margin-top: 18px;
    font-size: 14px;
  }
  .cover-tags {
    gap: 7px;
    margin-top: 18px;
  }
  .cover-tags span {
    font-size: 12px;
    padding-inline: 8px;
  }
  .book-art {
    display: none;
  }
  .about-columns {
    display: flex;
    flex-direction: column;
    gap: 30px;
    margin-top: 28px;
  }
  .section-heading h2 {
    font-size: 17px;
  }
  .website-row {
    margin-top: 16px;
  }
  .website-address {
    font-size: 18px;
  }
  .section-icon {
    flex-basis: 36px;
    height: 40px;
  }
  .latest-changelog {
    margin-top: 20px;
  }
  .about-sidebar {
    gap: 18px;
  }
  .mini-section {
    padding: 22px 24px;
  }
  .credits-section {
    display: block;
    margin-top: 28px;
    padding-top: 24px;
  }
  .credits-section h2 {
    font-size: 16px;
  }
  .open-source-info {
    margin-top: 18px;
    text-align: left;
  }
}
@media (max-width: 360px) {
  .about-cover {
    padding-inline: 20px;
  }
  .website-address {
    font-size: 15px;
  }
  .latest-meta time {
    width: 100%;
    margin-left: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .about-page *,
  .about-page a {
    transition: none;
  }
}
</style>
