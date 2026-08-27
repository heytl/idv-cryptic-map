import {
  toPublicMapConfigV2,
  validateMapConfigV2,
  type MapConfigV2,
  type MapItemV2,
} from '../packages/shared/src/map-v2';
import { BACKUP_KEEP, jsonError, jsonResponse, type Env } from './types';

export const CONFIG_V2_KEY = 'config:v2:current';
/** 必须位于 V1 `backups/` 之外，否则旧后台会把 V2 备份误列为 V1。 */
export const BACKUP_V2_PREFIX = 'backups-v2/';

const PUBLIC_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'If-None-Match, Content-Type',
  'Access-Control-Max-Age': '86400',
};

const V2_IMAGE_DIRS = {
  full: 'layout/full',
  basement: 'layout/basement',
  floor1: 'layout/floor1',
  floor2: 'layout/floor2',
  entrance: 'entrance',
  entranceThumb: 'entrance-thumb',
} as const;
type V2ImageKind = keyof typeof V2_IMAGE_DIRS;

function isV2ImageKind(value: string): value is V2ImageKind {
  return Object.prototype.hasOwnProperty.call(V2_IMAGE_DIRS, value);
}

function mediaBaseUrl(request: Request, env: Env): string {
  const configured = env.IMG_BASE_URL ?? '/r2';
  return new URL(configured.endsWith('/') ? configured : `${configured}/`, request.url).toString().replace(/\/$/, '');
}

function publicError(status: number, error: string): Response {
  return jsonResponse({ error }, status, PUBLIC_HEADERS);
}

export async function handlePublicMapsV2(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: PUBLIC_HEADERS });
  if (request.method !== 'GET' && request.method !== 'HEAD') return publicError(405, 'method_not_allowed');
  if (!env.CONFIG) return publicError(503, 'storage_not_configured');

  const config = await env.CONFIG.get<MapConfigV2>(CONFIG_V2_KEY, 'json');
  if (!config) return publicError(404, 'v2_not_ready');
  const validation = validateMapConfigV2(config);
  if (!validation.valid) return publicError(503, 'v2_config_invalid');

  const etag = `"maps-v2-${config.version}"`;
  const headers = {
    ...PUBLIC_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache, must-revalidate',
    ETag: etag,
  };
  if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers });
  if (request.method === 'HEAD') return new Response(null, { headers });

  const publicConfig = toPublicMapConfigV2(config, mediaBaseUrl(request, env));
  return new Response(JSON.stringify(publicConfig), { headers });
}

function requireV2Bindings(env: Env): Response | null {
  if (!env.CONFIG || !env.MEDIA) return jsonError(503, 'storage_not_configured', 'V2 需要 CONFIG 与 MEDIA 绑定');
  return null;
}

export async function handleAdminApiV2(request: Request, env: Env): Promise<Response> {
  const notReady = requireV2Bindings(env);
  if (notReady) return notReady;

  const { pathname } = new URL(request.url);
  if (pathname === '/api/admin/v2/maps' && request.method === 'GET') return getMapsV2(env);
  if (pathname === '/api/admin/v2/maps' && request.method === 'PUT') return putMapsV2(request, env);
  if (pathname === '/api/admin/v2/images' && request.method === 'POST') return postImageV2(request, env);
  if (pathname === '/api/admin/v2/backups' && request.method === 'GET') return listBackupsV2(env);
  if (pathname === '/api/admin/v2/preview' && request.method === 'GET') return previewBackupV2(request, env);
  if (pathname === '/api/admin/v2/restore' && request.method === 'POST') return restoreBackupV2(request, env);
  return jsonError(404, 'not_found');
}

async function getMapsV2(env: Env): Promise<Response> {
  const config = await env.CONFIG!.get<MapConfigV2>(CONFIG_V2_KEY, 'json');
  return jsonResponse(config ?? { schemaVersion: 2, version: 0, updatedAt: '', maps: [] });
}

async function putMapsV2(request: Request, env: Env): Promise<Response> {
  let body: { baseVersion?: number; maps?: MapItemV2[] };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'bad_json');
  }

  const current = await env.CONFIG!.get<MapConfigV2>(CONFIG_V2_KEY, 'json');
  const currentVersion = current?.version ?? 0;
  if (body.baseVersion !== currentVersion) {
    return jsonError(409, 'version_conflict', `当前 V2 版本 ${currentVersion}，你基于 ${body.baseVersion} 编辑`);
  }

  const next: MapConfigV2 = {
    schemaVersion: 2,
    version: currentVersion + 1,
    updatedAt: new Date().toISOString().slice(0, 10),
    maps: body.maps ?? [],
  };
  const validation = validateMapConfigV2(next);
  if (!validation.valid) return jsonError(400, 'invalid_maps_v2', validation.errors.join('\n'));

  if (current) await writeBackupV2(env, current);
  await env.CONFIG!.put(CONFIG_V2_KEY, JSON.stringify(next));
  return jsonResponse({ version: next.version, updatedAt: next.updatedAt });
}

