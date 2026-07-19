// 后台管理 API（/api/*，均需通过 Access 鉴权）
import {
  BACKUP_KEEP,
  BACKUP_PREFIX,
  CONFIG_KEY,
  IMG_KINDS,
  KIND_DIR,
  jsonError,
  jsonResponse,
  toPublicConfig,
  validateMaps,
  type Env,
  type ImgKind,
  type StoredConfig,
  type StoredMap,
} from './types';

function requireBindings(env: Env): Response | null {
  if (!env.CONFIG || !env.MEDIA) {
    return jsonError(503, 'storage_not_configured', '请先完成 Phase 2.0：绑定 KV(CONFIG) 与 R2(MEDIA)');
  }
  return null;
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  const notReady = requireBindings(env);
  if (notReady) return notReady;

  if (pathname === '/api/maps' && request.method === 'GET') return getMaps(env);
  if (pathname === '/api/maps' && request.method === 'PUT') return putMaps(request, env);
  if (pathname === '/api/images' && request.method === 'POST') return postImages(request, env);
  if (pathname === '/api/backups' && request.method === 'GET') return listBackups(env);
  if (pathname === '/api/preview' && request.method === 'GET') return previewBackup(request, env);
  if (pathname === '/api/restore' && request.method === 'POST') return restoreBackup(request, env);
  return jsonError(404, 'not_found');
}

// ---- 配置读写 ----

async function getMaps(env: Env): Promise<Response> {
  const config = await env.CONFIG!.get<StoredConfig>(CONFIG_KEY, 'json');
  // KV 尚未灌数据：返回空骨架，后台界面据此引导执行迁移脚本
  return jsonResponse(config ?? { version: 0, updatedAt: '', maps: [] });
}

async function putMaps(request: Request, env: Env): Promise<Response> {
  let body: { baseVersion?: number; maps?: StoredMap[] };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'bad_json');
  }
  const invalid = validateMaps(body.maps);
  if (invalid) return jsonError(400, 'invalid_maps', invalid);

  const current = await env.CONFIG!.get<StoredConfig>(CONFIG_KEY, 'json');
  const currentVersion = current?.version ?? 0;
  if (body.baseVersion !== currentVersion) {
    // 乐观锁：另一个标签页/设备已保存过，拒绝覆盖
    return jsonError(409, 'version_conflict', `当前版本 ${currentVersion}，你基于 ${body.baseVersion} 编辑`);
  }

  if (current) await writeBackup(env, current);

  const next: StoredConfig = {
    version: currentVersion + 1,
    updatedAt: new Date().toISOString().slice(0, 10),
    maps: body.maps!,
  };
  await env.CONFIG!.put(CONFIG_KEY, JSON.stringify(next));
  return jsonResponse({ version: next.version, updatedAt: next.updatedAt });
}

// ---- 图片上传 ----

const WEBP_MAGIC = { riff: [0x52, 0x49, 0x46, 0x46], webp: [0x57, 0x45, 0x42, 0x50] };

function isWebp(bytes: Uint8Array): boolean {
  return (
    WEBP_MAGIC.riff.every((b, i) => bytes[i] === b) && WEBP_MAGIC.webp.every((b, i) => bytes[8 + i] === b)
  );
}

async function sha256Hex8(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 8);
}

/**
 * multipart 字段：entry/entryThumb/floor1/floor2/full（WebP，任意子集）
 * + source（可选原图留档）+ mapId（source 命名用）。
 * 返回 { images: {kind: url}, sourceKey? }，URL 前缀取 IMG_BASE_URL（默认 /r2 同 Worker 出图）。
 */
async function postImages(request: Request, env: Env): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, 'bad_form', '需要 multipart/form-data');
  }
  const base = (env.IMG_BASE_URL ?? '/r2').replace(/\/$/, '');
  const images: Partial<Record<ImgKind, string>> = {};

  for (const kind of IMG_KINDS) {
    const file = form.get(kind);
    if (!(file instanceof File)) continue;
    const buf = await file.arrayBuffer();
    if (!isWebp(new Uint8Array(buf, 0, 12))) return jsonError(400, 'not_webp', `${kind} 不是 WebP`);
    const key = `maps/${KIND_DIR[kind]}/${await sha256Hex8(buf)}.webp`;
    await env.MEDIA!.put(key, buf, {
      httpMetadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' },
    });
    images[kind] = `${base}/${key}`;
  }
  if (Object.keys(images).length === 0) return jsonError(400, 'no_files', '未收到任何图片字段');

  let sourceKey: string | undefined;
  const source = form.get('source');
  if (source instanceof File) {
    const ext = (source.name.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const mapId = form.get('mapId')?.toString() ?? '0';
    sourceKey = `sources/${mapId}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.${ext}`;
    await env.MEDIA!.put(sourceKey, await source.arrayBuffer(), {
      httpMetadata: { contentType: source.type || 'application/octet-stream' },
    });
  }
  return jsonResponse({ images, ...(sourceKey ? { sourceKey } : {}) });
}

