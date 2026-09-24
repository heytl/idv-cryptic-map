// Naive UI 主题与布局断点统一收口，后台沿用暗色并改为清晰的蓝灰工作区。
import type { GlobalThemeOverrides } from 'naive-ui';
import { ref, type Ref } from 'vue';

export const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#6b8cff',
    primaryColorHover: '#86a0ff',
    primaryColorPressed: '#5274e6',
    primaryColorSuppl: '#6b8cff',
    bodyColor: '#101722',
    cardColor: '#182232',
    modalColor: '#182232',
    popoverColor: '#202d41',
    textColorBase: '#eaf0fa',
    textColor1: '#eaf0fa',
    textColor2: '#b7c3d6',
    textColor3: '#91a0b5',
    textColorDisabled: '#69778d',
    borderColor: '#2d3a4f',
    dividerColor: '#2a374b',
    inputColor: '#121c2b',
    actionColor: '#202c3e',
    tableColor: '#182232',
    tableHeaderColor: '#202d41',
    hoverColor: '#202d41',
  },
};

const mq = window.matchMedia('(max-width: 719px)');
const narrow = ref(mq.matches);
mq.addEventListener('change', (e) => (narrow.value = e.matches));

/** 窄屏（手机竖屏 <720px）：表格换卡片、表单收成单列；iPad 按桌面布局 */
export function useIsNarrow(): Ref<boolean> {
  return narrow;
}
