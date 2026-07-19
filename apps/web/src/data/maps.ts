// ==========================================================================
// 地图数据访问层：组件只从这里取数据，不直接碰 maps.json / 图片路径。
//
// Phase 2（后台管理）数据流：
//   1) 模块加载时先用打包进产物的兜底数据同步建好 `maps`（离线 / file:// / 测试兜底；
//      有 Cron 快照 maps.snapshot.json 时优先，否则用 maps.json）
//   2) main.ts 在挂载前 await initMaps()：fetch 同源 /maps.json（Worker 从 KV 下发，
//      未接管时为构建期静态快照），成功则原地替换 `maps` 内容——组件零改动
//   3) 远端数据任何一处不合法都整体丢弃，回退打包数据，绝不带病渲染
// ==========================================================================
import { ref } from 'vue';
import rawData from './maps.json';

// Cron 快照（workers/snapshot.ts 每日回写仓库）存在时优先作打包兜底数据，
// 让内嵌兜底滞后 ≤1 天；未开通回写（文件不存在）或快照不合法时退回 maps.json。
// glob 对不存在的文件返回空对象，接线可先于 secrets 开通合入。
const snapshotModules = import.meta.glob<{ updatedAt?: string; maps?: RemoteMap[] }>(
  './maps.snapshot.json',
  { eager: true, import: 'default' },
);