// ---- 备份与恢复 ----

async function writeBackup(env: Env, config: StoredConfig): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await env.MEDIA!.put(`${BACKUP_PREFIX}${stamp}-v${config.version}.json`, JSON.stringify(config), {
    httpMetadata: { contentType: 'application/json' },
  });
  // 只保留最近 BACKUP_KEEP 份
  const list = await env.MEDIA!.list({ prefix: BACKUP_PREFIX, limit: 1000 });
  const keys = list.objects.map((o) => o.key).sort(); // 时间戳前缀，字典序即时间序
  const excess = keys.slice(0, Math.max(0, keys.length - BACKUP_KEEP));
  if (excess.length > 0) await env.MEDIA!.delete(excess);
}

/** 历史版本预览：读某份备份，套用与 /maps.json 相同的公开转换（前台 ?preview= 用） */
async function previewBackup(request: Request, env: Env): Promise<Response> {
  const key = new URL(request.url).searchParams.get('key') ?? '';
  // 只允许读备份目录，防任意 R2 键探测
  if (!key.startsWith(BACKUP_PREFIX)) return jsonError(400, 'bad_key');
  const obj = await env.MEDIA!.get(key);
  if (!obj) return jsonError(404, 'backup_not_found');
  const config = (await obj.json()) as StoredConfig;
  return jsonResponse(toPublicConfig(config), 200, { 'Cache-Control': 'no-store' });
}

async function listBackups(env: Env): Promise<Response> {
  const list = await env.MEDIA!.list({ prefix: BACKUP_PREFIX, limit: 1000 });
  const backups = list.objects
    .map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded }))
    .sort((a, b) => (a.key < b.key ? 1 : -1));
  return jsonResponse({ backups });
}

async function restoreBackup(request: Request, env: Env): Promise<Response> {
  let body: { key?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'bad_json');
  }
  if (!body.key?.startsWith(BACKUP_PREFIX)) return jsonError(400, 'bad_key');

  const obj = await env.MEDIA!.get(body.key);
  if (!obj) return jsonError(404, 'backup_not_found');
  const backup = (await obj.json()) as StoredConfig;
  const invalid = validateMaps(backup.maps);
  if (invalid) return jsonError(400, 'invalid_backup', invalid);

  const current = await env.CONFIG!.get<StoredConfig>(CONFIG_KEY, 'json');
  if (current) await writeBackup(env, current); // 恢复前先把当前留档，恢复操作本身也可撤销

  const next: StoredConfig = {
    version: (current?.version ?? 0) + 1, // 版本号保持单调递增，ETag 不会回退
    updatedAt: backup.updatedAt,
    maps: backup.maps,
  };
  await env.CONFIG!.put(CONFIG_KEY, JSON.stringify(next));
  return jsonResponse({ version: next.version, restoredFrom: body.key });
}

// ---- R2 同源出图（img 子域绑定前的过渡路径；绑定后仍保留，仅 IMG_BASE_URL 切换） ----

export async function handleR2(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return jsonError(405, 'method_not_allowed');
  if (!env.MEDIA) return jsonError(503, 'storage_not_configured');
  const key = decodeURIComponent(new URL(request.url).pathname.replace(/^\/r2\//, ''));
  // 只允许读图片目录，backups/ 等不对外
  if (!key.startsWith('maps/')) return jsonError(404, 'not_found');
  const obj = await env.MEDIA.get(key);
  if (!obj) return jsonError(404, 'not_found');
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'image/webp',
      'Cache-Control': obj.httpMetadata?.cacheControl ?? 'public, max-age=31536000, immutable',
      ETag: obj.httpEtag,
    },
  });
}
