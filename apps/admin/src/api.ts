import type { BackupItem, ImgKind, StoredConfig, StoredMap } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    detail?: string,
  ) {
    super(detail ?? code);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    let code = `http_${res.status}`;
    let detail: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; detail?: string };
      code = body.error ?? code;
      detail = body.detail;
    } catch {
      /* 非 JSON 错误体（如 Access 登录页）按状态码处理 */
    }
    throw new ApiError(res.status, code, detail);
  }
  return res.json() as Promise<T>;
}

export function fetchConfig(): Promise<StoredConfig> {
  return request<StoredConfig>('/api/maps');
}

export function saveConfig(baseVersion: number, maps: StoredMap[]): Promise<{ version: number; updatedAt: string }> {
  return request('/api/maps', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseVersion, maps }),
  });
}

export function uploadImages(
  blobs: Partial<Record<ImgKind, Blob>>,
  opts: { source?: File; mapId?: number } = {},
): Promise<{ images: Partial<Record<ImgKind, string>>; sourceKey?: string }> {
  const form = new FormData();
  for (const [kind, blob] of Object.entries(blobs)) {
    if (blob) form.append(kind, blob, `${kind}.webp`);
  }
  if (opts.source) form.append('source', opts.source, opts.source.name);
  if (opts.mapId != null) form.append('mapId', String(opts.mapId));
  return request('/api/images', { method: 'POST', body: form });
}

export function fetchBackups(): Promise<{ backups: BackupItem[] }> {
  return request('/api/backups');
}

export function restoreBackup(key: string): Promise<{ version: number }> {
  return request('/api/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
}
