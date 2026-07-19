// 「下载离线包」：把当前数据引用的全部地图图片逐张 fetch 一遍。
// 请求会穿过 Service Worker 的 CacheFirst 运行时规则自动落缓存（见 vite.config.ts
// workbox.runtimeCaching），无需自建缓存；URL 带内容哈希，已缓存的图秒过，
// 数据更新后重跑只会增量补新图。
import { ref } from 'vue';
import { maps } from '../data/maps';

type Phase = 'idle' | 'running' | 'done' | 'error';

const CONCURRENCY = 4;

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
  return [...urls];
}

async function warm(): Promise<void> {
  if (phase.value === 'running') return;
  error.value = '';

  // SW 必须已接管页面：否则图片只进 HTTP 缓存，断网后拿不到
  if (!('serviceWorker' in navigator)) {
    phase.value = 'error';
    error.value = '当前浏览器不支持离线缓存';
    return;
  }
  await navigator.serviceWorker.ready.catch(() => undefined);
  if (!navigator.serviceWorker.controller) {
    phase.value = 'error';
    error.value = '离线组件尚未就绪，请刷新页面后再试';
    return;
  }
  // 申请持久存储，降低系统自动清缓存的概率（被拒也不影响功能）
  void navigator.storage?.persist?.().catch(() => undefined);

  const urls = allImageUrls();
  total.value = urls.length;
  done.value = 0;
  failed.value = 0;
  phase.value = 'running';

  let i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const url = urls[i++];
      try {
        const res = await fetch(url);
        if (!res.ok) failed.value += 1;
        else await res.blob(); // 读完 body，确保连接及时释放
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
  } else {
    phase.value = 'done';
  }
}

export function useOfflineCache() {
  return { phase, done, total, failed, error, warm };
}
