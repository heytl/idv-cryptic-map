import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { routes } from './routes';

// 旧站分享链接兼容是硬约束：hash 段格式为 /map/<名>/<楼层?> 与 /dir/<方向>
function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes });
}

describe('路由与旧链接兼容', () => {
  it('#/map/左-Y门 直达攻略页', async () => {
    const r = makeRouter();
    await r.push('/map/左-Y门');
    expect(r.currentRoute.value.name).toBe('map');
    expect(r.currentRoute.value.params.name).toBe('左-Y门');
  });

  it('#/map/左-Y门/2 楼层段保留', async () => {
    const r = makeRouter();
    await r.push('/map/左-Y门/2');
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
    expect(r.currentRoute.value.path).toBe('/');
  });

  it('#/dir/北 目录筛选正常进入', async () => {
    const r = makeRouter();
    await r.push('/dir/北');
    expect(r.currentRoute.value.name).toBe('catalog-dir');
  });

  it('直达非法方向回目录（同记录参数变化的兜底在 CatalogView 组件内处理）', async () => {
    const r = makeRouter();
    await r.push('/dir/东');
    expect(r.currentRoute.value.path).toBe('/');
  });

  it('任意未知路径兜底回目录', async () => {
    const r = makeRouter();
    await r.push('/whatever/xx');
    expect(r.currentRoute.value.path).toBe('/');
  });
});
