import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLOOR,
  FLOOR_ORDER,
  migrateLegacyConfigToV2,
  toPublicMapConfigV2,
  validateMapConfigV2,
  type MapConfigV2,
  type MapItemV2,
} from './map-v2';

const asset = (key: string) => ({ key });

function hardMap(overrides: Partial<MapItemV2> = {}): MapItemV2 {
  return {
    id: 1,
    mode: 'hard',
    name: 'hard-y',
    displayName: 'Y门',
    remarks: '',
    sort: 10,
    published: true,
    layout: {
      full: asset('maps/layout/full/full.webp'),
      floor1: asset('maps/layout/floor1/one.webp'),
      floor2: asset('maps/layout/floor2/two.webp'),
    },
    entrances: [
      { id: '1-side', type: 'side', direction: 'left', image: asset('maps/entrance/side.webp') },
      { id: '1-front', type: 'front', direction: 'north', image: asset('maps/entrance/front.webp') },
      { id: '1-upstairs', type: 'upstairs', direction: 'right', image: asset('maps/entrance/upstairs.webp') },
    ],
    ...overrides,
  };
}

function config(map: MapItemV2): MapConfigV2 {
  return { schemaVersion: 2, version: 3, updatedAt: '2026-08-22', maps: [map] };
}

describe('V2 发布校验', () => {
  it('困难模式完整数据合法', () => {
    expect(validateMapConfigV2(config(hardMap()))).toEqual({ valid: true, errors: [] });
  });

  it('困难模式发布时拒绝地下室', () => {
    const map = hardMap();
    map.layout.basement = asset('maps/layout/basement/b1.webp');
    const result = validateMapConfigV2(config(map));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('map[1]：困难模式不使用地下室地图，请先移除');
  });

  it('噩梦模式必须有地下室且禁止侧门', () => {
    const map = hardMap({
      mode: 'nightmare',
      entrances: [
        { id: '1-front', type: 'front', direction: 'north', image: asset('maps/entrance/front.webp') },
        { id: '1-upstairs', type: 'upstairs', direction: 'right', image: asset('maps/entrance/upstairs.webp') },
      ],
    });
    const missing = validateMapConfigV2(config(map));
    expect(missing.valid).toBe(false);
    expect(missing.errors).toContain('map[1]：缺少地下室地图');

    map.layout.basement = asset('maps/layout/basement/b1.webp');
    expect(validateMapConfigV2(config(map))).toEqual({ valid: true, errors: [] });

    map.entrances.push({ id: '1-side', type: 'side', direction: 'left', image: asset('maps/entrance/side.webp') });
    expect(validateMapConfigV2(config(map)).errors).toContain('map[1]：噩梦模式不使用侧门，请先移除');
  });

  it('草稿允许暂时缺图和保留模式不匹配内容', () => {
    const map = hardMap({ mode: 'nightmare', published: false, layout: {}, entrances: [] });
    expect(validateMapConfigV2(config(map))).toEqual({ valid: true, errors: [] });
  });

  it('正门通道允许逐步补录，但拒绝非法值和配置到其他入口', () => {
    const compatible = hardMap();
    expect(validateMapConfigV2(config(compatible))).toEqual({ valid: true, errors: [] });

    compatible.entrances[0]!.passage = 'upperLeft';
    expect(validateMapConfigV2(config(compatible)).errors).toContain(
      'map[1].entrance[1-side].passage 仅正门可以配置',
    );

    const front = compatible.entrances[1]!;
    delete compatible.entrances[0]!.passage;
    front.passage = 'unknown' as typeof front.passage;
    expect(validateMapConfigV2(config(compatible)).errors).toContain(
      'map[1].entrance[1-front].passage 不合法',
    );
  });
});

