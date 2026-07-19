// Naive UI 主题定制与响应式断点（保持原后台的暗色金调）
import type { GlobalThemeOverrides } from 'naive-ui';
import { ref, type Ref } from 'vue';

export const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#d9a441',
    primaryColorHover: '#e3b55e',
    primaryColorPressed: '#c1902f',
    primaryColorSuppl: '#d9a441',
    bodyColor: '#16181d',
    cardColor: '#1e2128',
    modalColor: '#1e2128',
    popoverColor: '#262a33',
  },
};

const mq = window.matchMedia('(max-width: 719px)');
const narrow = ref(mq.matches);
mq.addEventListener('change', (e) => (narrow.value = e.matches));

/** 窄屏（手机竖屏 <720px）：表格换卡片、表单收成单列；iPad 按桌面布局 */
export function useIsNarrow(): Ref<boolean> {
  return narrow;
}
