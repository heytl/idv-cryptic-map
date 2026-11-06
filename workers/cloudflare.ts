import {
  normalizeMapConfigV4,
  beijingDay,
  dayOffset,
  type MapConfigV2,
  type MapConfigV4,
  type StatsQuery,
  type StatsReport,
  type StatRow,
  type VisitEvent,
} from "../packages/shared/src/index";
import { checkedConfig, ServiceError } from "../packages/server/src/content";
import type {
  AdminAuth,
  AssetStorage,
  ContentRepository,
  StatisticsRepository,
} from "../packages/server/src/ports";
import { requireAuth } from "./auth";
import type { Env } from "./types";

export const CONFIG_V3_KEY = "config:v3:current";
export const BACKUP_V3_PREFIX = "backups-v3/";
export const CONFIG_V4_KEY = 'config:v4:current';
export const BACKUP_V4_PREFIX = 'backups-v4/';
export class CloudflareContent implements ContentRepository {
  constructor(private env: Env) {}
  async read(): Promise<MapConfigV4> {
    if (!this.env.CONFIG) throw new ServiceError(503, "content_not_configured");
    const current = await this.env.CONFIG.get<MapConfigV4>(
      CONFIG_V4_KEY,
      "json",
    );
    if (current) return checkedConfig(current);
    const legacy = await this.env.CONFIG.get<unknown>(CONFIG_V3_KEY, 'json');
    if (legacy) return checkedConfig(legacy);
    // Read-only bridge. Only an explicit save persists the migrated document.
    const v2 = await this.env.CONFIG.get<MapConfigV2>(
      "config:v2:current",
      "json",
    );
    if (!v2)
      return normalizeMapConfigV4({ schemaVersion: 3, version: 0, updatedAt: '', gameMaps: [], layouts: [] });
    return normalizeMapConfigV4(v2);
  }
  async save(config: MapConfigV4, expectedVersion: number): Promise<void> {
    if ((await this.read()).version !== expectedVersion)
      throw new ServiceError(409, "version_conflict");
    // KV is eventually consistent; this check is not a multi-writer lock.
    await this.env.CONFIG!.put(CONFIG_V4_KEY, JSON.stringify(config));
  }
  async backup(config: MapConfigV4): Promise<void> {
    if (!this.env.MEDIA) throw new ServiceError(503, "media_not_configured");
    if (!(await this.env.CONFIG?.get(CONFIG_V4_KEY))) {
      const baseline = await this.env.CONFIG?.get(CONFIG_V3_KEY) ?? await this.env.CONFIG?.get('config:v2:current');
      if (
        baseline &&
        !(await this.env.MEDIA.head('backups-v4/v3-baseline.json'))
      )
        await this.env.MEDIA.put('backups-v4/v3-baseline.json', baseline, {
          httpMetadata: { contentType: "application/json" },
        });
    }
    const key = `${BACKUP_V4_PREFIX}snapshot-v${config.version}.json`;
    if (!(await this.env.MEDIA.head(key)))
      await this.env.MEDIA.put(key, JSON.stringify(config), {
        httpMetadata: { contentType: "application/json" },
      });
    // No automatic pruning: retained backup assets must remain restorable.
  }
  async backups() {
    if (!this.env.MEDIA) throw new ServiceError(503, "media_not_configured");
    const items: { key: string; uploaded: string }[] = [];
    for (const prefix of [BACKUP_V3_PREFIX, BACKUP_V4_PREFIX]) {
    let cursor: string | undefined;
    do {
      const page = await this.env.MEDIA.list({
        prefix,
        cursor,
      });
      items.push(
        ...page.objects
          .filter((o) => /^backups-v[34]\/(?:snapshot-v\d+|v3-baseline)\.json$/.test(o.key))
          .map((o) => ({ key: o.key, uploaded: o.uploaded.toISOString() })),
      );
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    }
    return items.sort((a, b) => b.uploaded.localeCompare(a.uploaded));
  }
  async readBackup(key: string) {
    if (!/^backups-v[34]\/(?:snapshot-v\d+|v3-baseline)\.json$/.test(key))
      throw new ServiceError(400, "invalid_backup_key");
    const obj = await this.env.MEDIA?.get(key);
    return obj ? checkedConfig(await obj.json()) : null;
  }
}
export class CloudflareAssets implements AssetStorage {
  constructor(
    private env: Env,
    private origin: string,
  ) {}
  async get(key: string) {
    const o = await this.env.MEDIA?.get(key);
    return o
      ? {
          bytes: await o.arrayBuffer(),
          contentType: o.httpMetadata?.contentType ?? "image/webp",
        }
      : null;
  }
  async exists(key: string) {
    return !!(await this.env.MEDIA?.head(key));
  }
  async put(key: string, bytes: ArrayBuffer, contentType: string) {
    if (!this.env.MEDIA) throw new ServiceError(503, "media_not_configured");
    await this.env.MEDIA.put(key, bytes, {
      httpMetadata: {
        contentType,
        cacheControl: "public, max-age=31536000, immutable",
      },
    });
  }
  url(key: string) {
    if (this.env.RELATIVE_MEDIA_URLS === '1') return `/r2/${key}`;
    return new URL(
      `${(this.env.IMG_BASE_URL || "/r2").replace(/\/$/, "")}/${key}`,
      this.origin,
    ).href;
  }
}
export class CloudflareAuth implements AdminAuth {
  constructor(private env: Env) {}
  async authenticate(request: Request) {
    return (await requireAuth(request, this.env))
      ? null
      : { id: "access-admin" };
  }
}
export class D1Statistics implements StatisticsRepository {
  constructor(private db: D1Database) {}
  async record(e: VisitEvent) {
    await this.db.batch([
      this.db
        .prepare(
          "INSERT OR IGNORE INTO visits (event_id,layout_id,entrance_id,entrance_type,game_map_id,mode,received_at,day,client) VALUES (?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          e.eventId,
          e.layoutId,
          e.entranceId,
          e.entranceType,
          e.gameMapId,
          e.mode,
          e.receivedAt,
          beijingDay(new Date(e.receivedAt)),
          e.client ?? "web",
        ),
      this.db
        .prepare(
          "INSERT OR IGNORE INTO stats_meta (key,value) VALUES ('started_at',?)",
        )
        .bind(e.receivedAt),
    ]);
  }
  private where(q: StatsQuery) {
    const clauses = ["day >= ?", "day <= ?"];
    const args: string[] = [q.from, q.to];
    if (q.gameMapId) {
      clauses.push("game_map_id = ?");
      args.push(q.gameMapId);
    }
    if (q.mode) {
      clauses.push("mode = ?");
      args.push(q.mode);
    }
    return { sql: clauses.join(" AND "), args };
  }
  async report(q: StatsQuery): Promise<StatsReport> {
    const { sql, args } = this.where(q);
    const columns = [
      "day",
      "game_map_id",
      "layout_id",
      "mode",
      "entrance_type",
    ] as const;
    // One transactional batch keeps totals and all distributions consistent.
    const results = await this.db.batch<{
      count?: number;
      key?: string;
      value?: string;
    }>([
      this.db
        .prepare(`SELECT COUNT(*) AS count FROM visits WHERE ${sql}`)
        .bind(...args),
      ...columns.map((c) =>
        this.db
          .prepare(
            `SELECT CAST(${c} AS TEXT) AS key, COUNT(*) AS count FROM visits WHERE ${sql} GROUP BY ${c} ORDER BY count DESC, key`,
          )
          .bind(...args),
      ),
      this.db.prepare("SELECT value FROM stats_meta WHERE key='started_at'"),
      this.db.prepare(`SELECT client AS key, COUNT(*) AS count FROM visits WHERE ${sql} GROUP BY client ORDER BY count DESC, key`).bind(...args),
    ]);
    const total = Number(results[0]!.results[0]?.count ?? 0);
    const rows = (i: number): StatRow[] =>
      results[i]!.results.map((r) => ({
        key: String(r.key),
        count: Number(r.count),
        share: total ? Number(r.count) / total : 0,
      }));
    const dailyMap = new Map(rows(1).map((r) => [r.key, r]));
    const daily: StatRow[] = [];
    for (let day = q.from; day <= q.to; day = dayOffset(day, 1))
      daily.push(dailyMap.get(day) ?? { key: day, count: 0, share: 0 });
    return {
      query: q,
      total,
      startedAt: (results[6]!.results[0]?.value as string) ?? null,
      daily,
      gameMaps: rows(2),
      layouts: rows(3),
      modes: rows(4),
      entrances: rows(5),
      clients: rows(7),
    };
  }
  async export(q: StatsQuery): Promise<VisitEvent[]> {
    const { sql, args } = this.where(q);
    const result = await this.db
      .prepare(
        `SELECT event_id AS eventId, layout_id AS layoutId, entrance_id AS entranceId, entrance_type AS entranceType, game_map_id AS gameMapId, mode, received_at AS receivedAt, client FROM visits WHERE ${sql} ORDER BY received_at,event_id LIMIT 10001`,
      )
      .bind(...args)
      .all<VisitEvent>();
    if (result.results.length > 10000)
      throw new ServiceError(
        413,
        "export_too_large",
        "请缩小日期范围，每次最多导出 10000 条",
      );
    return result.results;
  }
  async prune(before: string) {
    await this.db
      .prepare("DELETE FROM visits WHERE received_at < ?")
      .bind(before)
      .run();
  }
}
