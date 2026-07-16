// 与 workers/types.ts 的数据模型保持一致（见 docs/ADMIN-BACKEND.md §3）

export type Direction = '左' | '右' | '南' | '北';
export const DIRECTIONS: readonly Direction[] = ['左', '右', '南', '北'];

export type ImgKind = 'entry' | 'entryThumb' | 'floor1' | 'floor2' | 'full';
export const REQUIRED_KINDS: readonly ImgKind[] = ['entry', 'floor1', 'floor2', 'full'];

export interface StoredMap {
  id: number;
  sort?: number;
  direction: Direction;
  name: string;
  displayName: string;
  remarks: string;
  published?: boolean;
  deletedAt?: string | null;
  sourceKey?: string;
  images?: Partial<Record<ImgKind, string>>;
}

export interface StoredConfig {
  version: number;
  updatedAt: string;
  maps: StoredMap[];
}

export interface BackupItem {
  key: string;
  size: number;
  uploaded: string;
}

/** 已发布地图必须有完整图片（与服务端 validateMaps 同规则） */
export function missingImages(m: StoredMap): ImgKind[] {
  return REQUIRED_KINDS.filter((k) => !m.images?.[k]);
}
