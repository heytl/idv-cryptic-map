import type { AssetRef, MapConfigV3 } from "@idv-map/shared";
import { ApiError } from "./http";
export const API_BASE = (import.meta.env.VITE_MAP_API_BASE_URL || "").replace(
  /\/$/,
  "",
);
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    let detail: string | undefined;
    let code = `http_${res.status}`;
    try {
      const b = await res.json();
      code = b.error || code;
      detail = b.detail;
    } catch {}
    throw new ApiError(res.status, code, detail);
  }
  return res.json() as Promise<T>;
}
export function fetchConfigV2(): Promise<MapConfigV3> {
  return request("/api/admin/v3/maps");
}
export function saveConfigV2(
  baseVersion: number,
  config: MapConfigV3,
): Promise<MapConfigV3> {
  return request("/api/admin/v3/maps", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseVersion, config }),
  });
}
export type UploadKindV2 =
  | "full"
  | "basement"
  | "floor1"
  | "floor2"
  | "entrance"
  | "entranceThumb";
export function uploadImageV2(
  kind: UploadKindV2,
  file: Blob,
): Promise<{ asset: AssetRef; url: string }> {
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", file, `${kind}.webp`);
  return request("/api/admin/v3/images", { method: "POST", body: form });
}
