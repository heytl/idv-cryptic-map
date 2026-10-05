<script setup lang="ts">
import { ref } from "vue";
import { projectInfo, latestUpdate } from "../../data/handbook";
import { returnToHandbookPage } from "../../services/handbook-navigation";
import ChangelogContent from "../../components/ChangelogContent.vue";
import UpdateMeta from "../../components/UpdateMeta.vue";
import UiIcon from "../../components/UiIcon.vue";

const copyStatus = ref("");
function copyWebsite() {
  uni.setClipboardData({
    data: projectInfo.website,
    success: () => { copyStatus.value = "网址已复制"; },
    fail: () => { copyStatus.value = "复制未成功，请长按上方网址复制。"; },
  });
}
function copyExternalLink(url: string, label: string) {
  uni.setClipboardData({
    data: url,
    success: () => uni.showModal({ title: `${label}链接已复制`, content: "请粘贴到浏览器中打开。", showCancel: false }),
    fail: () => uni.showModal({ title: "复制未成功", content: url, showCancel: false }),
  });
}
function previewCode() {
  if (projectInfo.miniProgram.qrImageUrl) uni.previewImage({ urls: [projectInfo.miniProgram.qrImageUrl] });
}
function openChangelog() { uni.navigateTo({ url: "/pages/changelog/index" }); }
</script>

<template>
  <view class="about-page">
    <view class="about-navigation">
      <button class="back-link" hover-class="link-pressed" @tap="returnToHandbookPage('maps')"><UiIcon name="arrow-left" :size="20" /><text>地图</text></button>
      <text class="about-navigation-label">关于手册</text>
    </view>

    <view class="about-cover">
      <view class="cover-copy">
        <view class="cover-brand" role="heading" aria-level="1">
          <text class="cover-brand-en">CRYPTIC HANDBOOK</text>
          <text class="cover-brand-zh">{{ projectInfo.name }}</text>
        </view>
        <view class="cover-description"><text>{{ projectInfo.description }}</text><text>{{ projectInfo.usage }}</text></view>
        <view class="cover-tags"><text v-for="tag in projectInfo.tags" :key="tag">{{ tag }}</text></view>
      </view>
      <view class="book-art" aria-hidden="true">
        <view class="art-orbit" />
        <view class="handbook-book">
          <view class="book-spine" />
          <view class="book-border"><UiIcon name="book" :size="38" /><text class="book-name">加页手记</text><text class="book-subtitle">解密手册</text><text class="book-ornament">◇</text></view>
          <view class="book-ribbon" />
        </view>
      </view>
    </view>

    <view class="about-columns">
      <view class="about-main">
        <view class="access-section">
          <view class="section-heading"><text class="section-title" role="heading" aria-level="2">网页地址</text></view>
          <view class="website-row">
            <view class="section-icon"><UiIcon name="globe" :size="20" /></view>
            <view class="website-copy"><text class="website-address" selectable>{{ projectInfo.websiteLabel }}</text></view>
            <button class="copy-button" hover-class="copy-pressed" :aria-label="copyStatus === '网址已复制' ? '再次复制网页地址' : '复制网页地址'" @tap="copyWebsite"><UiIcon :name="copyStatus === '网址已复制' ? 'check' : 'copy'" :size="15" /><text>{{ copyStatus === '网址已复制' ? '已复制' : '复制' }}</text></button>
          </view>
          <text v-if="copyStatus && copyStatus !== '网址已复制'" class="access-note" role="status">{{ copyStatus }}</text>
        </view>

        <view class="latest-changelog">
          <view class="section-heading">
            <text class="section-title" role="heading" aria-level="2">更新日志</text>
            <button class="changelog-link" hover-class="link-pressed" @tap="openChangelog"><text>查看全部</text><view class="right-chevron"><UiIcon name="chevron" :size="16" /></view></button>
          </view>
          <view v-if="latestUpdate" class="latest-update">
            <UpdateMeta :entry="latestUpdate" />
            <text class="latest-title" role="heading" aria-level="3">{{ latestUpdate.title }}</text>
            <ChangelogContent :blocks="latestUpdate.blocks" :heading-level="4" />
          </view>
        </view>
      </view>

      <view class="about-sidebar">
        <view class="mini-section">
          <view class="section-heading"><text class="section-title" role="heading" aria-level="2">微信小程序</text><text class="availability">{{ projectInfo.miniProgram.released ? '已上线' : '待发布' }}</text></view>
          <text class="mini-name">{{ projectInfo.miniProgram.name }}</text>
          <view class="qr-frame">
            <button v-if="projectInfo.miniProgram.qrImageUrl" class="qr-button" aria-label="查看微信小程序码" @tap="previewCode"><image :src="projectInfo.miniProgram.qrImageUrl" mode="aspectFit" class="mini-qr" /></button>
            <view v-else class="qr-placeholder"><UiIcon name="scan" :size="44" /><text>小程序码待补充</text></view>
            <view class="qr-corner top-left" /><view class="qr-corner top-right" /><view class="qr-corner bottom-left" /><view class="qr-corner bottom-right" />
          </view>
        </view>
        <view class="feedback-section">
          <view class="feedback-heading"><UiIcon name="message" :size="18" /><text class="section-title" role="heading" aria-level="2">问题反馈</text></view>
          <button class="feedback-button" disabled>反馈入口暂未开放</button>
        </view>
      </view>
    </view>

    <view class="credits-section">
      <view class="credits-copy">
        <text class="credits-title" role="heading" aria-level="2">素材与致谢</text>
        <view class="credits-description"><text>地图攻略素材来自 </text><button class="author-link" hover-class="link-pressed" @tap="copyExternalLink(projectInfo.authorUrl, projectInfo.authorName)"><text>{{ projectInfo.authorName }}</text><UiIcon name="arrow-up-right" :size="12" /></button><text>，感谢整理与分享。游戏及地图版权归《第五人格》官方所有。</text></view>
      </view>
    </view>

    <view class="credits-section open-source-info">
      <text class="credits-title" role="heading" aria-level="2">开源与反馈</text>
      <view class="credits-description">
        <text>本项目开源免费，欢迎 Star 与反馈。</text><button class="author-link" hover-class="link-pressed" @tap="copyExternalLink(projectInfo.repository, 'GitHub 开源')"><text>GitHub 开源</text><UiIcon name="arrow-up-right" :size="12" /></button>
      </view>
    </view>
  </view>
