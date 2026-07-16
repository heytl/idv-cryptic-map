import './styles/fonts.css';
import './styles/main.css';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { initMaps } from './data/maps';

// 挂载前拉取线上地图配置（失败自动回退打包数据），保证路由守卫与视图拿到的是最终数据
initMaps().finally(() => {
  createApp(App).use(router).mount('#app');
});
