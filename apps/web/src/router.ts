import { createRouter, createWebHashHistory } from 'vue-router';
import { normalizeV2Route, routes } from './routes';

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    return { top: 0, left: 0 };
  },
});

router.beforeEach(normalizeV2Route);
