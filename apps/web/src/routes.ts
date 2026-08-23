import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router';
import CatalogView from './views/CatalogView.vue';
import CatalogV2View from './views/CatalogV2View.vue';
import StrategyView from './views/StrategyView.vue';
import StrategyV2View from './views/StrategyV2View.vue';
import { DIRECTIONS, findMapByName } from './data/maps';
import { FLOOR_ORDER } from '@idv-map/shared';
import {
  defaultEntranceV2,
  ensureMapsV2,
  findEntranceV2,
  findMapV2,
  isCatalogFilterV2,
  isEnabledEntranceV2,
  isEntranceType,
  isGameMode,
} from './data/maps-v2';

async function prepareV2Catalog(to: RouteLocationNormalized) {
  await ensureMapsV2();
  const mode = to.params.mode;
  const entrance = to.params.entrance;
  const filter = to.params.filter;
  if (!isGameMode(mode) || !isEntranceType(entrance)) return { path: '/', replace: true };
  if (!isEnabledEntranceV2(mode, entrance)) {
    const enabledEntrance = defaultEntranceV2(mode);
    const validFilter = filter && isCatalogFilterV2(enabledEntrance, filter);
    return {
      path: `/${mode}/${enabledEntrance}${validFilter ? `/${filter as string}` : ''}`,
      replace: true,
    };
  }
  if (filter && !isCatalogFilterV2(entrance, filter)) {
    return { path: `/${mode}/${entrance}`, replace: true };
  }
  return true;
}

async function prepareV2Map(to: RouteLocationNormalized) {
  await ensureMapsV2();
  const mode = to.params.mode;
  const entranceType = to.params.entrance;
  const id = Number(to.params.id);
  if (!isGameMode(mode) || !isEntranceType(entranceType) || !Number.isInteger(id)) {
    return { path: '/', replace: true };
  }
  if (!isEnabledEntranceV2(mode, entranceType)) {
    const enabledEntrance = defaultEntranceV2(mode);
    const map = findMapV2(id, mode);
    const floor = to.params.floor;
    const validFloor = floor && (FLOOR_ORDER as readonly string[]).includes(floor as string);
    if (map && findEntranceV2(map, enabledEntrance)) {
      return {
        path: `/${mode}/${enabledEntrance}/map/${id}${validFloor ? `/${floor as string}` : ''}`,
        replace: true,
      };
    }
    return { path: `/${mode}/${enabledEntrance}`, replace: true };
  }
  const map = findMapV2(id, mode);
  if (!map || !findEntranceV2(map, entranceType)) return { path: `/${mode}/${entranceType}`, replace: true };
  const floor = to.params.floor;
  if (floor && !(FLOOR_ORDER as readonly string[]).includes(floor as string)) {
    return { path: `/${mode}/${entranceType}/map/${id}`, replace: true };
  }
  return true;
}

/**
 * V2 参数变化也必须重新校验。vue-router 的 beforeEnter 在同一路由记录只改参数时
 * 不会再次执行，因此由 router.beforeEach 统一调用这里。
 */
export async function normalizeV2Route(to: RouteLocationNormalized) {
  if (to.name === 'catalog-v2') return prepareV2Catalog(to);
  if (to.name === 'map-v2') return prepareV2Map(to);
  return true;
}

// Hash 路由：正式版不带版本号，旧版统一放在 /v1；历史 V1/V2 地址自动转到规范地址。
//   #/hard/side                         正式困难侧门目录
//   #/nightmare/front/upperLeft         正式噩梦正门 + 通道筛选
//   #/v1                                V1 目录（观察期回退入口）
//   #/v1/dir/左                         V1 方向筛选
//   #/v1/map/左-Y门/1                   V1 攻略页 + 楼层
// 旧分享链接中的地图名可能带“（新）”展示后缀，findMapByName 两种名字都认。
export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/hard/side' },
  { path: '/v1', name: 'catalog-v1', component: CatalogView },
  {
    path: '/:mode(hard|nightmare)/:entrance(side|front|upstairs)/map/:id/:floor?',
    name: 'map-v2',
    component: StrategyV2View,
  },
  {
    path: '/:mode(hard|nightmare)/:entrance(side|front|upstairs)/:filter?',
    name: 'catalog-v2',
    component: CatalogV2View,
  },
  {
    path: '/v1/dir/:direction',
    name: 'catalog-dir',
    component: CatalogView,
    beforeEnter: (to) =>
      (DIRECTIONS as readonly string[]).includes(to.params.direction as string)
        ? true
        : { path: '/v1', replace: true },
  },
  {
    path: '/v1/map/:name/:floor?',
    name: 'map',
    component: StrategyView,
    beforeEnter: (to) =>
      findMapByName(to.params.name as string)
        ? true
        : { path: '/v1', replace: true },
  },
  // 旧 V2 地址：去掉已经成为默认版本的 /v2 前缀。
  { path: '/v2', redirect: '/hard/side' },
  {
    path: '/v2/:mode/:entrance/map/:id/:floor?',
    redirect: (to) => ({ name: 'map-v2', params: to.params }),
  },
  {
    path: '/v2/:mode/:entrance/:filter?',
    redirect: (to) => ({ name: 'catalog-v2', params: to.params }),
  },
  // 旧 V1 地址：统一补上 /v1，浏览器历史只保留规范地址。
  { path: '/legacy', redirect: '/v1' },
  { path: '/dir/:direction', redirect: (to) => ({ name: 'catalog-dir', params: to.params }) },
  { path: '/map/:name/:floor?', redirect: (to) => ({ name: 'map', params: to.params }) },
  // 未知路径兜底回正式目录。
  { path: '/:pathMatch(.*)*', redirect: '/' },
];
