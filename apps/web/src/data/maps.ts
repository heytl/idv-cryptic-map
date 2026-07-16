// ==========================================================================
// 地图数据访问层：组件只从这里取数据，不直接碰 maps.json / 图片路径。
//
// Phase 2（后台管理）数据流：
//   1) 模块加载时先用打包进产物的 maps.json 同步建好 `maps`（离线 / file:// / 测试兜底）
//   2) main.ts 在挂载前 await initMaps()：fetch 同源 /maps.json（Worker 从 KV 下发，
//      未接管时为构建期静态快照），成功则原地替换 `maps` 内容——组件零改动
//   3) 远端数据任何一处不合法都整体丢弃，回退打包数据，绝不带病渲染
// ==========================================================================
import { ref } from 'vue';
import rawData from './maps.json';

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

function toMapItem(m: RemoteMap): MapItem {
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

/** 页脚“地图数据更新于”：打包值兜底，initMaps 成功后由 /maps.json 下发值覆盖 */
export const mapsUpdatedAt = ref<string>(rawData.updatedAt);

/** 同步可用的打包数据；initMaps 成功后原地替换为线上数据（挂载前完成，组件无感知） */
export const maps: MapItem[] = (rawData.maps as RemoteMap[]).map(toMapItem);

/**
 * 挂载前调用：拉取同源 /maps.json 覆盖打包数据。
 * 失败（离线、file://、Worker 未接管返回非 JSON、数据不合法）一律静默回退打包数据。
 */
export async function initMaps(): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}maps.json`, { cache: 'no-cache' });
    if (!res.ok) return;
    const data = (await res.json()) as { updatedAt?: string; maps?: RemoteMap[] };
    if (!Array.isArray(data.maps) || data.maps.length === 0) return;
    const next = data.maps
      .filter((m) => m.published !== false && !m.deletedAt)
      .map(toMapItem);
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