describe('公开契约', () => {
  it('全图始终第一并作为默认楼层', () => {
    expect(FLOOR_ORDER).toEqual(['full', 'basement', 'floor1', 'floor2']);
    expect(DEFAULT_FLOOR).toBe('full');

    const publicConfig = toPublicMapConfigV2(config(hardMap()), 'https://map.example/r2');
    expect(publicConfig.defaultFloor).toBe('full');
    expect(publicConfig.dictionaries.floors.map((item) => item.value)).toEqual(FLOOR_ORDER);
    expect(Object.keys(publicConfig.maps[0]!.layout)).toEqual(['full', 'floor1', 'floor2']);
    expect(publicConfig.maps[0]!.layout.full?.url).toBe('https://map.example/r2/maps/layout/full/full.webp');
  });

  it('公开契约过滤草稿和后台字段', () => {
    const draft = hardMap({ id: 2, published: false });
    const source = { ...config(hardMap()), maps: [hardMap(), draft] };
    const result = toPublicMapConfigV2(source, 'https://map.example/r2');
    expect(result.maps).toHaveLength(1);
    expect(result.maps[0]).not.toHaveProperty('published');
    expect(result.maps[0]).not.toHaveProperty('deletedAt');
  });

  it('正门公开为固定南门，并提供独立通道字典和标签', () => {
    const map = hardMap();
    map.entrances[1]!.passage = 'upperRight';
    const result = toPublicMapConfigV2(config(map), 'https://map.example/r2');
    const front = result.maps[0]!.entrances.find((entrance) => entrance.type === 'front')!;

    expect(result.dictionaries.passages.map((item) => item.value)).toEqual([
      'upperLeft',
      'upperRight',
      'both',
      'triple',
    ]);
    expect(front).toMatchObject({
      direction: 'south',
      directionLabel: '南',
      passage: 'upperRight',
      passageLabel: '右上门',
    });
  });
});

describe('V1 → V2 迁移', () => {
  it('保留 ID 和图片，把旧入口迁为困难侧门草稿且不生成地下室', () => {
    const result = migrateLegacyConfigToV2({
      version: 8,
      updatedAt: '2026-08-20',
      maps: [
        {
          id: 12,
          sort: 120,
          direction: '左',
          name: '左-Y门',
          displayName: '左-Y门',
          published: true,
          images: {
            entry: '/r2/maps/entry/a.webp',
            entryThumb: '/r2/maps/entry-thumb/b.webp',
            floor1: '/r2/maps/floor1/c.webp',
            floor2: '/r2/maps/floor2/d.webp',
            full: '/r2/maps/full/e.webp',
          },
        },
      ],
    });

    expect(result.warnings).toEqual([]);
    expect(result.config.version).toBe(0);
    const map = result.config.maps[0]!;
    expect(map).toMatchObject({ id: 12, mode: 'hard', sort: 120, published: false });
    expect(map.layout.full?.key).toBe('maps/full/e.webp');
    expect(map.layout).not.toHaveProperty('basement');
    expect(map.entrances[0]).toMatchObject({ id: '12-side', type: 'side', direction: 'left' });
  });

  it('正式同步时三个入口临时复用侧门数据并保持发布', () => {
    const result = migrateLegacyConfigToV2({
      version: 8,
      updatedAt: '2026-08-20',
      maps: [{
        id: 12,
        direction: '左',
        name: '左-Y门',
        displayName: '左-Y门',
        images: {
          entry: '/r2/maps/entry/a.webp',
          entryThumb: '/r2/maps/entry-thumb/b.webp',
          floor1: '/r2/maps/floor1/c.webp',
          floor2: '/r2/maps/floor2/d.webp',
          full: '/r2/maps/full/e.webp',
        },
      }],
    }, { copySideToAllEntrances: true, publish: true });

    const map = result.config.maps[0]!;
    expect(map.published).toBe(true);
    expect(map.entrances.map((entrance) => entrance.type)).toEqual(['side', 'front', 'upstairs']);
    expect(map.entrances.every((entrance) => entrance.direction === 'left')).toBe(true);
    expect(map.entrances.every((entrance) => entrance.image?.key === 'maps/entry/a.webp')).toBe(true);
    expect(map.entrances.every((entrance) => entrance.thumb?.key === 'maps/entry-thumb/b.webp')).toBe(true);
  });
});
