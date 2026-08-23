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
  if (!isGameMode(mode) || !isEntranceType(entrance)) return { path: '/v2', replace: true };
  if (!isEnabledEntranceV2(mode, entrance)) {
    const enabledEntrance = defaultEntranceV2(mode);
    const validFilter = filter && isCatalogFilterV2(enabledEntrance, filter);
    return {
      path: `/v2/${mode}/${enabledEntrance}${validFilter ? `/${filter as string}` : ''}`,
      replace: true,
    };
  }
  if (filter && !isCatalogFilterV2(entrance, filter)) {
    return { path: `/v2/${mode}/${entrance}`, replace: true };
  }
  return true;
}

async function prepareV2Map(to: RouteLocationNormalized) {
  await ensureMapsV2();
  const mode = to.params.mode;
  const entranceType = to.params.entrance;
  const id = Number(to.params.id);
  if (!isGameMode(mode) || !isEntranceType(entranceType) || !Number.isInteger(id)) {
    return { path: '/v2', replace: true };
  }
  if (!isEnabledEntranceV2(mode, entranceType)) {
    const enabledEntrance = defaultEntranceV2(mode);
    const map = findMapV2(id, mode);
    const floor = to.params.floor;
    const validFloor = floor && (FLOOR_ORDER as readonly string[]).includes(floor as string);
    if (map && findEntranceV2(map, enabledEntrance)) {
      return {
        path: `/v2/${mode}/${enabledEntrance}/map/${id}${validFloor ? `/${floor as string}` : ''}`,
        replace: true,
      };
    }
    return { path: `/v2/${mode}/${enabledEntrance}`, replace: true };
  }
  const map = findMapV2(id, mode);
  if (!map || !findEntranceV2(map, entranceType)) return { path: `/v2/${mode}/${entranceType}`, replace: true };
  const floor = to.params.floor;
  if (floor && !(FLOOR_ORDER as readonly string[]).includes(floor as string)) {
    return { path: `/v2/${mode}/${entranceType}/map/${id}`, replace: true };
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

// Hash 路由，与旧站格式逐字符兼容：
//   #/            目录页
//   #/dir/左      目录页 + 方向筛选
//   #/map/左-Y门/1 攻略页 + 楼层（全图时省略第三段）
// 旧分享链接中的地图名可能带“（新）”展示后缀，findMapByName 两种名字都认
export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'catalog', component: CatalogView },
  { path: '/v2', redirect: '/v2/hard/side' },
  {
    path: '/v2/:mode/:entrance/:filter?',
    name: 'catalog-v2',
    component: CatalogV2View,
  },
  {
    path: '/v2/:mode/:entrance/map/:id/:floor?',
    name: 'map-v2',
    component: StrategyV2View,
  },
  {
    path: '/dir/:direction',
    name: 'catalog-dir',
    component: CatalogView,
    beforeEnter: (to) =>
      (DIRECTIONS as readonly string[]).includes(to.params.direction as string)
        ? true
        : { path: '/', replace: true },
  },
  {
    path: '/map/:name/:floor?',
    name: 'map',
    component: StrategyView,
    beforeEnter: (to) =>
      findMapByName(to.params.name as string) ? true : { path: '/', replace: true },
  },
  // 未知路径兜底回目录（与旧站 applyRoute 行为一致）
  { path: '/:pathMatch(.*)*', redirect: '/' },
];
