/** Shared by the Worker, Vite/Workbox and the standalone backup CLI. */
export const IMAGE_KINDS = Object.freeze({
  full: 'layout/full', floor: 'layout/floor',
  entrance: 'entrance', entranceThumb: 'entrance-thumb',
});
export const CONTENT_ASSET_PATTERN = /^maps\/(?!.*\.\.)(?:layout\/floor\/[a-f0-9]{64}|(?:entry|entry-thumb|full|floor1|floor2|entrance|entrance-thumb|layout\/(?:full|basement|floor1|floor2))\/[^/\\?#%\s]+)\.webp$/;
/** generateSW serializes a RegExp; it cannot capture imported callback helpers. */
export const CONTENT_IMAGE_URL_PATTERN = new RegExp('/' + CONTENT_ASSET_PATTERN.source.slice(1));
export function isContentAssetKey(key) {
  return typeof key === 'string' && !key.includes('..') && CONTENT_ASSET_PATTERN.test(key);
}
const ROLE_PREFIXES = Object.freeze({
  full: ['maps/layout/full/', 'maps/full/'],
  floor: ['maps/layout/floor/', 'maps/layout/basement/', 'maps/layout/floor1/', 'maps/layout/floor2/', 'maps/floor1/', 'maps/floor2/'],
  entrance: ['maps/entrance/', 'maps/entry/'],
  thumb: ['maps/entrance-thumb/', 'maps/entry-thumb/'],
});
export function isContentAssetForRole(key, role) {
  return isContentAssetKey(key) && ROLE_PREFIXES[role]?.some(prefix => key.startsWith(prefix)) === true;
}
export function isContentImageUrl(value) {
  try { const path = new URL(value, 'https://media.invalid').pathname; const start = path.indexOf('/maps/'); return start >= 0 && isContentAssetKey(path.slice(start + 1)); }
  catch { return false; }
}
