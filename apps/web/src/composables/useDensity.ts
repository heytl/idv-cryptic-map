import { ref, watch } from 'vue';

// 紧凑视图偏好的 localStorage 键（设备个人偏好，不进路由 hash），沿用旧站键名
const DENSITY_STORAGE_KEY = 'idv-catalog-compact';

function readPref(): boolean {
  try {
    return localStorage.getItem(DENSITY_STORAGE_KEY) === '1';
  } catch {
    // 部分隐私模式下 localStorage 不可用，按默认标准视图处理
    return false;
  }
}

const compact = ref(readPref());

watch(compact, (v) => {
  try {
    localStorage.setItem(DENSITY_STORAGE_KEY, v ? '1' : '0');
  } catch {
    // 写入失败仅本次会话生效
  }
});

export function useDensity() {
  return { compact };
}
