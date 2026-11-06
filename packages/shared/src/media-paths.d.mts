export const IMAGE_KINDS: Readonly<Record<'full' | 'floor' | 'entrance' | 'entranceThumb', string>>;
export const CONTENT_ASSET_PATTERN: RegExp;
export const CONTENT_IMAGE_URL_PATTERN: RegExp;
export function isContentAssetKey(key: unknown): key is string;
export function isContentAssetForRole(key: unknown, role: 'full' | 'floor' | 'entrance' | 'thumb'): key is string;
export function isContentImageUrl(value: string): boolean;