// 构建期生成 逻辑路径 → 哈希 URL 清单；只有被 maps.json 引用的图片才会进产物
// entry-thumb 由 scripts/gen-thumbs.mjs 生成（build/dev/test 前置步骤）
const imgUrls = import.meta.glob('../assets/maps/**/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export type Direction = '左' | '右' | '南' | '北';

export interface MapItem {
  id: number;
  direction: Direction;
  /** 逻辑名 = 图片文件名（不含扩展名与“（新）”后缀） */
  name: string;
  /** 展示名（可带“（新）”等后缀） */
  displayName: string;
  remarks: string;
  entryImg: string;
  /** 目录卡片用的 300px 缩略图（缺失时回退原图，保证未跑生成脚本也可用） */
  entryThumbImg: string;
  floor1Img: string;
  floor2Img: string;
  fullImg: string;
}

export const DIRECTIONS: readonly Direction[] = ['左', '右', '南', '北'] as const;

type ImgKind = 'entry' | 'floor1' | 'floor2' | 'full';

function resolveImg(kind: ImgKind, name: string): string {
  const key = `../assets/maps/${kind}/${name}.webp`;
  const url = imgUrls[key];
  if (!url) {
    // 构建/测试期即失败，杜绝上线后图片 404
    throw new Error(`缺少地图图片: ${key}`);
  }
  return url;
}

/** /maps.json 下发的记录：KV 数据带 images 完整 URL；静态快照与打包数据同构（按逻辑名解析） */
interface RemoteMap {
  id: number;
  direction: Direction;
  name: string;
  displayName: string;
  remarks: string;
  published?: boolean;
  deletedAt?: string | null;
  images?: {
    entry: string;
    entryThumb?: string;
    floor1: string;
    floor2: string;
    full: string;
  };
}

function toMapItem(m: RemoteMap, preferBundled = false): MapItem {
  if (
    typeof m.id !== 'number' ||
    !DIRECTIONS.includes(m.direction) ||
    typeof m.name !== 'string' ||
    typeof m.displayName !== 'string'
  ) {
    throw new Error(`地图记录不合法: ${JSON.stringify(m)}`);
  }
  const base = {
    id: m.id,
    direction: m.direction,
    name: m.name,
    displayName: m.displayName,
    remarks: m.remarks ?? '',
  };
  // 打包兜底场景优先用产物内的本地图片：快照里的 images 是 /r2 相对 URL，
  // 离线首访 / Vercel 镜像 / Worker 摘除时均不可达；本地能解析到的一律用本地
  // （后台换过图会略旧，但可用性优先），只有产物里没有的新图才落到 /r2 URL
  if (preferBundled && imgUrls[`../assets/maps/entry/${m.name}.webp`]) {
    return {
      ...base,
      entryImg: resolveImg('entry', m.name),
      entryThumbImg: imgUrls[`../assets/maps/entry-thumb/${m.name}.webp`] ?? resolveImg('entry', m.name),
      floor1Img: resolveImg('floor1', m.name),
      floor2Img: resolveImg('floor2', m.name),
      fullImg: resolveImg('full', m.name),
    };
  }
  if (m.images) {
    // KV 时代：图片为 R2 直出的完整 URL（内容哈希文件名，天然缓存穿透）
    const { entry, entryThumb, floor1, floor2, full } = m.images;
    if (![entry, floor1, floor2, full].every((u) => typeof u === 'string' && u.length > 0)) {
      throw new Error(`地图图片 URL 不完整: ${m.name}`);
    }
    return { ...base, entryImg: entry, entryThumbImg: entryThumb ?? entry, floor1Img: floor1, floor2Img: floor2, fullImg: full };
  }
  // 静态快照 / 打包数据：按逻辑名从构建清单解析（缺图即抛，整份回退）
  return {
    ...base,
    entryImg: resolveImg('entry', m.name),
    entryThumbImg: imgUrls[`../assets/maps/entry-thumb/${m.name}.webp`] ?? resolveImg('entry', m.name),
    floor1Img: resolveImg('floor1', m.name),
    floor2Img: resolveImg('floor2', m.name),
    fullImg: resolveImg('full', m.name),
  };
}

/** 打包兜底数据：快照优先（按逻辑名优先本地图），不合法整份丢弃退回 maps.json */
function buildBundled(): { updatedAt: string; items: MapItem[] } {
  const snapshot = Object.values(snapshotModules)[0];
  if (snapshot && Array.isArray(snapshot.maps) && snapshot.maps.length > 0) {
    try {
      const items = snapshot.maps
        .filter((m) => m.published !== false && !m.deletedAt)
        .map((m) => toMapItem(m, true));
      return {
        updatedAt: typeof snapshot.updatedAt === 'string' ? snapshot.updatedAt : rawData.updatedAt,
        items,
      };
    } catch {
      // 快照不合法：退回 maps.json，站点照常可用
    }
  }
  return { updatedAt: rawData.updatedAt, items: (rawData.maps as RemoteMap[]).map((m) => toMapItem(m)) };
}
const bundled = buildBundled();

/** 页脚“地图数据更新于”：打包值兜底，initMaps 成功后由 /maps.json 下发值覆盖 */
export const mapsUpdatedAt = ref<string>(bundled.updatedAt);

/** 同步可用的打包数据；initMaps 成功后原地替换为线上数据（挂载前完成，组件无感知） */
export const maps: MapItem[] = bundled.items;

// ---- 历史版本预览（管理员用）----
// URL 带 ?preview=backups/... 时改拉 /api/preview（Access 保护，须已登录后台）。
// guard：本模块也在 vitest(node) 里加载，不能在 import 期碰 window。
export const previewKey =
  typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('preview') : null;
/** >0 表示预览数据已就位（值为该备份的版本号） */
export const previewVersion = ref(0);
/** 预览加载失败原因；此时页面展示的是当前数据而非历史版本，横幅需明示 */
export const previewError = ref('');

/**
 * 挂载前调用：拉取同源 /maps.json 覆盖打包数据。
 * 失败（离线、file://、Worker 未接管返回非 JSON、数据不合法）一律静默回退打包数据。
 * 预览模式改拉 /api/preview，失败时不静默——横幅明确告知看到的不是历史版本。
 */
export async function initMaps(): Promise<void> {
  if (previewKey) {
    try {
      const res = await fetch(`/api/preview?key=${encodeURIComponent(previewKey)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status === 401 ? '未登录后台（Access）' : `HTTP ${res.status}`);
      const data = (await res.json()) as { version?: number; updatedAt?: string; maps?: RemoteMap[] };
      if (!Array.isArray(data.maps)) throw new Error('备份数据不合法');
      maps.splice(0, maps.length, ...data.maps.map((m) => toMapItem(m)));
      if (typeof data.updatedAt === 'string') mapsUpdatedAt.value = data.updatedAt;
      previewVersion.value = data.version ?? -1;
    } catch (e) {
      previewError.value = e instanceof Error ? e.message : '加载失败';
    }
    return;
  }

  try {
    const res = await fetch(`${import.meta.env.BASE_URL}maps.json`, { cache: 'no-cache' });
    if (!res.ok) return;
    const data = (await res.json()) as { updatedAt?: string; maps?: RemoteMap[] };
    if (!Array.isArray(data.maps) || data.maps.length === 0) return;
    const next = data.maps
      .filter((m) => m.published !== false && !m.deletedAt)
      .map((m) => toMapItem(m));
    maps.splice(0, maps.length, ...next);
    if (typeof data.updatedAt === 'string') mapsUpdatedAt.value = data.updatedAt;
  } catch {
    // 保持打包数据，站点照常可用
  }
}

/** 按逻辑名或展示名查找（旧分享链接的 hash 里可能是带“（新）”的展示名） */
export function findMapByName(name: string): MapItem | undefined {
  return maps.find((m) => m.name === name || m.displayName === name);
}