</template>

<style>
page { background: #0a0b0d; background-image: radial-gradient(circle at 50% 10%, #c3a16814, transparent 70%); }
</style>

<style scoped>
.about-page { --about-border: #36352e; --about-muted: #afa99b; width: 100%; max-width: 1112px; margin: 0 auto; padding: 12px 16px calc(24px + env(safe-area-inset-bottom)); }
.about-page button { font-family: inherit; }
.about-navigation { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.about-navigation-label { color: var(--about-muted); font-size: 13px; }
.back-link { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; padding: 0; border: 0; background: transparent; color: var(--gold); font-size: 14px; }
.link-pressed { color: #e5c38c; }
.about-cover { position: relative; padding: 30px 24px; border: 1px solid var(--parchment-border); border-radius: 4px; background: radial-gradient(ellipse at 75% 0%, var(--parchment-light), transparent 65%), var(--parchment); color: #362b20; box-shadow: 0 10px 25px #000000cc; }
.about-cover::before { content: ""; position: absolute; top: 9px; right: 9px; bottom: 9px; left: 9px; border: 1px solid #9b8b6d; pointer-events: none; }
.cover-copy { min-width: 0; }
.cover-brand { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.cover-brand-en { max-width: 100%; color: #8b1e1e; font-family: Georgia, "Times New Roman", serif; font-size: 11px; line-height: 1.4; letter-spacing: 1.6px; overflow-wrap: anywhere; }
.cover-brand-zh { color: #362b20; font-size: clamp(20px, 5.5vw, 28px); line-height: 1.4; font-weight: 700; letter-spacing: 1px; }
.cover-description { margin-top: 18px; font-size: 14px; line-height: 2; white-space: pre-line; }
.cover-description text { display: block; }
.cover-tags { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 18px; }
.cover-tags text { padding: 4px 8px; border: 1px solid #a5916d; border-radius: 2px; font-size: 12px; }
.book-art { display: none; }
.about-columns { display: flex; flex-direction: column; gap: 30px; margin-top: 28px; }
.about-main { min-width: 0; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.section-title { color: #d1c7b7; font-size: 17px; font-weight: 500; }
.website-row { display: flex; align-items: center; gap: 10px; margin-top: 16px; padding: 18px 0; border-top: 1px solid var(--about-border); border-bottom: 1px solid var(--about-border); }
.section-icon { display: flex; align-items: center; justify-content: center; flex: 0 0 36px; height: 40px; border: 1px solid var(--gold-dark); border-radius: 3px; }
.website-copy { flex: 1; min-width: 0; }
.website-address { color: var(--gold); font-family: Georgia, "Times New Roman", serif; font-size: 18px; overflow-wrap: anywhere; }
.copy-button { display: flex; align-items: center; justify-content: center; flex: none; gap: 6px; min-width: 44px; min-height: 44px; padding: 8px 10px; border: 1px solid var(--about-border); border-radius: 3px; background: transparent; color: #d1c7b7; font-size: 12px; }
.copy-button text { display: none; }
.copy-pressed { color: var(--gold); border-color: var(--gold-dark); }
.access-note { display: block; margin-top: 12px; color: var(--about-muted); font-size: 13px; line-height: 1.8; }
.latest-changelog { margin-top: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--about-border); }
.changelog-link { display: inline-flex; align-items: center; flex: none; gap: 6px; min-height: 44px; padding: 0; border: 0; border-radius: 0; background: transparent; color: var(--gold); font-size: 13px; }
.right-chevron { transform: rotate(-90deg); }
.latest-update { margin-top: 12px; }
.latest-title { display: block; margin: 10px 0 8px; color: #d1c7b7; font-size: 16px; line-height: 1.6; font-weight: 500; }
.about-sidebar { display: flex; flex-direction: column; gap: 18px; }
.mini-section { padding: 22px 24px; border: 1px solid var(--about-border); border-radius: 4px; background: #16191b; }
.mini-section .section-title, .feedback-heading .section-title { font-size: 16px; }
.availability { flex: none; padding: 3px 7px; border: 1px solid var(--gold-dark); border-radius: 2px; color: var(--gold); font-size: 12px; }
.mini-name { display: block; margin-top: 12px; color: var(--about-muted); font-size: 14px; }
.qr-frame { position: relative; width: 174px; height: 174px; margin: 24px auto 0; padding: 8px; }
.qr-placeholder { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; border: 1px dashed var(--about-border); background: #1e2121; }
.qr-placeholder text { color: #d1c7b7; font-size: 13px; }
.qr-button { display: block; width: 100%; height: 100%; padding: 0; border: 0; border-radius: 0; background: white; }
.mini-qr { display: block; width: 100%; height: 100%; }
.qr-corner { position: absolute; width: 14px; height: 14px; border: solid var(--gold-dark); pointer-events: none; }
.top-left { top: 0; left: 0; border-width: 1px 0 0 1px; }
.top-right { top: 0; right: 0; border-width: 1px 1px 0 0; }
.bottom-left { bottom: 0; left: 0; border-width: 0 0 1px 1px; }
.bottom-right { bottom: 0; right: 0; border-width: 0 1px 1px 0; }
.feedback-section { padding: 22px 24px; border: 1px solid var(--about-border); border-radius: 4px; }
.feedback-heading { display: flex; align-items: center; gap: 10px; }
.feedback-button[disabled] { width: 100%; min-height: 44px; margin-top: 18px; padding: 10px 12px; color: var(--about-muted); font-size: 13px; border: 1px dashed #4b4639; border-radius: 3px; background: #16191b; }
.credits-section { margin-top: 28px; padding: 24px 0 0; border-top: 1px solid var(--about-border); }
.credits-section.open-source-info { margin-top: 24px; padding-top: 0; border-top: 0; }
.credits-title { display: block; font-size: 16px; font-weight: 500; }
.credits-description { max-width: 700px; margin-top: 12px; color: var(--about-muted); font-size: 13px; line-height: 1.9; }
.author-link { display: inline-flex; align-items: center; gap: 2px; min-height: 44px; padding: 0; border: 0; border-radius: 0; background: transparent; color: var(--gold); font-size: 13px; vertical-align: middle; }
@media (max-width: 360px) { .about-cover { padding-right: 20px; padding-left: 20px; } .website-address { font-size: 15px; } }
@media (min-width: 681px) {
  .about-navigation { margin-bottom: 24px; }
  .about-cover { display: flex; align-items: center; padding: 32px; }
  .cover-copy { flex: 1; }
  .cover-brand-zh { font-size: 26px; }
  .cover-description { margin-top: 24px; font-size: 13px; }
  .cover-tags { gap: 10px; margin-top: 22px; }
  .cover-tags text { font-size: 13px; }
  .book-art { position: relative; display: flex; align-items: center; justify-content: center; flex: 0 0 210px; padding: 10px 0; }
  .art-orbit { position: absolute; width: 200px; height: 200px; border: 1px solid #ab997866; border-radius: 50%; }
  .art-orbit::after { content: ""; position: absolute; top: 14px; right: 14px; bottom: 14px; left: 14px; border: 1px dashed #ab997866; border-radius: 50%; }
  .handbook-book { position: relative; width: 155px; height: 208px; padding: 14px 12px 14px 20px; border: 1px solid #5b4c37; border-radius: 3px 7px 7px 3px; background: linear-gradient(110deg, #24272a, #343634); color: var(--gold); transform: rotate(-8deg); box-shadow: 7px 5px 0 -2px #e3d6b6, 9px 6px 0 -2px #7c6b50, 15px 20px 22px #362b2033; }
  .book-spine { position: absolute; left: 9px; top: 0; bottom: 0; border-left: 1px solid #88735177; }
  .book-border { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: space-around; padding: 12px 0; border: 1px solid var(--gold-dark); }
  .book-name { font-size: 18px; letter-spacing: 3px; }
  .book-subtitle { font-size: 13px; letter-spacing: 2px; }
  .book-ornament { font-size: 15px; }
  .book-ribbon { position: absolute; right: 25px; bottom: -16px; width: 13px; height: 26px; background: #8b1e1e; clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 77%, 0 100%); }
  .about-columns { flex-direction: row; align-items: flex-start; gap: 28px; margin-top: 40px; }
  .about-main { flex: 1; }
  .about-sidebar { flex: 0 0 275px; gap: 22px; }
  .website-address { font-size: 16px; }
  .latest-changelog { margin-top: 28px; }
  .credits-section { display: flex; align-items: center; justify-content: space-between; gap: 32px; margin-top: 40px; padding: 26px 0 0; }
  .credits-copy { flex: 1; min-width: 0; }
  .open-source-info { display: block; }
}
@media (min-width: 901px) { .about-cover { padding: 36px 44px; } .cover-brand-zh { font-size: 34px; letter-spacing: 2px; } .book-art { flex-basis: 280px; } .about-columns { gap: 44px; } .about-sidebar { flex-basis: 310px; } .copy-button text { display: inline; } .copy-button { min-width: 74px; } }
</style>
