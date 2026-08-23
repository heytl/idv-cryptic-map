import type { AssetRef, MapConfigV2, MapItemV2 } from '@idv-map/shared';
import { ApiError } from './api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    let code = `http_${response.status}`;
    let detail: string | undefined;
    try {
      const body = (await response.json()) as { error?: string; detail?: string };
      code = body.error ?? code;
      detail = body.detail;
    } catch {
      // Cloudflare Access 等非 JSON 错误页只保留状态码。
    }
    throw new ApiError(response.status, code, detail);
  }
  return response.json() as Promise<T>;
}

export function fetchConfigV2(): Promise<MapConfigV2> {
  return request('/api/admin/v2/maps');
}

export function saveConfigV2(
  baseVersion: number,
  maps: MapItemV2[],
): Promise<{ version: number; updatedAt: string }> {
  return request('/api/admin/v2/maps', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseVersion, maps }),
  });
}

export type UploadKindV2 = 'full' | 'basement' | 'floor1' | 'floor2' | 'entrance' | 'entranceThumb';

export function uploadImageV2(
  kind: UploadKindV2,
  file: Blob,
): Promise<{ asset: AssetRef; url: string }> {
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', file, `${kind}.webp`);
  return request('/api/admin/v2/images', { method: 'POST', body: form });
}
