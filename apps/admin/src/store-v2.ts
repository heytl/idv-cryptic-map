import { publicationIssues, type MapItemV2 } from '@idv-map/shared';
import { computed, reactive } from 'vue';
import { ApiError } from './api';
import { fetchConfigV2, saveConfigV2 } from './api-v2';

export const storeV2 = reactive({
  loaded: false,
  loading: false,
  fatal: '',
  version: 0,
  updatedAt: '',
  maps: [] as MapItemV2[],
  dirty: false,
  saving: false,
});

export async function loadV2(): Promise<void> {
  storeV2.loading = true;
  storeV2.fatal = '';
  try {
    const config = await fetchConfigV2();
    storeV2.version = config.version;
    storeV2.updatedAt = config.updatedAt;
    storeV2.maps = config.maps;
    storeV2.dirty = false;
    storeV2.loaded = true;
  } catch (error) {
    storeV2.fatal =
      error instanceof ApiError
        ? error.status === 401
          ? '未通过 Cloudflare Access 认证，请先登录'
          : `${error.code}: ${error.message}`
        : '无法连接 V2 后台接口';
  } finally {
    storeV2.loading = false;
  }
}

export function markDirtyV2(): void {
  storeV2.dirty = true;
}

export async function saveV2(): Promise<string | null> {
  const publishedProblem = storeV2.maps.find((map) => map.published && publicationIssues(map).length > 0);
  if (publishedProblem) {
    return `「${publishedProblem.displayName}」暂时不能发布：${publicationIssues(publishedProblem).join('；')}`;
  }
  storeV2.maps.forEach((map, index) => (map.sort = (index + 1) * 10));
  storeV2.saving = true;
  try {
    const result = await saveConfigV2(storeV2.version, storeV2.maps);
    storeV2.version = result.version;
    storeV2.updatedAt = result.updatedAt;
    storeV2.dirty = false;
    return null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return '保存冲突：其他人已经保存过 V2 数据，请保留当前内容并刷新后重试。';
    }
    return error instanceof Error ? error.message : 'V2 保存失败';
  } finally {
    storeV2.saving = false;
  }
}

export const activeMapsV2 = computed(() => storeV2.maps.filter((map) => !map.deletedAt));

export function nextIdV2(): number {
  return Math.max(0, ...storeV2.maps.map((map) => map.id)) + 1;
}