const WEBP_MAGIC = { riff: [0x52, 0x49, 0x46, 0x46], webp: [0x57, 0x45, 0x42, 0x50] };

function isWebp(bytes: Uint8Array): boolean {
  return bytes.length >= 12 &&
    WEBP_MAGIC.riff.every((byte, index) => bytes[index] === byte) &&
    WEBP_MAGIC.webp.every((byte, index) => bytes[8 + index] === byte);
}

async function sha256Hex8(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 8);
}

async function postImageV2(request: Request, env: Env): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, 'bad_form', '需要 multipart/form-data');
  }

  const kindValue = form.get('kind')?.toString() ?? '';
  if (!isV2ImageKind(kindValue)) return jsonError(400, 'invalid_kind');
  const file = form.get('file');
  if (!(file instanceof File)) return jsonError(400, 'no_file');
  const buffer = await file.arrayBuffer();
  if (!isWebp(new Uint8Array(buffer))) return jsonError(400, 'not_webp');

  const key = `maps/${V2_IMAGE_DIRS[kindValue]}/${await sha256Hex8(buffer)}.webp`;
  await env.MEDIA!.put(key, buffer, {
    httpMetadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' },
  });

  return jsonResponse({
    asset: { key },
    url: `${mediaBaseUrl(request, env)}/${key}`,
  });
}

async function pruneBackupsV2(env: Env): Promise<void> {
  const list = await env.MEDIA!.list({ prefix: BACKUP_V2_PREFIX, limit: 1000 });
  const excess = list.objects
    .sort((a, b) => a.uploaded.getTime() - b.uploaded.getTime())
    .slice(0, Math.max(0, list.objects.length - BACKUP_KEEP))
    .map((object) => object.key);
  if (excess.length > 0) await env.MEDIA!.delete(excess);
}

async function writeBackupV2(env: Env, config: MapConfigV2): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await env.MEDIA!.put(`${BACKUP_V2_PREFIX}${stamp}-v${config.version}.json`, JSON.stringify(config), {
    httpMetadata: { contentType: 'application/json' },
  });
  await pruneBackupsV2(env);
}

/**
 * 每日任务使用固定版本键留档。同一 dataVersion 只写一次，避免地图未变化时
 * 每天制造重复 R2 对象；后台正常保存仍由 writeBackupV2 保留修改前版本。
 */
export async function ensureVersionBackupV2(env: Env, config: MapConfigV2): Promise<string> {
  const key = `${BACKUP_V2_PREFIX}snapshot-v${config.version}.json`;
  if (await env.MEDIA!.head(key)) return key;
  await env.MEDIA!.put(key, JSON.stringify(config), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { schemaVersion: '2', dataVersion: String(config.version), source: 'scheduled-snapshot' },
  });
  await pruneBackupsV2(env);
  return key;
}

async function listBackupsV2(env: Env): Promise<Response> {
  const list = await env.MEDIA!.list({ prefix: BACKUP_V2_PREFIX, limit: 1000 });
  const backups = list.objects
    .map((object) => ({ key: object.key, size: object.size, uploaded: object.uploaded }))
    .sort((a, b) => (a.key < b.key ? 1 : -1));
  return jsonResponse({ backups });
}

async function readBackupV2(key: string, env: Env): Promise<MapConfigV2 | Response> {
  if (!key.startsWith(BACKUP_V2_PREFIX)) return jsonError(400, 'bad_key');
  const object = await env.MEDIA!.get(key);
  if (!object) return jsonError(404, 'backup_not_found');
  const config = (await object.json()) as MapConfigV2;
  const validation = validateMapConfigV2(config);
  return validation.valid ? config : jsonError(400, 'invalid_backup_v2', validation.errors.join('\n'));
}

async function previewBackupV2(request: Request, env: Env): Promise<Response> {
  const key = new URL(request.url).searchParams.get('key') ?? '';
  const result = await readBackupV2(key, env);
  if (result instanceof Response) return result;
  return jsonResponse(toPublicMapConfigV2(result, mediaBaseUrl(request, env)), 200, { 'Cache-Control': 'no-store' });
}

async function restoreBackupV2(request: Request, env: Env): Promise<Response> {
  let body: { key?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'bad_json');
  }
  const result = await readBackupV2(body.key ?? '', env);
  if (result instanceof Response) return result;

  const current = await env.CONFIG!.get<MapConfigV2>(CONFIG_V2_KEY, 'json');
  if (current) await writeBackupV2(env, current);
  const next: MapConfigV2 = {
    ...result,
    version: (current?.version ?? 0) + 1,
  };
  await env.CONFIG!.put(CONFIG_V2_KEY, JSON.stringify(next));
  return jsonResponse({ version: next.version, restoredFrom: body.key });
}
