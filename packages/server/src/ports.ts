import type {
  MapConfigV4,
  StatsQuery,
  StatsReport,
  VisitEvent,
} from "../../shared/src/index";

export interface ContentRepository {
  read(): Promise<MapConfigV4>;
  /** KV implementation uses a best-effort version check, not an atomic CAS. */
  save(config: MapConfigV4, expectedVersion: number): Promise<void>;
  backup(config: MapConfigV4): Promise<void>;
  backups(): Promise<{ key: string; uploaded: string }[]>;
  readBackup(key: string): Promise<MapConfigV4 | null>;
}
export interface StoredAsset {
  bytes: ArrayBuffer;
  contentType: string;
}
export interface AssetStorage {
  get(key: string): Promise<StoredAsset | null>;
  exists(key: string): Promise<boolean>;
  put(key: string, bytes: ArrayBuffer, contentType: string): Promise<void>;
  url(key: string): string;
}
export interface StatisticsRepository {
  record(event: VisitEvent): Promise<void>;
  report(query: StatsQuery): Promise<StatsReport>;
  export(query: StatsQuery): Promise<VisitEvent[]>;
  prune(before: string): Promise<void>;
}
export interface AdminIdentity {
  id: string;
}
export interface AdminAuth {
  authenticate(request: Request): Promise<AdminIdentity | null>;
}
