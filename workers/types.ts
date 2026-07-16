// Worker 侧共享类型与常量（数据模型见 docs/ADMIN-BACKEND.md §3）

export interface Env {
  ASSETS: Fetcher;
  /** Phase 2.0 资源开通后绑定；未绑定时读路径自动回退静态快照 */
  CONFIG?: KVNamespace;
  /** 图片/原图/备份对象存储 */
  MEDIA?: R2Bucket;

  // ---- vars（wrangler.jsonc / dashboard 配置）----
  /** 图片对外 URL 前缀：img 子域绑定前为 "/r2"（同 Worker 出图），绑定后改为 https://img.<domain> */
  IMG_BASE_URL?: string;
  /** Cloudflare Access 团队域，如 https://xxx.cloudflareaccess.com；与 AUD 同时配置后鉴权生效 */
  ACCESS_TEAM_DOMAIN?: string;
  /** Access 应用的 Audience 标签 */
  ACCESS_AUD?: string;
  /** 仅 env.dev 使用：跳过鉴权做本地开发 */
  DEV_DISABLE_AUTH?: string;

  // ---- secrets（wrangler secret put，Cron 快照回写用；未配置则跳过）----
  GITHUB_TOKEN?: string;
  /** owner/repo，如 heytl/idv-cryptic-map */
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
}

export type Direction = '左' | '右' | '南' | '北';
export const DIRECTIONS: readonly Direction[] = ['左', '右', '南', '北'];

export type ImgKind = 'entry' | 'entryThumb' | 'floor1' | 'floor2' | 'full';
export const IMG_KINDS: readonly ImgKind[] = ['entry', 'entryThumb', 'floor1', 'floor2', 'full'];

/** ImgKind → R2 键名目录段（entryThumb 目录沿用 entry-thumb 命名习惯） */
export const KIND_DIR: Record<ImgKind, string> = {
  entry: 'entry',
  entryThumb: 'entry-thumb',
  floor1: 'floor1',
  floor2: 'floor2',
  full: 'full',
};

export interface StoredMap {
  id: number;
  sort?: number;
  direction: Direction;
  name: string;
  displayName: string;
  remarks: string;
  published?: boolean;
  deletedAt?: string | null;
  sourceKey?: string;
  images?: Partial<Record<ImgKind, string>>;
}

export interface StoredConfig {
  version: number;
  updatedAt: string;
  maps: StoredMap[];
}

export const CONFIG_KEY = 'config:current';
export const BACKUP_PREFIX = 'backups/';
export const BACKUP_KEEP = 50;

export function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export function jsonError(status: number, error: string, detail?: string): Response {
  return jsonResponse({ error, ...(detail ? { detail } : {}) }, status);
}

/** 校验整份配置的 maps 数组，返回错误信息（null = 合法）。宁可拒绝保存也不写入坏数据。 */
export function validateMaps(maps: unknown): string | null {
  if (!Array.isArray(maps) || maps.length === 0) return 'maps 必须是非空数组';
  const ids = new Set<number>();
  for (const m of maps as StoredMap[]) {
    if (typeof m.id !== 'number' || ids.has(m.id)) return `id 缺失或重复: ${JSON.stringify(m.id)}`;
    ids.add(m.id);
    if (!DIRECTIONS.includes(m.direction)) return `direction 不合法: ${m.name ?? m.id}`;
    if (typeof m.name !== 'string' || !m.name) return `name 缺失: id=${m.id}`;
    if (typeof m.displayName !== 'string' || !m.displayName) return `displayName 缺失: ${m.name}`;
    if (m.images) {
      for (const kind of ['entry', 'floor1', 'floor2', 'full'] as const) {
        const u = m.images[kind];
        if (typeof u !== 'string' || !u) return `图片 URL 不完整: ${m.name}.${kind}`;
      }
    } else if (m.published !== false && !m.deletedAt) {
      // KV 时代已发布地图必须自带完整图片 URL，否则前台校验失败会整份回退快照
      return `已发布地图缺少 images: ${m.name}（请先上传图片或改为草稿）`;
    }
  }
  return null;
}
