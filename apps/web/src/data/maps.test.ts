import { describe, expect, it } from 'vitest';
import { DIRECTIONS, maps, mapsUpdatedAt } from './maps';

describe('maps 数据一致性', () => {
  it('共 28 张地图', () => {
    expect(maps).toHaveLength(28);
  });

  it('id 与 name 均无重复', () => {
    expect(new Set(maps.map((m) => m.id)).size).toBe(maps.length);
    expect(new Set(maps.map((m) => m.name)).size).toBe(maps.length);
  });

  it('direction 均为合法方向', () => {
    for (const m of maps) {
      expect(DIRECTIONS).toContain(m.direction);
    }
  });

  it('每张地图的 entry/floor1/floor2/full 四张图片均已解析出 URL', () => {
    // maps.ts 模块加载时缺图会直接 throw，这里再显式断言 URL 非空
    for (const m of maps) {
      for (const key of ['entryImg', 'floor1Img', 'floor2Img', 'fullImg'] as const) {
        expect(m[key], `${m.name}.${key}`).toBeTruthy();
      }
    }
  });

  it('displayName 去掉“（新）”后缀等于 name', () => {
    for (const m of maps) {
      expect(m.displayName.replace(/（新）$/, ''), m.name).toBe(m.name);
    }
  });

  it('updatedAt 为 YYYY-MM-DD 格式', () => {
    expect(mapsUpdatedAt.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
