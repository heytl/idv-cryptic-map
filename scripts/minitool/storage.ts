// Two optional preferences; platform Storage is the primary persistence layer.
const keys = ['idv-catalog-conditions', 'idv-catalog-compact'];
const memory = new Map<string, string>();
const dirty = new Set<string>();
const ready: (() => void)[] = [];
let platform: any;
let legacy = false;
export const preferenceStorage = {
  getItem(key: string) { return memory.get(key) ?? null; },
  setItem(key: string, value: string) {
    dirty.add(key);
    memory.set(key, value);
    if (platform) void platform.setStorage({ key, data: JSON.stringify(value) }).catch(() => {});
    else if (legacy) { try { localStorage.setItem(key, value); } catch { /* Session only. */ } }
  },
};
export function onPreferencesReady(callback: () => void) { ready.push(callback); }
export async function warmPreferences() {
  const xhs = (window as any).xhs;
  const api = xhs?.miniTool;
  let options = xhs?.launchOptions;
  try {
    if (!options && typeof api?.getLaunchOptions === 'function') options = await api.getLaunchOptions();
    const supported = Math.floor(Number(options?.miniToolEnv?.buildVersion || 0) / 1000) >= 9460;
    if (supported && typeof api?.getStorage === 'function' && typeof api?.setStorage === 'function') {
      platform = api;
      await Promise.all(keys.map(async key => {
        try {
          const result = await api.getStorage({ key });
          const value = JSON.parse(result.data);
          if (typeof value === 'string' && !dirty.has(key)) memory.set(key, value);
        } catch { /* Missing or unavailable preferences never block the handbook. */ }
      }));
    } else {
      legacy = true;
      for (const key of keys) {
        try { const value = localStorage.getItem(key); if (value !== null) memory.set(key, value); } catch { /* Optional. */ }
      }
    }
  } catch { /* Keep the current session when capability discovery fails. */ }
  ready.forEach(callback => callback());
}
