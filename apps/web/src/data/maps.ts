// ==========================================================================
// 地图数据访问层：组件只从这里取数据，不直接碰 maps.json / 图片路径。
// 未来接后台管理时，把这里改为 fetch API（KV/D1 + R2），组件零改动。
// ==========================================================================
import rawData from './maps.json';

// 构建期生成 逻辑路径 → 哈希 URL 清单；只有被 maps.json 引用的图片才会进产物
// entry-thumb 由 scripts/gen-thumbs.mjs 生成（build/dev/test 前置步骤）
const imgUrls = import.meta.glob('../assets/maps/**/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export type Direction = '左' | '右' | '南' | '北';

export interface RoomRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type FloorRooms = Record<string, RoomRect>;

export interface MapItem {
  id: number;
  direction: Direction;
  /** 逻辑名 = 图片文件名（不含扩展名与“（新）”后缀） */
  name: string;
  /** 展示名（可带“（新）”等后缀） */
  displayName: string;
  remarks: string;
  /** 楼层 → 房间名 → 百分比坐标（基于图片自然尺寸） */
  rooms?: Partial<Record<'1' | '2', FloorRooms>>;
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

interface RawMap extends Omit<MapItem, 'entryImg' | 'floor1Img' | 'floor2Img' | 'fullImg'> {}

/** 页脚“地图数据更新于”：随地图更新手动维护的配置字段，后续由后台接口下发 */
export const mapsUpdatedAt: string = rawData.updatedAt;

export const maps: MapItem[] = (rawData.maps as RawMap[]).map((m) => ({
  ...m,
  entryImg: resolveImg('entry', m.name),
  entryThumbImg: imgUrls[`../assets/maps/entry-thumb/${m.name}.webp`] ?? resolveImg('entry', m.name),
  floor1Img: resolveImg('floor1', m.name),
  floor2Img: resolveImg('floor2', m.name),
  fullImg: resolveImg('full', m.name),
}));

/** 按逻辑名或展示名查找（旧分享链接的 hash 里可能是带“（新）”的展示名） */
export function findMapByName(name: string): MapItem | undefined {
  return maps.find((m) => m.name === name || m.displayName === name);
}
