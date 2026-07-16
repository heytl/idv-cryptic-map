// 全局状态：一份配置、显式保存（PUT 全量 + 乐观锁），与设计文档的"单文档"模型对应
import { computed, reactive } from 'vue';
import { ApiError, fetchConfig, saveConfig } from './api';
import type { StoredMap } from './types';
import { missingImages } from './types';

export const store = reactive({
  loading: true,
  /** 401/503 等全局错误（Access 未登录、存储未绑定），App 顶部横幅展示 */
  fatal: '' as string,
  version: 0,
  updatedAt: '',
  maps: [] as StoredMap[],
  dirty: false,
  saving: false,
});

export async function load(): Promise<void> {
  store.loading = true;
  store.fatal = '';
  try {
    const config = await fetchConfig();
    store.version = config.version;
    store.updatedAt = config.updatedAt;
    store.maps = config.maps;
    store.dirty = false;
  } catch (e) {
    store.fatal =
      e instanceof ApiError
        ? e.status === 401
          ? '未通过 Cloudflare Access 认证，请先登录'
          : `${e.code}: ${e.message}`
        : '无法连接后台 API（本地开发请先启动 wrangler dev）';
  } finally {
    store.loading = false;
  }
}

export function markDirty(): void {
  store.dirty = true;
}

/** 保存整份配置；409 时提示他处已保存，需要刷新重载 */
export async function save(): Promise<string | null> {
  // 保存前按当前数组顺序重排 sort（拖拽排序的持久化）
  store.maps.forEach((m, i) => (m.sort = (i + 1) * 10));
  const bad = store.maps.find((m) => m.published !== false && !m.deletedAt && missingImages(m).length > 0);
  if (bad) return `「${bad.displayName}」缺少图片（${missingImages(bad).join('/')}），请补齐或改为草稿`;

  store.saving = true;
  try {
    const { version, updatedAt } = await saveConfig(store.version, store.maps);
    store.version = version;
    store.updatedAt = updatedAt;
    store.dirty = false;
    return null;
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      return `保存冲突：${e.message}。请复制未保存的改动后刷新页面。`;
    }
    return e instanceof Error ? e.message : '保存失败';
  } finally {
    store.saving = false;
  }
}

export const activeMaps = computed(() => store.maps.filter((m) => !m.deletedAt));
export const recycledMaps = computed(() => store.maps.filter((m) => !!m.deletedAt));

export function nextId(): number {
  return Math.max(0, ...store.maps.map((m) => m.id)) + 1;
}
