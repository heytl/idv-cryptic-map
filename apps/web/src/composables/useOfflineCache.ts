// 「下载离线包」：把当前数据引用的全部地图图片逐张 fetch 一遍。
// 兼容逻辑：双重保底（CacheStorage + 浏览器原生 HTTP 磁盘缓存）；
// 移除了局域网 HTTP 下的硬阻断，即使在手机 192.168.x.x 局域网调试下也可正常触发预热并显示进度。
import { ref } from 'vue';
import { maps } from '../data/maps';
import { mapsV2, mapsV2Version } from '../data/maps-v2';

type Phase = 'idle' | 'running' | 'done' | 'error';

const CONCURRENCY = 3; // 移动端稍微调低并发，避免弱网超时
const LEGACY_STORAGE_KEY = 'idv_map_offline_cached_ready';
const V2_STORAGE_PREFIX = 'idv_map_offline_cached_v2_';

function storageKey(): string {
  return mapsV2Version.value > 0 ? `${V2_STORAGE_PREFIX}${mapsV2Version.value}` : LEGACY_STORAGE_KEY;
}

const phase = ref<Phase>('idle');
const done = ref(0);
const total = ref(0);
const failed = ref(0);
const error = ref('');

function allImageUrls(): string[] {
  const urls = new Set<string>();
  for (const m of maps) {
    for (const u of [m.entryImg, m.entryThumbImg, m.floor1Img, m.floor2Img, m.fullImg]) {
      if (u) urls.add(u);
    }
  }
  for (const map of mapsV2) {
    for (const asset of Object.values(map.layout)) {
      if (asset?.url) urls.add(asset.url);
    }
    for (const entrance of map.entrances) {
      urls.add(entrance.imageUrl);
      urls.add(entrance.thumbUrl);
    }
  }
  return [...urls];
}

// 模块加载时自动检查历史缓存标记
function checkSavedState() {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(storageKey()) === 'true') {
      phase.value = 'done';
      const urls = allImageUrls();
      done.value = urls.length;
      total.value = urls.length;
    }
  } catch {
    // 忽略 localStorage 异常
  }
}
checkSavedState();

async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 0) return res;
    } catch (e) {
      if (attempt === retries) throw e;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Network error');
}

async function warm(): Promise<void> {
  if (phase.value === 'running') return;
  error.value = '';

  // 尝试让 SW 就绪（非强阻塞）
  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.ready.catch(() => undefined);
  }

  // 申请持久存储
  void navigator.storage?.persist?.().catch(() => undefined);

  const urls = allImageUrls();
  total.value = urls.length;
  done.value = 0;
  failed.value = 0;
  phase.value = 'running'; // 立即重置为 running，手机界面实时显示“缓存中 0/N...”

  // 尝试打开 CacheStorage（如受浏览器安全限制无法使用则静默为 null，回退原生 HTTP 缓存）
  const imgCache = typeof window !== 'undefined' && 'caches' in window
    ? await caches.open('map-images').catch(() => null)
    : null;
  const r2Cache = typeof window !== 'undefined' && 'caches' in window
    ? await caches.open('map-images-r2').catch(() => null)
    : null;

  let i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const url = urls[i++];
      try {
        const res = await fetchWithRetry(url);
        if (res.ok || res.status === 0) {
          const targetCache = url.includes('/maps/') ? r2Cache : imgCache;
          if (targetCache) {
            await targetCache.put(url, res.clone()).catch(() => undefined);
          }
          await res.blob().catch(() => undefined); // 读完流释放连接
        } else {
          failed.value += 1;
        }
      } catch {
        failed.value += 1;
      }
      done.value += 1;
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (failed.value > 0) {
    phase.value = 'error';
    error.value = `${failed.value} 张图片下载失败，请检查网络后重试`;
    try { localStorage.removeItem(storageKey()); } catch {}
  } else {
    phase.value = 'done';
    try { localStorage.setItem(storageKey(), 'true'); } catch {}
  }
}

async function clear(): Promise<void> {
  if (phase.value === 'running') return;
  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      const keys = await caches.keys();
      for (const k of keys) {
        if (k.includes('map-images')) {
          await caches.delete(k);
        }
      }
    }
  } catch {
    // 忽略异常
  }
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith(V2_STORAGE_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // 忽略异常
  }
  done.value = 0;
  total.value = 0;
  failed.value = 0;
  error.value = '';
  phase.value = 'idle';
}

export function useOfflineCache() {
  return { phase, done, total, failed, error, warm, clear };
}
