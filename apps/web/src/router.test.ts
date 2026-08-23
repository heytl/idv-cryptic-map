import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { mapsV2 } from './data/maps-v2';
import { normalizeV2Route, routes } from './routes';

// 旧站分享链接兼容是硬约束：旧 /map、/dir、/legacy 与 /v2 地址都必须转到规范地址。
function makeRouter() {
  const router = createRouter({ history: createMemoryHistory(), routes });
  router.beforeEach(normalizeV2Route);
  return router;
}

afterEach(() => mapsV2.splice(0, mapsV2.length));

describe('路由与旧链接兼容', () => {
  it('#/ 默认进入 V2 困难侧门目录', async () => {
    const r = makeRouter();
    await r.push('/');
    expect(r.currentRoute.value.path).toBe('/hard/side');
    expect(r.currentRoute.value.name).toBe('catalog-v2');
  });

  it('#/v1 是 V1 目录的规范回退入口', async () => {
    const r = makeRouter();
    await r.push('/v1');
    expect(r.currentRoute.value.name).toBe('catalog-v1');
  });

  it('#/legacy 自动切换到规范 V1 目录', async () => {
    const r = makeRouter();
    await r.push('/legacy');
    expect(r.currentRoute.value.path).toBe('/v1');
  });

  it('旧 #/map/左-Y门 自动切换到 V1 攻略页', async () => {
    const r = makeRouter();
    await r.push('/map/左-Y门');
    expect(decodeURI(r.currentRoute.value.path)).toBe('/v1/map/左-Y门');
    expect(r.currentRoute.value.name).toBe('map');
    expect(r.currentRoute.value.params.name).toBe('左-Y门');
  });

  it('旧 V1 地图链接切换规范地址时保留楼层段', async () => {
    const r = makeRouter();
    await r.push('/map/左-Y门/2');
    expect(decodeURI(r.currentRoute.value.path)).toBe('/v1/map/左-Y门/2');
    expect(r.currentRoute.value.params.floor).toBe('2');
  });

  it('旧链接带“（新）”展示名后缀仍可直达', async () => {
    const r = makeRouter();
    await r.push('/map/左-Y青蛙房（新）');
    expect(r.currentRoute.value.name).toBe('map');
  });

  it('URL 编码的中文地图名可直达', async () => {
    const r = makeRouter();
    await r.push(`/map/${encodeURIComponent('南-orz门')}/1`);
    expect(r.currentRoute.value.name).toBe('map');
    expect(r.currentRoute.value.params.name).toBe('南-orz门');
  });

  it('未知地图名兜底回目录', async () => {
    const r = makeRouter();
    await r.push('/map/不存在的门/1');
    expect(r.currentRoute.value.path).toBe('/v1');
  });

  it('旧 #/dir/北 自动切换到 V1 方向筛选', async () => {
    const r = makeRouter();
    await r.push('/dir/北');
    expect(decodeURI(r.currentRoute.value.path)).toBe('/v1/dir/北');
    expect(r.currentRoute.value.name).toBe('catalog-dir');
  });

  it('直达非法方向回目录（同记录参数变化的兜底在 CatalogView 组件内处理）', async () => {
    const r = makeRouter();
    await r.push('/dir/东');
    expect(r.currentRoute.value.path).toBe('/v1');
  });

  it('任意未知路径兜底回目录', async () => {
    const r = makeRouter();
    await r.push('/whatever/xx');
    expect(r.currentRoute.value.path).toBe('/hard/side');
  });

  it('V2 地图无楼层段时默认表示全图', async () => {
    mapsV2.push({
      id: 101,
      mode: 'nightmare',
      name: 'nightmare-y',
      displayName: 'Y门',
      remarks: '',
      sort: 10,
      legacyNames: [],
      layout: {
        full: { url: 'https://map.example/full.webp' },
        basement: { url: 'https://map.example/basement.webp' },
        floor1: { url: 'https://map.example/floor1.webp' },
        floor2: { url: 'https://map.example/floor2.webp' },
      },
      entrances: [
        {
          id: '101-front',
          type: 'front',
          typeLabel: '正门',
          direction: 'north',
          directionLabel: '北',
          imageUrl: 'https://map.example/front.webp',
          thumbUrl: 'https://map.example/front-thumb.webp',
        },
      ],
    });
    const r = makeRouter();
    await r.push('/nightmare/front/map/101');
    expect(r.currentRoute.value.name).toBe('map-v2');
    expect(r.currentRoute.value.params.floor).toBe('');
  });

  it('V2 噩梦地下室路由正常保留', async () => {
    mapsV2.push({
      id: 101,
      mode: 'nightmare',
      name: 'nightmare-y',
      displayName: 'Y门',
      remarks: '',
      sort: 10,
      legacyNames: [],
      layout: { full: { url: 'full' }, basement: { url: 'basement' } },
      entrances: [{ id: '101-upstairs', type: 'upstairs', typeLabel: '二楼门', direction: 'left', directionLabel: '左', imageUrl: 'image', thumbUrl: 'thumb' }],
    });
    const r = makeRouter();
    await r.push('/nightmare/upstairs/map/101/basement');
    expect(r.currentRoute.value.params.floor).toBe('basement');
  });

  it('V2 困难正门目录链接自动回到侧门并保留方向', async () => {
    const r = makeRouter();
    await r.push('/hard/front/north');
    expect(r.currentRoute.value.path).toBe('/hard/side/north');
  });

  it('V2 同一目录页切换到已停用入口时仍自动回到侧门', async () => {
    const r = makeRouter();
    await r.push('/nightmare/front');
    await r.push('/hard/front/north');
    expect(r.currentRoute.value.path).toBe('/hard/side/north');
  });

  it('V2 噩梦正门使用通道作为第三级筛选', async () => {
    const r = makeRouter();
    await r.push('/nightmare/front/upperLeft');
    expect(r.currentRoute.value.path).toBe('/nightmare/front/upperLeft');
    expect(r.currentRoute.value.params.filter).toBe('upperLeft');
  });

  it('V2 噩梦正门旧方向筛选自动回到全部通道', async () => {
    const r = makeRouter();
    await r.push('/nightmare/front/south');
    expect(r.currentRoute.value.path).toBe('/nightmare/front');
  });

  it('V2 困难二楼门详情链接自动切换为同地图侧门', async () => {
    mapsV2.push({
      id: 102,
      mode: 'hard',
      name: 'hard-y',
      displayName: '困难Y门',
      remarks: '',
      sort: 10,
      legacyNames: [],
      layout: { full: { url: 'full' }, floor1: { url: 'floor1' }, floor2: { url: 'floor2' } },
      entrances: [
        { id: '102-side', type: 'side', typeLabel: '侧门', direction: 'left', directionLabel: '左', imageUrl: 'side', thumbUrl: 'side-thumb' },
        { id: '102-upstairs', type: 'upstairs', typeLabel: '二楼门', direction: 'left', directionLabel: '左', imageUrl: 'upstairs', thumbUrl: 'upstairs-thumb' },
      ],
    });
    const r = makeRouter();
    await r.push('/hard/upstairs/map/102/floor2');
    expect(r.currentRoute.value.path).toBe('/hard/side/map/102/floor2');
  });

  it('旧 V2 目录链接自动移除 /v2 前缀', async () => {
    const r = makeRouter();
    await r.push('/v2/nightmare/front/upperLeft');
    expect(r.currentRoute.value.path).toBe('/nightmare/front/upperLeft');
  });
});
