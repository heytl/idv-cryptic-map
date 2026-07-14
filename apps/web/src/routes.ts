import type { RouteRecordRaw } from 'vue-router';
import CatalogView from './views/CatalogView.vue';
import StrategyView from './views/StrategyView.vue';
import { DIRECTIONS, findMapByName } from './data/maps';

// Hash 路由，与旧站格式逐字符兼容：
//   #/            目录页
//   #/dir/左      目录页 + 方向筛选
//   #/map/左-Y门/1 攻略页 + 楼层（全图时省略第三段）
// 旧分享链接中的地图名可能带“（新）”展示后缀，findMapByName 两种名字都认
export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'catalog', component: CatalogView },
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
